import XLSX from "xlsx";
import { supabaseAdmin } from "../config/supabase";
import { fetchDashboardAggregated, type DashboardParams } from "./dashboard";
import { ProductAnalyzer, type OptimusFilters } from "./optimus/productAnalyzer";
import { queryFunctions, getDistinctValues } from "./query-functions";
import { AccessControlService } from "./access-control";
import { AuditService } from "./audit";
import { sendScheduledReportEmail, sendScheduledReportFailureEmail } from "./email";
import { CustomReportBuilderService } from "./customReportBuilder.service";
import { buildScheduledReportDocument } from "./reportDocumentBuilder.service";
import { resolveFrontendBaseUrl } from "./frontend-url";
import {
  type EligibleRecipient,
  type GeneratedSheet,
  type PreviewResult,
  type ReportExecutionRow,
  type ReportFiltersInput,
  type ReportType,
  REPORT_BUCKET,
  QUICK_DOWNLOAD_TTL_SECONDS,
  DOWNLOAD_URL_TTL_SECONDS,
  MAX_ATTACHMENT_BYTES,
  MAX_RECIPIENTS,
  REPORT_TIMEZONE,
  REPORT_TYPE_LABELS,
  type ScheduledReportInput,
  type ScheduledReportRow,
  type ScheduleConfigInput,
  normalizeEmail,
  sanitizeFilename,
  formatCurrency,
  formatPercent,
  ensureStringArray,
  escapeHtml,
  normalizeScheduleConfig,
  describeSchedule,
  resolveDateWindow,
} from "./reportScheduler.utils";

interface GeneratedReportArtifact {
  subject: string;
  periodLabel: string;
  htmlBody: string;
  fileName: string;
  contentType: string;
  buffer: Buffer;
  previewRows: Array<Record<string, string | number | null>>;
}

function buildCsv(rows: Array<Record<string, string | number | null>>): Buffer {
  if (rows.length === 0) {
    return Buffer.from("\uFEFFSem dados\n", "utf8");
  }

  const headers = Object.keys(rows[0]);
  const escapeValue = (value: string | number | null) => {
    const normalized = value === null || value === undefined ? "" : String(value);
    return `"${normalized.replace(/"/g, '""')}"`;
  };

  const content = [
    headers.join(";"),
    ...rows.map((row) => headers.map((header) => escapeValue(row[header] ?? "")).join(";")),
  ].join("\n");

  return Buffer.from(`\uFEFF${content}`, "utf8");
}

function buildWorkbook(sheets: GeneratedSheet[]): Buffer {
  const workbook = XLSX.utils.book_new();
  sheets.forEach((sheet) => {
    const worksheet = XLSX.utils.json_to_sheet(sheet.rows.length > 0 ? sheet.rows : [{ Mensagem: "Sem dados" }]);
    XLSX.utils.book_append_sheet(workbook, worksheet, sheet.name.slice(0, 31) || "Relatorio");
  });
  return XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }) as Buffer;
}

function buildHtmlTable(rows: Array<Record<string, string | number | null>>): string {
  if (rows.length === 0) {
    return `<p style="color:#64748b;font-size:13px;">Sem dados disponíveis.</p>`;
  }

  const headers = Object.keys(rows[0]);
  const headerHtml = headers
    .map((header) => `<th style="text-align:left;padding:10px 12px;border-bottom:1px solid #e2e8f0;font-size:12px;color:#475569;">${escapeHtml(header)}</th>`)
    .join("");
  const bodyHtml = rows
    .slice(0, 8)
    .map(
      (row) => `<tr>${headers
        .map((header) => `<td style="padding:10px 12px;border-bottom:1px solid #f1f5f9;font-size:13px;color:#0f172a;">${escapeHtml(String(row[header] ?? ""))}</td>`)
        .join("")}</tr>`,
    )
    .join("");

  return `
    <table style="width:100%;border-collapse:collapse;background:#ffffff;border:1px solid #e2e8f0;border-radius:10px;overflow:hidden;">
      <thead style="background:#f8fafc;"><tr>${headerHtml}</tr></thead>
      <tbody>${bodyHtml}</tbody>
    </table>
  `;
}

function buildEmailBody(params: {
  reportName: string;
  reportType: ReportType;
  scheduleName: string;
  periodLabel: string;
  previewRows: Array<Record<string, string | number | null>>;
  dashboardUrl: string;
  downloadUrl: string;
}): string {
  return `
    <div style="font-family:Arial,sans-serif;max-width:720px;margin:0 auto;padding:24px;color:#0f172a;">
      <h2 style="margin:0 0 8px;">[Átrio] ${escapeHtml(params.reportName)}</h2>
      <p style="margin:0 0 20px;color:#475569;font-size:14px;">
        Agendamento: <strong>${escapeHtml(params.scheduleName)}</strong><br />
        Tipo: <strong>${escapeHtml(REPORT_TYPE_LABELS[params.reportType])}</strong><br />
        Período: <strong>${escapeHtml(params.periodLabel)}</strong>
      </p>
      <div style="margin-bottom:20px;">
        ${buildHtmlTable(params.previewRows)}
      </div>
      <div style="margin-top:24px;padding:20px;background:#f8fafc;border-radius:12px;">
        <a href="${escapeHtml(params.dashboardUrl)}" style="display:inline-block;margin-right:12px;padding:12px 18px;background:#0f172a;color:#ffffff;text-decoration:none;border-radius:8px;font-weight:600;">Abrir painel</a>
        <a href="${escapeHtml(params.downloadUrl)}" style="display:inline-block;padding:12px 18px;background:#ffffff;color:#0f172a;text-decoration:none;border:1px solid #cbd5e1;border-radius:8px;font-weight:600;">Baixar arquivo</a>
      </div>
    </div>
  `;
}

