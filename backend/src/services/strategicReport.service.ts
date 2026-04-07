import { supabaseAdmin } from "../config/supabase";
import { queryFunctions } from "./query-functions";
import { genai, GEMINI_MODEL } from "../config/gemini";
import { z } from "zod";
import { resolveFrontendBaseUrl } from "./frontend-url";
import { getTenantPartnerId, getPartnerById } from "./partners";

// ── Zod schema for strategic actions ────────────────────
const strategicActionSchema = z.object({
    title: z.string().min(1).max(200),
    description: z.string().min(1).max(1000),
    category: z.enum(["investimento", "descontinuacao", "promocao", "retencao", "otimizacao"]),
    impact_score: z.number().min(1).max(10),
    ease_score: z.number().min(1).max(10),
    priority_score: z.number().min(1).max(100),
    timeframe: z.enum(["imediato", "curto_prazo", "medio_prazo", "longo_prazo"]),
    justification: z.string().min(1).max(500),
});

const strategicReportSchema = z.object({
    executive_summary: z.string().min(1).max(3000),
    opportunities: z.array(z.string()).max(5),
    risks: z.array(z.string()).max(5),
    actions: z.array(strategicActionSchema).max(10),
});

// ── Retry with backoff ──────────────────────────────────
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

export class StrategicReportService {
    /**
     * Generates strategic reports for all tenants (called by weekly cron).
     */
    static async generateForAllTenants() {
        console.log("[StrategicReport] Starting weekly generation...");

        const { data: tenants, error } = await supabaseAdmin
            .from("tenants")
            .select("id, name");

        if (error || !tenants) {
            console.error("[StrategicReport] Error fetching tenants:", error);
            return;
        }

        for (const tenant of tenants) {
            try {
                await this.generateForTenant(tenant.id, tenant.name);
            } catch (err) {
                console.error(`[StrategicReport] Error for tenant ${tenant.name}:`, err);
            }
        }

        console.log("[StrategicReport] Weekly generation finished.");
    }

