import { supabase } from "../config/supabase";
import { genai, GEMINI_MODEL } from "../config/gemini";

// --- Types ---
export interface InventoryParams {
    averageDemand: number;       // Demanda média mensal (unidades)
    demandStdDev: number;        // Desvio padrão da demanda mensal
    leadTimeDays: number;        // Tempo entre pedido e entrega (dias)
    orderCost: number;           // Custo de fazer um pedido (R$)
    holdingCostPercent: number;  // Custo de manter item em estoque (% ao ano)
    unitCost: number;            // Custo unitário do produto (R$)
    shortageCost: number;        // Custo de falta por unidade (R$) - venda perdida
    serviceLevelTarget: number;  // Nível de serviço desejado (ex: 0.95 para 95%)
    daysInYear?: number;         // Assumido 365
}

export interface InventoryMetrics {
    eoq: number;                 // Economic Order Quantity
    safetyStock: number;         // Estoque de segurança
    reorderPoint: number;        // Ponto de ressuprimento
    annualOrderingCost: number;  // Custo anual de pedidos
    annualHoldingCost: number;   // Custo anual de armazenagem
    totalAnnualCost: number;     // Custo total anual
    inventoryTurnover: number;   // Giro de estoque (vezes/ano)
    averageInventory: number;    // Estoque médio
    capitalTiedUp: number;       // Capital imobilizado
    // metrics for policies
    serviceLevel?: number;
    shortageRate?: number;
    policyName?: string;
    orderFrequencyDays?: number; // Frequencia de pedidos em dias
}

export interface SimulationResult {
    params: InventoryParams;
    baseline: InventoryMetrics;
    policies: InventoryMetrics[];
    chartData: any[]; // Dados para o dente de serra
    costDistribution: any[]; // Histograma de custos
}

// Valores de Z para distribuição normal
const getZScore = (serviceLevel: number): number => {
    // Simplificação: tabela mapeada de Z-scores comuns
    // Para 90% = 1.28, 95% = 1.645, 98% = 2.05, 99% = 2.33
    if (serviceLevel >= 0.99) return 2.33;
    if (serviceLevel >= 0.98) return 2.05;
    if (serviceLevel >= 0.95) return 1.645;
    if (serviceLevel >= 0.90) return 1.28;
    if (serviceLevel >= 0.85) return 1.04;
    if (serviceLevel >= 0.80) return 0.84;
    return 0.5; // Default fallback
};

