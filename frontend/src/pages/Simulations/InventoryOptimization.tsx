import React, { useState } from 'react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, ReferenceLine } from 'recharts';
import { ArrowLeft, Play, RefreshCw, AlertTriangle, Package, DollarSign, Activity, Bookmark, X, ArrowRight, Save } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

import { agentApi } from '../../services/agentApi';
import { useToast } from '../../components/Toast';
import { formatCurrency } from '../../utils/formatting';

// --- Interfaces ---
interface InventoryParams {
    averageDemand: number;
    demandStdDev: number;
    leadTimeDays: number;
    orderCost: number;
    holdingCostPercent: number;
    unitCost: number;
    shortageCost: number;
    serviceLevelTarget: number;
}

interface InventoryMetrics {
    eoq: number;
    safetyStock: number;
    reorderPoint: number;
    annualOrderingCost: number;
    annualHoldingCost: number;
    totalAnnualCost: number;
    inventoryTurnover: number;
    averageInventory: number;
    capitalTiedUp: number;
    serviceLevel?: number;
    shortageRate?: number;
    policyName?: string;
    orderFrequencyDays?: number;
}

interface SimulationResult {
    params: InventoryParams;
    baseline: InventoryMetrics;
    policies: InventoryMetrics[];
    chartData: any[];
    costDistribution: any[];
}

