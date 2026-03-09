import { Router, Request, Response } from "express";
import { z } from "zod";
import { supabaseAdmin } from "../../config/supabase";
import { invalidateAuthCache } from "../../middleware/auth";
import { AuditService } from "../../services/audit";
import { notifyPermissionsChanged, notifyAllPermissionsChanged } from "../../services/sse";

const router = Router();

// ── Rate Limit Management ───────────────────────────────

router.get("/rate-limit/blocked-ips", async (req: Request, res: Response) => {
  try {
    const { redis } = await import("../../config/redis");
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

    const { redis } = await import("../../config/redis");
    await redis.del(`ratelimit:blocked:${ip}`);
    await redis.del(`ratelimit:violations:${ip}`);

    res.json({ success: true, data: { message: `IP ${ip} desbloqueado com sucesso` } });

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

// ── RBAC: Roles ─────────────────────────────────────────

async function wouldRemoveLastAdmin(roleId: string, _profileId?: string): Promise<boolean> {
  const { data: role } = await supabaseAdmin
    .from("roles")
    .select("name")
    .eq("id", roleId)
    .single();

  if (!role || role.name !== "Admin") return false;

  const { count } = await supabaseAdmin
    .from("user_roles")
    .select("*", { count: "exact", head: true })
    .eq("role_id", roleId);

  return (count ?? 0) <= 1;
}

router.get("/roles", async (req: Request, res: Response) => {
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

const createRoleSchema = z.object({
  name: z.string().trim().min(2, "Nome obrigatório (mín. 2 caracteres)").max(50),
  description: z.string().max(200).nullable().optional(),
});

router.post("/roles", async (req: Request, res: Response) => {
  try {
    const parsed = createRoleSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ success: false, error: "Dados inválidos", details: parsed.error.flatten().fieldErrors });
      return;
    }

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

router.post("/roles/:roleId/clone", async (req: Request, res: Response) => {
  try {
    const sourceRoleId = req.params.roleId;
    const { name, description } = req.body;

    if (!name || name.trim().length < 2) {
      res.status(400).json({ success: false, error: "Nome obrigatório (mín. 2 caracteres)" });
      return;
    }

    const { data: existing } = await supabaseAdmin
      .from("roles")
      .select("id")
      .ilike("name", name.trim())
      .limit(1);

    if (existing && existing.length > 0) {
      res.status(409).json({ success: false, error: "Já existe um perfil com este nome" });
      return;
    }

    const { data: source, error: sourceError } = await supabaseAdmin
      .from("roles")
      .select("*, role_permissions(permission_id)")
      .eq("id", sourceRoleId)
      .single();

    if (sourceError || !source) {
      res.status(404).json({ success: false, error: "Perfil de origem não encontrado" });
      return;
    }

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

    if (source.role_permissions && source.role_permissions.length > 0) {
      const permInserts = source.role_permissions.map((rp: any) => ({
        role_id: newRole.id,
        permission_id: rp.permission_id,
      }));
      await supabaseAdmin.from("role_permissions").insert(permInserts);
    }

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

const updateRoleSchema = z.object({
  name: z.string().trim().min(2).max(50).optional(),
  description: z.string().max(200).nullable().optional(),
});

router.put("/roles/:roleId", async (req: Request, res: Response) => {
  try {
    const roleId = req.params.roleId as string;
    const parsed = updateRoleSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ success: false, error: "Dados inválidos", details: parsed.error.flatten().fieldErrors });
      return;
    }

    const { data: currentRole } = await supabaseAdmin
      .from("roles")
      .select("*")
      .eq("id", roleId)
      .single();

    if (!currentRole) {
      res.status(404).json({ success: false, error: "Perfil não encontrado" });
      return;
    }

    if (currentRole.is_system && parsed.data.name && parsed.data.name !== currentRole.name) {
      res.status(403).json({ success: false, error: "Perfis de sistema não podem ser renomeados" });
      return;
    }

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

router.delete("/roles/:roleId", async (req: Request, res: Response) => {
  try {
    const roleId = req.params.roleId as string;

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

    await supabaseAdmin.from("user_roles").delete().eq("role_id", roleId);
    await supabaseAdmin.from("role_permissions").delete().eq("role_id", roleId);

    const { error } = await supabaseAdmin.from("roles").delete().eq("id", roleId);
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

// ── RBAC: Permissions ───────────────────────────────────

router.get("/permissions", async (req: Request, res: Response) => {
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

router.post("/roles/:roleId/permissions", async (req: Request, res: Response) => {
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

    await invalidateAuthCache();
    notifyAllPermissionsChanged();

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

// ── RBAC: User ↔ Role assignments ───────────────────────

router.get("/users-roles", async (req: Request, res: Response) => {
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

router.post("/users/:profileId/roles", async (req: Request, res: Response) => {
  try {
    const profileId = req.params.profileId as string;
    const { roleId } = req.body;

    const { error } = await supabaseAdmin.from("user_roles").upsert({
      profile_id: profileId,
      role_id: roleId
    });

    if (error) throw error;
    res.json({ success: true });

    await invalidateAuthCache(profileId);
    notifyPermissionsChanged(profileId);

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

router.delete("/users/:profileId/roles/:roleId", async (req: Request, res: Response) => {
  try {
    const profileId = req.params.profileId as string;
    const roleId = req.params.roleId as string;

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

    await invalidateAuthCache(profileId);
    notifyPermissionsChanged(profileId);

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
