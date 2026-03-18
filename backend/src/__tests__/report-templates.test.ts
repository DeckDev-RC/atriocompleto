import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildDefinitionSql, type CustomReportDefinition } from "../services/customReportBuilder.service";
import { createReportTemplateKey, normalizeTemplateTags } from "../services/reportTemplates.service";

describe("report template helpers", () => {
  it("creates a slug-based template key", () => {
    const key = createReportTemplateKey("Receita por Marketplace");
    assert.match(key, /^receita-por-marketplace-[a-f0-9]{8}$/);
  });

  it("normalizes and deduplicates tags preserving the first label", () => {
    assert.deepEqual(
      normalizeTemplateTags([" Vendas ", "marketplace", "vendas", " Receita "]),
      ["Vendas", "marketplace", "Receita"],
    );
  });

  it("rejects more than eight tags", () => {
    assert.throws(
      () => normalizeTemplateTags(["1", "2", "3", "4", "5", "6", "7", "8", "9"]),
      /Máximo de 8 tags/,
    );
  });
});

describe("report template definitions", () => {
  const tenantId = "11111111-1111-1111-1111-111111111111";

  const samples: CustomReportDefinition[] = [
    {
      dataset: "sales",
      dimensions: ["marketplace"],
      metrics: ["total_revenue", "orders_count", "avg_ticket"],
      filters: [{ field: "status", operator: "eq", value: "paid" }],
      sort: { field: "total_revenue", direction: "desc" },
      limit: 10,
    },
    {
      dataset: "products",
      dimensions: ["category"],
      metrics: ["products_count", "stock_value_cost", "units_sold_30d"],
      sort: { field: "products_count", direction: "desc" },
      limit: 20,
    },
    {
      dataset: "customers",
      dimensions: ["lifecycle_stage"],
      metrics: ["buyers_count", "total_revenue", "avg_total_spent"],
      sort: { field: "total_revenue", direction: "desc" },
      limit: 10,
    },
  ];

  for (const sample of samples) {
    it(`builds SQL for the ${sample.dataset} dataset`, () => {
      const sql = buildDefinitionSql(sample, tenantId);
      assert.match(sql, /FROM dataset_rows/);
      assert.match(sql, /LIMIT/);
    });
  }
});
