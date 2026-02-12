import { Router, Request, Response } from "express";
import { z } from "zod";
import multer from "multer";
import { supabase } from "../config/supabase";
import { requireAuth, invalidateAuthCache } from "../middleware/auth";

const router = Router();

// Multer: armazena em memória (max 5MB — imagens são comprimidas no frontend)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = ["image/jpeg", "image/png", "image/webp", "image/gif"];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error("Tipo de arquivo não permitido. Use JPEG, PNG, WebP ou GIF."));
    }
  },
});

// Todas as rotas requerem autenticação
router.use(requireAuth);

// ══════════════════════════════════════════════════════════
// PREFERENCES
// ══════════════════════════════════════════════════════════

const preferencesSchema = z.object({
  primary_color: z.string().regex(/^#[0-9A-Fa-f]{6}$/, "Cor inválida").optional(),
  font_family: z.enum(["DM Sans", "Inter", "Poppins", "Nunito", "Source Sans 3"]).optional(),
  number_locale: z.enum(["pt-BR", "en-US", "es-ES"]).optional(),
  number_decimals: z.number().int().min(0).max(4).optional(),
  currency_symbol: z.string().min(1).max(5).optional(),
});

// ── GET /api/user/preferences ────────────────────────────
router.get("/preferences", async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;

    const { data, error } = await supabase
      .from("user_preferences")
      .select("*")
      .eq("user_id", userId)
      .single();

    if (error && error.code !== "PGRST116") {
      // PGRST116 = row not found (ok, return defaults)
      console.error("[User] Preferences fetch error:", error);
      res.status(500).json({ success: false, error: "Erro ao buscar preferências" });
      return;
    }

    // Retorna dados ou defaults
    const defaults = {
      primary_color: "#09CAFF",
      font_family: "DM Sans",
      number_locale: "pt-BR",
      number_decimals: 2,
      currency_symbol: "R$",
    };

    res.json({
      success: true,
      data: data ? {
        primary_color: data.primary_color,
        font_family: data.font_family,
        number_locale: data.number_locale,
        number_decimals: data.number_decimals,
        currency_symbol: data.currency_symbol,
      } : defaults,
    });
  } catch (err) {
    console.error("[User] Preferences error:", err);
    res.status(500).json({ success: false, error: "Erro interno" });
  }
});

// ── PUT /api/user/preferences ────────────────────────────
router.put("/preferences", async (req: Request, res: Response) => {
  try {
    const parsed = preferencesSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        success: false,
        error: "Dados inválidos",
        details: parsed.error.flatten().fieldErrors,
      });
      return;
    }

    const userId = req.user!.id;
    const updates = {
      ...parsed.data,
      updated_at: new Date().toISOString(),
    };

    // Upsert: insere se não existe, atualiza se existe
    const { data, error } = await supabase
      .from("user_preferences")
      .upsert({ user_id: userId, ...updates }, { onConflict: "user_id" })
      .select()
      .single();

    if (error) {
      console.error("[User] Preferences update error:", error);
      res.status(500).json({ success: false, error: "Erro ao salvar preferências" });
      return;
    }

    res.json({ success: true, data });
  } catch (err) {
    console.error("[User] Preferences update error:", err);
    res.status(500).json({ success: false, error: "Erro interno" });
  }
});

// ══════════════════════════════════════════════════════════
// PROFILE
// ══════════════════════════════════════════════════════════

const profileSchema = z.object({
  full_name: z.string().min(2, "Nome deve ter no mínimo 2 caracteres").max(100, "Nome muito longo"),
});

// ── PUT /api/user/profile ─────────────────────────────
router.put("/profile", async (req: Request, res: Response) => {
  try {
    const parsed = profileSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        success: false,
        error: "Dados inválidos",
        details: parsed.error.flatten().fieldErrors,
      });
      return;
    }

    const userId = req.user!.id;

    const { data, error } = await supabase
      .from("profiles")
      .update({
        full_name: parsed.data.full_name.trim(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", userId)
      .select("id, email, full_name, role")
      .single();

    if (error) {
      console.error("[User] Profile update error:", error);
      res.status(500).json({ success: false, error: "Erro ao atualizar perfil" });
      return;
    }

    // Invalida cache de auth para refletir mudança de nome
    const token = req.headers.authorization?.slice(7);
    invalidateAuthCache(token);

    res.json({ success: true, data });
  } catch (err) {
    console.error("[User] Profile update error:", err);
    res.status(500).json({ success: false, error: "Erro interno" });
  }
});

// ══════════════════════════════════════════════════════════
// AVATAR
// ══════════════════════════════════════════════════════════

