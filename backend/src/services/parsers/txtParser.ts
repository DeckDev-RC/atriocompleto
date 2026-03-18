import type { ParsedFileResult } from "./types";

function decodeText(buffer: Buffer): { text: string; encoding: string } {
  const utf8 = buffer.toString("utf8");
  const replacementChars = (utf8.match(/\uFFFD/g) || []).length;
  const replacementRatio = utf8.length > 0 ? replacementChars / utf8.length : 0;

  if (replacementRatio < 0.01) {
    return { text: utf8, encoding: "utf8" };
  }

  return {
    text: buffer.toString("latin1"),
    encoding: "latin1",
  };
}

export function parseTxtFile(buffer: Buffer, originalName: string): ParsedFileResult {
  const { text, encoding } = decodeText(buffer);
  const lines = text.split(/\r?\n/);
  const nonEmptyLines = lines.filter((line) => line.trim().length > 0);
  const maxLineLength = lines.reduce((max, line) => Math.max(max, line.length), 0);

  return {
    parserName: "txt-parser",
    fileKind: "text",
    extractedText: text.trim(),
    extractedJson: {
      original_name: originalName,
      detected_encoding: encoding,
      line_count: lines.length,
      non_empty_lines: nonEmptyLines.length,
      max_line_length: maxLineLength,
      sample_lines: nonEmptyLines.slice(0, 20),
    },
    summaryHint: `Arquivo de texto com ${lines.length} linhas.`,
    metadata: {
      encoding,
    },
  };
}
