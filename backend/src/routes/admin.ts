import { Router, Request, Response } from "express";
import { z } from "zod";
import { supabase } from "../config/supabase";
import { requireAuth, requireMaster } from "../middleware/auth";

const router = Router();

// All admin routes require auth + master role
router.use(requireAuth, requireMaster);

// ══════════════════════════════════════════════════════════
// TENANTS CRUD
// ══════════════════════════════════════════════════════════

// ── GET /api/admin/tenants ──────────────────────────────
router.get("/tenants", async (_req: Request, res: Response) => {
  try {
    const { data, error } = await supabase
      .from("tenants")
      .select("id, name, created_at")
      .order("name");

    console.log(`[Admin] GET /tenants - Found ${data?.length || 0} tenants`);
    if (error) throw error;

    // Count users per tenant
    const { data: profiles } = await supabase
      .from("profiles")
      .select("tenant_id");

    const userCounts: Record<string, number> = {};
    (profiles || []).forEach((p) => {
      if (p.tenant_id) {
        userCounts[p.tenant_id] = (userCounts[p.tenant_id] || 0) + 1;
      }
    });

    const tenants = (data || []).map((t) => ({
      ...t,
      user_count: userCounts[t.id] || 0,
    }));

    res.json({ success: true, data: tenants });
  } catch (error) {
    console.error("[Admin] List tenants error:", error);
    res.status(500).json({ success: false, error: "Erro ao listar empresas" });
  }
});

// ── POST /api/admin/tenants ─────────────────────────────
const createTenantSchema = z.object({
  name: z.string().min(2, "Nome mínimo 2 caracteres").max(100),
});

router.post("/tenants", async (req: Request, res: Response) => {
  try {
    const parsed = createTenantSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ success: false, error: "Dados inválidos", details: parsed.error.flatten().fieldErrors });
      return;
    }

    const { data, error } = await supabase
      .from("tenants")
      .insert({ name: parsed.data.name })
      .select()
      .single();

    if (error) {
      res.status(400).json({ success: false, error: error.message });
      return;
    }

    res.status(201).json({ success: true, data });
  } catch (error) {
    console.error("[Admin] Create tenant error:", error);
    res.status(500).json({ success: false, error: "Erro ao criar empresa" });
  }
});

// ── PUT /api/admin/tenants/:id ──────────────────────────
router.put("/tenants/:id", async (req: Request, res: Response) => {
  try {
    const parsed = createTenantSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ success: false, error: "Dados inválidos" });
      return;
    }

    const { data, error } = await supabase
      .from("tenants")
      .update({ name: parsed.data.name })
      .eq("id", req.params.id)
      .select()
      .single();

    if (error) {
      res.status(400).json({ success: false, error: error.message });
      return;
    }

    res.json({ success: true, data });
  } catch (error) {
    console.error("[Admin] Update tenant error:", error);
    res.status(500).json({ success: false, error: "Erro ao atualizar empresa" });
  }
});

// ── DELETE /api/admin/tenants/:id ───────────────────────
router.delete("/tenants/:id", async (req: Request, res: Response) => {
  try {
    // Check if tenant has users
    const { data: users } = await supabase
      .from("profiles")
      .select("id")
      .eq("tenant_id", req.params.id)
      .limit(1);

    if (users && users.length > 0) {
      res.status(400).json({ success: false, error: "Remova os usuários da empresa antes de excluí-la" });
      return;
    }

    const { error } = await supabase
      .from("tenants")
      .delete()
      .eq("id", req.params.id);

    if (error) {
      res.status(400).json({ success: false, error: error.message });
      return;
    }

    res.json({ success: true });
  } catch (error) {
    console.error("[Admin] Delete tenant error:", error);
    res.status(500).json({ success: false, error: "Erro ao excluir empresa" });
  }
});

// ══════════════════════════════════════════════════════════
// USERS CRUD
// ══════════════════════════════════════════════════════════

// ── GET /api/admin/users ────────────────────────────────
router.get("/users", async (req: Request, res: Response) => {
  try {
    let query = supabase
      .from("profiles")
      .select("id, email, full_name, role, tenant_id, is_active, created_at")
      .order("created_at", { ascending: false });

    // Optional filter by tenant
    const tenantId = req.query.tenant_id as string;
    if (tenantId) {
      query = query.eq("tenant_id", tenantId);
    }

    const { data, error } = await query;
    console.log(`[Admin] GET /users - Query result size: ${data?.length || 0}`);
    if (error) throw error;

    // Fetch tenant names
    const { data: tenants } = await supabase.from("tenants").select("id, name");
    const tenantMap: Record<string, string> = {};
    (tenants || []).forEach((t) => { tenantMap[t.id] = t.name; });

    const users = (data || []).map((u) => ({
      ...u,
      tenant_name: u.tenant_id ? tenantMap[u.tenant_id] || "—" : "—",
    }));

    res.json({ success: true, data: users });
  } catch (error) {
    console.error("[Admin] List users error:", error);
    res.status(500).json({ success: false, error: "Erro ao listar usuários" });
  }
});

