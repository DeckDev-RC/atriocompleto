import { useState, useEffect, useMemo, useCallback } from 'react';
import {
    Calculator,
    TrendingUp,
    TrendingDown,
    DollarSign,
    ShoppingCart,
    Activity,
    Save,
    RefreshCw,
    Sparkles,
    AlertTriangle,
    ArrowRight,
    Settings2,
    X,
    Target,
    Zap,
    Bookmark
} from 'lucide-react';
import { agentApi } from '../../services/agentApi';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, Cell } from 'recharts';
import { useNavigate } from 'react-router-dom';


interface SimulationState {
    priceAdj: number;       // %
    marketingAdj: number;   // R$
    conversionAdj: number;  // % (absolute points)
    variableCost: number;   // %
    fixedCost: number;      // R$
}

export default function WhatIfAnalysis() {
    const navigate = useNavigate();
    const [baseline, setBaseline] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // Simulation Controls
    const [sim, setSim] = useState<SimulationState>({
        priceAdj: 0,
        marketingAdj: 0,
        conversionAdj: 0,
        variableCost: 30, // Default assume 30% variable cost (COGS, taxes, shipping)
        fixedCost: 5000,  // Default R$ 5k fixed
    });

    // AI & Save States
    const [analysis, setAnalysis] = useState<any>(null);
    const [analyzing, setAnalyzing] = useState(false);
    const [saving, setSaving] = useState(false);
    const [showSaveModal, setShowSaveModal] = useState(false);
    const [scenarioName, setScenarioName] = useState('');

    // Custom Saved Scenarios
    const [savedScenarios, setSavedScenarios] = useState<any[]>([]);

    const fetchBaseline = useCallback(async () => {
        setLoading(true);
        try {
            const res = await agentApi.getSimulationBaseline();
            if (res.success && res.data) {
                setBaseline(res.data);
            } else {
                setError(res.error || 'Erro ao carregar métricas base.');
            }
        } catch (err: any) {
            setError('Falha de conexão ao carregar baseline.');
        }
        setLoading(false);
    }, []);

    const fetchSavedScenarios = useCallback(async () => {
        try {
            const res = await agentApi.getSavedSimulations();
            if (res.success && res.data) {
                setSavedScenarios(res.data.filter((s: any) => s.scenario_data && s.scenario_data.priceAdj !== undefined));
            }
        } catch { /* log silent */ }
    }, []);

    useEffect(() => {
        fetchBaseline();
        fetchSavedScenarios();
    }, [fetchBaseline, fetchSavedScenarios]);

    // Math Model -> Project Metrics
    const projected = useMemo(() => {
        if (!baseline) return null;

        // 1. Traffic calculation: R$ 1 of marketing buys roughly 2 sessions (R$ 0.50 CPC avg assumption)
        // Decreasing marginal returns applies, but kept linear for simplicity here
        const additionalSessions = sim.marketingAdj * 2;
        const projSessions = baseline.sessions + additionalSessions;

        // 2. Conversion: baseline % + adj %
        const projConversion = Math.max(0, baseline.conversion_rate + sim.conversionAdj);

        // 3. Orders: sessions * conversion 
        const projOrders = Math.round(projSessions * (projConversion / 100));

        // 4. Price Elasticity: Price increase usually drops conversion, but we let the user adjust both manually for flexibility.
        const projAvgTicket = baseline.avg_ticket * (1 + (sim.priceAdj / 100));

        // 5. Revenue
        const projRevenue = projOrders * projAvgTicket;

        // 6. Gross Profit = Revenue - (Revenue * VariableCost%) - FixedCosts
        const projGrossProfit = projRevenue - (projRevenue * (sim.variableCost / 100)) - sim.fixedCost;

        return {
            revenue: projRevenue,
            orders: projOrders,
            avg_ticket: projAvgTicket,
            sessions: projSessions,
            conversion_rate: projConversion,
            gross_profit: projGrossProfit,
        };
    }, [baseline, sim]);

    const handleGenerateAnalysis = async () => {
        if (!baseline || !projected) return;
        setAnalyzing(true);
        setAnalysis(null);
        try {
            const res = await agentApi.generateSimulationAnalysis({
                scenario_data: sim,
                baseline,
                projected
            });
            if (res.success && res.data) {
                setAnalysis(res.data);
            }
        } catch (err) {
            console.error(err);
        }
        setAnalyzing(false);
    };

    const handleSaveScenario = async () => {
        if (!scenarioName.trim() || !baseline || !projected) return;
        setSaving(true);
        try {
            const res = await agentApi.saveSimulation({
                name: scenarioName,
                scenario_data: sim,
                baseline_metrics: baseline,
                projected_metrics: projected,
                ai_analysis: analysis
            });
            if (res.success) {
                setShowSaveModal(false);
                setScenarioName('');
                fetchSavedScenarios();
            }
        } catch (err) {
            console.error(err);
        }
        setSaving(false);
    };

    const loadScenario = (s: any) => {
        setSim(s.scenario_data);
        setAnalysis(s.ai_analysis);
    };

    const resetSimulation = () => {
        setSim({ priceAdj: 0, marketingAdj: 0, conversionAdj: 0, variableCost: 30, fixedCost: 5000 });
        setAnalysis(null);
    };

    const fmtCurrency = (n: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(n);
    const fmtNum = (n: number) => new Intl.NumberFormat('pt-BR').format(n);

    if (loading) {
        return (
            <div className="flex flex-col items-center justify-center py-20">
                <RefreshCw size={24} className="animate-spin text-muted mb-3" />
                <p className="text-[13px] text-muted">Acessando base de dados para simulação...</p>
            </div>
        );
    }

    if (error || !baseline || !projected) {
        return (
            <div className="flex flex-col flex-1 items-center justify-center text-center p-8">
                <AlertTriangle size={32} className="text-red-400 mb-4" />
                <p className="text-[14px] text-primary mb-2 font-medium">Não foi possível carregar a base.</p>
                <p className="text-[12px] text-muted max-w-sm">{error || "Verifique as configurações."}</p>
                <button onClick={fetchBaseline} className="mt-4 px-4 py-2 bg-secondary rounded-lg text-[13px] text-primary hover:bg-border transition-colors">Tentar novamente</button>
            </div>
        );
    }

    // Calculate Deltas
    const revDelta = projected.revenue - baseline.revenue;
    const revPct = baseline.revenue > 0 ? (revDelta / baseline.revenue) * 100 : 0;

    const ordDelta = projected.orders - baseline.orders;
    const ordPct = baseline.orders > 0 ? (ordDelta / baseline.orders) * 100 : 0;

    // Chart Data
    const chartData = [
        { name: 'Atual', Receita: baseline.revenue, fill: '#3b82f6' }, // Blue
        { name: 'Projetado', Receita: projected.revenue, fill: revDelta >= 0 ? '#10b981' : '#ef4444' } // Green or Red
    ];

    return (
        <div className="flex flex-col h-full max-w-[1400px] w-full mx-auto px-4 py-6 md:px-8 space-y-6">

            {/* Header */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <h1 className="text-[20px] font-bold text-primary flex items-center gap-2">
                        <Calculator className="text-blue-500" size={24} />
                        Simulador de Cenários (What-If)
                    </h1>
                    <p className="text-[13px] text-muted mt-1">Ajuste os controles para projetar o impacto no próximo mês.</p>
                </div>
                <div className="flex items-center gap-3">
                    <button onClick={() => navigate('/simulacoes/inventory')} className="flex items-center gap-2 px-4 py-2 rounded-xl text-[13px] font-medium text-white bg-indigo-600 hover:bg-indigo-700 transition-colors shadow-sm shadow-indigo-900/20">
                        <ShoppingCart size={16} /> Estoque
                    </button>
                    <button onClick={resetSimulation} className="px-4 py-2 rounded-xl text-[13px] font-medium text-muted hover:text-primarybg-secondary hover:bg-border transition-colors">
                        Resetar
                    </button>
                    <button onClick={() => setShowSaveModal(true)} className="flex items-center gap-2 px-4 py-2 rounded-xl text-[13px] font-medium text-white bg-blue-600 hover:bg-blue-700 transition-colors shadow-sm shadow-blue-900/20">
                        <Bookmark size={16} /> Salvar Cenário
                    </button>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">

                {/* Left Column: Controls (4 cols) */}
                <div className="lg:col-span-4 space-y-6">
                    <div className="bg-card rounded-2xl border border-border/40 p-5 shadow-sm">
                        <h3 className="text-[14px] font-semibold text-primary mb-4 flex items-center gap-2">
                            <Settings2 size={16} className="text-indigo-400" /> Variáveis de Negócio
                        </h3>

                        <div className="space-y-5">
                            {/* Marketing Adjustment */}
                            <div>
                                <div className="flex justify-between items-center mb-1">
                                    <label className="text-[12px] font-medium text-secondary">Ajuste em Marketing</label>
                                    <span className="text-[12px] font-bold text-primary">{fmtCurrency(sim.marketingAdj)}</span>
                                </div>
                                <input
                                    type="range" min="-5000" max="25000" step="500"
                                    value={sim.marketingAdj}
                                    onChange={(e) => setSim(s => ({ ...s, marketingAdj: Number(e.target.value) }))}
                                    className="w-full accent-indigo-500"
                                />
                                <p className="text-[10px] text-muted mt-1">+ de tráfego projetado na loja</p>
                            </div>

                            {/* Price Adjustment */}
                            <div>
                                <div className="flex justify-between items-center mb-1">
                                    <label className="text-[12px] font-medium text-secondary">Ajuste de Preço</label>
                                    <span className={`text-[12px] font-bold ${sim.priceAdj > 0 ? "text-emerald-400" : sim.priceAdj < 0 ? "text-red-400" : "text-primary"}`}>
                                        {sim.priceAdj > 0 ? '+' : ''}{sim.priceAdj}%
                                    </span>
                                </div>
                                <input
                                    type="range" min="-30" max="30" step="1"
                                    value={sim.priceAdj}
                                    onChange={(e) => setSim(s => ({ ...s, priceAdj: Number(e.target.value) }))}
                                    className="w-full accent-indigo-500"
                                />
                                <p className="text-[10px] text-muted mt-1">Impacta direto no ticket médio</p>
                            </div>

                            {/* Conversion Limit */}
                            <div>
                                <div className="flex justify-between items-center mb-1">
                                    <label className="text-[12px] font-medium text-secondary">Ajuste de Conversão</label>
                                    <span className={`text-[12px] font-bold ${sim.conversionAdj > 0 ? "text-emerald-400" : sim.conversionAdj < 0 ? "text-red-400" : "text-primary"}`}>
                                        {sim.conversionAdj > 0 ? '+' : ''}{sim.conversionAdj.toFixed(1)}% p.p.
                                    </span>
                                </div>
                                <input
                                    type="range" min="-2" max="5" step="0.1"
                                    value={sim.conversionAdj}
                                    onChange={(e) => setSim(s => ({ ...s, conversionAdj: Number(e.target.value) }))}
                                    className="w-full accent-indigo-500"
                                />
                            </div>

                            <div className="h-px bg-border/40 my-4" />

                            {/* Financial Constants */}
                            <h4 className="text-[11px] font-bold text-muted uppercase tracking-wider mb-3">Custos Recorrentes</h4>

                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="text-[11px] font-medium text-secondary mb-1 block">Custos Fixos (R$)</label>
                                    <input
                                        type="number"
                                        value={sim.fixedCost}
                                        onChange={(e) => setSim(s => ({ ...s, fixedCost: Number(e.target.value) }))}
                                        className="w-full bg-secondary border border-border/50 rounded-lg px-3 py-1.5 text-[12px] text-primary focus:outline-none focus:border-indigo-500/50"
                                    />
                                </div>
                                <div>
                                    <label className="text-[11px] font-medium text-secondary mb-1 block">Custos Variáveis (%)</label>
                                    <input
                                        type="number"
                                        value={sim.variableCost}
                                        onChange={(e) => setSim(s => ({ ...s, variableCost: Number(e.target.value) }))}
                                        className="w-full bg-secondary border border-border/50 rounded-lg px-3 py-1.5 text-[12px] text-primary focus:outline-none focus:border-indigo-500/50"
                                    />
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Templates */}
                    <div className="bg-card rounded-2xl border border-border/40 p-4 shadow-sm">
                        <h3 className="text-[12px] font-semibold text-secondary mb-3">Templates Rápidos</h3>
                        <div className="flex flex-wrap gap-2">
                            <button onClick={() => setSim({ priceAdj: -15, marketingAdj: 10000, conversionAdj: 1.5, variableCost: 30, fixedCost: 5000 })} className="px-3 py-1.5 rounded-lg text-[11px] font-medium bg-purple-500/10 text-purple-400 hover:bg-purple-500/20 transition-colors border border-purple-500/20">🔥 Black Friday</button>
                            <button onClick={() => setSim({ priceAdj: 10, marketingAdj: -2000, conversionAdj: -0.2, variableCost: 30, fixedCost: 4000 })} className="px-3 py-1.5 rounded-lg text-[11px] font-medium bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 transition-colors border border-emerald-500/20">💰 Maximizar Margem</button>
                        </div>
                    </div>

                    {/* Saved Scenarios */}
                    {savedScenarios.length > 0 && (
                        <div className="bg-card rounded-2xl border border-border/40 p-4 shadow-sm">
                            <h3 className="text-[12px] font-semibold text-secondary mb-3 flex items-center gap-2">
                                <Bookmark size={14} /> Cenários Salvos
                            </h3>
                            <div className="space-y-2">
                                {savedScenarios.map(scen => (
                                    <div key={scen.id} className="group flex items-center justify-between p-2 rounded-lg hover:bg-secondary cursor-pointer border border-transparent hover:border-border/50 transition-all" onClick={() => loadScenario(scen)}>
                                        <div>
                                            <p className="text-[12px] font-medium text-primary">{scen.name}</p>
                                            <p className="text-[10px] text-muted">{new Date(scen.created_at).toLocaleDateString()}</p>
                                        </div>
                                        <ArrowRight size={14} className="text-muted opacity-0 group-hover:opacity-100 transition-opacity" />
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>

                {/* Right Column: Visualization & AI Insights (8 cols) */}
                <div className="lg:col-span-8 space-y-6">

                    {/* Main KPI Cards */}
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">

                        {/* Revenue */}
                        <div className="bg-card rounded-2xl border border-border/40 p-4 shadow-sm">
                            <div className="flex items-center gap-2 mb-3">
                                <div className="p-1.5 rounded-lg bg-blue-500/10 text-blue-500">
                                    <DollarSign size={16} />
                                </div>
                                <span className="text-[12px] font-semibold text-secondary">Faturamento</span>
                            </div>
                            <p className="text-[18px] font-bold text-primary mb-1">{fmtCurrency(projected.revenue)}</p>
                            <div className="flex items-center gap-2 text-[11px]">
                                <span className={`${revPct >= 0 ? "text-emerald-400" : "text-red-400"} font-bold flex items-center`}>
                                    {revPct >= 0 ? <TrendingUp size={12} className="mr-0.5" /> : <TrendingDown size={12} className="mr-0.5" />}
                                    {Math.abs(revPct).toFixed(1)}%
                                </span>
                                <span className="text-muted line-through">{fmtCurrency(baseline.revenue)}</span>
                            </div>
                        </div>

                        {/* Orders */}
                        <div className="bg-card rounded-2xl border border-border/40 p-4 shadow-sm">
                            <div className="flex items-center gap-2 mb-3">
                                <div className="p-1.5 rounded-lg bg-indigo-500/10 text-indigo-500">
                                    <ShoppingCart size={16} />
                                </div>
                                <span className="text-[12px] font-semibold text-secondary">Pedidos</span>
                            </div>
                            <p className="text-[18px] font-bold text-primary mb-1">{fmtNum(projected.orders)}</p>
                            <div className="flex items-center gap-2 text-[11px]">
                                <span className={`${ordPct >= 0 ? "text-emerald-400" : "text-red-400"} font-bold flex items-center`}>
                                    {ordPct >= 0 ? <TrendingUp size={12} className="mr-0.5" /> : <TrendingDown size={12} className="mr-0.5" />}
                                    {Math.abs(ordPct).toFixed(1)}%
                                </span>
                                <span className="text-muted line-through">{fmtNum(baseline.orders)}</span>
                            </div>
                        </div>

                        {/* Gross Profit */}
                        <div className="bg-card rounded-2xl border border-border/40 p-4 shadow-sm lg:col-span-2 relative overflow-hidden">
                            <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/5 blur-3xl translate-x-10 -translate-y-10 rounded-full" />
                            <div className="flex justify-between items-start mb-2">
                                <div className="flex items-center gap-2">
                                    <div className="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-500">
                                        <Activity size={16} />
                                    </div>
                                    <span className="text-[12px] font-semibold text-secondary">Lucro Bruto Projetado</span>
                                </div>
                            </div>
                            <div className="flex items-end gap-3 mt-2">
                                <p className={`text-[24px] font-bold ${projected.gross_profit >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                                    {fmtCurrency(projected.gross_profit)}
                                </p>
                            </div>
                            <p className="text-[10px] text-muted mt-2">Baseado no % de Custo Variável e Custo Fixo imputado.</p>
                        </div>

                    </div>

                    {/* Chart & AI Area */}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        {/* Chart */}
                        <div className="bg-card rounded-2xl border border-border/40 p-5 shadow-sm min-h-[300px] flex flex-col">
                            <h3 className="text-[13px] font-semibold text-primary mb-6">Comparação de Receita</h3>
                            <div className="flex-1 w-full relative -ml-4">
                                <ResponsiveContainer width="100%" height="100%">
                                    <BarChart data={chartData} margin={{ top: 10, right: 10, left: 10, bottom: 0 }}>
                                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--color-border)" opacity={0.4} />
                                        <XAxis dataKey="name" tick={{ fontSize: 11, fill: 'var(--color-muted)' }} axisLine={false} tickLine={false} />
                                        <YAxis
                                            tick={{ fontSize: 11, fill: 'var(--color-muted)' }}
                                            axisLine={false}
                                            tickLine={false}
                                            tickFormatter={(val) => `R$${(val / 1000).toFixed(0)}k`}
                                        />
                                        <RechartsTooltip
                                            cursor={{ fill: 'var(--color-secondary)' }}
                                            content={({ active, payload }) => {
                                                if (active && payload && payload.length) {
                                                    return (
                                                        <div className="bg-card border border-border/50 p-3 rounded-xl shadow-xl">
                                                            <p className="text-[11px] font-semibold text-muted mb-1">{payload[0].payload.name}</p>
                                                            <p className="text-[14px] font-bold text-primary">{fmtCurrency(Number(payload[0].value))}</p>
                                                        </div>
                                                    );
                                                }
                                                return null;
                                            }}
                                        />
                                        {/* Bar with dynamic fill */}
                                        <Bar
                                            dataKey="Receita"
                                            radius={[6, 6, 0, 0]}
                                            barSize={40}
                                        >
                                            {
                                                chartData.map((entry, index) => (
                                                    <Cell key={`cell-${index}`} fill={entry.fill} />
                                                ))
                                            }
                                        </Bar>
                                    </BarChart>
                                </ResponsiveContainer>
                            </div>
                        </div>

                        {/* AI Analysis Box */}
                        <div className="bg-card rounded-2xl border border-border/40 p-5 shadow-sm flex flex-col relative overflow-hidden">
                            <div className="flex justify-between items-start mb-4">
                                <h3 className="text-[13px] font-semibold text-primary flex items-center gap-2">
                                    <Sparkles size={16} className="text-purple-400" /> Consultoria IA
                                </h3>
                                <button
                                    onClick={handleGenerateAnalysis}
                                    disabled={analyzing}
                                    className="px-3 py-1.5 rounded-lg text-[11px] font-bold text-white bg-linear-to-r from-purple-600 to-indigo-600 hover:opacity-90 transition-opacity disabled:opacity-50 flex items-center gap-2"
                                >
                                    {analyzing ? <RefreshCw size={12} className="animate-spin" /> : <Zap size={12} />}
                                    {analyzing ? 'Analisando Cenário...' : 'Gerar Parecer'}
                                </button>
                            </div>

                            {analysis ? (
                                <div className="flex-1 space-y-4 overflow-y-auto pr-2 custom-scrollbar">
                                    {/* Viability & Summary */}
                                    <div className="p-3 rounded-xl bg-border/20">
                                        <div className="flex items-center gap-2 mb-2">
                                            <span className="text-[10px] uppercase font-bold px-2 py-0.5 rounded-full bg-white/5 text-primary">Score: {analysis.viability_score}/10</span>
                                            <span className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded-full ${analysis.risk_level === 'Alto' ? 'bg-red-500/10 text-red-500' : analysis.risk_level === 'Médio' ? 'bg-amber-500/10 text-amber-500' : 'bg-emerald-500/10 text-emerald-500'}`}>Risco {analysis.risk_level}</span>
                                        </div>
                                        <p className="text-[12px] text-secondary leading-relaxed">{analysis.summary}</p>
                                    </div>

                                    {/* Pros/Cons Grid */}
                                    <div className="grid grid-cols-2 gap-3">
                                        <div>
                                            <p className="text-[10px] font-bold text-emerald-400 uppercase tracking-wider mb-2">✅ Prós</p>
                                            <ul className="space-y-1">
                                                {analysis.pros.map((p: string, i: number) => <li key={i} className="text-[11px] text-muted leading-snug">• {p}</li>)}
                                            </ul>
                                        </div>
                                        <div>
                                            <p className="text-[10px] font-bold text-red-400 uppercase tracking-wider mb-2">⚠️ Contras</p>
                                            <ul className="space-y-1">
                                                {analysis.cons.map((c: string, i: number) => <li key={i} className="text-[11px] text-muted leading-snug">• {c}</li>)}
                                            </ul>
                                        </div>
                                    </div>

                                    {/* Operations */}
                                    {analysis.operational_impacts.length > 0 && (
                                        <div>
                                            <p className="text-[10px] font-bold text-blue-400 uppercase tracking-wider mb-2">📦 Impacto Operacional</p>
                                            <div className="space-y-1.5 p-2 rounded-lg border border-blue-500/10 bg-blue-500/5">
                                                {analysis.operational_impacts.map((o: string, i: number) => (
                                                    <p key={i} className="text-[11px] text-secondary">• {o}</p>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            ) : (
                                <div className="flex-1 flex flex-col items-center justify-center text-center px-4 py-8">
                                    <Target size={32} className="text-muted/30 mb-3" />
                                    <p className="text-[13px] font-medium text-secondary mb-1">Peça para a IA avaliar seu cenário</p>
                                    <p className="text-[11px] text-muted leading-relaxed">
                                        Descubra o quão agressivo ou conservador é o seu cenário, veja impactos logísticos ocultos e receba sugestões para maximizar lucros.
                                    </p>
                                </div>
                            )}
                        </div>

                    </div>
                </div>
            </div>

            {/* Save Modal */}
            {showSaveModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm p-4 animate-in fade-in duration-200">
                    <div className="bg-card w-full max-w-sm rounded-2xl border border-border/50 shadow-2xl p-6">
                        <div className="flex justify-between items-center mb-4">
                            <h3 className="text-[16px] font-bold text-primary">Salvar Simulação</h3>
                            <button onClick={() => setShowSaveModal(false)} className="text-muted hover:text-primary"><X size={18} /></button>
                        </div>
                        <p className="text-[12px] text-secondary mb-4">Dê um nome para este cenário de negócio para compará-lo depois.</p>

                        <input
                            type="text"
                            placeholder="Ex: Cenário Black Friday Agressiva"
                            value={scenarioName}
                            onChange={e => setScenarioName(e.target.value)}
                            className="w-full bg-secondary border border-border/50 rounded-xl px-4 py-2.5 text-[13px] text-primary focus:outline-none focus:border-blue-500 mb-5"
                            autoFocus
                        />

                        <div className="flex justify-end gap-3">
                            <button onClick={() => setShowSaveModal(false)} className="px-4 py-2 rounded-xl text-[13px] font-semibold text-muted hover:bg-secondary transition-colors">Cancelar</button>
                            <button
                                onClick={handleSaveScenario}
                                disabled={!scenarioName || saving}
                                className="flex items-center gap-2 px-4 py-2 rounded-xl text-[13px] font-semibold text-white bg-blue-600 hover:bg-blue-700 transition-colors shadow-none disabled:opacity-50"
                            >
                                {saving ? <RefreshCw size={14} className="animate-spin" /> : <Save size={14} />}
                                {saving ? 'Salvando...' : 'Salvar Cenário'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

        </div>
    );
}