    /**
     * Generates a strategic report for a specific tenant.
     */
    static async generateForTenant(tenantId: string, tenantName: string) {
        console.log(`[StrategicReport] Generating for: ${tenantName}`);

        const params = { _tenant_id: tenantId } as any;

        // Gather all data sources
        const [
            bcgData,
            healthData,
            rfmData,
            topProductsData,
            basketData,
            segmentsData,
            seasonalityData,
            yoyData,
        ] = await Promise.all([
            queryFunctions.bcgMatrix(params),
            queryFunctions.healthCheck(params),
            queryFunctions.getRFMAnalysis(params),
            queryFunctions.topProducts(params),
            queryFunctions.marketBasketLite(params),
            queryFunctions.getSmartSegments(params),
            queryFunctions.seasonalityAnalysis(params),
            queryFunctions.yearOverYear(params),
        ]);

        const prompt = `
Você é um consultor estratégico de e-commerce sênior. Analise os dados abaixo e gere um RELATÓRIO ESTRATÉGICO SEMANAL com recomendações acionáveis.

DADOS DO NEGÓCIO:

1. MATRIZ BCG (portfólio de produtos):
${JSON.stringify(bcgData, null, 2)}

2. DIAGNÓSTICO DE SAÚDE:
${JSON.stringify(healthData, null, 2)}

3. SEGMENTAÇÃO RFM (clientes):
${JSON.stringify(rfmData, null, 2)}

4. TOP PRODUTOS:
${JSON.stringify(topProductsData, null, 2)}

5. PRODUTOS COMPRADOS JUNTOS:
${JSON.stringify(basketData, null, 2)}

6. SEGMENTOS INTELIGENTES (churn/upsell):
${JSON.stringify(segmentsData, null, 2)}

7. SAZONALIDADE:
${JSON.stringify(seasonalityData, null, 2)}

8. COMPARAÇÃO ANO-A-ANO:
${JSON.stringify(yoyData, null, 2)}

INSTRUÇÕES:
1. Escreva um RESUMO EXECUTIVO de 2-4 parágrafos com a visão geral da saúde do negócio.
2. Liste até 5 OPORTUNIDADES identificadas (textos curtos).
3. Liste até 5 RISCOS identificados (textos curtos).
4. Gere até 10 AÇÕES ESTRATÉGICAS priorizadas. Para cada ação:
   - title: Título curto e claro
   - description: O que fazer e por quê
   - category: investimento | descontinuacao | promocao | retencao | otimizacao
   - impact_score: 1-10 (impacto no negócio)
   - ease_score: 1-10 (facilidade de implementação)
   - priority_score: impact_score × ease_score (calculado, 1-100)
   - timeframe: imediato | curto_prazo | medio_prazo | longo_prazo
   - justification: Frase com dados de suporte (ex: "Porque produto X cresceu 45% YoY")

CATEGORIAS DE AÇÕES:
- investimento: "Investir mais em categoria X", "Ampliar presença no marketplace Y"
- descontinuacao: "Descontinuar produto sem vendas há 90+ dias"
- promocao: "Fazer promoção relâmpago no horário de pico", "Black Friday"
- retencao: "Criar programa para clientes em risco de churn"
- otimizacao: "Criar kit com produtos comprados juntos"

REGRAS:
- Use Português Brasileiro, linguagem executiva.
- Baseie TODAS as recomendações nos dados fornecidos — não invente dados.
- O priority_score deve ser o produto impact_score × ease_score.
- Ordene as ações por priority_score (maior primeiro).

RETORNE APENAS UM JSON VÁLIDO no formato:
{
  "executive_summary": "...",
  "opportunities": ["...", "..."],
  "risks": ["...", "..."],
  "actions": [
    {
      "title": "...",
      "description": "...",
      "category": "investimento",
      "impact_score": 8,
      "ease_score": 7,
      "priority_score": 56,
      "timeframe": "curto_prazo",
      "justification": "..."
    }
  ]
}
`;

        const result = await callGeminiWithRetry(
            () =>
                genai.models.generateContent({
                    model: GEMINI_MODEL,
                    contents: [{ role: "user", parts: [{ text: prompt }] }],
                }),
            `StrategicReport:${tenantName}`,
        );

        const responseText = result.candidates?.[0]?.content?.parts?.[0]?.text || "";
        const cleanJson = responseText.replace(/```json/g, "").replace(/```/g, "").trim();

        try {
            const rawReport = JSON.parse(cleanJson);
            const parseResult = strategicReportSchema.safeParse(rawReport);

            if (!parseResult.success) {
                console.error(`[StrategicReport] Zod validation failed for ${tenantName}:`, parseResult.error.flatten());
                return null;
            }

            const report = parseResult.data;

            // Sort actions by priority_score descending
            report.actions.sort((a, b) => b.priority_score - a.priority_score);

            // Save to database
            const now = new Date();
            const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

            const { data: saved, error: saveError } = await supabaseAdmin
                .from("strategic_reports")
                .insert({
                    tenant_id: tenantId,
                    report_data: {
                        executive_summary: report.executive_summary,
                        opportunities: report.opportunities,
                        risks: report.risks,
                    },
                    bcg_data: bcgData,
                    actions: report.actions,
                    period_start: weekAgo.toISOString().split("T")[0],
                    period_end: now.toISOString().split("T")[0],
                })
                .select("id")
                .single();

            if (saveError) {
                console.error(`[StrategicReport] Error saving for ${tenantName}:`, saveError);
                return null;
            }

            console.log(`[StrategicReport] Generated report ${saved?.id} for ${tenantName}`);
            return { id: saved?.id, ...report, bcg: bcgData };
        } catch (parseError) {
            console.error(`[StrategicReport] Error parsing Gemini response for ${tenantName}:`, parseError);
            return null;
        }
    }

    /**
     * Gets the latest strategic report for a tenant.
     */
    static async getLatest(tenantId: string) {
        const { data, error } = await supabaseAdmin
            .from("strategic_reports")
            .select("*")
            .eq("tenant_id", tenantId)
            .order("created_at", { ascending: false })
            .limit(1)
            .single();

        if (error && error.code !== "PGRST116") throw error; // PGRST116 = no rows
        return data;
    }

    /**
     * Gets report history for a tenant.
     */
    static async getHistory(tenantId: string, limit = 10) {
        const { data, error } = await supabaseAdmin
            .from("strategic_reports")
            .select("id, period_start, period_end, created_at, report_data->executive_summary")
            .eq("tenant_id", tenantId)
            .order("created_at", { ascending: false })
            .limit(limit);

        if (error) throw error;
        return data || [];
    }

    /**
     * Sends the weekly strategic report email to tenant users.
     */
    static async sendReportEmail(tenantId: string) {
        const report = await this.getLatest(tenantId);
        if (!report) return;

        const { data: profiles } = await supabaseAdmin
            .from("profiles")
            .select("email, full_name")
            .eq("tenant_id", tenantId);

        if (!profiles || profiles.length === 0) return;

        const { sendWeeklyStrategicReport } = await import("./email");
        const partnerId = await getTenantPartnerId(tenantId);
        const partner = await getPartnerById(partnerId);
        const frontendBaseUrl = await resolveFrontendBaseUrl({ tenantId, partnerId });

        for (const profile of profiles) {
            if (profile.email) {
                await sendWeeklyStrategicReport({
                    to: profile.email,
                    fullName: profile.full_name,
                    report,
                    strategicUrl: `${frontendBaseUrl}/estrategia`,
                    brandName: partner?.name || null,
                });
            }
        }

        console.log(`[StrategicReport] Email sent to ${profiles.length} users for tenant ${tenantId}`);
    }
}
