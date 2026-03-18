import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { CustomReportBuilderService, buildDefinitionSql, type CustomReportDefinition } from "../services/customReportBuilder.service";

describe("custom report builder metadata", () => {
  it("exposes the supported datasets", () => {
    const metadata = CustomReportBuilderService.getMetadata();
    assert.equal(metadata.datasets.length, 3);
    assert.deepEqual(
      metadata.datasets.map((dataset) => dataset.key).sort(),
      ["customers", "products", "sales"],
    );
  });
});

describe("custom report builder SQL generation", () => {
  it("builds SQL for sales dataset", () => {
    const definition: CustomReportDefinition = {
      dataset: "sales",
      dimensions: ["marketplace"],
      metrics: ["total_revenue", "orders_count"],
      filters: [{ field: "status", operator: "eq", value: "paid" }],
      sort: { field: "total_revenue", direction: "desc" },
      limit: 20,
    };

    const sql = buildDefinitionSql(definition, "11111111-1111-1111-1111-111111111111");
    assert.match(sql, /FROM dataset_rows/);
    assert.match(sql, /total_revenue/);
    assert.match(sql, /marketplace/);
    assert.match(sql, /LIMIT 20/);
  });

  it("rejects unsupported dimensions", () => {
    const definition: CustomReportDefinition = {
      dataset: "products",
      dimensions: ["marketplace"],
      metrics: ["products_count"],
    };

    assert.throws(
      () => buildDefinitionSql(definition, "11111111-1111-1111-1111-111111111111"),
      /Dimensão não suportada/,
    );
  });

  it("rejects empty metrics", () => {
    const definition: CustomReportDefinition = {
      dataset: "customers",
      dimensions: ["marketplace"],
      metrics: [],
    };

    assert.throws(
      () => buildDefinitionSql(definition, "11111111-1111-1111-1111-111111111111"),
      /Selecione ao menos uma métrica/,
    );
  });
});
