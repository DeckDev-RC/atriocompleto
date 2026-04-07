import { Router, Request, Response } from "express";
import { z } from "zod";
import { supabaseAdmin } from "../../config/supabase";
import { AuditService } from "../../services/audit";
import { normalizeExplicitFeatureFlags, VALID_FEATURE_KEYS } from "../../constants/feature-flags";
import { invalidateAuthCache, requireMaster } from "../../middleware/auth";
import { requirePermission } from "../../middleware/rbac";
import { buildDisabledTenantFeatures, generateUniqueTenantCode } from "../../services/tenantIdentity";
import { notifyPermissionsChanged } from "../../services/sse";
import { hasManageableTenantAccess } from "../../utils/tenant-access";

const router = Router();

const tenantSchema = z.object({
  name: z.string().trim().min(2, "Nome minimo 2 caracteres").max(100, "Nome muito longo"),
  ai_rate_limit: z.number().int().min(1).max(1000).default(20),
  partner_id: z.string().uuid("Parceiro invalido").nullable().optional(),
});

const featureFlagsSchema = z.object({
  changes: z.record(
    z.enum(VALID_FEATURE_KEYS as [string, ...string[]]),
    z.boolean(),
  ).optional(),
  enabled_features: z.record(
    z.enum(VALID_FEATURE_KEYS as [string, ...string[]]),
    z.boolean(),
  ).optional(),
}).refine((data) => !!data.changes || !!data.enabled_features, {
  message: "Nenhuma alteracao de feature enviada",
  path: ["changes"],
});

async function assertPartnerExists(partnerId: string | null | undefined) {
  if (!partnerId) return true;

  const { data: partner } = await supabaseAdmin
    .from("partners")
    .select("id")
    .eq("id", partnerId)
    .maybeSingle();

  return !!partner;
}

function canAccessTenant(req: Request, tenant: { id: string; partner_id: string | null }) {
  if (req.user!.role === "master") return true;

  return hasManageableTenantAccess(req.user!.manageable_tenant_ids, tenant.id)
    || (!!tenant.partner_id && req.user!.managed_partner_ids?.includes(String(tenant.partner_id)));
}

async function refreshTenantUsers(tenantId: string) {
  const { data: tenantUsers } = await supabaseAdmin
    .from("profiles")
    .select("id")
    .eq("tenant_id", tenantId);

  for (const profile of tenantUsers || []) {
    await invalidateAuthCache(String(profile.id));
    notifyPermissionsChanged(String(profile.id));
  }
}

router.get("/", requirePermission("gerenciar_feature_flags"), async (req: Request, res: Response) => {
  try {
    const { data, error } = await supabaseAdmin
      .from("tenants")
      .select("id, name, tenant_code, ai_rate_limit, created_at, enabled_features, partner_id")
      .order("name")
      .order("tenant_code");

    if (error) throw error;

    const visibleTenants = (data || []).filter((tenant) => canAccessTenant(req, {
      id: String(tenant.id),
      partner_id: tenant.partner_id ? String(tenant.partner_id) : null,
    }));

    const visibleTenantIds = new Set(visibleTenants.map((tenant) => String(tenant.id)));

    const [{ data: profiles }, { data: partners }] = await Promise.all([
      supabaseAdmin.from("profiles").select("tenant_id"),
      supabaseAdmin.from("partners").select("id, name"),
    ]);

    const partnerMap = new Map((partners || []).map((partner) => [String(partner.id), partner.name]));
    const userCounts: Record<string, number> = {};

    for (const profile of profiles || []) {
      if (profile.tenant_id && visibleTenantIds.has(String(profile.tenant_id))) {
        userCounts[String(profile.tenant_id)] = (userCounts[String(profile.tenant_id)] || 0) + 1;
      }
    }

    const tenants = visibleTenants.map((tenant) => ({
      ...tenant,
      enabled_features: normalizeExplicitFeatureFlags(tenant.enabled_features),
      partner_name: tenant.partner_id ? partnerMap.get(String(tenant.partner_id)) || null : null,
      user_count: userCounts[String(tenant.id)] || 0,
    }));

    res.json({ success: true, data: tenants });

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

router.post("/", requireMaster, async (req: Request, res: Response) => {
  try {
    const parsed = tenantSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ success: false, error: "Dados invalidos", details: parsed.error.flatten().fieldErrors });
      return;
    }

    if (!(await assertPartnerExists(parsed.data.partner_id || null))) {
      res.status(400).json({ success: false, error: "Parceiro nao encontrado" });
      return;
    }

    const tenantCode = await generateUniqueTenantCode(parsed.data.name);
    const { data, error } = await supabaseAdmin
      .from("tenants")
      .insert({
        name: parsed.data.name,
        tenant_code: tenantCode,
        ai_rate_limit: parsed.data.ai_rate_limit,
        partner_id: parsed.data.partner_id || null,
        enabled_features: buildDisabledTenantFeatures(),
      })
      .select()
      .single();

    if (error || !data) {
      res.status(400).json({ success: false, error: error?.message || "Erro ao criar empresa" });
      return;
    }

    res.status(201).json({ success: true, data });

    void AuditService.log({
      userId: req.user!.id,
      action: "tenant.create",
      resource: "tenants",
      entityId: String(data.id),
      ipAddress: req.auditInfo?.ip,
      userAgent: req.auditInfo?.userAgent,
      details: { next: data },
    });
  } catch (error) {
    console.error("[Admin] Create tenant error:", error);
    res.status(500).json({ success: false, error: "Erro ao criar empresa" });
  }
});

