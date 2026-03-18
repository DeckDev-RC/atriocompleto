import { genai, GEMINI_MODEL } from "../config/gemini";
import { supabase, supabaseAdmin } from "../config/supabase";
import { redis } from "../config/redis";
import { queryFunctions, QueryParams, getDistinctValues } from "./query-functions";
import { sanitizeSQL } from "../utils/sql-sanitizer";
import { ChatMessage } from "../types";
import type { Content, FunctionDeclaration, Type } from "@google/genai";
import { DataContextService } from "./dataContext.service";
import { AnomalyExplainerService } from "./optimus/anomalyExplainer";
import { ForecasterService } from "./optimus/forecaster";
import { ProductAnalyzer } from "./optimus/productAnalyzer";
import { buildGenericAnalysisDocument } from "./reportDocumentBuilder.service";
import { ReportExporterService } from "./reportExporter.service";
import {
  buildChatExportTitle,
  parseRequestedExportFormat,
  repairTextArtifacts,
  sanitizeModelExportText,
} from "./aiTextUtils";

// ── Cached metadata (Redis-backed) ──────────────────────
const METADATA_CACHE_KEY = "agent:metadata";
const METADATA_TTL_S = 300; // 5 minutes

async function getMetadata(tenantId?: string): Promise<{ statuses: string[]; marketplaces: string[] }> {
  try {
    const cached = await redis.get(METADATA_CACHE_KEY);
    if (cached) return JSON.parse(cached);
  } catch (err) {
    console.error("[Agent] Redis metadata read error:", err);
  }

  try {
    const metadata = await getDistinctValues(tenantId);
    console.log("[Agent] Metadata:", JSON.stringify(metadata));
    try {
      await redis.set(METADATA_CACHE_KEY, JSON.stringify(metadata), "EX", METADATA_TTL_S);
    } catch (err) {
      console.error("[Agent] Redis metadata write error:", err);
    }
    return metadata;
  } catch (err) {
    console.error("[Agent] Metadata error:", err);
    return { statuses: [], marketplaces: [] };
  }
}
getMetadata().catch(() => { });

// ── Function Declarations ───────────────────────────────
const DATE_PARAMS = {
  start_date: { type: "string" as Type, description: "Data inicio YYYY-MM-DD" },
  end_date: { type: "string" as Type, description: "Data fim YYYY-MM-DD" },
  period_days: { type: "number" as Type, description: "Dias para tras (30, 90, 365)" },
  all_time: { type: "boolean" as Type, description: "true = todos os registros sem filtro de data" },
};