// ── POST /api/user/avatar ────────────────────────────────
router.post("/avatar", upload.single("avatar"), async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const file = req.file;

    if (!file) {
      res.status(400).json({ success: false, error: "Nenhum arquivo enviado" });
      return;
    }

    const ext = file.mimetype.split("/")[1] === "jpeg" ? "jpg" : file.mimetype.split("/")[1];
    const filePath = `${userId}/avatar.${ext}`;

    // Remove avatar antigo (ignora erro se não existe)
    await supabase.storage.from("avatars").remove([`${userId}/avatar.jpg`, `${userId}/avatar.png`, `${userId}/avatar.webp`, `${userId}/avatar.gif`]);

    // Upload novo
    const { error: uploadError } = await supabase.storage
      .from("avatars")
      .upload(filePath, file.buffer, {
        contentType: file.mimetype,
        upsert: true,
      });

    if (uploadError) {
      console.error("[User] Avatar upload error:", uploadError);
      res.status(500).json({ success: false, error: "Erro ao enviar arquivo" });
      return;
    }

    // Gera URL pública
    const { data: { publicUrl } } = supabase.storage
      .from("avatars")
      .getPublicUrl(filePath);

    // Atualiza profiles.avatar_url
    const avatarUrl = `${publicUrl}?t=${Date.now()}`; // cache bust
    const { error: updateError } = await supabase
      .from("profiles")
      .update({ avatar_url: avatarUrl, updated_at: new Date().toISOString() })
      .eq("id", userId);

    if (updateError) {
      console.error("[User] Avatar profile update error:", updateError);
      res.status(500).json({ success: false, error: "Erro ao atualizar perfil" });
      return;
    }

    // Invalida cache de auth para refletir novo avatar
    const token = req.headers.authorization?.slice(7);
    invalidateAuthCache(token);

    res.json({ success: true, data: { avatar_url: avatarUrl } });
  } catch (err) {
    console.error("[User] Avatar error:", err);
    res.status(500).json({ success: false, error: "Erro interno" });
  }
});

// ── DELETE /api/user/avatar ──────────────────────────────
router.delete("/avatar", async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;

    // Remove todos os possíveis avatars
    await supabase.storage.from("avatars").remove([
      `${userId}/avatar.jpg`,
      `${userId}/avatar.png`,
      `${userId}/avatar.webp`,
      `${userId}/avatar.gif`,
    ]);

    // Limpa avatar_url no profile
    const { error } = await supabase
      .from("profiles")
      .update({ avatar_url: null, updated_at: new Date().toISOString() })
      .eq("id", userId);

    if (error) {
      console.error("[User] Avatar delete error:", error);
      res.status(500).json({ success: false, error: "Erro ao remover avatar" });
      return;
    }

    // Invalida cache de auth para refletir remoção do avatar
    const token = req.headers.authorization?.slice(7);
    invalidateAuthCache(token);

    res.json({ success: true, data: { avatar_url: null } });
  } catch (err) {
    console.error("[User] Avatar delete error:", err);
    res.status(500).json({ success: false, error: "Erro interno" });
  }
});

// ══════════════════════════════════════════════════════════
// CHANGE PASSWORD
// ══════════════════════════════════════════════════════════

const changePasswordSchema = z.object({
  current_password: z.string().min(1, "Senha atual obrigatória"),
  new_password: z.string().min(6, "Nova senha deve ter no mínimo 6 caracteres"),
  confirm_password: z.string().min(1, "Confirmação obrigatória"),
}).refine((data) => data.new_password === data.confirm_password, {
  message: "As senhas não coincidem",
  path: ["confirm_password"],
});

// ── POST /api/user/change-password ───────────────────────
router.post("/change-password", async (req: Request, res: Response) => {
  try {
    const parsed = changePasswordSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        success: false,
        error: "Dados inválidos",
        details: parsed.error.flatten().fieldErrors,
      });
      return;
    }

    const { current_password, new_password } = parsed.data;
    const userEmail = req.user!.email;

    // Valida senha atual tentando login
    const { error: loginError } = await supabase.auth.signInWithPassword({
      email: userEmail,
      password: current_password,
    });

    if (loginError) {
      res.status(400).json({ success: false, error: "Senha atual incorreta" });
      return;
    }

    // Atualiza senha via admin
    const { error: updateError } = await supabase.auth.admin.updateUserById(
      req.user!.id,
      { password: new_password },
    );

    if (updateError) {
      console.error("[User] Password change error:", updateError);
      res.status(500).json({ success: false, error: "Erro ao alterar senha" });
      return;
    }

    res.json({ success: true, data: { message: "Senha alterada com sucesso" } });
  } catch (err) {
    console.error("[User] Password change error:", err);
    res.status(500).json({ success: false, error: "Erro interno" });
  }
});

export default router;
