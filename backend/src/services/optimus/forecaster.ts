import { queryFunctions, type QueryParams } from "../query-functions";
import { redis } from "../../config/redis";
import { ScenarioSimulationService } from "../scenarioSimulation.service";

// ── Types ──────────────────────────────────────────────

interface ForecastResult {
  forecast_next_month: number;
  confidence_interval: { low: number; high: number };
  current_month: {
    month: string;
    actual_so_far: number;
    orders_so_far: number;
    days_passed: number;
    days_in_month: number;
    projected_total: number;
    projected_interval: { low: number; high: number };
    daily_avg: number;
  } | null;
  trend: string;
  trend_direction: "up" | "stable" | "down";
  avg_monthly_revenue: number;
  months_analyzed: number;
  variance_pct: number;
  delta_from_last?: { previous: number; current: number; change_pct: number } | null;
}

interface GoalResult {
  goal_amount: number;
  current_revenue: number;
  remaining: number;
  days_passed: number;
  days_remaining: number;
  daily_pace_current: number;
  daily_pace_needed: number;
  pace_gap: number;
  pace_status: "ahead" | "on_track" | "behind" | "far_behind";
  probability_pct: number;
  projected_total: number;
  projected_vs_goal_pct: number;
  historical_hit_rate: number;
  recommendation: string;
}

interface DemandRateResult {
  products: Array<{
    name: string;
    marketplace: string;
    units_last_30d: number;
    units_last_7d: number;
    daily_rate: number;
    weekly_rate: number;
    trend: "accelerating" | "stable" | "decelerating";
    projection_30d: number;
  }>;
  total_products: number;
  period: string;
}

interface ForecastComparisonResult {
  current_period: { label: string; revenue: number };
  projected_next: { label: string; revenue: number; confidence: { low: number; high: number } };
  comparison_previous: { label: string; revenue: number } | null;
  projected_vs_previous_pct: number | null;
  projected_vs_current_pct: number;
  trend_summary: string;
}

// ── Helpers ────────────────────────────────────────────

function rnd(n: number, dec = 2): number {
  const f = Math.pow(10, dec);
  return Math.round(n * f) / f;
}

const FORECAST_TRACK_TTL = 86400; // 24h

// ── Service ────────────────────────────────────────────

export class ForecasterService {

  /**
   * 1. Enhanced Forecast — enriches salesForecast with confidence intervals.
   * Feature: "Quanto v
   * ou faturar este mês?" + "Previsão de vendas para próxima semana"
   */
  static async enhancedForecast(params: QueryParams): Promise<ForecastResult | { error: string }> {
    const base = await queryFunctions.salesForecast(params) as any;
    if (base.error) return base;

    // Calculate variance from monthly data for confidence interval
    const monthlyData = await queryFunctions.salesByMonth({ ...params, all_time: true }) as any;
    const months = (monthlyData.months || []) as Array<{ month: string; total: number }>;

    let variance = 0;
    if (months.length >= 3) {
      const mean = months.reduce((s, m) => s + m.total, 0) / months.length;
      const sumSqDiff = months.reduce((s, m) => s + Math.pow(m.total - mean, 2), 0);
      variance = Math.sqrt(sumSqDiff / months.length);
    }

    const variancePct = base.avg_monthly_revenue > 0
      ? rnd((variance / base.avg_monthly_revenue) * 100)
      : 10;

    // Confidence interval: ±1 std deviation (capped at 10-25%)
    const marginPct = Math.max(10, Math.min(25, variancePct));
    const margin = base.forecast_next_month * (marginPct / 100);

    const result: ForecastResult = {
      forecast_next_month: base.forecast_next_month,
      confidence_interval: {
        low: rnd(base.forecast_next_month - margin),
        high: rnd(base.forecast_next_month + margin),
      },
      current_month: base.current_month ? {
        ...base.current_month,
        projected_interval: {
          low: rnd(base.current_month.projected_total * (1 - marginPct / 100)),
          high: rnd(base.current_month.projected_total * (1 + marginPct / 100)),
        },
        daily_avg: base.current_month.days_passed > 0
          ? rnd(base.current_month.actual_so_far / base.current_month.days_passed)
          : 0,
      } : null,
      trend: base.trend,
      trend_direction: base.trend === "crescimento" ? "up" : base.trend === "queda" ? "down" : "stable",
      avg_monthly_revenue: base.avg_monthly_revenue,
      months_analyzed: base.months_analyzed,
      variance_pct: variancePct,
      delta_from_last: null,
    };

    // Feature 5: Continuous tracking — compare with last stored forecast
    const tenantId = params._tenant_id || "system";
    const trackKey = `forecaster:${tenantId}:last_forecast`;
    try {
      const cached = await redis.get(trackKey);
      if (cached) {
        const prev = JSON.parse(cached) as { forecast: number; timestamp: string };
        const changePct = prev.forecast > 0
          ? rnd(((result.forecast_next_month - prev.forecast) / prev.forecast) * 100)
          : null;
        result.delta_from_last = {
          previous: prev.forecast,
          current: result.forecast_next_month,
          change_pct: changePct ?? 0,
        };
      }
      // Store current forecast
      await redis.set(trackKey, JSON.stringify({
        forecast: result.forecast_next_month,
        timestamp: new Date().toISOString(),
      }), "EX", FORECAST_TRACK_TTL);
    } catch (err) {
      console.warn("[Forecaster] Redis tracking error:", err);
    }

    return result;
  }