const functionDeclarations: FunctionDeclaration[] = [
  {
    name: "countOrders",
    description: "Conta pedidos com filtros opcionais. Retorna breakdown por status (by_status) quando nao filtrado.",
    parameters: {
      type: "object" as Type, properties: {
        status: { type: "string" as Type, description: "Filtrar por status" },
        marketplace: { type: "string" as Type, description: "Filtrar por marketplace" },
        ...DATE_PARAMS,
      }
    },
  },
  {
    name: "totalSales",
    description: "Calcula faturamento total. IMPORTANTE: para faturamento real, use status='paid'. SE FILTRAR POR STATUS, NAO INVENTE DADOS DE OUTROS STATUS.",
    parameters: {
      type: "object" as Type, properties: {
        status: { type: "string" as Type, description: "Filtrar por status" },
        marketplace: { type: "string" as Type, description: "Filtrar por marketplace" },
        ...DATE_PARAMS,
      }
    },
  },
  {
    name: "avgTicket",
    description: "Calcula ticket medio com estatisticas (media, mediana, min, max, desvio padrao).",
    parameters: {
      type: "object" as Type, properties: {
        status: { type: "string" as Type, description: "Filtrar por status" },
        marketplace: { type: "string" as Type, description: "Filtrar por marketplace" },
        ...DATE_PARAMS,
      }
    },
  },
  {
    name: "ordersByStatus",
    description: "Distribuicao de pedidos por status com percentuais.",
    parameters: {
      type: "object" as Type, properties: {
        marketplace: { type: "string" as Type, description: "Filtrar por marketplace" },
        ...DATE_PARAMS,
      }
    },
  },
  {
    name: "ordersByMarketplace",
    description: "Vendas agrupadas por marketplace com valor, quantidade e BREAKDOWN POR STATUS (by_status). IMPORTANTE: para faturamento por canal, use status='paid'. SE FILTRAR, NAO INVENTE DADOS DE OUTROS STATUS.",
    parameters: {
      type: "object" as Type, properties: {
        status: { type: "string" as Type, description: "Filtrar por status" },
        ...DATE_PARAMS,
      }
    },
  },
  {
    name: "salesByMonth",
    description: "Evolucao MENSAL de vendas com faturamento, quantidade, ticket medio, variacao percentual e BREAKDOWN POR STATUS (by_status). IMPORTANTE: para faturamento, use status='paid'. SE FILTRAR, NAO INVENTE DADOS DE OUTROS STATUS. Use para: 'mes a mes', 'por mes', 'evolucao', 'historico', 'faturamento de cada mes', 'tendencia', 'sazonalidade'.",
    parameters: {
      type: "object" as Type, properties: {
        status: { type: "string" as Type, description: "Filtrar por status" },
        marketplace: { type: "string" as Type, description: "Filtrar por marketplace" },
        ...DATE_PARAMS,
      }
    },
  },
  {
    name: "salesByDayOfWeek",
    description: "Performance por DIA DA SEMANA (segunda a domingo). Use para: 'melhor dia da semana', 'quando vendemos mais', 'dia mais forte', 'padrao semanal'.",
    parameters: {
      type: "object" as Type, properties: {
        status: { type: "string" as Type, description: "Filtrar por status" },
        marketplace: { type: "string" as Type, description: "Filtrar por marketplace" },
        ...DATE_PARAMS,
      }
    },
  },
  {
    name: "topDays",
    description: "Ranking dos MELHORES ou PIORES dias de venda por faturamento e volume. Use para: 'melhor dia', 'pior dia', 'recordes', 'dias de pico', 'top 10 dias'.",
    parameters: {
      type: "object" as Type, properties: {
        status: { type: "string" as Type, description: "Filtrar por status" },
        marketplace: { type: "string" as Type, description: "Filtrar por marketplace" },
        limit: { type: "number" as Type, description: "Quantidade de dias no ranking (padrao 10)" },
        order: { type: "string" as Type, description: "'best' para melhores, 'worst' para piores" },
        ...DATE_PARAMS,
      }
    },
  },
  {
    name: "cancellationRate",
    description: "Taxa de cancelamento geral e por marketplace. Mostra pedidos cancelados vs pagos, valor perdido. Use para: 'cancelamentos', 'taxa de cancelamento', 'quanto perdemos', 'pedidos cancelados'.",
    parameters: {
      type: "object" as Type, properties: {
        marketplace: { type: "string" as Type, description: "Filtrar por marketplace" },
        ...DATE_PARAMS,
      }
    },
  },
  {
    name: "compareMarketplaces",
    description: "Comparacao DETALHADA entre todos os marketplaces: faturamento, participacao, ticket medio, taxa de cancelamento e conversao. Use para: 'comparar canais', 'qual marketplace melhor', 'analise de canais', 'mix de canais'.",
    parameters: { type: "object" as Type, properties: { ...DATE_PARAMS } },
  },
  {
    name: "comparePeriods",
    description: "Compara dois periodos consecutivos (ex: este mes vs mes passado). Mostra variacao percentual de pedidos, faturamento e ticket medio. Use para: 'comparar meses', 'crescimento', 'este mes vs mes passado', 'evolucao', 'quanto crescemos'.",
    parameters: {
      type: "object" as Type, properties: {
        status: { type: "string" as Type, description: "Filtrar por status" },
        marketplace: { type: "string" as Type, description: "Filtrar por marketplace" },
        ...DATE_PARAMS,
      }
    },
  },
  {
    name: "salesByHour",
    description: "Distribuicao de vendas por HORA DO DIA (0h-23h). Mostra horarios de pico e vale. Use para: 'horario de pico', 'que horas vendemos mais', 'distribuicao por hora', 'quando os clientes compram'.",
    parameters: {
      type: "object" as Type, properties: {
        status: { type: "string" as Type, description: "Filtrar por status" },
        marketplace: { type: "string" as Type, description: "Filtrar por marketplace" },
        ...DATE_PARAMS,
      }
    },
  },
  {
    name: "executeSQLQuery",
    description: "SQL customizado na tabela orders. ULTIMO RECURSO.",
    parameters: {
      type: "object" as Type, properties: {
        sql: { type: "string" as Type, description: "Query SELECT" },
      }, required: ["sql"]
    },
  },
  {
    name: "salesForecast",
    description: "PREVISAO de faturamento para proximo mes baseada em media movel e tendencia linear. IMPORTANTE: para previsao de faturamento, use status='paid'. Use para: 'previsao', 'quanto vamos vender', 'projecao', 'forecast', 'estimativa', 'meta', 'tendencia de vendas'.",
    parameters: {
      type: "object" as Type, properties: {
        status: { type: "string" as Type, description: "Filtrar por status" },
        marketplace: { type: "string" as Type, description: "Filtrar por marketplace" },
      }
    },
  },
  {
    name: "executiveSummary",
    description: "RESUMO EXECUTIVO completo do negocio com todos os KPIs: faturamento, ticket medio, taxa de cancelamento, mix de canais, melhor/pior mes, tendencia. Use para: 'resumo', 'diagnostico', 'visao geral', 'como esta meu negocio', 'dashboard', 'relatorio', 'KPIs'.",
    parameters: { type: "object" as Type, properties: { ...DATE_PARAMS } },
  },
  {
    name: "marketplaceGrowth",
    description: "Evolucao MENSAL de cada marketplace separadamente. IMPORTANTE: para faturamento por canal, use status='paid'. Use para: 'crescimento por canal', 'qual marketplace cresce', 'evolucao do Bagy', 'historico por canal', 'faturamento por canal e mes'.",
    parameters: {
      type: "object" as Type, properties: {
        status: { type: "string" as Type, description: "Filtrar por status" },
      }
    },
  },
  {
    name: "cancellationByMonth",
    description: "Taxa de cancelamento MES A MES com valor perdido, pedidos pagos vs cancelados. Use para: 'cancelamentos por mes', 'evolucao de cancelamentos', 'quanto perdi por mes', 'mes com mais cancelamento'.",
    parameters: {
      type: "object" as Type, properties: {
        marketplace: { type: "string" as Type, description: "Filtrar por marketplace" },
      }
    },
  },
  {
    name: "yearOverYear",
    description: "Comparacao ANO A ANO (YoY). Compara mesmos meses entre anos diferentes e totais anuais. Quando start_date/end_date sao fornecidos, compara APENAS os meses dentro do periodo, permitindo comparar ex: Jan-Fev 2026 vs Jan-Fev 2025. Use para: 'comparar com ano passado', 'janeiro 2025 vs janeiro 2026', 'ano a ano', 'YoY', 'crescimento anual', 'analise completa de janeiro e fevereiro de 2026 em comparacao ao de 2025'.",
    parameters: {
      type: "object" as Type, properties: {
        status: { type: "string" as Type, description: "Filtrar por status" },
        marketplace: { type: "string" as Type, description: "Filtrar por marketplace" },
        ...DATE_PARAMS,
      }
    },
  },
  {
    name: "seasonalityAnalysis",
    description: "Analise de SAZONALIDADE e padroes. Identifica meses fortes/fracos, indice sazonal e padrao semanal. Use para: 'sazonalidade', 'padroes', 'quais meses sao melhores', 'quando vende mais', 'ciclos de venda', 'padrao do negocio'.",
    parameters: {
      type: "object" as Type, properties: {
        status: { type: "string" as Type, description: "Filtrar por status" },
        marketplace: { type: "string" as Type, description: "Filtrar por marketplace" },
      }
    },
  },
  {
    name: "healthCheck",
    description: "DIAGNOSTICO RAPIDO com alertas inteligentes. Detecta automaticamente: faturamento abaixo/acima da media, cancelamentos anomalos, tendencia de ticket medio, comparacao YoY, performance semanal. Use para: 'como estao as coisas', 'algum alerta', 'saude do negocio', 'tem algo errado', 'diagnostico rapido', 'como estamos', 'novidades'.",
    parameters: { type: "object" as Type, properties: {} },
  },
  {
    name: "suggestAction",
    description: "Sugere uma ação concreta no sistema baseada no insight. Use quando o usuário precisar tomar uma decisão ou executar uma tarefa.",
    parameters: {
      type: "object" as Type,
      properties: {
        action: {
          type: "string" as Type,
          description: "Tipo de ação: CREATE_PROMOTION, SEND_CUSTOMER_EMAIL, ADJUST_STOCK_ALERT, REVIEW_MARKETPLACE_SETTING"
        },
        payload: {
          type: "object" as Type,
          description: "Dados relevantes para a ação (ex: { product_id: '123', promo_type: 'discount' })"
        },
        reason: {
          type: "string" as Type,
          description: "Breve explicação do porquê sugeriu isso"
        },
      },
      required: ["action", "reason"]
    },
  },
  // ── Customer Analyzer Functions ──────────────────────────
  {
    name: "customerCount",
    description: "Conta compradores DISTINTOS por marketplace. IMPORTANTE: clientes sao identificados por marketplace (nome no Bagy, buyer_id no ML, username na Shopee). Mesmo cliente em canais diferentes conta separado. Shein nao tem identificador de comprador. Use para: 'quantos clientes tenho', 'base de clientes', 'total de compradores'.",
    parameters: {
      type: "object" as Type, properties: {
        marketplace: { type: "string" as Type, description: "Filtrar por marketplace" },
        ...DATE_PARAMS,
      }
    },
  },
  {
    name: "customerSearch",
    description: "Busca cliente por nome, nickname ou username. Retorna resumo de compras, status (Ativo/Em Risco/Dormindo/Perdido), ticket medio. Use para: 'informacoes sobre cliente X', 'buscar cliente', 'dados do cliente'.",
    parameters: {
      type: "object" as Type, properties: {
        search_name: { type: "string" as Type, description: "Nome, nickname ou username do cliente para buscar" },
        ...DATE_PARAMS,
      }, required: ["search_name"]
    },
  },
  {
    name: "customer360",
    description: "Perfil COMPLETO do cliente (Customer 360). Retorna: total gasto, ticket medio, primeira/ultima compra, status, ciclo de vida, timeline mensal, acoes sugeridas. Use para: 'perfil do cliente X', 'customer 360', 'detalhes do cliente', 'tudo sobre o cliente'.",
    parameters: {
      type: "object" as Type, properties: {
        search_name: { type: "string" as Type, description: "Nome do cliente para perfil 360" },
      }, required: ["search_name"]
    },
  },
  {
    name: "topBuyers",
    description: "Ranking dos TOP compradores por valor gasto ou frequencia de compra. Inclui status de atividade. Use para: 'clientes que mais compraram', 'melhores clientes', 'top compradores', 'clientes VIP', 'clientes Champions'.",
    parameters: {
      type: "object" as Type, properties: {
        sort_by: { type: "string" as Type, description: "'revenue' para ordenar por valor gasto (padrao), 'frequency' para ordenar por quantidade de compras" },
        limit: { type: "number" as Type, description: "Quantidade de clientes no ranking (padrao 15)" },
        marketplace: { type: "string" as Type, description: "Filtrar por marketplace" },
        ...DATE_PARAMS,
      }
    },
  },
  {
    name: "inactiveCustomers",
    description: "Lista compradores INATIVOS (sem compra ha X dias). Mostra apenas clientes recorrentes (2+ compras) que pararam de comprar. Use para: 'clientes inativos', 'clientes que sumiram', 'quem parou de comprar', 'clientes em risco de churn'.",
    parameters: {
      type: "object" as Type, properties: {
        inactive_days: { type: "number" as Type, description: "Dias sem compra para considerar inativo (padrao 60)" },
        limit: { type: "number" as Type, description: "Quantidade de clientes (padrao 20)" },
      }
    },
  },
  {
    name: "newCustomers",
    description: "Conta compradores NOVOS (primeira compra no periodo). Mostra quantos clientes novos por marketplace e receita gerada. Use para: 'clientes novos este mes', 'novos compradores', 'aquisicao de clientes'.",
    parameters: {
      type: "object" as Type, properties: {
        ...DATE_PARAMS,
      }
    },
  },
  {
    name: "customerPurchasePatterns",
    description: "Analise de COMPORTAMENTO de compra dos clientes. Inclui: frequencia media, taxa de recompra, intervalo medio entre compras, distribuicao por canal, ciclo de vida (Novo/Em Desenvolvimento/Fiel/Em Risco/Dormindo/Perdido). Use para: 'frequencia de compra', 'taxa de recompra', 'tempo entre compras', 'comportamento dos clientes', 'ciclo de vida', 'padrao de compra'.",
    parameters: {
      type: "object" as Type, properties: {
        marketplace: { type: "string" as Type, description: "Filtrar por marketplace" },
        ...DATE_PARAMS,
      }
    },
  },
  {
    name: "customerCompare",
    description: "Compara dois clientes lado a lado. Mostra tabela comparativa com pedidos, gasto total, ticket medio, ultima compra, e determina o 'vencedor' em cada metrica. Use para: 'comparar cliente A vs B', 'cliente X vs cliente Y', 'diferenca entre clientes'.",
    parameters: {
      type: "object" as Type, properties: {
        buyer_a: { type: "string" as Type, description: "Nome do primeiro cliente" },
        buyer_b: { type: "string" as Type, description: "Nome do segundo cliente" },
      }, required: ["buyer_a", "buyer_b"]
    },
  },
  {
    name: "customerTicketBySegment",
    description: "Ticket medio e receita POR SEGMENTO de ciclo de vida (Novo, Em Desenvolvimento, Fiel, VIP). Mostra quanto cada segmento gasta em media e sua participacao na receita total. Use para: 'ticket medio por segmento', 'quanto VIPs gastam vs novos', 'valor medio por tipo de cliente', 'receita por segmento'.",
    parameters: {
      type: "object" as Type, properties: {
        marketplace: { type: "string" as Type, description: "Filtrar por marketplace" },
        ...DATE_PARAMS,
      }
    },
  },
  {
    name: "customerSegmentComparison",
    description: "Compara VIPs (>10 compras) vs clientes normais. Mostra diferenca em ticket, gasto total, frequencia e intervalo entre compras. Inclui multiplicadores (ex: VIPs gastam 5x mais). Use para: 'VIPs vs normais', 'diferenca entre VIP e cliente comum', 'quanto mais VIPs gastam', 'comparar segmentos'.",
    parameters: {
      type: "object" as Type, properties: {
        marketplace: { type: "string" as Type, description: "Filtrar por marketplace" },
        ...DATE_PARAMS,
      }
    },
  },
  {
    name: "loyaltyCandidates",
    description: "Lista clientes CANDIDATOS a programa de fidelidade. Sao clientes Fieis (4-10 compras) ativos nos ultimos 60 dias — potenciais VIPs. Use para: 'clientes para programa de fidelidade', 'candidatos a fidelizacao', 'quem pode virar VIP', 'potenciais VIPs'.",
    parameters: {
      type: "object" as Type, properties: {
        limit: { type: "number" as Type, description: "Quantidade de candidatos (padrao 20)" },
      }
    },
  },
  // ── Optimus (Inventory & Products) ──────────────────────────
  {
    name: "query_optimus_data",
    // Extended catalog + inventory capabilities.
    description: "Consulta informações sobre produtos, categorias, preços e níveis de estoque no banco de dados. Use esta ferramenta para responder perguntas sobre o inventário, performance de produtos e alertas de estoque.",
    parameters: {
      type: "object" as Type,
      properties: {
        productId: { type: "string" as Type, description: "ID interno do produto quando o contexto ja conhece o item exato." },
        minMargin: { type: "number" as Type, description: "Filtrar por margem minima em percentual." },
        maxMargin: { type: "number" as Type, description: "Filtrar por margem maxima em percentual." },
        outOfStock: { type: "boolean" as Type, description: "Se verdadeiro, retorna apenas produtos sem estoque." },
        excessStock: { type: "boolean" as Type, description: "Se verdadeiro, retorna apenas produtos com excesso de estoque." },
        stockBelow: { type: "number" as Type, description: "Filtrar produtos com estoque abaixo deste valor." },
        stockAbove: { type: "number" as Type, description: "Filtrar produtos com estoque acima deste valor." },
        withoutSalesDays: { type: "number" as Type, description: "Retorna produtos sem venda ha X dias ou mais." },
        trend: { type: "string" as Type, description: "Filtrar por tendencia de demanda: accelerating, stable, decelerating." },
        includeSummary: { type: "boolean" as Type, description: "Se verdadeiro, inclui resumo agregado e recomendacoes." },
        includeSimilar: { type: "boolean" as Type, description: "Se verdadeiro, sugere produtos similares quando nao houver match exato." },
        sortBy: { type: "string" as Type, description: "Campo de ordenacao: name, sale_price, stock_level, margin_percent, last_sale_at, days_since_last_sale, units_sold_30d, revenue_90d, stock_coverage_days." },
        sortOrder: { type: "string" as Type, description: "Direcao da ordenacao: asc ou desc." },
        nameSearch: { type: "string" as Type, description: "Nome ou parte do nome do produto para busca (fuzzy search)." },
        category: { type: "string" as Type, description: "Filtrar por uma categoria específica (ex: 'Eletrônicos', 'Moda')." },
        sku: { type: "string" as Type, description: "Código SKU exato do produto." },
        minPrice: { type: "number" as Type, description: "Filtrar produtos com preço de venda maior ou igual a este valor." },
        maxPrice: { type: "number" as Type, description: "Filtrar produtos com preço de venda menor ou igual a este valor." },
        lowStock: { type: "boolean" as Type, description: "Se verdadeiro, retorna apenas produtos com estoque crítico ou abaixo do mínimo." },
        includeHealth: { type: "boolean" as Type, description: "Se verdadeiro, inclui um resumo geral da saúde do estoque (contagem de itens OK, WARNING e CRITICAL)." },
        limit: { type: "number" as Type, description: "Número máximo de resultados (padrão 10)." }
      }
    },
  },
  // ── Anomaly Explainer ─────────────────────────────────────────
  {
    name: "explainAnomaly",
    description: "ANALISE CAUSAL de anomalias detectadas. Usa IA para explicar POR QUE metricas variaram, estimar impacto financeiro em R$, sugerir acoes corretivas e perguntas de drill-down. Use para: 'por que vendas cairam', 'explique essa anomalia', 'o que causou essa queda', 'por que faturamento subiu', 'analise essa variacao', 'investigue esse alerta', 'causas possiveis'.",
    parameters: { type: "object" as Type, properties: {} },
  },
  // ── Forecaster ────────────────────────────────────────────────
  {
    name: "enhancedForecast",
    description: "PREVISAO AVANCADA de faturamento com INTERVALO DE CONFIANCA (min/max), projecao do mes atual, tendencia, variancia e comparacao com ultima previsao. IMPORTANTE: para previsao de faturamento, use status='paid'. Use para: 'quanto vou faturar', 'previsao de vendas', 'projecao', 'forecast', 'estimativa de faturamento', 'quanto vamos vender', 'previsao com confianca'.",
    parameters: {
      type: "object" as Type, properties: {
        status: { type: "string" as Type, description: "Filtrar por status" },
        marketplace: { type: "string" as Type, description: "Filtrar por marketplace" },
      }
    },
  },
  {
    name: "goalProbability",
    description: "Calcula PROBABILIDADE de bater uma meta de faturamento. Mostra: ritmo atual vs necessario, gap diario, chance percentual, e recomendacao. Tambem calcula metas dinamicas (quanto precisa vender por dia). Use para: 'vou bater a meta', 'chance de atingir', 'probabilidade', 'meta do mes', 'quanto preciso vender por dia', 'ritmo de vendas', 'falta quanto para meta', 'meta de X reais'.",
    parameters: {
      type: "object" as Type, properties: {
        goal_amount: { type: "number" as Type, description: "Valor da meta em R$ (ex: 200000)" },
        status: { type: "string" as Type, description: "Filtrar por status (padrao: paid)" },
        marketplace: { type: "string" as Type, description: "Filtrar por marketplace" },
      }, required: ["goal_amount"]
    },
  },
  {
    name: "productDemandRate",
    description: "Velocidade de VENDA por produto (unidades/dia). Mostra demanda dos ultimos 30 dias e 7 dias, tendencia (acelerando/estavel/desacelerando) e projecao de unidades. NAO inclui estoque (dados indisponiveis). Use para: 'velocidade de venda', 'demanda de produto', 'quanto vende por dia', 'produtos mais vendidos', 'ritmo de saida', 'quando produto vai acabar'.",
    parameters: {
      type: "object" as Type, properties: {
        product_name: { type: "string" as Type, description: "Nome do produto para filtrar (busca parcial)" },
        limit: { type: "number" as Type, description: "Quantidade de produtos (padrao 20)" },
      }
    },
  },
  {
    name: "forecastComparison",
    description: "COMPARACAO FUTURA: projecao do proximo periodo vs atual e vs anterior. Mostra variacao percentual e resumo de tendencia. Use para: 'proximo mes vs este mes', 'comparar futuro', 'expectativa', 'projecao comparativa', 'quanto mais ou menos'.",
    parameters: {
      type: "object" as Type, properties: {
        status: { type: "string" as Type, description: "Filtrar por status" },
        marketplace: { type: "string" as Type, description: "Filtrar por marketplace" },
      }
    },
  },
  {
    name: "runWhatIfScenario",
    description: "SIMULACAO What-If (E se...?). Simula impacto de mudancas em preco, trafego e conversao sobre faturamento. Retorna cenario pessimista, realista e otimista com impacto em R$. Use para: 'e se fizer promocao', 'se aumentar preco', 'se dobrar marketing', 'impacto de desconto', 'simulacao', 'what if', 'cenario hipotetico'.",
    parameters: {
      type: "object" as Type, properties: {
        price_change_pct: { type: "number" as Type, description: "Variacao % no preco (ex: -20 para 20% desconto, +10 para aumento de 10%)" },
        traffic_change_pct: { type: "number" as Type, description: "Variacao % no trafego/sessoes (ex: +50 para +50% visitantes)" },
        conversion_change_pct: { type: "number" as Type, description: "Variacao % na taxa de conversao (ex: +20 para +20% mais conversao)" },
      }
    },
  },
];