export default function InventoryOptimization() {
    const navigate = useNavigate();
    const [loading, setLoading] = useState(false);
    const [result, setResult] = useState<SimulationResult | null>(null);
    const [activeTab, setActiveTab] = useState('chart');
    const { showToast } = useToast();

    const [params, setParams] = useState<InventoryParams>({
        averageDemand: 1000,
        demandStdDev: 200,
        leadTimeDays: 7,
        orderCost: 150,
        holdingCostPercent: 0.20,
        unitCost: 50,
        shortageCost: 100,
        serviceLevelTarget: 0.95
    });

    // Save States
    const [showSaveModal, setShowSaveModal] = useState(false);
    const [scenarioName, setScenarioName] = useState('');
    const [saving, setSaving] = useState(false);
    const [savedScenarios, setSavedScenarios] = useState<any[]>([]);

    const fetchSavedScenarios = React.useCallback(async () => {
        try {
            const res = await agentApi.getSavedSimulations();
            if (res.success && res.data) {
                setSavedScenarios(res.data.filter((s: any) => s.scenario_data && s.scenario_data.averageDemand !== undefined));
            }
        } catch { /* log silent */ }
    }, []);

    React.useEffect(() => {
        fetchSavedScenarios();
    }, [fetchSavedScenarios]);

    const handleSaveScenario = async () => {
        if (!scenarioName.trim() || !result) return;
        setSaving(true);
        try {
            const res = await agentApi.saveSimulation({
                name: scenarioName,
                scenario_data: params,
                baseline_metrics: result.baseline,
                projected_metrics: result.policies as any,
                ai_analysis: null
            });
            if (res.success) {
                setShowSaveModal(false);
                setScenarioName('');
                fetchSavedScenarios();
                showToast('Cenário salvo com sucesso!', 'success');
            } else {
                showToast(res.error || 'Erro ao salvar cenário.', 'error');
            }
        } catch (err) {
            showToast('Erro de comunicação ao salvar.', 'error');
        }
        setSaving(false);
    };

    const loadScenario = (scen: any) => {
        setParams(scen.scenario_data);
        handleRunSimulation(scen.scenario_data);
    };

    const handleRunSimulation = async (overrideParams?: InventoryParams) => {
        const payloadParams = overrideParams || params;
        try {
            setLoading(true);
            const response = await agentApi.runInventorySimulation(payloadParams);
            if (response.success && response.data) {
                setResult(response.data);
                showToast('Simulação de estoque concluída!', 'success');
            } else {
                showToast(response.error || 'Erro ao executar simulação.', 'error');
            }
        } catch (error: any) {
            console.error('Erro na simulação:', error);
            showToast('Erro na comunicação com servidor.', 'error');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="flex-1 space-y-6 p-8 max-md:p-5 max-sm:p-4 bg-zinc-50/50 dark:bg-zinc-900 min-h-screen">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div className="flex items-center space-x-4">
                    <button onClick={() => navigate('/simulacoes')} className="p-2 bg-zinc-200 dark:bg-zinc-800 rounded-lg hover:bg-zinc-300 dark:hover:bg-zinc-700 transition">
                        <ArrowLeft className="h-5 w-5 text-zinc-600 dark:text-zinc-300" />
                    </button>
                    <div>
                        <h2 className="text-3xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100">Simulador de Estoque (What-If)</h2>
                        <p className="text-muted-foreground text-zinc-500">Otimize políticas de estoque, calcule EOQ e simule rupturas sob demanda incerta.</p>
                    </div>
                </div>
                <div className="flex items-center gap-3">
                    <button onClick={() => setShowSaveModal(true)} disabled={!result} className="flex items-center gap-2 px-4 py-2 rounded-xl text-[13px] font-medium text-white bg-blue-600 hover:bg-blue-700 transition-colors shadow-sm shadow-blue-900/20 disabled:opacity-50">
                        <Bookmark size={16} /> Salvar Cenário
                    </button>
                </div>
            </div>

            <div className="grid gap-6 md:grid-cols-12">

                {/* Inputs do Simulador */}
                <div className="md:col-span-4 border border-zinc-200 dark:border-zinc-800 rounded-xl shadow-sm bg-white dark:bg-zinc-900 overflow-hidden">
                    <div className="p-6 max-sm:p-4 border-b border-zinc-100 dark:border-zinc-800">
                        <h3 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100">Parâmetros do Produto</h3>
                        <p className="text-sm text-zinc-500">Configure os dados base para calcular o cenário.</p>
                    </div>
                    <div className="p-6 max-sm:p-4 space-y-6">

                        <div className="space-y-4">
                            <h4 className="font-semibold text-sm text-zinc-500 uppercase tracking-wider">Demanda & Operação</h4>
                            <div className="grid gap-3">
                                <div className="space-y-1">
                                    <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Demanda Média Mensal (unid)</label>
                                    <input type="number" className="w-full rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-3 py-2 text-sm text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-500" value={params.averageDemand} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setParams({ ...params, averageDemand: Number(e.target.value) })} />
                                </div>
                                <div className="space-y-1">
                                    <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Desvio Padrão da Demanda (Variabilidade)</label>
                                    <input type="number" className="w-full rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-3 py-2 text-sm text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-500" value={params.demandStdDev} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setParams({ ...params, demandStdDev: Number(e.target.value) })} />
                                </div>
                                <div className="space-y-1">
                                    <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Lead Time (Prazo do Fornecedor em Dias)</label>
                                    <input type="number" className="w-full rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-3 py-2 text-sm text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-500" value={params.leadTimeDays} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setParams({ ...params, leadTimeDays: Number(e.target.value) })} />
                                </div>
                            </div>
                        </div>

                        <div className="space-y-4">
                            <h4 className="font-semibold text-sm text-zinc-500 uppercase tracking-wider">Custos</h4>
                            <div className="grid gap-3">
                                <div className="space-y-1">
                                    <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Custo Unitário (R$)</label>
                                    <input type="number" className="w-full rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-3 py-2 text-sm text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-500" value={params.unitCost} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setParams({ ...params, unitCost: Number(e.target.value) })} />
                                </div>
                                <div className="space-y-1">
                                    <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Custo Fixo por Pedido (R$)</label>
                                    <input type="number" className="w-full rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-3 py-2 text-sm text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-500" value={params.orderCost} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setParams({ ...params, orderCost: Number(e.target.value) })} />
                                </div>
                                <div className="space-y-1">
                                    <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Custo de Retenção/Armazenagem (% ano)</label>
                                    <input type="number" className="w-full rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-3 py-2 text-sm text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-500" value={params.holdingCostPercent} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setParams({ ...params, holdingCostPercent: Number(e.target.value) })} />
                                </div>
                                <div className="space-y-1">
                                    <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Custo de Falta/Ruptura (Venda perdida R$)</label>
                                    <input type="number" className="w-full rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-3 py-2 text-sm text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-500" value={params.shortageCost} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setParams({ ...params, shortageCost: Number(e.target.value) })} />
                                </div>
                            </div>
                        </div>

                        <div className="space-y-4">
                            <div className="flex justify-between items-center">
                                <h4 className="font-semibold text-sm text-zinc-500 uppercase tracking-wider">Nível de Serviço Alvo</h4>
                                <span className="font-bold text-blue-600">{(params.serviceLevelTarget * 100).toFixed(0)}%</span>
                            </div>
                            <input
                                type="range"
                                className="w-full accent-blue-600"
                                value={params.serviceLevelTarget * 100}
                                min={50}
                                max={99.9}
                                step={0.1}
                                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setParams({ ...params, serviceLevelTarget: Number(e.target.value) / 100 })}
                            />
                            <p className="text-xs text-zinc-400">Exigir maior nível de serviço requer exponencialmente mais estoque de segurança.</p>
                        </div>

                        <button
                            className="w-full flex items-center justify-center py-3 px-4 rounded-lg text-white font-medium bg-zinc-900 transition-all duration-300 hover:scale-[1.02] hover:bg-zinc-800 disabled:opacity-50 disabled:scale-100"
                            onClick={() => handleRunSimulation()}
                            disabled={loading}
                        >
                            {loading ? <RefreshCw className="mr-2 h-5 w-5 animate-spin" /> : <Play className="mr-2 h-5 w-5" />}
                            Rodar Simulação Estocástica
                        </button>

                    </div>
                </div>

                {/* Saved Scenarios */}
                {savedScenarios.length > 0 && (
                    <div className="md:col-span-4 border border-zinc-200 dark:border-zinc-800 rounded-xl shadow-sm bg-white dark:bg-zinc-900 overflow-hidden">
                        <div className="p-6 max-sm:p-4 border-b border-zinc-100 dark:border-zinc-800 flex items-center gap-2">
                            <Bookmark size={16} className="text-zinc-500" />
                            <h3 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">Cenários Salvos</h3>
                        </div>
                        <div className="p-4 space-y-2">
                            {savedScenarios.map(scen => (
                                <div key={scen.id} className="group flex items-center justify-between p-3 rounded-lg hover:bg-zinc-50 dark:hover:bg-zinc-800 cursor-pointer border border-transparent hover:border-zinc-200 dark:hover:border-zinc-700 transition-all" onClick={() => loadScenario(scen)}>
                                    <div>
                                        <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">{scen.name}</p>
                                        <p className="text-xs text-zinc-500">{new Date(scen.created_at).toLocaleDateString()}</p>
                                    </div>
                                    <ArrowRight size={16} className="text-zinc-400 opacity-0 group-hover:opacity-100 transition-opacity" />
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* Área de Resultados */}
                <div className="md:col-span-8 flex flex-col space-y-6">
                    {!result && !loading && (
                        <div className="flex-1 flex flex-col items-center justify-center border-2 border-dashed border-zinc-200 dark:border-zinc-800 rounded-xl bg-zinc-50 dark:bg-zinc-900/50 p-12 text-center text-muted-foreground">
                            <Package className="h-16 w-16 mb-4 text-zinc-300 dark:text-zinc-700" />
                            <h3 className="text-xl font-medium text-zinc-900 dark:text-zinc-100 mb-2">Configure o cenário ao lado</h3>
                            <p className="max-w-md">Insira os parâmetros logísticos e de custos do produto e clique em "Rodar Simulação" para visualizar o Lot Sizing Otimizado e comparar políticas de estoque.</p>
                        </div>
                    )}

                    {loading && (
                        <div className="flex-1 flex items-center justify-center">
                            <div className="flex flex-col items-center">
                                <RefreshCw className="h-12 w-12 animate-spin text-primary mb-4" />
                                <p className="text-lg font-medium animate-pulse">Calculando Modelos Matemáticos...</p>
                            </div>
                        </div>
                    )}

                    {result && !loading && (
                        <div className="space-y-6">

                            {/* Key Metrics Otimizadas */}
                            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                                <div className="bg-linear-to-br from-indigo-500 to-purple-600 text-white border-0 shadow-md overflow-hidden relative rounded-xl flex flex-col p-6 max-sm:p-4">
                                    <div className="absolute top-0 right-0 p-4 opacity-10"><Package className="h-16 w-16" /></div>
                                    <p className="text-white/80 font-medium text-sm mb-1 z-10">Lote Econômico (EOQ)</p>
                                    <h3 className="text-3xl font-bold mb-2 z-10">{result.baseline.eoq} <span className="text-lg font-normal">un.</span></h3>
                                    <p className="text-sm text-white/90 z-10 mt-auto">Quantidade ideal por pedido a cada {result.baseline.orderFrequencyDays} dias</p>
                                </div>

                                <div className="bg-linear-to-br from-amber-500 to-orange-600 text-white border-none shadow-md overflow-hidden relative rounded-xl flex flex-col p-6 max-sm:p-4">
                                    <div className="absolute top-0 right-0 p-4 opacity-10"><AlertTriangle className="h-16 w-16" /></div>
                                    <p className="text-white/80 font-medium text-sm mb-1 z-10">Ponto de Reposição (ROP)</p>
                                    <h3 className="text-3xl font-bold mb-2 z-10">{result.baseline.reorderPoint} <span className="text-lg font-normal">un.</span></h3>
                                    <p className="text-sm text-white/90 z-10 mt-auto">Inclui {result.baseline.safetyStock} de Safety Stock</p>
                                </div>

                                <div className="bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 shadow-sm rounded-xl p-6 max-sm:p-4 flex flex-col">
                                    <p className="font-medium text-zinc-500 text-sm mb-1">Custo Total Anual</p>
                                    <h3 className="text-3xl font-bold text-zinc-900 dark:text-zinc-100 mb-2">{formatCurrency(result.baseline.totalAnnualCost)}</h3>
                                    <p className="text-sm text-zinc-500 flex items-center mt-auto">
                                        <DollarSign className="inline h-3 w-3 mr-1 text-zinc-400" />
                                        Capital Preso: {formatCurrency(result.baseline.capitalTiedUp)}
                                    </p>
                                </div>

                                <div className="bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 shadow-sm rounded-xl p-6 max-sm:p-4 flex flex-col">
                                    <p className="font-medium text-zinc-500 text-sm mb-1">Giro de Estoque</p>
                                    <h3 className="text-3xl font-bold text-emerald-600 dark:text-emerald-400 mb-2">{result.baseline.inventoryTurnover.toFixed(1)}x</h3>
                                    <p className="text-sm text-zinc-500 flex items-center mt-auto">
                                        <Activity className="inline h-3 w-3 mr-1 text-zinc-400" />
                                        Estoque Médio: {result.baseline.averageInventory} un.
                                    </p>
                                </div>
                            </div>

                            {/* Detalhes visuais */}
                            <div className="w-full">
                                <div className="flex border-b border-zinc-200 dark:border-zinc-800 mb-6">
                                    <button
                                        className={`flex-1 py-3 px-4 text-center border-b-2 font-medium transition-colors ${activeTab === 'chart' ? 'border-zinc-900 dark:border-zinc-100 text-zinc-900 dark:text-zinc-100' : 'border-transparent text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300'}`}
                                        onClick={() => setActiveTab('chart')}
                                    >
                                        Gráfico Dente de Serra (Simulação)
                                    </button>
                                    <button
                                        className={`flex-1 py-3 px-4 text-center border-b-2 font-medium transition-colors ${activeTab === 'policies' ? 'border-zinc-900 dark:border-zinc-100 text-zinc-900 dark:text-zinc-100' : 'border-transparent text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300'}`}
                                        onClick={() => setActiveTab('policies')}
                                    >
                                        Comparação Custo-Benefício vs Outras Políticas
                                    </button>
                                </div>

                                {activeTab === 'chart' && (
                                    <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl overflow-hidden shadow-sm">
                                        <div className="p-6 max-sm:p-4 border-b border-zinc-100 dark:border-zinc-800">
                                            <h3 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">Comportamento do Estoque (Cenário Otimizado EOQ)</h3>
                                            <p className="text-sm text-zinc-500">Simulação de 90 dias com demanda estocástica (variável).</p>
                                        </div>
                                        <div className="p-6 max-sm:p-4">
                                            <div className="h-[400px] w-full">
                                                <ResponsiveContainer width="100%" height="100%">
                                                    <AreaChart data={result.chartData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                                                        <defs>
                                                            <linearGradient id="colorStock" x1="0" y1="0" x2="0" y2="1">
                                                                <stop offset="5%" stopColor="#09CAFF" stopOpacity={0.3} />
                                                                <stop offset="95%" stopColor="#09CAFF" stopOpacity={0} />
                                                            </linearGradient>
                                                        </defs>
                                                        <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.2} />
                                                        <XAxis dataKey="day" tickLine={false} axisLine={false} tickMargin={10} minTickGap={20} />
                                                        <YAxis tickLine={false} axisLine={false} tickMargin={10} />
                                                        <RechartsTooltip
                                                            contentStyle={{ borderRadius: '8px', border: '1px solid #e2e8f0', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                                                            labelFormatter={(v) => `Dia ${v}`}
                                                        />
                                                        <ReferenceLine y={result.baseline.reorderPoint} stroke="#f59e0b" strokeDasharray="3 3" label={{ position: 'insideTopLeft', value: 'Ponto de Reposição', fill: '#f59e0b', fontSize: 12 }} />
                                                        <ReferenceLine y={result.baseline.safetyStock} stroke="#ef4444" strokeDasharray="3 3" label={{ position: 'insideTopLeft', value: 'Estoque de Segurança', fill: '#ef4444', fontSize: 12 }} />
                                                        <Area type="monotone" dataKey="estoque" stroke="#09CAFF" strokeWidth={3} fillOpacity={1} fill="url(#colorStock)" name="Nível de Estoque" />
                                                    </AreaChart>
                                                </ResponsiveContainer>
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {activeTab === 'policies' && (
                                    <div className="grid gap-4 md:grid-cols-3">
                                        {[result.baseline, ...result.policies].map((policy, idx) => (
                                            <div key={idx} className={`bg-white dark:bg-zinc-900 border ${idx === 0 ? 'border-blue-500 shadow-md ring-1 ring-blue-500' : 'border-zinc-200 dark:border-zinc-800 shadow-sm'} rounded-xl overflow-hidden`}>
                                                {idx === 0 && (
                                                    <div className="bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 text-xs font-bold uppercase tracking-wider text-center py-2 border-b border-blue-100 dark:border-blue-800/50">
                                                        Vencedor Matemático
                                                    </div>
                                                )}
                                                <div className="p-6 max-sm:p-4 border-b border-zinc-100 dark:border-zinc-800">
                                                    <h3 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">{policy.policyName}</h3>
                                                    <p className="text-sm text-zinc-500">Target Nível de Serviço: {(policy.serviceLevel! * 100).toFixed(1)}%</p>
                                                </div>
                                                <div className="p-6 max-sm:p-4 space-y-5">
                                                    <div>
                                                        <div className="flex justify-between text-sm mb-1.5">
                                                            <span className="text-zinc-500">Custo Total / Ano</span>
                                                            <span className="font-bold text-zinc-900 dark:text-zinc-100">{formatCurrency(policy.totalAnnualCost)}</span>
                                                        </div>
                                                        <div className="w-full bg-zinc-100 dark:bg-zinc-800 rounded-full h-2">
                                                            <div className={`h-2 rounded-full ${idx === 0 ? 'bg-blue-600' : 'bg-zinc-400'}`} style={{ width: `${(result.baseline.totalAnnualCost / policy.totalAnnualCost) * 100}%` }}></div>
                                                        </div>
                                                    </div>
                                                    <div className="space-y-3 pt-4 border-t border-dashed border-zinc-200 dark:border-zinc-700">
                                                        <div className="flex justify-between text-sm">
                                                            <span className="text-zinc-500">Pedir (Lote)</span>
                                                            <span className="font-medium text-zinc-900 dark:text-zinc-100">{policy.eoq} un.</span>
                                                        </div>
                                                        <div className="flex justify-between text-sm">
                                                            <span className="text-zinc-500">Ponto Reposição</span>
                                                            <span className="font-medium text-zinc-900 dark:text-zinc-100">{policy.reorderPoint} un.</span>
                                                        </div>
                                                        <div className="flex justify-between text-sm">
                                                            <span className="text-zinc-500">Capital Preso</span>
                                                            <span className="font-medium text-zinc-900 dark:text-zinc-100">{formatCurrency(policy.capitalTiedUp)}</span>
                                                        </div>
                                                        <div className="flex justify-between text-sm">
                                                            <span className="text-zinc-500">Frequência</span>
                                                            <span className="font-medium text-zinc-900 dark:text-zinc-100">a cada {policy.orderFrequencyDays} dias</span>
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>

                        </div>
                    )}
                </div>
            </div>

            {/* Save Modal */}
            {showSaveModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-in fade-in duration-200">
                    <div className="bg-white dark:bg-zinc-900 w-full max-w-sm rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-2xl p-6">
                        <div className="flex justify-between items-center mb-4">
                            <h3 className="text-lg font-bold text-zinc-900 dark:text-zinc-100">Salvar Simulação</h3>
                            <button onClick={() => setShowSaveModal(false)} className="text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100"><X size={18} /></button>
                        </div>
                        <p className="text-sm text-zinc-500 mb-4">Dê um nome para este cenário de estoque para compará-lo depois.</p>

                        <input
                            type="text"
                            placeholder="Ex: Demanda Alta Fim de Ano"
                            value={scenarioName}
                            onChange={e => setScenarioName(e.target.value)}
                            className="w-full bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl px-4 py-2.5 text-sm text-zinc-900 dark:text-zinc-100 focus:outline-none focus:border-blue-500 mb-5"
                            autoFocus
                        />

                        <div className="flex justify-end gap-3">
                            <button onClick={() => setShowSaveModal(false)} className="px-4 py-2 rounded-xl text-sm font-semibold text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors">Cancelar</button>
                            <button
                                onClick={handleSaveScenario}
                                disabled={!scenarioName || saving}
                                className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 transition-colors shadow-none disabled:opacity-50"
                            >
                                {saving ? <RefreshCw size={16} className="animate-spin" /> : <Save size={16} />}
                                {saving ? 'Salvando...' : 'Salvar Cenário'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