  /**
   * 2+3. Goal Probability + Dynamic Goals
   * Feature: "Vou bater a meta do mês?" / "Para faturar R$200k, precisa vender R$X/dia"
   */
  static async goalProbability(params: QueryParams & { goal_amount?: number }): Promise<GoalResult | { error: string }> {
    const goalAmount = params.goal_amount;
    if (!goalAmount || goalAmount <= 0) {
      return { error: "Informe a meta desejada com o parâmetro goal_amount (ex: 200000)." };
    }

    // Get current month data
    const forecast = await queryFunctions.salesForecast(params) as any;
    if (forecast.error) return { error: forecast.error };

    const currentMonth = forecast.current_month;
    if (!currentMonth) {
      return { error: "Não há dados suficientes para o mês atual." };
    }

    const { actual_so_far, days_passed, days_in_month, projected_total } = currentMonth;
    const daysRemaining = days_in_month - days_passed;
    const remaining = goalAmount - actual_so_far;
    const dailyPaceCurrent = days_passed > 0 ? actual_so_far / days_passed : 0;
    const dailyPaceNeeded = daysRemaining > 0 ? remaining / daysRemaining : Infinity;
    const paceGap = dailyPaceNeeded - dailyPaceCurrent;

    // Pace status
    let paceStatus: "ahead" | "on_track" | "behind" | "far_behind";
    const ratio = dailyPaceNeeded > 0 ? dailyPaceCurrent / dailyPaceNeeded : 2;
    if (ratio >= 1.1) paceStatus = "ahead";
    else if (ratio >= 0.9) paceStatus = "on_track";
    else if (ratio >= 0.7) paceStatus = "behind";
    else paceStatus = "far_behind";

    // Probability calculation
    // Factors: projected vs goal, trend, historical hit rate
    const projectedVsGoalPct = rnd((projected_total / goalAmount) * 100);
    let probability = Math.min(99, Math.max(1, projectedVsGoalPct));

    // Trend adjustment
    if (forecast.trend === "crescimento") probability = Math.min(99, probability * 1.1);
    if (forecast.trend === "queda") probability = Math.max(1, probability * 0.85);

    // Historical hit rate: how many months exceeded goalAmount
    const monthlyData = await queryFunctions.salesByMonth({ ...params, all_time: true }) as any;
    const allMonths = (monthlyData.months || []) as Array<{ total: number }>;
    const monthsAboveGoal = allMonths.filter(m => m.total >= goalAmount).length;
    const historicalHitRate = allMonths.length > 0
      ? rnd((monthsAboveGoal / allMonths.length) * 100)
      : 0;

    // Blend with historical
    if (allMonths.length >= 3) {
      probability = rnd(probability * 0.7 + historicalHitRate * 0.3);
    }

    probability = Math.min(99, Math.max(1, rnd(probability)));

    // Recommendation
    let recommendation: string;
    if (paceStatus === "ahead") {
      recommendation = `Ritmo excelente! Está R$ ${rnd(Math.abs(paceGap))}/dia acima do necessário. Mantenha o foco.`;
    } else if (paceStatus === "on_track") {
      recommendation = `No ritmo certo. Continue vendendo ~R$ ${rnd(dailyPaceNeeded)}/dia para bater a meta.`;
    } else if (paceStatus === "behind") {
      recommendation = `Atenção: precisa aumentar para R$ ${rnd(dailyPaceNeeded)}/dia (atual: R$ ${rnd(dailyPaceCurrent)}/dia). Considere ações promocionais.`;
    } else {
      recommendation = `Alerta: ritmo atual (R$ ${rnd(dailyPaceCurrent)}/dia) está muito abaixo do necessário (R$ ${rnd(dailyPaceNeeded)}/dia). Ações urgentes requeridas.`;
    }

    return {
      goal_amount: goalAmount,
      current_revenue: rnd(actual_so_far),
      remaining: rnd(remaining),
      days_passed: days_passed,
      days_remaining: daysRemaining,
      daily_pace_current: rnd(dailyPaceCurrent),
      daily_pace_needed: rnd(dailyPaceNeeded),
      pace_gap: rnd(paceGap),
      pace_status: paceStatus,
      probability_pct: probability,
      projected_total: rnd(projected_total),
      projected_vs_goal_pct: projectedVsGoalPct,
      historical_hit_rate: historicalHitRate,
      recommendation,
    };
  }