// ── System Prompt ───────────────────────────────────────
async function buildSystemPrompt(tenantId?: string): Promise<string> {
  const meta = await getMetadata(tenantId);
  const sList = meta.statuses.map((s) => '"' + s + '"').join(", ") || "N/A";
  const mList = meta.marketplaces.map((m) => '"' + m + '"').join(", ") || "N/A";

  return `Voce e o Ambro, analista de dados da empresa Ambro - e-commerce multicanal (Bagy, Mercado Livre, Shopee, Shein, Loja Fisica).

## ⚠️ REGRA DE OURO — FATURAMENTO = SOMENTE PAGOS
FATURAMENTO, VENDAS, RECEITA, REVENUE = **SOMENTE pedidos com status "paid"**.
- Quando o usuario perguntar sobre "faturamento", "vendas", "receita", "quanto vendemos", "quanto faturamos", "revenue":
  → SEMPRE passe status="paid" na chamada da funcao
- Pedidos cancelados, pendentes, enviados NAO sao faturamento
- O unico status que conta como receita efetiva e "paid"
- NUNCA some todos os status para calcular faturamento — isso inflaria o numero com cancelados e pendentes
- Exemplos:
  "qual o faturamento de 2025?" → salesByMonth({status: "paid", start_date: "2025-01-01", end_date: "2025-12-31"})
  "faturamento por marketplace" → ordersByMarketplace({status: "paid"})
  "evolucao de vendas" → salesByMonth({status: "paid"})
  "quanto faturou cada canal?" → marketplaceGrowth({status: "paid"})
- AVISO CRITICO: Se voce filtrar por status="paid", a resposta contera APENAS dados de pedidos pagos.
- NAO INVENTE dados de "cancelados" ou "pendentes" se voce nao os consultou.

## ⛔ REGRA ABSOLUTA — NUNCA INVENTE NUMEROS
VOCE E PROIBIDO DE INVENTAR, ESTIMAR, APROXIMAR OU FABRICAR QUALQUER NUMERO SE NÃO TIVER CONTEXTO OU DADOS DISPONÍVEIS PERGUNTE AO USUARIO O QUE ELE DESEJA SABER.
- Se a resposta da funcao NAO contem "by_status", voce NAO pode criar uma tabela de breakdown por status.
- Se a resposta da funcao NAO contem dados de cancelados, voce NAO pode dizer quantos cancelados existem.
- Se voce receber apenas dados de "paid" (porque filtrou por status), MOSTRE APENAS OS DADOS DE PAID.
- NAO invente numeros redondos (700, 500, 300, 100, 50) para preencher lacunas — isso gera dados FALSOS.
- Se o resultado mostra "[NAO HA BREAKDOWN DE OUTROS STATUS]", respeite LITERALMENTE.
- Quando quiser mostrar breakdown completo: faca OUTRA chamada de funcao (ordersByStatus ou executiveSummary).
- REGRA: cada numero na sua resposta DEVE existir na resposta da funcao. Se nao existe, NAO inclua.

- Se o usuario pedir "vendas" (que exige status="paid") MAS voce achar relevante mostrar tambem os cancelados:
  1. Faca UMA chamada para faturamento (status="paid")
  2. Faca OUTRA chamada para ordersByStatus (sem filtro) OU use executeSQLQuery
  3. OU use executiveSummary que ja traz tudo
- Para mostrar a visao COMPLETA (todos os status), use executiveSummary ou ordersByStatus separadamente
- Quando o usuario pedir "relatorio" ou "resumo", mostre faturamento (paid) como metrica principal e depois o breakdown de todos os status como informacao complementar
- ESTRATEGIA PARA PERGUNTAS DE FATURAMENTO: Se o usuario perguntar "faturamento de janeiro", faca DUAS chamadas:
  1. totalSales({status: "paid", ...}) — para o faturamento real
  2. ordersByStatus({start_date: ..., end_date: ...}) — para o breakdown completo de todos os status
  Isso garante dados reais para AMBOS: faturamento e breakdown.

## 📦 OPTIMUS — ESPECIALISTA EM PRODUTOS E INVENTARIO
Voce e o Optimus, o modulo de inteligencia de estoque e produtos. 
- Quando o usuario perguntar sobre produtos, estoque, precos de venda/custo ou margem:
  → SEMPRE use a ferramenta query_optimus_data
- Se o resultado retornar produtos com stock_status "CRITICAL", alerte o usuario imediatamente.
- FORMATO DE RESPOSTA: SEMPRE use TABELAS MARKDOWN para listar produtos. Inclua SKU, Nome, Preco, Estoque e Status.
- Se o usuario perguntar por um produto especifico (ex: "temos iPhone?"), use nameSearch="iPhone".
- Se o usuario perguntar por produtos acabando, use lowStock=true.
- Se o usuario perguntar por produtos sem estoque, use outOfStock=true.
- Se o usuario perguntar por margem, use minMargin/maxMargin.
- Se o usuario perguntar por produtos sem venda, use withoutSalesDays.
- Se o usuario perguntar por tendencia de demanda, use trend.
- Quando a ferramenta retornar summary ou recommendations, destaque os riscos e a proxima acao sugerida.

## Contexto de Negocio
A Ambro vende em 5 canais com ~39.943 pedidos em 2025. Voce tem acesso a dados de pedidos (marketplace, status, valor, data).

## Banco de Dados
Tabela "orders": marketplace, status, total_amount (R$), order_date
Status: ${sList}
Marketplaces: ${mList}

## Mapeamento PT -> Banco
"pagos/pago" -> "paid" | "cancelados" -> "cancelled" | "enviados" -> "shipped" | "pendentes" -> "pending"
"faturamento/vendas/receita" -> SEMPRE usar status="paid"
"Mercado Livre/ML" -> "ml" | "Bagy/loja propria" -> "bagy" | "Loja Fisica" -> "physical store"

## ⚠️ SEGURANCA — NUNCA EXPONHA VALORES DO BANCO DE DADOS
Nas respostas ao usuario, NUNCA mostre os valores brutos do banco. SEMPRE traduza:
- "paid" → "Pagos" | "cancelled" → "Cancelados" | "shipped" → "Enviados" | "pending" → "Pendentes"
- "partially_refunded" → "Parcialmente reembolsados" | "pending processing" → "Em processamento" | "pending shipment" → "Aguardando envio"
- "ml" → "Mercado Livre" | "bagy" → "Bagy" | "physical store" → "Loja Física" | "shopee" → "Shopee" | "shein" → "Shein"
- NUNCA escreva: status "paid", status "cancelled", canal "ml", canal "bagy", etc.
- NUNCA mostre nomes de tabelas ("orders"), colunas ("total_amount", "order_date", "marketplace"), ou qualquer termo tecnico do banco
- NUNCA use aspas em torno de valores traduzidos. Escreva "Pagos" e nao "\"paid\" (pagos)"
- Se precisar mencionar o filtro usado, diga "somente pedidos pagos" e NAO "status paid" ou "status='paid'"

## REGRA PRINCIPAL — DADOS QUALIFICADOS (OBRIGATORIO EM TODA RESPOSTA)
Voce SEMPRE deve qualificar os dados nas respostas. Isto e OBRIGATORIO:

A) BREAKDOWN POR STATUS — Em TODA resposta que envolva contagem ou faturamento de pedidos **SEM filtro de status especifico**:
   - SEMPRE detalhe TODOS os status: Pagos (qtd + valor), Cancelados (qtd + valor), Enviados (qtd + valor), Pendentes (qtd + valor), etc.
   - Para cada status: quantidade, valor em R$, e percentual do total
   - Os dados ja vem com "by_status" nas funcoes countOrders, totalSales, ordersByMarketplace e salesByMonth — USE SEMPRE estes dados
   - NUNCA retorne apenas totais gerais sem detalhar os status
   - ⛔ EXCECAO CRITICA: Se a funcao foi chamada COM filtro de status (ex: status="paid"), o resultado NAO tera by_status. Neste caso, NAO invente o breakdown. Mostre APENAS os dados retornados. Se quiser mostrar breakdown completo, faca outra chamada sem filtro de status.
   - EXEMPLO CORRETO: "Total: 5.000 pedidos / R$ 750.000
     - Pagos: 3.800 (76%) / R$ 620.000
     - Cancelados: 600 (12%) / R$ 85.000
     - Enviados: 400 (8%) / R$ 35.000
     - Pendentes: 200 (4%) / R$ 10.000"
   - EXEMPLO ERRADO: "Total: 5.000 pedidos / R$ 750.000" (sem detalhar status)

B) BREAKDOWN POR CANAL — Quando mostrar dados por marketplace, SEMPRE inclua para cada canal:
   - Quantidade de pedidos + faturamento em R$ + percentual de participacao + ticket medio
   - E a distribuicao de status DENTRO de cada canal (quantos pagos, cancelados, etc.)

C) Para pedidos amplos ("relatorio", "resumo", "como estao os numeros", "me da os dados"):
   - Use executiveSummary ou combine ordersByStatus + totalSales
   - Inclua TANTO o breakdown por status QUANTO o breakdown por canal

## Regras Gerais
1. Responda em portugues brasileiro
2. Valores em R$ com separadores brasileiros (R$ 1.234,56)
3. SEMPRE use funcoes - NUNCA invente dados. Se a funcao retornou vazio ou parcial, diga que nao tem os dados.
4. Sem periodo especificado = all_time=true (consulta tudo)
5. Inclua percentuais e insights de negocio
6. Formate numeros com pontos: 39.943
7. NUNCA exponha valores do banco (paid, cancelled, ml, bagy, total_amount, orders, etc.) — use SEMPRE os nomes traduzidos em portugues
8. Para multiplos status, use executeSQLQuery ou multiplas chamadas
9. Apos dados, ofereca um insight breve e acionavel
10. Data de hoje: ${(() => { const d = new Date(); d.setHours(d.getHours() - 3); return d.toISOString().split("T")[0]; })()}
11. IMPORTANTE - Perguntas com MULTIPLOS MESES (ex: "faturamento de janeiro, marco e abril"):
    - Use salesByMonth com all_time=true para obter todos os meses
    - Na resposta, destaque apenas os meses pedidos
    - NUNCA use totalSales para este tipo de pergunta
12. IMPORTANTE - Perguntas de EVOLUCAO/TENDENCIA:
    - Use salesByMonth para dados mensais
    - Formate como TABELA MARKDOWN quando houver 3+ meses de dados
    - Inclua variacao percentual entre meses
13. TABELAS MARKDOWN — regras obrigatorias:
    - Use formato markdown com | e alinhamento
    - MAXIMO 5 a 6 colunas por tabela. Tabelas com mais colunas QUEBRAM a renderizacao
    - Para dados de MULTIPLOS MARKETPLACES por mes: use formato VERTICAL (meses nas linhas, UMA tabela por marketplace) ou agrupe em tabelas separadas
    - NUNCA crie tabelas com 10+ colunas (ex: Mes | Canal1 | Var | Canal2 | Var | Canal3 | ...) — isso SEMPRE trunca
    - Alternativa para dados cruzados (mes × canal): use um GRAFICO de linhas multiplas ou varias tabelas menores
    - Quando houver 5 canais × 12 meses, prefira: 1 tabela com colunas (Mes | Pedidos | Faturamento | TM | Var%) POR canal, ou 1 grafico de linhas
14. CONTEXTO DE CONVERSA E DRILL-DOWN: Quando o usuario faz perguntas complexas ("analise de vendas") ou de follow-up:
    - Ao mostrar a primeira resposta rica visualmente com graficos e tabelas, SEMPRE valide dados e mencione 1 comparacao logica (ex: se esta batendo/faltando para meta/ultimo mes) antes de sugerir o proximo passo
    - Para longas sequencias de perguntas no mesmo fluxo, evite renderizar grandes graficos verticalmente. Opte por graficos mais enxutos (em altura) ou sumarizacao concisa caso o usuario retome perguntas similares seguidas
    - Se a pergunta anterior foi sobre "janeiro, marco e abril", a proxima manterá os meses mas ajuste o grafico para ser mais "clean" se for drill-down direto
15. NIVEL DE DETALHE E EMOJIS: Torne a comunicacao mais envolvente para o usuario usando EMOJIS! 
    - Utilize 📈 para tendencias de alta e coisas positivas
    - Utilize 📉 para tendencias de baixa e coisas negativas (como queda no ticket, aumento de cancelamento)
    - Utilize 💰 para valores de faturamento e coisas financeiras
    - Compare valores e enriqueça o contexto com emojis adequados (💡, 🚀, ⚠️, 🚨)
    - Quando o usuario pergunta sobre cancelados, aplique os emojis corretos (como 🔴) e explique valor total perdido e taxa, nao apenas contagem

16. EXPORTACAO DE RELATORIOS:
    - Quando o usuario pedir para exportar, baixar, gerar arquivo, montar relatorio ou entregar em PDF, Excel/XLSX, CSV, HTML ou JSON, SEMPRE busque os dados estruturados primeiro com uma funcao analitica
    - O sistema pode gerar o arquivo automaticamente a partir do resultado estruturado; portanto, nao diga que nao consegue exportar se houver dados suficientes
    - Se o usuario pedir explicitamente PDF/Excel/CSV/HTML/JSON, responda normalmente com a analise e diga apenas que o arquivo foi gerado quando isso acontecer
    - NUNCA invente URL, link markdown, nome de arquivo, botao de download ou texto "Relatorio pronto"
    - O sistema anexara UM unico link oficial ao final da resposta quando houver exportacao; portanto, nao repita isso no corpo da analise

## Estilo
Profissional e direto, porem engajador com uso inteligente de emojis. Use termos de negocio (faturamento, ticket medio, taxa de conversao, mix de canais, sazonalidade). Apresente dados de forma organizada e termine com um insight util e contextualmente rico.

## GRAFICOS
Voce pode gerar graficos incluindo um bloco especial na resposta. O frontend renderiza automaticamente.
FORMATO: Use um bloco de codigo com a linguagem "chart" e um JSON dentro:
\`\`\`chart
{
  "type": "bar",
  "title": "Titulo do grafico",
  "labels": ["Jan", "Fev", "Mar"],
  "datasets": [{"label": "Faturamento", "data": [1000, 2000, 3000]}],
  "options": {"currency": true}
}
\`\`\`

TIPOS: "bar" (barras verticais), "line" (linha), "pie" (pizza), "doughnut" (rosca), "horizontalBar" (barras horizontais)

OPTIONS:
- "currency": true → formata eixo Y como R$
- "percentage": true → formata eixo Y como %
- "stacked": true → barras empilhadas
- "showLegend": true/false

QUANDO GERAR GRAFICOS:
- salesByMonth → grafico de LINHA com evolucao do faturamento
- ordersByMarketplace / compareMarketplaces → grafico de BARRAS ou PIZZA com distribuicao
- salesByDayOfWeek → grafico de BARRAS por dia
- salesByHour → grafico de LINHA por hora
- cancellationRate → grafico de PIZZA (pagos vs cancelados)
- cancellationByMonth → grafico de LINHA com taxa de cancelamento mensal
- marketplaceGrowth → grafico de LINHAS multiplas (uma por marketplace)
- yearOverYear → grafico de BARRAS agrupadas (ano a ano)
- seasonalityAnalysis → grafico de BARRAS com indice sazonal
- executiveSummary → grafico de PIZZA (mix de canais) + BARRAS (status)
- salesForecast → grafico de LINHA com historico + previsao tracejada
- topDays → grafico de BARRAS HORIZONTAIS
- enhancedForecast → grafico de LINHA com historico (solido) + projecao (usar cor mais clara) + intervalo de confianca
- forecastComparison → grafico de BARRAS comparando periodo atual vs projecao
- productDemandRate → tabela MARKDOWN com ranking de produtos + unidades/dia
- goalProbability → indicadores visuais com emojis (🟢 no ritmo, 🟡 atencao, 🔴 abaixo)
- runWhatIfScenario → tabela com 3 cenarios (pessimista/realista/otimista)

REGRAS DE GRAFICOS:
1. SEMPRE inclua texto explicativo ALEM do grafico
2. Coloque o bloco chart DEPOIS do texto explicativo
3. Abrevie labels de meses: "Jan/25", "Fev/25", etc.
4. Use no maximo 1-2 graficos por resposta
5. Arredonde valores para inteiros nos graficos (legibilidade)
6. Para dados monetarios, use options.currency = true

## GERAÇÃO DE RELATÓRIOS (Optimus Reports)
Quando o usuário pedir para "gerar um relatório", "resumo da semana", "fechamento do mês" ou intenções similares de análise ampla e estruturada:
1. Você DEVE assumir a intenção de gerar um relatório estruturado e convocar as funções de dados necessárias (ex: \`comparePeriods\`, \`executiveSummary\`).
2. Formate a resposta OBRIGATORIAMENTE usando as seguintes seções em Markdown (H3 - ###):
   - ### Sumário Executivo: 3-5 frases com os destaques do período.
   - ### Métricas Principais: KPIs importantes (Faturamento, TM, Cancelamentos) com comparações se souber.
   - ### Análise de Performance: O que foi bem e o que foi mal (ex: qual canal puxou o crescimento).
   - ### Insights: Descobertas, padrões ou anomalias encontradas.
   - ### Recomendações: 3-5 ações sugeridas e práticas.
3. SEMPRE inclua pelo menos 1 gráfico (bloco chart) logo após as Métricas Principais (ex: linha de evolução ou barras de mix de canais).
4. Use emojis em cada seção para facilitar a leitura (ex: 📊 para Sumário, 💰 para Métricas, 💡 para Insights, 🎯 para Recomendações), a menos que o usuário peça algo formal.
5. Adapte o tom do relatório conforme o usuário pedir (ex: se pedir formal, sem emojis, obedeça rigorosamente).

## PREVISOES E METAS (Forecaster)
Voce tem funcoes avancadas de previsao e simulacao:
- enhancedForecast: Use em vez de salesForecast para perguntas de previsao. Retorna intervalo de confianca e tracking continuo.
- goalProbability: Quando o usuario mencionar META, pergunte o valor se nao informado. Mostre ritmo atual vs necessario.
- productDemandRate: Para perguntas sobre "quando acaba", "velocidade de venda", "demanda". AVISO: NAO temos dados de estoque, apenas velocidade de venda.
- forecastComparison: Para "proximo mes vs este mes", "expectativa futura".
- runWhatIfScenario: Para "e se?", "simulacao", "impacto de promocao". Mostre tabela com 3 cenarios.

REGRAS DE PREVISAO:
1. SEMPRE use status="paid" para previsoes de faturamento
2. Quando mostrar intervalo de confianca, formate: "R$ X (entre R$ Y e R$ Z)"
3. Para metas, se o usuario nao informar valor, PERGUNTE: "Qual e a sua meta para este mes?"
4. Ao mostrar probabilidade, use emojis: 🟢 >= 70%, 🟡 40-69%, 🔴 < 40%
5. Para what-if, SEMPRE mostre os 3 cenarios em tabela markdown
6. Na demanda de produtos, avise que nao temos dados de estoque quando relevante
7. Se delta_from_last estiver presente no enhancedForecast, mencione a mudanca: "Previsao atualizada: R$X (antes R$Y)"

## ANALISE DE CLIENTES
Voce tambem analisa clientes/compradores usando dados extraidos dos pedidos.
IMPORTANTE sobre dados de clientes:
- NAO existe tabela 'customers'. Dados vem dos raw JSONs dos pedidos.
- Bagy: identificado pelo 'nome' do comprador
- Mercado Livre: identificado pelo 'buyer.id' + 'buyer.nickname'
- Shopee: identificado pelo 'buyer_username'
- Shein: NAO tem identificador de comprador (dados agregados apenas)
- NAO e possivel vincular mesmo cliente entre marketplaces (sem CPF/email)
- Sempre mencione de qual marketplace sao os dados de cliente
- Status do cliente: Ativo (<=30d), Em Risco (31-60d), Dormindo (61-120d), Perdido (>120d)
- Ciclo de vida: Novo (1 compra), Em Desenvolvimento (2-3), Fiel (4-10), VIP (>10)
- Ao listar clientes, SEMPRE traduza marketplace (ml → Mercado Livre, etc.)
- customerPurchasePatterns → grafico de PIZZA para ciclo de vida + BARRAS para canal
- topBuyers → tabela MARKDOWN com ranking
- customer360 → resposta rica com emojis e dados detalhados
- customerTicketBySegment → grafico de BARRAS com ticket por segmento + tabela comparativa
- customerSegmentComparison → tabela comparativa VIP vs Normal com multiplicadores em destaque
- loyaltyCandidates → tabela MARKDOWN com ranking de candidatos a fidelidade
- Quando perguntarem "Clientes Champions" ou "RFM 555": use getRFMAnalysis e filtre os Champions na resposta
- Quando perguntarem "distribuicao por segmento": use customerPurchasePatterns e gere grafico de PIZZA com lifecycle
- Quando perguntarem "cliente X vs media geral": use customer360 para o cliente + customerPurchasePatterns para a media, compare na resposta
- Quando perguntarem "quantos VIPs": use customerTicketBySegment e destaque o segmento VIP`;
}

