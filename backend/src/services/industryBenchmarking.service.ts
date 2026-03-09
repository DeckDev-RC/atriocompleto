import { supabaseAdmin } from "../config/supabase";
import { queryFunctions, type QueryParams } from "./query-functions";
import { genai, GEMINI_MODEL } from "../config/gemini";
import { z } from "zod";

// ── Size tier thresholds (annual revenue in BRL) ────────
const SIZE_TIERS = [
    { tier: "micro" as const, label: "Microempresa", maxRevenue: 360_000 },
    { tier: "pequena" as const, label: "Pequena Empresa", maxRevenue: 4_800_000 },
    { tier: "media" as const, label: "Média Empresa", maxRevenue: 300_000_000 },
    { tier: "grande" as const, label: "Grande Empresa", maxRevenue: Infinity },
];

// ── Zod schema for Gemini gap analysis ──────────────────
const gapAnalysisSchema = z.object({
    gaps: z.array(z.object({
        metric: z.string(),
        your_value: z.string(),
        benchmark_value: z.string(),
        gap_description: z.string(),
        priority: z.enum(["alta", "media", "baixa"]),
    })).max(10),
    strengths: z.array(z.string()).max(5),
    best_practices: z.array(z.object({
        practice: z.string(),
        description: z.string(),
        expected_impact: z.string(),
    })).max(5),
    positioning_summary: z.string().max(2000),
    recommended_actions: z.array(z.object({
        action: z.string(),
        priority: z.enum(["alta", "media", "baixa"]),
        estimated_effort: z.string(),
    })).max(5),
});

// ── Retry helper ────────────────────────────────────────
async function callGeminiWithRetry<T>(
    fn: () => Promise<T>,
    label: string,
    maxRetries = 3,
): Promise<T> {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            return await fn();
        } catch (err: any) {
            const isRetryable =
                err.status === 429 ||
                err.status === 503 ||
                err.message?.includes("RESOURCE_EXHAUSTED");
            if (!isRetryable || attempt === maxRetries) throw err;
            const delay = 1000 * Math.pow(2, attempt - 1);
            console.warn(`[IndustryBenchmark] ${label} attempt ${attempt} failed, retrying in ${delay}ms...`);
            await new Promise((r) => setTimeout(r, delay));
        }
    }
    throw new Error("Unreachable");
}

