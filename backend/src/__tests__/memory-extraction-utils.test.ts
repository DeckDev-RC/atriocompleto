import test from "node:test";
import assert from "node:assert/strict";
import { parseMemoryExtractionResponse } from "../services/optimus/memory-extraction-utils";

const validPayload = {
  summary: "Usuario quer acompanhar vendas e prefere relatórios semanais.",
  topics: ["vendas", "relatorios"],
  decisions: ["acompanhar desempenho semanal"],
  memories: [
    {
      scope: "user",
      memory_type: "preference",
      memory_key: "reporting_frequency",
      summary: "Usuario prefere receber relatorios semanais.",
      relevance_score: 85,
      confidence_score: 90,
      value_json: { frequency: "weekly" },
    },
  ],
};

test("parseMemoryExtractionResponse parses clean JSON", () => {
  const parsed = parseMemoryExtractionResponse(JSON.stringify(validPayload));
  assert.ok(parsed);
  assert.equal(parsed?.summary, validPayload.summary);
  assert.equal(parsed?.memories.length, 1);
});

test("parseMemoryExtractionResponse parses fenced JSON", () => {
  const parsed = parseMemoryExtractionResponse(`\`\`\`json\n${JSON.stringify(validPayload, null, 2)}\n\`\`\``);
  assert.ok(parsed);
  assert.equal(parsed?.topics[0], "vendas");
});

test("parseMemoryExtractionResponse ignores surrounding prose", () => {
  const parsed = parseMemoryExtractionResponse(`Segue o JSON solicitado:\n${JSON.stringify(validPayload)}\nFim.`);
  assert.ok(parsed);
  assert.equal(parsed?.decisions[0], "acompanhar desempenho semanal");
});

test("parseMemoryExtractionResponse repairs truncated JSON with unterminated string", () => {
  const truncated = `{
    "summary":"Usuario falou sobre vendas de março",
    "topics":["vendas"],
    "decisions":[],
    "memories":[
      {
        "scope":"user",
        "memory_type":"fact",
        "memory_key":"monthly_focus",
        "summary":"Usuario acompanha vendas de mar`;

  const parsed = parseMemoryExtractionResponse(truncated);
  assert.ok(parsed);
  assert.equal(parsed?.summary, "Usuario falou sobre vendas de março");
  assert.equal(parsed?.memories.length, 0);
});
