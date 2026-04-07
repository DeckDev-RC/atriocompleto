import { Router, Request, Response } from "express";
import { z } from "zod";
import multer from "multer";
import { supabaseAdmin } from "../../config/supabase";
import { AuditService } from "../../services/audit";
import { invalidateAuthCache } from "../../middleware/auth";
import { notifyPermissionsChanged } from "../../services/sse";
import { normalizeHost } from "../../services/partners";

const router = Router();
const BRANDING_BUCKET = "partner-branding";

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = ["image/jpeg", "image/png", "image/webp", "image/gif", "image/svg+xml", "image/x-icon", "image/vnd.microsoft.icon"];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error("Tipo de arquivo não permitido. Use JPEG, PNG, WebP, GIF, SVG ou ICO."));
    }
  },
});

const assetKeySchema = z.enum([
  "login_logo_url",
  "sidebar_logo_light_url",
  "sidebar_logo_dark_url",
  "icon_logo_url",
  "footer_logo_url",
  "favicon_url",
]);

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

function canManagePartner(req: Request, partnerId: string) {
  return req.user?.role === "master"
    || !!req.user?.managed_partner_ids?.includes(partnerId);
}

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

router.get("/", async (req: Request, res: Response) => {
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

    const partners = (data || [])
      .filter((partner) => canManagePartner(req, String(partner.id)))
      .map((partner) => ({
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
    if (req.user?.role !== "master") {
      res.status(403).json({ success: false, error: "Apenas masters podem criar parceiros" });
      return;
    }

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
    const partnerId = String(req.params.id);
    if (!canManagePartner(req, partnerId)) {
      res.status(403).json({ success: false, error: "Você não pode editar este parceiro" });
      return;
    }

    const parsed = partnerSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ success: false, error: "Dados invalidos", details: parsed.error.flatten().fieldErrors });
      return;
    }

    const { data: previous } = await supabaseAdmin
      .from("partners")
      .select("*")
      .eq("id", partnerId)
      .single();

    if (!previous) {
      res.status(404).json({ success: false, error: "Parceiro nao encontrado" });
      return;
    }

    if (req.user?.role === "master" && parsed.data.admin_profile_id) {
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

    const host = normalizeHost(parsed.data.host);
    if (req.user?.role === "master" && !host) {
      res.status(400).json({ success: false, error: "Host invalido" });
      return;
    }

    const updates = req.user?.role === "master"
      ? {
        ...parsed.data,
        host,
        slug: parsed.data.slug.trim().toLowerCase(),
        updated_at: new Date().toISOString(),
      }
      : {
        name: parsed.data.name,
        primary_color: parsed.data.primary_color || null,
        updated_at: new Date().toISOString(),
      };

    const { data, error } = await supabaseAdmin
      .from("partners")
      .update(updates)
      .eq("id", partnerId)
      .select("*")
      .single();

    if (error || !data) {
      res.status(400).json({ success: false, error: error?.message || "Erro ao atualizar parceiro" });
      return;
    }

    if (req.user?.role === "master" && previous.admin_profile_id && previous.admin_profile_id !== data.admin_profile_id) {
      await supabaseAdmin
        .from("profiles")
        .update({ partner_id: null, updated_at: new Date().toISOString() })
        .eq("id", previous.admin_profile_id);
      await invalidateAuthCache(String(previous.admin_profile_id));
      notifyPermissionsChanged(String(previous.admin_profile_id));
    }

    if (req.user?.role === "master" && data.admin_profile_id) {
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

router.post("/:id/assets/:assetKey", upload.single("asset"), async (req: Request, res: Response) => {
  try {
    const partnerId = String(req.params.id);
    if (!canManagePartner(req, partnerId)) {
      res.status(403).json({ success: false, error: "Você não pode editar este parceiro" });
      return;
    }

    const parsedAssetKey = assetKeySchema.safeParse(req.params.assetKey);
    if (!parsedAssetKey.success) {
      res.status(400).json({ success: false, error: "Asset invalido" });
      return;
    }

    const file = req.file;
    if (!file) {
      res.status(400).json({ success: false, error: "Nenhum arquivo enviado" });
      return;
    }

    const assetKey = parsedAssetKey.data;

    const { data: partner } = await supabaseAdmin
      .from("partners")
      .select("id")
      .eq("id", partnerId)
      .maybeSingle();

    if (!partner) {
      res.status(404).json({ success: false, error: "Parceiro nao encontrado" });
      return;
    }

    const ext = file.mimetype === "image/jpeg"
      ? "jpg"
      : file.mimetype === "image/svg+xml"
        ? "svg"
        : file.mimetype === "image/x-icon" || file.mimetype === "image/vnd.microsoft.icon"
          ? "ico"
          : file.mimetype.split("/")[1];
    const filePath = `partners/${partnerId}/${assetKey}.${ext}`;

    await Promise.all([
      supabaseAdmin.storage.from(BRANDING_BUCKET).remove([
        `partners/${partnerId}/${assetKey}.jpg`,
        `partners/${partnerId}/${assetKey}.png`,
        `partners/${partnerId}/${assetKey}.webp`,
        `partners/${partnerId}/${assetKey}.gif`,
        `partners/${partnerId}/${assetKey}.svg`,
        `partners/${partnerId}/${assetKey}.ico`,
      ]),
    ]);

    const { error: uploadError } = await supabaseAdmin.storage
      .from(BRANDING_BUCKET)
      .upload(filePath, file.buffer, {
        contentType: file.mimetype,
        upsert: true,
      });

    if (uploadError) {
      res.status(500).json({ success: false, error: uploadError.message });
      return;
    }

    const { data: publicUrlData } = supabaseAdmin.storage
      .from(BRANDING_BUCKET)
      .getPublicUrl(filePath);
    const assetUrl = `${publicUrlData.publicUrl}?t=${Date.now()}`;

    const { data: updatedPartner, error: updateError } = await supabaseAdmin
      .from("partners")
      .update({
        [assetKey]: assetUrl,
        updated_at: new Date().toISOString(),
      })
      .eq("id", partnerId)
      .select("*")
      .single();

    if (updateError || !updatedPartner) {
      res.status(500).json({ success: false, error: updateError?.message || "Erro ao atualizar parceiro" });
      return;
    }

    await refreshPartnerUsers(partnerId);

    res.json({ success: true, data: { assetKey, url: assetUrl, partner: updatedPartner } });

    void AuditService.log({
      userId: req.user!.id,
      action: "partner.asset_upload",
      resource: "partners",
      entityId: partnerId,
      ipAddress: req.auditInfo?.ip,
      userAgent: req.auditInfo?.userAgent,
      details: { assetKey, url: assetUrl },
    });
  } catch (error) {
    console.error("[Admin] Upload partner asset error:", error);
    res.status(500).json({ success: false, error: "Erro ao enviar asset do parceiro" });
  }
});

router.delete("/:id/assets/:assetKey", async (req: Request, res: Response) => {
  try {
    const partnerId = String(req.params.id);
    if (!canManagePartner(req, partnerId)) {
      res.status(403).json({ success: false, error: "Você não pode editar este parceiro" });
      return;
    }

    const parsedAssetKey = assetKeySchema.safeParse(req.params.assetKey);
    if (!parsedAssetKey.success) {
      res.status(400).json({ success: false, error: "Asset invalido" });
      return;
    }

    const assetKey = parsedAssetKey.data;

    const { data: partner } = await supabaseAdmin
      .from("partners")
      .select("id")
      .eq("id", partnerId)
      .maybeSingle();

    if (!partner) {
      res.status(404).json({ success: false, error: "Parceiro nao encontrado" });
      return;
    }

    await supabaseAdmin.storage.from(BRANDING_BUCKET).remove([
      `partners/${partnerId}/${assetKey}.jpg`,
      `partners/${partnerId}/${assetKey}.png`,
      `partners/${partnerId}/${assetKey}.webp`,
      `partners/${partnerId}/${assetKey}.gif`,
      `partners/${partnerId}/${assetKey}.svg`,
      `partners/${partnerId}/${assetKey}.ico`,
    ]);

    const { data: updatedPartner, error: updateError } = await supabaseAdmin
      .from("partners")
      .update({
        [assetKey]: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", partnerId)
      .select("*")
      .single();

    if (updateError || !updatedPartner) {
      res.status(500).json({ success: false, error: updateError?.message || "Erro ao atualizar parceiro" });
      return;
    }

    await refreshPartnerUsers(partnerId);

    res.json({ success: true, data: { assetKey, partner: updatedPartner } });
  } catch (error) {
    console.error("[Admin] Delete partner asset error:", error);
    res.status(500).json({ success: false, error: "Erro ao remover asset do parceiro" });
  }
});

export default router;
