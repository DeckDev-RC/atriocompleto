import { createClient } from "@supabase/supabase-js";
import { env } from "./env";

/**
 * Single Supabase client using service-role key.
 * Both `supabase` and `supabaseAdmin` point to the same instance
 * (previously they were two identical clients).
 */
export const supabaseAdmin = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
    detectSessionInUrl: false,
  },
});

// Alias for backward compatibility — same client, same key, same behavior.
export const supabase = supabaseAdmin;
