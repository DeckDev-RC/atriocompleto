import { Router, Request, Response } from "express";
import { z } from "zod";
import { supabaseAdmin } from "../../config/supabase";
import { invalidateAuthCache } from "../../middleware/auth";
import { strongPasswordSchema } from "../../utils/password";
import { env } from "../../config/env";
import { AuthVerificationService } from "../../services/verification";
import { AuditService } from "../../services/audit";

const router = Router();

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

router.get("/", async (req: Request, res: Response) => {
  try {
    let query = supabaseAdmin
      .from("profiles")
      .select("id, email, full_name, role, tenant_id, is_active, created_at, permissions, bypass_2fa")
      .order("created_at", { ascending: false });

    const tenantId = req.query.tenant_id as string | undefined;
    if (tenantId) query = query.eq("tenant_id", tenantId);

    const { data, error } = await query;
    if (error) throw error;

    const { data: tenants } = await supabaseAdmin
      .from("tenants")
      .select("id, name");

    const tenantMap: Record<string, string> = {};
    (tenants || []).forEach((tenant) => {
      tenantMap[tenant.id] = tenant.name;
    });

    const users = (data || []).map((user) => ({
      ...user,
      tenant_name: user.tenant_id ? tenantMap[user.tenant_id] || "—" : "—",
    }));

    res.json({ success: true, data: users });

    void AuditService.log({
      userId: req.user!.id,
      action: "user.list",
      resource: "profiles",
      entityId: (tenantId as string) || "all",
      details: {
        message: `Listagem de usuários realizada${tenantId ? ` (Empresa: ${tenantId})` : ""}`,
        filters: req.query
      },
      ipAddress: req.auditInfo?.ip,
      userAgent: req.auditInfo?.userAgent,
    });
  } catch (error) {
    console.error("[Admin] List users error:", error);
    res.status(500).json({ success: false, error: "Erro ao listar usuários" });
  }
});

const createUserSchema = z.object({
  email: z.string().email("Email inválido"),
  full_name: z.string().trim().min(2, "Nome obrigatório"),
  role: z.enum(["master", "user"]).default("user"),
  tenant_id: z.string().uuid("Empresa inválida").nullable(),
  access_request_id: z.string().uuid().nullable().optional(),
  permissions: z.record(z.any()).default({}),
});

router.post("/", async (req: Request, res: Response) => {
  try {
    const parsed = createUserSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        success: false,
        error: "Dados inválidos",
        details: parsed.error.flatten().fieldErrors,
      });
      return;
    }

    const { full_name, role, tenant_id, access_request_id, permissions } = parsed.data;
    const email = normalizeEmail(parsed.data.email);

    if (tenant_id) {
      const { data: tenant } = await supabaseAdmin
        .from("tenants")
        .select("id")
        .eq("id", tenant_id)
        .single();

      if (!tenant) {
        res.status(400).json({ success: false, error: "Empresa não encontrada" });
        return;
      }
    }

    const { data: inviteData, error: inviteError } = await supabaseAdmin.auth.admin.generateLink({
      type: 'invite',
      email,
      options: {
        redirectTo: `${env.FRONTEND_URL}/redefinir-senha`,
        data: {
          full_name,
          role,
          tenant_id,
          permissions,
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
        fullName: full_name,
        token,
        invitationLink: inviteData.properties.action_link
      });
    } catch (error) {
      console.error("[Admin] Verification flow error:", error);
    }

    if (access_request_id) {
      await supabaseAdmin
        .from("access_requests")
        .update({
          status: "converted",
          processed_at: new Date().toISOString(),
          processed_by: req.user!.id,
          converted_user_id: inviteData.user.id,
        })
        .eq("id", access_request_id);
    }

    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("id, email, full_name, role, tenant_id, is_active, created_at, permissions")
      .eq("id", inviteData.user.id)
      .single();

    res.status(201).json({ success: true, data: profile || { id: inviteData.user.id, email, full_name, role, tenant_id } });

    void AuditService.log({
      userId: req.user!.id,
      action: "user.create",
      resource: "users",
      entityId: inviteData.user.id,
      ipAddress: req.auditInfo?.ip,
      userAgent: req.auditInfo?.userAgent,
      details: { next: profile || { id: inviteData.user.id, email, full_name, role, tenant_id } },
      tenantId: tenant_id || undefined,
    });
  } catch (error) {
    console.error("[Admin] Create user error:", error);
    res.status(500).json({ success: false, error: "Erro ao criar usuário" });
  }
});

const updateUserSchema = z.object({
  full_name: z.string().min(2).optional(),
  role: z.enum(["master", "user"]).optional(),
  tenant_id: z.string().uuid().nullable().optional(),
  is_active: z.boolean().optional(),
  permissions: z.record(z.any()).optional(),
  bypass_2fa: z.boolean().optional(),
});

