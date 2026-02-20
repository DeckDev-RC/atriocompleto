import { supabaseAdmin } from "../config/supabase";
import { env } from "../config/env";
import { generateOpaqueToken, hashSecurityValue } from "../utils/security";
import { sendEmailVerification } from "./email";

export class AuthVerificationService {
    /**
     * Generates a new verification token and saves it to the database.
     * Invalidates old tokens for the same user.
     */
    static async createToken(userId: string, email: string, invitationLink?: string) {
        // Invalida tokens anteriores
        await supabaseAdmin
            .from("email_verification_tokens")
            .delete()
            .eq("user_id", userId);

        const rawToken = generateOpaqueToken(32);
        const tokenHash = hashSecurityValue(`verify:${rawToken}`);
        const expiresAt = new Date(
            Date.now() + env.EMAIL_VERIFICATION_TOKEN_TTL_HOURS * 60 * 60 * 1000
        );

        const { error } = await supabaseAdmin.from("email_verification_tokens").insert({
            user_id: userId,
            email,
            token_hash: tokenHash,
            expires_at: expiresAt.toISOString(),
            invitation_link: invitationLink,
        });

        if (error) throw error;

        return rawToken;
    }

    /**
     * Sends the unified verification email.
     * If an invitation link is provided (from Supabase), it should be included or handled.
     */
    static async sendVerificationEmail(params: {
        email: string;
        fullName: string;
        token: string;
        invitationLink?: string; // Link técnico do Supabase (para definir senha)
    }) {
        const baseUrl = env.APP_BASE_URL.replace(/\/+$/, "");

        // O link que o usuário clica é sempre o nosso backend/frontend de verificação
        // No futuro, se clicado, podemos redirecionar para o invitationLink do Supabase
        const verificationLink = `${baseUrl}/verificar-email/${params.token}`;

        await sendEmailVerification({
            to: params.email,
            fullName: params.fullName,
            verificationLink,
            expiresInHours: env.EMAIL_VERIFICATION_TOKEN_TTL_HOURS,
        });
    }

    /**
     * Processes the verification token.
     */
    static async verify(token: string) {
        const tokenHash = hashSecurityValue(`verify:${token}`);

        const { data: tokenRow, error: tokenError } = await supabaseAdmin
            .from("email_verification_tokens")
            .select("id, user_id, expires_at, used_at, invitation_link")
            .eq("token_hash", tokenHash)
            .maybeSingle();

        if (tokenError || !tokenRow) {
            throw new Error("Link de verificação inválido ou já utilizado.");
        }

        if (tokenRow.used_at) {
            throw new Error("Este link já foi utilizado.");
        }

        if (new Date(tokenRow.expires_at).getTime() < Date.now()) {
            throw new Error("Este link expirou. Solicite um novo.");
        }

        // Marca como verificado - usando supabaseAdmin para evitar RLS do profile
        const { error: updateError } = await supabaseAdmin
            .from("profiles")
            .update({ email_verified: true })
            .eq("id", tokenRow.user_id);

        if (updateError) throw updateError;

        // Atribui papel padrão 'Visualizador' se o usuário não tiver nenhum papel atribuído
        try {
            const { data: userRoles } = await supabaseAdmin
                .from("user_roles")
                .select("id")
                .eq("profile_id", tokenRow.user_id);

            if (!userRoles || userRoles.length === 0) {
                const { data: role } = await supabaseAdmin
                    .from("roles")
                    .select("id")
                    .eq("name", "Visualizador")
                    .single();

                if (role) {
                    await supabaseAdmin.from("user_roles").insert({
                        profile_id: tokenRow.user_id,
                        role_id: role.id
                    });
                }
            }
        } catch (roleError) {
            console.error("[AuthVerification] Error assigning default role:", roleError);
            // Non-blocking error
        }

        // Remove o token
        await supabaseAdmin
            .from("email_verification_tokens")
            .delete()
            .eq("id", tokenRow.id);

        return {
            userId: tokenRow.user_id,
            invitationLink: tokenRow.invitation_link
        };
    }
}
