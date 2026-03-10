import { supabaseAdmin } from "../../config/supabase";
import { genai, GEMINI_MODEL } from "../../config/gemini";
import { queryFunctions } from "../query-functions";

// ── Types ──────────────────────────────────────────────
export type SuggestionType = "immediate" | "opportunity" | "risk";
export type SuggestionPriority = "alta" | "media" | "baixa";
export type SuggestionStatus = "pending" | "accepted" | "dismissed" | "expired";

export interface OptimusSuggestion {
  id: string;
  tenant_id: string;
  type: SuggestionType;
  title: string;
  context: string;
  impact?: string;
  action: string;
  priority: SuggestionPriority;
  status: SuggestionStatus;
  created_at: string;
  expires_at: string;
  metadata?: any;
}

// ── Service ────────────────────────────────────────────
export class ProactiveSuggestionsService {
  /**
   * Generates new proactive suggestions for a tenant on-demand.
   * Only generates if there are no pending suggestions generated recently.
   */
  static async generateDailySuggestions(tenantId: string): Promise<OptimusSuggestion[]> {
    console.log(`[ProactiveSuggestions] Checking existing suggestions for tenant ${tenantId}`);

    // 1. Check if we already generated suggestions recently (e.g. today)
    const { data: existing, error: fetchErr } = await supabaseAdmin
      .from("optimus_suggestions")
      .select("*")
      .eq("tenant_id", tenantId)
      .eq("status", "pending")
      .gte("created_at", new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
      .limit(5);

    if (fetchErr) {
      console.error("[ProactiveSuggestions] Error fetching existing:", fetchErr);
    }

    if (existing && existing.length > 0) {
      console.log(`[ProactiveSuggestions] Found ${existing.length} recent pending suggestions. Returning them.`);
      return existing;
    }

    // 2. We need to generate new ones. Expire old pending ones first.
    await supabaseAdmin
      .from("optimus_suggestions")
      .update({ status: "expired" })
      .eq("tenant_id", tenantId)
      .eq("status", "pending");

    console.log(`[ProactiveSuggestions] Generating new suggestions for tenant ${tenantId}`);

    // 3. Gather Context Data (HealthCheck & Top Trends)
    const [healthData, summaryData] = await Promise.all([
      queryFunctions.healthCheck({ _tenant_id: tenantId } as any).catch(() => ({})),
      queryFunctions.executiveSummary({ period_days: 30, _tenant_id: tenantId } as any).catch(() => ({})),
    ]);

    const contextStr = JSON.stringify({
      healthCheck: healthData,
      summary: summaryData
    });

    // 4. Call Gemini to generate Actionable Suggestions
    const systemPrompt = `Você é o Optimus, um AI Manager de E-commerce.
Seu objetivo é gerar de 2 a 4 SUGESTÕES PROATIVAS altamente acionáveis com base nos dados fornecidos do Lojista.

As sugestões devem ajudar o lojista a:
1. Evitar riscos iminentes (ex: queda alta em aprovação/vendas).
2. Aproveitar oportunidades (ex: canais/produtos crescendo rápido).
3. Tomar ações imediatas para corrigir anomalias.

Retorne EXATAMENTE um array JSON de objetos com este schema:
[
  {
    "type": "immediate" | "opportunity" | "risk",
    "title": "Título Curto (Ex: Revisar Preços Mercado Livre)",
    "context": "Contexto do por que (Ex: Suas vendas caíram 15% na última semana enquanto cancelamentos subiram.)",
    "impact": "Impacto estimado (Ex: Recuperação de R$ 5k/mês)",
    "action": "Ação sugerida curta (Texto para o botão principal, ex: Analisar Canal)",
    "priority": "alta" | "media" | "baixa"
  }
]
Apenas retorne o JSON válido, sem \`\`\`json ou markdown extra.`;

    let generated: any[] = [];
    try {
      const response = await genai.models.generateContent({
        model: GEMINI_MODEL,
        contents: [{ role: "user", parts: [{ text: `DADOS DO LOJISTA:\n${contextStr}\n\nGere as sugestões:` }] }],
        config: {
          systemInstruction: systemPrompt,
          temperature: 0.3,
          responseMimeType: "application/json"
        }
      });

      const text = response.candidates?.[0]?.content?.parts?.[0]?.text || "[]";
      generated = JSON.parse(text);
      if (!Array.isArray(generated)) generated = [];
    } catch (e) {
      console.error("[ProactiveSuggestions] Error calling Gemini:", e);
      return [];
    }

    if (generated.length === 0) return [];

    // 5. Save to Supabase
    let toInsert = generated.slice(0, 4).map(g => ({
      tenant_id: tenantId,
      type: g.type || "opportunity",
      title: g.title || "Oportunidade de Venda",
      context: g.context || "Nova sugestão gerada pela análise.",
      impact: g.impact,
      action: g.action || "Ver Detalhes",
      priority: g.priority || "media",
      status: "pending" as const
    }));

    // Força a inserção da sugestão de Relatório Semanal
    toInsert.push({
      tenant_id: tenantId,
      type: "opportunity",
      title: "Resumo da Última Semana",
      context: "O Optimus preparou um relatório consolidado de performance e insights da última semana.",
      impact: "Visão Macro",
      action: "Gerar Relatório da Semana",
      priority: "alta",
      status: "pending" as const
    });

    const { data: inserted, error: insertErr } = await supabaseAdmin
      .from("optimus_suggestions")
      .insert(toInsert)
      .select("*");

    if (insertErr) {
      console.error("[ProactiveSuggestions] Error inserting to DB:", insertErr);
      return [];
    }

    return inserted || [];
  }

  /**
   * Fetch unexpired, pending suggestions for the UI
   */
  static async getSuggestions(tenantId: string): Promise<OptimusSuggestion[]> {
    const { data, error } = await supabaseAdmin
      .from("optimus_suggestions")
      .select("*")
      .eq("tenant_id", tenantId)
      .eq("status", "pending")
      .order("created_at", { ascending: false });

    if (error) {
       console.error("[ProactiveSuggestions] getSuggestions error:", error);
       return [];
    }
    return data || [];
  }

  /**
   * Mark a suggestion as accepted, dismissed, etc.
   */
  static async markSuggestionStatus(suggestionId: string, tenantId: string, status: SuggestionStatus): Promise<boolean> {
    const { error } = await supabaseAdmin
      .from("optimus_suggestions")
      .update({ status })
      .eq("id", suggestionId)
      .eq("tenant_id", tenantId);

    if (error) {
       console.error("[ProactiveSuggestions] markSuggestionStatus error:", error);
       return false;
    }
    return true;
  }
}