function buildHtmlReportDocument(title: string, periodLabel: string, sections: GeneratedSheet[]): Buffer {
  const sectionsHtml = sections
    .map(
      (section) => `
        <section style="margin-bottom:24px;">
          <h3 style="margin-bottom:10px;font-size:18px;color:#0f172a;">${escapeHtml(section.name)}</h3>
          ${buildHtmlTable(section.rows)}
        </section>
      `,
    )
    .join("");

  const html = `
    <!DOCTYPE html>
    <html lang="pt-BR">
      <head>
        <meta charset="UTF-8" />
        <title>${escapeHtml(title)}</title>
      </head>
      <body style="font-family:Arial,sans-serif;background:#f8fafc;margin:0;padding:32px;">
        <main style="max-width:920px;margin:0 auto;background:#ffffff;border-radius:16px;padding:32px;border:1px solid #e2e8f0;">
          <h1 style="margin:0 0 8px;">${escapeHtml(title)}</h1>
          <p style="margin:0 0 24px;color:#475569;">Período: ${escapeHtml(periodLabel)}</p>
          ${sectionsHtml}
        </main>
      </body>
    </html>
  `;

  return Buffer.from(html, "utf8");
}

function buildArtifact(params: {
  schedule: ScheduledReportRow;
  sheets: GeneratedSheet[];
  periodLabel: string;
  dashboardUrl: string;
  downloadUrl: string;
}): GeneratedReportArtifact {
  const reportName = `${params.schedule.name} (${REPORT_TYPE_LABELS[params.schedule.report_type]})`;
  const fileBase = sanitizeFilename(`${params.schedule.name}-${params.schedule.report_type}-${new Date().toISOString().slice(0, 10)}`);
  const subject = `[Átrio] Relatório de ${REPORT_TYPE_LABELS[params.schedule.report_type]} - ${params.periodLabel}`;

  if (params.schedule.format === "csv") {
    return {
      subject,
      periodLabel: params.periodLabel,
      htmlBody: buildEmailBody({
        reportName,
        reportType: params.schedule.report_type,
        scheduleName: params.schedule.name,
        periodLabel: params.periodLabel,
        previewRows: params.sheets[0]?.rows || [],
        dashboardUrl: params.dashboardUrl,
        downloadUrl: params.downloadUrl,
      }),
      fileName: `${fileBase}.csv`,
      contentType: "text/csv",
      buffer: buildCsv(params.sheets[0]?.rows || []),
      previewRows: params.sheets[0]?.rows || [],
    };
  }

  if (params.schedule.format === "html") {
    return {
      subject,
      periodLabel: params.periodLabel,
      htmlBody: buildEmailBody({
        reportName,
        reportType: params.schedule.report_type,
        scheduleName: params.schedule.name,
        periodLabel: params.periodLabel,
        previewRows: params.sheets[0]?.rows || [],
        dashboardUrl: params.dashboardUrl,
        downloadUrl: params.downloadUrl,
      }),
      fileName: `${fileBase}.html`,
      contentType: "text/html",
      buffer: buildHtmlReportDocument(reportName, params.periodLabel, params.sheets),
      previewRows: params.sheets[0]?.rows || [],
    };
  }

  return {
    subject,
    periodLabel: params.periodLabel,
    htmlBody: buildEmailBody({
      reportName,
      reportType: params.schedule.report_type,
      scheduleName: params.schedule.name,
      periodLabel: params.periodLabel,
      previewRows: params.sheets[0]?.rows || [],
      dashboardUrl: params.dashboardUrl,
      downloadUrl: params.downloadUrl,
    }),
    fileName: `${fileBase}.xlsx`,
    contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    buffer: buildWorkbook(params.sheets),
    previewRows: params.sheets[0]?.rows || [],
  };
}

async function fetchEligibleRecipients(tenantId: string): Promise<EligibleRecipient[]> {
  const { data, error } = await supabaseAdmin
    .from("profiles")
    .select("id, email, full_name, role, is_active, permissions")
    .eq("tenant_id", tenantId)
    .eq("is_active", true)
    .not("email", "is", null);

  if (error) {
    throw new Error(`Erro ao buscar destinatários: ${error.message}`);
  }

  const recipients: EligibleRecipient[] = [];
  for (const profile of data || []) {
    const mergedPermissions = {
      ...(profile.permissions || {}),
      ...(await AccessControlService.getUserPermissions(String(profile.id))),
    };

    if (profile.role === "master" || mergedPermissions.visualizar_relatorios) {
      recipients.push({
        id: String(profile.id),
        email: normalizeEmail(String(profile.email)),
        full_name: String(profile.full_name || ""),
      });
    }
  }

  return recipients.sort((left, right) => left.full_name.localeCompare(right.full_name, "pt-BR"));
}

function validateRecipientEmails(emails: string[]): string[] {
  const deduped = Array.from(new Set(emails.map(normalizeEmail).filter(Boolean)));
  if (deduped.length === 0) {
    throw new Error("Informe ao menos um destinatário");
  }
  if (deduped.length > MAX_RECIPIENTS) {
    throw new Error(`Máximo de ${MAX_RECIPIENTS} destinatários por relatório`);
  }
  const invalid = deduped.find((email) => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email));
  if (invalid) {
    throw new Error(`Email inválido: ${invalid}`);
  }
  return deduped;
}

