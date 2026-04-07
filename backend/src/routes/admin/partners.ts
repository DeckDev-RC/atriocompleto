import { Router, Request, Response } from "express";
import { z } from "zod";
import { supabaseAdmin } from "../../config/supabase";
import { AuditService } from "../../services/audit";
import { invalidateAuthCache } from "../../middleware/auth";
import { notifyPermissionsChanged } from "../../services/sse";
import { normalizeHost } from "../../services/partners";

const router = Router();

const partnerSchema = z.object({
  name: z.string().trim().min(2).max(120),
  slug: z.string().trim().min(2).max(80).regex(/^[a-z0-9-]+$/, "Slug invalido"),
  host: z.string().trim().min(3).max(255),
  admin_profile_id: z.string().uuid().nullable().optional(),
  is_active: z.boolean().default(true),
  primary_color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).nullable().optional(),
  login_logo_url: z.string().url().nullable().optional(),
  sidebar_logo_light_url: z.string().url().nullable().optional(),
  sidebar_logo_dark_url: z.string().url().nullable().optional(),
  icon_logo_url: z.string().url().nullable().optional(),
  footer_logo_url: z.string().url().nullable().optional(),
  favicon_url: z.string().url().nullable().optional(),
});

async function refreshPartnerUsers(partnerId: string) {
  const { data: partnerTenants } = await supabaseAdmin
    .from("tenants")
    .select("id")
    .eq("partner_id", partnerId);

  const tenantIds = (partnerTenants || []).map((tenant) => String(tenant.id));

  const { data: profiles } = tenantIds.length > 0
    ? await supabaseAdmin
      .from("profiles")
      .select("id")
      .or(`partner_id.eq.${partnerId},tenant_id.in.(${tenantIds.join(",")})`)
    : await supabaseAdmin
      .from("profiles")
      .select("id")
      .eq("partner_id", partnerId);

  for (const profile of profiles || []) {
    await invalidateAuthCache(String(profile.id));
    notifyPermissionsChanged(String(profile.id));
  }
}

router.get("/", async (_req: Request, res: Response) => {
  try {
    const { data, error } = await supabaseAdmin
      .from("partners")
      .select("id, name, slug, host, admin_profile_id, is_active, primary_color, login_logo_url, sidebar_logo_light_url, sidebar_logo_dark_url, icon_logo_url, footer_logo_url, favicon_url, created_at, updated_at")
      .order("name");

    if (error) throw error;

    const { data: tenantRows } = await supabaseAdmin
      .from("tenants")
      .select("id, partner_id");

    const { data: profiles } = await supabaseAdmin
      .from("profiles")
      .select("id, full_name, email");

    const adminMap = new Map((profiles || []).map((profile) => [String(profile.id), profile]));
    const tenantCountByPartner = new Map<string, number>();

    for (const tenant of tenantRows || []) {
      if (!tenant.partner_id) continue;
      const key = String(tenant.partner_id);
      tenantCountByPartner.set(key, (tenantCountByPartner.get(key) || 0) + 1);
    }

    const partners = (data || []).map((partner) => ({
      ...partner,
      admin_profile: partner.admin_profile_id ? adminMap.get(String(partner.admin_profile_id)) || null : null,
      tenant_count: tenantCountByPartner.get(String(partner.id)) || 0,
    }));

    res.json({ success: true, data: partners });
  } catch (error) {
    console.error("[Admin] List partners error:", error);
    res.status(500).json({ success: false, error: "Erro ao listar parceiros" });
  }
});

