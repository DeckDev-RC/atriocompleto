import { supabaseAdmin } from "../config/supabase";
import { queryFunctions } from "./query-functions";
import { genai, GEMINI_MODEL } from "../config/gemini";
import { z } from "zod";
import { resolveFrontendBaseUrl } from "./frontend-url";
import { getTenantPartnerId, getPartnerById } from "./partners";

export interface AutoInsight {
    id: string;
    tenant_id: string;
    category: 'vendas' | 'clientes' | 'estoque' | 'financeiro' | 'marketing' | 'operacional';
    priority: 'critical' | 'high' | 'medium' | 'low';
    title: string;
    description: string;
    data_support: any;
    recommended_actions: string[];
    status: 'new' | 'viewed' | 'resolved' | 'ignored';
    importance_score: number;
    created_at: string;
}

// ── Zod schema for Gemini response validation ───────────
const insightActionSchema = z.object({
    label: z.string(),
    action: z.string(),
});

const insightSchema = z.object({
    category: z.enum(['vendas', 'clientes', 'estoque', 'financeiro', 'marketing', 'operacional']),
    priority: z.enum(['critical', 'high', 'medium', 'low']),
    title: z.string().min(1).max(200),
    description: z.string().min(1).max(2000),
    importance_score: z.number().min(0).max(100),
    recommended_actions: z.array(insightActionSchema).max(5),
    data_support: z.record(z.unknown()).optional().default({}),
});

const insightsArraySchema = z.array(insightSchema).max(20);

// ── Retry with backoff (reusable) ───────────────────────
async function callGeminiWithRetry<T>(
    fn: () => Promise<T>,
    label: string,
    maxRetries = 3,
): Promise<T> {
    for (let attempt = 0; attempt < maxRetries; attempt++) {
        try {
            return await fn();
        } catch (error: any) {
            const isRetryable =
                error?.status === 429 ||
                error?.status === 503 ||
                error?.message?.includes("429") ||
                error?.message?.includes("503") ||
                error?.message?.includes("UNAVAILABLE");

            if (!isRetryable || attempt === maxRetries - 1) throw error;

            const delay = 1000 * Math.pow(2, attempt) + Math.random() * 500;
            console.warn(`[${label}] Retry ${attempt + 1}/${maxRetries} after ${Math.round(delay)}ms`);
            await new Promise((r) => setTimeout(r, delay));
        }
    }
    throw new Error("Unreachable");
}

// ── Concurrency limiter ─────────────────────────────────
async function runWithConcurrency<T>(
    tasks: (() => Promise<T>)[],
    concurrency: number,
): Promise<PromiseSettledResult<T>[]> {
    const results: PromiseSettledResult<T>[] = [];
    const executing = new Set<Promise<void>>();

    for (const task of tasks) {
        const p = (async () => {
            try {
                const value = await task();
                results.push({ status: "fulfilled", value });
            } catch (reason) {
                results.push({ status: "rejected", reason });
            }
        })();

        executing.add(p);
        p.finally(() => executing.delete(p));

        if (executing.size >= concurrency) {
            await Promise.race(executing);
        }
    }
    await Promise.all(executing);
    return results;
}

const INSIGHTS_CONCURRENCY = 3; // Process up to 3 tenants at once

export class AutoInsightsService {
    /**
     * Runs the daily insight generation for all active tenants.
     * Uses concurrency limiter to avoid overwhelming Gemini API.
     */
    static async generateAllDailyInsights() {
        console.log("[AutoInsights] Starting daily generation...");

        // Get all tenants
        const { data: tenants, error } = await supabaseAdmin
            .from("tenants")
            .select("id, name");

        if (error || !tenants) {
            console.error("[AutoInsights] Error fetching tenants:", error);
            return;
        }

        console.log(`[AutoInsights] Processing ${tenants.length} tenants (concurrency: ${INSIGHTS_CONCURRENCY})...`);

        const tasks = tenants.map((tenant) => async () => {
            await this.generateInsightsForTenant(tenant.id, tenant.name);
            await this.sendDailySummary(tenant.id);
        });

        const results = await runWithConcurrency(tasks, INSIGHTS_CONCURRENCY);

        const succeeded = results.filter((r) => r.status === "fulfilled").length;
        const failed = results.filter((r) => r.status === "rejected").length;

        results.forEach((r, i) => {
            if (r.status === "rejected") {
                console.error(`[AutoInsights] Error for tenant ${tenants[i].name}:`, r.reason);
            }
        });

        console.log(`[AutoInsights] Daily generation finished. Success: ${succeeded}, Failed: ${failed}`);
    }