// ── Service ─────────────────────────────────────────────
export const IndustryBenchmarkingService = {

    /**
     * Classifies tenant into a size tier based on last 12 months revenue.
     */
    async classifyTenantSize(tenantId: string) {
        const now = new Date();
        const yearAgo = new Date(now);
        yearAgo.setFullYear(yearAgo.getFullYear() - 1);

        const params: QueryParams = {
            _tenant_id: tenantId,
            start_date: yearAgo.toISOString().split("T")[0],
            end_date: now.toISOString().split("T")[0],
        };

        const result = await queryFunctions.totalSales(params) as any;
        const annualRevenue = result?.total ?? result?.data?.total ?? 0;

        const matched = SIZE_TIERS.find((t) => annualRevenue < t.maxRevenue) || SIZE_TIERS[3];

        return {
            tier: matched.tier,
            label: matched.label,
            annual_revenue: annualRevenue,
            thresholds: SIZE_TIERS.map((t) => ({
                tier: t.tier,
                label: t.label,
                max: t.maxRevenue === Infinity ? null : t.maxRevenue,
            })),
        };
    },

    /**
     * Fetches static industry benchmarks for a given size tier.
     */
    async getBenchmarks(sizeTier: string, sector = "ecommerce") {
        const { data, error } = await supabaseAdmin
            .from("industry_benchmarks")
            .select("*")
            .eq("sector", sector)
            .eq("size_tier", sizeTier)
            .order("metric_key");
        if (error) throw new Error(error.message);
        return data || [];
    },

    /**
     * Returns tenant metrics compared against industry benchmarks.
     */
    async getIndustryComparison(tenantId: string) {
        // 1. Classify tenant
        const sizeInfo = await this.classifyTenantSize(tenantId);

        // 2. Fetch benchmarks for this tier
        const benchmarks = await this.getBenchmarks(sizeInfo.tier);

        // 3. Calculate tenant's current metrics in parallel
        const now = new Date();
        const thirtyDaysAgo = new Date(now);
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        const yearAgo = new Date(now);
        yearAgo.setFullYear(yearAgo.getFullYear() - 1);

        const baseParams: QueryParams = {
            _tenant_id: tenantId,
            start_date: thirtyDaysAgo.toISOString().split("T")[0],
            end_date: now.toISOString().split("T")[0],
        };

        const yearParams: QueryParams = {
            _tenant_id: tenantId,
            start_date: yearAgo.toISOString().split("T")[0],
            end_date: now.toISOString().split("T")[0],
        };

        const [avgTicketResult, cancelResult, yoyResult, ordersResult] = await Promise.all([
            queryFunctions.avgTicket(baseParams).catch(() => null),
            queryFunctions.cancellationRate(baseParams).catch(() => null),
            queryFunctions.yearOverYear(yearParams).catch(() => null),
            queryFunctions.countOrders(baseParams).catch(() => null),
        ]);

        // Extract values
        const tenantMetrics: Record<string, number> = {};

        // avgTicket
        const atk = avgTicketResult as any;
        tenantMetrics.avg_ticket = atk?.avg_ticket ?? atk?.data?.avg_ticket ?? 0;

        // cancellationRate
        const cr = cancelResult as any;
        tenantMetrics.cancellation_rate = cr?.rate ?? cr?.data?.rate ?? 0;

        // yoy growth
        const yoy = yoyResult as any;
        if (yoy?.data?.length >= 2) {
            const sorted = [...yoy.data].sort((a: any, b: any) => b.year - a.year);
            const current = sorted[0]?.total ?? 0;
            const previous = sorted[1]?.total ?? 0;
            tenantMetrics.yoy_growth = previous > 0
                ? ((current - previous) / previous) * 100
                : 0;
        } else {
            tenantMetrics.yoy_growth = 0;
        }

        // orders per month (last 30 days as proxy)
        const oc = ordersResult as any;
        tenantMetrics.avg_orders_month = oc?.count ?? oc?.data?.count ?? 0;

        // revenue per order
        const totalRevenue = tenantMetrics.avg_ticket * tenantMetrics.avg_orders_month;
        tenantMetrics.revenue_per_order = tenantMetrics.avg_orders_month > 0
            ? totalRevenue / tenantMetrics.avg_orders_month
            : 0;

        // 4. Build comparison array
        const comparisons = benchmarks.map((b: any) => {
            const tenantValue = tenantMetrics[b.metric_key] ?? 0;
            const refValue = Number(b.reference_value);
            const p25 = Number(b.percentile_25);
            const p75 = Number(b.percentile_75);

            // Determine status
            // For cancellation_rate, lower is better
            const lowerIsBetter = b.metric_key === "cancellation_rate";
            let status: "above" | "at_range" | "below";

            if (lowerIsBetter) {
                status = tenantValue <= p25 ? "above" : tenantValue >= p75 ? "below" : "at_range";
            } else {
                status = tenantValue >= p75 ? "above" : tenantValue <= p25 ? "below" : "at_range";
            }

            const gapPct = refValue !== 0
                ? ((tenantValue - refValue) / refValue) * 100
                : 0;

            return {
                metric_key: b.metric_key,
                metric_label: b.metric_label,
                unit: b.unit,
                tenant_value: Math.round(tenantValue * 100) / 100,
                benchmark_value: refValue,
                percentile_25: p25,
                percentile_75: p75,
                gap_pct: Math.round(gapPct * 10) / 10,
                status,
                source: b.source,
            };
        });

        return {
            size: sizeInfo,
            comparisons,
            generated_at: new Date().toISOString(),
        };
    },

    /**
     * Generates a Gemini-powered gap analysis against industry benchmarks.
     */
    async generateGapAnalysis(tenantId: string) {
        // Get comparison data
        const comparison = await this.getIndustryComparison(tenantId);

        const prompt = `Você é um consultor empresarial especializado em e-commerce brasileiro.
Analise os dados comparativos abaixo entre uma empresa e os benchmarks do setor.

## Dados da Empresa
- Porte: ${comparison.size.label} (receita anual: R$ ${Math.round(comparison.size.annual_revenue).toLocaleString("pt-BR")})
- Faixa de comparação: ${comparison.size.tier}

## Métricas Comparativas
${comparison.comparisons.map((c: any) => `- ${c.metric_label}: Empresa = ${c.tenant_value}${c.unit} | Benchmark = ${c.benchmark_value}${c.unit} | Gap = ${c.gap_pct > 0 ? "+" : ""}${c.gap_pct}% | Status: ${c.status === "above" ? "ACIMA" : c.status === "below" ? "ABAIXO" : "NA MÉDIA"}`).join("\n")}

## Instruções
1. Identifique os principais gaps (onde a empresa está abaixo do benchmark)
2. Destaque os pontos fortes (onde está acima)
3. Sugira best practices que líderes do setor utilizam
4. Crie um resumo de posicionamento (max 2000 chars)
5. Recomende ações concretas com prioridade

Para taxa de cancelamento: menor é melhor.
Para as demais métricas: maior é melhor.

Responda APENAS com JSON válido no formato:
{
  "gaps": [
    { "metric": "nome", "your_value": "valor", "benchmark_value": "valor", "gap_description": "descrição", "priority": "alta|media|baixa" }
  ],
  "strengths": ["ponto forte 1", ...],
  "best_practices": [
    { "practice": "nome", "description": "descrição", "expected_impact": "impacto esperado" }
  ],
  "positioning_summary": "resumo do posicionamento...",
  "recommended_actions": [
    { "action": "ação concreta", "priority": "alta|media|baixa", "estimated_effort": "curto/médio/longo prazo" }
  ]
}`;

        const result = await callGeminiWithRetry(
            () => genai.models.generateContent({
                model: GEMINI_MODEL,
                contents: [{ role: "user", parts: [{ text: prompt }] }],
                config: { maxOutputTokens: 4096 },
            }),
            "Industry Gap Analysis",
        );

        const responseText = result.candidates?.[0]?.content?.parts?.[0]?.text || "";
        const cleanJson = responseText.replace(/```json/g, "").replace(/```/g, "").trim();
        const rawResult = JSON.parse(cleanJson);

        // Validate with Zod
        const parsed = gapAnalysisSchema.parse(rawResult);

        // Persist in benchmarking_swot table with industry type discriminator
        const { data, error } = await supabaseAdmin
            .from("benchmarking_swot")
            .insert({
                tenant_id: tenantId,
                swot_data: {
                    analysis_type: "industry",
                    ...parsed,
                    comparison_snapshot: comparison,
                },
                price_suggestions: [],
            })
            .select()
            .single();
        if (error) throw new Error(error.message);

        return {
            id: data.id,
            ...parsed,
            size: comparison.size,
            comparisons: comparison.comparisons,
            generated_at: data.created_at,
        };
    },

    /**
     * Gets the latest industry analysis for a tenant.
     */
    async getLatestAnalysis(tenantId: string) {
        const { data, error } = await supabaseAdmin
            .from("benchmarking_swot")
            .select("*")
            .eq("tenant_id", tenantId)
            .filter("swot_data->>analysis_type", "eq", "industry")
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle();
        if (error) throw new Error(error.message);
        return data;
    },
};
