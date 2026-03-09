import { supabaseAdmin } from "../config/supabase";
import { queryFunctions, type QueryParams } from "./query-functions";
import { genai, GEMINI_MODEL } from "../config/gemini";
import { z } from "zod";

// ── Zod schemas for Gemini SWOT response ────────────────
const swotSchema = z.object({
    strengths: z.array(z.string()).max(8),
    weaknesses: z.array(z.string()).max(8),
    opportunities: z.array(z.string()).max(8),
    threats: z.array(z.string()).max(8),
    price_suggestions: z.array(z.object({
        product: z.string(),
        current_price: z.number(),
        suggested_price: z.number(),
        reason: z.string(),
    })).max(10),
    executive_summary: z.string().max(2000),
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
            console.warn(`[Benchmarking] ${label} attempt ${attempt} failed, retrying in ${delay}ms...`);
            await new Promise((r) => setTimeout(r, delay));
        }
    }
    throw new Error("Unreachable");
}

// ── Service ─────────────────────────────────────────────
export const BenchmarkingService = {

    // ═══════════════════════════════════════════════════════
    // COMPETITORS CRUD
    // ═══════════════════════════════════════════════════════

    async listCompetitors(tenantId: string) {
        const { data, error } = await supabaseAdmin
            .from("competitors")
            .select("*")
            .eq("tenant_id", tenantId)
            .order("created_at", { ascending: false });
        if (error) throw new Error(error.message);
        return data || [];
    },

    async createCompetitor(tenantId: string, payload: {
        name: string;
        website_url?: string;
        category?: "direto" | "indireto";
        region?: string;
        notes?: string;
    }) {
        const { data, error } = await supabaseAdmin
            .from("competitors")
            .insert({ tenant_id: tenantId, ...payload })
            .select()
            .single();
        if (error) throw new Error(error.message);
        return data;
    },

    async updateCompetitor(id: string, tenantId: string, payload: Record<string, unknown>) {
        const { data, error } = await supabaseAdmin
            .from("competitors")
            .update({ ...payload, updated_at: new Date().toISOString() })
            .eq("id", id)
            .eq("tenant_id", tenantId)
            .select()
            .single();
        if (error) throw new Error(error.message);
        return data;
    },

    async deleteCompetitor(id: string, tenantId: string) {
        const { error } = await supabaseAdmin
            .from("competitors")
            .delete()
            .eq("id", id)
            .eq("tenant_id", tenantId);
        if (error) throw new Error(error.message);
    },

    // ═══════════════════════════════════════════════════════
    // COMPETITOR PRODUCTS CRUD
    // ═══════════════════════════════════════════════════════

    async listProducts(tenantId: string, competitorId?: string) {
        let query = supabaseAdmin
            .from("competitor_products")
            .select("*, competitors(name)")
            .eq("tenant_id", tenantId)
            .order("created_at", { ascending: false });

        if (competitorId) {
            query = query.eq("competitor_id", competitorId);
        }

        const { data, error } = await query;
        if (error) throw new Error(error.message);
        return data || [];
    },

    async addProduct(tenantId: string, competitorId: string, payload: {
        product_name: string;
        your_product_name?: string;
        current_price?: number;
        your_price?: number;
    }) {
        const { data, error } = await supabaseAdmin
            .from("competitor_products")
            .insert({
                tenant_id: tenantId,
                competitor_id: competitorId,
                ...payload,
                last_checked_at: new Date().toISOString(),
            })
            .select()
            .single();
        if (error) throw new Error(error.message);

        // Record initial price in history
        if (data && (payload.current_price || payload.your_price)) {
            await supabaseAdmin.from("competitor_price_history").insert({
                competitor_product_id: data.id,
                price: payload.current_price || 0,
                your_price_at_time: payload.your_price || 0,
            });
        }

        return data;
    },

    async updateProduct(id: string, tenantId: string, payload: {
        product_name?: string;
        your_product_name?: string;
        current_price?: number;
        your_price?: number;
    }) {
        // Fetch old price to detect changes
        const { data: old } = await supabaseAdmin
            .from("competitor_products")
            .select("current_price, your_price")
            .eq("id", id)
            .eq("tenant_id", tenantId)
            .single();

        const updateData: Record<string, unknown> = {
            ...payload,
            updated_at: new Date().toISOString(),
        };

        if (payload.current_price !== undefined) {
            updateData.last_checked_at = new Date().toISOString();
        }

        const { data, error } = await supabaseAdmin
            .from("competitor_products")
            .update(updateData)
            .eq("id", id)
            .eq("tenant_id", tenantId)
            .select()
            .single();
        if (error) throw new Error(error.message);

        // Record price change in history
        const priceChanged = old && (
            (payload.current_price !== undefined && payload.current_price !== Number(old.current_price)) ||
            (payload.your_price !== undefined && payload.your_price !== Number(old.your_price))
        );

        if (priceChanged) {
            await supabaseAdmin.from("competitor_price_history").insert({
                competitor_product_id: id,
                price: payload.current_price ?? Number(old!.current_price),
                your_price_at_time: payload.your_price ?? Number(old!.your_price),
            });
        }

        return data;
    },

    async deleteProduct(id: string, tenantId: string) {
        const { error } = await supabaseAdmin
            .from("competitor_products")
            .delete()
            .eq("id", id)
            .eq("tenant_id", tenantId);
        if (error) throw new Error(error.message);
    },

    // ═══════════════════════════════════════════════════════
    // PRICE HISTORY & COMPARISON
    // ═══════════════════════════════════════════════════════

    async getPriceHistory(productId: string) {
        const { data, error } = await supabaseAdmin
            .from("competitor_price_history")
            .select("*")
            .eq("competitor_product_id", productId)
            .order("recorded_at", { ascending: true });
        if (error) throw new Error(error.message);
        return data || [];
    },

    async getComparison(tenantId: string) {
        const { data: products, error } = await supabaseAdmin
            .from("competitor_products")
            .select("*, competitors(name)")
            .eq("tenant_id", tenantId)
            .order("product_name");
        if (error) throw new Error(error.message);
        if (!products || products.length === 0) return { products: [], summary: null };

        // Group by your_product_name for side-by-side comparison
        const grouped: Record<string, {
            your_product: string;
            your_price: number;
            competitors: { name: string; price: number; diff_pct: number; status: "cheaper" | "same" | "expensive" }[];
        }> = {};

        for (const p of products) {
            const key = p.your_product_name || p.product_name;
            if (!grouped[key]) {
                grouped[key] = { your_product: key, your_price: Number(p.your_price) || 0, competitors: [] };
            }
            const competitorName = (p.competitors as any)?.name || "Desconhecido";
            const competitorPrice = Number(p.current_price) || 0;
            const yourPrice = Number(p.your_price) || 0;
            const diffPct = yourPrice > 0 ? ((competitorPrice - yourPrice) / yourPrice) * 100 : 0;
            const status: "cheaper" | "same" | "expensive" =
                diffPct < -5 ? "cheaper" : diffPct > 5 ? "expensive" : "same";

            grouped[key].competitors.push({
                name: competitorName,
                price: competitorPrice,
                diff_pct: Math.round(diffPct * 10) / 10,
                status,
            });
        }

        const comparison = Object.values(grouped);

        // Summary stats
        const totalProducts = comparison.length;
        const cheaperCount = comparison.reduce((sum, c) => sum + c.competitors.filter(x => x.status === "cheaper").length, 0);
        const expensiveCount = comparison.reduce((sum, c) => sum + c.competitors.filter(x => x.status === "expensive").length, 0);

        return {
            products: comparison,
            summary: { totalProducts, cheaperCount, expensiveCount },
        };
    },

    async getAlerts(tenantId: string) {
        // Fetch all products with recent price history
        const { data: products, error } = await supabaseAdmin
            .from("competitor_products")
            .select("id, product_name, your_product_name, current_price, your_price, competitors(name)")
            .eq("tenant_id", tenantId);
        if (error) throw new Error(error.message);
        if (!products) return [];

        const alerts: {
            type: "price_drop" | "price_increase" | "cheaper_competitor" | "suggestion";
            severity: "high" | "medium" | "low";
            message: string;
            product: string;
            competitor: string;
            data: Record<string, unknown>;
        }[] = [];

        for (const p of products) {
            const competitorName = (p.competitors as any)?.name || "Desconhecido";
            const currentPrice = Number(p.current_price);
            const yourPrice = Number(p.your_price);

            // Get last 2 history entries for change detection
            const { data: history } = await supabaseAdmin
                .from("competitor_price_history")
                .select("price, recorded_at")
                .eq("competitor_product_id", p.id)
                .order("recorded_at", { ascending: false })
                .limit(2);

            if (history && history.length >= 2) {
                const latest = Number(history[0].price);
                const previous = Number(history[1].price);
                const changePct = previous > 0 ? ((latest - previous) / previous) * 100 : 0;

                if (changePct <= -10) {
                    alerts.push({
                        type: "price_drop",
                        severity: "high",
                        message: `${competitorName} baixou ${Math.abs(Math.round(changePct))}% no preço de "${p.product_name}"`,
                        product: p.product_name,
                        competitor: competitorName,
                        data: { previous, latest, change_pct: Math.round(changePct * 10) / 10 },
                    });
                } else if (changePct >= 10) {
                    alerts.push({
                        type: "price_increase",
                        severity: "medium",
                        message: `${competitorName} aumentou ${Math.round(changePct)}% no preço de "${p.product_name}"`,
                        product: p.product_name,
                        competitor: competitorName,
                        data: { previous, latest, change_pct: Math.round(changePct * 10) / 10 },
                    });
                }
            }

            // Cheaper competitor alert
            if (currentPrice > 0 && yourPrice > 0 && currentPrice < yourPrice * 0.85) {
                const diffPct = ((currentPrice - yourPrice) / yourPrice) * 100;
                alerts.push({
                    type: "cheaper_competitor",
                    severity: "high",
                    message: `${competitorName} vende "${p.product_name}" por ${Math.abs(Math.round(diffPct))}% menos que você`,
                    product: p.product_name,
                    competitor: competitorName,
                    data: { your_price: yourPrice, competitor_price: currentPrice, diff_pct: Math.round(diffPct * 10) / 10 },
                });
            }
        }

        // Sort by severity
        const severityOrder = { high: 0, medium: 1, low: 2 };
        alerts.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);

        return alerts;
    },

    // ═══════════════════════════════════════════════════════
    // GEMINI SWOT ANALYSIS
    // ═══════════════════════════════════════════════════════

    async generateSWOT(tenantId: string) {
        // Gather all data in parallel
        const [competitors, comparison, alerts, topProductsRaw, summaryRaw] = await Promise.all([
            this.listCompetitors(tenantId),
            this.getComparison(tenantId),
            this.getAlerts(tenantId),
            queryFunctions.topProducts({ _tenant_id: tenantId } as any).catch(() => ({ data: [] })),
            queryFunctions.executiveSummary({ _tenant_id: tenantId } as any).catch(() => null),
        ]);

        if (competitors.length === 0) {
            throw new Error("Cadastre ao menos um concorrente antes de gerar a análise SWOT.");
        }

        const topProducts = (topProductsRaw as any)?.data || [];

        const prompt = `Você é um analista de mercado especializado em e-commerce e varejo.
Analise os dados abaixo e gere uma análise SWOT competitiva detalhada em português brasileiro.

## Dados da Empresa
- Top Produtos: ${JSON.stringify(topProducts.slice(0, 10))}
- Resumo Executivo: ${JSON.stringify(summaryRaw)}

## Dados Competitivos
- Concorrentes cadastrados: ${JSON.stringify(competitors.map((c: any) => ({ name: c.name, category: c.category, region: c.region })))}
- Comparação de Preços: ${JSON.stringify(comparison.products.slice(0, 20))}
- Alertas Ativos: ${JSON.stringify(alerts.slice(0, 10))}

## Instruções
1. Gere uma análise SWOT focada na posição competitiva
2. Strengths: pontos fortes da empresa vs concorrentes
3. Weaknesses: pontos fracos vs concorrentes
4. Opportunities: oportunidades baseadas nos gaps encontrados
5. Threats: ameaças identificadas nos dados
6. Price Suggestions: sugestões concretas de ajuste de preço com justificativa
7. Executive Summary: resumo executivo da análise competitiva (max 2000 chars)

Responda APENAS com JSON válido no formato:
{
  "strengths": ["ponto forte 1", ...],
  "weaknesses": ["ponto fraco 1", ...],
  "opportunities": ["oportunidade 1", ...],
  "threats": ["ameaça 1", ...],
  "price_suggestions": [
    { "product": "nome", "current_price": 99.90, "suggested_price": 89.90, "reason": "motivo" }
  ],
  "executive_summary": "resumo..."
}`;

        const result = await callGeminiWithRetry(
            () => genai.models.generateContent({
                model: GEMINI_MODEL,
                contents: [{ role: "user", parts: [{ text: prompt }] }],
            }),
            "SWOT Analysis",
        );

        const responseText = result.candidates?.[0]?.content?.parts?.[0]?.text || "";
        const cleanJson = responseText.replace(/```json/g, "").replace(/```/g, "").trim();
        const rawResult = JSON.parse(cleanJson);

        // Validate with Zod
        const parsed = swotSchema.parse(rawResult);

        // Persist
        const { data, error } = await supabaseAdmin
            .from("benchmarking_swot")
            .insert({
                tenant_id: tenantId,
                swot_data: {
                    strengths: parsed.strengths,
                    weaknesses: parsed.weaknesses,
                    opportunities: parsed.opportunities,
                    threats: parsed.threats,
                    executive_summary: parsed.executive_summary,
                },
                price_suggestions: parsed.price_suggestions,
            })
            .select()
            .single();
        if (error) throw new Error(error.message);

        return { ...data, parsed };
    },

    async getLatestSWOT(tenantId: string) {
        const { data, error } = await supabaseAdmin
            .from("benchmarking_swot")
            .select("*")
            .eq("tenant_id", tenantId)
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle();
        if (error) throw new Error(error.message);
        return data;
    },
};
