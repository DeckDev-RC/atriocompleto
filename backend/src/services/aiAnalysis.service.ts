import { genai, GEMINI_MODEL } from "../config/gemini";
import { supabase, supabaseAdmin } from "../config/supabase";
import { redis } from "../config/redis";
import { queryFunctions, QueryParams, getDistinctValues } from "./query-functions";
import { sanitizeSQL } from "../utils/sql-sanitizer";
import { ChatMessage } from "../types";
import type { Content, FunctionDeclaration, Type } from "@google/genai";
import { DataContextService } from "./dataContext.service";

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
14. CONTEXTO DE CONVERSA: Quando o usuario faz perguntas de follow-up (ex: "E de cancelados?", "E no Shopee?", "E por marketplace?"):
    - Mantenha o MESMO periodo e contexto da pergunta anterior
    - Se a pergunta anterior foi sobre "janeiro, marco e abril", a proxima pergunta tambem se refere a esses meses
    - Se a pergunta anterior mostrou dados detalhados (mes a mes), a resposta tambem deve ser detalhada
    - NUNCA simplifique uma resposta de follow-up — mantenha o mesmo nivel de detalhe
15. NIVEL DE DETALHE: Quando o usuario pergunta sobre cancelados, nao retorne apenas a contagem. Retorne:
    - Quantidade de pedidos cancelados
    - Valor total perdido em cancelamentos
    - Se possivel, quebre por periodo (mes a mes) ou marketplace
    - Use cancellationRate ou salesByMonth com status "cancelled" para dados mais ricos
    - Compare com pedidos pagos para dar contexto (ex: "taxa de cancelamento de X%")

## Estilo
Profissional e direto. Use termos de negocio (faturamento, ticket medio, taxa de conversao, mix de canais, sazonalidade). Apresente dados de forma organizada e termine com um insight util.

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

REGRAS DE GRAFICOS:
1. SEMPRE inclua texto explicativo ALEM do grafico
2. Coloque o bloco chart DEPOIS do texto explicativo
3. Abrevie labels de meses: "Jan/25", "Fev/25", etc.
4. Use no maximo 1-2 graficos por resposta
5. Arredonde valores para inteiros nos graficos (legibilidade)
6. Para dados monetarios, use options.currency = true`;
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

function truncateForGemini(result: unknown): Record<string, unknown> {
  const str = JSON.stringify(result);
  if (str.length < 15000) return result as Record<string, unknown>;
  const obj = result as Record<string, unknown>;
  if (obj.data && Array.isArray(obj.data) && obj.data.length > 50) {
    return { ...obj, data: obj.data.slice(0, 50), _truncated: true, _total_rows: obj.data.length };
  }
  return result as Record<string, unknown>;
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
        const alertsList = r.alerts as Array<{ type: string; message: string }>;
        const hcSummary = r.summary as Record<string, unknown> | null;
        const icons: Record<string, string> = { danger: "🔴", warning: "⚠️", success: "🟢", info: "ℹ️" };
        const lines: string[] = ["## 🩺 Diagnóstico Rápido\n"];
        if (alertsList) {
          alertsList.forEach((a) => { lines.push(icons[a.type] + " " + a.message); lines.push(""); });
        }
        if (hcSummary) {
          lines.push("---");
          lines.push("📊 **Mês atual (" + (hcSummary.current_month as string) + "):** " +
            fBRL((hcSummary.revenue_so_far as number) || 0) + " em " +
            (hcSummary.days_passed as number) + " dias | " +
            fNum((hcSummary.orders_so_far as number) || 0) + " pedidos | Faltam " +
            (hcSummary.days_remaining as number) + " dias");
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
    "Me dá um resumo executivo completo",
    "Qual a previsão para o próximo mês?",
    "Evolução mês a mês?",
  ],
  executeSQLQuery: [
    "Resumo executivo?",
    "Vendas por marketplace?",
    "Evolução mês a mês?",
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
  tenantId?: string
): Promise<ProcessMessageResult> {
  let totalInputTokens = 0;
  let totalOutputTokens = 0;

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
        const truncated = truncateForGemini(fnResult);

        // Append function call + response to the conversation and continue loop
        contents.push(
          { role: "model", parts: [{ functionCall: { name: name!, args: args || {} } }] },
          { role: "user", parts: [{ functionResponse: { name: name!, response: truncated } }] },
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

      if (text && text.trim().length > 0) {
        recordSuccess();
        return { text, tokenUsage, suggestions: lastFnName ? SUGGESTIONS_MAP[lastFnName] : undefined };
      }
      recordSuccess();
      return {
        text: "Nao consegui gerar resposta. Reformule a pergunta.",
        tokenUsage,
        suggestions: lastFnName ? SUGGESTIONS_MAP[lastFnName] : undefined,
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
  tenantId?: string
) {
  let totalInputTokens = 0;
  let totalOutputTokens = 0;

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

    const result = await callWithRetry(
      () => genai.models.generateContentStream({
        model: GEMINI_MODEL,
        contents: [...history, { role: "user", parts: [{ text: userMessage }] }],
        config: { systemInstruction: systemPrompt, tools: [{ functionDeclarations }], temperature: 0.3, maxOutputTokens: 8192 },
      }),
      "AgentStream"
    );

    let functionCall: { name: string; args: any } | null = null;

    for await (const chunk of result) {
      if (chunk.usageMetadata) {
        totalInputTokens += chunk.usageMetadata.promptTokenCount || 0;
        totalOutputTokens += chunk.usageMetadata.candidatesTokenCount || 0;
      }

      const part = chunk.candidates?.[0]?.content?.parts?.[0];
      if (part?.text) {
        yield { type: "text", content: part.text };
      } else if (part?.functionCall) {
        functionCall = { name: part.functionCall.name as string, args: part.functionCall.args };
      }
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
        } else if (name && (queryFunctions as any)[name]) {
          fnResult = await (queryFunctions as any)[name]({ ...args, _tenant_id: tenantId } as QueryParams);
        } else {
          fnResult = { error: "Funcao nao encontrada: " + name };
        }
      } catch (e) {
        fnResult = { error: (e instanceof Error ? e.message : "erro") };
      }

      const truncated = truncateForGemini(fnResult);

      const finalResult = await callWithRetry(
        () => genai.models.generateContentStream({
          model: GEMINI_MODEL,
          contents: [
            ...history,
            { role: "user", parts: [{ text: userMessage }] },
            { role: "model", parts: [{ functionCall: { name: name!, args: args || {} } }] },
            { role: "user", parts: [{ functionResponse: { name: name!, response: truncated } }] },
          ],
          config: { systemInstruction: systemPrompt, temperature: 0.3, maxOutputTokens: 8192 },
        }),
        "AgentStream"
      );

      for await (const chunk of finalResult) {
        if (chunk.usageMetadata) {
          totalInputTokens += chunk.usageMetadata.promptTokenCount || 0;
          totalOutputTokens += chunk.usageMetadata.candidatesTokenCount || 0;
        }
        const text = chunk.candidates?.[0]?.content?.parts?.[0]?.text;
        if (text) yield { type: "text", content: text };
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
        suggestions: SUGGESTIONS_MAP[name]
      };
    } else {
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

