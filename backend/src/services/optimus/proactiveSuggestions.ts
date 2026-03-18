import { supabaseAdmin } from "../../config/supabase";
import { genai, GEMINI_MODEL } from "../../config/gemini";
import { queryFunctions } from "../query-functions";
import { ProductAnalyzer, ProductSuggestionContext } from "./productAnalyzer";
import { repairTextArtifacts } from "../aiTextUtils";

export type SuggestionType = "immediate" | "opportunity" | "risk";
export type SuggestionPriority = "alta" | "media" | "baixa";
export type SuggestionStatus = "pending" | "accepted" | "dismissed" | "expired";

export interface SuggestionMetadata {
  action_slug: string;
  deep_link: string;
  filters?: Record<string, unknown>;
}

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
  metadata?: SuggestionMetadata | null;
}

interface SuggestionDraft {
  type: SuggestionType;
  title: string;
  context: string;
  impact?: string;
  action: string;
  priority: SuggestionPriority;
}

function buildPromptLink(prompt: string): string {
  return `/agente?prompt=${encodeURIComponent(prompt)}`;
}

function resolveActionMetadata(suggestion: Pick<SuggestionDraft, "title" | "context" | "action">): SuggestionMetadata {
  const text = `${suggestion.title} ${suggestion.context} ${suggestion.action}`.toLowerCase();

  if (text.includes("sem venda") || text.includes("parado") || text.includes("encalhado")) {
    return {
      action_slug: "view_stale_products",
      deep_link: buildPromptLink("Quais produtos estao sem venda ha 90 dias ou mais?"),
      filters: { withoutSalesDays: 90 },
    };
  }

  if (text.includes("excesso de estoque") || text.includes("queima") || text.includes("promoc")) {
    return {
      action_slug: "view_excess_stock",
      deep_link: buildPromptLink("Quais produtos estao com excesso de estoque e precisam de promocao?"),
      filters: { excessStock: true },
    };
  }

  if (text.includes("crescimento") || text.includes("demanda") || text.includes("categoria em alta")) {
    return {
      action_slug: "view_accelerating_products",
      deep_link: buildPromptLink("Quais produtos ou categorias estao acelerando nas vendas?"),
      filters: { trend: "accelerating" },
    };
  }

  if (text.includes("estoque") || text.includes("repos") || text.includes("ruptura") || text.includes("critico")) {
    return {
      action_slug: "view_low_stock",
      deep_link: buildPromptLink("Quais produtos estao em estoque critico ou acabando?"),
      filters: { lowStock: true },
    };
  }

  if (text.includes("relatorio") || text.includes("semana")) {
    return {
      action_slug: "open_strategic_report",
      deep_link: "/estrategia",
    };
  }

  return {
    action_slug: "open_optimus_chat",
    deep_link: buildPromptLink("Quero aprofundar essa sugestao do Optimus e entender a melhor acao."),
  };
}

function toSuggestionDraft(raw: Partial<SuggestionDraft>): SuggestionDraft {
  return {
    type: raw.type || "opportunity",
    title: raw.title || "Oportunidade identificada",
    context: raw.context || "O Optimus encontrou um ponto de atencao no catalogo ou no negocio.",
    impact: raw.impact,
    action: raw.action || "Ver detalhes",
    priority: raw.priority || "media",
  };
}

async function callGeminiSuggestions(contextStr: string): Promise<SuggestionDraft[]> {
  const systemPrompt = `Voce e o Optimus, um AI Manager de E-commerce.
Seu objetivo e gerar de 2 a 4 SUGESTOES PROATIVAS altamente acionaveis com base nos dados fornecidos.

As sugestoes devem ajudar o lojista a:
1. Evitar riscos iminentes.
2. Aproveitar oportunidades em produtos, categorias e canais.
3. Corrigir problemas de estoque e produtos sem giro.

Retorne EXATAMENTE um array JSON valido com este schema:
[
  {
    "type": "immediate" | "opportunity" | "risk",
    "title": "Titulo curto",
    "context": "Contexto objetivo do por que essa sugestao existe",
    "impact": "Impacto estimado em linguagem executiva",
    "action": "Texto curto do botao principal",
    "priority": "alta" | "media" | "baixa"
  }
]
Sem markdown extra.`;

  const response = await genai.models.generateContent({
    model: GEMINI_MODEL,
    contents: [{ role: "user", parts: [{ text: `DADOS DO LOJISTA:\n${contextStr}\n\nGere as sugestoes:` }] }],
    config: {
      systemInstruction: systemPrompt,
      temperature: 0.3,
      responseMimeType: "application/json",
    },
  });

  const rawText = response.candidates?.[0]?.content?.parts?.[0]?.text || "[]";
  const text = repairTextArtifacts(rawText);
  const parsed = JSON.parse(text);
  return Array.isArray(parsed) ? parsed.map((item) => toSuggestionDraft(item)) : [];
}

export class ProactiveSuggestionsService {
  static async generateForAllTenants(): Promise<void> {
    const { data: tenants, error } = await supabaseAdmin
      .from("tenants")
      .select("id");

    if (error || !tenants) {
      console.error("[ProactiveSuggestions] Error fetching tenants:", error);
      return;
    }

    for (const tenant of tenants) {
      await this.generateDailySuggestions(tenant.id).catch((err) => {
        console.error(`[ProactiveSuggestions] Error generating suggestions for ${tenant.id}:`, err);
      });
    }
  }

