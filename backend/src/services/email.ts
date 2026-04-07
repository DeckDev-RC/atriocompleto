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
  brandName?: string | null;
}): Promise<void> {
  await ensureTransportReady();

  const greeting = params.fullName?.trim() ? `Oi ${params.fullName.trim()},` : "Oi,";
  const subject = `Recuperacao de senha - ${params.brandName?.trim() || "Átrio"}`;
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

export async function sendInvitationEmail(params: {
  to: string;
  fullName?: string | null;
  setupLink: string;
  brandName?: string | null;
}): Promise<void> {
  await ensureTransportReady();

  const greeting = params.fullName?.trim() ? `Oi ${params.fullName.trim()},` : "Oi,";
  const brandName = params.brandName?.trim() || "Átrio";
  const subject = `Seu acesso foi liberado - ${brandName}`;
  const text = [
    greeting,
    "",
    `Seu acesso à plataforma ${brandName} foi liberado.`,
    `Use este link para definir sua senha e entrar: ${params.setupLink}`,
    "",
    "Se você não esperava este convite, ignore este email.",
  ].join("\n");

  const html = `
    <p>${escapeHtml(greeting)}</p>
    <p>Seu acesso à plataforma <strong>${escapeHtml(brandName)}</strong> foi liberado.</p>
    <p><a href="${escapeHtml(params.setupLink)}" style="display: inline-block; padding: 12px 24px; background-color: #0070f3; color: #ffffff; text-decoration: none; border-radius: 6px; font-weight: 600;">Definir minha senha</a></p>
    <p>Ou copie e cole este link no navegador:</p>
    <p>${escapeHtml(params.setupLink)}</p>
    <p>Se você não esperava este convite, ignore este email.</p>
  `;

  await transporter.sendMail({
    from: env.SMTP_FROM,
    to: params.to,
    subject,
    text,
    html,
  });
}

export async function sendDailyInsightsSummary(params: {
  to: string;
  fullName?: string | null;
  insights: any[];
  dashboardUrl: string;
  brandName?: string | null;
}): Promise<void> {
  await ensureTransportReady();

  const greeting = params.fullName?.trim() ? `Oi ${params.fullName.trim()},` : "Oi,";
  const subject = `Resumo Diario: ${params.insights.length} novos insights para voce - ${params.brandName?.trim() || "Átrio"}`;

  const insightsHtml = params.insights.map(insight => {
    const priorityColor = insight.priority === 'critical' ? '#ef4444' : insight.priority === 'high' ? '#f97316' : '#3b82f6';
    const importanceBar = `<div style="width: 100%; background: #e2e8f0; height: 8px; border-radius: 4px; margin-top: 8px;">
      <div style="width: ${insight.importance_score}%; background: ${priorityColor}; height: 8px; border-radius: 4px;"></div>
    </div>`;

    return `
      <div style="margin-bottom: 24px; padding: 16px; border-left: 4px solid ${priorityColor}; background: #f8fafc; border-radius: 4px;">
        <div style="display: flex; justify-content: space-between; align-items: center;">
          <strong style="color: #1e293b; font-size: 16px;">${escapeHtml(insight.title)}</strong>
          <span style="font-size: 12px; color: ${priorityColor}; font-weight: bold; text-transform: uppercase;">${insight.priority}</span>
        </div>
        <p style="color: #475569; font-size: 14px; margin: 8px 0;">${escapeHtml(insight.description)}</p>
        <div style="font-size: 12px; color: #64748b;">Impacto Estimado: ${insight.importance_score}%</div>
        ${importanceBar}
        <div style="margin-top: 12px;">
          <strong style="font-size: 12px; color: #1e293b;">Próximos Passos:</strong>
          <ul style="margin: 4px 0; padding-left: 20px; font-size: 13px; color: #475569;">
            ${insight.recommended_actions.map((a: any) => `<li>${escapeHtml(typeof a === 'string' ? a : (a.label || 'Ação Recomendada'))}</li>`).join('')}
          </ul>
        </div>
      </div>
    `;
  }).join('');

  const html = `
    <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; color: #1e293b; padding: 20px; border: 1px solid #e2e8f0; border-radius: 8px;">
      <h2 style="color: #0f172a;">${escapeHtml(greeting)}</h2>
      <p style="font-size: 16px; line-height: 1.5;">Seu assistente Atrio identificou <strong>${params.insights.length} pontos importantes</strong> para sua gestão hoje.</p>
      
      ${insightsHtml}
      
      <div style="margin-top: 32px; padding: 20px; text-align: center; background: #f1f5f9; border-radius: 8px;">
        <p style="margin-bottom: 16px; font-size: 14px; color: #475569;">Para ver mais detalhes e agir sobre estes insights, acesse seu painel:</p>
        <a href="${escapeHtml(params.dashboardUrl)}" style="display: inline-block; padding: 12px 24px; background-color: #000000; color: #ffffff; text-decoration: none; border-radius: 6px; font-weight: 600;">Ver Todos no Dashboard</a>
      </div>
      
      <p style="font-size: 12px; color: #94a3b8; margin-top: 24px; text-align: center;">
        Este é um relatório automático gerado pela Inteligência Artificial Atrio.
      </p>
    </div>
  `;

  await transporter.sendMail({
    from: env.SMTP_FROM,
    to: params.to,
    subject,
    html,
  });
}

export async function sendWeeklyStrategicReport(params: {
  to: string;
  fullName?: string | null;
  report: any;
  strategicUrl: string;
  brandName?: string | null;
}): Promise<void> {
  await ensureTransportReady();

  const greeting = params.fullName?.trim() ? `Oi ${params.fullName.trim()},` : "Oi,";
  const reportData = params.report.report_data || {};
  const actions = (params.report.actions || []).slice(0, 5);
  const periodStart = params.report.period_start || "";
  const periodEnd = params.report.period_end || "";

  const subject = `Relatorio Estrategico Semanal - ${params.brandName?.trim() || "Átrio"} - ${periodStart} a ${periodEnd}`;

  const categoryColors: Record<string, string> = {
    investimento: "#22c55e",
    descontinuacao: "#ef4444",
    promocao: "#f97316",
    retencao: "#3b82f6",
    otimizacao: "#8b5cf6",
  };

  const categoryLabels: Record<string, string> = {
    investimento: "💰 Investimento",
    descontinuacao: "🗑️ Descontinuação",
    promocao: "🏷️ Promoção",
    retencao: "🤝 Retenção",
    otimizacao: "⚙️ Otimização",
  };

  const actionsHtml = actions
    .map((a: any) => {
      const color = categoryColors[a.category] || "#64748b";
      return `
      <div style="margin-bottom: 16px; padding: 14px; border-left: 4px solid ${color}; background: #f8fafc; border-radius: 4px;">
        <div style="display: flex; justify-content: space-between; align-items: center;">
          <strong style="color: #1e293b; font-size: 15px;">${escapeHtml(a.title)}</strong>
          <span style="font-size: 11px; color: ${color}; font-weight: bold;">${categoryLabels[a.category] || a.category}</span>
        </div>
        <p style="color: #475569; font-size: 13px; margin: 6px 0;">${escapeHtml(a.description)}</p>
        <div style="display: flex; gap: 12px; font-size: 11px; color: #94a3b8; margin-top: 6px;">
          <span>Impacto: <strong style="color: #1e293b;">${a.impact_score}/10</strong></span>
          <span>Facilidade: <strong style="color: #1e293b;">${a.ease_score}/10</strong></span>
          <span>Score: <strong style="color: ${color};">${a.priority_score}</strong></span>
        </div>
      </div>
    `;
    })
    .join("");

  const opportunitiesHtml = (reportData.opportunities || [])
    .map((o: string) => `<li style="margin: 4px 0; color: #475569; font-size: 13px;">🟢 ${escapeHtml(o)}</li>`)
    .join("");

  const risksHtml = (reportData.risks || [])
    .map((r: string) => `<li style="margin: 4px 0; color: #475569; font-size: 13px;">🔴 ${escapeHtml(r)}</li>`)
    .join("");

  const html = `
    <div style="font-family: sans-serif; max-width: 640px; margin: 0 auto; color: #1e293b; padding: 24px; border: 1px solid #e2e8f0; border-radius: 10px;">
      <h2 style="color: #0f172a; margin-bottom: 4px;">📋 Relatório Estratégico Semanal</h2>
      <p style="font-size: 13px; color: #94a3b8; margin-top: 0;">${periodStart} — ${periodEnd}</p>
      
      <p style="font-size: 15px; line-height: 1.6;">${escapeHtml(greeting)}</p>
      
      <div style="background: #f1f5f9; padding: 16px; border-radius: 8px; margin: 20px 0;">
        <h3 style="margin-top: 0; font-size: 14px; color: #0f172a;">📝 Resumo Executivo</h3>
        <p style="color: #475569; font-size: 13px; line-height: 1.6;">${escapeHtml(reportData.executive_summary || "")}</p>
      </div>

      ${actions.length > 0 ? `
        <h3 style="font-size: 14px; color: #0f172a; margin-top: 24px;">🎯 Top ${actions.length} Ações Recomendadas</h3>
        ${actionsHtml}
      ` : ""}

      <div style="display: flex; gap: 16px; margin-top: 24px;">
        ${opportunitiesHtml ? `
          <div style="flex: 1;">
            <h4 style="font-size: 13px; color: #0f172a;">Oportunidades</h4>
            <ul style="padding-left: 0; list-style: none;">${opportunitiesHtml}</ul>
          </div>
        ` : ""}
        ${risksHtml ? `
          <div style="flex: 1;">
            <h4 style="font-size: 13px; color: #0f172a;">Riscos</h4>
            <ul style="padding-left: 0; list-style: none;">${risksHtml}</ul>
          </div>
        ` : ""}
      </div>

      <div style="margin-top: 32px; padding: 20px; text-align: center; background: #f1f5f9; border-radius: 8px;">
        <p style="margin-bottom: 16px; font-size: 14px; color: #475569;">Ver relatório completo com Matriz BCG e todas as ações:</p>
        <a href="${escapeHtml(params.strategicUrl)}" style="display: inline-block; padding: 12px 24px; background-color: #000000; color: #ffffff; text-decoration: none; border-radius: 6px; font-weight: 600;">Abrir Painel Estratégico</a>
      </div>
      
      <p style="font-size: 11px; color: #94a3b8; margin-top: 24px; text-align: center;">
        Relatório gerado automaticamente pela IA Átrio às ${new Date().toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo" })}.
      </p>
    </div>
  `;

  await transporter.sendMail({
    from: env.SMTP_FROM,
    to: params.to,
    subject,
    html,
  });
}

export async function sendScheduledReportEmail(params: {
  to: string;
  fullName?: string | null;
  subject: string;
  html: string;
  downloadUrl: string;
  attachments?: Array<{
    filename: string;
    content: Buffer;
    contentType: string;
  }>;
}): Promise<void> {
  await ensureTransportReady();

  const greeting = params.fullName?.trim() ? `Oi ${params.fullName.trim()},` : "Oi,";
  const wrappedHtml = `
    <div style="font-family:sans-serif;max-width:720px;margin:0 auto;">
      <p style="font-size:14px;color:#334155;">${escapeHtml(greeting)}</p>
      ${params.html}
      <p style="margin-top:20px;font-size:12px;color:#64748b;">
        Se o anexo estiver indisponível ou for muito grande, use este link: <a href="${escapeHtml(params.downloadUrl)}">baixar relatório</a>.
      </p>
    </div>
  `;

  await transporter.sendMail({
    from: env.SMTP_FROM,
    to: params.to,
    subject: params.subject,
    html: wrappedHtml,
    attachments: params.attachments,
  });
}

export async function sendScheduledReportFailureEmail(params: {
  to: string;
  fullName?: string | null;
  reportName: string;
  errorMessage: string;
}): Promise<void> {
  await ensureTransportReady();

  const greeting = params.fullName?.trim() ? `Oi ${params.fullName.trim()},` : "Oi,";
  const subject = `[Átrio] Falha no relatório agendado: ${params.reportName}`;
  const html = `
    <div style="font-family:sans-serif;max-width:640px;margin:0 auto;padding:24px;border:1px solid #e2e8f0;border-radius:12px;">
      <p style="font-size:14px;color:#334155;">${escapeHtml(greeting)}</p>
      <h2 style="margin-top:0;color:#0f172a;">Falha definitiva no relatório agendado</h2>
      <p style="font-size:14px;color:#475569;">
        O relatório <strong>${escapeHtml(params.reportName)}</strong> falhou três vezes consecutivas e foi pausado automaticamente.
      </p>
      <div style="margin-top:16px;padding:16px;background:#fff1f2;border:1px solid #fecdd3;border-radius:10px;">
        <strong style="display:block;margin-bottom:8px;color:#9f1239;">Erro</strong>
        <code style="white-space:pre-wrap;color:#881337;">${escapeHtml(params.errorMessage)}</code>
      </div>
      <p style="margin-top:16px;font-size:13px;color:#475569;">
        Revise a configuração do agendamento e execute um teste manual após o ajuste.
      </p>
    </div>
  `;

  await transporter.sendMail({
    from: env.SMTP_FROM,
    to: params.to,
    subject,
    html,
  });
}

export async function sendReportExportEmail(params: {
  to: string;
  fullName?: string | null;
  reportTitle: string;
  fileName: string;
  format: "csv" | "xlsx" | "html" | "json" | "pdf";
  downloadUrl: string;
}): Promise<void> {
  await ensureTransportReady();

  const greeting = params.fullName?.trim() ? `Oi ${params.fullName.trim()},` : "Oi,";
  const subject = `[Átrio] Export pronto: ${params.reportTitle}`;
  const html = `
    <div style="font-family:sans-serif;max-width:680px;margin:0 auto;padding:24px;border:1px solid #e2e8f0;border-radius:12px;">
      <p style="font-size:14px;color:#334155;">${escapeHtml(greeting)}</p>
      <h2 style="margin-top:0;color:#0f172a;">Seu arquivo está pronto</h2>
      <p style="font-size:14px;color:#475569;">
        O relatório <strong>${escapeHtml(params.reportTitle)}</strong> foi exportado com sucesso no formato
        <strong> ${escapeHtml(params.format.toUpperCase())}</strong>.
      </p>
      <div style="margin:16px 0;padding:16px;background:#f8fafc;border-radius:10px;border:1px solid #e2e8f0;">
        <div style="font-size:13px;color:#475569;">Arquivo</div>
        <div style="margin-top:6px;font-size:15px;font-weight:600;color:#0f172a;">${escapeHtml(params.fileName)}</div>
      </div>
      <a href="${escapeHtml(params.downloadUrl)}" style="display:inline-block;margin-top:8px;padding:12px 18px;background:#0f172a;color:#ffffff;text-decoration:none;border-radius:8px;font-weight:600;">
        Baixar arquivo
      </a>
      <p style="margin-top:20px;font-size:12px;color:#64748b;">
        O link é temporário. Se ele expirar, gere um novo pelo painel da Átrio.
      </p>
    </div>
  `;

  await transporter.sendMail({
    from: env.SMTP_FROM,
    to: params.to,
    subject,
    html,
  });
}

