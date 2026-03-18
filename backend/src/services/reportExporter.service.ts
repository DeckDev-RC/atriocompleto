import { randomBytes } from "crypto";
import ExcelJS from "exceljs";
import { supabaseAdmin } from "../config/supabase";
import { env } from "../config/env";
import { AccessControlService } from "./access-control";
import { AuditService } from "./audit";
import { sendReportExportEmail } from "./email";
import { CustomReportBuilderService, buildDefinitionSql, type CustomReportDefinition } from "./customReportBuilder.service";
import { buildCustomDefinitionDocument, buildScheduledReportDocument, type ReportDocument } from "./reportDocumentBuilder.service";
import { ReportSchedulerService } from "./reportScheduler.service";
import {
  DOWNLOAD_URL_TTL_SECONDS,
  MAX_RECIPIENTS,
  REPORT_TIMEZONE,
  ensureStringArray,
  escapeHtml,
  normalizeEmail,
  sanitizeFilename,
  type GeneratedSheet,
} from "./reportScheduler.utils";
import { repairTextArtifacts } from "./aiTextUtils";

export type ReportExportFormat = "csv" | "xlsx" | "html" | "json" | "pdf";
export type ReportExportSourceType = "scheduled_report" | "custom_definition" | "custom_builder";
export type ReportExportStatus = "queued" | "processing" | "success" | "failed" | "expired";

export interface ReportExportOptions {
  orientation?: "portrait" | "landscape";
  delimiter?: "," | ";";
  include_summary?: boolean;
  include_graphs?: boolean;
  watermark?: boolean;
  presentation?: "professional" | "minimal";
}

export interface ReportExportRow {
  id: string;
  tenant_id: string;
  requested_by: string;
  source_type: ReportExportSourceType;
  source_id: string | null;
  title: string;
  format: ReportExportFormat;
  status: ReportExportStatus;
  progress: number;
  options: ReportExportOptions;
  source_payload: Record<string, unknown>;
  recipients: string[];
  emailed_at: string | null;
  public_token: string | null;
  public_expires_at: string | null;
  file_name: string | null;
  storage_bucket: string | null;
  storage_path: string | null;
  content_type: string | null;
  file_size_bytes: number | null;
  retention_expires_at: string;
  started_at: string | null;
  finished_at: string | null;
  error_message: string | null;
  created_at: string;
  updated_at: string;
}

interface ActorContext {
  id: string;
  tenant_id: string | null;
  role?: "master" | "user";
  email?: string;
  full_name?: string;
}

interface CreateReportExportInput {
  source_type: ReportExportSourceType;
  source_id?: string | null;
  title?: string | null;
  format: ReportExportFormat;
  options?: ReportExportOptions;
  definition?: CustomReportDefinition;
  description?: string | null;
}

interface GeneratedExportArtifact {
  fileName: string;
  contentType: string;
  buffer: Buffer;
  rowCount: number;
}

const REPORT_EXPORT_BUCKET = "report-exports";
const MAX_EXPORT_BYTES = 100 * 1024 * 1024;
const PUBLIC_LINK_TTL_HOURS = 24;

function mapExportRow(row: Record<string, unknown>): ReportExportRow {
  return {
    id: String(row.id),
    tenant_id: String(row.tenant_id),
    requested_by: String(row.requested_by),
    source_type: String(row.source_type) as ReportExportSourceType,
    source_id: row.source_id ? String(row.source_id) : null,
    title: String(row.title || ""),
    format: String(row.format) as ReportExportFormat,
    status: String(row.status) as ReportExportStatus,
    progress: Number(row.progress || 0),
    options: (row.options as ReportExportOptions) || {},
    source_payload:
      row.source_payload && typeof row.source_payload === "object"
        ? (row.source_payload as Record<string, unknown>)
        : {},
    recipients: ensureStringArray(row.recipients),
    emailed_at: row.emailed_at ? String(row.emailed_at) : null,
    public_token: row.public_token ? String(row.public_token) : null,
    public_expires_at: row.public_expires_at ? String(row.public_expires_at) : null,
    file_name: row.file_name ? String(row.file_name) : null,
    storage_bucket: row.storage_bucket ? String(row.storage_bucket) : null,
    storage_path: row.storage_path ? String(row.storage_path) : null,
    content_type: row.content_type ? String(row.content_type) : null,
    file_size_bytes: row.file_size_bytes !== null && row.file_size_bytes !== undefined ? Number(row.file_size_bytes) : null,
    retention_expires_at: String(row.retention_expires_at),
    started_at: row.started_at ? String(row.started_at) : null,
    finished_at: row.finished_at ? String(row.finished_at) : null,
    error_message: row.error_message ? String(row.error_message) : null,
    created_at: String(row.created_at || ""),
    updated_at: String(row.updated_at || ""),
  };
}

function normalizeOptions(options?: ReportExportOptions): ReportExportOptions {
  return {
    orientation: options?.orientation === "landscape" ? "landscape" : "portrait",
    delimiter: options?.delimiter === "," ? "," : ";",
    include_summary: options?.include_summary !== false,
    include_graphs: options?.include_graphs !== false,
    watermark: Boolean(options?.watermark),
    presentation: options?.presentation === "minimal" ? "minimal" : "professional",
  };
}

