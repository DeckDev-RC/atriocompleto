import { Router, Request, Response } from "express";
import { z } from "zod";
import { supabase, supabaseAdmin } from "../config/supabase";
import { requireAuth, invalidateAuthCache } from "../middleware/auth";
import { env } from "../config/env";
import {
  sendAccessRequestNotification,
  sendAccessRequestReceivedEmail,
  sendPasswordResetEmail,
} from "../services/email";
import { strongPasswordSchema } from "../utils/password";
import {
  generateNumericCode,
  generateOpaqueToken,
  hashSecurityValue,
} from "../utils/security";
import { AuthVerificationService } from "../services/verification";
import { TOTPService } from "../utils/totp";
import { AuditService } from "../services/audit";
import { AccessControlService } from "../services/access-control";
import { authLimiter, registerLimiter, publicApiLimiter } from "../middleware/rate-limit";
import {
  assertPublicSignupEnabled,
  getPublicSignupPublicView,
} from "../services/publicSignup";
import { buildDisabledTenantFeatures, generateUniqueTenantCode } from "../services/tenantIdentity";
import {
  hasAnyExplicitFeatureFlag,
  normalizeExplicitFeatureFlags,
} from "../constants/feature-flags";
import { normalizeManageableTenantIds } from "../utils/tenant-access";
import { normalizeHost } from "../services/partners";
import { resolveFrontendBaseUrl } from "../services/frontend-url";
import {
  buildResolvedBranding,
  getManagedPartnerIds,
  getPartnerByHost,
  getPartnerById,
  getPartnerBySlug,
  getRequestHost,
  getTenantPartnerId,
} from "../services/partners";


const router = Router();

