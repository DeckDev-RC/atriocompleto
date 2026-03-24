import { supabaseAdmin } from "../config/supabase";

const SETTINGS_ID = "default";

interface PublicSignupSettingsRow {
  enabled: boolean;
}

export interface PublicSignupAdminView {
  enabled: boolean;
}

async function readRow(): Promise<PublicSignupSettingsRow> {
  const { data, error } = await supabaseAdmin
    .from("public_signup_settings")
    .select("enabled")
    .eq("id", SETTINGS_ID)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return {
    enabled: data?.enabled ?? false,
  };
}

export async function getPublicSignupPublicView(): Promise<{ enabled: boolean }> {
  const row = await readRow();
  return { enabled: row.enabled };
}

export async function getPublicSignupAdminView(): Promise<PublicSignupAdminView> {
  const row = await readRow();
  return {
    enabled: row.enabled,
  };
}

export async function updatePublicSignupSettings(input: {
  enabled: boolean;
}): Promise<PublicSignupAdminView> {
  const { error } = await supabaseAdmin
    .from("public_signup_settings")
    .upsert({
      id: SETTINGS_ID,
      enabled: input.enabled,
      updated_at: new Date().toISOString(),
    });

  if (error) {
    throw error;
  }

  return {
    enabled: input.enabled,
  };
}

export async function assertPublicSignupEnabled(): Promise<void> {
  const row = await readRow();

  if (!row.enabled) {
    throw new Error("Cadastro publico indisponivel no momento.");
  }
}
