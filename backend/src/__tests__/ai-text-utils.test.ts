import test from "node:test";
import assert from "node:assert/strict";
import {
  buildChatExportTitle,
  parseRequestedExportFormat,
  repairTextArtifacts,
  sanitizeModelExportText,
} from "../services/aiTextUtils";

test("repairTextArtifacts fixes common mojibake", () => {
  assert.equal(repairTextArtifacts("Voc\u00c3\u00aa"), "Você");
  assert.equal(repairTextArtifacts("ticket m\u00c3\u00a9dio"), "ticket médio");
  assert.equal(repairTextArtifacts("A\u00c3\u00a7\u00c3\u00a3o"), "Ação");
});

test("sanitizeModelExportText removes generated download lines but keeps analysis", () => {
  const text = [
    "## Insights",
    "- Ticket médio abaixo do ideal.",
    "",
    "O arquivo PDF com este relatório detalhado foi gerado e está pronto para ser baixado.",
    "",
    "📎 **Relatório pronto:** [Baixar comparacao-90-dias.pdf](/api/reports/exports/123/download)",
  ].join("\n");

  assert.equal(
    sanitizeModelExportText(text),
    ["## Insights", "- Ticket médio abaixo do ideal."].join("\n"),
  );
});

test("buildChatExportTitle strips export filler from the user request", () => {
  assert.equal(
    buildChatExportTitle(
      "compareMarketplaces",
      "gere um pdf com a comparacao dos ultimos 90 dias por marketplace e depois me entregue o relatorio",
    ),
    "comparacao dos ultimos 90 dias por marketplace",
  );
});

test("parseRequestedExportFormat detects spreadsheet aliases", () => {
  assert.equal(parseRequestedExportFormat("quero baixar uma planilha desse resumo"), "xlsx");
  assert.equal(parseRequestedExportFormat("me entregue em pdf"), "pdf");
  assert.equal(parseRequestedExportFormat("so quero a analise na conversa"), null);
});
