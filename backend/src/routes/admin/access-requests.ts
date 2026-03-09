import { Router, Request, Response } from "express";
import { z } from "zod";
import { supabaseAdmin } from "../../config/supabase";
import { env } from "../../config/env";
import { AuthVerificationService } from "../../services/verification";
import { AuditService } from "../../services/audit";

const router = Router();

const ACCESS_REQUEST_STATUS_VALUES = [
  "pending",
  "reviewed",
  "approved",
  "rejected",
  "converted",
] as const;

type AccessRequestStatus = typeof ACCESS_REQUEST_STATUS_VALUES[number];
const ACCESS_REQUEST_STATUSES: AccessRequestStatus[] = [...ACCESS_REQUEST_STATUS_VALUES];

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

router.get("/", async (req: Request, res: Response) => {
  try {
    let query = supabaseAdmin
      .from("access_requests")
      .select("id, full_name, phone, email, company_name, status, admin_notes, processed_at, processed_by, converted_user_id, created_at, updated_at")
      .order("created_at", { ascending: false });

    const status = String(req.query.status || "").trim().toLowerCase();
    if (status && status !== "all" && ACCESS_REQUEST_STATUSES.includes(status as AccessRequestStatus)) {
      query = query.eq("status", status);
    }

    const search = String(req.query.q || "").trim();
    if (search) {
      const escaped = search.replace(/[%_]/g, "\\$&");
      query = query.or(
        `full_name.ilike.%${escaped}%,email.ilike.%${escaped}%,company_name.ilike.%${escaped}%,phone.ilike.%${escaped}%`,
      );
    }

    const { data, error } = await query;
    if (error) throw error;

    res.json({ success: true, data: data || [] });

    void AuditService.log({
      userId: req.user!.id,
      action: "access_request.list",
      resource: "access_requests",
      entityId: (req.query.status as string) || "all",
      details: {
        message: `Listagem de solicitações de acesso (Filtro: ${status || "todos"})`,
        filters: req.query
      },
      ipAddress: req.auditInfo?.ip,
      userAgent: req.auditInfo?.userAgent,
    });
  } catch (error) {
    console.error("[Admin] List access requests error:", error);
    res.status(500).json({ success: false, error: "Erro ao listar solicitações" });
  }
});

const updateAccessRequestSchema = z.object({
  status: z.enum(ACCESS_REQUEST_STATUS_VALUES).optional(),
  admin_notes: z.string().max(2000, "Notas muito longas").nullable().optional(),
});

router.put("/:id", async (req: Request, res: Response) => {
  try {
    const parsed = updateAccessRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        success: false,
        error: "Dados inválidos",
        details: parsed.error.flatten().fieldErrors,
      });
      return;
    }

    if (parsed.data.status === undefined && parsed.data.admin_notes === undefined) {
      res.status(400).json({ success: false, error: "Nenhuma alteração enviada" });
      return;
    }

    const updates: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };

    if (parsed.data.status !== undefined) {
      updates.status = parsed.data.status;
      if (parsed.data.status !== "pending") {
        updates.processed_at = new Date().toISOString();
        updates.processed_by = req.user!.id;
      }
    }
    if (parsed.data.admin_notes !== undefined) updates.admin_notes = parsed.data.admin_notes;

    const { data, error } = await supabaseAdmin
      .from("access_requests")
      .update(updates)
      .eq("id", req.params.id)
      .select("id, full_name, phone, email, company_name, status, admin_notes, processed_at, processed_by, converted_user_id, created_at, updated_at")
      .single();

    if (error || !data) {
      res.status(404).json({ success: false, error: "Solicitação não encontrada" });
      return;
    }

    res.json({ success: true, data });
  } catch (error) {
    console.error("[Admin] Update access request error:", error);
    res.status(500).json({ success: false, error: "Erro ao atualizar solicitação" });
  }
});

const convertAccessRequestSchema = z.object({
  role: z.enum(["master", "user"]).default("user"),
  tenant_id: z.string().uuid("Empresa inválida").nullable(),
  admin_notes: z.string().max(2000, "Notas muito longas").optional(),
});

router.post("/:id/convert", async (req: Request, res: Response) => {
  try {
    const parsed = convertAccessRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      console.error("[Admin] Convert validation error:", parsed.error.flatten().fieldErrors);
      res.status(400).json({
        success: false,
        error: "Dados inválidos",
        details: parsed.error.flatten().fieldErrors,
      });
      return;
    }

    const { data: accessRequest, error: requestError } = await supabaseAdmin
      .from("access_requests")
      .select("id, full_name, email, status")
      .eq("id", req.params.id)
      .single();

    if (requestError || !accessRequest) {
      res.status(404).json({ success: false, error: "Solicitação não encontrada" });
      return;
    }

    if (accessRequest.status === "converted") {
      res.status(400).json({ success: false, error: "Solicitação já convertida" });
      return;
    }

    if (parsed.data.tenant_id) {
      const { data: tenant } = await supabaseAdmin
        .from("tenants")
        .select("id")
        .eq("id", parsed.data.tenant_id)
        .single();

      if (!tenant) {
        res.status(400).json({ success: false, error: "Empresa não encontrada" });
        return;
      }
    }

    const email = normalizeEmail(accessRequest.email);

    const { data: inviteData, error: inviteError } = await supabaseAdmin.auth.admin.generateLink({
      type: 'invite',
      email,
      options: {
        redirectTo: `${env.FRONTEND_URL}/redefinir-senha`,
        data: {
          full_name: accessRequest.full_name,
          role: parsed.data.role,
          tenant_id: parsed.data.tenant_id,
        },
      }
    });

    if (inviteError || !inviteData.user) {
      console.error("[Admin] Generate invite link error:", inviteError);
      const msg = inviteError?.message?.includes("already been registered")
        ? "Email já cadastrado"
        : inviteError?.message || "Erro ao criar usuário";
      res.status(400).json({ success: false, error: msg });
      return;
    }

    try {
      const token = await AuthVerificationService.createToken(inviteData.user.id, email, inviteData.properties.action_link);
      await AuthVerificationService.sendVerificationEmail({
        email,
        fullName: accessRequest.full_name,
        token,
        invitationLink: inviteData.properties.action_link
      });
    } catch (verifError) {
      console.error("[Admin] Verification flow error:", verifError);
    }

    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("id, email, full_name, role, tenant_id, is_active, created_at")
      .eq("id", inviteData.user.id)
      .single();

    await supabaseAdmin
      .from("access_requests")
      .update({
        status: "converted",
        processed_at: new Date().toISOString(),
        processed_by: req.user!.id,
        converted_user_id: inviteData.user.id,
        admin_notes: parsed.data.admin_notes ?? null,
      })
      .eq("id", accessRequest.id);

    res.status(201).json({
      success: true,
      data: profile || {
        id: inviteData.user.id,
        email,
        full_name: accessRequest.full_name,
        role: parsed.data.role,
        tenant_id: parsed.data.tenant_id,
      },
    });
  } catch (error) {
    console.error("[Admin] Convert access request error:", error);
    res.status(500).json({ success: false, error: "Erro ao converter solicitação" });
  }
});

export default router;