function buildBaseFileName(title: string, format: ReportExportFormat) {
  const base = sanitizeFilename(`${title}-${new Date().toISOString().slice(0, 10)}`) || "relatorio";
  return `${base}.${format}`;
}

function chooseCsvSheet(sheets: GeneratedSheet[]) {
  return [...sheets].sort((left, right) => right.rows.length - left.rows.length)[0] || sheets[0];
}

function escapeCsvValue(value: string | number | null, delimiter: string) {
  const normalized = value === null || value === undefined ? "" : String(value);
  if (normalized.includes(delimiter) || normalized.includes('"') || normalized.includes("\n")) {
    return `"${normalized.replace(/"/g, '""')}"`;
  }
  return normalized;
}

function buildCsvBuffer(document: ReportDocument, delimiter: "," | ";"): GeneratedExportArtifact {
  const targetSheet = chooseCsvSheet(document.sheets);
  const rows = targetSheet?.rows || [];
  if (rows.length === 0) {
    return {
      fileName: buildBaseFileName(document.title, "csv"),
      contentType: "text/csv",
      buffer: Buffer.from("\uFEFFSem dados\n", "utf8"),
      rowCount: 0,
    };
  }

  const headers = Object.keys(rows[0]);
  const content = [
    headers.join(delimiter),
    ...rows.map((row) => headers.map((header) => escapeCsvValue(row[header] ?? "", delimiter)).join(delimiter)),
  ].join("\n");

  return {
    fileName: buildBaseFileName(document.title, "csv"),
    contentType: "text/csv",
    buffer: Buffer.from(`\uFEFF${content}`, "utf8"),
    rowCount: rows.length,
  };
}

function parsePtBrNumber(value: string) {
  const normalized = value.replace(/\./g, "").replace(",", ".").replace(/[^0-9.-]/g, "");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeExcelValue(value: string | number | null) {
  if (typeof value === "number") {
    return { value, style: "number" as const };
  }

  if (value === null || value === undefined) {
    return { value: "", style: "text" as const };
  }

  const text = String(value).trim();
  if (!text) return { value: "", style: "text" as const };

  if (/^R\$\s*/.test(text)) {
    const parsed = parsePtBrNumber(text);
    if (parsed !== null) return { value: parsed, style: "currency" as const };
  }

  if (/^-?\d{1,3}(\.\d{3})*,\d+%$/.test(text) || /^-?\d+([.,]\d+)?%$/.test(text)) {
    const parsed = parsePtBrNumber(text.replace("%", ""));
    if (parsed !== null) return { value: parsed / 100, style: "percent" as const };
  }

  if (/^-?\d+([.,]\d+)?$/.test(text)) {
    const parsed = parsePtBrNumber(text);
    if (parsed !== null) return { value: parsed, style: "number" as const };
  }

  return { value: text, style: "text" as const };
}

function styleWorksheetHeader(row: ExcelJS.Row) {
  row.font = { bold: true, color: { argb: "FFFFFFFF" } };
  row.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FF0F172A" },
  };
  row.alignment = { vertical: "middle", horizontal: "center" };
}

function autoFitWorksheet(worksheet: ExcelJS.Worksheet) {
  worksheet.columns.forEach((column) => {
    if (!column) return;
    let max = 12;
    column.eachCell?.({ includeEmpty: true }, (cell) => {
      const value = cell.value ? String(cell.value) : "";
      max = Math.max(max, Math.min(50, value.length + 2));
    });
    column.width = max;
  });
}

