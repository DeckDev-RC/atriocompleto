import { Router, Request, Response } from "express";
import { z } from "zod";
import { supabase, supabaseAdmin } from "../config/supabase";
import { requireAuth, requireMaster, invalidateAuthCache } from "../middleware/auth";
import { strongPasswordSchema } from "../utils/password";
import { env } from "../config/env";
import { AuthVerificationService } from "../services/verification";
import { AuditService } from "../services/audit";
import { notifyPermissionsChanged, notifyAllPermissionsChanged } from "../services/sse";
import fs from "fs";

import path from "path";

const router = Router();

router.use(requireAuth, requireMaster);

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

// ================================================================
// TENANTS
// ================================================================

const tenantSchema = z.object({
  name: z.string().trim().min(2, "Nome mínimo 2 caracteres").max(100, "Nome muito longo"),
});

router.get("/tenants", async (req: Request, res: Response) => {
  try {
    const { data, error } = await supabaseAdmin
      .from("tenants")
      .select("id, name, created_at")
      .order("name");

    if (error) throw error;

    const { data: profiles } = await supabaseAdmin
      .from("profiles")
      .select("tenant_id");

    const userCounts: Record<string, number> = {};
    (profiles || []).forEach((profile) => {
      if (profile.tenant_id) {
        userCounts[profile.tenant_id] = (userCounts[profile.tenant_id] || 0) + 1;
      }
    });

    const tenants = (data || []).map((tenant) => ({
      ...tenant,
      user_count: userCounts[tenant.id] || 0,
    }));

    res.json({ success: true, data: tenants });

    // Audit log
    void AuditService.log({
      userId: req.user!.id,
      action: "tenant.list",
      resource: "tenants",
      entityId: "SYSTEM_GLOBAL",
      details: { message: "Listagem de empresas realizada" },
      ipAddress: req.auditInfo?.ip,
      userAgent: req.auditInfo?.userAgent,
    });
  } catch (error) {
    console.error("[Admin] List tenants error:", error);
    res.status(500).json({ success: false, error: "Erro ao listar empresas" });
  }
});

router.post("/tenants", async (req: Request, res: Response) => {
  try {
    const parsed = tenantSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        success: false,
        error: "Dados inválidos",
        details: parsed.error.flatten().fieldErrors,
      });
      return;
    }

    const { data, error } = await supabaseAdmin
      .from("tenants")
      .insert({ name: parsed.data.name })
      .select()
      .single();

    if (error) {
      res.status(400).json({ success: false, error: error.message });
      return;
    }

    res.status(201).json({ success: true, data });

    // Audit log
    void AuditService.log({
      userId: req.user!.id,
      action: "tenant.create",
      resource: "tenants",
      entityId: data.id,
      ipAddress: req.auditInfo?.ip,
      userAgent: req.auditInfo?.userAgent,
      details: { next: data },
    });
  } catch (error) {
    console.error("[Admin] Create tenant error:", error);
    res.status(500).json({ success: false, error: "Erro ao criar empresa" });
  }
});

router.put("/tenants/:id", async (req: Request, res: Response) => {
  try {
    const parsed = tenantSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        success: false,
        error: "Dados inválidos",
        details: parsed.error.flatten().fieldErrors,
      });
      return;
    }

    const { data: previousTenant } = await supabaseAdmin.from("tenants").select("*").eq("id", req.params.id).single();

    const { data, error } = await supabaseAdmin
      .from("tenants")
      .update({ name: parsed.data.name })
      .eq("id", req.params.id)
      .select()
      .single();

    if (error || !data) {
      res.status(404).json({ success: false, error: "Empresa não encontrada" });
      return;
    }

    res.json({ success: true, data });

    // Audit log with diff
    void AuditService.log({
      userId: req.user!.id,
      action: "tenant.update",
      resource: "tenants",
      entityId: data.id,
      ipAddress: req.auditInfo?.ip,
      userAgent: req.auditInfo?.userAgent,
      details: AuditService.getDiff(previousTenant, data),
    });
  } catch (error) {
    console.error("[Admin] Update tenant error:", error);
    res.status(500).json({ success: false, error: "Erro ao atualizar empresa" });
  }
});

