import { genai, GEMINI_MODEL } from "../../config/gemini";
import { queryFunctions } from "../query-functions";
import { supabaseAdmin } from "../../config/supabase";

// ── Types ──────────────────────────────────────────────
export interface AnomalyAlert {
  type: "danger" | "warning" | "success" | "info";
  metric?: string;
  message: string;
  data_support?: {
    z_score?: number;
    actual?: number;
    expected?: number;
    [key: string]: unknown;
  };
  estimated_impact?: {
    amount: number;
    direction: "loss" | "gain";
    description: string;
  };
  drill_down_suggestions?: string[];
}

export interface AnomalyExplanation {
  anomaly_summary: string;
  probable_causes: Array<{
    cause: string;
    confidence: "alta" | "media" | "baixa";
    evidence: string;
  }>;
  estimated_impact: {
    amount: number;
    direction: "loss" | "gain";
    description: string;
    projection?: string;
  };
  corrective_actions: Array<{
    action: string;
    priority: "urgente" | "alta" | "media" | "baixa";
    expected_effect: string;
  }>;
  drill_down_suggestions: string[];
  context_used: string[];
}

// ── Brazilian Holidays (static, major dates) ──────────
const BRAZILIAN_HOLIDAYS: Record<string, string> = {
  "01-01": "Ano Novo",
  "02-12": "Carnaval (aprox.)",
  "02-13": "Carnaval (aprox.)",
  "03-04": "Carnaval (aprox.)",
  "03-05": "Carnaval (aprox.)",
  "04-07": "Sexta-feira Santa (aprox.)",
  "04-21": "Tiradentes",
  "05-01": "Dia do Trabalho",
  "05-12": "Dia das Mães (aprox.)",
  "06-12": "Dia dos Namorados",
  "06-15": "Dia dos Namorados (aprox.)",
  "08-10": "Dia dos Pais (aprox.)",
  "09-07": "Independência",
  "10-12": "N.S. Aparecida / Dia das Crianças",
  "11-02": "Finados",
  "11-15": "Proclamação da República",
  "11-25": "Black Friday (aprox.)",
  "11-26": "Black Friday (aprox.)",
  "11-27": "Black Friday (aprox.)",
  "11-28": "Black Friday (aprox.)",
  "11-29": "Black Friday (aprox.)",
  "12-25": "Natal",
};