router.put("/:id", async (req: Request, res: Response) => {
  try {
    const parsed = updateUserSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ success: false, error: "Dados inválidos" });
      return;
    }

    const updates: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };
    if (parsed.data.full_name !== undefined) updates.full_name = parsed.data.full_name;
    if (parsed.data.role !== undefined) updates.role = parsed.data.role;
    if (parsed.data.tenant_id !== undefined) updates.tenant_id = parsed.data.tenant_id;
    if (parsed.data.is_active !== undefined) updates.is_active = parsed.data.is_active;
    if (parsed.data.permissions !== undefined) updates.permissions = parsed.data.permissions;
    if (parsed.data.bypass_2fa !== undefined) updates.bypass_2fa = parsed.data.bypass_2fa;

    if (req.params.id === req.user!.id) {
      if (parsed.data.role !== undefined && parsed.data.role !== "master") {
        res.status(400).json({ success: false, error: "Você não pode remover seu próprio acesso de administrador" });
        return;
      }
      if (parsed.data.is_active === false) {
        res.status(400).json({ success: false, error: "Você não pode desativar sua própria conta" });
        return;
      }
    }

    const { data: previousUser } = await supabaseAdmin.from("profiles").select("*").eq("id", req.params.id).single();

    const { data, error } = await supabaseAdmin
      .from("profiles")
      .update(updates)
      .eq("id", req.params.id)
      .select()
      .single();

    if (error || !data) {
      res.status(404).json({ success: false, error: "Usuário não encontrado" });
      return;
    }

    await supabaseAdmin.auth.admin.updateUserById(String(req.params.id), {
      user_metadata: {
        full_name: parsed.data.full_name,
        role: parsed.data.role,
        tenant_id: parsed.data.tenant_id,
        permissions: parsed.data.permissions,
      },
    });

    await invalidateAuthCache(String(req.params.id));

    res.json({ success: true, data });

    void AuditService.log({
      userId: req.user!.id,
      action: "user.update",
      resource: "users",
      entityId: String(req.params.id),
      ipAddress: req.auditInfo?.ip,
      userAgent: req.auditInfo?.userAgent,
      details: AuditService.getDiff(previousUser, data),
      tenantId: data.tenant_id || undefined,
    });
  } catch (error) {
    console.error("[Admin] Update user error:", error);
    res.status(500).json({ success: false, error: "Erro ao atualizar usuário" });
  }
});

router.delete("/:id", async (req: Request, res: Response) => {
  try {
    const userId = String(req.params.id);
    if (userId === req.user!.id) {
      res.status(400).json({ success: false, error: "Você não pode excluir sua própria conta" });
      return;
    }

    const { error } = await supabaseAdmin.auth.admin.deleteUser(userId);
    if (error) {
      res.status(400).json({ success: false, error: error.message });
      return;
    }

    await invalidateAuthCache(userId);

    res.json({ success: true });

    void AuditService.log({
      userId: req.user!.id,
      action: "user.delete",
      resource: "users",
      entityId: userId,
      ipAddress: req.auditInfo?.ip,
      userAgent: req.auditInfo?.userAgent,
    });
  } catch (error) {
    console.error("[Admin] Delete user error:", error);
    res.status(500).json({ success: false, error: "Erro ao excluir usuário" });
  }
});

const adminResetPasswordSchema = z.object({
  password: strongPasswordSchema,
  confirm_password: z.string().min(1, "Confirmação obrigatória"),
}).refine((data) => data.password === data.confirm_password, {
  message: "As senhas não coincidem",
  path: ["confirm_password"],
});

router.post("/:id/reset-password", async (req: Request, res: Response) => {
  try {
    const parsed = adminResetPasswordSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        success: false,
        error: "Senha inválida",
        details: parsed.error.flatten().fieldErrors,
      });
      return;
    }

    const { error } = await supabaseAdmin.auth.admin.updateUserById(String(req.params.id), {
      password: parsed.data.password,
    });

    if (error) {
      res.status(400).json({ success: false, error: error.message });
      return;
    }

    await invalidateAuthCache(String(req.params.id));

    res.json({ success: true });

    void AuditService.log({
      userId: req.user!.id,
      action: "user.reset_password_admin",
      resource: "users",
      entityId: String(req.params.id),
      ipAddress: req.auditInfo?.ip,
      userAgent: req.auditInfo?.userAgent,
    });
  } catch (error) {
    console.error("[Admin] Reset password error:", error);
    res.status(500).json({ success: false, error: "Erro ao resetar senha" });
  }
});

export default router;