async function buildWorkbookBuffer(document: ReportDocument): Promise<GeneratedExportArtifact> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Átrio";
  workbook.created = new Date();
  workbook.modified = new Date();

  const summarySheet = workbook.addWorksheet("Resumo", {
    views: [{ state: "frozen", ySplit: 4 }],
  });
  summarySheet.addRow([document.title]);
  summarySheet.mergeCells("A1:D1");
  summarySheet.getCell("A1").font = { bold: true, size: 18 };
  summarySheet.addRow(["Período", document.periodLabel]);
  summarySheet.addRow(["Gerado em", new Date().toLocaleString("pt-BR", { timeZone: REPORT_TIMEZONE })]);
  summarySheet.addRow([]);
  if (document.summaryRows.length > 0) {
    const headers = Object.keys(document.summaryRows[0]);
    const headerRow = summarySheet.addRow(headers);
    styleWorksheetHeader(headerRow);
    document.summaryRows.forEach((row) => {
      const excelRow = summarySheet.addRow(headers.map((header) => normalizeExcelValue(row[header] ?? "").value));
      headers.forEach((header, index) => {
        const parsed = normalizeExcelValue(row[header] ?? "");
        const cell = excelRow.getCell(index + 1);
        if (parsed.style === "currency") cell.numFmt = '"R$" #,##0.00';
        if (parsed.style === "percent") cell.numFmt = '0.00%';
        if (parsed.style === "number") cell.numFmt = '#,##0.00';
      });
    });
  }

  const primarySection = document.sheets.find((section) => section.rows.length > 0) || null;
  if (primarySection) {
    const previewRows = primarySection.rows.slice(0, 25);
    if (previewRows.length > 0) {
      summarySheet.addRow([]);
      summarySheet.addRow([primarySection.name]);
      summarySheet.getCell(`A${summarySheet.rowCount}`).font = { bold: true, size: 14 };

      const previewHeaders = Object.keys(previewRows[0]);
      const previewHeaderRow = summarySheet.addRow(previewHeaders);
      styleWorksheetHeader(previewHeaderRow);

      previewRows.forEach((row) => {
        const normalizedCells = previewHeaders.map((header) => normalizeExcelValue(row[header] ?? ""));
        const excelRow = summarySheet.addRow(normalizedCells.map((item) => item.value));
        normalizedCells.forEach((item, index) => {
          const cell = excelRow.getCell(index + 1);
          if (item.style === "currency") cell.numFmt = '"R$" #,##0.00';
          if (item.style === "percent") cell.numFmt = '0.00%';
          if (item.style === "number") cell.numFmt = '#,##0.00';
        });
      });

      if (primarySection.rows.length > previewRows.length) {
        summarySheet.addRow([]);
        summarySheet.addRow([`Prévia exibindo ${previewRows.length} de ${primarySection.rows.length} linhas. Consulte a aba "${primarySection.name}" para ver tudo.`]);
        summarySheet.getCell(`A${summarySheet.rowCount}`).font = { italic: true, color: { argb: "FF64748B" } };
      }
    }
  }
  autoFitWorksheet(summarySheet);

  let totalRows = document.summaryRows.length;
  for (const section of document.sheets) {
    const worksheet = workbook.addWorksheet(section.name.slice(0, 31) || "Dados", {
      views: [{ state: "frozen", ySplit: 1 }],
    });
    if (section.rows.length === 0) {
      worksheet.addRow(["Sem dados"]);
      autoFitWorksheet(worksheet);
      continue;
    }

    const headers = Object.keys(section.rows[0]);
    const headerRow = worksheet.addRow(headers);
    styleWorksheetHeader(headerRow);
    const numericColumns = new Set<number>();

    section.rows.forEach((row) => {
      const normalizedCells = headers.map((header) => normalizeExcelValue(row[header] ?? ""));
      const excelRow = worksheet.addRow(normalizedCells.map((item) => item.value));
      normalizedCells.forEach((item, index) => {
        const cell = excelRow.getCell(index + 1);
        if (item.style === "currency") {
          cell.numFmt = '"R$" #,##0.00';
          numericColumns.add(index + 1);
        } else if (item.style === "percent") {
          cell.numFmt = '0.00%';
          numericColumns.add(index + 1);
        } else if (item.style === "number") {
          cell.numFmt = '#,##0.00';
          numericColumns.add(index + 1);
        }
      });
    });

    if (section.rows.length > 0 && numericColumns.size > 0) {
      const totalsRowIndex = worksheet.rowCount + 1;
      const totalsRow = worksheet.addRow(headers.map((_header, index) => (index === 0 ? "Totais" : null)));
      numericColumns.forEach((columnIndex) => {
        if (columnIndex === 1) return;
        const colLetter = worksheet.getColumn(columnIndex).letter;
        const dataStart = 2;
        const dataEnd = totalsRowIndex - 1;
        totalsRow.getCell(columnIndex).value = { formula: `SUM(${colLetter}${dataStart}:${colLetter}${dataEnd})` };
        totalsRow.getCell(columnIndex).font = { bold: true };
      });
      totalsRow.font = { bold: true };
    }

    autoFitWorksheet(worksheet);
    totalRows += section.rows.length;
  }

  const metadataSheet = workbook.addWorksheet("Metadata");
  metadataSheet.addRow(["Campo", "Valor"]);
  styleWorksheetHeader(metadataSheet.getRow(1));
  metadataSheet.addRows([
    ["Título", document.title],
    ["Tipo", document.reportType],
    ["Período", document.periodLabel],
    ["Gerado em", new Date().toLocaleString("pt-BR", { timeZone: REPORT_TIMEZONE })],
    ["Metadata JSON", JSON.stringify(document.metadata)],
  ]);
  autoFitWorksheet(metadataSheet);

  const buffer = await workbook.xlsx.writeBuffer();
  return {
    fileName: buildBaseFileName(document.title, "xlsx"),
    contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    buffer: Buffer.from(buffer),
    rowCount: totalRows,
  };
}