export const runInventorySimulation = async (params: InventoryParams, tenantId: string): Promise<SimulationResult> => {
    const {
        averageDemand, demandStdDev, leadTimeDays, orderCost,
        holdingCostPercent, unitCost, shortageCost, serviceLevelTarget,
    } = params;

    const daysInYear = params.daysInYear || 365;
    const annualDemand = averageDemand * 12;
    const unitHoldingCostYear = unitCost * (holdingCostPercent / 100);

    // 1. Cálculo EOQ Clássico (Lote Econômico)
    const eoq = Math.sqrt((2 * annualDemand * orderCost) / unitHoldingCostYear);

    // 2. Safety Stock (Estoque de Segurança)
    const zScore = getZScore(serviceLevelTarget);
    // StdDev during lead time: stdDev mensais * sqrt(leadTime em meses)
    const leadTimeMonths = leadTimeDays / 30;
    const stdDevLeadTime = demandStdDev * Math.sqrt(leadTimeMonths);
    const safetyStock = zScore * stdDevLeadTime;

    // 3. Reorder Point (Ponto de Pedido)
    const leadTimeDemand = averageDemand * leadTimeMonths;
    const reorderPoint = leadTimeDemand + safetyStock;

    // 4. Custos Base
    const numOrdersYear = annualDemand / eoq;
    const annualOrderingCost = numOrdersYear * orderCost;
    const averageInventory = (eoq / 2) + safetyStock;
    const annualHoldingCost = averageInventory * unitHoldingCostYear;
    const totalAnnualCost = annualOrderingCost + annualHoldingCost;

    const inventoryTurnover = annualDemand / averageInventory;
    const capitalTiedUp = averageInventory * unitCost;

    const baseline: InventoryMetrics = {
        eoq: Math.round(eoq),
        safetyStock: Math.round(safetyStock),
        reorderPoint: Math.round(reorderPoint),
        annualOrderingCost,
        annualHoldingCost,
        totalAnnualCost,
        inventoryTurnover,
        averageInventory: Math.round(averageInventory),
        capitalTiedUp,
        policyName: "Otimizada (EOQ + SS)",
        serviceLevel: serviceLevelTarget,
        orderFrequencyDays: Math.round(365 / numOrdersYear)
    };

    // 5. Comparação com Outras Políticas (Simples)

    // Política A: Just-in-Time (Baixo Estoque de Segurança, Pedidos Menores e Mais Frequentes)
    const jitSafetyStock = safetyStock * 0.2; // 80% menos SS
    const jitOrderQty = eoq * 0.5; // Lotes menores
    const jitAvgInv = (jitOrderQty / 2) + jitSafetyStock;
    const jitHolding = jitAvgInv * unitHoldingCostYear;
    const jitOrdering = (annualDemand / jitOrderQty) * orderCost;
    // Penalidade de falta
    const jitShortageRisk = 0.15; // 15% de chance de ruptura
    const jitShortageCost = (annualDemand * jitShortageRisk) * shortageCost;

    const policyA: InventoryMetrics = {
        ...baseline,
        policyName: "Just-in-Time (Baixo Estoque)",
        eoq: Math.round(jitOrderQty),
        safetyStock: Math.round(jitSafetyStock),
        reorderPoint: Math.round(leadTimeDemand + jitSafetyStock),
        annualOrderingCost: jitOrdering,
        annualHoldingCost: jitHolding,
        totalAnnualCost: jitOrdering + jitHolding + jitShortageCost,
        averageInventory: Math.round(jitAvgInv),
        capitalTiedUp: jitAvgInv * unitCost,
        serviceLevel: 0.85,
        orderFrequencyDays: Math.round(365 / (annualDemand / jitOrderQty))
    };

    // Política B: Estoque Alto / Risco Zero
    const highSafetyStock = safetyStock * 2;
    const highOrderQty = eoq * 1.5;
    const highAvgInv = (highOrderQty / 2) + highSafetyStock;
    const highHolding = highAvgInv * unitHoldingCostYear;
    const highOrdering = (annualDemand / highOrderQty) * orderCost;

    const policyB: InventoryMetrics = {
        ...baseline,
        policyName: "Conservadora (Alto Volume)",
        eoq: Math.round(highOrderQty),
        safetyStock: Math.round(highSafetyStock),
        reorderPoint: Math.round(leadTimeDemand + highSafetyStock),
        annualOrderingCost: highOrdering,
        annualHoldingCost: highHolding,
        totalAnnualCost: highOrdering + highHolding, // Assumindo R$0 de falta
        averageInventory: Math.round(highAvgInv),
        capitalTiedUp: highAvgInv * unitCost,
        serviceLevel: 0.999,
        orderFrequencyDays: Math.round(365 / (annualDemand / highOrderQty))
    };

    // 6. Gerar dados do gráfico (Dente de Serra) para Política Base
    // Simular 90 dias
    const chartData = [];
    let currentStock = reorderPoint + eoq;
    let orderPending = false;
    let daysSinceOrder = 0;
    const dailyDemand = averageDemand / 30;

    for (let day = 1; day <= 90; day++) {
        // Adicionar variabilidade aleatória (ruído)
        const randomDemand = Math.max(0, dailyDemand + (Math.random() * (demandStdDev / 30) * 2 - (demandStdDev / 30)));
        currentStock -= randomDemand;

        if (currentStock <= reorderPoint && !orderPending) {
            orderPending = true;
            daysSinceOrder = 0;
        }

        if (orderPending) {
            daysSinceOrder++;
            if (daysSinceOrder >= leadTimeDays) {
                currentStock += eoq;
                orderPending = false;
            }
        }

        chartData.push({
            day,
            estoque: Math.max(0, Math.round(currentStock)),
            reorderPoint: Math.round(reorderPoint),
            safetyStock: Math.round(safetyStock),
            rupura: currentStock < 0 ? 1 : 0
        });
    }

    // 7. Salvar simulação no banco
    const scenarioData = {
        type: "inventory_optimization",
        params
    };

    const { data: savedSimulation, error } = await supabase
        .from('simulations')
        .insert({
            tenant_id: tenantId,
            name: `Simulação de Estoque ${new Date().toLocaleDateString()}`,
            scenario_data: scenarioData,
            baseline_metrics: baseline,
            projected_metrics: { policies: [policyA, policyB] }
        })
        .select('id')
        .single();

    if (error) {
        console.error("Error saving inventory simulation:", error);
    }

    // Gerar analise com AI background (assincrono)
    if (savedSimulation?.id) {
        generateAndSaveAiAnalysis(savedSimulation.id, { params, baseline, policies: [policyA, policyB] });
    }

    return {
        params,
        baseline,
        policies: [policyA, policyB],
        chartData,
        costDistribution: [
            { name: 'Otimizada', value: totalAnnualCost },
            { name: 'Just-in-Time', value: policyA.totalAnnualCost },
            { name: 'Conservadora', value: policyB.totalAnnualCost }
        ]
    };
};

// Fire and forget
async function generateAndSaveAiAnalysis(simulationId: string, data: any) {
    try {
        const prompt = `
    Analise o resultado desta simulação de otimização de estoque.
    
    Cenário: Lote Econômico (EOQ) e Políticas de Estoque de Segurança.
    
    Parâmetros Inseridos:
    ${JSON.stringify(data.params, null, 2)}
    
    Métricas de Base (Modelo Otimizado - EOQ):
    ${JSON.stringify(data.baseline, null, 2)}
    
    Outras Políticas (Alternativas):
    ${JSON.stringify(data.policies, null, 2)}
    
    Gere um relatório sucinto em formato JSON válido, contendo:
    {
      "executive_summary": "Resumo em uma frase do resultado principal",
      "findings": ["3 a 4 descobertas analíticas curtas sobre trade-offs (ex: o custo de ruptura na politica JIT vs Custo de armazegam na conservadora)"],
      "recommendations": ["2 direcionamentos acionáveis para gestão de estoque"],
      "risk_analysis": "Análise de quais parâmetros são mais sensíveis a erros de previsão nesta modelagem."
    }
    `;

        const response = await genai.models.generateContent({
            model: GEMINI_MODEL,
            contents: prompt,
            config: {
                responseMimeType: "application/json",
            }
        });

        const responseText = response.text;
        if (!responseText) throw new Error("Empty response from Gemini");

        let analysisJson;
        try {
            analysisJson = JSON.parse(responseText.replace(/```json|```/g, '').trim());
        } catch (e) {
            console.error("Failed to parse Gemini inventory analysis", e);
            analysisJson = { error: "Failed to parse AI response" };
        }

        await supabase
            .from('simulations')
            .update({ ai_analysis: analysisJson })
            .eq('id', simulationId);

    } catch (err) {
        console.error("Error in background AI analysis for inventory", err);
    }
}
