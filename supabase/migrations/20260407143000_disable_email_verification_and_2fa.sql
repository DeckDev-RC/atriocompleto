UPDATE public.profiles
SET
  email_verified = true,
  bypass_2fa = true,
  two_factor_enabled = false,
  two_factor_secret = null,
  recovery_codes_hash = null,
  updated_at = now();
