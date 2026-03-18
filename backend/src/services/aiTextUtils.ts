const SUSPICIOUS_TEXT_PATTERN = /[\u00c3\u00c2\u00e2\u00f0\uFFFD]/;
const GENERATED_EXPORT_URL_PATTERN =
  /\/api\/reports\/(?:exports\/[^)\s]+\/download|public-exports\/[^)\s]+\/download)|\/storage\/v1\/object\/public\/report-exports\//i;
const GENERATED_EXPORT_FILE_PATTERN = /\.(pdf|xlsx|xls|csv|html|json)\b/i;

const re = (pattern: string, flags = "g") => new RegExp(pattern, flags);

const COMMON_MOJIBAKE_REPLACEMENTS: ReadonlyArray<readonly [RegExp, string]> = [
  [re("\u00c3\u00a1"), "\u00e1"],
  [re("\u00c3\u00a2"), "\u00e2"],
  [re("\u00c3\u00a3"), "\u00e3"],
  [re("\u00c3\u00a4"), "\u00e4"],
  [re("\u00c3\u00a7"), "\u00e7"],
  [re("\u00c3\u00a9"), "\u00e9"],
  [re("\u00c3\u00aa"), "\u00ea"],
  [re("\u00c3\u00ad"), "\u00ed"],
  [re("\u00c3\u00b3"), "\u00f3"],
  [re("\u00c3\u00b4"), "\u00f4"],
  [re("\u00c3\u00b5"), "\u00f5"],
  [re("\u00c3\u00ba"), "\u00fa"],
  [re("\u00c3\u0080"), "\u00c0"],
  [re("\u00c3\u0081"), "\u00c1"],
  [re("\u00c3\u0082"), "\u00c2"],
  [re("\u00c3\u0083"), "\u00c3"],
  [re("\u00c3\u0087"), "\u00c7"],
  [re("\u00c3\u0089"), "\u00c9"],
  [re("\u00c3\u008a"), "\u00ca"],
  [re("\u00c3\u008d"), "\u00cd"],
  [re("\u00c3\u0093"), "\u00d3"],
  [re("\u00c3\u0094"), "\u00d4"],
  [re("\u00c3\u0095"), "\u00d5"],
  [re("\u00c3\u009a"), "\u00da"],
  [re("\u00e2\u20ac\u201c"), "\u2013"],
  [re("\u00e2\u20ac\u201d"), "\u2014"],
  [re("\u00e2\u20ac\u02dc"), "\u2018"],
  [re("\u00e2\u20ac\u2122"), "\u2019"],
  [re("\u00e2\u20ac\u0153"), "\u201c"],
  [re("\u00e2\u20ac\ufffd"), "\u201d"],
  [re("\u00e2\u20ac\u00a2"), "\u2022"],
  [re("\u00e2\u20ac\u00a6"), "\u2026"],
  [re("\u00e2\u2020\u2019"), "\u2192"],
  [re("\u00c2\u00b7"), "\u00b7"],
  [re("\u00c2 "), " "],
  [re("\u00e2\u0161\u00a0\u00ef\u00b8\u008f"), "\u26a0\ufe0f"],
  [re("\u00f0\u0178\u201c\u017d"), "\ud83d\udcce"],
  [re("\u00f0\u0178\u201c\u02c6"), "\ud83d\udcc8"],
  [re("\u00f0\u0178\u201c\u2030"), "\ud83d\udcc9"],
  [re("\u00f0\u0178\u2019\u00b0"), "\ud83d\udcb0"],
  [re("\u00f0\u0178\u2019\u00a1"), "\ud83d\udca1"],
  [re("\u00f0\u0178\u201d\u00b4"), "\ud83d\udd34"],
  [re("\u00f0\u0178\u0178\u00a2"), "\ud83d\udfe2"],
  [re("\u00f0\u0178\u0161\u20ac"), "\ud83d\ude80"],
  [re("\u00f0\u0178\u0161\u00a8"), "\ud83d\udea8"],
];

