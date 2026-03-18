import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  buildCronExpression,
  findNextRun,
  normalizeScheduleConfig,
  resolveDateWindow,
  type ReportFiltersInput,
  type ScheduleConfigInput,
} from "../services/reportScheduler.utils";

describe("reportScheduler cron helpers", () => {
  it("builds daily cron expressions", () => {
    const schedule: ScheduleConfigInput = {
      frequency: "daily",
      time: "08:30",
      timezone: "America/Sao_Paulo",
    };

    assert.equal(buildCronExpression(schedule), "30 8 * * *");
  });

  it("builds weekly cron expressions", () => {
    const schedule: ScheduleConfigInput = {
      frequency: "weekly",
      time: "09:15",
      day_of_week: 1,
      timezone: "America/Sao_Paulo",
    };

    assert.equal(buildCronExpression(schedule), "15 9 * * 1");
  });

  it("finds next execution for a simple daily cron", () => {
    const next = findNextRun("0 8 * * *", new Date("2026-03-17T12:00:00.000Z"));
    assert.equal(next.toISOString(), "2026-03-18T11:00:00.000Z");
  });

  it("normalizes a custom cron and returns next run", () => {
    const result = normalizeScheduleConfig({
      frequency: "custom",
      time: "08:00",
      cron_expression: "0 8 * * 1",
      timezone: "America/Sao_Paulo",
    });

    assert.equal(result.cronExpression, "0 8 * * 1");
    assert.equal(Number.isNaN(result.nextRunAt.getTime()), false);
  });
});

describe("reportScheduler period helpers", () => {
  it("returns fixed periods as provided", () => {
    const filters: ReportFiltersInput = {
      period_mode: "fixed",
      start_date: "2026-03-01",
      end_date: "2026-03-15",
    };

    const result = resolveDateWindow(filters, "sales");
    assert.equal(result.startDate, "2026-03-01");
    assert.equal(result.endDate, "2026-03-15");
  });

  it("computes relative periods for previous month", () => {
    const filters: ReportFiltersInput = {
      period_mode: "relative",
      relative_period: "previous_month_complete",
    };

    const result = resolveDateWindow(filters, "finance");
    assert.equal(/^\d{4}-\d{2}-\d{2}$/.test(result.startDate), true);
    assert.equal(/^\d{4}-\d{2}-\d{2}$/.test(result.endDate), true);
  });
});