interface ProfileRow {
  id: string;
  email: string;
  full_name: string;
  role: "master" | "user";
  tenant_id: string | null;
  partner_id: string | null;
  is_active: boolean;
  avatar_url: string | null;
  email_verified: boolean;
  permissions: Record<string, any>;
  manageable_features: Record<string, boolean>;
  manageable_tenant_ids: string[];
  two_factor_enabled: boolean;
  two_factor_secret: string | null;
  recovery_codes_hash: string[] | null;
  bypass_2fa: boolean;
  needs_tenant_setup: boolean;
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

async function getProfile(userId: string): Promise<ProfileRow | null> {
  const { data, error } = await supabaseAdmin
    .from("profiles")
    .select("id, email, full_name, role, tenant_id, partner_id, is_active, avatar_url, email_verified, permissions, manageable_features, manageable_tenant_ids, two_factor_enabled, two_factor_secret, recovery_codes_hash, bypass_2fa, needs_tenant_setup")
    .eq("id", userId)
    .single();

  if (error || !data) {
    return null;
  }

  return data as ProfileRow;
}

async function waitForProfile(userId: string, retries = 4): Promise<ProfileRow | null> {
  for (let attempt = 0; attempt < retries; attempt += 1) {
    const profile = await getProfile(userId);
    if (profile) return profile;

    if (attempt < retries - 1) {
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }

  return null;
}

async function getTenantName(tenantId: string | null): Promise<string | null> {
  if (!tenantId) return null;
  const { data } = await supabaseAdmin
    .from("tenants")
    .select("name")
    .eq("id", tenantId)
    .single();
  return data?.name || null;
}

async function getTenantFeatures(tenantId: string | null): Promise<Record<string, boolean>> {
  if (!tenantId) return {};
  const { data } = await supabaseAdmin
    .from("tenants")
    .select("enabled_features")
    .eq("id", tenantId)
    .single();
  return data?.enabled_features || {};
}

async function resolvePartnerForProfile(profile: Pick<ProfileRow, "partner_id" | "tenant_id">) {
  const tenantPartnerId = await getTenantPartnerId(profile.tenant_id);
  return getPartnerById(tenantPartnerId || profile.partner_id);
}

async function buildAuthUserPayload(profile: ProfileRow) {
  const [tenant_name, enabled_features, rbacPermissions, managedPartnerIds, resolvedPartner] = await Promise.all([
    getTenantName(profile.tenant_id),
    getTenantFeatures(profile.tenant_id),
    AccessControlService.getUserPermissions(profile.id),
    getManagedPartnerIds(profile.id),
    resolvePartnerForProfile(profile),
  ]);
  const manageableFeatures = normalizeExplicitFeatureFlags(profile.manageable_features);
  const manageableTenantIds = normalizeManageableTenantIds(profile.manageable_tenant_ids);
  const resolvedBranding = buildResolvedBranding(resolvedPartner);
  const defaultResolvedHost = normalizeHost(env.FRONTEND_URL);
  const permissions = {
    ...(profile.permissions || {}),
    ...rbacPermissions,
  };

  if (hasAnyExplicitFeatureFlag(manageableFeatures)) {
    permissions.gerenciar_feature_flags = true;
  }

  return {
    id: profile.id,
    email: profile.email,
    full_name: profile.full_name,
    role: profile.role,
    tenant_id: profile.tenant_id,
    partner_id: profile.partner_id,
    tenant_name,
    avatar_url: profile.avatar_url || null,
    permissions,
    enabled_features,
    manageable_features: manageableFeatures,
    manageable_tenant_ids: manageableTenantIds,
    managed_partner_ids: managedPartnerIds,
    resolved_branding: {
      ...resolvedBranding,
      resolved_host: resolvedBranding.resolved_host || defaultResolvedHost,
    },
    resolved_host: resolvedBranding.resolved_host || defaultResolvedHost,
    two_factor_enabled: false,
    needs_tenant_setup: profile.needs_tenant_setup,
  };
}

async function assignAllSystemRoles(profileId: string) {
  const { data: roles, error: rolesError } = await supabaseAdmin
    .from("roles")
    .select("id")
    .eq("is_system", true);

  if (rolesError) {
    throw rolesError;
  }

  if (!roles || roles.length === 0) {
    return;
  }

  await supabaseAdmin
    .from("user_roles")
    .upsert(
      roles.map((role) => ({
        profile_id: profileId,
        role_id: role.id,
      })),
      { onConflict: "profile_id,role_id" },
    );
}

async function resolveRequestedPartner(req: Request, explicitSlug?: string | null) {
  if (explicitSlug) {
    const bySlug = await getPartnerBySlug(explicitSlug);
    if (bySlug) return bySlug;
  }

  const requestHost = getRequestHost(req);
  return getPartnerByHost(requestHost);
}

function isLocalDevelopmentHost(host: string | null) {
  if (!host) return false;
  return ["localhost", "127.0.0.1"].includes(host) || host.endsWith(".local");
}

async function resolveValidatedPublicSignupPartner(req: Request, explicitSlug?: string | null) {
  const requestHost = getRequestHost(req);
  const hostPartner = await getPartnerByHost(requestHost);
  const slugPartner = explicitSlug ? await getPartnerBySlug(explicitSlug) : null;

  if (hostPartner) {
    if (!explicitSlug?.trim()) {
      return {
        ok: false as const,
        status: 400,
        error: "Cadastro incompleto: identificador da marca nao informado para este endereco.",
      };
    }

    if (!slugPartner || slugPartner.id !== hostPartner.id) {
      return {
        ok: false as const,
        status: 400,
        error: "Cadastro invalido: o endereco acessado nao corresponde a marca informada.",
      };
    }

    return {
      ok: true as const,
      partner: hostPartner,
    };
  }

  if (slugPartner && !isLocalDevelopmentHost(requestHost)) {
    return {
      ok: false as const,
      status: 400,
      error: "Cadastro invalido: utilize o endereco oficial da marca para criar esta conta.",
    };
  }

  return {
    ok: true as const,
    partner: slugPartner,
  };
}

const loginSchema = z.object({
  email: z.string().email("Email inválido"),
  password: z.string().min(1, "Senha obrigatória"),
});

router.post("/login", authLimiter, async (req: Request, res: Response) => {
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

    const email = normalizeEmail(parsed.data.email);
    const { password } = parsed.data;

    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error || !data.user || !data.session) {
      console.error("[Auth] signInWithPassword error details:", error);
      res.status(401).json({
        success: false,
        error: error?.message === "Invalid login credentials"
          ? "Email ou senha incorretos"
          : error?.message || "Erro ao fazer login",
      });
      return;
    }

    const requestedPartner = await resolveRequestedPartner(req);
    const profile = await getProfile(data.user.id);
    if (!profile) {
      res.status(403).json({ success: false, error: "Perfil não encontrado" });
      return;
    }

    if (!profile.is_active) {
      res.status(403).json({ success: false, error: "Conta desativada" });
      return;
    }

    let effectiveProfile = profile;
    if (
      !profile.partner_id
      && !profile.tenant_id
      && profile.needs_tenant_setup
      && requestedPartner?.id
    ) {
      const { error: partnerRepairError } = await supabaseAdmin
        .from("profiles")
        .update({
          partner_id: requestedPartner.id,
          updated_at: new Date().toISOString(),
        })
        .eq("id", profile.id);

      if (partnerRepairError) {
        console.error("[Auth] login partner repair error:", partnerRepairError);
      } else {
        effectiveProfile = {
          ...profile,
          partner_id: requestedPartner.id,
        };

        try {
          await assignAllSystemRoles(profile.id);
        } catch (roleRepairError) {
          console.error("[Auth] login role repair error:", roleRepairError);
        }
      }
    }

    // Verificação de email e 2FA estão desabilitados globalmente.
    await supabaseAdmin
      .from("profiles")
      .update({
        email_verified: true,
        bypass_2fa: true,
        two_factor_enabled: false,
        two_factor_secret: null,
        recovery_codes_hash: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", profile.id);

    await supabaseAdmin
      .from("auth_login_challenges")
      .delete()
      .eq("user_id", profile.id);

    const userPayload = await buildAuthUserPayload({
      ...effectiveProfile,
      email_verified: true,
      bypass_2fa: true,
      two_factor_enabled: false,
      two_factor_secret: null,
      recovery_codes_hash: null,
    });

    const expiresAt = data.session.expires_at
      ? Math.floor(new Date(data.session.expires_at * 1000).getTime() / 1000)
      : null;

    res.json({
      success: true,
      data: {
        access_token: data.session.access_token,
        refresh_token: data.session.refresh_token,
        expires_at: expiresAt,
        user: userPayload,
      },
    });

    void AuditService.log({
      userId: profile.id,
      action: "user.login",
      resource: "auth",
      entityId: profile.id,
      ipAddress: req.auditInfo?.ip,
      userAgent: req.auditInfo?.userAgent,
      tenantId: profile.tenant_id || undefined,
      details: { message: "Login realizado" },
    });
    return;

    /*
    // Auto-verify email on first login
    if (!profile.email_verified) {
      await supabaseAdmin
        .from("profiles")
        .update({ email_verified: true })
        .eq("id", profile.id);
    }

    if (profile.bypass_2fa) {
      const userPayload = await buildAuthUserPayload(profile);

      const expiresAt = data.session.expires_at
        ? Math.floor(new Date(data.session.expires_at * 1000).getTime() / 1000)
        : null;

      res.json({
        success: true,
        data: {
          access_token: data.session.access_token,
          refresh_token: data.session.refresh_token,
          expires_at: expiresAt,
          user: userPayload,
        },
      });

      void AuditService.log({
        userId: profile.id,
        action: "user.login",
        resource: "auth",
        entityId: profile.id,
        ipAddress: req.auditInfo?.ip,
        userAgent: req.auditInfo?.userAgent,
        tenantId: profile.tenant_id || undefined,
        details: { message: "Login realizado (Bypass 2FA)" },
      });
      return;
    }

    // Se o usuário tem TOTP habilitado, interrompemos aqui para pedir o código TOTP
    if (profile.two_factor_enabled && profile.two_factor_secret) {
      const challengeId = generateOpaqueToken(16);
      const expiresAt = new Date(Date.now() + env.AUTH_2FA_CODE_TTL_MINUTES * 60 * 1000);

      const sessionExpiresAt = data.session.expires_at
        ? new Date(data.session.expires_at * 1000).toISOString()
        : null;

      const { data: challenge, error: challengeError } = await supabaseAdmin
        .from("auth_login_challenges")
        .insert({
          id: challengeId,
          user_id: profile.id,
          email: profile.email,
          code_hash: "TOTP_PENDING", // Flag indicando que é TOTP e não email
          attempts: 0,
          max_attempts: env.AUTH_2FA_MAX_ATTEMPTS,
          access_token: data.session.access_token,
          refresh_token: data.session.refresh_token,
          session_expires_at: sessionExpiresAt,
          expires_at: expiresAt.toISOString(),
        })
        .select("id, expires_at")
        .single();

      if (challengeError || !challenge) {
        res.status(500).json({ success: false, error: "Erro ao iniciar verificação TOTP" });
        return;
      }

      res.json({
        success: true,
        data: {
          requires_2fa: true,
          is_totp: true,
          challenge_id: challenge.id,
          expires_at: challenge.expires_at,
          email: profile.email,
          message: "Insira o código do seu aplicativo autenticador",
        },
      });

      // Audit log for challenge
      void AuditService.log({
        userId: profile.id,
        action: "user.login_challenge",
        resource: "auth",
        entityId: profile.id,
        ipAddress: req.auditInfo?.ip,
        userAgent: req.auditInfo?.userAgent,
        tenantId: profile.tenant_id || undefined,
        details: { message: "Desafio 2FA via TOTP" },
      });
      return;
    }

    const code = generateNumericCode(6);
    const codeHash = hashSecurityValue(`2fa:${code} `);
    const expiresAt = new Date(
      Date.now() + env.AUTH_2FA_CODE_TTL_MINUTES * 60 * 1000,
    );

    await supabaseAdmin
      .from("auth_login_challenges")
      .delete()
      .eq("user_id", profile.id);

    const sessionExpiresAt = data.session.expires_at
      ? new Date(data.session.expires_at * 1000).toISOString()
      : null;

    console.log("[Auth] Creating challenge for user:", profile.id);
    const { data: challenge, error: challengeError } = await supabaseAdmin
      .from("auth_login_challenges")
      .insert({
        user_id: profile.id,
        email: profile.email,
        code_hash: codeHash,
        attempts: 0,
        max_attempts: env.AUTH_2FA_MAX_ATTEMPTS,
        access_token: data.session.access_token,
        refresh_token: data.session.refresh_token,
        session_expires_at: sessionExpiresAt,
        expires_at: expiresAt.toISOString(),
      })
      .select("id, expires_at")
      .single();

    if (challengeError || !challenge) {
      console.error("[Auth] Failed to create 2FA challenge details:", JSON.stringify(challengeError, null, 2));
      res.status(500).json({ success: false, error: "Erro ao iniciar verificação de login" });
      return;
    }

    try {
      await sendTwoFactorCodeEmail({
        to: profile.email,
        fullName: profile.full_name,
        code,
        expiresInMinutes: env.AUTH_2FA_CODE_TTL_MINUTES,
      });
    } catch (mailError) {
      console.error("[Auth] Failed to send 2FA email:", mailError);
      await supabaseAdmin
        .from("auth_login_challenges")
        .delete()
        .eq("id", challenge.id);

      res.status(500).json({
        success: false,
        error: "Não foi possível enviar o código de verificação por email",
      });
      return;
    }

    res.json({
      success: true,
      data: {
        requires_2fa: true,
        challenge_id: challenge.id,
        expires_at: challenge.expires_at,
        email: profile.email,
        message: "Código de verificação enviado para seu email",
      },
    });

    // Audit log for challenge
    void AuditService.log({
      userId: profile.id,
      action: "user.login_challenge",
      resource: "auth",
      entityId: profile.id,
      ipAddress: req.auditInfo?.ip,
      userAgent: req.auditInfo?.userAgent,
      tenantId: profile.tenant_id || undefined,
      details: { message: "Desafio 2FA via e-mail" },
    });
  } catch (error) {
    console.error("[Auth] Login error:", error);
    res.status(500).json({ success: false, error: "Erro interno" });
  }
});

router.post("/logout", async (req: Request, res: Response) => {
  try {
    const authHeader = req.headers.authorization;
    if (authHeader?.startsWith("Bearer ")) {
      const token = authHeader.slice(7);
      // Revoke the session in Supabase
      await supabaseAdmin.auth.admin.signOut(token, "global");
    }

    res.json({
      success: true,
      data: { message: "Sessão encerrada com sucesso" },
    });

    // Audit log (only if user was authenticated)
    if (req.user) {
      void AuditService.log({
        userId: req.user.id,
        action: "user.logout",
        resource: "auth",
        entityId: req.user.id,
        ipAddress: req.auditInfo?.ip,
        userAgent: req.auditInfo?.userAgent,
        tenantId: req.user.tenant_id || undefined,
      });
    }
  } catch (error) {
    console.error("[Auth] Logout error:", error);
    // Even if it fails on server side, we tell the client it's OK so it can clear its state
    res.json({ success: true });
  }
});

router.post("/resend-verification", publicApiLimiter, async (req: Request, res: Response) => {
  try {
    res.json({
      success: true,
      data: { message: "A verificacao de email esta desabilitada para esta plataforma." },
    });
    return;

    const { email } = req.body;
    if (!email) {
      res.status(400).json({ success: false, error: "Email obrigatório" });
      return;
    }

    const normalized = normalizeEmail(email);
    const { data: profile } = await supabase
      .from("profiles")
      .select("id, email, full_name, email_verified")
      .eq("email", normalized)
      .maybeSingle();

    if (!profile) {
      // Respond success for security to avoid email enumeration
      res.json({ success: true, data: { message: "Se o email existir e não estiver verificado, enviaremos um novo link." } });
      return;
    }

    if (profile.email_verified) {
      res.status(400).json({ success: false, error: "Este email já está verificado." });
      return;
    }

    // Invalida tokens anteriores e gera um novo via serviço
    console.log("[Auth] Resending verification for:", profile.email, "User ID:", profile.id);
    const rawToken = await AuthVerificationService.createToken(profile.id, profile.email);
    console.log("[Auth] Token created successfully");

    await AuthVerificationService.sendVerificationEmail({
      email: profile.email,
      fullName: profile.full_name,
      token: rawToken
    });
    console.log("[Auth] Verification email sent successfully");

    res.json({ success: true, data: { message: "Novo link de verificação enviado! Verifique sua caixa de entrada." } });

  } catch (error: any) {
    console.error("[Auth] resend-verification error details:", error);
    res.status(500).json({ success: false, error: "Erro interno", details: error.message });
  }
});

router.get("/verify-email/:token", publicApiLimiter, async (req: Request, res: Response) => {
  try {
    res.json({
      success: true,
      data: {
        message: "A verificacao de email esta desabilitada. Voce ja pode acessar sua conta.",
        invitationLink: null,
      },
    });
    return;

    const { token } = req.params;
    const { invitationLink } = await AuthVerificationService.verify(token as string);

    res.json({
      success: true,
      data: {
        message: "E-mail verificado com sucesso!",
        invitationLink
      },
    });
  } catch (error: any) {
    console.error("[Auth] verify-email error:", error);
    res.status(400).json({
      success: false,
      error: error.message || "Erro ao verificar e-mail",
    });
  }
});

const verify2FASchema = z.object({
  challenge_id: z.string().uuid("Challenge inválido"),
  code: z
    .string()
    .trim()
    .regex(/^(\d{6}|\w{8})$/, "Código inválido"),
});

router.post("/verify-2fa", authLimiter, async (req: Request, res: Response) => {
  try {
    res.status(410).json({
      success: false,
      error: "O 2FA esta desabilitado nesta plataforma.",
    });
    return;

    /*
    const parsed = verify2FASchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        success: false,
        error: "Dados inválidos",
        details: parsed.error.flatten().fieldErrors,
      });
      return;
    }

    const { challenge_id, code } = parsed.data;
    const { data: challenge, error: challengeError } = await supabaseAdmin
      .from("auth_login_challenges")
      .select("id, user_id, code_hash, attempts, max_attempts, access_token, refresh_token, session_expires_at, expires_at")
      .eq("id", challenge_id)
      .single();

    if (challengeError || !challenge) {
      res.status(400).json({ success: false, error: "Código inválido ou expirado" });
      return;
    }

    if (new Date(challenge.expires_at).getTime() < Date.now()) {
      await supabaseAdmin.from("auth_login_challenges").delete().eq("id", challenge.id);
      res.status(401).json({ success: false, error: "Código expirado. Faça login novamente." });
      return;
    }

    if (challenge.attempts >= challenge.max_attempts) {
      await supabaseAdmin.from("auth_login_challenges").delete().eq("id", challenge.id);
      res.status(429).json({
        success: false,
        error: "Limite de tentativas excedido. Faça login novamente.",
      });
      return;
    }

    // Se for TOTP, validamos usando a lógica do TOTPService
    if (challenge.code_hash === "TOTP_PENDING") {
      const profile = await getProfile(challenge.user_id);
      if (!profile || !profile.two_factor_secret) {
        res.status(400).json({ success: false, error: "Configuração de 2FA inválida" });
        return;
      }

      const secret = TOTPService.decryptSecret(profile.two_factor_secret);
      let isValid = false;

      if (code.length === 6) {
        isValid = await TOTPService.verifyToken(code, secret);
      } else if (code.length === 8) {
        // Verificar código de recuperação
        if (profile.recovery_codes_hash && profile.recovery_codes_hash.length > 0) {
          const inputHash = hashSecurityValue(code.toUpperCase());
          const codeIndex = profile.recovery_codes_hash.indexOf(inputHash);

          if (codeIndex !== -1) {
            isValid = true;
            // Queimar código
            const updatedCodes = [...profile.recovery_codes_hash];
            updatedCodes.splice(codeIndex, 1);

            await supabase
              .from("profiles")
              .update({ recovery_codes_hash: updatedCodes })
              .eq("id", profile.id);

            console.log(`[Auth] Recovery code used for user ${profile.id}`);
          }
        }
      }

      if (!isValid) {
        const nextAttempts = challenge.attempts + 1;
        const attemptsRemaining = Math.max(challenge.max_attempts - nextAttempts, 0);

        if (nextAttempts >= challenge.max_attempts) {
          await supabaseAdmin.from("auth_login_challenges").delete().eq("id", challenge.id);
        } else {
          await supabaseAdmin
            .from("auth_login_challenges")
            .update({ attempts: nextAttempts })
            .eq("id", challenge.id);
        }

        res.status(401).json({
          success: false,
          error: attemptsRemaining > 0
            ? `Código inválido.Tentativas restantes: ${attemptsRemaining} `
            : "Limite de tentativas excedido. Faça login novamente.",
        });
        return;
      }
    } else {
      // Lógica original de hash para e-mail
      const receivedHash = hashSecurityValue(`2fa:${code} `);
      if (receivedHash !== challenge.code_hash) {
        const nextAttempts = challenge.attempts + 1;
        const attemptsRemaining = Math.max(challenge.max_attempts - nextAttempts, 0);

        if (nextAttempts >= challenge.max_attempts) {
          await supabaseAdmin.from("auth_login_challenges").delete().eq("id", challenge.id);
        } else {
          await supabaseAdmin
            .from("auth_login_challenges")
            .update({ attempts: nextAttempts })
            .eq("id", challenge.id);
        }

        res.status(401).json({
          success: false,
          error: attemptsRemaining > 0
            ? `Código inválido.Tentativas restantes: ${attemptsRemaining} `
            : "Limite de tentativas excedido. Faça login novamente.",
        });
        return;
      }
    }

    const profile = await getProfile(challenge.user_id);
    if (!profile) {
      await supabaseAdmin.from("auth_login_challenges").delete().eq("id", challenge.id);
      res.status(403).json({ success: false, error: "Perfil não encontrado" });
      return;
    }

    if (!profile.is_active) {
      await supabaseAdmin.from("auth_login_challenges").delete().eq("id", challenge.id);
      res.status(403).json({ success: false, error: "Conta desativada" });
      return;
    }

    const userPayload = await buildAuthUserPayload(profile);
    await supabaseAdmin.from("auth_login_challenges").delete().eq("id", challenge.id);

    const expiresAt = challenge.session_expires_at
      ? Math.floor(new Date(challenge.session_expires_at).getTime() / 1000)
      : null;

    res.json({
      success: true,
      data: {
        access_token: challenge.access_token,
        refresh_token: challenge.refresh_token,
        expires_at: expiresAt,
        user: userPayload,
      },
    });

    // Audit log
    void AuditService.log({
      userId: profile.id,
      action: "user.login",
      resource: "auth",
      entityId: profile.id,
      ipAddress: req.auditInfo?.ip,
      userAgent: req.auditInfo?.userAgent,
      tenantId: profile.tenant_id || undefined,
      details: { message: "Login realizado via 2FA" },
    });
    */
  } catch (error) {
    console.error("[Auth] verify-2fa error:", error);
    res.status(500).json({ success: false, error: "Erro interno" });
  }
});

const publicSignupSchema = z
  .object({
    full_name: z.string().trim().min(2, "Nome obrigatorio").max(120, "Nome muito longo"),
    email: z.string().email("Email invalido"),
    password: strongPasswordSchema,
    confirm_password: z.string().min(1, "Confirmacao obrigatoria"),
    partner_slug: z.string().trim().min(1).optional(),
  })
  .refine((data) => data.password === data.confirm_password, {
    message: "As senhas nao coincidem",
    path: ["confirm_password"],
  });

router.get("/public-signup-config", publicApiLimiter, async (req: Request, res: Response) => {
  try {
    const data = await getPublicSignupPublicView();
    const partner = await resolveRequestedPartner(req);
    res.json({
      success: true,
      data: {
        ...data,
        resolved_branding: buildResolvedBranding(partner),
      },
    });
   
   
  } catch (error) {
    console.error("[Auth] public-signup-config error:", error);
    res.status(500).json({ success: false, error: "Erro ao carregar configuracao do cadastro publico" });
  }
});

router.post("/register", registerLimiter, async (req: Request, res: Response) => {
  try {
    const parsed = publicSignupSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        success: false,
        error: "Dados invalidos",
        details: parsed.error.flatten().fieldErrors,
      });
      return;
    }

    const email = normalizeEmail(parsed.data.email);
    const partnerResolution = await resolveValidatedPublicSignupPartner(req, parsed.data.partner_slug);
    if (!partnerResolution.ok) {
      res.status(partnerResolution.status).json({
        success: false,
        error: partnerResolution.error,
      });
      return;
    }
    const partner = partnerResolution.partner;

    try {
      await assertPublicSignupEnabled();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Cadastro publico indisponivel no momento.";
      res.status(403).json({ success: false, error: message });
      return;
    }

    const { data: existingProfile } = await supabaseAdmin
      .from("profiles")
      .select("id")
      .eq("email", email)
      .maybeSingle();

    if (existingProfile) {
      res.status(409).json({
        success: false,
        error: "Este email ja possui acesso. Tente fazer login ou recuperar sua senha.",
      });
      return;
    }

    const { data: createdUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password: parsed.data.password,
      email_confirm: true,
      user_metadata: {
        full_name: parsed.data.full_name,
        role: "user",
        tenant_id: null,
        partner_id: partner?.id || null,
        permissions: {},
      },
    });