// ── Circuit Breaker ─────────────────────────────────────
const CIRCUIT_BREAKER = {
  failures: 0,
  lastFailure: 0,
  threshold: 5,         // Open after 5 consecutive failures
  resetTimeout: 60_000, // Try again after 1 minute
  state: "closed" as "closed" | "open" | "half-open",
};

function checkCircuitBreaker(): void {
  const now = Date.now();
  if (CIRCUIT_BREAKER.state === "open") {
    if (now - CIRCUIT_BREAKER.lastFailure > CIRCUIT_BREAKER.resetTimeout) {
      CIRCUIT_BREAKER.state = "half-open";
      console.log("[CircuitBreaker] Transitioning to half-open");
    } else {
      throw new Error("Servico temporariamente indisponivel. Tente em 1 minuto.");
    }
  }
}

function recordSuccess(): void {
  CIRCUIT_BREAKER.failures = 0;
  if (CIRCUIT_BREAKER.state !== "closed") {
    CIRCUIT_BREAKER.state = "closed";
    console.log("[CircuitBreaker] Circuit closed (recovered)");
  }
}

function recordFailure(): void {
  CIRCUIT_BREAKER.failures++;
  CIRCUIT_BREAKER.lastFailure = Date.now();
  if (CIRCUIT_BREAKER.failures >= CIRCUIT_BREAKER.threshold) {
    CIRCUIT_BREAKER.state = "open";
    console.error(`[CircuitBreaker] Circuit OPEN after ${CIRCUIT_BREAKER.failures} failures`);
  }
}

// ── Retry with Exponential Backoff ──────────────────────
const MAX_RETRIES = 3;
const INITIAL_DELAY_MS = 1000;

async function callWithRetry<T>(
  fn: () => Promise<T>,
  label: string
): Promise<T> {
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      return await fn();
    } catch (error: any) {
      const isRetryable =
        error?.status === 429 ||
        error?.status === 503 ||
        error?.message?.includes("429") ||
        error?.message?.includes("503") ||
        error?.message?.includes("UNAVAILABLE") ||
        error?.message?.includes("RESOURCE_EXHAUSTED") ||
        error?.message?.includes("fetch failed") ||
        error?.message?.includes("ECONNRESET") ||
        error?.message?.includes("ETIMEDOUT");

      if (!isRetryable || attempt === MAX_RETRIES - 1) throw error;

      const delay = INITIAL_DELAY_MS * Math.pow(2, attempt) + Math.random() * 500;
      console.warn(`[${label}] Retry ${attempt + 1}/${MAX_RETRIES} after ${Math.round(delay)}ms`);
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  throw new Error("Unreachable");
}

// ── Helpers ─────────────────────────────────────────────

// Rough token estimate: ~4 chars per token for Portuguese
const MAX_HISTORY_CHARS = 40_000; // ~10k tokens reserved for history

function buildHistory(messages: ChatMessage[]): Content[] {
  // Truncate from the oldest messages to keep max 10 messages and respect character limit
  let totalChars = 0;
  const budgetMessages: ChatMessage[] = [];

  // Walk backwards (most recent first) to keep the freshest context, max 10
  for (let i = messages.length - 1; i >= Math.max(0, messages.length - 10); i--) {
    const msgChars = messages[i].content.length;
    if (totalChars + msgChars > MAX_HISTORY_CHARS) break;
    totalChars += msgChars;
    budgetMessages.unshift(messages[i]);
  }

  if (budgetMessages.length < messages.length) {
    console.log(`[Agent] History truncated: ${messages.length} → ${budgetMessages.length} messages (${totalChars} chars)`);
  }

  return budgetMessages.map((msg) => ({
    role: msg.role === "user" ? "user" : "model",
    parts: [{ text: msg.content }],
  }));
}

async function executeAdHocSQL(sql: string, tenantId?: string): Promise<unknown> {
  const result = sanitizeSQL(sql);
  if (!result.valid) return { error: result.error };
  const rpcParams: Record<string, unknown> = { query_text: result.query };
  if (tenantId) rpcParams.p_tenant_id = tenantId;
  const { data, error } = await supabaseAdmin.rpc("execute_readonly_query", rpcParams);
  if (error) return { error: "Erro: " + error.message };
  return { data, row_count: Array.isArray(data) ? data.length : 0 };
}

async function runOptimusQuery(args: Record<string, unknown> | undefined, tenantId?: string) {
  return ProductAnalyzer.queryProducts({
    ...(args || {}),
    tenantId,
    includeSummary: true,
  });
}

function truncateForGemini(result: unknown): unknown {
  const str = JSON.stringify(result);
  if (str.length < 15000) return result;

  if (Array.isArray(result)) {
    return {
      output: result.slice(0, 50),
      _truncated: true,
      _total_rows: result.length,
    };
  }

  if (result && typeof result === "object") {
    const obj = result as Record<string, unknown>;

    for (const key of ["data", "products", "output"]) {
      const value = obj[key];
      if (Array.isArray(value) && value.length > 50) {
        return { ...obj, [key]: value.slice(0, 50), _truncated: true, _total_rows: value.length };
      }
    }
  }

  return result;
}

function toFunctionResponsePayload(result: unknown): Record<string, unknown> {
  const truncated = truncateForGemini(result);

  if (truncated && typeof truncated === "object" && !Array.isArray(truncated)) {
    return truncated as Record<string, unknown>;
  }

  return { output: truncated };
}