  /**
   * 7. Product Demand Rate — sales velocity per product (without stock data)
   * Feature: "Qual a velocidade de venda do produto X?"
   */
  static async productDemandRate(params: QueryParams & { product_name?: string }): Promise<DemandRateResult | { error: string }> {
    const tenantId = params._tenant_id;
    if (!tenantId) return { error: "Tenant ID obrigatório" };

    const productFilter = params.product_name
      ? `AND LOWER(product_name) LIKE LOWER('%${(params.product_name || '').replace(/'/g, "''")}%')`
      : "";

    const limit = params.limit || 20;

    // Use the same raw JSON extraction pattern from bcgMatrix
    const sql = `
      WITH all_items AS (
        SELECT
          jsonb_array_elements(ml.raw_json->'order_items')->'item'->>'title' as product_name,
          (jsonb_array_elements(ml.raw_json->'order_items')->>'quantity')::int as qty,
          o.order_date,
          'ml' as marketplace
        FROM public.orders o
        JOIN public.ml_raw_orders ml ON o.external_order_id = ml.id AND o.marketplace = 'ml' AND ml.tenant_id = '${tenantId}'::uuid
        WHERE o.tenant_id = '${tenantId}'::uuid AND LOWER(o.status) = 'paid'
          AND o.order_date >= NOW() - INTERVAL '30 days'
        UNION ALL
        SELECT
          jsonb_array_elements(sh.raw_json->'item_list')->>'item_name' as product_name,
          (jsonb_array_elements(sh.raw_json->'item_list')->>'model_quantity_purchased')::int as qty,
          o.order_date,
          'shopee' as marketplace
        FROM public.orders o
        JOIN public.shopee_raw_orders sh ON o.external_order_id = sh.id AND o.marketplace = 'shopee' AND sh.tenant_id = '${tenantId}'::uuid
        WHERE o.tenant_id = '${tenantId}'::uuid AND LOWER(o.status) = 'paid'
          AND o.order_date >= NOW() - INTERVAL '30 days'
        UNION ALL
        SELECT
          jsonb_array_elements(sn.raw_json->'orderGoodsInfoList')->>'goodsTitle' as product_name,
          1 as qty,
          o.order_date,
          'shein' as marketplace
        FROM public.orders o
        JOIN public.shein_raw_orders sn ON o.external_order_id = sn.id AND o.marketplace = 'shein' AND sn.tenant_id = '${tenantId}'::uuid
        WHERE o.tenant_id = '${tenantId}'::uuid AND LOWER(o.status) = 'paid'
          AND o.order_date >= NOW() - INTERVAL '30 days'
      ),
      product_stats AS (
        SELECT
          product_name,
          MIN(marketplace) as marketplace,
          SUM(qty)::int as units_30d,
          SUM(CASE WHEN order_date >= NOW() - INTERVAL '7 days' THEN qty ELSE 0 END)::int as units_7d,
          COUNT(DISTINCT DATE(order_date))::int as active_days
        FROM all_items
        WHERE product_name IS NOT NULL ${productFilter}
        GROUP BY product_name
        HAVING SUM(qty) > 0
      )
      SELECT * FROM product_stats
      ORDER BY units_30d DESC
      LIMIT ${limit}
    `;

    try {
      // Use executeSQLQuery pattern via supabase rpc
      const { supabaseAdmin } = await import("../../config/supabase");
      const rpcParams: Record<string, unknown> = { query_text: sql.trim() };
      if (tenantId) rpcParams.p_tenant_id = tenantId;

      const { data, error } = await supabaseAdmin.rpc("execute_readonly_query", rpcParams);
      if (error) return { error: `SQL error: ${error.message}` };

      const rows = (typeof data === "string" ? JSON.parse(data) : data) as Array<{
        product_name: string;
        marketplace: string;
        units_30d: number;
        units_7d: number;
        active_days: number;
      }>;

      const products = (rows || []).map(r => {
        const dailyRate30 = r.units_30d / 30;
        const dailyRate7 = r.units_7d / 7;

        let trend: "accelerating" | "stable" | "decelerating";
        if (dailyRate7 > dailyRate30 * 1.2) trend = "accelerating";
        else if (dailyRate7 < dailyRate30 * 0.8) trend = "decelerating";
        else trend = "stable";

        return {
          name: r.product_name,
          marketplace: r.marketplace,
          units_last_30d: r.units_30d,
          units_last_7d: r.units_7d,
          daily_rate: rnd(dailyRate30, 1),
          weekly_rate: rnd(dailyRate30 * 7, 1),
          trend,
          projection_30d: Math.round(dailyRate7 * 30),
        };
      });

      return {
        products,
        total_products: products.length,
        period: "Últimos 30 dias",
      };
    } catch (err) {
      return { error: `Erro ao calcular demanda: ${err instanceof Error ? err.message : "desconhecido"}` };
    }
  }

