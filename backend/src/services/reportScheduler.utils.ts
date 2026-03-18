export type ReportType = "sales" | "products" | "customers" | "finance" | "custom";
export type ReportFormat = "csv" | "xlsx" | "html";
export type ScheduleFrequency = "daily" | "weekly" | "monthly" | "quarterly" | "annual" | "custom";
export type ScheduleStatus = "active" | "paused" | "error";

export interface ScheduleConfigInput {
  frequency: ScheduleFrequency;
  time: string;
  day_of_week?: number | null;
  day_of_month?: number | null;
  month_of_year?: number | null;
  cron_expression?: string | null;
  timezone?: string | null;
}

export interface ReportFiltersInput {
  period_mode: "relative" | "fixed";
  relative_period?: "yesterday" | "last_7_days" | "previous_month_complete" | null;
  start_date?: string | null;
  end_date?: string | null;
  status?: string | null;
  marketplace?: string | null;
  category?: string | null;
  low_stock?: boolean | null;
  out_of_stock?: boolean | null;
  excess_stock?: boolean | null;
}

export interface ScheduledReportInput {
  name: string;
  report_type: ReportType;
  custom_report_id?: string | null;
  format: ReportFormat;
  is_active: boolean;
  recipients: string[];
  schedule: ScheduleConfigInput;
  filters: ReportFiltersInput;
}

export interface EligibleRecipient {
  id: string;
  email: string;
  full_name: string;
}

export interface PreviewResult {
  cronExpression: string;
  nextRunAt: string;
  description: string;
}

export interface ScheduledReportRow {
  id: string;
  tenant_id: string;
  created_by: string;
  updated_by: string | null;
  name: string;
  report_type: ReportType;
  custom_report_id: string | null;
  format: ReportFormat;
  status: ScheduleStatus;
  timezone: string;
  cron_expression: string;
  schedule_config: Record<string, unknown>;
  filters: Record<string, unknown>;
  recipients: string[];
  next_run_at: string | null;
  last_run_at: string | null;
  last_success_at: string | null;
  last_error_at: string | null;
  last_error_message: string | null;
  last_execution_status: "success" | "failed" | null;
  consecutive_failures: number;
  created_at: string;
  updated_at: string;
}

export interface ReportExecutionRow {
  id: string;
  scheduled_report_id: string;
  tenant_id: string;
  requested_by: string | null;
  execution_type: "scheduled" | "manual";
  attempt_number: number;
  status: "running" | "success" | "failed";
  subject: string | null;
  recipients: string[];
  file_name: string | null;
  storage_bucket: string | null;
  storage_path: string | null;
  content_type: string | null;
  file_size_bytes: number | null;
  duration_ms: number | null;
  executed_at: string;
  started_at: string;
  finished_at: string | null;
  error_message: string | null;
}

export interface GeneratedSheet {
  name: string;
  rows: Array<Record<string, string | number | null>>;
}

export const REPORT_BUCKET = "scheduled-reports";
export const REPORT_TIMEZONE = "America/Sao_Paulo";
export const MAX_RECIPIENTS = 20;
export const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024;
export const DOWNLOAD_URL_TTL_SECONDS = 60 * 60 * 24 * 7;
export const QUICK_DOWNLOAD_TTL_SECONDS = 60 * 15;

export const WEEKDAY_LABELS = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"] as const;
export const MONTH_LABELS = [
  "Janeiro",
  "Fevereiro",
  "Março",
  "Abril",
  "Maio",
  "Junho",
  "Julho",
  "Agosto",
  "Setembro",
  "Outubro",
  "Novembro",
  "Dezembro",
] as const;

export const REPORT_TYPE_LABELS: Record<ReportType, string> = {
  sales: "Vendas",
  products: "Produtos",
  customers: "Clientes",
  finance: "Financeiro",
  custom: "Customizado",
};

type CronFieldKind = "minute" | "hour" | "dayOfMonth" | "month" | "dayOfWeek";

