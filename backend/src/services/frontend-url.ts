import { env } from "../config/env";
import { supabaseAdmin } from "../config/supabase";
import { getPartnerById, normalizeHost } from "./partners";

function buildBaseUrlFromHost(host: string | null | undefined): string {
  const fallbackUrl = new URL(env.FRONTEND_URL);
  const normalizedHost = normalizeHost(host);

  if (!normalizedHost) {
    return fallbackUrl.origin;
  }

  return `${fallbackUrl.protocol}//${normalizedHost}`;
}

export async function resolveFrontendBaseUrl(params: {
  profileId?: string | null;
  tenantId?: string | null;
  partnerId?: string | null;
}): Promise<string> {
  let partnerId = params.partnerId || null;
  let tenantId = params.tenantId || null;

  if (params.profileId && (!partnerId || !tenantId)) {
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("partner_id, tenant_id")
      .eq("id", params.profileId)
      .maybeSingle();

    if (profile) {
      partnerId = partnerId || (profile.partner_id ? String(profile.partner_id) : null);
      tenantId = tenantId || (profile.tenant_id ? String(profile.tenant_id) : null);
    }
  }

  if (tenantId) {
    const { data: tenant } = await supabaseAdmin
      .from("tenants")
      .select("partner_id")
      .eq("id", tenantId)
      .maybeSingle();

    if (tenant?.partner_id) {
      partnerId = String(tenant.partner_id);
    }
  }

  if (!partnerId) {
    return buildBaseUrlFromHost(null);
  }

  const partner = await getPartnerById(partnerId);
  return buildBaseUrlFromHost(partner?.host || null);
}