async function resolveRecipientsForSchedule(tenantId: string, configuredEmails: string[]): Promise<EligibleRecipient[]> {
  const normalized = validateRecipientEmails(configuredEmails);
  const eligible = await fetchEligibleRecipients(tenantId);
  const map = new Map(eligible.map((item) => [item.email, item]));
  const missing = normalized.filter((email) => !map.has(email));

  if (missing.length > 0) {
    throw new Error(`Os seguintes emails não pertencem a usuários autorizados: ${missing.join(", ")}`);
  }

  return normalized.map((email) => map.get(email)!).filter(Boolean);
}

function buildScheduleFilters(filters: ReportFiltersInput): ReportFiltersInput {
  return {
    period_mode: filters.period_mode,
    relative_period: filters.relative_period || null,
    start_date: filters.start_date || null,
    end_date: filters.end_date || null,
    status: filters.status || null,
    marketplace: filters.marketplace || null,
    category: filters.category || null,
    low_stock: filters.low_stock || false,
    out_of_stock: filters.out_of_stock || false,
    excess_stock: filters.excess_stock || false,
  };
}

async function uploadArtifact(schedule: ScheduledReportRow, executionId: string, artifact: GeneratedReportArtifact) {
  const storagePath = `${schedule.tenant_id}/${schedule.id}/${executionId}/${artifact.fileName}`;
  const { error } = await supabaseAdmin.storage
    .from(REPORT_BUCKET)
    .upload(storagePath, artifact.buffer, {
      contentType: artifact.contentType,
      upsert: true,
    });

  if (error) {
    throw new Error(`Erro ao salvar arquivo do relatório: ${error.message}`);
  }

  return {
    storagePath,
    fileSizeBytes: artifact.buffer.byteLength,
  };
}

async function createSignedDownloadUrl(storagePath: string, fileName: string, ttl = QUICK_DOWNLOAD_TTL_SECONDS) {
  const { data, error } = await supabaseAdmin.storage
    .from(REPORT_BUCKET)
    .createSignedUrl(storagePath, ttl, { download: fileName });

  if (error || !data?.signedUrl) {
    throw new Error(`Erro ao gerar link de download: ${error?.message || "link indisponível"}`);
  }

  return data.signedUrl;
}

async function ensureCustomDefinitionExists(customReportId: string, tenantId: string) {
  const definition = await CustomReportBuilderService.getDefinition(customReportId, tenantId);
  if (!definition) {
    throw new Error("Definição customizada não encontrada");
  }
  return definition;
}

function buildDashboardParams(window: { startDate: string; endDate: string }, filters: ReportFiltersInput): DashboardParams {
  return {
    start_date: window.startDate,
    end_date: window.endDate,
    status: filters.status || undefined,
  };
}

async function buildSalesSheets(schedule: ScheduledReportRow) {
  const filters = schedule.filters as unknown as ReportFiltersInput;
  const window = resolveDateWindow(filters, schedule.report_type);
  const aggregated = await fetchDashboardAggregated(buildDashboardParams(window, filters), schedule.tenant_id);

  const cancellationRate =
    aggregated.overview.total_orders > 0
      ? (aggregated.overview.cancelled_orders / aggregated.overview.total_orders) * 100
      : 0;

  const summaryRows: GeneratedSheet["rows"] = [
    { Métrica: "Pedidos", Valor: aggregated.overview.total_orders },
    { Métrica: "Faturamento Total", Valor: formatCurrency(aggregated.overview.total_revenue) },
    { Métrica: "Ticket Médio", Valor: formatCurrency(aggregated.overview.avg_ticket) },
    { Métrica: "Pedidos Pagos", Valor: aggregated.overview.paid_orders },
    { Métrica: "Receita Paga", Valor: formatCurrency(aggregated.overview.paid_revenue) },
    { Métrica: "Pedidos Cancelados", Valor: aggregated.overview.cancelled_orders },
    { Métrica: "Taxa de Cancelamento", Valor: formatPercent(cancellationRate) },
    { Métrica: "Tendência MoM", Valor: aggregated.trends.momTrend !== null ? formatPercent(aggregated.trends.momTrend) : "N/A" },
  ];

  const channels = Object.entries(aggregated.paidByMkt).map(([marketplace, revenue]) => ({
    Marketplace: marketplace,
    Receita: formatCurrency(revenue),
  }));

  const monthly = aggregated.months.map((month) => ({
    Mês: month.month,
    Pago: formatCurrency(month.paid),
    Cancelado: formatCurrency(month.cancelled),
    Pedidos: month.count,
    "Ticket Médio": formatCurrency(month.avgTicket),
  }));

  return {
    periodLabel: window.label,
    sheets: [
      { name: "Resumo", rows: summaryRows },
      { name: "Canais", rows: channels },
      { name: "Mensal", rows: monthly },
    ],
  };
}