function buildHtmlTable(rows: Array<Record<string, string | number | null>>) {
  if (rows.length === 0) {
    return `<p style="color:#64748b;font-size:13px;">Sem dados disponíveis.</p>`;
  }

  const headers = Object.keys(rows[0]);
  const headerHtml = headers
    .map((header) => `<th style="text-align:left;padding:10px 12px;border-bottom:1px solid #e2e8f0;font-size:12px;color:#475569;">${escapeHtml(header)}</th>`)
    .join("");
  const bodyHtml = rows
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

function buildSummaryCards(summaryRows: Array<Record<string, string | number | null>>) {
  if (summaryRows.length === 0) return "";

  return `
    <section style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px;margin:24px 0;">
      ${summaryRows
        .slice(0, 8)
        .map((row) => {
          const [labelKey, valueKey] = Object.keys(row);
          return `
            <div style="border:1px solid #e2e8f0;border-radius:14px;padding:16px;background:#f8fafc;">
              <div style="font-size:12px;color:#64748b;text-transform:uppercase;letter-spacing:0.04em;">${escapeHtml(String(row[labelKey] ?? labelKey))}</div>
              <div style="margin-top:8px;font-size:22px;font-weight:700;color:#0f172a;">${escapeHtml(String(row[valueKey] ?? ""))}</div>
            </div>
          `;
        })
        .join("")}
    </section>
  `;
}

function buildInlineSvgChart(section: GeneratedSheet): string {
  if (section.rows.length < 2 || section.rows.length > 30) return "";

  const headers = Object.keys(section.rows[0]);
  // Find a numeric value column (skip the label/first column)
  const numericColIndex = headers.findIndex((h, i) => {
    if (i === 0) return false;
    return section.rows.every((row) => {
      const v = row[h];
      if (v === null || v === undefined || v === "") return true;
      if (typeof v === "number") return true;
      if (typeof v === "string") {
        const cleaned = v.replace(/[R$\s.%,]/g, "").replace(",", ".");
        return !isNaN(Number(cleaned)) && cleaned.length > 0;
      }
      return false;
    });
  });
  if (numericColIndex < 0) return "";

  const labelKey = headers[0];
  const valueKey = headers[numericColIndex];

  const parseNum = (v: string | number | null): number => {
    if (v === null || v === undefined) return 0;
    if (typeof v === "number") return v;
    const cleaned = v.replace(/[R$\s.]/g, "").replace(",", ".");
    return Number(cleaned) || 0;
  };

  const data = section.rows.map((row) => ({
    label: String(row[labelKey] ?? ""),
    value: parseNum(row[valueKey]),
  }));

  const maxVal = Math.max(...data.map((d) => Math.abs(d.value)), 1);
  const chartW = 500;
  const barH = 22;
  const gap = 6;
  const labelW = 120;
  const chartH = data.length * (barH + gap) + 20;
  const barAreaW = chartW - labelW - 20;

  // Color palette
  const colors = ["#2563eb", "#7c3aed", "#0891b2", "#059669", "#d97706", "#dc2626", "#6366f1", "#ec4899"];

  const bars = data.map((d, i) => {
    const w = Math.max(2, (Math.abs(d.value) / maxVal) * barAreaW);
    const y = i * (barH + gap) + 10;
    const color = colors[i % colors.length];
    const truncLabel = d.label.length > 18 ? d.label.slice(0, 16) + "…" : d.label;
    return `
      <text x="${labelW - 8}" y="${y + barH / 2 + 4}" text-anchor="end" font-size="10" fill="#475569">${escapeHtml(truncLabel)}</text>
      <rect x="${labelW}" y="${y}" width="${w}" height="${barH}" rx="4" fill="${color}" opacity="0.85"/>
      <text x="${labelW + w + 6}" y="${y + barH / 2 + 4}" font-size="10" fill="#475569">${escapeHtml(String(section.rows[i][valueKey] ?? ""))}</text>
    `;
  }).join("");

  return `
    <div style="margin:16px 0 8px;page-break-inside:avoid;">
      <svg width="${chartW}" height="${chartH}" xmlns="http://www.w3.org/2000/svg" style="font-family:Arial,sans-serif;">
        ${bars}
      </svg>
    </div>
  `;
}

function buildHtmlDocument(document: ReportDocument, options: ReportExportOptions) {
  const generatedAt = new Date().toLocaleString("pt-BR", { timeZone: REPORT_TIMEZONE });
  const isMinimal = options.presentation === "minimal";
  const summaryHtml = options.include_summary ? buildSummaryCards(document.summaryRows) : "";
  const watermark = options.watermark
    ? `<div style="position:fixed;inset:0;display:flex;align-items:center;justify-content:center;pointer-events:none;opacity:0.07;font-size:72px;font-weight:700;transform:rotate(-28deg);color:#0f172a;">Confidencial • Uso Interno</div>`
    : "";

  const sectionsHtml = document.sheets
    .map(
      (section) => `
        <section style="margin-bottom:24px;page-break-inside:avoid;">
          <h3 style="margin:0 0 10px;font-size:18px;color:#0f172a;">${escapeHtml(section.name)}</h3>
          ${buildHtmlTable(section.rows)}
          ${options.include_graphs ? buildInlineSvgChart(section) : ""}
        </section>
      `,
    )
    .join("");

  if (isMinimal) {
    return `
      <!DOCTYPE html>
      <html lang="pt-BR">
        <head>
          <meta charset="UTF-8" />
          <title>${escapeHtml(document.title)}</title>
          <style>
            @page { size: A4 ${options.orientation === "landscape" ? "landscape" : "portrait"}; margin: 12mm 10mm; }
            body { font-family: Arial, sans-serif; background: #ffffff; margin: 0; padding: 0; color: #0f172a; }
            .meta { color: #64748b; font-size: 12px; margin: 0 0 10px; }
            h1 { margin: 0 0 4px; font-size: 22px; }
            h3 { margin: 0 0 8px; font-size: 14px; color: #0f172a; }
            section + section { margin-top: 18px; }
          </style>
        </head>
        <body>
          ${watermark}
          <main>
            <header style="margin-bottom:16px;">
              <h1>${escapeHtml(document.title)}</h1>
              <p class="meta">${escapeHtml(document.periodLabel)} • Gerado em ${escapeHtml(generatedAt)}</p>
            </header>
            ${sectionsHtml}
          </main>
        </body>
      </html>
    `;
  }

  return `
    <!DOCTYPE html>
    <html lang="pt-BR">
      <head>
        <meta charset="UTF-8" />
        <title>${escapeHtml(document.title)}</title>
        <style>
          @page { size: A4 ${options.orientation === "landscape" ? "landscape" : "portrait"}; margin: 18mm 12mm; }
          body { font-family: Arial, sans-serif; background: #f8fafc; margin: 0; padding: 24px; color: #0f172a; }
          .report-shell { max-width: 1080px; margin: 0 auto; background: #ffffff; border-radius: 18px; border: 1px solid #e2e8f0; padding: 28px; position: relative; }
          .meta { color: #64748b; font-size: 13px; line-height: 1.6; }
        </style>
      </head>
      <body>
        ${watermark}
        <main class="report-shell">
          <header style="display:flex;justify-content:space-between;gap:24px;align-items:flex-start;border-bottom:1px solid #e2e8f0;padding-bottom:18px;">
            <div>
              <div style="font-size:12px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:#2563eb;">Átrio</div>
              <h1 style="margin:8px 0 6px;font-size:28px;">${escapeHtml(document.title)}</h1>
              <p class="meta" style="margin:0;">Período: ${escapeHtml(document.periodLabel)}</p>
            </div>
            <div class="meta" style="text-align:right;">
              <div>Formato: ${escapeHtml(document.reportType)}</div>
              <div>Gerado em: ${escapeHtml(generatedAt)}</div>
              <div>Gerado por: Átrio</div>
            </div>
          </header>
          ${summaryHtml}
          ${sectionsHtml}
        </main>
      </body>
    </html>
  `;
}

function repairDocumentText(document: ReportDocument): ReportDocument {
  const repairRow = (row: Record<string, string | number | null>) => {
    const repaired: Record<string, string | number | null> = {};
    for (const [key, value] of Object.entries(row)) {
      repaired[repairTextArtifacts(key)] = typeof value === "string" ? repairTextArtifacts(value) : value;
    }
    return repaired;
  };

  return {
    ...document,
    title: repairTextArtifacts(document.title),
    periodLabel: repairTextArtifacts(document.periodLabel),
    summaryRows: document.summaryRows.map(repairRow),
    sheets: document.sheets.map((sheet) => ({
      ...sheet,
      name: repairTextArtifacts(sheet.name),
      rows: sheet.rows.map(repairRow),
    })),
  };
}

async function buildPdfBuffer(document: ReportDocument, options: ReportExportOptions): Promise<GeneratedExportArtifact> {
  const repairedDocument = repairDocumentText(document);
  const html = buildHtmlDocument(repairedDocument, options);
  const puppeteer = await import("puppeteer");
  const browser = await puppeteer.default.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--lang=pt-BR"],
    env: { ...process.env, LANG: "pt_BR.UTF-8", LC_ALL: "pt_BR.UTF-8" },
  });

  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "networkidle0" });
    const pdf = await page.pdf({
      format: "A4",
      landscape: options.orientation === "landscape",
      printBackground: true,
      margin: { top: "16mm", right: "10mm", bottom: "16mm", left: "10mm" },
      displayHeaderFooter: true,
      headerTemplate: `<div></div>`,
      footerTemplate: `
        <div style="width:100%;font-size:10px;color:#64748b;padding:0 12mm;display:flex;justify-content:space-between;">
          <span>Gerado por Átrio</span>
          <span>Página <span class="pageNumber"></span> de <span class="totalPages"></span></span>
        </div>
      `,
    });

    return {
      fileName: buildBaseFileName(document.title, "pdf"),
      contentType: "application/pdf",
      buffer: Buffer.from(pdf),
      rowCount: document.sheets.reduce((sum, sheet) => sum + sheet.rows.length, 0),
    };
  } finally {
    await browser.close();
  }
}

