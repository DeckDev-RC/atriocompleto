import type { ParsedFileResult } from "./types";

export async function parsePdfFile(buffer: Buffer, originalName: string): Promise<ParsedFileResult> {
  const pdfModule = await import("pdf-parse");
  const PDFParse = (pdfModule as { PDFParse: new (params: { data: Uint8Array }) => { getText: () => Promise<any>; destroy: () => Promise<void> } }).PDFParse;
  const parser = new PDFParse({ data: new Uint8Array(buffer) });
  const result = await parser.getText();
  await parser.destroy();
  const extractedText = (result.text || "").trim();

  return {
    parserName: "pdf-parser",
    fileKind: "pdf",
    extractedText,
    extractedJson: {
      original_name: originalName,
      page_count: result.numpages,
      info: result.info || {},
      metadata: result.metadata || {},
      text_length: extractedText.length,
    },
    summaryHint: `PDF com ${result.numpages} pagina(s).`,
    metadata: {
      textLength: extractedText.length,
    },
    needsMultimodalAnalysis: extractedText.length < 80,
  };
}
