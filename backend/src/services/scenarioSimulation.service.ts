import { supabaseAdmin } from "../config/supabase";
import { queryFunctions, type QueryParams } from "./query-functions";
import { genai, GEMINI_MODEL } from "../config/gemini";
import { z } from "zod";

// Zod schema for Gemini analysis output
const simulationAnalysisSchema = z.object({
    viability_score: z.number().min(1).max(10),
    risk_level: z.enum(["Baixo", "Médio", "Alto"]),
    summary: z.string().max(1000),
    operational_impacts: z.array(z.string()).max(3),
    pros: z.array(z.string()).max(3),
    cons: z.array(z.string()).max(3),
    recommended_actions: z.array(z.object({
        action: z.string(),
        reason: z.string(),
    })).max(3),
});

export const ScenarioSimulationService = {

    /**
     * Fetches the baseline metrics (last 30 days) to ground the simulation.
     */
    async getBaseline(tenantId: string) {
        const now = new Date();
        const thirtyDaysAgo = new Date(now);
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

        const baseParams: QueryParams = {
            _tenant_id: tenantId,
            start_date: thirtyDaysAgo.toISOString().split("T")[0],
            end_date: now.toISOString().split("T")[0],
        };

        const [avgTicketResult, ordersResult, salesResult] = await Promise.all([
            queryFunctions.avgTicket(baseParams).catch(() => null),
            queryFunctions.countOrders(baseParams).catch(() => null),
            queryFunctions.totalSales(baseParams).catch(() => null),
        ]);

        // Parse results
        const atk = avgTicketResult as any;
        const avgTicket = atk?.avg_ticket ?? atk?.data?.avg_ticket ?? 0;

        const oc = ordersResult as any;
        const orders = oc?.count ?? oc?.data?.count ?? 0;

        const sr = salesResult as any;
        const revenue = sr?.total ?? sr?.data?.total ?? 0;

        // Use standard 1.5% e-commerce conversion if we don't track traffic
        const conversionRate = 1.5;
        const sessions = orders > 0 ? Math.round(orders / (conversionRate / 100)) : 10000;

        return {
            revenue: revenue > 0 ? revenue : (orders * avgTicket),
            orders: orders,
            avg_ticket: avgTicket,
            sessions: sessions,
            conversion_rate: conversionRate,
            generated_at: new Date().toISOString(),
        };
    },

    /**
     * Analyzes the simulated scenario via Gemini to extract qualitative insights.
     */
    async generateAnalysis(tenantId: string, payload: {
        scenario_data: Record<string, any>;
        baseline: Record<string, any>;
        projected: Record<string, any>;
    }) {
        const prompt = `Você é um analista financeiro sênior de E-commerce.
Avalie a simulação (Cenário "What-If") abaixo feita por um lojista.

## Variáveis Alteradas (Hipótese)
${JSON.stringify(payload.scenario_data, null, 2)}

## Impacto Projetado (30 Dias)
- Faturamento Atual: R$ ${payload.baseline.revenue} -> Projetado: R$ ${payload.projected.revenue}
- Pedidos Atuais: ${payload.baseline.orders} -> Projetado: ${payload.projected.orders}
- Ticket Médio Atual: R$ ${payload.baseline.avg_ticket} -> Projetado: R$ ${payload.projected.avg_ticket}
- Lucro Bruto Projetado: R$ ${payload.projected.gross_profit}

## Instruções
Analise criticamente este cenário. Considere:
1. Viabilidade comercial (é realista conseguir esse aumento de tráfego/conversão?).
2. Impactos operacionais (mais pedidos demandam mais SAC, logística, estoque).
3. Risco financeiro (margem sendo comprimida por descontos).

Retorne APENAS um JSON válido seguindo a estrutura:
{
  "viability_score": numero 1 a 10,
  "risk_level": "Baixo", "Médio" ou "Alto",
  "summary": "Resumo geral do cenário em 2 linhas",
  "operational_impacts": ["Impacto logístico/SAC/estoque 1", ...],
  "pros": ["Vantagem 1", ...],
  "cons": ["Desvantagem 1", ...],
  "recommended_actions": [
    { "action": "Ação", "reason": "Motivo" }
  ]
}`;

        let attempt = 0;
        while (attempt < 3) {
            try {
                attempt++;
                const result = await genai.models.generateContent({
                    model: GEMINI_MODEL,
                    contents: [{ role: "user", parts: [{ text: prompt }] }],
                    config: { maxOutputTokens: 2048 },
                });

                const text = result.candidates?.[0]?.content?.parts?.[0]?.text || "";
                const cleanJson = text.replace(/```json/g, "").replace(/```/g, "").trim();
                const parsed = JSON.parse(cleanJson);
                return simulationAnalysisSchema.parse(parsed);
            } catch (err: any) {
                if (attempt === 3) throw new Error("Falha ao gerar análise do cenário: " + err.message);
                await new Promise((r) => setTimeout(r, 1000 * attempt));
            }
        }
    },

    /**
     * Saves a simulation to the database.
     */
    async saveScenario(tenantId: string, payload: {
        name: string;
        scenario_data: any;
        baseline_metrics: any;
        projected_metrics: any;
        ai_analysis?: any;
    }) {
        const { data, error } = await supabaseAdmin
            .from("simulations")
            .insert({
                tenant_id: tenantId,
                name: payload.name,
                scenario_data: payload.scenario_data,
                baseline_metrics: payload.baseline_metrics,
                projected_metrics: payload.projected_metrics,
                ai_analysis: payload.ai_analysis || null,
            })
            .select()
            .single();

        if (error) throw new Error(error.message);
        return data;
    },

    /**
     * Lists all saved simulations for a tenant.
     */
    async listScenarios(tenantId: string) {
        const { data, error } = await supabaseAdmin
            .from("simulations")
            .select("*")
            .eq("tenant_id", tenantId)
            .order("created_at", { ascending: false });

        if (error) throw new Error(error.message);
        return data || [];
    },

    /**
     * Deletes a saved simulation.
     */
    async deleteScenario(tenantId: string, id: string) {
        const { error } = await supabaseAdmin
            .from("simulations")
            .delete()
            .eq("tenant_id", tenantId)
            .eq("id", id);

        if (error) throw new Error(error.message);
        return true;
    }
};