  static async generateDailySuggestions(tenantId: string): Promise<OptimusSuggestion[]> {
    const { data: existing } = await supabaseAdmin
      .from("optimus_suggestions")
      .select("*")
      .eq("tenant_id", tenantId)
      .eq("status", "pending")
      .gte("created_at", new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
      .limit(6);

    if (existing && existing.length > 0) {
      return existing as OptimusSuggestion[];
    }

    await supabaseAdmin
      .from("optimus_suggestions")
      .update({ status: "expired" })
      .eq("tenant_id", tenantId)
      .eq("status", "pending");

    const [healthData, summaryData, productContext] = await Promise.all([
      queryFunctions.healthCheck({ _tenant_id: tenantId } as any).catch(() => ({})),
      queryFunctions.executiveSummary({ period_days: 30, _tenant_id: tenantId } as any).catch(() => ({})),
      ProductAnalyzer.getSuggestionContext(tenantId).catch(() => this.getEmptyProductContext()),
    ]);

    const contextStr = JSON.stringify({
      healthCheck: healthData,
      summary: summaryData,
      productContext,
    });

    let generated: SuggestionDraft[] = [];
    try {
      generated = await callGeminiSuggestions(contextStr);
    } catch (error) {
      console.error("[ProactiveSuggestions] Gemini error:", error);
    }

    if (generated.length === 0) {
      generated = this.buildFallbackSuggestions(productContext);
    }

    const toInsert = generated
      .slice(0, 4)
      .map((item) => {
        const suggestion = toSuggestionDraft(item);
        return {
          tenant_id: tenantId,
          type: suggestion.type,
          title: suggestion.title,
          context: suggestion.context,
          impact: suggestion.impact,
          action: suggestion.action,
          priority: suggestion.priority,
          status: "pending" as const,
          metadata: resolveActionMetadata(suggestion),
        };
      });

    toInsert.push({
      tenant_id: tenantId,
      type: "opportunity",
      title: "Resumo da Ultima Semana",
      context: "O Optimus preparou um relatorio consolidado com sinais de performance e produtos para voce revisar.",
      impact: "Visao macro com foco em priorizacao",
      action: "Abrir relatorio estrategico",
      priority: "alta",
      status: "pending" as const,
      metadata: {
        action_slug: "open_strategic_report",
        deep_link: "/estrategia",
      },
    });

    const { data: inserted, error } = await supabaseAdmin
      .from("optimus_suggestions")
      .insert(toInsert)
      .select("*");

    if (error) {
      console.error("[ProactiveSuggestions] Insert error:", error);
      return [];
    }

    return (inserted || []) as OptimusSuggestion[];
  }

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

    return (data || []) as OptimusSuggestion[];
  }

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

  static async executeSuggestionAction(suggestionId: string, tenantId: string) {
    const { data, error } = await supabaseAdmin
      .from("optimus_suggestions")
      .select("*")
      .eq("id", suggestionId)
      .eq("tenant_id", tenantId)
      .single();

    if (error || !data) {
      throw new Error("Sugestao nao encontrada");
    }

    const suggestion = data as OptimusSuggestion;
    const metadata = (suggestion.metadata || resolveActionMetadata(suggestion)) as SuggestionMetadata;

    await this.markSuggestionStatus(suggestionId, tenantId, "accepted");

    return {
      status: "success",
      message: suggestion.action,
      action_slug: metadata.action_slug,
      deep_link: metadata.deep_link,
      filters: metadata.filters,
    };
  }

  private static buildFallbackSuggestions(productContext: ProductSuggestionContext): SuggestionDraft[] {
    const suggestions: SuggestionDraft[] = [];

    if (productContext.summary.low_stock > 0) {
      const names = productContext.low_stock.slice(0, 3).map((item) => item.name).join(", ");
      suggestions.push({
        type: "immediate",
        title: `${productContext.summary.low_stock} produtos em risco de ruptura`,
        context: names
          ? `Itens criticos detectados: ${names}. Vale revisar reposicao ou redistribuicao imediatamente.`
          : "O estoque apresenta itens em nivel critico ou abaixo do minimo.",
        impact: "Protege receita e evita ruptura nos proximos dias",
        action: "Revisar estoque critico",
        priority: "alta",
      });
    }

    if (productContext.summary.stale_products > 0) {
      suggestions.push({
        type: "risk",
        title: `${productContext.summary.stale_products} produtos sem giro`,
        context: "Ha produtos sem venda recente. Eles podem estar consumindo capital e espaco sem retorno.",
        impact: "Reduz capital empatado e melhora foco comercial",
        action: "Ver produtos sem venda",
        priority: "media",
      });
    }

    if (productContext.summary.accelerating_products > 0) {
      suggestions.push({
        type: "opportunity",
        title: `${productContext.summary.accelerating_products} produtos acelerando`,
        context: "Alguns produtos estao ganhando tracao. Vale revisar cobertura de estoque e oportunidade de margem.",
        impact: "Captura demanda antes de ruptura ou concorrencia",
        action: "Ver produtos em crescimento",
        priority: "alta",
      });
    }

    if (suggestions.length === 0) {
      suggestions.push({
        type: "opportunity",
        title: "Revisar carteira de produtos",
        context: "O Optimus nao detectou urgencias claras, mas ha espaco para revisar margens, cobertura e giro do catalogo.",
        impact: "Melhora previsibilidade e priorizacao do estoque",
        action: "Abrir analise de produtos",
        priority: "media",
      });
    }

    return suggestions;
  }

  private static getEmptyProductContext(): ProductSuggestionContext {
    return {
      summary: {
        total_products: 0,
        out_of_stock: 0,
        low_stock: 0,
        excess_stock: 0,
        stale_products: 0,
        accelerating_products: 0,
        decelerating_products: 0,
        stock_value_cost: 0,
        stock_value_sale: 0,
        avg_margin_percent: 0,
        min_price: 0,
        avg_price: 0,
        max_price: 0,
        categories: [],
      },
      low_stock: [],
      stale: [],
      accelerating: [],
    };
  }
}
