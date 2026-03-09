import { useState, useEffect } from 'react';
import {
    Zap,
    AlertTriangle,
    RefreshCw,
    Search,
    BarChart3,
    ArrowUpRight,
    ArrowDownRight,
    Package,
    TrendingUp,
    ShoppingBag,
    Inbox
} from 'lucide-react';
import { agentApi } from '../services/agentApi';
import { SkeletonCard } from '../components/Skeleton';

function EmptyState({ icon: Icon, title, description }: { icon: any, title: string, description: string }) {
    return (
        <div className="flex flex-col items-center justify-center py-12 text-center">
            <div className="p-4 rounded-2xl bg-muted/10 mb-4">
                <Icon size={28} className="text-muted" />
            </div>
            <p className="text-sm font-bold text-secondary">{title}</p>
            <p className="text-xs text-muted mt-1 max-w-xs">{description}</p>
        </div>
    );
}

export default function PatternDiscoveryPage() {
    const [loading, setLoading] = useState(true);
    const [data, setData] = useState<any>(null);
    const [segments, setSegments] = useState<any>(null);
    const [timeframe, setTimeframe] = useState<number>(90);

    useEffect(() => {
        const fetchData = async () => {
            try {
                setLoading(true);
                const [patternsRes, segmentsRes] = await Promise.all([
                    agentApi.getPatterns(timeframe),
                    agentApi.getSmartSegments()
                ]);
                setData(patternsRes.data);
                setSegments(segmentsRes.data);
            } catch (error) {
                console.error('Error fetching pattern data:', error);
            } finally {
                setLoading(false);
            }
        };
        fetchData();
    }, [timeframe]);

    if (loading) {
        return (
            <div className="p-8 space-y-6">
                <SkeletonCard minHeight="200px" />
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <SkeletonCard minHeight="300px" />
                    <SkeletonCard minHeight="300px" />
                </div>
            </div>
        );
    }

    const { correlation, rfm, basket, top_products } = data || {};
    const { churn_risk, upsell_candidates } = segments || {};

    return (
        <div className="p-8 pb-20 max-w-7xl mx-auto animate-in fade-in duration-500">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-10">
                <div>
                    <div className="flex items-center gap-2 mb-1">
                        <div className="p-1.5 rounded-lg bg-brand-primary/10">
                            <Search size={18} className="text-brand-primary" />
                        </div>
                        <span className="text-[11px] font-extrabold text-brand-primary uppercase tracking-[0.2em]">Inteligência Híbrida</span>
                    </div>
                    <h1 className="text-3xl font-black text-primary tracking-tight">Descoberta de Padrões</h1>
                    <p className="text-sm text-secondary mt-1 max-w-xl">
                        Identificando correlações ocultas e comportamentos de clientes para antecipar movimentos de mercado.
                    </p>
                </div>
                <div className="flex items-center gap-2 p-1 bg-muted/20 rounded-xl border border-border">
                    <button
                        onClick={() => setTimeframe(90)}
                        className={`px-4 py-2 rounded-lg text-xs font-bold transition-colors ${timeframe === 90 ? 'bg-background shadow-sm text-primary border border-border' : 'text-muted hover:text-primary'}`}
                    >
                        Últimos 90 Dias
                    </button>
                    <button
                        onClick={() => setTimeframe(180)}
                        className={`px-4 py-2 rounded-lg text-xs font-bold transition-colors ${timeframe === 180 ? 'bg-background shadow-sm text-primary border border-border' : 'text-muted hover:text-primary'}`}
                    >
                        Semestral
                    </button>
                </div>
            </div>

            {/* Core Correlation Stats */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-10">
                <CorrelationCard
                    title="Volume vs Receita"
                    value={correlation?.revenue_v_orders}
                    description="O quanto o aumento de pedidos impacta no faturamento total."
                />
                <CorrelationCard
                    title="Ticket vs Receita"
                    value={correlation?.revenue_v_ticket}
                    description="Influência do valor médio das vendas no crescimento real."
                />
                <CorrelationCard
                    title="Eficiência Operacional"
                    value={correlation?.orders_v_ticket}
                    description="Correlação entre volume de vendas e valor por cliente."
                />
            </div>

            {/* Top Products */}
            {top_products && top_products.length > 0 && (
                <div className="bg-card border border-border rounded-3xl p-8 shadow-soft mb-10">
                    <div className="flex items-center justify-between mb-8">
                        <div>
                            <div className="flex items-center gap-2 mb-1">
                                <TrendingUp size={18} className="text-brand-primary" />
                                <h3 className="text-lg font-bold text-primary">Produtos Estrela</h3>
                            </div>
                            <p className="text-[12px] text-muted">Ranking dos produtos mais vendidos por volume e receita</p>
                        </div>
                        <div className="px-3 py-1.5 rounded-xl bg-brand-primary/10 text-[10px] font-black text-brand-primary uppercase">
                            Top {top_products.length}
                        </div>
                    </div>

                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="border-b border-border/50">
                                    <th className="text-left py-3 px-2 text-[10px] font-extrabold text-muted uppercase tracking-wider">#</th>
                                    <th className="text-left py-3 px-2 text-[10px] font-extrabold text-muted uppercase tracking-wider">Produto</th>
                                    <th className="text-right py-3 px-2 text-[10px] font-extrabold text-muted uppercase tracking-wider">Vendidos</th>
                                    <th className="text-right py-3 px-2 text-[10px] font-extrabold text-muted uppercase tracking-wider">Receita</th>
                                    <th className="text-right py-3 px-2 text-[10px] font-extrabold text-muted uppercase tracking-wider">Preço Médio</th>
                                </tr>
                            </thead>
                            <tbody>
                                {top_products.slice(0, 10).map((p: any, idx: number) => (
                                    <tr key={idx} className="border-b border-border/20 hover:bg-muted/5 transition-colors">
                                        <td className="py-3 px-2">
                                            <span className={`inline-flex items-center justify-center w-6 h-6 rounded-lg text-[10px] font-black ${idx < 3 ? 'bg-brand-primary/10 text-brand-primary' : 'bg-muted/10 text-muted'
                                                }`}>
                                                {idx + 1}
                                            </span>
                                        </td>
                                        <td className="py-3 px-2">
                                            <div className="flex items-center gap-2">
                                                <Package size={14} className="text-muted shrink-0" />
                                                <span className="text-[13px] font-bold text-secondary truncate max-w-xs">{p.product_name}</span>
                                            </div>
                                            {p.sku && (
                                                <span className="text-[10px] text-muted ml-6">SKU: {p.sku}</span>
                                            )}
                                        </td>
                                        <td className="py-3 px-2 text-right">
                                            <span className="text-[13px] font-black text-primary">{p.total_sold?.toLocaleString('pt-BR')}</span>
                                        </td>
                                        <td className="py-3 px-2 text-right">
                                            <span className="text-[13px] font-bold text-success">
                                                R$ {p.total_revenue?.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                                            </span>
                                        </td>
                                        <td className="py-3 px-2 text-right">
                                            <span className="text-[12px] text-muted">
                                                R$ {p.avg_price?.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                            </span>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-10">
                {/* RFM Distribution */}
                <div className="bg-card border border-border rounded-3xl p-8 shadow-soft">
                    <div className="flex items-center justify-between mb-8">
                        <div>
                            <h3 className="text-lg font-bold text-primary">Saúde da Base</h3>
                            <p className="text-[12px] text-muted">Distribuição de clientes por comportamento (RFM)</p>
                        </div>
                        <BarChart3 size={20} className="text-muted" />
                    </div>

                    {rfm?.segments?.length > 0 ? (
                        <div className="space-y-4">
                            {rfm.segments.map((seg: any) => (
                                <div key={seg.segment} className="group cursor-default">
                                    <div className="flex items-center justify-between mb-1.5">
                                        <span className="text-[13px] font-bold text-secondary group-hover:text-brand-primary transition-colors">{seg.segment}</span>
                                        <span className="text-[13px] font-black text-primary">{seg.count} clientes</span>
                                    </div>
                                    <div className="h-2 w-full bg-muted/10 rounded-full overflow-hidden">
                                        <div
                                            className="h-full rounded-full transition-all duration-1000"
                                            style={{
                                                width: `${(seg.count / rfm.total_customers) * 100}%`,
                                                backgroundColor: getSegmentColor(seg.segment)
                                            }}
                                        />
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <EmptyState icon={BarChart3} title="Sem dados RFM" description="Ainda não há dados suficientes para segmentação de clientes." />
                    )}
                </div>

                {/* Market Basket List */}
                <div className="bg-card border border-border rounded-3xl p-8 shadow-soft">
                    <div className="flex items-center justify-between mb-8">
                        <div>
                            <h3 className="text-lg font-bold text-primary">Afinidade de Produtos</h3>
                            <p className="text-[12px] text-muted">Itens frequentemente comprados juntos (Cross-sell)</p>
                        </div>
                        <RefreshCw size={20} className="text-muted" />
                    </div>

                    {basket?.length > 0 ? (
                        <div className="space-y-3">
                            {basket.slice(0, 5).map((pair: any, idx: number) => (
                                <div key={idx} className="flex items-center justify-between p-4 rounded-2xl bg-muted/5 border border-border/50 hover:bg-muted/10 transition-colors">
                                    <div className="flex items-center gap-3 flex-1 min-w-0">
                                        <ShoppingBag size={14} className="text-muted shrink-0" />
                                        <span className="text-sm font-bold text-secondary truncate">{pair.item_a}</span>
                                        <div className={`shrink-0 px-2 py-0.5 rounded-md text-[9px] font-black uppercase ${pair.frequency >= 5
                                                ? 'bg-success/10 text-success'
                                                : 'bg-brand-primary/10 text-brand-primary'
                                            }`}>
                                            {pair.frequency >= 5 ? '🔥 Kit Sugerido' : '+ Combo'}
                                        </div>
                                        <span className="text-sm font-bold text-secondary truncate">{pair.item_b}</span>
                                    </div>
                                    <div className="ml-4 text-right shrink-0">
                                        <span className="text-[11px] font-bold text-muted uppercase">Suporte</span>
                                        <p className="text-sm font-black text-primary">{pair.frequency}x</p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <EmptyState icon={Inbox} title="Sem dados de afinidade" description="Produtos comprados juntos aparecerão aqui quando houver dados suficientes." />
                    )}
                </div>
            </div>

            {/* Smart Segments / Actionable Lists */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                {/* Churn Risk */}
                <div className="bg-shopee/5 border border-shopee/10 rounded-3xl p-8">
                    <div className="flex items-center gap-3 mb-6">
                        <div className="p-2 rounded-xl bg-shopee/10 text-shopee">
                            <AlertTriangle size={20} />
                        </div>
                        <div>
                            <h3 className="text-lg font-bold text-shopee">Alerta de Churn</h3>
                            <p className="text-[12px] font-medium text-shopee/70">Clientes frequentes sem compras há +45 dias</p>
                        </div>
                    </div>

                    {churn_risk?.length > 0 ? (
                        <div className="space-y-3">
                            {churn_risk.map((c: any, idx: number) => (
                                <div key={idx} className="flex items-center justify-between p-4 rounded-2xl bg-card border border-shopee/10 shadow-sm hover:border-shopee/30 transition-colors">
                                    <div>
                                        <p className="text-[13px] font-bold text-primary">{c.name}</p>
                                        <p className="text-[11px] text-muted">{c.email}</p>
                                    </div>
                                    <button className="px-3 py-1.5 rounded-lg bg-shopee/10 text-shopee hover:bg-shopee hover:text-white text-[10px] font-bold transition-all">
                                        Reativar
                                    </button>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <EmptyState icon={AlertTriangle} title="Nenhum risco de churn" description="Seus clientes frequentes estão ativos. Excelente!" />
                    )}
                </div>

                {/* Upsell Candidates */}
                <div className="bg-success/5 border border-success/10 rounded-3xl p-8">
                    <div className="flex items-center gap-3 mb-6">
                        <div className="p-2 rounded-xl bg-success/10 text-success">
                            <Zap size={20} />
                        </div>
                        <div>
                            <h3 className="text-lg font-bold text-success">Oportunidade Upsell</h3>
                            <p className="text-[12px] font-medium text-success/70">Clientes leais com ticket médio abaixo da média</p>
                        </div>
                    </div>

                    {upsell_candidates?.length > 0 ? (
                        <div className="space-y-3">
                            {upsell_candidates.map((u: any, idx: number) => (
                                <div key={idx} className="flex items-center justify-between p-4 rounded-2xl bg-card border border-success/10 shadow-sm hover:border-success/30 transition-colors">
                                    <div>
                                        <p className="text-[13px] font-bold text-primary">{u.name}</p>
                                        <p className="text-[11px] text-muted">{u.orders} pedidos • R$ {u.avg_ticket} avg</p>
                                    </div>
                                    <button className="px-3 py-1.5 rounded-lg bg-success/10 text-success hover:bg-success hover:text-white text-[10px] font-bold transition-all">
                                        Ofertar VIP
                                    </button>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <EmptyState icon={Zap} title="Sem candidatos a upsell" description="Nenhum cliente identificado com potencial de upgrade no momento." />
                    )}
                </div>
            </div>
        </div>
    );
}

function CorrelationCard({ title, value, description }: { title: string, value: number, description: string }) {
    if (value === undefined || value === null) return null;
    const isStrong = Math.abs(value) > 0.7;
    const isPositive = value > 0;

    return (
        <div className="bg-card border border-border rounded-3xl p-6 shadow-soft hover:shadow-soft-transition transition-all">
            <div className="flex items-center justify-between mb-4">
                <span className="text-[11px] font-extrabold text-muted uppercase tracking-wider">{title}</span>
                {isPositive ? <ArrowUpRight size={16} className="text-success" /> : <ArrowDownRight size={16} className="text-shopee" />}
            </div>

            <div className="flex items-baseline gap-2 mb-2">
                <span className="text-3xl font-black text-primary">{(value * 10).toFixed(1)}</span>
                <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${isStrong ? 'bg-success/10 text-success' : 'bg-muted/10 text-muted'}`}>
                    {isStrong ? 'SIGNIFICATIVO' : 'LATENTE'}
                </span>
            </div>

            <p className="text-[12px] text-muted leading-relaxed">
                {description}
            </p>
        </div>
    );
}

function getSegmentColor(segment: string) {
    const s = segment.toLowerCase();
    if (s.includes('campeão') || s.includes('vip')) return '#8B5CF6';
    if (s.includes('fiel')) return '#22C55E';
    if (s.includes('promissor')) return '#3B82F6';
    if (s.includes('risco') || s.includes('hibernando')) return '#EF4444';
    if (s.includes('perdidos')) return '#64748B';
    return '#94A3B8';
}
