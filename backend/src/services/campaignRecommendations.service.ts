import { supabaseAdmin } from "../config/supabase";
import { queryFunctions, type QueryParams } from "./query-functions";
import { genai, GEMINI_MODEL } from "../config/gemini";
import { z } from "zod";

// ── Zod Schemas ─────────────────────────────────────────

const segmentSchema = z.object({
    name: z.string(),
    label: z.string(),
    count: z.number(),
    total_value: z.number(),
    avg_ticket: z.number(),
    description: z.string(),
});

const segmentRecommendationSchema = z.object({
    segment: z.string(),
    channel: z.object({
        primary: z.string(),
        secondary: z.string(),
        reasoning: z.string(),
    }),
    offer: z.object({
        type: z.string(),
        description: z.string(),
        discount_percent: z.number().nullable().optional(),
        validity_days: z.number().nullable().optional(),
    }),
    copy: z.object({
        subject_line: z.string(),
        body: z.string(),
        cta: z.string(),
    }),
    timing: z.object({
        best_day: z.string(),
        best_hour: z.string(),
        reasoning: z.string(),
    }),
    prediction: z.object({
        open_rate_percent: z.number(),
        ctr_percent: z.number(),
        conversion_percent: z.number(),
        projected_revenue: z.number(),
    }),
});

const campaignResponseSchema = z.object({
    recommendations: z.array(segmentRecommendationSchema).max(6),
    overall_summary: z.string(),
    priority_segment: z.string(),
});

// ── Retry helper (same pattern as autoInsights) ─────────

async function callGeminiWithRetry<T>(
    fn: () => Promise<T>,
    label: string,
    maxRetries = 3,
): Promise<T> {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            return await fn();
        } catch (error: any) {
            const isRetryable =
                error?.status === 429 ||
                error?.status === 503 ||
                error?.message?.includes("RESOURCE_EXHAUSTED");
            if (!isRetryable || attempt === maxRetries) throw error;
            const delay = Math.min(2 ** attempt * 1000, 15000);
            console.warn(`[CampaignRec] ${label} attempt ${attempt} failed, retrying in ${delay}ms...`);
            await new Promise((r) => setTimeout(r, delay));
        }
    }
    throw new Error("Unreachable");
}

// ── Segment classification ──────────────────────────────

interface RFMCustomer {
    customer_id: string;
    customer_name: string;
    recency: number;
    frequency: number;
    monetary: number;
    total_score: number;
    segment: string;
}

interface ClassifiedSegment {
    name: string;
    label: string;
    customers: RFMCustomer[];
    count: number;
    total_value: number;
    avg_ticket: number;
}

function classifyIntoSegments(rfmData: RFMCustomer[]): ClassifiedSegment[] {
    const segments: Record<string, { label: string; filter: (c: RFMCustomer) => boolean }> = {
        vips: {
            label: "VIPs (Alto LTV)",
            filter: (c) => c.total_score >= 10,
        },
        novos: {
            label: "Novos Clientes",
            filter: (c) => c.frequency <= 2 && c.recency <= 30,
        },
        em_risco: {
            label: "Em Risco",
            filter: (c) => c.recency >= 60 && c.recency < 180 && c.frequency > 2,
        },
        inativos: {
            label: "Inativos",
            filter: (c) => c.recency >= 180,
        },
        oportunistas: {
            label: "Oportunistas / Regulares",
            filter: (c) => c.total_score >= 4 && c.total_score < 10 && c.recency < 60,
        },
    };

    const classified: ClassifiedSegment[] = [];
    const assigned = new Set<string>();

    // Priority order: VIPs → Em Risco → Inativos → Novos → Oportunistas
    const order = ["vips", "em_risco", "inativos", "novos", "oportunistas"];

    for (const key of order) {
        const def = segments[key];
        const customers = rfmData.filter(
            (c) => !assigned.has(c.customer_id) && def.filter(c),
        );
        customers.forEach((c) => assigned.add(c.customer_id));

        const total_value = customers.reduce((s, c) => s + (c.monetary || 0), 0);
        classified.push({
            name: key,
            label: def.label,
            customers,
            count: customers.length,
            total_value: Math.round(total_value * 100) / 100,
            avg_ticket:
                customers.length > 0
                    ? Math.round((total_value / customers.length) * 100) / 100
                    : 0,
        });
    }

    return classified;
}

