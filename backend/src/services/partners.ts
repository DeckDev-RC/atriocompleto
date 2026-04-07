import type { Request } from "express";
import { supabaseAdmin } from "../config/supabase";

export interface PartnerRow {
  id: string;
  name: string;
  slug: string;
  host: string;
  admin_profile_id: string | null;
  is_active: boolean;
  primary_color: string | null;
  login_logo_url: string | null;
  sidebar_logo_light_url: string | null;
  sidebar_logo_dark_url: string | null;
  icon_logo_url: string | null;
  footer_logo_url: string | null;
  favicon_url: string | null;
}

export interface ResolvedBranding {
  is_whitelabel: boolean;
  partner_id: string | null;
  partner_name: string | null;
  partner_slug: string | null;
  resolved_host: string | null;
  primary_color: string | null;
  login_logo_url: string | null;
  sidebar_logo_light_url: string | null;
  sidebar_logo_dark_url: string | null;
  icon_logo_url: string | null;
  footer_logo_url: string | null;
  favicon_url: string | null;
}

export function normalizeHost(host: string | null | undefined): string | null {
  if (!host) return null;

  return host
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/\/.*$/, "")
    .replace(/:\d+$/, "") || null;
}

export function getRequestHost(req: Request): string | null {
  const clientHost = req.headers["x-client-host"];
  const forwardedHost = req.headers["x-forwarded-host"];
  const origin = req.headers.origin;
  const hostHeader = req.headers.host;
  const referer = req.headers.referer;

  if (Array.isArray(clientHost) && clientHost[0]) {
    return normalizeHost(clientHost[0]);
  }

  if (typeof clientHost === "string" && clientHost.trim()) {
    return normalizeHost(clientHost);
  }

  if (Array.isArray(forwardedHost) && forwardedHost[0]) {
    return normalizeHost(forwardedHost[0]);
  }

  if (typeof forwardedHost === "string" && forwardedHost.trim()) {
    return normalizeHost(forwardedHost);
  }

  if (typeof origin === "string" && origin.trim()) {
    return normalizeHost(origin);
  }

  if (typeof referer === "string" && referer.trim()) {
    return normalizeHost(referer);
  }

  if (typeof hostHeader === "string" && hostHeader.trim()) {
    return normalizeHost(hostHeader);
  }

  return null;
}

export async function getPartnerById(partnerId: string | null | undefined): Promise<PartnerRow | null> {
  if (!partnerId) return null;

  const { data, error } = await supabaseAdmin
    .from("partners")
    .select("id, name, slug, host, admin_profile_id, is_active, primary_color, login_logo_url, sidebar_logo_light_url, sidebar_logo_dark_url, icon_logo_url, footer_logo_url, favicon_url")
    .eq("id", partnerId)
    .eq("is_active", true)
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  return data as PartnerRow;
}

export async function getPartnerBySlug(slug: string | null | undefined): Promise<PartnerRow | null> {
  if (!slug) return null;

  const { data, error } = await supabaseAdmin
    .from("partners")
    .select("id, name, slug, host, admin_profile_id, is_active, primary_color, login_logo_url, sidebar_logo_light_url, sidebar_logo_dark_url, icon_logo_url, footer_logo_url, favicon_url")
    .eq("slug", slug.trim().toLowerCase())
    .eq("is_active", true)
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  return data as PartnerRow;
}

export async function getPartnerByHost(host: string | null | undefined): Promise<PartnerRow | null> {
  const normalizedHost = normalizeHost(host);
  if (!normalizedHost) return null;

  const { data, error } = await supabaseAdmin
    .from("partners")
    .select("id, name, slug, host, admin_profile_id, is_active, primary_color, login_logo_url, sidebar_logo_light_url, sidebar_logo_dark_url, icon_logo_url, footer_logo_url, favicon_url")
    .eq("host", normalizedHost)
    .eq("is_active", true)
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  return data as PartnerRow;
}

export async function getManagedPartnerIds(profileId: string): Promise<string[]> {
  const { data, error } = await supabaseAdmin
    .from("partners")
    .select("id")
    .eq("admin_profile_id", profileId)
    .eq("is_active", true);

  if (error || !data) {
    return [];
  }

  return data.map((row) => String(row.id));
}

export async function getTenantPartnerId(tenantId: string | null | undefined): Promise<string | null> {
  if (!tenantId) return null;

  const { data, error } = await supabaseAdmin
    .from("tenants")
    .select("partner_id")
    .eq("id", tenantId)
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  return data.partner_id ? String(data.partner_id) : null;
}

export function buildResolvedBranding(partner: PartnerRow | null): ResolvedBranding {
  if (!partner) {
    return {
      is_whitelabel: false,
      partner_id: null,
      partner_name: null,
      partner_slug: null,
      resolved_host: null,
      primary_color: null,
      login_logo_url: null,
      sidebar_logo_light_url: null,
      sidebar_logo_dark_url: null,
      icon_logo_url: null,
      footer_logo_url: null,
      favicon_url: null,
    };
  }

  return {
    is_whitelabel: true,
    partner_id: partner.id,
    partner_name: partner.name,
    partner_slug: partner.slug,
    resolved_host: partner.host,
    primary_color: partner.primary_color,
    login_logo_url: partner.login_logo_url,
    sidebar_logo_light_url: partner.sidebar_logo_light_url,
    sidebar_logo_dark_url: partner.sidebar_logo_dark_url,
    icon_logo_url: partner.icon_logo_url,
    footer_logo_url: partner.footer_logo_url,
    favicon_url: partner.favicon_url,
  };
}