// ── Fallback Formatter ──────────────────────────────────
function formatFallback(fnName: string, result: unknown): string {
  const r = result as Record<string, unknown>;
  const fBRL = (v: number) => "R$ " + v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const fNum = (v: number) => v.toLocaleString("pt-BR");
  const fPct = (v: number | null) => v !== null ? (v >= 0 ? "+" : "") + v.toFixed(1) + "%" : "N/A";

  const sPT: Record<string, string> = { paid: "Pagos", cancelled: "Cancelados", pending: "Pendentes", shipped: "Enviados", partially_refunded: "Parc. reembolsados", "pending processing": "Em processamento", "pending shipment": "Aguardando envio" };
  const mPT: Record<string, string> = { bagy: "Bagy", ml: "Mercado Livre", shopee: "Shopee", shein: "Shein", "physical store": "Loja Fisica" };
  const monthPT: Record<string, string> = { "01": "Jan", "02": "Fev", "03": "Mar", "04": "Abr", "05": "Mai", "06": "Jun", "07": "Jul", "08": "Ago", "09": "Set", "10": "Out", "11": "Nov", "12": "Dez" };

  try {
    switch (fnName) {
      case "countOrders":
        if (r.by_status && typeof r.by_status === "object") {
          const bySt = r.by_status as Record<string, number>;
          const total = (r.total as number) || 0;
          return "Total: **" + fNum(total) + " pedidos**\n\n" +
            Object.entries(bySt).sort(([, a], [, b]) => b - a)
              .map(([s, c]) => "- **" + (sPT[s] || s) + ":** " + fNum(c) + " (" + (total > 0 ? ((c / total) * 100).toFixed(1) : "0") + "%)").join("\n");
        }
        if (r.filters && (r.filters as Record<string, unknown>).status) {
          return "Total: **" + fNum((r.total as number) || 0) + " pedidos** (filtrado por status: " + (r.filters as Record<string, unknown>).status + ")\n[NAO HA BREAKDOWN DE OUTROS STATUS. NAO INVENTE DADOS.]";
        }
        return "Total: **" + fNum((r.total as number) || 0) + " pedidos**";

      case "totalSales": {
        const lines = ["**Faturamento:** " + fBRL((r.total_sales as number) || 0) + "\n**Pedidos:** " + fNum((r.order_count as number) || 0)];
        if (r.by_status && typeof r.by_status === "object") {
          const bySt = r.by_status as Record<string, { count: number; total: number }>;
          const totalOrders = (r.order_count as number) || 0;
          lines.push("\n**Detalhamento por status:**");
          Object.entries(bySt).sort(([, a], [, b]) => b.total - a.total)
            .forEach(([s, d]) => {
              lines.push("- **" + (sPT[s] || s) + ":** " + fNum(d.count) + " pedidos (" +
                (totalOrders > 0 ? ((d.count / totalOrders) * 100).toFixed(1) : "0") + "%) — " + fBRL(d.total));
            });
        } else if (r.filters && (r.filters as Record<string, unknown>).status) {
          lines.push("\n[DADOS FILTRADOS POR STATUS: " + (r.filters as Record<string, unknown>).status + " — NAO HA BREAKDOWN DE OUTROS STATUS DISPONIVEL. NAO INVENTE DADOS.]");
        }
        return lines.join("\n");
      }

      case "avgTicket":
        return [
          "**Ticket medio:** " + fBRL((r.avg_ticket as number) || 0),
          "**Mediana:** " + fBRL((r.median_ticket as number) || 0),
          "**Min/Max:** " + fBRL((r.min_ticket as number) || 0) + " / " + fBRL((r.max_ticket as number) || 0),
          "**Pedidos:** " + fNum((r.order_count as number) || 0),
        ].join("\n");

      case "ordersByStatus": {
        const dist = r.distribution as Record<string, number>;
        const total = (r.total as number) || 0;
        const entries = Object.entries(dist).sort(([, a], [, b]) => b - a);
        const chartBlock = "\n\n```chart\n" + JSON.stringify({
          type: "doughnut",
          title: "Distribuicao por Status",
          labels: entries.map(([s]) => sPT[s] || s),
          datasets: [{ label: "Pedidos", data: entries.map(([, c]) => c) }],
        }) + "\n```";
        return "**Por status** (" + fNum(total) + "):\n\n" +
          entries.map(([s, c]) => "- **" + (sPT[s] || s) + ":** " + fNum(c) + " (" + (total > 0 ? ((c / total) * 100).toFixed(1) : "0") + "%)").join("\n") + chartBlock;
      }

      case "ordersByMarketplace": {
        const mkt = r.marketplaces as Record<string, { count: number; total: number; by_status?: Record<string, { count: number; total: number }> }>;
        const entries = Object.entries(mkt).sort(([, a], [, b]) => b.total - a.total);
        const totalOrders = (r.total_orders as number) || 0;
        const chartBlock = "\n\n```chart\n" + JSON.stringify({
          type: "bar",
          title: "Faturamento por Marketplace",
          labels: entries.map(([n]) => mPT[n] || n),
          datasets: [{ label: "Faturamento", data: entries.map(([, d]) => Math.round(d.total)) }],
          options: { currency: true },
        }) + "\n```";

        // Status global
        const globalStatus = r.by_status as Record<string, { count: number; total: number }> | undefined;
        let statusBlock = "";
        if (globalStatus) {
          statusBlock = "\n\n**Distribuicao por status:**\n" +
            Object.entries(globalStatus).sort(([, a], [, b]) => b.count - a.count)
              .map(([s, d]) => "- **" + (sPT[s] || s) + ":** " + fNum(d.count) + " (" +
                (totalOrders > 0 ? ((d.count / totalOrders) * 100).toFixed(1) : "0") + "%) — " + fBRL(d.total)).join("\n");
        }

        return "**Por marketplace** (" + fNum(totalOrders) + " pedidos | " + fBRL(entries.reduce((s, [, d]) => s + d.total, 0)) + "):\n\n" +
          entries.map(([n, d]) => {
            let line = "- **" + (mPT[n] || n) + ":** " + fBRL(d.total) + " (" +
              (totalOrders > 0 ? ((d.count / totalOrders) * 100).toFixed(1) : "0") + "%) | " + fNum(d.count) + " pedidos";
            if (d.by_status && Object.keys(d.by_status).length > 0) {
              const statusParts = Object.entries(d.by_status).sort(([, a], [, b]) => b.count - a.count)
                .map(([s, sd]) => (sPT[s] || s) + ": " + fNum(sd.count));
              line += "\n  " + statusParts.join(" · ");
            }
            return line;
          }).join("\n") + statusBlock + chartBlock;
      }

      case "salesByMonth": {
        const months = r.months as Array<{
          month: string; count: number; total: number; avg_ticket: number; growth_pct: number | null;
          by_status?: Record<string, { count: number; total: number }>;
        }>;
        const labels = months.map((m) => { const [, mon] = m.month.split("-"); return (monthPT[mon] || mon); });
        const chartBlock = "\n\n```chart\n" + JSON.stringify({
          type: "line",
          title: "Evolucao do Faturamento",
          labels,
          datasets: [{ label: "Faturamento", data: months.map((m) => Math.round(m.total)) }],
          options: { currency: true },
        }) + "\n```";

        // Status global
        const globalStatus = r.by_status as Record<string, { count: number; total: number }> | undefined;
        const grandCount = (r.grand_count as number) || 0;
        let statusBlock = "";
        if (globalStatus) {
          statusBlock = "\n\n**Distribuicao por status:**\n" +
            Object.entries(globalStatus).sort(([, a], [, b]) => b.count - a.count)
              .map(([s, d]) => "- **" + (sPT[s] || s) + ":** " + fNum(d.count) + " (" +
                (grandCount > 0 ? ((d.count / grandCount) * 100).toFixed(1) : "0") + "%) — " + fBRL(d.total)).join("\n");
        }

        return "**Evolucao mensal** (total: " + fBRL((r.grand_total as number) || 0) + " | " + fNum(grandCount) + " pedidos):\n\n" +
          months.map((m) => {
            const [, mon] = m.month.split("-");
            return "- **" + (monthPT[mon] || mon) + ":** " + fBRL(m.total) + " | " + fNum(m.count) + " ped. | TM " + fBRL(m.avg_ticket) +
              (m.growth_pct !== null ? " | " + fPct(m.growth_pct) : "");
          }).join("\n") + statusBlock + chartBlock;
      }

      case "salesByDayOfWeek": {
        const days = r.days as Array<{ name: string; count: number; total: number; avg_ticket: number }>;
        const chartBlock = "\n\n```chart\n" + JSON.stringify({
          type: "bar",
          title: "Vendas por Dia da Semana",
          labels: days.map((d) => d.name),
          datasets: [{ label: "Faturamento", data: days.map((d) => Math.round(d.total)) }],
          options: { currency: true },
        }) + "\n```";
        return "**Por dia da semana:**\n\n" +
          days.map((d) => "- **" + d.name + ":** " + fBRL(d.total) + " | " + fNum(d.count) + " pedidos").join("\n") + chartBlock;
      }

      case "topDays": {
        const byRev = r.by_revenue as Array<{ date: string; count: number; total: number }>;
        return "**" + ((r.type as string) === "piores" ? "Piores" : "Melhores") + " dias (faturamento):**\n\n" +
          byRev.map((d, i) => (i + 1) + ". **" + d.date + ":** " + fBRL(d.total) + " (" + fNum(d.count) + " pedidos)").join("\n");
      }

      case "cancellationRate":
        return [
          "**Taxa de cancelamento:** " + ((r.cancellation_rate as number) || 0).toFixed(1) + "%",
          "**Cancelados:** " + fNum((r.cancelled_orders as number) || 0) + " (" + fBRL((r.cancelled_amount as number) || 0) + ")",
          "**Pagos:** " + fNum((r.paid_orders as number) || 0) + " (" + fBRL((r.paid_amount as number) || 0) + ")",
        ].join("\n");

      case "compareMarketplaces": {
        const comp = r.comparison as Array<{ marketplace: string; orders: number; revenue: number; revenue_share: number; avg_ticket: number; cancellation_rate: number }>;
        return "**Comparacao de canais:**\n\n" +
          comp.map((c) => "- **" + (mPT[c.marketplace] || c.marketplace) + ":** " + fBRL(c.revenue) + " (" + c.revenue_share.toFixed(1) + "%) | " + fNum(c.orders) + " ped. | TM " + fBRL(c.avg_ticket) + " | Cancel. " + c.cancellation_rate.toFixed(1) + "%").join("\n");
      }

      case "comparePeriods": {
        const curr = r.current_period as Record<string, unknown>;
        const prev = r.previous_period as Record<string, unknown>;
        const changes = r.changes as Record<string, number | null>;
        return [
          "**Periodo atual:** " + fBRL((curr.revenue as number) || 0) + " | " + fNum((curr.orders as number) || 0) + " pedidos",
          "**Periodo anterior:** " + fBRL((prev.revenue as number) || 0) + " | " + fNum((prev.orders as number) || 0) + " pedidos",
          "**Variacao faturamento:** " + fPct(changes.revenue),
          "**Variacao pedidos:** " + fPct(changes.orders),
          "**Variacao ticket:** " + fPct(changes.avg_ticket),
        ].join("\n");
      }

      case "salesByHour": {
        const peak = r.peak_hour as { label: string; count: number };
        const quiet = r.quiet_hour as { label: string; count: number };
        return "**Horario de pico:** " + peak.label + " (" + fNum(peak.count) + " pedidos)\n" +
          "**Horario mais calmo:** " + quiet.label + " (" + fNum(quiet.count) + " pedidos)";
      }

      case "salesForecast": {
        const lines = [
          "**Previsao proximo mes:** " + fBRL((r.forecast_next_month as number) || 0),
          "**Media movel 3 meses:** " + fBRL((r.moving_avg_3m as number) || 0),
          "**Tendencia:** " + ((r.trend as string) || "N/A"),
          "**Media mensal historica:** " + fBRL((r.avg_monthly_revenue as number) || 0),
        ];
        const curr = r.current_month as Record<string, unknown> | null;
        if (curr) {
          lines.push("**Mes atual (" + curr.month + "):** " + fBRL((curr.actual_so_far as number) || 0) +
            " (" + curr.days_passed + "/" + curr.days_in_month + " dias)" +
            (curr.projected_total ? " | Projecao: " + fBRL(curr.projected_total as number) : ""));
        }
        return lines.join("\n");
      }

      case "executiveSummary": {
        const ov = r.overview as Record<string, unknown>;
        const ch = r.channels as Array<Record<string, unknown>>;
        const tl = r.timeline as Record<string, unknown>;
        const bestM = tl?.best_month as Record<string, unknown>;
        const worstM = tl?.worst_month as Record<string, unknown>;
        const sb = r.status_breakdown as Array<{ status: string; count: number; pct: number; revenue: number }> | undefined;
        const totalOrders = (ov?.total_orders as number) || 0;

        const lines = [
          "## Resumo Executivo",
          "",
          "**Faturamento total:** " + fBRL((ov?.total_revenue as number) || 0),
          "**Pedidos:** " + fNum(totalOrders) + " | **Ticket medio:** " + fBRL((ov?.avg_ticket as number) || 0),
        ];

        // Status breakdown completo
        if (sb && sb.length > 0) {
          lines.push("", "**Por status:**");
          sb.forEach((s) => {
            lines.push("- **" + (sPT[s.status] || s.status) + ":** " + fNum(s.count) + " (" + s.pct.toFixed(1) + "%) — " + fBRL(s.revenue));
          });
        }

        // Canais
        if (ch && ch.length > 0) {
          lines.push("", "**Canais:**");
          ch.forEach((c) => {
            lines.push("- **" + (mPT[(c.marketplace as string)] || c.marketplace) + ":** " +
              fBRL((c.revenue as number) || 0) + " (" + ((c.share as number) || 0).toFixed(1) + "%) | " +
              fNum((c.orders as number) || 0) + " ped. | TM " + fBRL((c.avg_ticket as number) || 0));
          });
        }

        lines.push(
          "",
          "**Melhor mes:** " + (bestM?.month || "N/A") + " (" + fBRL((bestM?.revenue as number) || 0) + ")",
          "**Pior mes:** " + (worstM?.month || "N/A") + " (" + fBRL((worstM?.revenue as number) || 0) + ")",
          "**Tendencia ultimo mes:** " + fPct((tl?.latest_month_trend as number) || null),
        );
        return lines.join("\n");
      }

      case "marketplaceGrowth": {
        const mkts = r.marketplaces as Array<Record<string, unknown>>;
        return "**Crescimento por canal:**\n\n" +
          (mkts || []).map((m) => "- **" + (mPT[(m.marketplace as string)] || m.marketplace) + ":** " +
            fBRL((m.total_revenue as number) || 0) + " | Media mensal: " + fBRL((m.avg_monthly as number) || 0) +
            " | Crescimento: " + fPct((m.overall_growth as number) || null)
          ).join("\n");
      }

      case "cancellationByMonth": {
        const ms = r.months as Array<Record<string, unknown>>;
        const summary = r.summary as Record<string, unknown>;
        const labels = (ms || []).map((m) => { const p = (m.month as string).split("-"); return (monthPT[p[1]] || p[1]); });
        const chartBlock = "\n\n```chart\n" + JSON.stringify({
          type: "line",
          title: "Taxa de Cancelamento Mensal",
          labels,
          datasets: [{ label: "Taxa %", data: (ms || []).map((m) => (m.cancellation_rate as number) || 0) }],
          options: { percentage: true },
        }) + "\n```";
        return [
          "**Cancelamentos mes a mes:**\n",
          ...(ms || []).map((m) => "- **" + (m.month as string) + ":** " +
            fNum((m.cancelled_orders as number) || 0) + " cancelados (" +
            ((m.cancellation_rate as number) || 0).toFixed(1) + "%) | Perda: " +
            fBRL((m.lost_revenue as number) || 0)),
          "",
          "**Total perdido:** " + fBRL((summary?.total_lost_revenue as number) || 0) +
          " | **Taxa media:** " + ((summary?.avg_cancellation_rate as number) || 0).toFixed(1) + "%",
        ].join("\n") + chartBlock;
      }

      case "yearOverYear": {
        const yearly = r.years as Array<Record<string, unknown>>;
        const monthlyComp = r.monthly_comparison as Array<Record<string, unknown>> | undefined;
        let text = "**Comparacao anual:**\n\n" +
          (yearly || []).map((y) => "- **" + y.year + ":** " + fBRL((y.revenue as number) || 0) +
            " | " + fNum((y.orders as number) || 0) + " pedidos | TM: " + fBRL((y.avg_ticket as number) || 0) +
            (y.growth_pct !== null && y.growth_pct !== undefined ? " | " + fPct(y.growth_pct as number) : "")
          ).join("\n");

        if (monthlyComp && monthlyComp.length > 0) {
          text += "\n\n**Comparacao mensal:**\n\n";
          text += monthlyComp.map((mc) => {
            const monthLabel = monthPT[(mc.month as string)] || (mc.month as string);
            const years = mc.years as Array<Record<string, unknown>>;
            const yLines = (years || []).map((y) =>
              "  - **" + y.year + ":** " + fBRL((y.revenue as number) || 0) +
              " | " + fNum((y.orders as number) || 0) + " ped. | TM " + fBRL((y.avg_ticket as number) || 0)
            ).join("\n");
            const growthInfo = mc.growth_pct !== null && mc.growth_pct !== undefined
              ? " (" + fPct(mc.growth_pct as number) + ")" : "";
            return "- **" + monthLabel + "**" + growthInfo + ":\n" + yLines;
          }).join("\n");
        }

        // Chart
        if (yearly && yearly.length >= 2) {
          const chartBlock = "\n\n```chart\n" + JSON.stringify({
            type: "bar",
            title: "Comparacao Ano a Ano",
            labels: yearly.map((y) => String(y.year)),
            datasets: [{ label: "Faturamento", data: yearly.map((y) => Math.round((y.revenue as number) || 0)) }],
            options: { currency: true },
          }) + "\n```";
          text += chartBlock;
        }
        return text;
      }

      case "seasonalityAnalysis": {
        const pattern = r.monthly_pattern as Array<Record<string, unknown>>;
        const strong = r.strong_months as string[];
        const weak = r.weak_months as string[];
        return [
          "**Analise de sazonalidade:**\n",
          ...(pattern || []).map((m) => "- **" + m.name + ":** Indice " +
            (m.seasonal_index as number) + " (" + m.classification + ") | Media: " + fBRL((m.avg_revenue as number) || 0)),
          "",
          "**Meses fortes:** " + (strong?.join(", ") || "N/A"),
          "**Meses fracos:** " + (weak?.join(", ") || "N/A"),
        ].join("\n");
      }

      case "healthCheck": {
        const alertsList = r.alerts as Array<{ type: string; message: string; estimated_impact?: { amount: number; direction: string; description: string } }>;
        const hcSummary = r.summary as Record<string, unknown> | null;
        const drillDown = r.drill_down_suggestions as string[] | undefined;
        const icons: Record<string, string> = { danger: "🔴", warning: "⚠️", success: "🟢", info: "ℹ️" };
        const lines: string[] = ["## 🩺 Diagnóstico Rápido\n"];
        if (alertsList) {
          alertsList.forEach((a) => {
            lines.push(icons[a.type] + " " + a.message);
            if (a.estimated_impact) {
              const impactIcon = a.estimated_impact.direction === "loss" ? "📉" : "📈";
              lines.push(`  ${impactIcon} **Impacto:** ${a.estimated_impact.description}`);
            }
            lines.push("");
          });
        }
        if (hcSummary) {
          lines.push("---");
          lines.push("📊 **Mês atual (" + (hcSummary.current_month as string) + "):** " +
            fBRL((hcSummary.revenue_so_far as number) || 0) + " em " +
            (hcSummary.days_passed as number) + " dias | " +
            fNum((hcSummary.orders_so_far as number) || 0) + " pedidos | Faltam " +
            (hcSummary.days_remaining as number) + " dias");
        }
        if (drillDown && drillDown.length > 0) {
          lines.push("");
          lines.push("🔍 **Quer se aprofundar?**");
          drillDown.forEach(s => lines.push("- " + s));
        }
        return lines.join("\n");
      }

      // ── Forecaster Formatters ───────────────────────────────
      case "enhancedForecast": {
        const lines = [
          "**Previsão próximo mês:** " + fBRL((r.forecast_next_month as number) || 0),
          "**Intervalo de confiança:** " + fBRL((r.confidence_interval as any)?.low || 0) + " a " + fBRL((r.confidence_interval as any)?.high || 0),
          "**Tendencia:** " + ((r.trend as string) || "N/A"),
          "**Variancia historica:** " + ((r.variance_pct as number) || 0) + "%",
        ];
        const curr = r.current_month as Record<string, unknown> | null;
        if (curr) {
          lines.push("**Mes atual (" + curr.month + "):** " + fBRL((curr.actual_so_far as number) || 0) +
            " (" + curr.days_passed + "/" + curr.days_in_month + " dias) | Projecao: " + fBRL(curr.projected_total as number));
        }
        if (r.delta_from_last) {
          const delta = r.delta_from_last as any;
          lines.push(`**Atualizacao:** Previsao anterior era ${fBRL(delta.previous)} (mudanca de ${fPct(delta.change_pct)})`);
        }
        const chartBlock = "\n\n```chart\n" + JSON.stringify({
          type: "line",
          title: "Previsão de Faturamento (com Intervalo de Confiança)",
          labels: [curr?.month || "Atual", "Próximo Mês"],
          datasets: [
             { label: "Atual", data: [curr?.actual_so_far || 0, null] },
             { label: "Projeção", data: [curr?.projected_total || 0, r.forecast_next_month || 0], borderDash: [5, 5] },
          ],
          options: { currency: true },
        }) + "\n```";
        return lines.join("\n") + chartBlock;
      }

      case "goalProbability": {
        const g = r as any;
        if (g.error) return "❌ " + g.error;
        let emoji = "⚪";
        if (g.pace_status === "ahead") emoji = "🚀";
        if (g.pace_status === "on_track") emoji = "✅";
        if (g.pace_status === "behind") emoji = "⚠️";
        if (g.pace_status === "far_behind") emoji = "🔴";

        return [
          `## 🎯 Acompanhamento de Meta: ${fBRL(g.goal_amount)}`,
          `**Status:** ${emoji} ${g.recommendation}`,
          "",
          `**Faturado até agora:** ${fBRL(g.current_revenue)} (${g.days_passed} dias)`,
          `**Falta faturar:** ${fBRL(g.remaining)} (${g.days_remaining} dias restantes)`,
          `**Ritmo atual:** ${fBRL(g.daily_pace_current)}/dia`,
          `**Ritmo necessário:** ${fBRL(g.daily_pace_needed)}/dia`,
          "",
          `**Projeção final:** ${fBRL(g.projected_total)} (${fPct(g.projected_vs_goal_pct)} da meta)`,
          `**Probabilidade de bater:** ${g.probability_pct}%`,
        ].join("\n");
      }

      case "productDemandRate": {
        const pd = r as any;
        if (pd.error) return "❌ " + pd.error;
        const products = pd.products as Array<any>;
        return `**Velocidade de Venda (${pd.period}) — ${pd.total_products} produtos analisados:**\n\n` +
          "| Produto | Canal | Vendidos 30d | Vendidos 7d | Vel. Diária | Projecao 30d | Tendencia |\n" +
          "|---------|-------|--------------|-------------|-------------|--------------|-----------|\n" +
          products.map(p =>
            `| ${p.name.substring(0, 30)} | ${mPT[p.marketplace] || p.marketplace} | ${p.units_last_30d} | ${p.units_last_7d} | ${p.daily_rate}/dia | ${p.projection_30d} | ${p.trend === 'accelerating' ? '📈 Acelerando' : p.trend === 'decelerating' ? '📉 Desacelerando' : '➡️ Estavel'} |`
          ).join("\n") +
          "\n\n_Aviso: Calculo baseado no historico recente de pedidos pagos. Nao inclui dados de estoque em tempo real._";
      }

      case "forecastComparison": {
        const fc = r as any;
        if (fc.error) return "❌ " + fc.error;
        const compLine = fc.comparison_previous
          ? `**Periodo anterior (${fc.comparison_previous.label}):** ${fBRL(fc.comparison_previous.revenue)} (Var: ${fPct(fc.projected_vs_previous_pct)})`
          : "";
        const chartBlock = "\n\n```chart\n" + JSON.stringify({
          type: "bar",
          title: "Comparação de Projeção",
          labels: [fc.current_period.label, fc.projected_next.label],
          datasets: [{ label: "Faturamento", data: [Math.round(fc.current_period.revenue), Math.round(fc.projected_next.revenue)] }],
          options: { currency: true },
        }) + "\n```";
        return [
          `**Projecao vs Atual:** ${fc.trend_summary}`,
          `**Periodo atual (${fc.current_period.label}):** ${fBRL(fc.current_period.revenue)}`,
          `**Proximo periodo (${fc.projected_next.label}):** ${fBRL(fc.projected_next.revenue)} (entre ${fBRL(fc.projected_next.confidence.low)} e ${fBRL(fc.projected_next.confidence.high)})`,
          compLine,
        ].filter(Boolean).join("\n") + chartBlock;
      }

      case "runWhatIfScenario": {
        const wi = r as any;
        if (wi.error) return "❌ " + wi.error;
        const sc = wi.scenarios;
        return [
          "## 🧮 Simulação What-If",
          `**Cenário aplicado:** Preco ${wi.scenario_applied.price_change_pct}%, Trafego ${wi.scenario_applied.traffic_change_pct}%, Conversao ${wi.scenario_applied.conversion_change_pct}%`,
          "",
          "| Cenário | Faturamento Previsto | Pedidos Previstos | Variação vs Atual |",
          "|---------|----------------------|-------------------|-------------------|",
          `| **Pessimista** | ${fBRL(sc.pessimista.revenue)} | ${sc.pessimista.orders} | ${fPct(sc.pessimista.change_pct)} |`,
          `| **Realista**   | ${fBRL(sc.realista.revenue)} | ${sc.realista.orders} | ${fPct(sc.realista.change_pct)} |`,
          `| **Otimista**   | ${fBRL(sc.otimista.revenue)} | ${sc.otimista.orders} | ${fPct(sc.otimista.change_pct)} |`,
          "",
          `_Baseline atual (${wi.baseline.period}): ${fBRL(wi.baseline.revenue)} | ${wi.baseline.orders} pedidos | TM ${fBRL(wi.baseline.avg_ticket)}_`
        ].join("\n");
      }

      // ── Customer Analyzer Formatters ──────────────────────
      case "customerCount": {
        const byMkt = r.by_marketplace as Record<string, { distinct_buyers: number; orders: number; revenue: number }>;
        return "**Base de Clientes:** " + fNum((r.total_distinct_buyers as number) || 0) + " compradores distintos\n\n" +
          Object.entries(byMkt || {}).map(([m, d]) =>
            "- **" + (mPT[m] || m) + ":** " + fNum(d.distinct_buyers) + " compradores | " + fNum(d.orders) + " pedidos | " + fBRL(d.revenue)
          ).join("\n") +
          "\n\n_" + (r.note as string || "") + "_";
      }

      case "customerSearch": {
        const results = r.results as Array<any>;
        if (!results?.length) return "Nenhum cliente encontrado para \"" + (r.search_term as string) + "\"";
        return "**Resultados para \"" + (r.search_term as string) + "\"** (" + results.length + " encontrados):\n\n" +
          results.map((c: any) =>
            "- **" + c.name + "** (" + (mPT[c.marketplace] || c.marketplace) + ") | " + fNum(c.total_orders) + " pedidos | " +
            fBRL(c.total_spent) + " | TM " + fBRL(c.avg_ticket) + " | " + c.status
          ).join("\n");
      }

      case "customer360": {
        const cust = r.customer as Record<string, any>;
        const metrics = r.metrics as Record<string, any>;
        const tline = r.timeline as Record<string, any>;
        const actions = r.suggested_actions as string[];
        if (r.error) return "❌ " + (r.error as string);
        return [
          "## 👤 " + cust.name,
          "**Canal:** " + (mPT[cust.marketplace] || cust.marketplace) + " | **Status:** " + cust.status + " | **Ciclo:** " + cust.lifecycle,
          "",
          "📦 **Pedidos:** " + fNum(metrics.total_orders) + " total | " + fNum(metrics.paid_orders) + " pagos | " + fNum(metrics.cancelled_orders) + " cancelados",
          "💰 **Gasto total:** " + fBRL(metrics.total_spent) + " | **Pagos:** " + fBRL(metrics.paid_total),
          "🎫 **Ticket médio:** " + fBRL(metrics.avg_ticket) + " | Min: " + fBRL(metrics.min_order) + " | Max: " + fBRL(metrics.max_order),
          "",
          "📅 **Primeira compra:** " + (tline.first_order || "N/A"),
          "📅 **Última compra:** " + (tline.last_order || "N/A") + " (" + (tline.days_since_last || 0) + " dias atrás)",
          "🔄 **Intervalo médio:** " + (tline.avg_days_between_orders ? tline.avg_days_between_orders + " dias" : "N/A"),
          "",
          ...(actions?.length ? ["💡 **Ações sugeridas:**", ...actions.map((a: string) => "- " + a)] : []),
        ].join("\n");
      }

      case "topBuyers": {
        const buyers = r.top_buyers as Array<any>;
        return "**🏆 Top Compradores** (por " + (r.sort_by as string) + "):\n\n" +
          "| # | Cliente | Canal | Pedidos | Gasto Total | Ticket Médio | Status |\n" +
          "|---|---------|-------|---------|-------------|-------------|--------|\n" +
          (buyers || []).map((b: any) =>
            "| " + b.rank + " | " + b.name + " | " + (mPT[b.marketplace] || b.marketplace) + " | " +
            fNum(b.total_orders) + " | " + fBRL(b.total_spent) + " | " + fBRL(b.avg_ticket) + " | " + b.status + " |"
          ).join("\n");
      }

      case "inactiveCustomers": {
        const inactive = r.inactive_customers as Array<any>;
        return "**⚠️ Clientes Inativos** (sem compra há " + (r.threshold_days as number) + "+ dias) — " + fNum((r.count as number) || 0) + " encontrados:\n\n" +
          (inactive || []).map((c: any) =>
            "- **" + c.name + "** (" + (mPT[c.marketplace] || c.marketplace) + ") | " +
            fNum(c.total_orders) + " compras | " + fBRL(c.total_spent) + " | Última: " + c.last_order + " (" + c.days_inactive + " dias)"
          ).join("\n");
      }

      case "newCustomers": {
        const byMkt = r.by_marketplace as Record<string, { new_buyers: number; revenue: number; avg_first_spend: number }>;
        return "**🆕 Novos Clientes:** " + fNum((r.total_new_buyers as number) || 0) + " | Receita: " + fBRL((r.total_new_revenue as number) || 0) + "\n\n" +
          Object.entries(byMkt || {}).map(([m, d]) =>
            "- **" + (mPT[m] || m) + ":** " + fNum(d.new_buyers) + " novos | " + fBRL(d.revenue) + " | Gasto médio: " + fBRL(d.avg_first_spend)
          ).join("\n");
      }

      case "customerPurchasePatterns": {
        const freq = r.frequency as Record<string, any>;
        const interval = r.purchase_interval as Record<string, any>;
        const lc = r.lifecycle as Record<string, number>;
        const chDist = r.channel_distribution as Record<string, number>;
        return [
          "## 📊 Comportamento de Compra\n",
          "**Frequência média:** " + (freq?.avg_orders_per_buyer || 0) + " compras/cliente",
          "**Ticket médio:** " + fBRL(freq?.avg_ticket || 0),
          "**Taxa de recompra:** " + (freq?.repeat_rate || 0) + "% (" + fNum(freq?.repeat_buyers || 0) + " de " + fNum(freq?.total_buyers || 0) + ")",
          "**Intervalo médio:** " + (interval?.avg_days || 0) + " dias (mediana: " + (interval?.median_days || 0) + " dias)",
          "",
          "**Ciclo de vida:**",
          ...Object.entries(lc || {}).map(([stage, count]) => "- **" + stage + ":** " + fNum(count)),
          "",
          "**Por canal:**",
          ...Object.entries(chDist || {}).map(([m, count]) => "- **" + (mPT[m] || m) + ":** " + fNum(count) + " compradores"),
        ].join("\n");
      }

      case "customerCompare": {
        if (r.error) return "❌ " + (r.error as string);
        const a = r.buyer_a as Record<string, any>;
        const b = r.buyer_b as Record<string, any>;
        const winner = r.winner as Record<string, string> | null;
        if (a?.error || b?.error) return "❌ " + (a?.error || b?.error);
        return [
          "## ⚔️ Comparação de Clientes\n",
          "| Métrica | " + a.name + " | " + b.name + " |",
          "|---------|" + "-".repeat(a.name.length + 2) + "|" + "-".repeat(b.name.length + 2) + "|",
          "| Canal | " + (mPT[a.marketplace] || a.marketplace) + " | " + (mPT[b.marketplace] || b.marketplace) + " |",
          "| Pedidos | " + fNum(a.total_orders) + " | " + fNum(b.total_orders) + " |",
          "| Gasto Total | " + fBRL(a.total_spent) + " | " + fBRL(b.total_spent) + " |",
          "| Ticket Médio | " + fBRL(a.avg_ticket) + " | " + fBRL(b.avg_ticket) + " |",
          "| Status | " + a.status + " | " + b.status + " |",
          ...(winner ? [
            "",
            "🏆 **Mais pedidos:** " + winner.more_orders,
            "💰 **Maior gasto:** " + winner.higher_spend,
            "🎫 **Maior ticket:** " + winner.higher_ticket,
            "📅 **Comprou mais recente:** " + winner.more_recent,
          ] : []),
        ].join("\n");
      }

      case "explainAnomaly": {
        const explanation = r as any;
        const lines: string[] = ["## 🔍 Análise de Anomalias\n"];
        if (explanation.anomaly_summary) {
          lines.push(explanation.anomaly_summary + "\n");
        }
        if (explanation.probable_causes?.length) {
          lines.push("### 🎯 Causas Prováveis");
          explanation.probable_causes.forEach((c: any) => {
            const conf = { alta: "🟢", media: "🟡", baixa: "🟠" };
            lines.push(`- ${(conf as any)[c.confidence] || "⚪"} **${c.cause}** (confiança: ${c.confidence})`);
            lines.push(`  _${c.evidence}_`);
          });
          lines.push("");
        }
        if (explanation.estimated_impact) {
          const imp = explanation.estimated_impact;
          const icon = imp.direction === "loss" ? "📉" : "📈";
          lines.push(`### ${icon} Impacto Estimado`);
          lines.push(`**R$ ${(imp.amount || 0).toLocaleString("pt-BR")}** (${imp.direction === "loss" ? "perda" : "ganho"})`);
          lines.push(imp.description || "");
          if (imp.projection) lines.push(`_${imp.projection}_`);
          lines.push("");
        }
        if (explanation.corrective_actions?.length) {
          lines.push("### ✅ Ações Sugeridas");
          const prioIcons = { urgente: "🔴", alta: "🟠", media: "🟡", baixa: "🟢" };
          explanation.corrective_actions.forEach((a: any) => {
            lines.push(`- ${(prioIcons as any)[a.priority] || "⚪"} **${a.action}**`);
            lines.push(`  _${a.expected_effect}_`);
          });
          lines.push("");
        }
        if (explanation.drill_down_suggestions?.length) {
          lines.push("🔍 **Quer se aprofundar?**");
          explanation.drill_down_suggestions.forEach((s: string) => lines.push("- " + s));
        }
        return lines.join("\n");
      }

      default:
        return "```json\n" + JSON.stringify(r, null, 2).substring(0, 2000) + "\n```";
    }
  } catch {
    return "```json\n" + JSON.stringify(r, null, 2).substring(0, 2000) + "\n```";
  }
}