// ── POST /api/admin/users ───────────────────────────────
const createUserSchema = z.object({
  email: z.string().email("Email inválido"),
  password: z.string().min(6, "Senha mínima 6 caracteres"),
  full_name: z.string().min(2, "Nome obrigatório"),
  role: z.enum(["master", "user"]).default("user"),
  tenant_id: z.string().uuid("Empresa inválida").nullable(),
});

router.post("/users", async (req: Request, res: Response) => {
  try {
    const parsed = createUserSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ success: false, error: "Dados inválidos", details: parsed.error.flatten().fieldErrors });
      return;
    }

    const { email, password, full_name, role, tenant_id } = parsed.data;

    // Validate tenant exists if provided
    if (tenant_id) {
      const { data: tenant } = await supabase.from("tenants").select("id").eq("id", tenant_id).single();
      if (!tenant) {
        res.status(400).json({ success: false, error: "Empresa não encontrada" });
        return;
      }
    }

    // Create user in Supabase Auth (no email verification)
    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true, // Auto-confirm, no verification email
      user_metadata: {
        full_name,
        role,
        tenant_id,
      },
    });

    if (authError) {
      const msg = authError.message.includes("already been registered")
        ? "Email já cadastrado"
        : authError.message;
      res.status(400).json({ success: false, error: msg });
      return;
    }

    // The trigger handle_new_user creates the profile automatically
    // But we ensure it's there
    const { data: profile } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", authData.user.id)
      .single();

    res.status(201).json({
      success: true,
      data: profile || { id: authData.user.id, email, full_name, role, tenant_id },
    });
  } catch (error) {
    console.error("[Admin] Create user error:", error);
    res.status(500).json({ success: false, error: "Erro ao criar usuário" });
  }
});

// ── PUT /api/admin/users/:id ────────────────────────────
const updateUserSchema = z.object({
  full_name: z.string().min(2).optional(),
  role: z.enum(["master", "user"]).optional(),
  tenant_id: z.string().uuid().nullable().optional(),
  is_active: z.boolean().optional(),
});

router.put("/users/:id", async (req: Request, res: Response) => {
  try {
    const parsed = updateUserSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ success: false, error: "Dados inválidos" });
      return;
    }

    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (parsed.data.full_name !== undefined) updates.full_name = parsed.data.full_name;
    if (parsed.data.role !== undefined) updates.role = parsed.data.role;
    if (parsed.data.tenant_id !== undefined) updates.tenant_id = parsed.data.tenant_id;
    if (parsed.data.is_active !== undefined) updates.is_active = parsed.data.is_active;

    const { data, error } = await supabase
      .from("profiles")
      .update(updates)
      .eq("id", req.params.id)
      .select()
      .single();

    if (error) {
      res.status(400).json({ success: false, error: error.message });
      return;
    }

    // Update auth metadata too to keep it in sync
    await supabase.auth.admin.updateUserById(req.params.id, {
      user_metadata: {
        full_name: parsed.data.full_name,
        role: parsed.data.role,
        tenant_id: parsed.data.tenant_id,
      },
    });

    res.json({ success: true, data });
  } catch (error) {
    console.error("[Admin] Update user error:", error);
    res.status(500).json({ success: false, error: "Erro ao atualizar usuário" });
  }
});

// ── DELETE /api/admin/users/:id ─────────────────────────
router.delete("/users/:id", async (req: Request, res: Response) => {
  try {
    const userId = req.params.id;

    // Prevent self-deletion
    if (userId === req.user!.id) {
      res.status(400).json({ success: false, error: "Você não pode excluir sua própria conta" });
      return;
    }

    // Delete from Supabase Auth (cascade deletes profile via FK)
    const { error } = await supabase.auth.admin.deleteUser(userId);

    if (error) {
      res.status(400).json({ success: false, error: error.message });
      return;
    }

    res.json({ success: true });
  } catch (error) {
    console.error("[Admin] Delete user error:", error);
    res.status(500).json({ success: false, error: "Erro ao excluir usuário" });
  }
});

// ── POST /api/admin/users/:id/reset-password ────────────
const resetPasswordSchema = z.object({
  password: z.string().min(6, "Senha mínima 6 caracteres"),
});

router.post("/users/:id/reset-password", async (req: Request, res: Response) => {
  try {
    const parsed = resetPasswordSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ success: false, error: "Senha inválida" });
      return;
    }

    const { error } = await supabase.auth.admin.updateUserById(req.params.id, {
      password: parsed.data.password,
    });

    if (error) {
      res.status(400).json({ success: false, error: error.message });
      return;
    }

    res.json({ success: true });
  } catch (error) {
    console.error("[Admin] Reset password error:", error);
    res.status(500).json({ success: false, error: "Erro ao resetar senha" });
  }
});

export default router;