    if (createError || !createdUser.user) {
      console.error("[Auth] register createUser error:", createError);
      const message = createError?.message?.includes("already been registered")
        ? "Este email ja possui acesso. Tente fazer login ou recuperar sua senha."
        : createError?.message || "Nao foi possivel criar sua conta agora.";
      const status = message.includes("ja possui acesso") ? 409 : 400;
      res.status(status).json({ success: false, error: message });
      return;
    }

    let profile = await waitForProfile(createdUser.user.id);

    if (!profile) {
      const { error: insertProfileError } = await supabaseAdmin
        .from("profiles")
        .upsert({
          id: createdUser.user.id,
          email,
          full_name: parsed.data.full_name,
          role: "user",
          tenant_id: null,
          partner_id: partner?.id || null,
          permissions: {},
          email_verified: true,
          bypass_2fa: true,
          needs_tenant_setup: true,
          updated_at: new Date().toISOString(),
        });

      if (insertProfileError) {
        console.error("[Auth] register profile upsert error:", insertProfileError);
        res.status(500).json({ success: false, error: "Conta criada, mas o perfil nao foi inicializado corretamente." });
        return;
      }

      profile = await waitForProfile(createdUser.user.id, 2);
    }

    const { error: updateProfileError } = await supabaseAdmin
      .from("profiles")
      .update({
        email_verified: true,
        bypass_2fa: true,
        needs_tenant_setup: true,
        partner_id: partner?.id || null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", createdUser.user.id);

    if (updateProfileError) {
      console.error("[Auth] register profile update error:", updateProfileError);
      res.status(500).json({ success: false, error: "Nao foi possivel finalizar a configuracao da conta." });
      return;
    }

    if (partner?.id) {
      try {
        await assignAllSystemRoles(createdUser.user.id);
      } catch (roleError) {
        console.error("[Auth] register role assignment error:", roleError);
        res.status(500).json({ success: false, error: "Conta criada, mas os acessos iniciais nao foram aplicados corretamente." });
        return;
      }
    }

    res.status(201).json({
      success: true,
      data: { message: "Conta criada com sucesso." },
    });

    void AuditService.log({
      userId: createdUser.user.id,
      action: "public_signup.register",
      resource: "auth",
      entityId: createdUser.user.id,
      ipAddress: req.auditInfo?.ip,
      userAgent: req.auditInfo?.userAgent,
      details: {
        message: "Conta criada via cadastro publico",
        email,
      },
    });
  } catch (error) {
    console.error("[Auth] register error:", error);
    res.status(500).json({ success: false, error: "Erro interno" });
  }
});

