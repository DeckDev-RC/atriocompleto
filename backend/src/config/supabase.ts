import { createClient } from "@supabase/supabase-js";
import { env } from "./env";

/**
 * Supabase clients utilizing the service-role key.
 * We keep `supabase` and `supabaseAdmin` as separate instances to prevent
 * session state contamination when auth endpoints (like signInWithPassword)
 * are called on the `supabase` instance.
 */
export const supabaseAdmin = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
    detectSessionInUrl: false,
  },
});

export const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
    detectSessionInUrl: false,
  },
});
