import { Router, Request, Response } from "express";
import { z } from "zod";
import { supabase } from "../config/supabase";
import { requireAuth } from "../middleware/auth";

const router = Router();

// ── POST /api/auth/login ────────────────────────────────
const loginSchema = z.object({
  email: z.string().email("Email inválido"),
  password: z.string().min(1, "Senha obrigatória"),
});

router.post("/login", async (req: Request, res: Response) => {
  try {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        success: false,
        error: "Dados inválidos",
        details: parsed.error.flatten().fieldErrors,
      });
      return;
    }

    const { email, password } = parsed.data;

    // Sign in with Supabase Auth
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error || !data.user || !data.session) {
      res.status(401).json({
        success: false,
        error: error?.message === "Invalid login credentials"
          ? "Email ou senha incorretos"
          : error?.message || "Erro ao fazer login",
      });
      return;
    }

    // Fetch profile
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("id, email, full_name, role, tenant_id, is_active")
      .eq("id", data.user.id)
      .single();

    if (profileError || !profile) {
      res.status(403).json({ success: false, error: "Perfil não encontrado" });
      return;
    }

    if (!profile.is_active) {
      res.status(403).json({ success: false, error: "Conta desativada" });
      return;
    }

    // Fetch tenant name if user has one
    let tenant_name: string | null = null;
    if (profile.tenant_id) {
      const { data: tenant } = await supabase
        .from("tenants")
        .select("name")
        .eq("id", profile.tenant_id)
        .single();
      tenant_name = tenant?.name || null;
    }

    res.json({
      success: true,
      data: {
        access_token: data.session.access_token,
        refresh_token: data.session.refresh_token,
        expires_at: data.session.expires_at,
        user: {
          id: profile.id,
          email: profile.email,
          full_name: profile.full_name,
          role: profile.role,
          tenant_id: profile.tenant_id,
          tenant_name,
        },
      },
    });
  } catch (error) {
    console.error("[Auth] Login error:", error);
    res.status(500).json({ success: false, error: "Erro interno" });
  }
});

// ── POST /api/auth/refresh ──────────────────────────────
router.post("/refresh", async (req: Request, res: Response) => {
  try {
    const { refresh_token } = req.body;
    if (!refresh_token) {
      res.status(400).json({ success: false, error: "refresh_token obrigatório" });
      return;
    }

    const { data, error } = await supabase.auth.refreshSession({ refresh_token });

    if (error || !data.session) {
      res.status(401).json({ success: false, error: "Sessão expirada. Faça login novamente." });
      return;
    }

    res.json({
      success: true,
      data: {
        access_token: data.session.access_token,
        refresh_token: data.session.refresh_token,
        expires_at: data.session.expires_at,
      },
    });
  } catch (error) {
    console.error("[Auth] Refresh error:", error);
    res.status(500).json({ success: false, error: "Erro interno" });
  }
});

// ── GET /api/auth/me ────────────────────────────────────
router.get("/me", requireAuth, async (req: Request, res: Response) => {
  try {
    const user = req.user!;

    let tenant_name: string | null = null;
    if (user.tenant_id) {
      const { data: tenant } = await supabase
        .from("tenants")
        .select("name")
        .eq("id", user.tenant_id)
        .single();
      tenant_name = tenant?.name || null;
    }

    res.json({
      success: true,
      data: {
        id: user.id,
        email: user.email,
        full_name: user.full_name,
        role: user.role,
        tenant_id: user.tenant_id,
        tenant_name,
      },
    });
  } catch (error) {
    console.error("[Auth] Me error:", error);
    res.status(500).json({ success: false, error: "Erro interno" });
  }
});

export default router;
