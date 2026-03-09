import { supabaseAdmin } from "../config/supabase";

export interface QuickSummary {
    todayRevenue: number;
    todayOrders: number;
    monthRevenue: number;
    monthOrders: number;
    pendingOrders: number;
}

export class DataContextService {
    /**
     * Obtém um resumo rápido para ser injetado no contexto da IA sem precisar de chamadas de funções.
     */
    static async getQuickSummary(tenantId: string): Promise<QuickSummary> {
        try {
            // Use SQL CURRENT_DATE instead of JS dates to avoid timezone drift
            const { data, error } = await supabaseAdmin.rpc("execute_readonly_query", {
                p_tenant_id: tenantId,
                query_text: `SELECT
            COALESCE(SUM(total_amount) FILTER (WHERE order_date >= CURRENT_DATE), 0)::float AS today_revenue,
            COUNT(*) FILTER (WHERE order_date >= CURRENT_DATE)::int AS today_orders,
            COALESCE(SUM(total_amount) FILTER (WHERE order_date >= DATE_TRUNC('month', CURRENT_DATE)), 0)::float AS month_revenue,
            COUNT(*) FILTER (WHERE order_date >= DATE_TRUNC('month', CURRENT_DATE))::int AS month_orders,
            COUNT(*) FILTER (WHERE LOWER(status) IN ('pending', 'processing', 'awaiting_payment'))::int AS pending_orders
          FROM orders
        `
            });

            if (error) throw error;

            const rows = typeof data === 'string' ? JSON.parse(data) : data;
            const row = rows[0] || {};

            return {
                todayRevenue: row.today_revenue || 0,
                todayOrders: row.today_orders || 0,
                monthRevenue: row.month_revenue || 0,
                monthOrders: row.month_orders || 0,
                pendingOrders: row.pending_orders || 0
            };
        } catch (error) {
            console.error("[DataContextService] Error fetching quick summary:", error);
            return {
                todayRevenue: 0,
                todayOrders: 0,
                monthRevenue: 0,
                monthOrders: 0,
                pendingOrders: 0
            };
        }
    }

    static formatSummaryForPrompt(summary: QuickSummary): string {
        return `
DADOS DO NEGÓCIO (RESUMO RÁPIDO):
- Hoje: R$ ${summary.todayRevenue.toLocaleString('pt-BR')} (${summary.todayOrders} pedidos)
- Este Mês: R$ ${summary.monthRevenue.toLocaleString('pt-BR')} (${summary.monthOrders} pedidos)
- Pendentes de Envio/Pagamento: ${summary.pendingOrders} pedidos
    `.trim();
    }
}