router.put("/:id", requireMaster, async (req: Request, res: Response) => {
  try {
    const parsed = tenantSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ success: false, error: "Dados invalidos", details: parsed.error.flatten().fieldErrors });
      return;
    }

    if (!(await assertPartnerExists(parsed.data.partner_id || null))) {
      res.status(400).json({ success: false, error: "Parceiro nao encontrado" });
      return;
    }

    const { data: previousTenant } = await supabaseAdmin
      .from("tenants")
      .select("*")
      .eq("id", req.params.id)
      .single();

    const { data, error } = await supabaseAdmin
      .from("tenants")
      .update({
        name: parsed.data.name,
        ai_rate_limit: parsed.data.ai_rate_limit,
        partner_id: parsed.data.partner_id || null,
      })
      .eq("id", req.params.id)
      .select()
      .single();

    if (error || !data) {
      res.status(404).json({ success: false, error: "Empresa nao encontrada" });
      return;
    }

    await refreshTenantUsers(String(data.id));

    res.json({ success: true, data });

    void AuditService.log({
      userId: req.user!.id,
      action: "tenant.update",
      resource: "tenants",
      entityId: String(data.id),
      ipAddress: req.auditInfo?.ip,
      userAgent: req.auditInfo?.userAgent,
      details: AuditService.getDiff(previousTenant, data),
    });
  } catch (error) {
    console.error("[Admin] Update tenant error:", error);
    res.status(500).json({ success: false, error: "Erro ao atualizar empresa" });
  }
});

router.delete("/:id", requireMaster, async (req: Request, res: Response) => {
  try {
    const { data: users } = await supabaseAdmin
      .from("profiles")
      .select("id")
      .eq("tenant_id", req.params.id)
      .limit(1);

    if (users && users.length > 0) {
      res.status(400).json({ success: false, error: "Remova os usuarios da empresa antes de exclui-la" });
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

router.put("/:id/features", requirePermission("gerenciar_feature_flags"), async (req: Request, res: Response) => {
  try {
    const tenantId = String(req.params.id);
    const parsed = featureFlagsSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ success: false, error: "Dados invalidos", details: parsed.error.flatten().fieldErrors });
      return;
    }

    const { data: previousTenant } = await supabaseAdmin
      .from("tenants")
      .select("id, enabled_features, partner_id")
      .eq("id", tenantId)
      .single();

    if (!previousTenant) {
      res.status(404).json({ success: false, error: "Empresa nao encontrada" });
      return;
    }

    if (!canAccessTenant(req, {
      id: String(previousTenant.id),
      partner_id: previousTenant.partner_id ? String(previousTenant.partner_id) : null,
    })) {
      res.status(403).json({ success: false, error: "Voce nao tem acesso a esta empresa" });
      return;
    }

    const currentFeatures = normalizeExplicitFeatureFlags(previousTenant.enabled_features);
    const requestedChanges = parsed.data.changes ?? Object.fromEntries(
      Object.entries(parsed.data.enabled_features || {}).filter(
        ([key, value]) => currentFeatures[key as keyof typeof currentFeatures] !== value,
      ),
    );

    const allowedFeatureKeys = req.user!.role === "master"
      ? VALID_FEATURE_KEYS
      : VALID_FEATURE_KEYS.filter((key) => req.user!.manageable_features?.[key] === true);

    const unauthorizedKeys = Object.keys(requestedChanges).filter(
      (key) => !allowedFeatureKeys.includes(key as typeof VALID_FEATURE_KEYS[number]),
    );

    if (unauthorizedKeys.length > 0) {
      res.status(403).json({
        success: false,
        error: `Voce nao pode alterar estas feature flags: ${unauthorizedKeys.join(", ")}`,
      });
      return;
    }

    const nextFeatures = {
      ...currentFeatures,
      ...requestedChanges,
    };

    const { data, error } = await supabaseAdmin
      .from("tenants")
      .update({ enabled_features: nextFeatures })
      .eq("id", tenantId)
      .select("id, enabled_features")
      .single();

    if (error || !data) {
      res.status(500).json({ success: false, error: "Erro ao atualizar features" });
      return;
    }

    await refreshTenantUsers(tenantId);

    res.json({ success: true, data });

    void AuditService.log({
      userId: req.user!.id,
      action: "tenant.update_features",
      resource: "tenants",
      entityId: tenantId,
      ipAddress: req.auditInfo?.ip,
      userAgent: req.auditInfo?.userAgent,
      details: {
        previous: currentFeatures,
        changes: requestedChanges,
        next: nextFeatures,
      },
    });
  } catch (error) {
    console.error("[Admin] Update tenant features error:", error);
    res.status(500).json({ success: false, error: "Erro ao atualizar features da empresa" });
  }
});

export default router;