const accessRequestSchema = z.object({
  full_name: z.string().trim().min(2, "Nome obrigatório").max(120, "Nome muito longo"),
  phone: z.string().trim().min(8, "Telefone inválido").max(30, "Telefone inválido"),
  email: z.string().email("Email inválido"),
  company_name: z.string().trim().min(2, "Empresa obrigatória").max(160, "Empresa muito longa"),
});

router.post("/access-request", registerLimiter, async (req: Request, res: Response) => {
  try {
    const parsed = accessRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        success: false,
        error: "Dados inválidos",
        details: parsed.error.flatten().fieldErrors,
      });
      return;
    }

    const payload = {
      ...parsed.data,
      email: normalizeEmail(parsed.data.email),
    };

    const { data: existingProfile } = await supabaseAdmin
      .from("profiles")
      .select("id")
      .eq("email", payload.email)
      .maybeSingle();

    if (existingProfile) {
      res.status(409).json({
        success: false,
        error: "Este email já possui acesso. Tente recuperar sua senha.",
      });
      return;
    }

    // Check for existing access request
    const { data: existingRequest } = await supabaseAdmin
      .from("access_requests")
      .select("id, status")
      .eq("email", payload.email)
      .maybeSingle();

    let requestId: string;

    if (existingRequest) {
      // If it's already pending, reviewed or approved, don't allow duplicate
      if (["pending", "reviewed", "approved"].includes(existingRequest.status)) {
        res.status(409).json({
          success: false,
          error: "Já existe uma solicitação em análise para este email.",
        });
        return;
      }

      // If it was rejected or converted (but profile check above failed), we recycle it
      const { data: updated, error: updateError } = await supabaseAdmin
        .from("access_requests")
        .update({
          full_name: payload.full_name,
          phone: payload.phone,
          company_name: payload.company_name,
          status: "pending",
          updated_at: new Date().toISOString(),
        })
        .eq("id", existingRequest.id)
        .select("id")
        .single();

      if (updateError) {
        console.error("[Auth] Access request update error:", updateError);
        res.status(500).json({ success: false, error: "Erro ao atualizar solicitação" });
        return;
      }
      requestId = updated.id;
    } else {
      // Create new request
      const { data: created, error: insertError } = await supabaseAdmin
        .from("access_requests")
        .insert({
          full_name: payload.full_name,
          phone: payload.phone,
          email: payload.email,
          company_name: payload.company_name,
          status: "pending",
        })
        .select("id")
        .single();

      if (insertError) {
        console.error("[Auth] Access request insert error:", insertError);
        res.status(500).json({ success: false, error: "Erro ao registrar solicitação" });
        return;
      }
      requestId = created.id;
    }

    try {
      await sendAccessRequestNotification(payload);
    } catch (mailError) {
      console.error("[Auth] Access request notify email error:", mailError);
      // For a recycled request, we might not want to delete it, 
      // but for simplicity and following previous logic:
      await supabaseAdmin.from("access_requests").delete().eq("id", requestId);
      res.status(500).json({
        success: false,
        error: "Não foi possível enviar sua solicitação no momento. Tente novamente.",
      });
      return;
    }

    try {
      await sendAccessRequestReceivedEmail(payload);
    } catch (mailError) {
      console.error("[Auth] Access request confirmation email error:", mailError);
    }

    res.status(201).json({
      success: true,
      data: { message: "Solicitação enviada com sucesso. Em breve entraremos em contato." },
    });
  } catch (error) {
    console.error("[Auth] Access request error:", error);
    res.status(500).json({ success: false, error: "Erro interno" });
  }
});