function buildJsonBuffer(document: ReportDocument): GeneratedExportArtifact {
  const payload = {
    title: document.title,
    reportType: document.reportType,
    periodLabel: document.periodLabel,
    generatedAt: new Date().toISOString(),
    metadata: document.metadata,
    sheets: document.sheets,
  };

  return {
    fileName: buildBaseFileName(document.title, "json"),
    contentType: "application/json",
    buffer: Buffer.from(JSON.stringify(payload, null, 2), "utf8"),
    rowCount: document.sheets.reduce((sum, sheet) => sum + sheet.rows.length, 0),
  };
}

function buildHtmlBuffer(document: ReportDocument, options: ReportExportOptions): GeneratedExportArtifact {
  const html = buildHtmlDocument(document, options);
  return {
    fileName: buildBaseFileName(document.title, "html"),
    contentType: "text/html",
    buffer: Buffer.from(html, "utf8"),
    rowCount: document.sheets.reduce((sum, sheet) => sum + sheet.rows.length, 0),
  };
}

async function renderArtifact(document: ReportDocument, format: ReportExportFormat, options: ReportExportOptions) {
  switch (format) {
    case "csv":
      return buildCsvBuffer(document, options.delimiter || ";");
    case "xlsx":
      return buildWorkbookBuffer(document);
    case "html":
      return buildHtmlBuffer(document, options);
    case "json":
      return buildJsonBuffer(document);
    case "pdf":
      return buildPdfBuffer(document, options);
    default:
      throw new Error("Formato de exportação não suportado");
  }
}