// ── Service ─────────────────────────────────────────────

export class CampaignRecommendationsService {
    /**
     * Generates campaign recommendations for a tenant.
     * 1. Gets RFM data → classifies into 5 segments
     * 2. Gets timing data (salesByHour, salesByDayOfWeek)
     * 3. Sends everything to Gemini for recommendations
     * 4. Persists to DB
     */
    static async generateForTenant(tenantId: string) {
        console.log(`[CampaignRec] Generating for tenant ${tenantId}...`);

        const params: QueryParams = {
            _tenant_id: tenantId,
            period_days: 180,
            all_time: true,
        };

        // ── 1. Gather data ──────────────────────────────
        const [rfmResult, timingHour, timingDay, smartSegments] = await Promise.allSettled([
            queryFunctions.getRFMAnalysis(params),
            queryFunctions.salesByHour({ ...params, period_days: 90 }),
            queryFunctions.salesByDayOfWeek({ ...params, period_days: 90 }),
            queryFunctions.getSmartSegments({ ...params, limit: 10 }),
        ]);

        const rfmData: RFMCustomer[] =
            rfmResult.status === "fulfilled"
                ? ((rfmResult.value as any)?.data || [])
                : [];

        const hourlyData =
            timingHour.status === "fulfilled" ? timingHour.value : [];
        const dailyData =
            timingDay.status === "fulfilled" ? timingDay.value : [];
        const segments =
            smartSegments.status === "fulfilled" ? smartSegments.value : {};

        if (rfmData.length === 0) {
            throw new Error("Sem dados RFM suficientes para gerar recomendações. Sincronize pedidos primeiro.");
        }

        // ── 2. Classify customers ───────────────────────
        const classifiedSegments = classifyIntoSegments(rfmData);

        // ── 3. Build Gemini prompt ──────────────────────
        const segmentsSummary = classifiedSegments.map((s) => ({
            name: s.name,
            label: s.label,
            count: s.count,
            total_value: s.total_value,
            avg_ticket: s.avg_ticket,
        }));

        const prompt = `Você é um estrategista de marketing digital especialista em e-commerce brasileiro.

DADOS DO NEGÓCIO:

## Segmentos de Clientes (baseado em análise RFM):
${JSON.stringify(segmentsSummary, null, 2)}

## Dados de Timing (vendas por hora do dia):
${JSON.stringify(hourlyData)}

## Dados de Timing (vendas por dia da semana):
${JSON.stringify(dailyData)}

## Smart Segments (clientes em risco de churn e candidatos a upsell):
${JSON.stringify(segments)}

TAREFA:
Para CADA segmento com pelo menos 1 cliente, gere uma recomendação completa de campanha de marketing com:

1. **Canal recomendado**: canal primário e secundário (Email, WhatsApp, SMS, Push, Retargeting Ads). Justifique com base no perfil do segmento.
2. **Oferta sugerida**: tipo de oferta, descrição, percentual de desconto (se aplicável), validade em dias.
3. **Copy personalizado**: subject line do email, corpo da mensagem (2-3 frases), texto do CTA (botão). Use o tom correto para cada segmento. Para VIPs, tom exclusivo. Para inativos, tom de saudade. Para novos, tom de boas-vindas.
4. **Timing ideal**: melhor dia da semana e horário para enviar, baseado nos dados de vendas fornecidos.
5. **Previsão de performance**: taxa de abertura esperada (%), CTR (%), conversão (%), receita projetada em R$ (baseada no ticket médio do segmento × taxa de conversão × quantidade de clientes).

Também inclua:
- Um resumo geral (overall_summary) de 2-3 frases sobre a estratégia recomendada
- Qual segmento deve ser priorizado (priority_segment) e por quê

FORMATO DE RESPOSTA (JSON válido, sem markdown):
{
  "recommendations": [
    {
      "segment": "nome_do_segmento",
      "channel": { "primary": "...", "secondary": "...", "reasoning": "..." },
      "offer": { "type": "...", "description": "...", "discount_percent": null, "validity_days": null },
      "copy": { "subject_line": "...", "body": "...", "cta": "..." },
      "timing": { "best_day": "...", "best_hour": "...", "reasoning": "..." },
      "prediction": { "open_rate_percent": 25, "ctr_percent": 8, "conversion_percent": 3, "projected_revenue": 15000 }
    }
  ],
  "overall_summary": "...",
  "priority_segment": "nome_do_segmento"
}

REGRAS:
- Retorne APENAS JSON válido, sem markdown, sem comentários
- Use valores realistas de mercado brasileiro para as previsões
- A receita projetada deve ser calculada: (count × avg_ticket × conversion_percent / 100)
- Segmentos com 0 clientes devem ser ignorados
- Copy deve ser em português do Brasil, informal mas profissional
- Valores monetários em R$ (reais)`;

        // ── 4. Call Gemini ───────────────────────────────
        const model = genai.models;
        const geminiResponse = await callGeminiWithRetry(async () => {
            const result = await model.generateContent({
                model: GEMINI_MODEL,
                contents: prompt,
                config: {
                    temperature: 0.7,
                    maxOutputTokens: 16384,
                },
            });
            return result.text || "";
        }, "campaign-recommendations");

        // ── 5. Parse and validate ─────────────────────
        let cleaned = (geminiResponse as string)
            .replace(/```json\s*/gi, "")
            .replace(/```\s*/gi, "")
            .trim();

        let parsed: z.infer<typeof campaignResponseSchema>;
        try {
            parsed = campaignResponseSchema.parse(JSON.parse(cleaned));
        } catch (parseError) {
            console.error("[CampaignRec] Gemini response parse error:", parseError);
            console.error("[CampaignRec] Raw response:", cleaned.substring(0, 500));
            throw new Error("Erro ao processar resposta da IA. Tente novamente.");
        }

        // ── 6. Persist ─────────────────────────────────
        const segmentsForDb = classifiedSegments.map((s) => ({
            name: s.name,
            label: s.label,
            count: s.count,
            total_value: s.total_value,
            avg_ticket: s.avg_ticket,
        }));

        const { data, error } = await supabaseAdmin
            .from("campaign_recommendations")
            .insert({
                tenant_id: tenantId,
                segments: segmentsForDb,
                recommendations: parsed,
                status: "generated",
            })
            .select()
            .single();

        if (error) {
            console.error("[CampaignRec] DB insert error:", error);
            throw new Error("Erro ao salvar recomendações.");
        }

        console.log(`[CampaignRec] Successfully generated for tenant ${tenantId}`);
        return data;
    }

    /**
     * Gets the latest campaign recommendation for a tenant.
     */
    static async getLatest(tenantId: string) {
        const { data, error } = await supabaseAdmin
            .from("campaign_recommendations")
            .select("*")
            .eq("tenant_id", tenantId)
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle();

        if (error) throw error;
        return data;
    }

    /**
     * Gets recommendation history with pagination.
     */
    static async getHistory(tenantId: string, limit = 10) {
        const { data, error } = await supabaseAdmin
            .from("campaign_recommendations")
            .select("id, tenant_id, segments, status, created_at")
            .eq("tenant_id", tenantId)
            .order("created_at", { ascending: false })
            .limit(limit);

        if (error) throw error;
        return data || [];
    }

    /**
     * Updates the status of a recommendation.
     */
    static async updateStatus(
        id: string,
        tenantId: string,
        status: "generated" | "approved" | "dismissed",
    ) {
        const { data, error } = await supabaseAdmin
            .from("campaign_recommendations")
            .update({ status })
            .eq("id", id)
            .eq("tenant_id", tenantId)
            .select()
            .single();

        if (error) throw error;
        return data;
    }
}