function applyCommonTextFixes(text: string) {
  let current = text;

  for (const [pattern, replacement] of COMMON_MOJIBAKE_REPLACEMENTS) {
    current = current.replace(pattern, replacement);
  }

  return current
    .replace(/\u00a0/g, " ")
    .replace(/\u00c2(?=[!-/:-@[-`{-~])/g, "");
}

function decodeLatin1AsUtf8(text: string) {
  const bytes = Uint8Array.from(Array.from(text, (char) => char.charCodeAt(0) & 0xff));
  return Buffer.from(bytes).toString("utf8");
}

function getSuspiciousScore(text: string) {
  return (text.match(/[\u00c3\u00c2\u00e2\u00f0\uFFFD]/g) || []).length;
}

function normalizeForMatch(text: string) {
  return repairTextArtifacts(text)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function isGeneratedExportLine(line: string) {
  const trimmed = repairTextArtifacts(line).trim();
  if (!trimmed) return false;

  const normalized = normalizeForMatch(trimmed);
  const hasDownloadWord = normalized.includes("baixar") || normalized.includes("download");
  const hasExportFile = GENERATED_EXPORT_FILE_PATTERN.test(trimmed);
  const hasExportUrl = GENERATED_EXPORT_URL_PATTERN.test(trimmed);
  const hasReadyMessage =
    normalized.includes("relatorio pronto") ||
    normalized.includes("arquivo pronto") ||
    normalized.includes("arquivo pdf");

  if (hasExportUrl) return true;
  if (/\[[^\]]+\]\([^)]+\)/.test(trimmed) && (hasDownloadWord || hasExportFile)) return true;
  if (hasReadyMessage && (hasDownloadWord || normalized.includes("gerado"))) return true;
  if (hasDownloadWord && hasExportFile) return true;

  // Catch any remaining "Relatório pronto" or clipboard/pin emoji export lines the model invents
  if (normalized.includes("relatorio pronto") || normalized.includes("arquivo gerado")) return true;
  if (/📎/.test(trimmed) && (hasDownloadWord || hasExportFile || hasReadyMessage)) return true;
  // Remove lines with invented markdown links to fake report files
  if (/\[[^\]]*baixar[^\]]*\]\([^)]+\)/i.test(trimmed)) return true;
  // Catch "o relatório/arquivo foi gerado e será anexado/enviado" style lines
  if ((normalized.includes("foi gerado") || normalized.includes("sera anexado") || normalized.includes("sera enviado")) &&
      (normalized.includes("relatorio") || normalized.includes("arquivo") || normalized.includes("excel") || normalized.includes("pdf"))) return true;

  return false;
}

export type RequestedExportFormat = "csv" | "xlsx" | "html" | "json" | "pdf";

export function parseRequestedExportFormat(userMessage: string): RequestedExportFormat | null {
  const normalized = normalizeForMatch(userMessage);
  if (/\bpdf\b/.test(normalized)) return "pdf";
  if (/\b(xlsx|excel|planilha)\b/.test(normalized)) return "xlsx";
  if (/\bcsv\b/.test(normalized)) return "csv";
  if (/\bhtml\b/.test(normalized)) return "html";
  if (/\bjson\b/.test(normalized)) return "json";
  return null;
}

export function buildChatExportTitle(functionName: string, userMessage: string) {
  const TITLE_MAP: Record<string, string> = {
    executiveSummary: "Resumo Executivo",
    compareMarketplaces: "Comparativo por Marketplace",
    ordersByMarketplace: "Vendas por Marketplace",
    salesByMonth: "Evolução Mensal de Vendas",
    totalSales: "Faturamento Total",
    countOrders: "Total de Pedidos",
    cancellationRate: "Taxa de Cancelamento",
    customerCount: "Base de Clientes",
    topBuyers: "Top Clientes",
    topDays: "Melhores Dias de Venda",
    seasonalityAnalysis: "Análise de Sazonalidade",
    yearOverYear: "Comparativo Ano a Ano",
    inactiveCustomers: "Clientes Inativos",
    newCustomers: "Novos Clientes",
    customerPurchasePatterns: "Comportamento de Compra",
    comparePeriods: "Comparação de Períodos",
  };

  // Always use a descriptive title based on the function called
  const baseTitle = TITLE_MAP[functionName] || functionName.replace(/([a-z])([A-Z])/g, "$1 $2");

  // Extract period/context from the user message (e.g. "dezembro de 2025", "últimos 90 dias")
  const normalized = normalizeForMatch(userMessage);
  const periodMatch = normalized.match(
    /\b(janeiro|fevereiro|mar[cç]o|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro)\s+(?:de\s+)?\d{4}\b/i
  ) || normalized.match(
    /\b(?:ultimos|últimos)\s+\d+\s+(?:dias|meses)\b/i
  ) || normalized.match(
    /\b\d{4}\b/
  );

  const periodSuffix = periodMatch ? ` - ${periodMatch[0].charAt(0).toUpperCase() + periodMatch[0].slice(1)}` : "";

  return `${baseTitle}${periodSuffix}`.slice(0, 80);
}

export function sanitizeModelExportText(text: string) {
  return repairTextArtifacts(text)
    .split(/\r?\n/)
    .filter((line) => !isGeneratedExportLine(line))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * Remove U+FFFD replacement characters by inferring the most likely
 * Portuguese accented character from surrounding context.
 * This handles the case where UTF-8 bytes were irreversibly lost.
 */
function repairReplacementChars(text: string): string {
  if (!text.includes("\uFFFD")) return text;

  // Common Portuguese patterns where U+FFFD replaces an accented char
  // Format: [regex matching U+FFFD in context, replacement]
  const contextualFixes: ReadonlyArray<readonly [RegExp, string]> = [
    // ção/ções (ação, distribuição, etc.)
    [/\uFFFD\u00e7\u00e3o/g, "ição"],
    [/\u00e7\uFFFD\u006f/g, "ção"],
    [/\u00e7\uFFFDo/g, "ção"],
    [/\uFFFD\uFFFDo\b/g, "ção"],
    [/\uFFFD\uFFFDes\b/g, "ções"],
    // está, estão
    [/est\uFFFD\b/g, "está"],
    [/est\uFFFDo\b/g, "estão"],
    // é (single replacement)
    [/\bper\uFFFDodo/g, "período"],
    [/\bPer\uFFFDodo/g, "Período"],
    [/\bVis\uFFFDo\b/g, "Visão"],
    [/\bvis\uFFFDo\b/g, "visão"],
    [/\bAn\uFFFDlise/g, "Análise"],
    [/\ban\uFFFDlise/g, "análise"],
    [/\bRelat\uFFFDrio/g, "Relatório"],
    [/\brelat\uFFFDrio/g, "relatório"],
    [/\bExperi\uFFFDncia/g, "Experiência"],
    [/\bexperi\uFFFDncia/g, "experiência"],
    [/\btend\uFFFDncia/g, "tendência"],
    [/\bTend\uFFFDncia/g, "Tendência"],
    [/\bm\uFFFDdia/g, "média"],
    [/\bm\uFFFDdio/g, "médio"],
    [/\bm\uFFFDs\b/g, "mês"],
    [/\bM\uFFFDs\b/g, "Mês"],
    [/\b\uFFFDrea\b/g, "área"],
    [/\b\uFFFDltima/g, "última"],
    [/\b\uFFFDltimo/g, "último"],
    [/\bstrat\uFFFDgia/g, "estratégia"],
    [/\bestrat\uFFFDgia/g, "estratégia"],
    [/\bEstrat\uFFFDgia/g, "Estratégia"],
    [/\bRecomenda\uFFFD\uFFFDes/g, "Recomendações"],
    [/\brecomenda\uFFFD\uFFFDes/g, "recomendações"],
    [/\bDistribui\uFFFD\uFFFDo/g, "Distribuição"],
    [/\bdistribui\uFFFD\uFFFDo/g, "distribuição"],
    [/\botimiza\uFFFD\uFFFDo/g, "otimização"],
    [/\binvestiga\uFFFD\uFFFDo/g, "investigação"],
    [/\bmovimenta\uFFFD\uFFFDo/g, "movimentação"],
    [/\bfatura\uFFFD\uFFFDo/g, "faturação"],
    [/\balcan\uFFFDado/g, "alcançado"],
    // Generic: single U+FFFD between word chars — likely an accent
    // Remove it to at least produce readable text
    [/(\w)\uFFFD(\w)/g, "$1$2"],
    // Leading/trailing U+FFFD in known emoji contexts (◆x◆ pattern)
    [/\uFFFDx\uFFFD/g, "📊"],
    [/\uFFFD{1,2}/g, ""],
  ];

  let result = text;
  for (const [pattern, replacement] of contextualFixes) {
    result = result.replace(pattern, replacement);
  }
  return result;
}

export function repairTextArtifacts(text: string) {
  if (!text) return text;

  let current = applyCommonTextFixes(text);
  if (!SUSPICIOUS_TEXT_PATTERN.test(current)) return current;

  let best = current;
  let bestScore = getSuspiciousScore(best);

  for (let index = 0; index < 2; index++) {
    try {
      const repaired = applyCommonTextFixes(decodeLatin1AsUtf8(current));
      const repairedScore = getSuspiciousScore(repaired);

      if (repaired === current || repairedScore > bestScore) {
        break;
      }

      best = repaired;
      bestScore = repairedScore;
      current = repaired;
    } catch {
      break;
    }
  }

  // Final pass: repair any remaining U+FFFD replacement characters
  // using Portuguese contextual inference
  best = repairReplacementChars(applyCommonTextFixes(best));

  return best;
}
