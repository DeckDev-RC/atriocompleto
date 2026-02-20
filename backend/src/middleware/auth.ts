import { Request, Response, NextFunction } from "express";
import { supabase, supabaseAdmin } from "../config/supabase";
import { AccessControlService } from "../services/access-control";
import { redis } from "../config/redis";

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
  permissions: Record<string, any>; // Granular permissions
  two_factor_enabled: boolean;
}

// Extend Express Request
declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

// ── Redis auth cache (TTL 5min) ─────────────────────────
const AUTH_CACHE_TTL_S = 300; // 5 minutes
const AUTH_CACHE_PREFIX = "auth:user:";
const SESSION_SET_PREFIX = "auth:sessions:";

/** Invalidate cache for a specific user or token */
export async function invalidateAuthCache(identifier?: string) {
  try {
    if (!identifier) {
      // Clear all auth cache entries
      const keys = await redis.keys(`${AUTH_CACHE_PREFIX}*`);
      if (keys.length > 0) await redis.del(...keys);
      const sessionKeys = await redis.keys(`${SESSION_SET_PREFIX}*`);
      if (sessionKeys.length > 0) await redis.del(...sessionKeys);
      return;
    }

    // If it's a UUID (userId), invalidate all tokens for that user
    const isUserId = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(identifier);

    if (isUserId) {
      const sessionKey = `${SESSION_SET_PREFIX}${identifier}`;
      const tokens = await redis.smembers(sessionKey);
      if (tokens.length > 0) {
        const cacheKeys = tokens.map(t => `${AUTH_CACHE_PREFIX}${t}`);
        await redis.del(...cacheKeys);
        await redis.del(sessionKey);
      }
    } else {
      // Treat as token
      await redis.del(`${AUTH_CACHE_PREFIX}${identifier}`);
    }
  } catch (err) {
    console.error(`[Auth] Redis cache invalidation error: ${err}`);
  }
}

/**
 * Middleware: validates Supabase JWT token and loads profile.
 * Uses Redis cache (5min TTL) to avoid 2 remote DB calls per request.
 * Expects: Authorization: Bearer <supabase_access_token>
 */
export async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  let token = "";
  const authHeader = req.headers.authorization;

  if (authHeader?.startsWith("Bearer ")) {
    token = authHeader.slice(7);
  } else if (req.query.token) {
    token = req.query.token as string;
  }

  if (!token) {
    res.status(401).json({ success: false, error: "Token não fornecido" });
    return;
  }

  // ── Check Redis cache first ───────────────────────
  try {
    const cached = await redis.get(`${AUTH_CACHE_PREFIX}${token}`);
    if (cached) {
      req.user = JSON.parse(cached) as AuthUser;
      return next();
    }
  } catch (err) {
    console.error(`[Auth] Redis cache read error: ${err}`);
  }

  try {
    const start = Date.now();
    // Validate token with Supabase
    const { data: { user }, error } = await supabase.auth.getUser(token);

    if (error || !user) {
      void redis.del(`${AUTH_CACHE_PREFIX}${token}`).catch(() => { });
      res.status(401).json({ success: false, error: "Token inválido ou expirado" });
      return;
    }
    const authTime = Date.now() - start;

    // Fetch profile with tenant info
    const profileStart = Date.now();
    let { data: profile, error: profileError } = await supabaseAdmin
      .from("profiles")
      .select("id, email, full_name, role, tenant_id, is_active, avatar_url, permissions, two_factor_enabled")
      .eq("id", user.id)
      .single();

    // Retry once after 500ms if profile not found (to handle transient issues or race conditions)
    if (profileError || !profile) {
      console.warn(`[Auth] Profile fetch failed for ${user.id}, retrying once...`);
      await new Promise(resolve => setTimeout(resolve, 500));
      const retry = await supabaseAdmin
        .from("profiles")
        .select("id, email, full_name, role, tenant_id, is_active, avatar_url, permissions, two_factor_enabled")
        .eq("id", user.id)
        .single();
      profile = retry.data;
      profileError = retry.error;
    }

    if (profileError || !profile) {
      res.status(403).json({ success: false, error: "Perfil não encontrado. Contate o administrador." });
      return;
    }
    const profileTime = Date.now() - profileStart;

    if (!profile.is_active) {
      res.status(403).json({ success: false, error: "Conta desativada. Contate o administrador." });
      return;
    }

    // 3. Always fetch real-time RBAC permissions from DB (source of truth)
    const rbacStart = Date.now();
    const rbacPermissions = await AccessControlService.getUserPermissions(profile.id);
    const rbacTime = Date.now() - rbacStart;

    const finalPermissions = {
      ...(profile.permissions || {}),
      ...rbacPermissions,
    };


    const authUser: AuthUser = {
      id: profile.id,
      email: profile.email,
      role: profile.role as "master" | "user",
      tenant_id: profile.tenant_id,
      full_name: profile.full_name,
      avatar_url: profile.avatar_url || null,
      permissions: finalPermissions,
      two_factor_enabled: profile.two_factor_enabled || false,
    };

    // ── Populate Redis cache ────────────────────────
    try {
      await redis.set(
        `${AUTH_CACHE_PREFIX}${token}`,
        JSON.stringify(authUser),
        "EX",
        AUTH_CACHE_TTL_S
      );
      // Track this token for the user
      const sessionKey = `${SESSION_SET_PREFIX}${authUser.id}`;
      await redis.sadd(sessionKey, token);
      await redis.expire(sessionKey, AUTH_CACHE_TTL_S + 60); // slightly longer than token cache
    } catch (err) {
      console.error("[Auth] Redis cache write error:", err);
    }

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