// ── Token Usage Types ───────────────────────────────────
export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  estimatedCostUSD: number;
}

export interface ProcessMessageResult {
  text: string;
  tokenUsage: TokenUsage;
  suggestions?: string[];
}

interface PromptAugmentation {
  extraSystemContext?: string;
}

interface AgentExecutionContext {
  userId?: string;
  tenantId?: string;
}

function getRepairedSuggestions(functionName?: string) {
  const suggestions = functionName ? SUGGESTIONS_MAP[functionName] : undefined;
  return suggestions?.map((item) => repairTextArtifacts(item));
}

async function maybeGenerateChatExport(params: {
  userMessage: string;
  functionName?: string;
  functionResult: unknown;
  executionContext?: AgentExecutionContext;
}) {
  const format = parseRequestedExportFormat(params.userMessage);
  if (!format) return null;
  if (!params.functionName) return null;
  if (!params.executionContext?.userId || !params.executionContext.tenantId) return null;
  if (params.functionResult && typeof params.functionResult === "object" && "error" in (params.functionResult as Record<string, unknown>)) {
    return null;
  }

  const title = buildChatExportTitle(params.functionName, params.userMessage);
  const document = buildGenericAnalysisDocument({
    title,
    functionName: params.functionName,
    result: params.functionResult,
    question: params.userMessage,
  });

  return ReportExporterService.generateAdHocExport({
    tenantId: params.executionContext.tenantId,
    userId: params.executionContext.userId,
    title,
    format,
    document,
    options: {
      include_summary: true,
      include_graphs: true,
      watermark: false,
      orientation: "portrait",
      presentation: "professional",
    },
  });
}