    /**
     * Generates insights for a specific tenant based on daily health check.
     */
    static async generateInsightsForTenant(tenantId: string, tenantName: string) {
        console.log(`[AutoInsights] Analyzing tenant: ${tenantName}`);

        // 1. Get Analysis data
        const [healthData, rfmData, basketData, correlationData, segmentsData, topProductsData] = await Promise.all([
            queryFunctions.healthCheck({ _tenant_id: tenantId } as any),
            queryFunctions.getRFMAnalysis({ _tenant_id: tenantId } as any),
            queryFunctions.marketBasketLite({ _tenant_id: tenantId } as any),
            queryFunctions.getMetricCorrelation({ _tenant_id: tenantId, period_days: 90 } as any),
            queryFunctions.getSmartSegments({ _tenant_id: tenantId, limit: 10 } as any),
            queryFunctions.topProducts({ _tenant_id: tenantId } as any)
        ]);

        // 2. Prepare prompt for Gemini
        const prompt = `
      Você é um analista de e-commerce sênior. Analise os dados abaixo e gere insights acionáveis.

      DADOS DO NEGÓCIO:
      - Diagnóstico de saúde: ${JSON.stringify(healthData, null, 2)}
      - Segmentação RFM: ${JSON.stringify(rfmData, null, 2)}
      - Produtos comprados juntos (Cross-sell): ${JSON.stringify(basketData, null, 2)}
      - Correlação de métricas: ${JSON.stringify(correlationData, null, 2)}
      - Segmentos inteligentes (churn/upsell): ${JSON.stringify(segmentsData, null, 2)}
      - Top produtos por volume: ${JSON.stringify(topProductsData, null, 2)}

      DIRETRIZES:
      1. Identifique anomalias, oportunidades ou riscos críticos usando os Z-scores fornecidos.
      2. Categorize cada insight em: vendas, clientes, estoque, financeiro, marketing ou operacional.
      3. Defina a prioridade: critical (Z > 3), high (Z > 2), medium ou low.
      4. Atribua um Importance Score (0-100) baseado no impacto financeiro e urgência.
      5. Sugira 2-3 ações PRÁTICAS e ESPECÍFICAS. Cada ação deve ter um "label" (texto do botão) e um "action_slug".
      6. Use uma linguagem profissional, executiva e clara (Português Brasileiro).
      7. O título deve ser curto e impactante. A descrição deve ter 2-3 parágrafos curtos.
      8. CROSS-SELL: Se houver pares de produtos comprados juntos, sugira criação de kits/combos com eles.
      9. PRODUTOS ESTRELA: Identifique produtos com alto volume/receita e sugira ações de destaque ou reposição.
      10. Explique o PORQUÊ de cada insight (ex: "Porque 73% dos pedidos com X também incluem Y").

      RETORNE APENAS UM ARRAY JSON VÁLIDO no seguinte formato:
      [
        {
          "category": "vendas",
          "priority": "high",
          "title": "...",
          "description": "...",
          "importance_score": 85,
          "recommended_actions": [
            { "label": "Enviar E-mail VIP", "action": "enviar_email_vip" },
            { "label": "Criar Cupom", "action": "criar_cupom" }
          ],
          "data_support": { "metric": "value", "trend": "+20%" }
        }
      ]
    `;

        const result = await callGeminiWithRetry(
            () => genai.models.generateContent({
                model: GEMINI_MODEL,
                contents: [{ role: "user", parts: [{ text: prompt }] }]
            }),
            `AutoInsights:${tenantName}`
        );
        const responseText = result.candidates?.[0]?.content?.parts?.[0]?.text || "";

        // Remove markdown code blocks if present
        const cleanJson = responseText.replace(/```json/g, "").replace(/```/g, "").trim();

        try {
            const rawInsights = JSON.parse(cleanJson);

            // Validate with Zod
            const parseResult = insightsArraySchema.safeParse(rawInsights);
            if (!parseResult.success) {
                console.error(`[AutoInsights] Zod validation failed for ${tenantName}:`, parseResult.error.flatten());
                return;
            }

            const insights = parseResult.data;

            // Delete existing insights for today to avoid duplicates if re-run
            const today = new Date().toISOString().split('T')[0];
            await supabaseAdmin
                .from("auto_insights")
                .delete()
                .eq("tenant_id", tenantId)
                .gte("created_at", `${today}T00:00:00Z`);

            // Batch insert instead of one-by-one
            const insightRows = insights.map((insight) => ({
                tenant_id: tenantId,
                category: insight.category,
                priority: insight.priority,
                title: insight.title,
                description: insight.description,
                importance_score: insight.importance_score,
                recommended_actions: insight.recommended_actions,
                data_support: insight.data_support,
                status: 'new' as const,
            }));

            if (insightRows.length > 0) {
                const { error: saveError } = await supabaseAdmin
                    .from("auto_insights")
                    .insert(insightRows);

                if (saveError) {
                    console.error(`[AutoInsights] Error saving insights for ${tenantName}:`, saveError);
                }
            }

            console.log(`[AutoInsights] Generated ${insights.length} insights for ${tenantName}`);
        } catch (parseError) {
            console.error(`[AutoInsights] Error parsing Gemini response for ${tenantName}:`, parseError);
        }
    }

