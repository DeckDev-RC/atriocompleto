import { Router, Request, Response } from "express";
import { fetchDashboardAggregated, DashboardParams } from "../services/dashboard";
import { getMarketplaceInfo } from "../config/marketplace";
import { requireAuth } from "../middleware/auth";

const router = Router();

// All dashboard routes require authentication
router.use(requireAuth);

// ── Helpers ────────────────────────────────────────────

const MONTH_NAMES: Record<string, string> = {
  "01": "jan", "02": "fev", "03": "mar", "04": "abr",
  "05": "mai", "06": "jun", "07": "jul", "08": "ago",
  "09": "set", "10": "out", "11": "nov", "12": "dez",
};

function buildParams(query: Record<string, unknown>): DashboardParams {
  const period = (query.period as string) || "all";

  switch (period) {
    case "custom": {
      const start = query.start_date as string;
      const end = query.end_date as string;
      if (start && end) return { start_date: start, end_date: end };
      return { all_time: true };
    }
    case "current_month": {
      const now = new Date();
      const year = now.getFullYear();
      const month = now.getMonth() + 1;
      const lastDay = new Date(year, month, 0).getDate();
      const mm = String(month).padStart(2, "0");
      return {
        start_date: `${year}-${mm}-01`,
        end_date: `${year}-${mm}-${String(lastDay).padStart(2, "0")}`,
      };
    }
    case "30d":
      return { period_days: 30 };
    case "90d":
      return { period_days: 90 };
    case "all":
    default:
      return { all_time: true };
  }
}

// ── GET /api/dashboard/summary ─────────────────────────

router.get("/summary", async (req: Request, res: Response) => {
  try {
    const params = buildParams(req.query as Record<string, unknown>);
    const tenantId = req.user!.tenant_id;

    if (!tenantId) {
      return res.json({
        success: true,
        data: {
          banner: { totalRevenue: 0, trendPct: 0, channels: [] },
          orderDistribution: [],
          monthlyRevenue: [],
          stats: {
            totalOrders: { value: 0, change: 0 },
            avgTicket: { value: 0, change: 0 },
            cancellationRate: { value: 0, change: 0 },
          },
          insights: { avgTicket: 0, cancellationRate: 0, paidPct: 0, momTrend: 0 },
          period: params.all_time ? "all" : { start: params.start_date || "", end: params.end_date || "" },
        },
      });
    }

    const agg = await fetchDashboardAggregated(params, tenantId);

    // ── Banner (somente pagos) ────────────────────────
    const paidTotal = Object.values(agg.paidByMkt).reduce((s, v) => s + v, 0);

    const channels = Object.entries(agg.paidByMkt)
      .sort(([, a], [, b]) => b - a)
      .map(([name, rev]) => {
        const info = getMarketplaceInfo(name);
        return {
          id: name.toLowerCase().replace(/\s+/g, "_"),
          label: info.label,
          value: Math.round(rev * 100) / 100,
          percentage: paidTotal > 0 ? Math.round((rev / paidTotal) * 10000) / 100 : 0,
          color: info.color,
          iconType: info.iconType,
        };
      });

    // ── Order Distribution (todos os status) ──────────
    const orderDistribution = Object.entries(agg.allByMkt)
      .sort(([, a], [, b]) => b - a)
      .map(([name, count]) => {
        const info = getMarketplaceInfo(name);
        return { name: info.label, value: count, color: info.color };
      });

    // ── Monthly Revenue ───────────────────────────────
    const monthlyRevenue = agg.months.map((m) => {
      const monthNum = m.month.split("-")[1] || "";
      return {
        month: MONTH_NAMES[monthNum] || m.month,
        paid: Math.round(m.paid * 100) / 100,
        cancelled: Math.round(m.cancelled * 100) / 100,
      };
    });

    // ── Stats ─────────────────────────────────────────
    const ov = agg.overview;
    const cancellationRate =
      ov.total_orders > 0
        ? Math.round((ov.cancelled_orders / ov.total_orders) * 10000) / 100
        : 0;
    const paidPct =
      ov.total_orders > 0
        ? Math.round((ov.paid_orders / ov.total_orders) * 10000) / 100
        : 0;

    res.json({
      success: true,
      data: {
        banner: {
          totalRevenue: Math.round(paidTotal * 100) / 100,
          trendPct: agg.trends.momTrend,
          channels,
        },
        orderDistribution,
        monthlyRevenue,
        stats: {
          totalOrders: { value: ov.total_orders, change: agg.trends.ordersChange },
          avgTicket: {
            value: Math.round(ov.avg_ticket * 100) / 100,
            change: agg.trends.avgTicketChange,
          },
          cancellationRate: {
            value: cancellationRate,
            change: agg.trends.cancellationChange,
          },
        },
        insights: {
          avgTicket: Math.round(ov.avg_ticket * 100) / 100,
          cancellationRate,
          paidPct,
          momTrend: agg.trends.momTrend,
        },
        period: params.all_time
          ? "all"
          : { start: params.start_date || "", end: params.end_date || "" },
      },
    });
  } catch (error) {
    console.error("[Dashboard] Error:", error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : "Erro ao carregar dashboard",
    });
  }
});

export default router;