async function buildFinanceSheets(schedule: ScheduledReportRow) {
  const filters = schedule.filters as unknown as ReportFiltersInput;
  const window = resolveDateWindow(filters, schedule.report_type);
  const aggregated = await fetchDashboardAggregated(buildDashboardParams(window, filters), schedule.tenant_id);
  const cancelledRate =
    aggregated.overview.total_orders > 0
      ? (aggregated.overview.cancelled_orders / aggregated.overview.total_orders) * 100
      : 0;

  const financeRows: GeneratedSheet["rows"] = [
    { Indicador: "Receita total", Valor: formatCurrency(aggregated.overview.total_revenue) },
    { Indicador: "Receita paga", Valor: formatCurrency(aggregated.overview.paid_revenue) },
    { Indicador: "Receita cancelada", Valor: formatCurrency(aggregated.overview.cancelled_revenue) },
    { Indicador: "Pedidos pagos", Valor: aggregated.overview.paid_orders },
    { Indicador: "Pedidos cancelados", Valor: aggregated.overview.cancelled_orders },
    { Indicador: "Ticket médio", Valor: formatCurrency(aggregated.overview.avg_ticket) },
    { Indicador: "Taxa de cancelamento", Valor: formatPercent(cancelledRate) },
  ];

  const monthly = aggregated.months.map((month) => ({
    Mês: month.month,
    "Receita Paga": formatCurrency(month.paid),
    "Receita Cancelada": formatCurrency(month.cancelled),
    Pedidos: month.count,
  }));

  return {
    periodLabel: window.label,
    sheets: [
      { name: "Financeiro", rows: financeRows },
      { name: "Mensal", rows: monthly },
    ],
  };
}

async function buildProductSheets(schedule: ScheduledReportRow) {
  const filters = schedule.filters as unknown as ReportFiltersInput;
  const optimusFilters: OptimusFilters = {
    tenantId: schedule.tenant_id,
    category: filters.category || undefined,
    lowStock: Boolean(filters.low_stock),
    outOfStock: Boolean(filters.out_of_stock),
    excessStock: Boolean(filters.excess_stock),
    includeSummary: true,
    limit: 250,
    exportMode: true,
  };

  const [result, summary] = await Promise.all([
    ProductAnalyzer.queryProducts(optimusFilters),
    ProductAnalyzer.getInventoryHealth(schedule.tenant_id, optimusFilters),
  ]);

  const summaryRows: GeneratedSheet["rows"] = [
    { Indicador: "Produtos", Valor: summary.total_products },
    { Indicador: "Sem estoque", Valor: summary.out_of_stock },
    { Indicador: "Estoque baixo", Valor: summary.low_stock },
    { Indicador: "Excesso de estoque", Valor: summary.excess_stock },
    { Indicador: "Produtos sem venda", Valor: summary.stale_products },
    { Indicador: "Valor em custo", Valor: formatCurrency(summary.stock_value_cost) },
    { Indicador: "Valor em venda", Valor: formatCurrency(summary.stock_value_sale) },
  ];

  const productRows = result.products.map((product) => ({
    Produto: product.name,
    SKU: product.sku,
    Categoria: product.category_name || product.category || "Sem categoria",
    "Preço Venda": formatCurrency(product.sale_price),
    "Margem %": formatPercent(product.margin_percent),
    Estoque: product.stock_level,
    Status: product.stock_status,
    "Vendidos 30d": product.units_sold_30d,
    "Receita 90d": formatCurrency(product.revenue_90d),
  }));

  return {
    periodLabel: "Snapshot atual de produtos",
    sheets: [
      { name: "Resumo", rows: summaryRows },
      { name: "Produtos", rows: productRows },
    ],
  };
}

async function buildCustomerSheets(schedule: ScheduledReportRow) {
  const filters = schedule.filters as unknown as ReportFiltersInput;
  const window = resolveDateWindow(filters, schedule.report_type);
  const params = {
    _tenant_id: schedule.tenant_id,
    start_date: window.startDate,
    end_date: window.endDate,
    marketplace: filters.marketplace || undefined,
  };

  const [countResult, topBuyersResult, newCustomersResult, patternsResult] = await Promise.all([
    queryFunctions.customerCount(params as never),
    queryFunctions.topBuyers({ ...params, limit: 15 } as never),
    queryFunctions.newCustomers(params as never),
    queryFunctions.customerPurchasePatterns(params as never),
  ]);

  const countData = countResult as {
    total_distinct_buyers?: number;
    total_orders?: number;
    total_revenue?: number;
    by_marketplace?: Record<string, { distinct_buyers: number; orders: number; revenue: number }>;
  };
  const topBuyers = (topBuyersResult as { top_buyers?: Array<Record<string, unknown>> }).top_buyers || [];
  const newCustomers = newCustomersResult as {
    total_new_buyers?: number;
    total_new_revenue?: number;
  };
  const patterns = patternsResult as {
    frequency?: { avg_orders_per_buyer: number; repeat_rate: number };
    lifecycle?: Record<string, number>;
  };

  const summaryRows: GeneratedSheet["rows"] = [
    { Indicador: "Clientes distintos", Valor: countData.total_distinct_buyers || 0 },
    { Indicador: "Pedidos", Valor: countData.total_orders || 0 },
    { Indicador: "Receita", Valor: formatCurrency(countData.total_revenue || 0) },
    { Indicador: "Novos clientes", Valor: newCustomers.total_new_buyers || 0 },
    { Indicador: "Receita de novos clientes", Valor: formatCurrency(newCustomers.total_new_revenue || 0) },
    { Indicador: "Pedidos médios por cliente", Valor: patterns.frequency?.avg_orders_per_buyer || 0 },
    { Indicador: "Taxa de recompra", Valor: formatPercent(patterns.frequency?.repeat_rate || 0) },
  ];

  const topBuyerRows = topBuyers.map((buyer) => ({
    Cliente: String(buyer.name || ""),
    Marketplace: String(buyer.marketplace || ""),
    Pedidos: Number(buyer.total_orders || 0),
    "Gasto Total": formatCurrency(Number(buyer.total_spent || 0)),
    "Ticket Médio": formatCurrency(Number(buyer.avg_ticket || 0)),
    Status: String(buyer.status || ""),
  }));

  const lifecycleRows = Object.entries(patterns.lifecycle || {}).map(([stage, count]) => ({
    Estágio: stage,
    Clientes: count,
  }));

  const channelRows = Object.entries(countData.by_marketplace || {}).map(([marketplace, data]) => ({
    Marketplace: marketplace,
    Clientes: data.distinct_buyers,
    Pedidos: data.orders,
    Receita: formatCurrency(data.revenue),
  }));

  return {
    periodLabel: window.label,
    sheets: [
      { name: "Resumo", rows: summaryRows },
      { name: "Top Clientes", rows: topBuyerRows },
      { name: "Canais", rows: channelRows },
      { name: "Ciclo de Vida", rows: lifecycleRows },
    ],
  };
}