const forgotPasswordSchema = z.object({
  email: z.string().email("Email inválido"),
});

router.post("/forgot-password", publicApiLimiter, async (req: Request, res: Response) => {
  try {
    const parsed = forgotPasswordSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        success: false,
        error: "Dados inválidos",
        details: parsed.error.flatten().fieldErrors,
      });
      return;
    }

    const email = normalizeEmail(parsed.data.email);
    const defaultResponse = {
      success: true,
      data: {
        message: "Se o email existir, enviaremos instruções para redefinir sua senha.",
      },
    };

    const { data: profile } = await supabase
      .from("profiles")
      .select("id, email, full_name")
      .eq("email", email)
      .maybeSingle();

    if (!profile) {
      res.json(defaultResponse);
      return;
    }

    await supabase
      .from("password_reset_tokens")
      .delete()
      .eq("user_id", profile.id)
      .is("used_at", null);

    const rawToken = generateOpaqueToken(32);
    const tokenHash = hashSecurityValue(`reset:${rawToken} `);
    const expiresAt = new Date(
      Date.now() + env.PASSWORD_RESET_TOKEN_TTL_MINUTES * 60 * 1000,
    );

    const { data: tokenRow, error: tokenError } = await supabase
      .from("password_reset_tokens")
      .insert({
        user_id: profile.id,
        email: profile.email,
        token_hash: tokenHash,
        expires_at: expiresAt.toISOString(),
      })
      .select("id")
      .single();

    if (tokenError || !tokenRow) {
      console.error("[Auth] Forgot password token error:", tokenError);
      res.status(500).json({
        success: false,
        error: "Não foi possível iniciar a recuperação de senha",
      });
      return;
    }

    const fullProfile = await getProfile(profile.id);
    const profilePartner = fullProfile ? await resolvePartnerForProfile(fullProfile) : null;
    const baseUrl = await resolveFrontendBaseUrl({ profileId: profile.id });
    const resetLink = `${baseUrl}/reset-password/${rawToken}`;

    try {
      await sendPasswordResetEmail({
        to: profile.email,
        fullName: profile.full_name,
        resetLink,
        expiresInMinutes: env.PASSWORD_RESET_TOKEN_TTL_MINUTES,
        brandName: profilePartner?.name || null,
      });
    } catch (mailError) {
      console.error("[Auth] Forgot password mail error:", mailError);
      await supabase
        .from("password_reset_tokens")
        .delete()
        .eq("id", tokenRow.id);

      res.status(500).json({
        success: false,
        error: "Não foi possível enviar email de recuperação agora. Tente novamente.",
      });
      return;
    }

    res.json(defaultResponse);
  } catch (error) {
    console.error("[Auth] forgot-password error:", error);
    res.status(500).json({ success: false, error: "Erro interno" });
  }
});