// ── Contextual Suggestions Map ─────────────────────────
// Sugestões determinísticas baseadas na função chamada — zero custo de tokens
const SUGGESTIONS_MAP: Record<string, string[]> = {
  countOrders: [
    "Qual o faturamento total desse período?",
    "Distribuição por status?",
    "E por marketplace?",
  ],
  totalSales: [
    "Qual o ticket médio?",
    "Evolução mês a mês?",
    "Qual marketplace fatura mais?",
  ],
  avgTicket: [
    "Ticket médio por marketplace?",
    "Evolução do ticket mês a mês?",
    "Compare com o mês passado",
  ],
  ordersByStatus: [
    "Quanto perdi em cancelamentos?",
    "Evolução de cancelamentos por mês?",
    "Taxa de cancelamento por marketplace?",
  ],
  ordersByMarketplace: [
    "Qual marketplace cresce mais rápido?",
    "Comparação detalhada entre canais",
    "Cancelamentos por canal?",
  ],
  salesByMonth: [
    "Qual a previsão para o próximo mês?",
    "Qual a sazonalidade do negócio?",
    "Compare com o ano anterior",
  ],
  salesByDayOfWeek: [
    "E por hora do dia?",
    "Quais foram os melhores dias de venda?",
    "Faturamento mês a mês?",
  ],
  salesByHour: [
    "E por dia da semana?",
    "Quais os melhores dias?",
    "Evolução mensal de vendas?",
  ],
  topDays: [
    "E os piores dias?",
    "Evolução mês a mês?",
    "Qual dia da semana vende mais?",
  ],
  cancellationRate: [
    "Evolução de cancelamentos por mês?",
    "Qual marketplace cancela mais?",
    "Quanto perdi em valor?",
  ],
  compareMarketplaces: [
    "Qual marketplace cresce mais rápido?",
    "Evolução mensal por canal?",
    "Ticket médio por marketplace?",
  ],
  comparePeriods: [
    "Compare com o ano anterior",
    "Evolução mês a mês completa?",
    "Previsão para o próximo mês?",
  ],
  salesForecast: [
    "Me dá um resumo executivo completo",
    "Qual a sazonalidade do negócio?",
    "Compare com o ano anterior",
  ],
  executiveSummary: [
    "Qual a previsão para o próximo mês?",
    "Evolução de cancelamentos por mês?",
    "Qual marketplace cresce mais rápido?",
  ],
  marketplaceGrowth: [
    "Comparação detalhada entre canais",
    "Qual a sazonalidade?",
    "Previsão de faturamento?",
  ],
  cancellationByMonth: [
    "Taxa de cancelamento por marketplace?",
    "Qual a tendência de cancelamento?",
    "Resumo executivo completo?",
  ],
  yearOverYear: [
    "Sazonalidade do negócio?",
    "Previsão para o próximo mês?",
    "Resumo executivo?",
  ],
  seasonalityAnalysis: [
    "Previsão para o próximo mês?",
    "Quais foram os melhores dias do ano?",
    "Resumo executivo completo?",
  ],
  healthCheck: [
    "Explique as anomalias detectadas",
    "Me dá um resumo executivo completo",
    "Qual a previsão para o próximo mês?",
  ],
  explainAnomaly: [
    "Quais marketplaces foram mais afetados?",
    "Compare com o mesmo período do ano passado",
    "Quais ações devo tomar agora?",
  ],
  executeSQLQuery: [
    "Resumo executivo?",
    "Vendas por marketplace?",
    "Evolução mês a mês?",
  ],
  // Forecaster
  enhancedForecast: [
    "Vou bater minha meta do mês?",
    "Qual a velocidade de venda dos meus produtos?",
    "E se eu fizer uma promoção de 20%?",
  ],
  goalProbability: [
    "Qual a previsão completa para o próximo mês?",
    "Compare a projeção com o mês anterior",
    "E se eu aumentar o marketing em 50%?",
  ],
  productDemandRate: [
    "Previsão de faturamento do mês?",
    "Quais produtos estão desacelerando?",
    "Como está o ritmo geral de vendas?",
  ],
  forecastComparison: [
    "Qual a probabilidade de bater a meta?",
    "Previsão detalhada com intervalo de confiança?",
    "Simule um cenário what-if",
  ],
  runWhatIfScenario: [
    "Qual a previsão de faturamento do mês?",
    "Velocidade de venda dos meus produtos?",
    "Vou bater a meta de R$200k?",
  ],
  query_optimus_data: [
    "Quais produtos estão com estoque baixo?",
    "Me mostre os produtos mais caros",
    "Análise de saúde do inventário",
  ],
};

// Gemini 2.5 Flash pricing (per 1M tokens) - May 2025
const GEMINI_PRICING = {
  input: 0.15 / 1_000_000,  // $0.15 per 1M input tokens
  output: 0.60 / 1_000_000, // $0.60 per 1M output tokens
};

function calculateCost(inputTokens: number, outputTokens: number): number {
  return (inputTokens * GEMINI_PRICING.input) + (outputTokens * GEMINI_PRICING.output);
}

// ── Main Agent ──────────────────────────────────────────
const MAX_FUNCTION_CALLS = 5;