router.post("/", async (req: Request, res: Response) => {
  try {
    const parsed = partnerSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ success: false, error: "Dados invalidos", details: parsed.error.flatten().fieldErrors });
      return;
    }

    const host = normalizeHost(parsed.data.host);
    if (!host) {
      res.status(400).json({ success: false, error: "Host invalido" });
      return;
    }

    if (parsed.data.admin_profile_id) {
      const { data: adminProfile } = await supabaseAdmin
        .from("profiles")
        .select("id")
        .eq("id", parsed.data.admin_profile_id)
        .maybeSingle();

      if (!adminProfile) {
        res.status(400).json({ success: false, error: "Administrador parceiro invalido" });
        return;
      }
    }

    const { data, error } = await supabaseAdmin
      .from("partners")
      .insert({
        ...parsed.data,
        host,
        slug: parsed.data.slug.trim().toLowerCase(),
        updated_at: new Date().toISOString(),
      })
      .select("*")
      .single();

    if (error || !data) {
      res.status(400).json({ success: false, error: error?.message || "Erro ao criar parceiro" });
      return;
    }

    if (data.admin_profile_id) {
      await supabaseAdmin
        .from("profiles")
        .update({ partner_id: data.id, updated_at: new Date().toISOString() })
        .eq("id", data.admin_profile_id);

      await invalidateAuthCache(String(data.admin_profile_id));
      notifyPermissionsChanged(String(data.admin_profile_id));
    }

    res.status(201).json({ success: true, data });

    void AuditService.log({
      userId: req.user!.id,
      action: "partner.create",
      resource: "partners",
      entityId: data.id,
      ipAddress: req.auditInfo?.ip,
      userAgent: req.auditInfo?.userAgent,
      details: { next: data },
    });
  } catch (error) {
    console.error("[Admin] Create partner error:", error);
    res.status(500).json({ success: false, error: "Erro ao criar parceiro" });
  }
});

router.put("/:id", async (req: Request, res: Response) => {
  try {
    const parsed = partnerSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ success: false, error: "Dados invalidos", details: parsed.error.flatten().fieldErrors });
      return;
    }

    const host = normalizeHost(parsed.data.host);
    if (!host) {
      res.status(400).json({ success: false, error: "Host invalido" });
      return;
    }

    const { data: previous } = await supabaseAdmin
      .from("partners")
      .select("*")
      .eq("id", req.params.id)
      .single();

    if (!previous) {
      res.status(404).json({ success: false, error: "Parceiro nao encontrado" });
      return;
    }

    if (parsed.data.admin_profile_id) {
      const { data: adminProfile } = await supabaseAdmin
        .from("profiles")
        .select("id")
        .eq("id", parsed.data.admin_profile_id)
        .maybeSingle();

      if (!adminProfile) {
        res.status(400).json({ success: false, error: "Administrador parceiro invalido" });
        return;
      }
    }

    const { data, error } = await supabaseAdmin
      .from("partners")
      .update({
        ...parsed.data,
        host,
        slug: parsed.data.slug.trim().toLowerCase(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", req.params.id)
      .select("*")
      .single();

    if (error || !data) {
      res.status(400).json({ success: false, error: error?.message || "Erro ao atualizar parceiro" });
      return;
    }

    if (previous.admin_profile_id && previous.admin_profile_id !== data.admin_profile_id) {
      await supabaseAdmin
        .from("profiles")
        .update({ partner_id: null, updated_at: new Date().toISOString() })
        .eq("id", previous.admin_profile_id);
      await invalidateAuthCache(String(previous.admin_profile_id));
      notifyPermissionsChanged(String(previous.admin_profile_id));
    }

    if (data.admin_profile_id) {
      await supabaseAdmin
        .from("profiles")
        .update({ partner_id: data.id, updated_at: new Date().toISOString() })
        .eq("id", data.admin_profile_id);
      await invalidateAuthCache(String(data.admin_profile_id));
      notifyPermissionsChanged(String(data.admin_profile_id));
    }

    await refreshPartnerUsers(String(data.id));

    res.json({ success: true, data });

    void AuditService.log({
      userId: req.user!.id,
      action: "partner.update",
      resource: "partners",
      entityId: String(data.id),
      ipAddress: req.auditInfo?.ip,
      userAgent: req.auditInfo?.userAgent,
      details: AuditService.getDiff(previous, data),
    });
  } catch (error) {
    console.error("[Admin] Update partner error:", error);
    res.status(500).json({ success: false, error: "Erro ao atualizar parceiro" });
  }
});

export default router;