async function buildCustomSheets(schedule: ScheduledReportRow) {
  if (!schedule.custom_report_id) {
    throw new Error("Agendamento customizado sem definição vinculada");
  }

  const preview = await CustomReportBuilderService.previewStoredDefinition(schedule.custom_report_id, schedule.tenant_id);
  const rows = preview.rows as Array<Record<string, string | number | null>>;
  return {
    periodLabel: `Snapshot customizado • ${new Date().toLocaleDateString("pt-BR", { timeZone: REPORT_TIMEZONE })}`,
    sheets: [
      {
        name: preview.definition.name.slice(0, 31) || "Customizado",
        rows,
      },
    ],
    customReportName: preview.definition.name,
  };
}

async function generateReportData(schedule: ScheduledReportRow, downloadUrl: string): Promise<GeneratedReportArtifact> {
  const generated = await buildScheduledReportDocument(schedule);
  const frontendBaseUrl = await resolveFrontendBaseUrl({ tenantId: schedule.tenant_id });

  return buildArtifact({
    schedule,
    sheets: generated.sheets,
    periodLabel: generated.periodLabel,
    dashboardUrl: `${frontendBaseUrl}/relatorios`,
    downloadUrl,
  });
}

export class ReportSchedulerService {
  static async previewSchedule(input: ScheduledReportInput): Promise<PreviewResult> {
    const normalized = normalizeScheduleConfig(input.schedule);
    return {
      cronExpression: normalized.cronExpression,
      nextRunAt: normalized.nextRunAt.toISOString(),
      description: describeSchedule(input.schedule),
    };
  }

  static async getMetadata(tenantId: string) {
    const [eligibleRecipients, distinctValues, categoriesResult, customReports] = await Promise.all([
      fetchEligibleRecipients(tenantId),
      getDistinctValues(tenantId),
      supabaseAdmin
        .from("categories")
        .select("name")
        .eq("tenant_id", tenantId)
        .order("name", { ascending: true }),
      CustomReportBuilderService.listDefinitions(tenantId),
    ]);

    return {
      recipients: eligibleRecipients,
      statuses: distinctValues.statuses,
      marketplaces: distinctValues.marketplaces,
      categories: (categoriesResult.data || []).map((item) => item.name).filter(Boolean),
      custom_reports: customReports.map((report) => ({
        id: report.id,
        name: report.name,
        description: report.description,
        dataset: report.definition.dataset,
      })),
    };
  }

