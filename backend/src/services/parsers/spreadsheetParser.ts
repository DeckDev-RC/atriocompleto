import XLSX from "xlsx";
import type { ParsedFileResult, SpreadsheetValidationResult } from "./types";

type RowObject = Record<string, unknown>;

function normalizeHeader(header: unknown): string {
  return String(header || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function normalizeCell(value: unknown): string {
  return String(value ?? "")
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function toNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const cleaned = String(value).replace(/\./g, "").replace(",", ".");
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : null;
}

function computeNumericStats(rows: RowObject[], headers: string[]) {
  const stats: Record<string, { count: number; sum: number; min: number; max: number; avg: number }> = {};

  headers.forEach((header) => {
    const numericValues = rows
      .map((row) => toNumber(row[header]))
      .filter((value): value is number => value !== null);

    if (numericValues.length === 0) return;

    const sum = numericValues.reduce((acc, value) => acc + value, 0);
    stats[header] = {
      count: numericValues.length,
      sum,
      min: Math.min(...numericValues),
      max: Math.max(...numericValues),
      avg: sum / numericValues.length,
    };
  });

  return stats;
}

function findRelevantColumns(headers: string[]) {
  const map: Record<string, string | undefined> = {};
  const checks: Array<[string, RegExp]> = [
    ["sku", /\bsku\b|codigo|cod_prod|ref/],
    ["name", /\bnome\b|produto|item|descricao/],
    ["category", /categoria|grupo|departamento/],
    ["price", /preco|valor|sale_price|venda/],
    ["cost", /custo|cost_price/],
    ["stock", /estoque|quantidade|qty|saldo/],
  ];

  for (const [key, regex] of checks) {
    map[key] = headers.find((header) => regex.test(header));
  }

  return map;
}

export function parseSpreadsheetFile(buffer: Buffer, originalName: string): ParsedFileResult {
  const workbook = XLSX.read(buffer, { type: "buffer", cellDates: true });
  const sheets = workbook.SheetNames.map((sheetName) => {
    const sheet = workbook.Sheets[sheetName];
    const rawRows = XLSX.utils.sheet_to_json<(string | number | null)[]>(sheet, {
      header: 1,
      defval: null,
      raw: false,
      blankrows: false,
    });

    const headerRow = rawRows[0] || [];
    const normalizedHeaders = headerRow.map(normalizeHeader).map((header, index) => header || `col_${index + 1}`);
    const rows = XLSX.utils
      .sheet_to_json<RowObject>(sheet, { defval: null, raw: false })
      .map((row) =>
        Object.fromEntries(
          Object.entries(row).map(([key, value]) => [normalizeHeader(key), value]),
        ) as RowObject,
      );
    const sampleRows = rows.slice(0, 20);
    const duplicateRows = new Set<string>();
    let duplicateCount = 0;

    rows.forEach((row) => {
      const key = JSON.stringify(row);
      if (duplicateRows.has(key)) duplicateCount++;
      duplicateRows.add(key);
    });

    return {
      name: sheetName,
      row_count: rows.length,
      column_count: normalizedHeaders.length,
      headers: normalizedHeaders,
      sample_rows: sampleRows,
      numeric_stats: computeNumericStats(rows, normalizedHeaders),
      empty_cells: rows.reduce((acc, row) => {
        return acc + Object.values(row).filter((value) => value === null || value === "").length;
      }, 0),
      duplicate_rows: duplicateCount,
      relevant_columns: findRelevantColumns(normalizedHeaders),
    };
  });

  const totalRows = sheets.reduce((acc, sheet) => acc + Number(sheet.row_count || 0), 0);
  const extractedText = sheets
    .map((sheet) => {
      const rows = (sheet.sample_rows as RowObject[]).map((row) =>
        Object.entries(row)
          .map(([key, value]) => `${key}: ${value ?? ""}`)
          .join(" | "),
      );
      return `Aba ${sheet.name} (${sheet.row_count} linhas)\nHeaders: ${(sheet.headers as string[]).join(", ")}\n${rows.join("\n")}`;
    })
    .join("\n\n");

  return {
    parserName: "spreadsheet-parser",
    fileKind: "spreadsheet",
    extractedText,
    extractedJson: {
      original_name: originalName,
      sheet_count: sheets.length,
      total_rows: totalRows,
      sheets,
    },
    summaryHint: `Planilha com ${sheets.length} aba(s) e ${totalRows} linhas.`,
    metadata: {
      sheetNames: workbook.SheetNames,
      validationRows: sheets.flatMap((sheet) => {
        return (sheet.sample_rows as RowObject[]).slice(0, 50);
      }),
    },
  };
}

export function validateSpreadsheetRows(
  rows: Array<Record<string, unknown>>,
  catalog: Array<Record<string, unknown>>,
): SpreadsheetValidationResult {
  const examples: Array<Record<string, unknown>> = [];
  let matchedProducts = 0;
  let missingProducts = 0;
  let priceMismatches = 0;
  let stockMismatches = 0;

  const catalogBySku = new Map<string, Record<string, unknown>>();
  const catalogByName = new Map<string, Record<string, unknown>>();

  catalog.forEach((item) => {
    const sku = normalizeCell(item.sku);
    const name = normalizeCell(item.name);
    if (sku) catalogBySku.set(sku, item);
    if (name) catalogByName.set(name, item);
  });

  rows.slice(0, 1000).forEach((row) => {
    const normalized = Object.fromEntries(
      Object.entries(row).map(([key, value]) => [normalizeHeader(key), value]),
    );

    const sku = normalizeCell(normalized.sku ?? normalized.codigo ?? normalized.ref ?? normalized.codigo_produto);
    const name = normalizeCell(normalized.nome ?? normalized.produto ?? normalized.item ?? normalized.descricao);
    const catalogMatch = (sku && catalogBySku.get(sku)) || (name && catalogByName.get(name));

    if (!catalogMatch) {
      missingProducts++;
      if (examples.length < 10) {
        examples.push({ type: "missing_product", sku, name });
      }
      return;
    }

    matchedProducts++;

    const price = toNumber(normalized.preco ?? normalized.valor ?? normalized.sale_price ?? normalized.preco_venda);
    const stock = toNumber(normalized.estoque ?? normalized.quantidade ?? normalized.qty ?? normalized.saldo);
    const catalogPrice = toNumber(catalogMatch.sale_price);
    const catalogStock = toNumber(catalogMatch.stock_level);

    if (price !== null && catalogPrice !== null && Math.abs(price - catalogPrice) > 0.01) {
      priceMismatches++;
      if (examples.length < 10) {
        examples.push({
          type: "price_mismatch",
          sku: catalogMatch.sku,
          name: catalogMatch.name,
          sheet_price: price,
          catalog_price: catalogPrice,
        });
      }
    }

    if (stock !== null && catalogStock !== null && Math.round(stock) !== Math.round(catalogStock)) {
      stockMismatches++;
      if (examples.length < 10) {
        examples.push({
          type: "stock_mismatch",
          sku: catalogMatch.sku,
          name: catalogMatch.name,
          sheet_stock: stock,
          catalog_stock: catalogStock,
        });
      }
    }
  });

  return {
    matchedProducts,
    missingProducts,
    priceMismatches,
    stockMismatches,
    examples,
  };
}