const resetPasswordSchema = z
  .object({
    token: z.string().min(16, "Token inválido"),
    new_password: strongPasswordSchema,
    confirm_password: z.string().min(1, "Confirmação obrigatória"),
  })
  .refine((data) => data.new_password === data.confirm_password, {
    message: "As senhas não coincidem",
    path: ["confirm_password"],
  });

router.post("/reset-password", publicApiLimiter, async (req: Request, res: Response) => {
  try {
    const parsed = resetPasswordSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        success: false,
        error: "Dados inválidos",
        details: parsed.error.flatten().fieldErrors,
      });
      return;
    }

    const tokenHash = hashSecurityValue(`reset:${parsed.data.token} `);
    const { data: tokenRow, error: tokenError } = await supabase
      .from("password_reset_tokens")
      .select("id, user_id, expires_at, used_at")
      .eq("token_hash", tokenHash)
      .maybeSingle();

    if (tokenError || !tokenRow) {
      res.status(400).json({ success: false, error: "Token inválido ou expirado" });
      return;
    }

    if (tokenRow.used_at) {
      res.status(400).json({ success: false, error: "Token já utilizado" });
      return;
    }

    if (new Date(tokenRow.expires_at).getTime() < Date.now()) {
      res.status(400).json({ success: false, error: "Token expirado" });
      return;
    }

    const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(
      tokenRow.user_id,
      { password: parsed.data.new_password },
    );

    if (updateError) {
      console.error("[Auth] reset-password update error:", updateError);
      res.status(500).json({ success: false, error: "Erro ao redefinir senha" });
      return;
    }

    // Invalida todas as sessões ativas do usuário globalmente
    try {
      await supabaseAdmin.auth.admin.signOut(tokenRow.user_id, "global");
    } catch (signOutError) {
      console.error("[Auth] Global sign-out error (ignored):", signOutError);
    }

    await supabase
      .from("password_reset_tokens")
      .update({ used_at: new Date().toISOString() })
      .eq("id", tokenRow.id);

    await supabaseAdmin
      .from("auth_login_challenges")
      .delete()
      .eq("user_id", tokenRow.user_id);

    res.json({
      success: true,
      data: { message: "Senha redefinida com sucesso. Faça login novamente." },
    });
  } catch (error) {
    console.error("[Auth] reset-password error:", error);
    res.status(500).json({ success: false, error: "Erro interno" });
  }
});

