import nodemailer from "nodemailer";
import { env } from "../config/env";

const transporter = nodemailer.createTransport({
  host: env.SMTP_HOST,
  port: env.SMTP_PORT,
  secure: env.SMTP_SECURE,
  auth: {
    user: env.SMTP_USER,
    pass: env.SMTP_PASS,
  },
});

let verificationPromise: Promise<void> | null = null;

async function ensureTransportReady(): Promise<void> {
  if (!verificationPromise) {
    console.log("[Email] Verificando conexão SMTP...");
    verificationPromise = transporter
      .verify()
      .then(() => {
        console.log("✅ [Email] Conexão SMTP estabelecida com sucesso");
        return undefined;
      })
      .catch((error: any) => {
        console.error("❌ [Email] Erro na verificação SMTP:", {
          message: error.message,
          code: error.code,
          command: error.command,
          response: error.response,
        });
        verificationPromise = null;
        throw error;
      });
  }
  await verificationPromise;
}

function escapeHtml(input: string): string {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

interface AccessRequestPayload {
  full_name: string;
  phone: string;
  email: string;
  company_name: string;
}

export async function sendAccessRequestNotification(payload: AccessRequestPayload): Promise<void> {
  await ensureTransportReady();

  const subject = "Nova solicitacao de acesso - Atrio";
  const text = [
    "Nova solicitacao de acesso recebida:",
    `Nome: ${payload.full_name}`,
    `Telefone: ${payload.phone}`,
    `Email: ${payload.email}`,
    `Empresa: ${payload.company_name}`,
  ].join("\n");

  const html = `
    <h2>Nova solicitacao de acesso</h2>
    <p><strong>Nome:</strong> ${escapeHtml(payload.full_name)}</p>
    <p><strong>Telefone:</strong> ${escapeHtml(payload.phone)}</p>
    <p><strong>Email:</strong> ${escapeHtml(payload.email)}</p>
    <p><strong>Empresa:</strong> ${escapeHtml(payload.company_name)}</p>
  `;

  await transporter.sendMail({
    from: env.SMTP_FROM,
    to: env.ACCESS_REQUEST_NOTIFY_EMAIL,
    subject,
    text,
    html,
  });
}

export async function sendAccessRequestReceivedEmail(payload: AccessRequestPayload): Promise<void> {
  await ensureTransportReady();

  const subject = "Recebemos sua solicitacao de acesso";
  const text = [
    `Oi ${payload.full_name},`,
    "",
    "Recebemos sua solicitacao de acesso ao Atrio.",
    "Nossa equipe vai analisar e entrar em contato pelo seu email.",
  ].join("\n");

  const html = `
    <p>Oi ${escapeHtml(payload.full_name)},</p>
    <p>Recebemos sua solicitacao de acesso ao Atrio.</p>
    <p>Nossa equipe vai analisar e entrar em contato pelo seu email.</p>
  `;

  await transporter.sendMail({
    from: env.SMTP_FROM,
    to: payload.email,
    subject,
    text,
    html,
  });
}

export async function sendTwoFactorCodeEmail(params: {
  to: string;
  fullName?: string | null;
  code: string;
  expiresInMinutes: number;
}): Promise<void> {
  await ensureTransportReady();

  const greeting = params.fullName?.trim() ? `Oi ${params.fullName.trim()},` : "Oi,";
  const subject = "Codigo de verificacao de login - Atrio";
  const text = [
    greeting,
    "",
    `Seu codigo de verificacao: ${params.code}`,
    `Ele expira em ${params.expiresInMinutes} minutos.`,
    "",
    "Se voce nao tentou entrar, ignore este email.",
  ].join("\n");

  const html = `
    <p>${escapeHtml(greeting)}</p>
    <p>Seu codigo de verificacao:</p>
    <p style="font-size: 24px; font-weight: 700; letter-spacing: 4px;">${escapeHtml(params.code)}</p>
    <p>Ele expira em <strong>${params.expiresInMinutes} minutos</strong>.</p>
    <p>Se voce nao tentou entrar, ignore este email.</p>
  `;

  await transporter.sendMail({
    from: env.SMTP_FROM,
    to: params.to,
    subject,
    text,
    html,
  });
}

export async function sendPasswordResetEmail(params: {
  to: string;
  fullName?: string | null;
  resetLink: string;
  expiresInMinutes: number;
}): Promise<void> {
  await ensureTransportReady();

  const greeting = params.fullName?.trim() ? `Oi ${params.fullName.trim()},` : "Oi,";
  const subject = "Recuperacao de senha - Atrio";
  const text = [
    greeting,
    "",
    "Recebemos um pedido para redefinir sua senha.",
    `Use este link: ${params.resetLink}`,
    `Validade: ${params.expiresInMinutes} minutos.`,
    "",
    "Se voce nao fez este pedido, ignore este email.",
  ].join("\n");

  const html = `
    <p>${escapeHtml(greeting)}</p>
    <p>Recebemos um pedido para redefinir sua senha.</p>
    <p><a href="${escapeHtml(params.resetLink)}">Clique aqui para redefinir sua senha</a></p>
    <p>Validade: <strong>${params.expiresInMinutes} minutos</strong>.</p>
    <p>Se voce nao fez este pedido, ignore este email.</p>
  `;

  await transporter.sendMail({
    from: env.SMTP_FROM,
    to: params.to,
    subject,
    text,
    html,
  });
}

export async function sendEmailVerification(params: {
  to: string;
  fullName?: string | null;
  verificationLink: string;
  expiresInHours: number;
}): Promise<void> {
  await ensureTransportReady();

  const greeting = params.fullName?.trim() ? `Oi ${params.fullName.trim()},` : "Oi,";
  const subject = "Verifique seu email - Atrio";
  const text = [
    greeting,
    "",
    "Sua conta no Atrio foi criada! Para comecar a usar, voce precisa confirmar seu email.",
    `Clique no link para verificar: ${params.verificationLink}`,
    `Este link é valido por ${params.expiresInHours} horas.`,
    "",
    "Se voce nao esperava este convite, ignore este email.",
  ].join("\n");

  const html = `
    <p>${escapeHtml(greeting)}</p>
    <p>Sua conta no Atrio foi criada! Para comecar a usar, voce precisa confirmar seu email.</p>
    <p><a href="${escapeHtml(params.verificationLink)}" style="display: inline-block; padding: 12px 24px; background-color: #0070f3; color: #ffffff; text-decoration: none; border-radius: 6px; font-weight: 600;">Confirmar meu Email</a></p>
    <p>Ou copie e cole este link no seu navegador:</p>
    <p>${escapeHtml(params.verificationLink)}</p>
    <p>Este link é valido por <strong>${params.expiresInHours} horas</strong>.</p>
    <p>Se voce nao esperava este convite, ignore este email.</p>
  `;

  await transporter.sendMail({
    from: env.SMTP_FROM,
    to: params.to,
    subject,
    text,
    html,
  });
}
