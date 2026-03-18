export type ParsedFileKind = "image" | "pdf" | "spreadsheet" | "text";

export interface ParsedFileResult {
  parserName: string;
  fileKind: ParsedFileKind;
  extractedText: string;
  extractedJson?: Record<string, unknown>;
  summaryHint?: string;
  metadata?: Record<string, unknown>;
  needsMultimodalAnalysis?: boolean;
}

export interface SpreadsheetValidationResult {
  matchedProducts: number;
  missingProducts: number;
  priceMismatches: number;
  stockMismatches: number;
  examples: Array<Record<string, unknown>>;
}