function getNearbyHolidays(date: Date, rangeDays = 3): string[] {
  const holidays: string[] = [];
  for (let offset = -rangeDays; offset <= rangeDays; offset++) {
    const d = new Date(date);
    d.setDate(d.getDate() + offset);
    const key = `${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    if (BRAZILIAN_HOLIDAYS[key]) {
      const prefix = offset === 0 ? "Hoje é" : offset < 0 ? `${Math.abs(offset)} dia(s) atrás foi` : `Em ${offset} dia(s) será`;
      holidays.push(`${prefix} ${BRAZILIAN_HOLIDAYS[key]}`);
    }
  }
  return holidays;
}

// ── Retry helper ───────────────────────────────────────
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

// ── Service ────────────────────────────────────────────
export class AnomalyExplainerService {
  /**
   * Given healthCheck alerts + tenant context, uses Gemini to explain anomalies.
   * Returns structured causal analysis with impact, actions, and drill-down.
   */
  static async explain(tenantId: string, alerts?: AnomalyAlert[]): Promise<AnomalyExplanation> {
    console.log(`[AnomalyExplainer] Analyzing anomalies for tenant ${tenantId}`);

    // 1. Get healthCheck data if not provided
    let healthData: any;
    if (!alerts) {
      healthData = await queryFunctions.healthCheck({ _tenant_id: tenantId } as any);
      alerts = (healthData as any).alerts || [];
    } else {
      healthData = await queryFunctions.healthCheck({ _tenant_id: tenantId } as any);
    }

    // Filter only actionable alerts (not "info")
    const actionableAlerts = alerts!.filter(a => a.type !== "info");

    if (actionableAlerts.length === 0) {
      return {
        anomaly_summary: "Nenhuma anomalia significativa detectada no período atual.",
        probable_causes: [],
        estimated_impact: { amount: 0, direction: "loss", description: "Sem impacto — métricas dentro da normalidade." },
        corrective_actions: [],
        drill_down_suggestions: [
          "Quer um relatório executivo completo?",
          "Devo comparar com o mesmo período do ano passado?",
          "Quer ver a evolução mês a mês?"
        ],
        context_used: ["healthCheck"]
      };
    }

    // 2. Gather context data in parallel
    const now = new Date();
    const brtNow = new Date(now.getTime() - 3 * 60 * 60 * 1000);
    const dayOfWeek = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"][brtNow.getDay()];
    const nearbyHolidays = getNearbyHolidays(brtNow);

    const [seasonalityData, syncLogs, recentCampaigns] = await Promise.all([
      queryFunctions.seasonalityAnalysis({ _tenant_id: tenantId } as any).catch(() => null),
      this.getRecentSyncIssues(tenantId),
      this.getRecentCampaigns(tenantId),
    ]);

    // 3. Build context string
    const contextParts: string[] = [];
    contextParts.push(`Data atual: ${brtNow.toISOString().split("T")[0]} (${dayOfWeek})`);

    if (nearbyHolidays.length > 0) {
      contextParts.push(`Feriados próximos: ${nearbyHolidays.join("; ")}`);
    }

    if (seasonalityData) {
      const s = seasonalityData as any;
      if (s.strongest) contextParts.push(`Mês mais forte historicamente: ${s.strongest.name}`);
      if (s.weakest) contextParts.push(`Mês mais fraco historicamente: ${s.weakest.name}`);
    }

    if (syncLogs.length > 0) {
      contextParts.push(`Problemas de sincronização recentes: ${syncLogs.map(l => `${l.marketplace} - ${l.error} (${l.date})`).join("; ")}`);
    }

    if (recentCampaigns.length > 0) {
      contextParts.push(`Campanhas recentes: ${recentCampaigns.join("; ")}`);
    }

    // 4. Build Gemini prompt
    const prompt = `Você é um analista sênior de e-commerce multicanal (Bagy, Mercado Livre, Shopee, Shein, Loja Física).

ALERTAS DETECTADOS (via Z-score e comparação estatística):
${JSON.stringify(actionableAlerts, null, 2)}

CONTEXTO:
${contextParts.join("\n")}

RESUMO DO MÊS (healthCheck):
${JSON.stringify((healthData as any).summary, null, 2)}

TAREFA: Analise os alertas acima e retorne um JSON VÁLIDO no seguinte formato:
{
  "anomaly_summary": "Resumo em 2-3 frases do cenário geral",
  "probable_causes": [
    {
      "cause": "Descrição da causa provável",
      "confidence": "alta|media|baixa",
      "evidence": "Evidência que suporta essa hipótese"
    }
  ],
  "estimated_impact": {
    "amount": 15000,
    "direction": "loss|gain",
    "description": "Descrição do impacto financeiro estimado",
    "projection": "Se continuar assim, o impacto no mês será de R$ X"
  },
  "corrective_actions": [
    {
      "action": "Ação específica e prática",
      "priority": "urgente|alta|media|baixa",
      "expected_effect": "Efeito esperado dessa ação"
    }
  ],
  "drill_down_suggestions": [
    "Pergunta sugerida para o usuário explorar mais"
  ]
}

REGRAS:
1. Causas devem ser ESPECÍFICAS e baseadas nos dados. NÃO invente cenários genéricos.
2. Se o dia é fim de semana ou próximo de feriado, mencione como causa provável.
3. Se houve problema de sincronização, mencione como possível causa.
4. Impacto em R$ deve ser calculado com base nos Z-scores: (valor_esperado - valor_real) para anomalias negativas.
5. Ações devem ser PRÁTICAS e executáveis pelo lojista.
6. Drill-down deve sugerir perguntas que o Optimus pode responder (ex: "Quer ver quais marketplaces foram mais afetados?")
7. Máximo 3 causas, 3 ações, 3 sugestões de drill-down.
8. Valores em R$ brasileiros.
9. RETORNE APENAS O JSON, sem markdown ou texto adicional.`;

    // 5. Call Gemini
    const result = await callGeminiWithRetry(
      () => genai.models.generateContent({
        model: GEMINI_MODEL,
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        config: { maxOutputTokens: 2048 },
      }),
      "AnomalyExplainer"
    );

    const responseText = result.candidates?.[0]?.content?.parts?.[0]?.text || "";
    const cleanJson = responseText.replace(/```json/g, "").replace(/```/g, "").trim();

    try {
      const parsed = JSON.parse(cleanJson) as AnomalyExplanation;
      parsed.context_used = ["healthCheck", "seasonality", "sync_logs", "calendar"];

      // 6. Persist to auto_insights (fire-and-forget)
      this.persistAnomaly(tenantId, actionableAlerts, parsed).catch(err =>
        console.error("[AnomalyExplainer] Persist error:", err)
      );

      return parsed;
    } catch (parseError) {
      console.error("[AnomalyExplainer] JSON parse error:", parseError);
      // Fallback: return structured data from alerts directly
      return this.buildFallbackExplanation(actionableAlerts);
    }
  }

  /**
   * Persists detected anomalies to auto_insights table.
   */
  private static async persistAnomaly(
    tenantId: string,
    alerts: AnomalyAlert[],
    explanation: AnomalyExplanation
  ): Promise<void> {
    const dangerAlerts = alerts.filter(a => a.type === "danger");
    if (dangerAlerts.length === 0) return;

    const priorityMap: Record<string, "critical" | "high" | "medium" | "low"> = {
      danger: "critical",
      warning: "high",
      success: "low",
    };

    const insightRows = dangerAlerts.map(alert => ({
      tenant_id: tenantId,
      category: "vendas" as const,
      priority: priorityMap[alert.type] || "medium",
      title: `🚨 Anomalia: ${alert.metric || "métrica"}`,
      description: `${alert.message}\n\n**Análise:** ${explanation.anomaly_summary}`,
      importance_score: alert.type === "danger" ? 90 : 70,
      recommended_actions: explanation.corrective_actions.map(a => ({
        label: a.action,
        action: a.action.toLowerCase().replace(/\s+/g, "_").substring(0, 50),
      })),
      data_support: {
        alerts: alerts.map(a => ({ type: a.type, metric: a.metric, message: a.message })),
        causes: explanation.probable_causes,
        impact: explanation.estimated_impact,
      },
      status: "new" as const,
    }));

    if (insightRows.length > 0) {
      const { error } = await supabaseAdmin
        .from("auto_insights")
        .insert(insightRows);

      if (error) {
        console.error("[AnomalyExplainer] DB insert error:", error.message);
      } else {
        console.log(`[AnomalyExplainer] Persisted ${insightRows.length} anomaly insights`);
      }
    }
  }

  /**
   * Gets recent sync failures that could explain anomalies.
   */
  private static async getRecentSyncIssues(tenantId: string): Promise<Array<{ marketplace: string; error: string; date: string }>> {
    try {
      const { data, error } = await supabaseAdmin
        .from("sync_logs")
        .select("marketplace, error_message, started_at")
        .eq("tenant_id", tenantId)
        .eq("status", "error")
        .gte("started_at", new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString())
        .order("started_at", { ascending: false })
        .limit(5);

      if (error || !data) return [];
      return data.map(d => ({
        marketplace: d.marketplace,
        error: (d.error_message || "Erro desconhecido").substring(0, 100),
        date: d.started_at?.split("T")[0] || "",
      }));
    } catch {
      return [];
    }
  }

  /**
   * Gets recent campaign recommendations for context.
   */
  private static async getRecentCampaigns(tenantId: string): Promise<string[]> {
    try {
      const { data, error } = await supabaseAdmin
        .from("campaign_recommendations")
        .select("segments, created_at")
        .eq("tenant_id", tenantId)
        .eq("status", "approved")
        .order("created_at", { ascending: false })
        .limit(3);

      if (error || !data || data.length === 0) return [];
      return data.map(d => {
        const segments = Array.isArray(d.segments) ? d.segments : [];
        return `Campanha aprovada em ${d.created_at?.split("T")[0]} (${segments.length} segmentos)`;
      });
    } catch {
      return [];
    }
  }

  /**
   * Builds a structured explanation without Gemini when API fails.
   */
  private static buildFallbackExplanation(alerts: AnomalyAlert[]): AnomalyExplanation {
    const hasDanger = alerts.some(a => a.type === "danger");
    const totalImpact = alerts.reduce((sum, a) => {
      if (a.data_support?.actual !== undefined && a.data_support?.expected !== undefined) {
        return sum + Math.abs(a.data_support.expected - a.data_support.actual);
      }
      return sum;
    }, 0);

    return {
      anomaly_summary: `Detectadas ${alerts.length} anomalia(s) nas métricas do negócio. ${hasDanger ? "Algumas requerem atenção imediata." : "Nenhuma crítica no momento."}`,
      probable_causes: alerts.map(a => ({
        cause: a.message,
        confidence: "media" as const,
        evidence: a.data_support ? `Z-score: ${a.data_support.z_score}, Valor: ${a.data_support.actual}, Esperado: ${a.data_support.expected}` : "Dados estatísticos",
      })).slice(0, 3),
      estimated_impact: {
        amount: Math.round(totalImpact),
        direction: hasDanger ? "loss" : "gain",
        description: `Impacto estimado de R$ ${Math.round(totalImpact).toLocaleString("pt-BR")} baseado nos desvios detectados.`,
      },
      corrective_actions: [
        { action: "Analisar métricas detalhadas por marketplace", priority: "alta" as const, expected_effect: "Identificar canal afetado" },
        { action: "Comparar com período anterior", priority: "media" as const, expected_effect: "Entender se é padrão ou anomalia" },
      ],
      drill_down_suggestions: [
        "Quer ver quais marketplaces foram mais afetados?",
        "Devo comparar com o mesmo dia da semana passada?",
        "Quer análise por canal de venda?",
      ],
      context_used: ["healthCheck (fallback)"],
    };
  }
}