async function createSignedDownloadUrl(storagePath: string, fileName: string, ttl = DOWNLOAD_URL_TTL_SECONDS) {
  const { data, error } = await supabaseAdmin.storage
    .from(REPORT_EXPORT_BUCKET)
    .createSignedUrl(storagePath, ttl, { download: fileName });

  if (error || !data?.signedUrl) {
    throw new Error(`Erro ao gerar link de download: ${error?.message || "indisponível"}`);
  }

  return data.signedUrl;
}

async function uploadArtifact(exportRow: ReportExportRow, artifact: GeneratedExportArtifact) {
  const storagePath = `${exportRow.tenant_id}/${exportRow.requested_by}/${exportRow.id}/${artifact.fileName}`;
  const { error } = await supabaseAdmin.storage.from(REPORT_EXPORT_BUCKET).upload(storagePath, artifact.buffer, {
    contentType: artifact.contentType,
    upsert: true,
  });

  if (error) {
    throw new Error(`Erro ao salvar export no storage: ${error.message}`);
  }

  return {
    storagePath,
    fileSizeBytes: artifact.buffer.byteLength,
  };
}

async function getAuthorizedRecipients(tenantId: string) {
  const { data, error } = await supabaseAdmin
    .from("profiles")
    .select("id, email, full_name, role, permissions, is_active")
    .eq("tenant_id", tenantId)
    .eq("is_active", true)
    .not("email", "is", null);

  if (error) {
    throw new Error(`Erro ao carregar destinatários: ${error.message}`);
  }

  const recipients: Array<{ id: string; email: string; full_name: string }> = [];
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

  return recipients;
}

function validateRecipientEmails(emails: string[]) {
  const deduped = Array.from(new Set(emails.map(normalizeEmail).filter(Boolean)));
  if (deduped.length === 0) throw new Error("Informe ao menos um destinatário");
  if (deduped.length > MAX_RECIPIENTS) {
    throw new Error(`Máximo de ${MAX_RECIPIENTS} destinatários por exportação`);
  }
  return deduped;
}

function parseSourcePayload(payload: Record<string, unknown>) {
  return {
    title: payload.title ? String(payload.title) : "Relatório Customizado",
    description: payload.description ? String(payload.description) : null,
    definition: (payload.definition || null) as CustomReportDefinition | null,
  };
}