  /**
   * 4. Forecast Comparison — projection vs previous period
   * Feature: "Próximo mês vs este mês" / "Q2 vs Q1"
   */
  static async forecastComparison(params: QueryParams): Promise<ForecastComparisonResult | { error: string }> {
    const [forecastData, monthlyData] = await Promise.all([
      queryFunctions.salesForecast(params) as any,
      queryFunctions.salesByMonth({ ...params, all_time: true }) as any,
    ]);

    if (forecastData.error) return { error: forecastData.error };

    const months = (monthlyData.months || []) as Array<{ month: string; total: number; count: number }>;
    if (months.length < 2) return { error: "Dados insuficientes (mínimo 2 meses)." };

    const lastMonth = months[months.length - 1];
    const prevMonth = months.length >= 2 ? months[months.length - 2] : null;

    const currentRevenue = forecastData.current_month
      ? forecastData.current_month.projected_total
      : lastMonth.total;

    const variance = forecastData.avg_monthly_revenue > 0
      ? Math.max(10, Math.min(25, 15)) / 100
      : 0.15;

    const forecast = forecastData.forecast_next_month;

    const result: ForecastComparisonResult = {
      current_period: {
        label: forecastData.current_month?.month || lastMonth.month,
        revenue: rnd(currentRevenue),
      },
      projected_next: {
        label: getNextMonthLabel(forecastData.current_month?.month || lastMonth.month),
        revenue: rnd(forecast),
        confidence: {
          low: rnd(forecast * (1 - variance)),
          high: rnd(forecast * (1 + variance)),
        },
      },
      comparison_previous: prevMonth ? {
        label: prevMonth.month,
        revenue: rnd(prevMonth.total),
      } : null,
      projected_vs_previous_pct: prevMonth && prevMonth.total > 0
        ? rnd(((forecast - prevMonth.total) / prevMonth.total) * 100)
        : null,
      projected_vs_current_pct: currentRevenue > 0
        ? rnd(((forecast - currentRevenue) / currentRevenue) * 100)
        : 0,
      trend_summary: buildTrendSummary(forecastData.trend, forecast, currentRevenue),
    };

    return result;
  }