router.delete("/tenants/:id", async (req: Request, res: Response) => {
  try {
    const { data: users } = await supabaseAdmin
      .from("profiles")
      .select("id")
      .eq("tenant_id", req.params.id)
      .limit(1);

    if (users && users.length > 0) {
      res.status(400).json({ success: false, error: "Remova os usuários da empresa antes de excluí-la" });
      return;
    }

    const { error } = await supabaseAdmin
      .from("tenants")
      .delete()
      .eq("id", req.params.id);

    if (error) {
      res.status(400).json({ success: false, error: error.message });
      return;
    }

    res.json({ success: true });

    // Audit log
    void AuditService.log({
      userId: req.user!.id,
      action: "tenant.delete",
      resource: "tenants",
      entityId: String(req.params.id),
      ipAddress: req.auditInfo?.ip,
      userAgent: req.auditInfo?.userAgent,
    });
  } catch (error) {
    console.error("[Admin] Delete tenant error:", error);
    res.status(500).json({ success: false, error: "Erro ao excluir empresa" });
  }
});

// ================================================================
// ACCESS REQUESTS
// ================================================================

router.get("/access-requests", async (req: Request, res: Response) => {
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

    // Audit log
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

router.put("/access-requests/:id", async (req: Request, res: Response) => {
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

router.post("/access-requests/:id/convert", async (req: Request, res: Response) => {
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

    // Gera o link de convite mas NÃO envia e-mail automático do Supabase
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

    // Gerar token interno e enviar e-mail UNIFICADO
    try {
      const token = await AuthVerificationService.createToken(inviteData.user.id, email, inviteData.properties.action_link);
      await AuthVerificationService.sendVerificationEmail({
        email,
        fullName: accessRequest.full_name,
        token,
        invitationLink: inviteData.properties.action_link // Guardamos se quisermos usar depois
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

// ================================================================
// USERS
// ================================================================

router.get("/users", async (req: Request, res: Response) => {
  try {
    let query = supabaseAdmin
      .from("profiles")
      .select("id, email, full_name, role, tenant_id, is_active, created_at, permissions")
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

    // Audit log
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

router.post("/users", async (req: Request, res: Response) => {
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

    // Gerar token e enviar e-mail unificado
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

    // Audit log
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
});

router.put("/users/:id", async (req: Request, res: Response) => {
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

    // ... Supabase auth update ... (preserving existing code)
    await supabaseAdmin.auth.admin.updateUserById(String(req.params.id), {
      user_metadata: {
        full_name: parsed.data.full_name,
        role: parsed.data.role,
        tenant_id: parsed.data.tenant_id,
        permissions: parsed.data.permissions,
      },
    });

    // Invalida cache de auth para refletir mudanças
    await invalidateAuthCache(String(req.params.id));

    res.json({ success: true, data });

    // Audit log
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

router.delete("/users/:id", async (req: Request, res: Response) => {
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

    // Invalida todas as sessões do usuário excluído
    await invalidateAuthCache(userId);

    res.json({ success: true });

    // Audit log
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

router.post("/users/:id/reset-password", async (req: Request, res: Response) => {
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

    // Invalida sessões como medida de segurança
    await invalidateAuthCache(String(req.params.id));

    res.json({ success: true });

    // Audit log
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

// ================================================================
// RATE LIMIT MANAGEMENT
// ================================================================

router.get("/rate-limit/blocked-ips", async (req: Request, res: Response) => {
  try {
    const { redis } = await import("../config/redis");
    const keys = await redis.keys("ratelimit:blocked:*");

    const blockedIps = await Promise.all(keys.map(async (key) => {
      const ip = key.replace("ratelimit:blocked:", "");
      const ttl = await redis.ttl(key);
      return { ip, ttl };
    }));

    res.json({ success: true, data: blockedIps });
  } catch (error) {
    console.error("[Admin] List blocked IPs error:", error);
    res.status(500).json({ success: false, error: "Erro ao listar IPs bloqueados" });
  }
});

router.post("/rate-limit/unblock-ip", async (req: Request, res: Response) => {
  try {
    const { ip } = req.body;
    if (!ip) {
      res.status(400).json({ success: false, error: "IP obrigatório" });
      return;
    }

    const { redis } = await import("../config/redis");
    await redis.del(`ratelimit:blocked:${ip}`);
    await redis.del(`ratelimit:violations:${ip}`);

    res.json({ success: true, data: { message: `IP ${ip} desbloqueado com sucesso` } });

    // Audit log
    void AuditService.log({
      userId: req.user!.id,
      action: "security.ip_unblocked_manual",
      resource: "firewall",
      entityId: ip,
      ipAddress: req.auditInfo?.ip,
      userAgent: req.auditInfo?.userAgent,
      details: { message: "IP desbloqueado manualmente pelo administrador" },
    });
  } catch (error) {
    console.error("[Admin] Unblock IP error:", error);
    res.status(500).json({ success: false, error: "Erro ao desbloquear IP" });
  }
});

// ================================================================
// RBAC MANAGEMENT
// ================================================================

// --- Helper: Check if removing an Admin role would leave zero admins ---
async function wouldRemoveLastAdmin(roleId: string, profileId?: string): Promise<boolean> {
  // First check if this role is actually the "Admin" role
  const { data: role } = await supabaseAdmin
    .from("roles")
    .select("name")
    .eq("id", roleId)
    .single();

  if (!role || role.name !== "Admin") return false;

  // Count how many users currently have the Admin role
  const { count } = await supabaseAdmin
    .from("user_roles")
    .select("*", { count: "exact", head: true })
    .eq("role_id", roleId);

  // If only 1 admin left (or fewer), removing would leave zero
  return (count ?? 0) <= 1;
}

router.get("/rbac/roles", async (req: Request, res: Response) => {
  try {
    const { data: roles, error: rolesError } = await supabaseAdmin
      .from("roles")
      .select("*, role_permissions(permission_id)");

    if (rolesError) throw rolesError;

    res.json({ success: true, data: roles });
  } catch (error) {
    console.error("[Admin] List roles error:", error);
    res.status(500).json({ success: false, error: "Erro ao listar papéis" });
  }
});

// CREATE a new custom role
const createRoleSchema = z.object({
  name: z.string().trim().min(2, "Nome obrigatório (mín. 2 caracteres)").max(50),
  description: z.string().max(200).nullable().optional(),
});

router.post("/rbac/roles", async (req: Request, res: Response) => {
  try {
    const parsed = createRoleSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ success: false, error: "Dados inválidos", details: parsed.error.flatten().fieldErrors });
      return;
    }

    // Check for duplicate name
    const { data: existing } = await supabaseAdmin
      .from("roles")
      .select("id")
      .ilike("name", parsed.data.name)
      .limit(1);

    if (existing && existing.length > 0) {
      res.status(409).json({ success: false, error: "Já existe um perfil com este nome" });
      return;
    }

    const { data, error } = await supabaseAdmin
      .from("roles")
      .insert({
        name: parsed.data.name,
        description: parsed.data.description || null,
        is_system: false,
      })
      .select()
      .single();

    if (error) throw error;

    res.status(201).json({ success: true, data });

    void AuditService.log({
      userId: req.user!.id,
      action: "rbac.role_created",
      resource: "roles",
      entityId: data.id,
      details: { name: data.name, description: data.description },
      ipAddress: req.auditInfo?.ip,
      userAgent: req.auditInfo?.userAgent,
    });
  } catch (error) {
    console.error("[Admin] Create role error:", error);
    res.status(500).json({ success: false, error: "Erro ao criar perfil" });
  }
});

// CLONE an existing role (copies all permissions)
router.post("/rbac/roles/:roleId/clone", async (req: Request, res: Response) => {
  try {
    const sourceRoleId = req.params.roleId;
    const { name, description } = req.body;

    if (!name || name.trim().length < 2) {
      res.status(400).json({ success: false, error: "Nome obrigatório (mín. 2 caracteres)" });
      return;
    }

    // Check for duplicate name
    const { data: existing } = await supabaseAdmin
      .from("roles")
      .select("id")
      .ilike("name", name.trim())
      .limit(1);

    if (existing && existing.length > 0) {
      res.status(409).json({ success: false, error: "Já existe um perfil com este nome" });
      return;
    }

    // Get source role
    const { data: source, error: sourceError } = await supabaseAdmin
      .from("roles")
      .select("*, role_permissions(permission_id)")
      .eq("id", sourceRoleId)
      .single();

    if (sourceError || !source) {
      res.status(404).json({ success: false, error: "Perfil de origem não encontrado" });
      return;
    }

    // Create the new role
    const { data: newRole, error: createError } = await supabaseAdmin
      .from("roles")
      .insert({
        name: name.trim(),
        description: description || source.description,
        is_system: false,
      })
      .select()
      .single();

    if (createError) throw createError;

    // Copy permissions
    if (source.role_permissions && source.role_permissions.length > 0) {
      const permInserts = source.role_permissions.map((rp: any) => ({
        role_id: newRole.id,
        permission_id: rp.permission_id,
      }));
      await supabaseAdmin.from("role_permissions").insert(permInserts);
    }

    // Fetch the full new role with permissions
    const { data: fullRole } = await supabaseAdmin
      .from("roles")
      .select("*, role_permissions(permission_id)")
      .eq("id", newRole.id)
      .single();

    res.status(201).json({ success: true, data: fullRole });

    void AuditService.log({
      userId: req.user!.id,
      action: "rbac.role_cloned",
      resource: "roles",
      entityId: newRole.id,
      details: { clonedFrom: sourceRoleId, sourceName: source.name, newName: name.trim() },
      ipAddress: req.auditInfo?.ip,
      userAgent: req.auditInfo?.userAgent,
    });
  } catch (error) {
    console.error("[Admin] Clone role error:", error);
    res.status(500).json({ success: false, error: "Erro ao clonar perfil" });
  }
});

// UPDATE a role (name/description only; system roles cannot be renamed)
const updateRoleSchema = z.object({
  name: z.string().trim().min(2).max(50).optional(),
  description: z.string().max(200).nullable().optional(),
});

router.put("/rbac/roles/:roleId", async (req: Request, res: Response) => {
  try {
    const roleId = req.params.roleId as string;
    const parsed = updateRoleSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ success: false, error: "Dados inválidos", details: parsed.error.flatten().fieldErrors });
      return;
    }

    // Get current role
    const { data: currentRole } = await supabaseAdmin
      .from("roles")
      .select("*")
      .eq("id", roleId)
      .single();

    if (!currentRole) {
      res.status(404).json({ success: false, error: "Perfil não encontrado" });
      return;
    }

    // Block renaming system roles
    if (currentRole.is_system && parsed.data.name && parsed.data.name !== currentRole.name) {
      res.status(403).json({ success: false, error: "Perfis de sistema não podem ser renomeados" });
      return;
    }

    // Check duplicate name if changing
    if (parsed.data.name && parsed.data.name !== currentRole.name) {
      const { data: dup } = await supabaseAdmin
        .from("roles")
        .select("id")
        .ilike("name", parsed.data.name)
        .neq("id", roleId)
        .limit(1);

      if (dup && dup.length > 0) {
        res.status(409).json({ success: false, error: "Já existe um perfil com este nome" });
        return;
      }
    }

    const updates: Record<string, unknown> = {};
    if (parsed.data.name !== undefined) updates.name = parsed.data.name;
    if (parsed.data.description !== undefined) updates.description = parsed.data.description;

    const { data, error } = await supabaseAdmin
      .from("roles")
      .update(updates)
      .eq("id", roleId)
      .select()
      .single();

    if (error) throw error;

    res.json({ success: true, data });

    void AuditService.log({
      userId: req.user!.id,
      action: "rbac.role_updated",
      resource: "roles",
      entityId: roleId,
      details: AuditService.getDiff(currentRole, data),
      ipAddress: req.auditInfo?.ip,
      userAgent: req.auditInfo?.userAgent,
    });
  } catch (error) {
    console.error("[Admin] Update role error:", error);
    res.status(500).json({ success: false, error: "Erro ao atualizar perfil" });
  }
});

// DELETE a role (system roles cannot be deleted)
router.delete("/rbac/roles/:roleId", async (req: Request, res: Response) => {
  try {
    const roleId = req.params.roleId as string;

    // Get role info
    const { data: role } = await supabaseAdmin
      .from("roles")
      .select("*")
      .eq("id", roleId)
      .single();

    if (!role) {
      res.status(404).json({ success: false, error: "Perfil não encontrado" });
      return;
    }

    if (role.is_system) {
      res.status(403).json({ success: false, error: "Perfis de sistema não podem ser excluídos" });
      return;
    }

    // Remove all user_roles associations first
    await supabaseAdmin
      .from("user_roles")
      .delete()
      .eq("role_id", roleId);

    // Remove all role_permissions
    await supabaseAdmin
      .from("role_permissions")
      .delete()
      .eq("role_id", roleId);

    // Delete the role
    const { error } = await supabaseAdmin
      .from("roles")
      .delete()
      .eq("id", roleId);

    if (error) throw error;

    res.json({ success: true });

    void AuditService.log({
      userId: req.user!.id,
      action: "rbac.role_deleted",
      resource: "roles",
      entityId: roleId,
      details: { name: role.name, description: role.description },
      ipAddress: req.auditInfo?.ip,
      userAgent: req.auditInfo?.userAgent,
    });
  } catch (error) {
    console.error("[Admin] Delete role error:", error);
    res.status(500).json({ success: false, error: "Erro ao excluir perfil" });
  }
});

router.get("/rbac/permissions", async (req: Request, res: Response) => {
  try {
    const { data, error } = await supabaseAdmin
      .from("permissions")
      .select("*")
      .order("name");

    if (error) throw error;
    res.json({ success: true, data });
  } catch (error) {
    console.error("[Admin] List permissions error:", error);
    res.status(500).json({ success: false, error: "Erro ao listar permissões" });
  }
});

router.post("/rbac/roles/:roleId/permissions", async (req: Request, res: Response) => {
  try {
    const roleId = req.params.roleId as string;
    const { permissionId, active } = req.body;

    if (active) {
      await supabaseAdmin.from("role_permissions").upsert({
        role_id: roleId,
        permission_id: permissionId
      });
    } else {
      await supabaseAdmin
        .from("role_permissions")
        .delete()
        .match({ role_id: roleId, permission_id: permissionId });
    }
    res.json({ success: true });

    // Invalidate auth cache so permission changes take effect immediately
    // Invalidate auth cache so permission changes take effect immediately
    // Note: Since we don't know which users have this role easily here without a query, 
    // and there are few roles/users, a global invalidation is safer but we should ideally target.
    // However, the previous problem was assignment. For toggle, global is okay but assignment should be targeted.
    await invalidateAuthCache();

    // Notify all connected clients (permission affects all users with this role)
    notifyAllPermissionsChanged();

    // Audit log
    void AuditService.log({
      userId: req.user!.id,
      action: "rbac.permission_toggle",
      resource: "roles",
      entityId: roleId,
      details: { permissionId, active, message: `Permissão ${permissionId} ${active ? 'ativada' : 'desativada'} para o papel ${roleId}` },
      ipAddress: req.auditInfo?.ip,
      userAgent: req.auditInfo?.userAgent,
    });
  } catch (error) {
    console.error("[Admin] Toggle permission error:", error);
    res.status(500).json({ success: false, error: "Erro ao alterar permissão" });
  }
});

router.get("/rbac/users-roles", async (req: Request, res: Response) => {
  try {
    const { data, error } = await supabaseAdmin
      .from("profiles")
      .select(`
        id, 
        email, 
        full_name, 
        user_roles(
          role_id,
          roles(name)
        )
      `)
      .order("created_at", { ascending: false });

    if (error) throw error;

    res.json({ success: true, data });
  } catch (error) {
    console.error("[Admin] List user roles error:", error);
    res.status(500).json({ success: false, error: "Erro ao listar papéis dos usuários" });
  }
});

router.post("/rbac/users/:profileId/roles", async (req: Request, res: Response) => {
  try {
    const profileId = req.params.profileId as string;
    const { roleId } = req.body;

    const { error } = await supabaseAdmin.from("user_roles").upsert({
      profile_id: profileId,
      role_id: roleId
    });

    if (error) throw error;
    res.json({ success: true });

    // Invalidate auth cache so permission changes take effect immediately
    // Invalidate auth cache so permission changes take effect immediately
    await invalidateAuthCache(profileId);

    // Notify the affected user in real-time via SSE
    notifyPermissionsChanged(profileId);

    // Audit log
    void AuditService.log({
      userId: req.user!.id,
      action: "rbac.user_role_assigned",
      resource: "profiles",
      entityId: profileId,
      details: { roleId },
      ipAddress: req.auditInfo?.ip,
      userAgent: req.auditInfo?.userAgent,
    });
  } catch (error) {
    console.error("[Admin] Assign role error:", error);
    res.status(500).json({ success: false, error: "Erro ao atribuir papel" });
  }
});

// REMOVE role from user (with anti-lockout protection)
router.delete("/rbac/users/:profileId/roles/:roleId", async (req: Request, res: Response) => {
  try {
    const profileId = req.params.profileId as string;
    const roleId = req.params.roleId as string;

    // Anti-lockout: Check if this would remove the last Admin
    if (await wouldRemoveLastAdmin(roleId, profileId)) {
      res.status(403).json({
        success: false,
        error: "Não é possível remover o último administrador do sistema. Atribua o papel de Admin a outro usuário primeiro."
      });

      void AuditService.log({
        userId: req.user!.id,
        action: "rbac.anti_lockout_blocked",
        resource: "profiles",
        entityId: profileId,
        details: { roleId, message: "Tentativa de remover o último Admin do sistema foi bloqueada" },
        ipAddress: req.auditInfo?.ip,
        userAgent: req.auditInfo?.userAgent,
      });
      return;
    }

    const { error } = await supabaseAdmin
      .from("user_roles")
      .delete()
      .match({ profile_id: profileId, role_id: roleId });

    if (error) throw error;
    res.json({ success: true });

    // Invalidate auth cache so permission changes take effect immediately
    // Invalidate auth cache so permission changes take effect immediately
    await invalidateAuthCache(profileId);

    // Notify the affected user in real-time via SSE
    notifyPermissionsChanged(profileId);

    // Audit log
    void AuditService.log({
      userId: req.user!.id,
      action: "rbac.user_role_removed",
      resource: "profiles",
      entityId: profileId,
      details: { roleId },
      ipAddress: req.auditInfo?.ip,
      userAgent: req.auditInfo?.userAgent,
    });
  } catch (error) {
    console.error("[Admin] Remove role error:", error);
    res.status(500).json({ success: false, error: "Erro ao remover papel" });
  }
});

export default router;