async function updateExport(id: string, patch: Record<string, unknown>) {
  const { data, error } = await supabaseAdmin
    .from("report_exports")
    .update({
      ...patch,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .select("*")
    .single();

  if (error || !data) {
    throw new Error(`Erro ao atualizar export: ${error?.message || "desconhecido"}`);
  }

  return mapExportRow(data as Record<string, unknown>);
}

export class ReportExporterService {
  static async generateAdHocExport(params: {
    tenantId: string;
    userId: string;
    title: string;
    format: ReportExportFormat;
    document: ReportDocument;
    options?: ReportExportOptions;
  }) {
    const options = normalizeOptions(params.options);
    const artifact = await renderArtifact(params.document, params.format, options);
    if (artifact.buffer.byteLength > MAX_EXPORT_BYTES) {
      throw new Error("Arquivo excede o limite máximo de 100MB");
    }

    const now = new Date().toISOString();
    const { data, error } = await supabaseAdmin
      .from("report_exports")
      .insert({
        tenant_id: params.tenantId,
        requested_by: params.userId,
        source_type: "custom_builder",
        source_id: null,
        title: params.title,
        format: params.format,
        status: "processing",
        progress: 35,
        options,
        source_payload: {
          title: params.title,
          metadata: params.document.metadata,
        },
        started_at: now,
      })
      .select("*")
      .single();

    if (error || !data) {
      throw new Error(`Erro ao registrar export do chat: ${error?.message || "desconhecido"}`);
    }

    const exportRow = mapExportRow(data as Record<string, unknown>);
    const uploaded = await uploadArtifact(exportRow, artifact);
    const publicToken = randomBytes(24).toString("hex");
    const publicExpiresAt = new Date(Date.now() + PUBLIC_LINK_TTL_HOURS * 60 * 60 * 1000).toISOString();

    await updateExport(exportRow.id, {
      status: "success",
      progress: 100,
      file_name: artifact.fileName,
      storage_bucket: REPORT_EXPORT_BUCKET,
      storage_path: uploaded.storagePath,
      content_type: artifact.contentType,
      file_size_bytes: uploaded.fileSizeBytes,
      public_token: publicToken,
      public_expires_at: publicExpiresAt,
      finished_at: new Date().toISOString(),
    });

    const base = env.API_BASE_URL;
    const url = `${base}/api/reports/public-exports/${publicToken}/download`;

    void AuditService.log({
      userId: params.userId,
      action: "reports.export_chat_success",
      resource: "report_exports",
      entityId: exportRow.id,
      tenantId: params.tenantId,
      details: {
        message: `Export ad-hoc gerado via chat: ${params.title}`,
        format: params.format,
      },
    });

    return {
      id: exportRow.id,
      fileName: artifact.fileName,
      format: params.format,
      url,
    };
  }

  static async listExports(actor: ActorContext, filters?: {
    source_type?: ReportExportSourceType;
    source_id?: string;
    limit?: number;
  }) {
    if (!actor.tenant_id) throw new Error("Usuário sem tenant vinculado");

    let query = supabaseAdmin
      .from("report_exports")
      .select("*")
      .eq("requested_by", actor.id)
      .eq("tenant_id", actor.tenant_id)
      .order("created_at", { ascending: false })
      .limit(Math.min(filters?.limit || 10, 50));

    if (filters?.source_type) query = query.eq("source_type", filters.source_type);
    if (filters?.source_id) query = query.eq("source_id", filters.source_id);

    const { data, error } = await query;
    if (error) throw new Error(`Erro ao listar exports: ${error.message}`);
    return ((data || []) as Array<Record<string, unknown>>).map(mapExportRow);
  }

  static async getExport(exportId: string, actor: ActorContext) {
    const exportRow = await this.getExportById(exportId);
    if (!exportRow) return null;
    if (exportRow.requested_by !== actor.id && actor.role !== "master") return null;
    if (exportRow.tenant_id !== actor.tenant_id && actor.role !== "master") return null;
    return exportRow;
  }

  static async createExport(input: CreateReportExportInput, actor: ActorContext) {
    if (!actor.tenant_id) throw new Error("Usuário sem tenant vinculado");

    const options = normalizeOptions(input.options);
    let resolvedTitle = input.title?.trim() || "Relatório";
    let sourcePayload: Record<string, unknown> = {};
    let sourceId: string | null = input.source_id || null;

    if (input.source_type === "scheduled_report") {
      if (!input.source_id) throw new Error("Selecione o relatório agendado");
      const schedule = await ReportSchedulerService.getSchedule(input.source_id, actor.tenant_id);
      if (!schedule) throw new Error("Relatório agendado não encontrado");
      resolvedTitle = schedule.name;
    } else if (input.source_type === "custom_definition") {
      if (!input.source_id) throw new Error("Selecione a definição customizada");
      const definition = await CustomReportBuilderService.getDefinition(input.source_id, actor.tenant_id);
      if (!definition) throw new Error("Definição customizada não encontrada");
      resolvedTitle = definition.name;
    } else {
      if (!input.definition) throw new Error("Definição customizada obrigatória para export inline");
      buildDefinitionSql(input.definition, actor.tenant_id);
      sourceId = null;
      sourcePayload = {
        title: resolvedTitle,
        description: input.description?.trim() || null,
        definition: input.definition,
      };
    }

    const { data, error } = await supabaseAdmin
      .from("report_exports")
      .insert({
        tenant_id: actor.tenant_id,
        requested_by: actor.id,
        source_type: input.source_type,
        source_id: sourceId,
        title: resolvedTitle,
        format: input.format,
        status: "queued",
        progress: 0,
        options,
        source_payload: sourcePayload,
      })
      .select("*")
      .single();

    if (error || !data) {
      throw new Error(`Erro ao criar export: ${error?.message || "desconhecido"}`);
    }

    const exportRow = mapExportRow(data as Record<string, unknown>);
    void AuditService.log({
      userId: actor.id,
      action: "reports.export_request",
      resource: "report_exports",
      entityId: exportRow.id,
      tenantId: actor.tenant_id,
      details: {
        message: `Export solicitado: ${resolvedTitle}`,
        source_type: input.source_type,
        format: input.format,
      },
    });

    return exportRow;
  }

  static async processExport(exportId: string) {
    const exportRow = await this.getExportById(exportId);
    if (!exportRow) throw new Error("Export não encontrado");

    await updateExport(exportId, {
      status: "processing",
      progress: 10,
      started_at: new Date().toISOString(),
      error_message: null,
    });

    try {
      const document = await this.buildSourceDocument(exportRow);
      await updateExport(exportId, { progress: 35 });
      const artifact = await renderArtifact(document, exportRow.format, exportRow.options);

      if (artifact.buffer.byteLength > MAX_EXPORT_BYTES) {
        throw new Error("Arquivo excede o limite máximo de 100MB");
      }

      const uploaded = await uploadArtifact(exportRow, artifact);
      const updated = await updateExport(exportId, {
        status: "success",
        progress: 100,
        file_name: artifact.fileName,
        storage_bucket: REPORT_EXPORT_BUCKET,
        storage_path: uploaded.storagePath,
        content_type: artifact.contentType,
        file_size_bytes: uploaded.fileSizeBytes,
        finished_at: new Date().toISOString(),
      });

      return updated;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Erro desconhecido na exportação";
      return updateExport(exportId, {
        status: "failed",
        progress: 100,
        finished_at: new Date().toISOString(),
        error_message: message,
      });
    }
  }

  static async getDownloadUrl(exportId: string, actor: ActorContext) {
    const exportRow = await this.getExport(exportId, actor);
    if (!exportRow) throw new Error("Export não encontrado");
    if (exportRow.status !== "success" || !exportRow.storage_path || !exportRow.file_name) {
      throw new Error("Arquivo ainda não está disponível para download");
    }

    return createSignedDownloadUrl(exportRow.storage_path, exportRow.file_name);
  }

  static async shareExport(exportId: string, actor: ActorContext) {
    const exportRow = await this.getExport(exportId, actor);
    if (!exportRow) throw new Error("Export não encontrado");
    if (exportRow.status !== "success" || !exportRow.storage_path || !exportRow.file_name) {
      throw new Error("Arquivo ainda não está disponível");
    }

    const token = randomBytes(24).toString("hex");
    const expiresAt = new Date(Date.now() + PUBLIC_LINK_TTL_HOURS * 60 * 60 * 1000).toISOString();
    await updateExport(exportId, {
      public_token: token,
      public_expires_at: expiresAt,
    });

    return {
      token,
      expires_at: expiresAt,
      url: `${env.API_BASE_URL}/api/reports/public-exports/${token}/download`,
    };
  }

  static async emailExport(exportId: string, actor: ActorContext, emails: string[]) {
    const exportRow = await this.getExport(exportId, actor);
    if (!exportRow) throw new Error("Export não encontrado");
    if (exportRow.status !== "success" || !exportRow.storage_path || !exportRow.file_name) {
      throw new Error("Arquivo ainda não está disponível");
    }

    const normalized = validateRecipientEmails(emails);
    const eligible = await getAuthorizedRecipients(exportRow.tenant_id);
    const map = new Map(eligible.map((recipient) => [recipient.email, recipient]));
    const missing = normalized.filter((email) => !map.has(email));
    if (missing.length > 0) {
      throw new Error(`Emails não autorizados: ${missing.join(", ")}`);
    }

    const downloadUrl = await createSignedDownloadUrl(exportRow.storage_path, exportRow.file_name);
    const recipients = normalized.map((email) => map.get(email)!).filter(Boolean);
    await Promise.all(
      recipients.map((recipient) =>
        sendReportExportEmail({
          to: recipient.email,
          fullName: recipient.full_name,
          reportTitle: exportRow.title,
          fileName: exportRow.file_name!,
          format: exportRow.format,
          downloadUrl,
        }),
      ),
    );

    return updateExport(exportId, {
      recipients: recipients.map((recipient) => recipient.email),
      emailed_at: new Date().toISOString(),
    });
  }

  static async getPublicDownloadUrl(token: string) {
    const { data, error } = await supabaseAdmin
      .from("report_exports")
      .select("*")
      .eq("public_token", token)
      .maybeSingle();

    if (error || !data) throw new Error("Link público não encontrado");
    const exportRow = mapExportRow(data as Record<string, unknown>);
    if (!exportRow.public_expires_at || new Date(exportRow.public_expires_at).getTime() < Date.now()) {
      throw new Error("Link público expirado");
    }
    if (exportRow.status !== "success" || !exportRow.storage_path || !exportRow.file_name) {
      throw new Error("Arquivo indisponível");
    }

    return createSignedDownloadUrl(exportRow.storage_path, exportRow.file_name);
  }

  static async cleanupExpiredExports() {
    const { data, error } = await supabaseAdmin
      .from("report_exports")
      .select("id, storage_path")
      .lt("retention_expires_at", new Date().toISOString())
      .neq("status", "expired");

    if (error) throw new Error(`Erro ao buscar exports expirados: ${error.message}`);
    const rows = (data || []) as Array<{ id: string; storage_path: string | null }>;
    const paths = rows.map((row) => row.storage_path).filter(Boolean) as string[];
    if (paths.length > 0) {
      await supabaseAdmin.storage.from(REPORT_EXPORT_BUCKET).remove(paths).catch(() => undefined);
    }
    if (rows.length > 0) {
      await supabaseAdmin
        .from("report_exports")
        .update({ status: "expired", updated_at: new Date().toISOString() })
        .in("id", rows.map((row) => row.id));
    }
  }

  private static async buildSourceDocument(exportRow: ReportExportRow) {
    if (exportRow.source_type === "scheduled_report") {
      if (!exportRow.source_id) throw new Error("Export sem relatório agendado vinculado");
      const schedule = await ReportSchedulerService.getSchedule(exportRow.source_id, exportRow.tenant_id);
      if (!schedule) throw new Error("Relatório agendado não encontrado");
      return buildScheduledReportDocument(schedule);
    }

    if (exportRow.source_type === "custom_definition") {
      if (!exportRow.source_id) throw new Error("Export sem definição vinculada");
      const definition = await CustomReportBuilderService.getDefinition(exportRow.source_id, exportRow.tenant_id);
      if (!definition) throw new Error("Definição customizada não encontrada");
      return buildCustomDefinitionDocument({
        tenantId: exportRow.tenant_id,
        name: definition.name,
        description: definition.description,
        definition: definition.definition,
      });
    }

    const payload = parseSourcePayload(exportRow.source_payload);
    if (!payload.definition) throw new Error("Payload de export customizado inválido");
    buildDefinitionSql(payload.definition, exportRow.tenant_id);
    return buildCustomDefinitionDocument({
      tenantId: exportRow.tenant_id,
      name: payload.title,
      description: payload.description,
      definition: payload.definition,
    });
  }

  private static async getExportById(exportId: string) {
    const { data, error } = await supabaseAdmin
      .from("report_exports")
      .select("*")
      .eq("id", exportId)
      .maybeSingle();

    if (error) throw new Error(`Erro ao buscar export: ${error.message}`);
    return data ? mapExportRow(data as Record<string, unknown>) : null;
  }
}