  /**
   * 6. What-If Bridge — connects Optimus chat to the simulations service
   * Feature: "E se eu fizer promoção de 20%?"
   */
  static async runWhatIfScenario(params: QueryParams & {
    price_change_pct?: number;
    traffic_change_pct?: number;
    conversion_change_pct?: number;
  }): Promise<unknown> {
    const tenantId = params._tenant_id;
    if (!tenantId) return { error: "Tenant ID obrigatório" };

    try {
      // Get baseline from simulation service
      const baseline = await ScenarioSimulationService.getBaseline(tenantId);

      // Apply scenario changes
      const priceChangePct = params.price_change_pct || 0;
      const trafficChangePct = params.traffic_change_pct || 0;
      const conversionChangePct = params.conversion_change_pct || 0;

      const newTicket = baseline.avg_ticket * (1 + priceChangePct / 100);
      const newSessions = baseline.sessions * (1 + trafficChangePct / 100);
      const newConversion = baseline.conversion_rate * (1 + conversionChangePct / 100);
      const newOrders = Math.round(newSessions * (newConversion / 100));
      const newRevenue = newOrders * newTicket;

      const projected = {
        revenue: rnd(newRevenue),
        orders: newOrders,
        avg_ticket: rnd(newTicket),
        sessions: Math.round(newSessions),
        conversion_rate: rnd(newConversion),
        gross_profit: rnd(newRevenue * 0.3), // rough 30% margin estimate
      };

      const revenueChangePct = baseline.revenue > 0
        ? rnd(((newRevenue - baseline.revenue) / baseline.revenue) * 100)
        : 0;

      // Build three scenarios: pessimista, realista, otimista
      const scenarios = {
        pessimista: {
          revenue: rnd(projected.revenue * 0.8),
          orders: Math.round(projected.orders * 0.8),
          change_pct: rnd(revenueChangePct * 0.8),
        },
        realista: {
          revenue: projected.revenue,
          orders: projected.orders,
          change_pct: revenueChangePct,
        },
        otimista: {
          revenue: rnd(projected.revenue * 1.2),
          orders: Math.round(projected.orders * 1.2),
          change_pct: rnd(revenueChangePct * 1.2),
        },
      };

      return {
        baseline: {
          revenue: rnd(baseline.revenue),
          orders: baseline.orders,
          avg_ticket: rnd(baseline.avg_ticket),
          sessions: baseline.sessions,
          conversion_rate: baseline.conversion_rate,
          period: "Últimos 30 dias",
        },
        scenario_applied: {
          price_change_pct: priceChangePct,
          traffic_change_pct: trafficChangePct,
          conversion_change_pct: conversionChangePct,
        },
        projected,
        revenue_impact: {
          amount: rnd(newRevenue - baseline.revenue),
          pct: revenueChangePct,
          direction: newRevenue >= baseline.revenue ? "gain" : "loss",
        },
        scenarios,
      };
    } catch (err) {
      return { error: `Erro na simulação: ${err instanceof Error ? err.message : "desconhecido"}` };
    }
  }
}

// ── Utility functions ─────────────────────────────────

function getNextMonthLabel(currentMonth: string): string {
  const [yearStr, monthStr] = currentMonth.split("-");
  const year = parseInt(yearStr, 10);
  const month = parseInt(monthStr, 10);
  const nextMonth = month === 12 ? 1 : month + 1;
  const nextYear = month === 12 ? year + 1 : year;
  return `${nextYear}-${String(nextMonth).padStart(2, "0")}`;
}

function buildTrendSummary(trend: string, forecast: number, current: number): string {
  const diff = forecast - current;
  const pct = current > 0 ? rnd((diff / current) * 100) : 0;
  if (trend === "crescimento") {
    return `Tendência de alta: projeção ${pct > 0 ? "+" : ""}${pct}% em relação ao período atual.`;
  }
  if (trend === "queda") {
    return `Tendência de queda: projeção ${pct}% em relação ao período atual. Ação recomendada.`;
  }
  return `Tendência estável: projeção de ${pct > 0 ? "+" : ""}${pct}% em relação ao período atual.`;
}
