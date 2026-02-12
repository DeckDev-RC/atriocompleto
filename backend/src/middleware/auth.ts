import { Request, Response, NextFunction } from "express";
import { supabase } from "../config/supabase";

/**
 * User info attached to req after auth middleware.
 */
export interface AuthUser {
  id: string;          // Supabase auth user id
  email: string;
  role: "master" | "user";
  tenant_id: string | null;
  full_name: string;
  avatar_url: string | null;
}

// Extend Express Request
declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

// ── In-memory auth cache (TTL 30s) ─────────────────────
interface CacheEntry {
  user: AuthUser;
  expiresAt: number;
}

const AUTH_CACHE_TTL_MS = 30_000; // 30 seconds
const authCache = new Map<string, CacheEntry>();

/** Remove expired entries periodically (every 60s) to prevent unbounded growth */
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of authCache) {
    if (now >= entry.expiresAt) authCache.delete(key);
  }
}, 60_000);

/** Invalidate cache for a specific user (call after profile updates) */
export function invalidateAuthCache(token?: string) {
  if (token) {
    authCache.delete(token);
  } else {
    authCache.clear();
  }
}

/**
 * Middleware: validates Supabase JWT token and loads profile.
 * Uses in-memory cache to avoid 2 remote DB calls per request.
 * Expects: Authorization: Bearer <supabase_access_token>
 */
export async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    res.status(401).json({ success: false, error: "Token não fornecido" });
    return;
  }

  const token = authHeader.slice(7);

  // ── Check cache first ────────────────────────────
  const cached = authCache.get(token);
  if (cached && Date.now() < cached.expiresAt) {
    req.user = cached.user;
    return next();
  }

  try {
    // Validate token with Supabase
    const { data: { user }, error } = await supabase.auth.getUser(token);

    if (error || !user) {
      authCache.delete(token);
      res.status(401).json({ success: false, error: "Token inválido ou expirado" });
      return;
    }

    // Fetch profile with tenant info
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("id, email, full_name, role, tenant_id, is_active, avatar_url")
      .eq("id", user.id)
      .single();

    if (profileError || !profile) {
      res.status(403).json({ success: false, error: "Perfil não encontrado. Contate o administrador." });
      return;
    }

    if (!profile.is_active) {
      res.status(403).json({ success: false, error: "Conta desativada. Contate o administrador." });
      return;
    }

    const authUser: AuthUser = {
      id: profile.id,
      email: profile.email,
      role: profile.role as "master" | "user",
      tenant_id: profile.tenant_id,
      full_name: profile.full_name,
      avatar_url: profile.avatar_url || null,
    };

    // ── Populate cache ──────────────────────────────
    authCache.set(token, {
      user: authUser,
      expiresAt: Date.now() + AUTH_CACHE_TTL_MS,
    });

    req.user = authUser;
    next();
  } catch (err) {
    console.error("[Auth] Error:", err);
    res.status(500).json({ success: false, error: "Erro de autenticação" });
  }
}

/**
 * Middleware: requires master role.
 * Must be used AFTER requireAuth.
 */
export function requireMaster(req: Request, res: Response, next: NextFunction): void {
  if (!req.user || req.user.role !== "master") {
    res.status(403).json({ success: false, error: "Acesso restrito ao administrador" });
    return;
  }
  next();
}
