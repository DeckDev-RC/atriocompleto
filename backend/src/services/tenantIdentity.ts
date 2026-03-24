import { supabaseAdmin } from "../config/supabase";
import { getAllDisabledFeatureFlags } from "../constants/feature-flags";
import { generateOpaqueToken } from "../utils/security";

export function buildDisabledTenantFeatures() {
  return getAllDisabledFeatureFlags();
}

function slugifyTenantBase(name: string): string {
  const normalized = name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 24);

  return normalized || "empresa";
}

export async function generateUniqueTenantCode(name: string): Promise<string> {
  const base = slugifyTenantBase(name);

  for (let attempt = 0; attempt < 10; attempt += 1) {
    const suffix = generateOpaqueToken(3).slice(0, 6).toLowerCase();
    const tenantCode = `${base}-${suffix}`;

    const { data, error } = await supabaseAdmin
      .from("tenants")
      .select("id")
      .eq("tenant_code", tenantCode)
      .maybeSingle();

    if (error) {
      throw error;
    }

    if (!data) {
      return tenantCode;
    }
  }

  throw new Error("Nao foi possivel gerar um identificador unico para a empresa.");
}