router.post("/set-password", requireAuth, async (req: Request, res: Response) => {
  try {
    const schema = z.object({
      new_password: strongPasswordSchema,
      confirm_password: z.string(),
    }).refine(d => d.new_password === d.confirm_password, {
      message: "Senhas não coincidem",
      path: ["confirm_password"]
    });

    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ success: false, error: "Dados inválidos", details: parsed.error.flatten().fieldErrors });
      return;
    }

    const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(
      req.user!.id,
      { password: parsed.data.new_password }
    );

    if (updateError) {
      console.error("[Auth] set-password error:", updateError);
      res.status(500).json({ success: false, error: "Erro ao definir senha" });
      return;
    }

    // Invalida sessões globais para garantir que o usuário precise logar de novo com a nova senha
    try {
      await supabaseAdmin.auth.admin.signOut(req.user!.id, "global");
    } catch (signOutError) {
      console.error("[Auth] set-password global sign-out error (ignored):", signOutError);
    }

    res.json({ success: true, data: { message: "Senha definida com sucesso!" } });
  } catch (error) {
    console.error("[Auth] set-password error:", error);
    res.status(500).json({ success: false, error: "Erro interno" });
  }
});

const onboardingCompanySchema = z.object({
  name: z.string().trim().min(2, "Nome minimo 2 caracteres").max(100, "Nome muito longo"),
});

router.post("/onboarding/company", requireAuth, async (req: Request, res: Response) => {
  try {
    const parsed = onboardingCompanySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        success: false,
        error: "Dados invalidos",
        details: parsed.error.flatten().fieldErrors,
      });
      return;
    }

    const profile = await getProfile(req.user!.id);
    if (!profile) {
      res.status(403).json({ success: false, error: "Perfil nao encontrado" });
      return;
    }

    if (!profile.needs_tenant_setup) {
      res.status(400).json({ success: false, error: "Seu onboarding ja foi concluido." });
      return;
    }

    if (profile.tenant_id) {
      await supabaseAdmin
        .from("profiles")
        .update({ needs_tenant_setup: false, updated_at: new Date().toISOString() })
        .eq("id", profile.id);
      await invalidateAuthCache(profile.id);
      res.status(400).json({ success: false, error: "Sua conta ja esta vinculada a uma empresa." });
      return;
    }

    const tenantCode = await generateUniqueTenantCode(parsed.data.name);
    const { data: tenant, error: tenantError } = await supabaseAdmin
      .from("tenants")
      .insert({
        name: parsed.data.name,
        ai_rate_limit: 20,
        tenant_code: tenantCode,
        partner_id: profile.partner_id,
        enabled_features: buildDisabledTenantFeatures(),
      })
      .select("id, name, tenant_code, partner_id")
      .single();

    if (tenantError || !tenant) {
      console.error("[Auth] onboarding tenant create error:", tenantError);
      res.status(500).json({ success: false, error: "Nao foi possivel criar sua empresa agora." });
      return;
    }

    const { error: profileUpdateError } = await supabaseAdmin
      .from("profiles")
      .update({
        tenant_id: tenant.id,
        needs_tenant_setup: false,
        updated_at: new Date().toISOString(),
      })
      .eq("id", profile.id);

    if (profileUpdateError) {
      console.error("[Auth] onboarding profile update error:", profileUpdateError);
      await supabaseAdmin.from("tenants").delete().eq("id", tenant.id);
      res.status(500).json({ success: false, error: "Nao foi possivel vincular sua conta a empresa criada." });
      return;
    }

    try {
      await supabaseAdmin.auth.admin.updateUserById(profile.id, {
        user_metadata: {
          full_name: profile.full_name,
          role: profile.role,
          tenant_id: tenant.id,
          partner_id: profile.partner_id,
          permissions: profile.permissions || {},
        },
      });
    } catch (metadataError) {
      console.error("[Auth] onboarding metadata update error:", metadataError);
    }

    await invalidateAuthCache(profile.id);

    res.status(201).json({
      success: true,
      data: {
        tenant_id: tenant.id,
        tenant_name: tenant.name,
        tenant_code: tenant.tenant_code,
      },
    });

    void AuditService.log({
      userId: profile.id,
      action: "tenant.onboarding_create",
      resource: "tenants",
      entityId: tenant.id,
      ipAddress: req.auditInfo?.ip,
      userAgent: req.auditInfo?.userAgent,
      tenantId: tenant.id,
      details: {
        next: tenant,
        message: "Empresa criada durante onboarding obrigatorio",
      },
    });
  } catch (error) {
    console.error("[Auth] onboarding/company error:", error);
    res.status(500).json({ success: false, error: "Erro interno" });
  }
});

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

