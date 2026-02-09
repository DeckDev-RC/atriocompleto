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
}

// Extend Express Request
declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

/**
 * Middleware: validates Supabase JWT token and loads profile.
 * Expects: Authorization: Bearer <supabase_access_token>
 */
export async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    res.status(401).json({ success: false, error: "Token não fornecido" });
    return;
  }

  const token = authHeader.slice(7);

  try {
    // Validate token with Supabase
    const { data: { user }, error } = await supabase.auth.getUser(token);

    if (error || !user) {
      res.status(401).json({ success: false, error: "Token inválido ou expirado" });
      return;
    }

    // Fetch profile with tenant info
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("id, email, full_name, role, tenant_id, is_active")
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

    req.user = {
      id: profile.id,
      email: profile.email,
      role: profile.role as "master" | "user",
      tenant_id: profile.tenant_id,
      full_name: profile.full_name,
    };

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
