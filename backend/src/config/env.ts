import { z } from "zod";
import dotenv from "dotenv";

dotenv.config();

const booleanFromEnv = z.preprocess((value) => {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["true", "1", "yes", "y", "on"].includes(normalized)) return true;
    if (["false", "0", "no", "n", "off"].includes(normalized)) return false;
  }
  return value;
}, z.boolean());

const envSchema = z.object({
  // Supabase
  SUPABASE_URL: z.string().url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),

  // Gemini
  GEMINI_API_KEY: z.string().min(1),

  // Server
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  PORT: z.coerce.number().default(3001),
  FRONTEND_URL: z.string().url().default("http://localhost:5173"),
  ALLOWED_ORIGINS: z.string().default("http://localhost:5173"),
  APP_BASE_URL: z.string().url().default("http://localhost:5173"),

  // Security
  AUTH_SECURITY_SECRET: z.string().min(32),
  AUTH_2FA_CODE_TTL_MINUTES: z.coerce.number().int().min(1).max(30).default(10),
  AUTH_2FA_MAX_ATTEMPTS: z.coerce.number().int().min(1).max(10).default(5),
  PASSWORD_RESET_TOKEN_TTL_MINUTES: z.coerce.number().int().min(5).max(180).default(60),
  EMAIL_VERIFICATION_TOKEN_TTL_HOURS: z.coerce.number().int().min(1).max(168).default(24),

  // Redis
  REDIS_URL: z.string().url().default("redis://localhost:6379"),
  REDIS_PASSWORD: z.string().optional(),
  BULLMQ_PREFIX: z.string().default("ambro"),
  WHITELIST_IPS: z.string().default(""), // Comma separated IPs

  // SMTP / Mail
  SMTP_HOST: z.string().min(1).default("smtp.gmail.com"),
  SMTP_PORT: z.coerce.number().int().positive().default(587),
  SMTP_SECURE: booleanFromEnv.default(false),
  SMTP_USER: z.string().email("SMTP_USER deve ser um email válido"),
  SMTP_PASS: z.string().min(1),
  SMTP_FROM: z.string().min(1),
  ACCESS_REQUEST_NOTIFY_EMAIL: z.string().email("ACCESS_REQUEST_NOTIFY_EMAIL deve ser um email válido"),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error("❌ Variáveis de ambiente inválidas:");
  console.error(parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;