router.get("/me", requireAuth, async (req: Request, res: Response) => {
  try {
    const user = req.user!;
    const tenant_name = await getTenantName(user.tenant_id);

    res.json({
      success: true,
      data: {
        id: user.id,
        email: user.email,
        full_name: user.full_name,
        role: user.role,
        tenant_id: user.tenant_id,
        partner_id: user.partner_id,
        tenant_name,
        avatar_url: user.avatar_url,
        permissions: user.permissions,
        enabled_features: user.enabled_features,
        manageable_features: user.manageable_features,
        manageable_tenant_ids: user.manageable_tenant_ids,
        managed_partner_ids: user.managed_partner_ids,
        resolved_branding: user.resolved_branding,
        resolved_host: user.resolved_host,
        two_factor_enabled: user.two_factor_enabled,
        needs_tenant_setup: user.needs_tenant_setup,
      },
    });
  } catch (error) {
    console.error("[Auth] Me error:", error);
    res.status(500).json({ success: false, error: "Erro interno" });
  }
});

// --- Novas rotas de 2FA TOTP ---

router.post("/2fa/enable", requireAuth, async (req: Request, res: Response) => {
  try {
    res.status(410).json({
      success: false,
      error: "O 2FA esta desabilitado nesta plataforma.",
    });
    return;

    /*
    const user = req.user!;
    const profile = await getProfile(user.id);

    if (profile?.two_factor_enabled) {
      res.status(400).json({ success: false, error: "2FA já está ativado" });
      return;
    }

    const secret = TOTPService.generateSecret();
    const qrCode = await TOTPService.generateQRCode(user.email, secret);
    const encryptedSecret = TOTPService.encryptSecret(secret);

    // Gerar códigos de recuperação
    const recoveryCodes = TOTPService.generateRecoveryCodes();
    const recoveryCodesHashes = recoveryCodes.map(c => hashSecurityValue(c));

    // Salvamos o secret mas mantemos disabled até a primeira verificação
    await supabase
      .from("profiles")
      .update({
        two_factor_secret: encryptedSecret,
        recovery_codes_hash: recoveryCodesHashes,
        two_factor_enabled: false
      })
      .eq("id", user.id);

    res.json({
      success: true,
      data: {
        qrCode,
        secret,
        recoveryCodes,
      }
    });
    */
  } catch (error) {
    console.error("[Auth] 2FA Enable error:", error);
    res.status(500).json({ success: false, error: "Erro ao gerar configuração 2FA" });
  }
});

router.post("/2fa/verify", requireAuth, async (req: Request, res: Response) => {
  try {
    res.status(410).json({
      success: false,
      error: "O 2FA esta desabilitado nesta plataforma.",
    });
    return;

    /*
    const { code } = req.body;
    if (!code || code.length !== 6) {
      res.status(400).json({ success: false, error: "Código inválido" });
      return;
    }

    const profile = await getProfile(req.user!.id);
    if (!profile?.two_factor_secret) {
      res.status(400).json({ success: false, error: "Configuração 2FA não encontrada" });
      return;
    }

    const secret = TOTPService.decryptSecret(profile.two_factor_secret);
    const isValid = await TOTPService.verifyToken(code, secret);

    if (!isValid) {
      res.status(400).json({ success: false, error: "Código de verificação incorreto" });
      return;
    }

    await supabase
      .from("profiles")
      .update({ two_factor_enabled: true })
      .eq("id", req.user!.id);

    // Invalidate cache to ensure /me returns fresh data
    const token = req.headers.authorization?.slice(7);
    if (token) {
      invalidateAuthCache(token);
      console.log(`[Auth] Cache invalidated for user ${req.user!.id}`);
    }

    res.json({ success: true, data: { message: "2FA ativado com sucesso!" } });
    */
  } catch (error) {
    console.error("[Auth] 2FA Verify error:", error);
    res.status(500).json({ success: false, error: "Erro ao validar 2FA" });
  }
});

router.post("/2fa/disable", requireAuth, async (req: Request, res: Response) => {
  try {
    res.status(410).json({
      success: false,
      error: "O 2FA esta desabilitado nesta plataforma.",
    });
    return;

    /*
    const { password } = req.body;
    if (!password) {
      res.status(400).json({ success: false, error: "Senha obrigatória para desativar 2FA" });
      return;
    }

    // Validar senha com o Supabase antes de desativar
    const { error: authError } = await supabase.auth.signInWithPassword({
      email: req.user!.email,
      password,
    });

    if (authError) {
      res.status(401).json({ success: false, error: "Senha incorreta" });
      return;
    }

    await supabase
      .from("profiles")
      .update({
        two_factor_enabled: false,
        two_factor_secret: null,
        recovery_codes_hash: null
      })
      .eq("id", req.user!.id);

    // Invalidate cache
    const token = req.headers.authorization?.slice(7);
    if (token) {
      invalidateAuthCache(token);
      console.log(`[Auth] Cache invalidated for user ${req.user!.id} (2FA disabled)`);
    }

    res.json({ success: true, data: { message: "2FA desativado com sucesso" } });
    */
  } catch (error) {
    console.error("[Auth] 2FA Disable error:", error);
    res.status(500).json({ success: false, error: "Erro ao desativar 2FA" });
  }
});

export default router;
