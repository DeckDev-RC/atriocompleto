import { Router, Request, Response } from "express";
import { z } from "zod";
import { supabaseAdmin } from "../../config/supabase";
import { AuditService } from "../../services/audit";
import { VALID_FEATURE_KEYS } from "../../constants/feature-flags";
import { invalidateAuthCache } from "../../middleware/auth";
import { buildDisabledTenantFeatures, generateUniqueTenantCode } from "../../services/tenantIdentity";
import { notifyPermissionsChanged } from "../../services/sse";

const router = Router();

const tenantSchema = z.object({
  name: z.string().trim().min(2, "Nome mínimo 2 caracteres").max(100, "Nome muito longo"),
  ai_rate_limit: z.number().int().min(1).max(1000).default(20),
});

router.get("/", async (req: Request, res: Response) => {
  try {
    const { data, error } = await supabaseAdmin
      .from("tenants")
      .select("id, name, tenant_code, ai_rate_limit, created_at, enabled_features")
      .order("name")
      .order("tenant_code");

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

router.post("/", async (req: Request, res: Response) => {
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

    const tenantCode = await generateUniqueTenantCode(parsed.data.name);
    const { data, error } = await supabaseAdmin
      .from("tenants")
      .insert({
        name: parsed.data.name,
        tenant_code: tenantCode,
        ai_rate_limit: parsed.data.ai_rate_limit,
        enabled_features: buildDisabledTenantFeatures(),
      })
      .select()
      .single();

    if (error) {
      res.status(400).json({ success: false, error: error.message });
      return;
    }

    res.status(201).json({ success: true, data });

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

router.put("/:id", async (req: Request, res: Response) => {
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
      .update({
        name: parsed.data.name,
        ai_rate_limit: parsed.data.ai_rate_limit
      })
      .eq("id", req.params.id)
      .select()
      .single();

    if (error || !data) {
      res.status(404).json({ success: false, error: "Empresa não encontrada" });
      return;
    }

    res.json({ success: true, data });

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

router.delete("/:id", async (req: Request, res: Response) => {
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

// ── Feature flags management ────────────────────────────
const featureFlagsSchema = z.object({
  enabled_features: z.record(
    z.enum(VALID_FEATURE_KEYS as [string, ...string[]]),
    z.boolean()
  ),
});

router.put("/:id/features", async (req: Request, res: Response) => {
  try {
    const parsed = featureFlagsSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        success: false,
        error: "Dados inválidos",
        details: parsed.error.flatten().fieldErrors,
      });
      return;
    }

    const { data: previousTenant } = await supabaseAdmin
      .from("tenants")
      .select("enabled_features")
      .eq("id", req.params.id)
      .single();

    if (!previousTenant) {
      res.status(404).json({ success: false, error: "Empresa não encontrada" });
      return;
    }

    const { data, error } = await supabaseAdmin
      .from("tenants")
      .update({ enabled_features: parsed.data.enabled_features })
      .eq("id", req.params.id)
      .select("id, enabled_features")
      .single();

    if (error || !data) {
      res.status(500).json({ success: false, error: "Erro ao atualizar features" });
      return;
    }

    // Invalidate auth cache for all users of this tenant
    const { data: tenantUsers } = await supabaseAdmin
      .from("profiles")
      .select("id")
      .eq("tenant_id", req.params.id);

    if (tenantUsers) {
      for (const u of tenantUsers) {
        await invalidateAuthCache(u.id);
        notifyPermissionsChanged(u.id);
      }
    }

    res.json({ success: true, data });

    void AuditService.log({
      userId: req.user!.id,
      action: "tenant.update_features",
      resource: "tenants",
      entityId: String(req.params.id),
      ipAddress: req.auditInfo?.ip,
      userAgent: req.auditInfo?.userAgent,
      details: {
        previous: previousTenant.enabled_features,
        next: parsed.data.enabled_features,
      },
    });
  } catch (error) {
    console.error("[Admin] Update tenant features error:", error);
    res.status(500).json({ success: false, error: "Erro ao atualizar features da empresa" });
  }
});

export default router;