interface ParsedCronField {
  wildcard: boolean;
  values: Set<number>;
}

export function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

export function sanitizeFilename(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9-_]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase();
}

export function formatCurrency(value: number): string {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function formatPercent(value: number): string {
  return `${value.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;
}

export function formatDateTime(value: string | Date | null | undefined): string {
  if (!value) return "—";
  const date = value instanceof Date ? value : new Date(value);
  return date.toLocaleString("pt-BR", {
    timeZone: REPORT_TIMEZONE,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatDateOnly(value: string | Date | null | undefined): string {
  if (!value) return "—";
  const date = value instanceof Date ? value : new Date(value);
  return date.toLocaleDateString("pt-BR", {
    timeZone: REPORT_TIMEZONE,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

export function escapeHtml(input: string): string {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

export function ensureStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => String(item || "").trim()).filter(Boolean);
}

function parseNumber(value: string, kind: CronFieldKind): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) {
    throw new Error(`Valor cron inválido para ${kind}`);
  }

  if (kind === "minute" && (parsed < 0 || parsed > 59)) throw new Error("Minuto fora do intervalo permitido");
  if (kind === "hour" && (parsed < 0 || parsed > 23)) throw new Error("Hora fora do intervalo permitido");
  if (kind === "dayOfMonth" && (parsed < 1 || parsed > 31)) throw new Error("Dia do mês fora do intervalo permitido");
  if (kind === "month" && (parsed < 1 || parsed > 12)) throw new Error("Mês fora do intervalo permitido");
  if (kind === "dayOfWeek" && (parsed < 0 || parsed > 7)) throw new Error("Dia da semana fora do intervalo permitido");

  return kind === "dayOfWeek" && parsed === 7 ? 0 : parsed;
}

function expandCronToken(token: string, kind: CronFieldKind): number[] {
  const bounds: Record<CronFieldKind, [number, number]> = {
    minute: [0, 59],
    hour: [0, 23],
    dayOfMonth: [1, 31],
    month: [1, 12],
    dayOfWeek: [0, 6],
  };

  if (token === "*") {
    const [start, end] = bounds[kind];
    return Array.from({ length: end - start + 1 }, (_, index) => start + index);
  }

  const [rangeExpression, stepText] = token.split("/");
  const step = stepText ? Number(stepText) : 1;
  if (!Number.isInteger(step) || step <= 0) {
    throw new Error("Passo cron inválido");
  }

  if (rangeExpression === "*") {
    return expandCronToken("*", kind).filter((value, index) => index % step === 0);
  }

  let rangeStart: number;
  let rangeEnd: number;
  if (rangeExpression.includes("-")) {
    const [startText, endText] = rangeExpression.split("-");
    rangeStart = parseNumber(startText, kind);
    rangeEnd = parseNumber(endText, kind);
  } else {
    rangeStart = parseNumber(rangeExpression, kind);
    rangeEnd = rangeStart;
  }

  if (rangeStart > rangeEnd) {
    throw new Error("Faixa cron inválida");
  }

  const values: number[] = [];
  for (let value = rangeStart; value <= rangeEnd; value += step) {
    values.push(kind === "dayOfWeek" && value === 7 ? 0 : value);
  }
  return values;
}

function parseCronField(expression: string, kind: CronFieldKind): ParsedCronField {
  const normalized = expression.trim();
  if (!normalized) {
    throw new Error("Campo cron vazio");
  }

  if (normalized === "*") {
    return {
      wildcard: true,
      values: new Set(expandCronToken("*", kind)),
    };
  }

  const values = new Set<number>();
  normalized.split(",").forEach((token) => {
    expandCronToken(token.trim(), kind).forEach((value) => values.add(value));
  });

  return { wildcard: false, values };
}

export function parseCronExpression(expression: string) {
  const tokens = expression.trim().split(/\s+/);
  if (tokens.length !== 5) {
    throw new Error("Cron expression deve ter 5 campos");
  }

  return {
    minute: parseCronField(tokens[0], "minute"),
    hour: parseCronField(tokens[1], "hour"),
    dayOfMonth: parseCronField(tokens[2], "dayOfMonth"),
    month: parseCronField(tokens[3], "month"),
    dayOfWeek: parseCronField(tokens[4], "dayOfWeek"),
  };
}

export function getZonedParts(date: Date, timeZone = REPORT_TIMEZONE) {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    weekday: "short",
    hourCycle: "h23",
  });

  const parts = formatter.formatToParts(date);
  const partMap = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const weekdayMap: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };

  return {
    year: Number(partMap.year),
    month: Number(partMap.month),
    day: Number(partMap.day),
    hour: Number(partMap.hour),
    minute: Number(partMap.minute),
    second: Number(partMap.second),
    dayOfWeek: weekdayMap[partMap.weekday] ?? 0,
  };
}

function roundToNextMinute(date: Date): Date {
  const rounded = new Date(date.getTime());
  rounded.setSeconds(0, 0);
  rounded.setMinutes(rounded.getMinutes() + 1);
  return rounded;
}

export function cronMatches(expression: string, date: Date, timeZone = REPORT_TIMEZONE): boolean {
  const cron = parseCronExpression(expression);
  const parts = getZonedParts(date, timeZone);

  const minuteMatch = cron.minute.values.has(parts.minute);
  const hourMatch = cron.hour.values.has(parts.hour);
  const monthMatch = cron.month.values.has(parts.month);
  const dayOfMonthMatch = cron.dayOfMonth.values.has(parts.day);
  const dayOfWeekMatch = cron.dayOfWeek.values.has(parts.dayOfWeek);

  const dayMatches =
    cron.dayOfMonth.wildcard && cron.dayOfWeek.wildcard
      ? true
      : cron.dayOfMonth.wildcard
        ? dayOfWeekMatch
        : cron.dayOfWeek.wildcard
          ? dayOfMonthMatch
          : dayOfMonthMatch || dayOfWeekMatch;

  return minuteMatch && hourMatch && monthMatch && dayMatches;
}

export function findNextRun(expression: string, fromDate = new Date(), timeZone = REPORT_TIMEZONE): Date {
  parseCronExpression(expression);
  let cursor = roundToNextMinute(fromDate);
  const horizon = fromDate.getTime() + 1000 * 60 * 60 * 24 * 366 * 2;

  while (cursor.getTime() <= horizon) {
    if (cronMatches(expression, cursor, timeZone)) {
      return cursor;
    }
    cursor = new Date(cursor.getTime() + 60_000);
  }

  throw new Error("Não foi possível calcular a próxima execução");
}

function parseTime(value: string): { hour: number; minute: number } {
  const match = /^(\d{2}):(\d{2})$/.exec(value);
  if (!match) {
    throw new Error("Horário inválido. Use HH:mm");
  }

  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) {
    throw new Error("Horário inválido");
  }

  return { hour, minute };
}

export function buildCronExpression(schedule: ScheduleConfigInput): string {
  const timezone = schedule.timezone || REPORT_TIMEZONE;
  if (timezone !== REPORT_TIMEZONE) {
    throw new Error("Somente America/Sao_Paulo é suportado nesta versão");
  }

  if (schedule.frequency === "custom") {
    const expression = schedule.cron_expression?.trim();
    if (!expression) {
      throw new Error("Informe a cron expression");
    }
    parseCronExpression(expression);
    return expression;
  }

  const { hour, minute } = parseTime(schedule.time);
  switch (schedule.frequency) {
    case "daily":
      return `${minute} ${hour} * * *`;
    case "weekly":
      if (schedule.day_of_week === undefined || schedule.day_of_week === null) {
        throw new Error("Selecione o dia da semana");
      }
      return `${minute} ${hour} * * ${schedule.day_of_week}`;
    case "monthly":
      if (!schedule.day_of_month) {
        throw new Error("Selecione o dia do mês");
      }
      return `${minute} ${hour} ${schedule.day_of_month} * *`;
    case "quarterly":
      if (!schedule.day_of_month) {
        throw new Error("Selecione o dia do mês");
      }
      return `${minute} ${hour} ${schedule.day_of_month} 1,4,7,10 *`;
    case "annual":
      if (!schedule.day_of_month || !schedule.month_of_year) {
        throw new Error("Selecione o mês e o dia");
      }
      return `${minute} ${hour} ${schedule.day_of_month} ${schedule.month_of_year} *`;
    default:
      throw new Error("Frequência de agendamento não suportada");
  }
}

export function normalizeScheduleConfig(schedule: ScheduleConfigInput) {
  const cronExpression = buildCronExpression(schedule);
  const nextRunAt = findNextRun(cronExpression, new Date(), schedule.timezone || REPORT_TIMEZONE);

  return {
    cronExpression,
    nextRunAt,
    timezone: schedule.timezone || REPORT_TIMEZONE,
  };
}

export function describeSchedule(schedule: ScheduleConfigInput): string {
  switch (schedule.frequency) {
    case "daily":
      return `Diário às ${schedule.time}`;
    case "weekly":
      return `Semanalmente às ${schedule.time}, ${WEEKDAY_LABELS[schedule.day_of_week || 0]}`;
    case "monthly":
      return `Mensalmente no dia ${schedule.day_of_month} às ${schedule.time}`;
    case "quarterly":
      return `Trimestralmente no dia ${schedule.day_of_month} às ${schedule.time}`;
    case "annual":
      return `Anualmente em ${schedule.day_of_month} de ${MONTH_LABELS[(schedule.month_of_year || 1) - 1]} às ${schedule.time}`;
    case "custom":
      return `Cron personalizada: ${schedule.cron_expression}`;
    default:
      return schedule.frequency;
  }
}

export function defaultRelativePeriod(reportType: ReportType): NonNullable<ReportFiltersInput["relative_period"]> {
  if (reportType === "finance") return "previous_month_complete";
  return "last_7_days";
}

export function resolveDateWindow(filters: ReportFiltersInput, reportType: ReportType) {
  const now = new Date();
  const parts = getZonedParts(now);

  if (filters.period_mode === "fixed") {
    if (!filters.start_date || !filters.end_date) {
      throw new Error("Informe a data inicial e final");
    }
    return {
      label: `${filters.start_date} até ${filters.end_date}`,
      startDate: filters.start_date,
      endDate: filters.end_date,
    };
  }

  const preset = filters.relative_period || defaultRelativePeriod(reportType);
  if (preset === "yesterday") {
    const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const yesterdayParts = getZonedParts(yesterday);
    const value = `${yesterdayParts.year}-${String(yesterdayParts.month).padStart(2, "0")}-${String(yesterdayParts.day).padStart(2, "0")}`;
    return { label: "Ontem", startDate: value, endDate: value };
  }

  if (preset === "last_7_days") {
    const start = new Date(now.getTime() - 6 * 24 * 60 * 60 * 1000);
    const startParts = getZonedParts(start);
    return {
      label: "Últimos 7 dias",
      startDate: `${startParts.year}-${String(startParts.month).padStart(2, "0")}-${String(startParts.day).padStart(2, "0")}`,
      endDate: `${parts.year}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`,
    };
  }

  const previousMonth = parts.month === 1 ? 12 : parts.month - 1;
  const previousYear = parts.month === 1 ? parts.year - 1 : parts.year;
  const lastDay = new Date(Date.UTC(previousYear, previousMonth, 0)).getUTCDate();

  return {
    label: "Mês anterior completo",
    startDate: `${previousYear}-${String(previousMonth).padStart(2, "0")}-01`,
    endDate: `${previousYear}-${String(previousMonth).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`,
  };
}