  static async listSchedules(tenantId: string) {
    const { data, error } = await supabaseAdmin
      .from("scheduled_reports")
      .select("*")
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: false });

    if (error) {
      throw new Error(`Erro ao listar relatórios: ${error.message}`);
    }

    const schedules = (data || []) as unknown as ScheduledReportRow[];
    const scheduleIds = schedules.map((schedule) => schedule.id);
    const customReportIds = schedules.map((schedule) => schedule.custom_report_id).filter(Boolean) as string[];

    let executionRows: ReportExecutionRow[] = [];
    if (scheduleIds.length > 0) {
      const { data: executions, error: executionError } = await supabaseAdmin
        .from("report_executions")
        .select("*")
        .in("scheduled_report_id", scheduleIds)
        .order("executed_at", { ascending: false })
        .limit(scheduleIds.length * 10);

      if (executionError) {
        throw new Error(`Erro ao listar execuções: ${executionError.message}`);
      }

      executionRows = ((executions || []) as unknown as ReportExecutionRow[]).map((execution) => ({
        ...execution,
        recipients: ensureStringArray(execution.recipients),
      }));
    }

    const customReportsMap = new Map<string, string>();
    if (customReportIds.length > 0) {
      const definitions = await CustomReportBuilderService.listDefinitions(tenantId);
      definitions.forEach((definition) => customReportsMap.set(definition.id, definition.name));
    }

    const bySchedule = new Map<string, ReportExecutionRow[]>();
    executionRows.forEach((execution) => {
      const current = bySchedule.get(execution.scheduled_report_id) || [];
      if (current.length < 10) current.push(execution);
      bySchedule.set(execution.scheduled_report_id, current);
    });

    return schedules.map((schedule) => {
      const executions = bySchedule.get(schedule.id) || [];
      const successful = executions.filter((execution) => execution.status === "success").length;
      const durations = executions.filter((execution) => execution.duration_ms && execution.duration_ms > 0);

      return {
        ...schedule,
        recipients: ensureStringArray(schedule.recipients),
        custom_report_name: schedule.custom_report_id ? customReportsMap.get(schedule.custom_report_id) || null : null,
        recent_executions: executions,
        stats: {
          total_runs: executions.length,
          success_rate: executions.length > 0 ? Math.round((successful / executions.length) * 100) : 0,
          avg_duration_ms:
            durations.length > 0
              ? Math.round(durations.reduce((sum, execution) => sum + (execution.duration_ms || 0), 0) / durations.length)
              : 0,
        },
      };
    });
  }

  static async listExecutions(scheduleId: string, tenantId: string) {
    const { data, error } = await supabaseAdmin
      .from("report_executions")
      .select("*")
      .eq("scheduled_report_id", scheduleId)
      .eq("tenant_id", tenantId)
      .order("executed_at", { ascending: false })
      .limit(10);

    if (error) {
      throw new Error(`Erro ao listar execuções: ${error.message}`);
    }

    return ((data || []) as unknown as ReportExecutionRow[]).map((execution) => ({
      ...execution,
      recipients: ensureStringArray(execution.recipients),
    }));
  }

  static async getSchedule(scheduleId: string, tenantId: string | null) {
    const query = supabaseAdmin.from("scheduled_reports").select("*").eq("id", scheduleId);
    const scoped = tenantId ? query.eq("tenant_id", tenantId) : query;
    const { data, error } = await scoped.maybeSingle();

    if (error) {
      throw new Error(`Erro ao buscar relatório agendado: ${error.message}`);
    }

    return (data as unknown as ScheduledReportRow | null) || null;
  }

  static async createSchedule(input: ScheduledReportInput, actor: { id: string; tenant_id: string | null }) {
    if (!actor.tenant_id) {
      throw new Error("Usuário sem tenant vinculado");
    }

    if (input.report_type === "custom") {
      if (!input.custom_report_id) {
        throw new Error("Selecione uma definição customizada");
      }
      await ensureCustomDefinitionExists(input.custom_report_id, actor.tenant_id);
    }

    const recipients = await resolveRecipientsForSchedule(actor.tenant_id, input.recipients);
    const normalizedSchedule = normalizeScheduleConfig(input.schedule);

    const { data, error } = await supabaseAdmin
      .from("scheduled_reports")
      .insert({
        tenant_id: actor.tenant_id,
        created_by: actor.id,
        updated_by: actor.id,
        name: input.name.trim(),
        report_type: input.report_type,
        custom_report_id: input.report_type === "custom" ? input.custom_report_id || null : null,
        format: input.format,
        status: input.is_active ? "active" : "paused",
        timezone: normalizedSchedule.timezone,
        cron_expression: normalizedSchedule.cronExpression,
        schedule_config: input.schedule,
        filters: buildScheduleFilters(input.filters),
        recipients: recipients.map((recipient) => recipient.email),
        next_run_at: input.is_active ? normalizedSchedule.nextRunAt.toISOString() : null,
        updated_at: new Date().toISOString(),
      })
      .select("*")
      .single();

    if (error || !data) {
      throw new Error(`Erro ao criar relatório agendado: ${error?.message || "desconhecido"}`);
    }

    void AuditService.log({
      userId: actor.id,
      action: "reports.schedule_create",
      resource: "scheduled_reports",
      entityId: String(data.id),
      tenantId: actor.tenant_id,
      details: {
        message: `Relatório agendado criado: ${input.name}`,
        next_run_at: input.is_active ? normalizedSchedule.nextRunAt.toISOString() : null,
      },
    });

    return data as unknown as ScheduledReportRow;
  }

  static async updateSchedule(scheduleId: string, input: ScheduledReportInput, actor: { id: string; tenant_id: string | null }) {
    const existing = await this.getSchedule(scheduleId, actor.tenant_id);
    if (!existing) {
      throw new Error("Relatório agendado não encontrado");
    }

    if (input.report_type === "custom") {
      if (!input.custom_report_id) {
        throw new Error("Selecione uma definição customizada");
      }
      await ensureCustomDefinitionExists(input.custom_report_id, existing.tenant_id);
    }

    const recipients = await resolveRecipientsForSchedule(existing.tenant_id, input.recipients);
    const normalizedSchedule = normalizeScheduleConfig(input.schedule);

    const { data, error } = await supabaseAdmin
      .from("scheduled_reports")
      .update({
        name: input.name.trim(),
        report_type: input.report_type,
        custom_report_id: input.report_type === "custom" ? input.custom_report_id || null : null,
        format: input.format,
        status: input.is_active ? "active" : "paused",
        timezone: normalizedSchedule.timezone,
        cron_expression: normalizedSchedule.cronExpression,
        schedule_config: input.schedule,
        filters: buildScheduleFilters(input.filters),
        recipients: recipients.map((recipient) => recipient.email),
        next_run_at: input.is_active ? normalizedSchedule.nextRunAt.toISOString() : null,
        updated_by: actor.id,
        updated_at: new Date().toISOString(),
      })
      .eq("id", scheduleId)
      .eq("tenant_id", existing.tenant_id)
      .select("*")
      .single();

    if (error || !data) {
      throw new Error(`Erro ao atualizar relatório agendado: ${error?.message || "desconhecido"}`);
    }

    void AuditService.log({
      userId: actor.id,
      action: "reports.schedule_update",
      resource: "scheduled_reports",
      entityId: scheduleId,
      tenantId: existing.tenant_id,
      details: AuditService.getDiff(existing, data),
    });

    return data as unknown as ScheduledReportRow;
  }

  static async updateScheduleStatus(
    scheduleId: string,
    status: "active" | "paused",
    actor: { id: string; tenant_id: string | null },
  ) {
    const existing = await this.getSchedule(scheduleId, actor.tenant_id);
    if (!existing) {
      throw new Error("Relatório agendado não encontrado");
    }

    let nextRunAt: string | null = existing.next_run_at;
    if (status === "active") {
      const normalizedSchedule = normalizeScheduleConfig(existing.schedule_config as unknown as ScheduleConfigInput);
      nextRunAt = normalizedSchedule.nextRunAt.toISOString();
    } else {
      nextRunAt = null;
    }

    const { data, error } = await supabaseAdmin
      .from("scheduled_reports")
      .update({
        status,
        next_run_at: nextRunAt,
        updated_by: actor.id,
        updated_at: new Date().toISOString(),
      })
      .eq("id", scheduleId)
      .eq("tenant_id", existing.tenant_id)
      .select("*")
      .single();

    if (error || !data) {
      throw new Error(`Erro ao atualizar status: ${error?.message || "desconhecido"}`);
    }

    return data as unknown as ScheduledReportRow;
  }

  static async deleteSchedule(scheduleId: string, tenantId: string | null) {
    const existing = await this.getSchedule(scheduleId, tenantId);
    if (!existing) {
      throw new Error("Relatório agendado não encontrado");
    }

    const { error } = await supabaseAdmin
      .from("scheduled_reports")
      .delete()
      .eq("id", scheduleId)
      .eq("tenant_id", existing.tenant_id);

    if (error) {
      throw new Error(`Erro ao excluir relatório agendado: ${error.message}`);
    }

    return existing;
  }

  static async executeNow(scheduleId: string, actor: { id: string; email: string; tenant_id: string | null; full_name: string }) {
    const schedule = await this.getSchedule(scheduleId, actor.tenant_id);
    if (!schedule) {
      throw new Error("Relatório agendado não encontrado");
    }

    return this.executeReport(scheduleId, {
      executionType: "manual",
      requestedBy: actor.id,
      overrideRecipients: [
        {
          id: actor.id,
          email: normalizeEmail(actor.email),
          full_name: actor.full_name,
        },
      ],
      attemptNumber: 1,
    });
  }

  static async executeReport(
    scheduleId: string,
    options: {
      executionType: "scheduled" | "manual";
      requestedBy?: string;
      overrideRecipients?: EligibleRecipient[];
      attemptNumber: number;
    },
  ) {
    const schedule = await this.getSchedule(scheduleId, null);
    if (!schedule) {
      throw new Error("Relatório agendado não encontrado");
    }

    const recipients =
      options.overrideRecipients && options.overrideRecipients.length > 0
        ? options.overrideRecipients
        : await resolveRecipientsForSchedule(schedule.tenant_id, schedule.recipients);

    const start = Date.now();
    const { data: executionRow, error: executionInsertError } = await supabaseAdmin
      .from("report_executions")
      .insert({
        scheduled_report_id: schedule.id,
        tenant_id: schedule.tenant_id,
        requested_by: options.requestedBy || null,
        execution_type: options.executionType,
        attempt_number: options.attemptNumber,
        status: "running",
        recipients: recipients.map((recipient) => recipient.email),
      })
      .select("*")
      .single();

    if (executionInsertError || !executionRow) {
      throw new Error(`Erro ao registrar execução: ${executionInsertError?.message || "desconhecido"}`);
    }

    const execution = executionRow as unknown as ReportExecutionRow;

    try {
      const artifact = await generateReportData(schedule, `https://atrio.invalid/${execution.id}`);
      const uploaded = await uploadArtifact(schedule, execution.id, artifact);
      const downloadUrl = await createSignedDownloadUrl(uploaded.storagePath, artifact.fileName, DOWNLOAD_URL_TTL_SECONDS);
      const frontendBaseUrl = await resolveFrontendBaseUrl({ tenantId: schedule.tenant_id });

      const emailBody = buildEmailBody({
        reportName: `${schedule.name} (${REPORT_TYPE_LABELS[schedule.report_type]})`,
        reportType: schedule.report_type,
        scheduleName: schedule.name,
        periodLabel: artifact.periodLabel,
        previewRows: artifact.previewRows,
        dashboardUrl: `${frontendBaseUrl}/relatorios`,
        downloadUrl,
      });

      const attachments =
        artifact.buffer.byteLength <= MAX_ATTACHMENT_BYTES
          ? [
              {
                filename: artifact.fileName,
                content: artifact.buffer,
                contentType: artifact.contentType,
              },
            ]
          : undefined;

      for (const recipient of recipients) {
        await sendScheduledReportEmail({
          to: recipient.email,
          fullName: recipient.full_name,
          subject: artifact.subject,
          html: emailBody,
          attachments,
          downloadUrl,
        });
      }

      const duration = Date.now() - start;

      const { data: updatedExecution, error: executionUpdateError } = await supabaseAdmin
        .from("report_executions")
        .update({
          status: "success",
          subject: artifact.subject,
          file_name: artifact.fileName,
          storage_bucket: REPORT_BUCKET,
          storage_path: uploaded.storagePath,
          content_type: artifact.contentType,
          file_size_bytes: uploaded.fileSizeBytes,
          duration_ms: duration,
          finished_at: new Date().toISOString(),
        })
        .eq("id", execution.id)
        .select("*")
        .single();

      if (executionUpdateError || !updatedExecution) {
        throw new Error(`Erro ao atualizar histórico: ${executionUpdateError?.message || "desconhecido"}`);
      }

      let nextRunAt: string | null = schedule.next_run_at;
      if (options.executionType === "scheduled" && schedule.status === "active") {
        nextRunAt = normalizeScheduleConfig(schedule.schedule_config as unknown as ScheduleConfigInput).nextRunAt.toISOString();
      }

      const { data: updatedSchedule, error: scheduleUpdateError } = await supabaseAdmin
        .from("scheduled_reports")
        .update({
          last_run_at: new Date().toISOString(),
          last_success_at: new Date().toISOString(),
          last_error_message: null,
          last_error_at: null,
          last_execution_status: "success",
          consecutive_failures: 0,
          next_run_at: options.executionType === "scheduled" ? nextRunAt : schedule.next_run_at,
          status: schedule.status === "error" && options.executionType === "scheduled" ? "active" : schedule.status,
          updated_at: new Date().toISOString(),
        })
        .eq("id", schedule.id)
        .select("*")
        .single();

      if (scheduleUpdateError || !updatedSchedule) {
        throw new Error(`Erro ao atualizar schedule: ${scheduleUpdateError?.message || "desconhecido"}`);
      }

      return {
        schedule: updatedSchedule as unknown as ScheduledReportRow,
        execution: {
          ...(updatedExecution as unknown as ReportExecutionRow),
          recipients: ensureStringArray((updatedExecution as { recipients?: unknown }).recipients),
        },
        nextRunAt,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Erro desconhecido na geração do relatório";
      await supabaseAdmin
        .from("report_executions")
        .update({
          status: "failed",
          finished_at: new Date().toISOString(),
          duration_ms: Date.now() - start,
          error_message: message,
        })
        .eq("id", execution.id);

      if (options.executionType === "scheduled") {
        await supabaseAdmin
          .from("scheduled_reports")
          .update({
            last_run_at: new Date().toISOString(),
            last_error_at: new Date().toISOString(),
            last_error_message: message,
            last_execution_status: "failed",
            consecutive_failures: schedule.consecutive_failures + 1,
            updated_at: new Date().toISOString(),
          })
          .eq("id", schedule.id);
      }

      throw error;
    }
  }

  static async handlePermanentFailure(scheduleId: string, errorMessage: string) {
    const schedule = await this.getSchedule(scheduleId, null);
    if (!schedule) return null;

    const { data: updatedSchedule } = await supabaseAdmin
      .from("scheduled_reports")
      .update({
        status: "error",
        next_run_at: null,
        last_error_at: new Date().toISOString(),
        last_error_message: errorMessage,
        consecutive_failures: Math.max(schedule.consecutive_failures, 3),
        updated_at: new Date().toISOString(),
      })
      .eq("id", scheduleId)
      .select("*")
      .single();

    const recipients = await fetchEligibleRecipients(schedule.tenant_id);
    const alertTargets = recipients.slice(0, 3);
    await Promise.all(
      alertTargets.map((recipient) =>
        sendScheduledReportFailureEmail({
          to: recipient.email,
          fullName: recipient.full_name,
          reportName: schedule.name,
          errorMessage,
        }),
      ),
    );

    return updatedSchedule as unknown as ScheduledReportRow;
  }

  static async getExecutionDownloadUrl(executionId: string, tenantId: string | null) {
    const query = supabaseAdmin.from("report_executions").select("*").eq("id", executionId);
    const scoped = tenantId ? query.eq("tenant_id", tenantId) : query;
    const { data, error } = await scoped.maybeSingle();

    if (error || !data) {
      throw new Error("Execução não encontrada");
    }

    const execution = data as unknown as ReportExecutionRow;
    if (!execution.storage_path || !execution.file_name) {
      throw new Error("Esta execução não possui arquivo disponível");
    }

    return createSignedDownloadUrl(execution.storage_path, execution.file_name, QUICK_DOWNLOAD_TTL_SECONDS);
  }

  static async getActiveSchedules() {
    const { data, error } = await supabaseAdmin
      .from("scheduled_reports")
      .select("*")
      .eq("status", "active")
      .not("next_run_at", "is", null);

    if (error) {
      throw new Error(`Erro ao listar schedules ativos: ${error.message}`);
    }

    return (data || []) as unknown as ScheduledReportRow[];
  }

  static async cleanupExpiredExecutions(retentionDays = 90) {
    const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000).toISOString();
    const { data, error } = await supabaseAdmin
      .from("report_executions")
      .select("id, storage_path")
      .lt("executed_at", cutoff)
      .not("storage_path", "is", null);

    if (error) {
      throw new Error(`Erro ao buscar execuções expiradas: ${error.message}`);
    }

    const paths = (data || [])
      .map((item) => String(item.storage_path || ""))
      .filter(Boolean);

    if (paths.length > 0) {
      await supabaseAdmin.storage.from(REPORT_BUCKET).remove(paths).catch(() => undefined);
    }

    await supabaseAdmin.from("report_executions").delete().lt("executed_at", cutoff);
  }
}