export async function processMessage(
  userMessage: string,
  conversationHistory: ChatMessage[],
  tenantId?: string,
  promptAugmentation: PromptAugmentation = {},
  executionContext?: AgentExecutionContext,
): Promise<ProcessMessageResult> {
  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  let lastFnResult: unknown;

  try {
    checkCircuitBreaker();

    const history = buildHistory(conversationHistory);
    let systemPrompt = await buildSystemPrompt(tenantId);

    // Injetar Pre-Context (Resumo rápido)
    if (tenantId) {
      const summary = await DataContextService.getQuickSummary(tenantId);
      const summaryText = DataContextService.formatSummaryForPrompt(summary);
      systemPrompt = `${systemPrompt}\n\n${summaryText}`;
    }

    if (promptAugmentation.extraSystemContext?.trim()) {
      systemPrompt = `${systemPrompt}\n\n${promptAugmentation.extraSystemContext.trim()}`;
    }
    systemPrompt = repairTextArtifacts(systemPrompt);
    systemPrompt = repairTextArtifacts(systemPrompt);

    // Build the initial conversation contents
    const contents: Content[] = [...history, { role: "user", parts: [{ text: userMessage }] }];
    let lastFnName: string | undefined;

    // Multi-turn function calling loop — allows up to MAX_FUNCTION_CALLS
    for (let turn = 0; turn <= MAX_FUNCTION_CALLS; turn++) {
      const isLastTurn = turn === MAX_FUNCTION_CALLS;

      const response = await callWithRetry(
        () => genai.models.generateContent({
          model: GEMINI_MODEL,
          contents,
          config: {
            systemInstruction: systemPrompt,
            // On the last turn, don't offer tools so Gemini is forced to produce text
            tools: isLastTurn ? undefined : [{ functionDeclarations }],
            temperature: 0.3,
            maxOutputTokens: 8192,
          },
        }),
        "Agent"
      );

      // Track tokens
      if (response.usageMetadata) {
        totalInputTokens += response.usageMetadata.promptTokenCount || 0;
        totalOutputTokens += response.usageMetadata.candidatesTokenCount || 0;
      }

      const candidate = response.candidates?.[0];
      if (!candidate?.content?.parts) {
        return {
          text: "Desculpe, nao consegui processar. Tente novamente.",
          tokenUsage: { inputTokens: totalInputTokens, outputTokens: totalOutputTokens, totalTokens: totalInputTokens + totalOutputTokens, estimatedCostUSD: calculateCost(totalInputTokens, totalOutputTokens) },
        };
      }

      // Check if Gemini wants to call a function
      const fcPart = candidate.content.parts.find((p) => p.functionCall);

      if (fcPart?.functionCall) {
        const { name, args } = fcPart.functionCall;
        lastFnName = name!;
        console.log("[Agent] Fn:", name, JSON.stringify(args));

        let fnResult: unknown;
        try {
          if (name === "executeSQLQuery" && args?.sql) {
            fnResult = await executeAdHocSQL(args.sql as string, tenantId);
          } else if (name === "explainAnomaly" && tenantId) {
            fnResult = await AnomalyExplainerService.explain(tenantId);
          } else if (name === "enhancedForecast") {
            fnResult = await ForecasterService.enhancedForecast({ ...args, _tenant_id: tenantId } as QueryParams);
          } else if (name === "goalProbability") {
            fnResult = await ForecasterService.goalProbability({ ...args, _tenant_id: tenantId } as any);
          } else if (name === "productDemandRate") {
            fnResult = await ForecasterService.productDemandRate({ ...args, _tenant_id: tenantId } as any);
          } else if (name === "forecastComparison") {
            fnResult = await ForecasterService.forecastComparison({ ...args, _tenant_id: tenantId } as QueryParams);
          } else if (name === "runWhatIfScenario") {
            fnResult = await ForecasterService.runWhatIfScenario({ ...args, _tenant_id: tenantId } as any);
          } else if (name === "query_optimus_data") {
            fnResult = await runOptimusQuery(args as Record<string, unknown> | undefined, tenantId);
          } else if (name && queryFunctions[name]) {
            fnResult = await queryFunctions[name]({ ...args, _tenant_id: tenantId } as QueryParams);
          } else {
            fnResult = { error: "Funcao nao encontrada: " + name };
          }
        } catch (e) {
          console.error("[Agent] Fn error:", e);
          fnResult = { error: (e instanceof Error ? e.message : "erro") };
        }

        console.log("[Agent] Result:", JSON.stringify(fnResult).substring(0, 500));
        lastFnResult = fnResult;
        const functionResponse = toFunctionResponsePayload(fnResult);

        // Append function call + response to the conversation and continue loop
        contents.push(
          { role: "model", parts: [{ functionCall: { name: name!, args: args || {} } }] },
          { role: "user", parts: [{ functionResponse: { name: name!, response: functionResponse } }] },
        );
        continue;
      }

      // No function call — Gemini returned text
      const text = candidate.content.parts.map((p) => p.text).filter(Boolean).join("");
      const tokenUsage: TokenUsage = {
        inputTokens: totalInputTokens,
        outputTokens: totalOutputTokens,
        totalTokens: totalInputTokens + totalOutputTokens,
        estimatedCostUSD: calculateCost(totalInputTokens, totalOutputTokens),
      };

      let finalText = repairTextArtifacts(sanitizeModelExportText(text));
      const exportArtifact = await maybeGenerateChatExport({
        userMessage,
        functionName: lastFnName,
        functionResult: lastFnResult,
        executionContext: executionContext || { tenantId },
      }).catch((error) => {
        console.error("[Agent] Export generation error:", error);
        return null;
      });

      if (exportArtifact?.url) {
        finalText += `\n\n📎 **Relatório pronto:** [Baixar ${exportArtifact.fileName}](${exportArtifact.url})`;
      }

      if (finalText && finalText.trim().length > 0) {
        recordSuccess();
        return { text: finalText, tokenUsage, suggestions: getRepairedSuggestions(lastFnName) };
      }
      recordSuccess();
      return {
        text: finalText || "Nao consegui gerar resposta. Reformule a pergunta.",
        tokenUsage,
        suggestions: getRepairedSuggestions(lastFnName),
      };
    }

    // Should never reach here, but safety fallback
    recordSuccess();
    const tokenUsage: TokenUsage = { inputTokens: totalInputTokens, outputTokens: totalOutputTokens, totalTokens: totalInputTokens + totalOutputTokens, estimatedCostUSD: calculateCost(totalInputTokens, totalOutputTokens) };
    return { text: "Nao consegui gerar resposta. Reformule a pergunta.", tokenUsage };
  } catch (error) {
    recordFailure();
    console.error("[Agent] Fatal:", error);
    const tokenUsage: TokenUsage = { inputTokens: totalInputTokens, outputTokens: totalOutputTokens, totalTokens: totalInputTokens + totalOutputTokens, estimatedCostUSD: calculateCost(totalInputTokens, totalOutputTokens) };
    if (error instanceof Error && error.message.includes("Servico temporariamente")) return { text: (error as Error).message, tokenUsage };
    if (error instanceof Error && error.message.includes("429")) return { text: "Servico sobrecarregado. Tente em segundos.", tokenUsage };
    return { text: "Erro ao processar. Tente novamente.", tokenUsage };
  }
}

// ── Streaming Agent ─────────────────────────────────────
export async function* processMessageStream(
  userMessage: string,
  conversationHistory: ChatMessage[],
  tenantId?: string,
  promptAugmentation: PromptAugmentation = {},
  executionContext?: AgentExecutionContext,
) {
  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  const exportRequested = parseRequestedExportFormat(userMessage) !== null;

  try {
    checkCircuitBreaker();

    const history = buildHistory(conversationHistory);
    let systemPrompt = await buildSystemPrompt(tenantId);

    // Injetar Pre-Context (Resumo rápido)
    if (tenantId) {
      const summary = await DataContextService.getQuickSummary(tenantId);
      const summaryText = DataContextService.formatSummaryForPrompt(summary);
      systemPrompt = `${systemPrompt}\n\n${summaryText}`;
    }

    if (promptAugmentation.extraSystemContext?.trim()) {
      systemPrompt = `${systemPrompt}\n\n${promptAugmentation.extraSystemContext.trim()}`;
    }

    // Use generateContent (non-streaming) instead of generateContentStream.
    // The @google/genai SDK's streaming parser corrupts multi-byte UTF-8
    // characters (Portuguese accents á,é,ã,ç) into U+FFFD replacement chars.
    // Non-streaming parses the full JSON response at once, avoiding this bug.
    const result = await callWithRetry(
      () => genai.models.generateContent({
        model: GEMINI_MODEL,
        contents: [...history, { role: "user", parts: [{ text: userMessage }] }],
        config: { systemInstruction: systemPrompt, tools: [{ functionDeclarations }], temperature: 0.3, maxOutputTokens: 8192 },
      }),
      "AgentStream"
    );

    if (result.usageMetadata) {
      totalInputTokens += result.usageMetadata.promptTokenCount || 0;
      totalOutputTokens += result.usageMetadata.candidatesTokenCount || 0;
    }

    let functionCall: { name: string; args: any } | null = null;
    let firstPassText = "";

    const candidate = result.candidates?.[0];
    if (candidate?.content?.parts) {
      for (const part of candidate.content.parts) {
        if (part.text) {
          firstPassText += part.text;
        } else if (part.functionCall) {
          functionCall = { name: part.functionCall.name as string, args: part.functionCall.args };
        }
      }
    }

    // Emit repaired text from first pass (if no function call was made)
    if (firstPassText && !functionCall) {
      yield { type: "text", content: repairTextArtifacts(firstPassText) };
    }

    if (functionCall) {
      const { name, args } = functionCall;
      console.log("[AgentStream] Fn:", name, JSON.stringify(args || {}));

      // Se for suggestAction, emitir evento especial e NÃO chamar o modelo de volta (é uma folha)
      if (name === "suggestAction") {
        yield { type: "action", content: args };
        return;
      }

      let fnResult: unknown;
      try {
        if (name === "executeSQLQuery" && args?.sql) {
          fnResult = await executeAdHocSQL(args.sql as string, tenantId);
        } else if (name === "explainAnomaly" && tenantId) {
          fnResult = await AnomalyExplainerService.explain(tenantId);
        } else if (name === "enhancedForecast") {
          fnResult = await ForecasterService.enhancedForecast({ ...args, _tenant_id: tenantId } as QueryParams);
        } else if (name === "goalProbability") {
          fnResult = await ForecasterService.goalProbability({ ...args, _tenant_id: tenantId } as any);
        } else if (name === "productDemandRate") {
          fnResult = await ForecasterService.productDemandRate({ ...args, _tenant_id: tenantId } as any);
        } else if (name === "forecastComparison") {
          fnResult = await ForecasterService.forecastComparison({ ...args, _tenant_id: tenantId } as QueryParams);
        } else if (name === "runWhatIfScenario") {
          fnResult = await ForecasterService.runWhatIfScenario({ ...args, _tenant_id: tenantId } as any);
        } else if (name === "query_optimus_data") {
          fnResult = await runOptimusQuery(args as Record<string, unknown> | undefined, tenantId);
        } else if (name && (queryFunctions as any)[name]) {
          fnResult = await (queryFunctions as any)[name]({ ...args, _tenant_id: tenantId } as QueryParams);
        } else {
          fnResult = { error: "Funcao nao encontrada: " + name };
        }
      } catch (e) {
        fnResult = { error: (e instanceof Error ? e.message : "erro") };
      }

      const functionResponse = toFunctionResponsePayload(fnResult);

      // Use generateContent (non-streaming) for the final response instead of
      // generateContentStream. The @google/genai SDK's streaming parser corrupts
      // multi-byte UTF-8 characters (Portuguese accents á,é,ã,ç,etc.) into U+FFFD.
      // The non-streaming API does not have this bug since it parses the full JSON
      // response at once without byte-level chunking.
      const finalResult = await callWithRetry(
        () => genai.models.generateContent({
          model: GEMINI_MODEL,
          contents: [
            ...history,
            { role: "user", parts: [{ text: userMessage }] },
            { role: "model", parts: [{ functionCall: { name: name!, args: args || {} } }] },
            { role: "user", parts: [{ functionResponse: { name: name!, response: functionResponse } }] },
          ],
          config: { systemInstruction: systemPrompt, temperature: 0.3, maxOutputTokens: 8192 },
        }),
        "AgentStream"
      );

      if (finalResult.usageMetadata) {
        totalInputTokens += finalResult.usageMetadata.promptTokenCount || 0;
        totalOutputTokens += finalResult.usageMetadata.candidatesTokenCount || 0;
      }

      const bufferedFinalText = finalResult.candidates?.[0]?.content?.parts
        ?.map((p: any) => p.text)
        .filter(Boolean)
        .join("") || "";

      const exportArtifact = await maybeGenerateChatExport({
        userMessage,
        functionName: name,
        functionResult: fnResult,
        executionContext: executionContext || { tenantId },
      }).catch((error) => {
        console.error("[AgentStream] Export generation error:", error);
        return null;
      });

      let finalText = exportRequested
        ? repairTextArtifacts(sanitizeModelExportText(bufferedFinalText))
        : repairTextArtifacts(bufferedFinalText);

      if (exportArtifact?.url) {
        // Extra safety: strip any remaining model-invented export links before appending the real one
        finalText = finalText
          .split(/\r?\n/)
          .filter((line) => !/📎.*relat[oó]rio\s+pronto/i.test(line) && !/\[.*[Bb]aixar.*\]\(.*\)/i.test(line))
          .join("\n")
          .replace(/\n{3,}/g, "\n\n")
          .trimEnd();
        finalText += `\n\n📎 **Relatório pronto:** [Baixar ${exportArtifact.fileName}](${exportArtifact.url})`;
      }

      if (finalText.trim()) {
        yield { type: "text", content: finalText };
      }

      recordSuccess();
      yield {
        type: "done",
        tokenUsage: {
          inputTokens: totalInputTokens,
          outputTokens: totalOutputTokens,
          totalTokens: totalInputTokens + totalOutputTokens,
          estimatedCostUSD: calculateCost(totalInputTokens, totalOutputTokens)
        },
        suggestions: getRepairedSuggestions(name)
      };
    } else {
      // No function was called. If the user requested an export (PDF/XLSX/etc.)
      // the model just replied with text without fetching data → generate the
      // export from a default executiveSummary call so the user actually gets a file.
      if (exportRequested && executionContext?.tenantId) {
        try {
          const fallbackFn = "executiveSummary";
          const fallbackResult = await (queryFunctions as any)[fallbackFn]({ _tenant_id: executionContext.tenantId } as QueryParams);
          const exportArtifact = await maybeGenerateChatExport({
            userMessage,
            functionName: fallbackFn,
            functionResult: fallbackResult,
            executionContext,
          });
          if (exportArtifact?.url) {
            yield { type: "text", content: `\n\n📎 **Relatório pronto:** [Baixar ${exportArtifact.fileName}](${exportArtifact.url})` };
          }
        } catch (exportErr) {
          console.error("[AgentStream] Fallback export error:", exportErr);
        }
      }

      recordSuccess();
      yield {
        type: "done",
        tokenUsage: {
          inputTokens: totalInputTokens,
          outputTokens: totalOutputTokens,
          totalTokens: totalInputTokens + totalOutputTokens,
          estimatedCostUSD: calculateCost(totalInputTokens, totalOutputTokens)
        }
      };
    }
  } catch (error) {
    recordFailure();
    console.error("[AgentStream] Fatal:", error);
    const msg = error instanceof Error && error.message.includes("Servico temporariamente")
      ? error.message
      : "Erro ao processar mensagem.";
    yield { type: "error", content: msg };
  }
}