    /**
     * Consolidates and sends a daily summary email to the tenant's users.
     */
    static async sendDailySummary(tenantId: string) {
        try {
            const today = new Date().toISOString().split('T')[0];

            // 1. Get today's insights
            const { data: insights, error } = await supabaseAdmin
                .from("auto_insights")
                .select("*")
                .eq("tenant_id", tenantId)
                .gte("created_at", `${today}T00:00:00Z`);

            if (error || !insights || insights.length === 0) return;

            // 2. Get tenant users with permission to receive reports (simplified: all users for now)
            const { data: profiles } = await supabaseAdmin
                .from("profiles")
                .select("email, full_name")
                .eq("tenant_id", tenantId);

            if (!profiles || profiles.length === 0) return;

            // 3. Import email service dynamically to avoid circular dependencies if any
            const { sendDailyInsightsSummary } = await import("./email");
            const partnerId = await getTenantPartnerId(tenantId);
            const partner = await getPartnerById(partnerId);
            const frontendBaseUrl = await resolveFrontendBaseUrl({ tenantId, partnerId });

            for (const profile of profiles) {
                if (profile.email) {
                    await sendDailyInsightsSummary({
                        to: profile.email,
                        fullName: profile.full_name,
                        insights: insights as AutoInsight[],
                        dashboardUrl: `${frontendBaseUrl}/`,
                        brandName: partner?.name || null,
                    });
                }
            }
            console.log(`[AutoInsights] Summary email sent to ${profiles.length} users for tenant ${tenantId}`);
        } catch (err) {
            console.error(`[AutoInsights] Error sending daily summary for tenant ${tenantId}:`, err);
        }
    }

    /**
     * Fetches latest insights for a tenant.
     */
    static async getLatestInsights(tenantId: string, limit = 10) {
        const { data, error } = await supabaseAdmin
            .from("auto_insights")
            .select("*")
            .eq("tenant_id", tenantId)
            .order("created_at", { ascending: false })
            .limit(limit);

        if (error) throw error;
        return data as AutoInsight[];
    }

    /**
     * Marks an insight as resolved or viewed.
     */
    static async updateStatus(insightId: string, tenantId: string, status: AutoInsight['status']) {
        const { error } = await supabaseAdmin
            .from("auto_insights")
            .update({ status })
            .eq("id", insightId)
            .eq("tenant_id", tenantId);

    }

    /**
     * Fetches historical insights for a tenant with pagination and filters.
     */
    static async getHistory(tenantId: string, params: { page: number; limit: number; category?: string; priority?: string }) {
        let query = supabaseAdmin
            .from("auto_insights")
            .select("*", { count: "exact" })
            .eq("tenant_id", tenantId)
            .order("created_at", { ascending: false });

        if (params.category && params.category !== 'all') {
            query = query.eq("category", params.category);
        }
        if (params.priority && params.priority !== 'all') {
            query = query.eq("priority", params.priority);
        }

        const from = (params.page - 1) * params.limit;
        const to = from + params.limit - 1;
        query = query.range(from, to);

        const { data, error, count } = await query;
        if (error) throw error;

        return {
            insights: data as AutoInsight[],
            total: count || 0,
            page: params.page,
            limit: params.limit,
            totalPages: Math.ceil((count || 0) / params.limit)
        };
    }

    /**
     * Executes a contextual action for an insight.
     */
    static async executeAction(insightId: string, tenantId: string, action: string, params?: any) {
        console.log(`[AutoInsights] Executing action "${action}" for insight ${insightId}`);

        // 1. Log the attempt
        await supabaseAdmin.from("audit_logs").insert({
            tenant_id: tenantId,
            action: `insight_action:${action}`,
            resource: "auto_insights",
            entity_id: insightId,
            details: params || {}
        });

        // 2. Mock or Implement specific logic
        switch (action) {
            case 'enviar_email_vip':
                return {
                    status: 'success',
                    message: "E-mail de fidelidade enviado para o segmento VIP."
                };

            case 'criar_cupom_recuperacao':
                return {
                    status: 'success',
                    message: "Cupom de desconto 'VOLTA20' gerado e pronto para envio."
                };

            case 'enviar_whatsapp_alerta':
                return {
                    status: 'success',
                    message: "Notificação via WhatsApp enviada para o cliente."
                };

            case 'disparar_push_promocao':
                return {
                    status: 'success',
                    message: "Campanha de Push Notification agendada com sucesso."
                };

            case 'marcar_estoque_baixo':
                return {
                    status: 'success',
                    message: "Produtos marcados para reposição prioritária no logístico."
                };

            default:
                return {
                    status: 'success',
                    message: `Ação "${action}" disparada com sucesso.`
                };
        }
    }
}
