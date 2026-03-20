import { useState, useEffect, useRef } from 'react';
import {
    Target,
    RefreshCw,
    TrendingUp,
    TrendingDown,
    AlertTriangle,
    CheckCircle2,
    Clock,
    Zap,
    ChevronRight,
    Sparkles,
    Inbox,
    ArrowUpRight,
} from 'lucide-react';
import { agentApi } from '../services/agentApi';
import { SkeletonCard } from '../components/Skeleton';
import { EmptyState } from '../components/EmptyState';

// ── Types ───────────────────────────────────────────────
interface BCGProduct {
    product_name: string;
    recent_revenue: number;
    previous_revenue: number;
    total_revenue: number;
    market_share: number;
    growth_pct: number;
    quadrant: 'star' | 'cash_cow' | 'question_mark' | 'dog';
}

interface StrategicAction {
    title: string;
    description: string;
    category: 'investimento' | 'descontinuacao' | 'promocao' | 'retencao' | 'otimizacao';
    impact_score: number;
    ease_score: number;
    priority_score: number;
    timeframe: 'imediato' | 'curto_prazo' | 'medio_prazo' | 'longo_prazo';
    justification: string;
}

interface StrategicReport {
    id: string;
    report_data: {
        executive_summary: string;
        opportunities: string[];
        risks: string[];
    };
    bcg_data: any;
    actions: StrategicAction[];
    period_start: string;
    period_end: string;
    created_at: string;
}

// ── Constants ───────────────────────────────────────────
const QUADRANT_COLORS: Record<string, { bg: string; border: string; text: string; dot: string }> = {
    star: { bg: 'rgba(250, 204, 21, 0.08)', border: '#facc15', text: '#a16207', dot: '#facc15' },
    cash_cow: { bg: 'rgba(34, 197, 94, 0.08)', border: '#22c55e', text: '#15803d', dot: '#22c55e' },
    question_mark: { bg: 'rgba(59, 130, 246, 0.08)', border: '#3b82f6', text: '#1d4ed8', dot: '#3b82f6' },
    dog: { bg: 'rgba(239, 68, 68, 0.08)', border: '#ef4444', text: '#b91c1c', dot: '#ef4444' },
};

const QUADRANT_LABELS: Record<string, { emoji: string; label: string; desc: string }> = {
    star: { emoji: '⭐', label: 'Estrelas', desc: 'Alto crescimento + Alta participação' },
    cash_cow: { emoji: '🐄', label: 'Vacas Leiteiras', desc: 'Baixo crescimento + Alta participação' },
    question_mark: { emoji: '❓', label: 'Interrogações', desc: 'Alto crescimento + Baixa participação' },
    dog: { emoji: '🐕', label: 'Abacaxis', desc: 'Baixo crescimento + Baixa participação' },
};

const CATEGORY_CONFIG: Record<string, { color: string; bg: string; label: string; icon: string }> = {
    investimento: { color: '#22c55e', bg: 'rgba(34, 197, 94, 0.08)', label: 'Investimento', icon: '💰' },
    descontinuacao: { color: '#ef4444', bg: 'rgba(239, 68, 68, 0.08)', label: 'Descontinuação', icon: '🗑️' },
    promocao: { color: '#f97316', bg: 'rgba(249, 115, 22, 0.08)', label: 'Promoção', icon: '🏷️' },
    retencao: { color: '#3b82f6', bg: 'rgba(59, 130, 246, 0.08)', label: 'Retenção', icon: '🤝' },
    otimizacao: { color: '#8b5cf6', bg: 'rgba(139, 92, 246, 0.08)', label: 'Otimização', icon: '⚙️' },
};

const TIMEFRAME_LABELS: Record<string, string> = {
    imediato: '⚡ Imediato',
    curto_prazo: '📅 Curto prazo',
    medio_prazo: '📆 Médio prazo',
    longo_prazo: '🗓️ Longo prazo',
};

// ── BCG Scatter Plot (Canvas) ───────────────────────────
function BCGScatterPlot({ products }: { products: BCGProduct[] }) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const [tooltip, setTooltip] = useState<{ x: number; y: number; product: BCGProduct } | null>(null);

    useEffect(() => {
        const canvas = canvasRef.current;
        const container = containerRef.current;
        if (!canvas || !container || products.length === 0) return;

        const dpr = window.devicePixelRatio || 1;
        const rect = container.getBoundingClientRect();
        const isMobile = rect.width < 640;
        const chartHeight = isMobile ? 280 : 400;
        canvas.width = rect.width * dpr;
        canvas.height = chartHeight * dpr;
        canvas.style.width = `${rect.width}px`;
        canvas.style.height = `${chartHeight}px`;

        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        ctx.scale(dpr, dpr);

        const W = rect.width;
        const H = chartHeight;
        const PADDING = isMobile
            ? { top: 20, right: 15, bottom: 40, left: 40 }
            : { top: 30, right: 30, bottom: 50, left: 60 };
        const plotW = W - PADDING.left - PADDING.right;
        const plotH = H - PADDING.top - PADDING.bottom;

        // Clear
        ctx.clearRect(0, 0, W, H);

        // Axes
        const maxShare = Math.max(...products.map(p => p.market_share), 1) * 1.1;
        const minGrowth = Math.min(...products.map(p => p.growth_pct), -10);
        const maxGrowth = Math.max(...products.map(p => p.growth_pct), 10) * 1.1;
        const growthRange = maxGrowth - minGrowth;

        const medianShare = maxShare / 2;
        const medianGrowth = (maxGrowth + minGrowth) / 2;

        const toX = (share: number) => PADDING.left + (share / maxShare) * plotW;
        const toY = (growth: number) => PADDING.top + plotH - ((growth - minGrowth) / growthRange) * plotH;

        // Quadrant backgrounds
        const midX = toX(medianShare);
        const midY = toY(medianGrowth);

        const quadrantAreas = [
            { x: midX, y: PADDING.top, w: PADDING.left + plotW - midX, h: midY - PADDING.top, color: 'rgba(250, 204, 21, 0.04)' }, // Star
            { x: PADDING.left, y: PADDING.top, w: midX - PADDING.left, h: midY - PADDING.top, color: 'rgba(59, 130, 246, 0.04)' }, // Question Mark
            { x: midX, y: midY, w: PADDING.left + plotW - midX, h: PADDING.top + plotH - midY, color: 'rgba(34, 197, 94, 0.04)' }, // Cash Cow
            { x: PADDING.left, y: midY, w: midX - PADDING.left, h: PADDING.top + plotH - midY, color: 'rgba(239, 68, 68, 0.04)' }, // Dog
        ];
        quadrantAreas.forEach(q => {
            ctx.fillStyle = q.color;
            ctx.fillRect(q.x, q.y, q.w, q.h);
        });

        // Quadrant dividers
        ctx.strokeStyle = 'rgba(148, 163, 184, 0.3)';
        ctx.setLineDash([6, 4]);
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(midX, PADDING.top);
        ctx.lineTo(midX, PADDING.top + plotH);
        ctx.moveTo(PADDING.left, midY);
        ctx.lineTo(PADDING.left + plotW, midY);
        ctx.stroke();
        ctx.setLineDash([]);

        // Quadrant labels
        ctx.font = '11px Inter, system-ui, sans-serif';
        ctx.fillStyle = 'rgba(148, 163, 184, 0.6)';
        ctx.textAlign = 'center';
        ctx.fillText('⭐ Estrelas', (midX + PADDING.left + plotW) / 2, PADDING.top + 18);
        ctx.fillText('❓ Interrogações', (PADDING.left + midX) / 2, PADDING.top + 18);
        ctx.fillText('🐄 Vacas Leiteiras', (midX + PADDING.left + plotW) / 2, PADDING.top + plotH - 8);
        ctx.fillText('🐕 Abacaxis', (PADDING.left + midX) / 2, PADDING.top + plotH - 8);

        // Axes border
        ctx.strokeStyle = 'rgba(148, 163, 184, 0.2)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(PADDING.left, PADDING.top);
        ctx.lineTo(PADDING.left, PADDING.top + plotH);
        ctx.lineTo(PADDING.left + plotW, PADDING.top + plotH);
        ctx.stroke();

        // Axis labels
        ctx.fillStyle = '#64748b';
        ctx.font = '11px Inter, system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('Participação de Mercado (%)', PADDING.left + plotW / 2, H - 8);
        ctx.save();
        ctx.translate(14, PADDING.top + plotH / 2);
        ctx.rotate(-Math.PI / 2);
        ctx.fillText('Crescimento (%)', 0, 0);
        ctx.restore();

        // Tick marks
        ctx.font = '10px Inter, system-ui, sans-serif';
        ctx.fillStyle = '#94a3b8';
        for (let i = 0; i <= 4; i++) {
            const shareVal = (maxShare / 4) * i;
            const x = toX(shareVal);
            ctx.textAlign = 'center';
            ctx.fillText(`${shareVal.toFixed(1)}`, x, PADDING.top + plotH + 16);
        }
        for (let i = 0; i <= 4; i++) {
            const growthVal = minGrowth + (growthRange / 4) * i;
            const y = toY(growthVal);
            ctx.textAlign = 'right';
            ctx.fillText(`${growthVal.toFixed(0)}%`, PADDING.left - 8, y + 4);
        }

        // Draw dots
        products.forEach(p => {
            const x = toX(p.market_share);
            const y = toY(p.growth_pct);
            const color = QUADRANT_COLORS[p.quadrant]?.dot || '#94a3b8';
            // Size based on revenue
            const maxRev = Math.max(...products.map(pr => pr.total_revenue), 1);
            const radius = 6 + (p.total_revenue / maxRev) * 14;

            ctx.beginPath();
            ctx.arc(x, y, radius, 0, Math.PI * 2);
            ctx.fillStyle = color + '40';
            ctx.fill();
            ctx.strokeStyle = color;
            ctx.lineWidth = 2;
            ctx.stroke();
        });

        // Mouse move handler
        const handleMouseMove = (e: MouseEvent) => {
            const rect = canvas.getBoundingClientRect();
            const mx = e.clientX - rect.left;
            const my = e.clientY - rect.top;

            for (const p of products) {
                const px = toX(p.market_share);
                const py = toY(p.growth_pct);
                const maxRev = Math.max(...products.map(pr => pr.total_revenue), 1);
                const radius = 6 + (p.total_revenue / maxRev) * 14;
                const dist = Math.sqrt((mx - px) ** 2 + (my - py) ** 2);

                if (dist <= radius + 4) {
                    setTooltip({ x: e.clientX - rect.left, y: e.clientY - rect.top, product: p });
                    return;
                }
            }
            setTooltip(null);
        };

        canvas.addEventListener('mousemove', handleMouseMove);
        return () => canvas.removeEventListener('mousemove', handleMouseMove);
    }, [products]);

    if (products.length === 0) return <EmptyState icon={Inbox} title="Sem dados BCG" description="Precisa de dados de vendas em pelo menos 2 períodos para gerar a Matriz BCG." />;

    return (
        <div ref={containerRef} className="relative w-full">
            <canvas ref={canvasRef} className="w-full rounded-xl" />
            {tooltip && (
                <div
                    className="absolute z-50 pointer-events-none bg-card border border-border rounded-xl shadow-xl px-4 py-3 max-w-[260px]"
                    style={{ left: tooltip.x + 16, top: tooltip.y - 10, transform: 'translateY(-50%)' }}
                >
                    <p className="text-[13px] font-semibold text-primary truncate">{tooltip.product.product_name}</p>
                    <div className="flex gap-3 mt-1.5 text-[11px] text-muted">
                        <span>📈 {tooltip.product.growth_pct.toFixed(1)}%</span>
                        <span>📊 {tooltip.product.market_share.toFixed(1)}%</span>
                    </div>
                    <p className="text-[11px] text-muted mt-1">
                        R$ {tooltip.product.total_revenue.toLocaleString('pt-BR', { minimumFractionDigits: 0 })}
                    </p>
                    <div
                        className="mt-1.5 text-[10px] font-bold uppercase tracking-wider"
                        style={{ color: QUADRANT_COLORS[tooltip.product.quadrant]?.text }}
                    >
                        {QUADRANT_LABELS[tooltip.product.quadrant]?.emoji} {QUADRANT_LABELS[tooltip.product.quadrant]?.label}
                    </div>
                </div>
            )}
        </div>
    );
}

// ── Action Card ─────────────────────────────────────────
function ActionCard({ action, index }: { action: StrategicAction; index: number }) {
    const config = CATEGORY_CONFIG[action.category] || CATEGORY_CONFIG.otimizacao;
    const [expanded, setExpanded] = useState(false);

    return (
        <div
            className="group rounded-2xl border border-border bg-card p-5 transition-all duration-200 hover:shadow-md hover:border-border/80 cursor-pointer"
            onClick={() => setExpanded(!expanded)}
        >
            <div className="flex items-start gap-4">
                <div
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-base font-bold"
                    style={{ backgroundColor: config.bg, color: config.color }}
                >
                    {index + 1}
                </div>
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                        <h4 className="text-[14px] font-semibold text-primary truncate">{action.title}</h4>
                        <ChevronRight
                            size={14}
                            className={`text-muted shrink-0 transition-transform duration-200 ${expanded ? 'rotate-90' : ''}`}
                        />
                    </div>
                    <div className="flex flex-wrap items-center gap-2 text-[11px]">
                        <span className="rounded-full px-2 py-0.5 font-medium" style={{ background: config.bg, color: config.color }}>
                            {config.icon} {config.label}
                        </span>
                        <span className="text-muted">{TIMEFRAME_LABELS[action.timeframe]}</span>
                    </div>
                </div>
                <div className="flex flex-col items-end gap-1 shrink-0">
                    <div
                        className="text-[20px] font-bold leading-none"
                        style={{ color: action.priority_score >= 60 ? '#22c55e' : action.priority_score >= 30 ? '#f97316' : '#94a3b8' }}
                    >
                        {action.priority_score}
                    </div>
                    <span className="text-[10px] text-muted">score</span>
                </div>
            </div>

            {expanded && (
                <div className="mt-4 pt-4 border-t border-border/50 space-y-3 animate-in slide-in-from-top-2 duration-200">
                    <p className="text-[13px] text-secondary leading-relaxed">{action.description}</p>
                    <div className="flex gap-6 text-[12px]">
                        <div className="flex items-center gap-1.5">
                            <TrendingUp size={13} className="text-emerald-500" />
                            <span className="text-muted">Impacto:</span>
                            <span className="font-semibold text-primary">{action.impact_score}/10</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                            <Zap size={13} className="text-amber-500" />
                            <span className="text-muted">Facilidade:</span>
                            <span className="font-semibold text-primary">{action.ease_score}/10</span>
                        </div>
                    </div>
                    <div className="text-[12px] text-muted italic bg-primary/3 rounded-lg px-3 py-2">
                        💡 {action.justification}
                    </div>
                </div>
            )}
        </div>
    );
}

// ── Main Page ───────────────────────────────────────────
export default function StrategicReportPage() {
    const [loading, setLoading] = useState(true);
    const [generating, setGenerating] = useState(false);
    const [report, setReport] = useState<StrategicReport | null>(null);
    const [bcgProducts, setBcgProducts] = useState<BCGProduct[]>([]);
    const [quadrants, setQuadrants] = useState<Record<string, number>>({});
    const [error, setError] = useState<string | null>(null);

    const fetchData = async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await agentApi.getStrategicReport();
            if (res.success && res.data) {
                setReport(res.data.report || null);
                const bcg = res.data.bcg as any;
                setBcgProducts(bcg?.data || []);
                setQuadrants(bcg?.quadrants || {});
            }
        } catch (err: any) {
            setError(err.message || 'Erro ao carregar dados');
        } finally {
            setLoading(false);
        }
    };

    const handleGenerate = async () => {
        setGenerating(true);
        setError(null);
        try {
            const res = await agentApi.generateStrategicReport();
            if (res.success) {
                await fetchData(); // Reload after generation
            } else {
                setError(res.error || 'Erro ao gerar relatório');
            }
        } catch (err: any) {
            setError(err.message || 'Erro ao gerar relatório');
        } finally {
            setGenerating(false);
        }
    };

    useEffect(() => {
        fetchData();
    }, []);

    if (loading) {
        return (
            <div className="p-6 max-md:p-4 max-sm:p-3 space-y-6 max-w-7xl mx-auto">
                <SkeletonCard /><SkeletonCard /><SkeletonCard />
            </div>
        );
    }

    const actions = report?.actions || [];
    const reportData = report?.report_data;

    return (
        <div className="p-6 max-md:p-4 max-sm:p-3 space-y-6 max-w-7xl mx-auto">
            {/* Header */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div>
                    <div className="flex items-center gap-2.5 mb-1">
                        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/5">
                            <Target size={20} style={{ color: 'var(--color-brand-primary)' }} />
                        </div>
                        <h1 className="text-[22px] font-bold text-primary tracking-tight">Estratégia</h1>
                    </div>
                    <p className="text-[13px] text-muted ml-11.5">
                        Análise de portfólio e recomendações estratégicas geradas por IA
                    </p>
                </div>
                <div className="flex gap-2">
                    <button
                        onClick={fetchData}
                        className="flex items-center gap-1.5 rounded-xl border border-border px-3.5 py-2 text-[12.5px] font-medium text-secondary transition-all hover:bg-border/40 active:scale-95"
                    >
                        <RefreshCw size={14} />
                        Atualizar
                    </button>
                    <button
                        onClick={handleGenerate}
                        disabled={generating}
                        className="flex items-center gap-1.5 rounded-xl px-4 py-2 text-[12.5px] font-semibold text-white transition-all active:scale-95 disabled:opacity-60"
                        style={{ backgroundColor: 'var(--color-brand-primary)' }}
                    >
                        {generating ? (
                            <>
                                <div className="h-3.5 w-3.5 rounded-full border-2 border-white/30 border-t-white" style={{ animation: 'spin 0.7s linear infinite' }} />
                                Gerando...
                            </>
                        ) : (
                            <>
                                <Sparkles size={14} />
                                Gerar Relatório
                            </>
                        )}
                    </button>
                </div>
            </div>

            {error && (
                <div className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 dark:bg-red-950/20 dark:border-red-900/40 px-4 py-3 text-[13px] text-red-600 dark:text-red-400">
                    <AlertTriangle size={16} />
                    {error}
                </div>
            )}

            {/* BCG Matrix */}
            <div className="rounded-2xl border border-border bg-card overflow-hidden">
                <div className="px-6 py-4 border-b border-border/50">
                    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                        <div>
                            <h2 className="text-[16px] font-semibold text-primary">Matriz BCG — Portfólio de Produtos</h2>
                            <p className="text-[12px] text-muted mt-0.5">Crescimento vs Participação de mercado (últimos 12 meses)</p>
                        </div>
                        <div className="flex flex-wrap gap-3">
                            {Object.entries(QUADRANT_LABELS).map(([key, val]) => (
                                <div key={key} className="flex items-center gap-1.5 text-[11px] text-muted">
                                    <div className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: QUADRANT_COLORS[key]?.dot }} />
                                    {val.emoji} {val.label}
                                    {quadrants[key === 'question_mark' ? 'question_marks' : key + 's'] !== undefined && (
                                        <span className="font-semibold text-primary">({quadrants[key === 'question_mark' ? 'question_marks' : key + 's'] || 0})</span>
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
                <div className="p-4">
                    <BCGScatterPlot products={bcgProducts} />
                </div>
            </div>

            {/* Strategic Actions */}
            {actions.length > 0 && (
                <div>
                    <div className="flex items-center gap-2 mb-4">
                        <h2 className="text-[16px] font-semibold text-primary">🎯 Ações Estratégicas Priorizadas</h2>
                        <span className="rounded-full bg-primary/5 px-2.5 py-0.5 text-[11px] font-semibold text-primary">{actions.length}</span>
                    </div>
                    <div className="grid gap-3">
                        {actions.map((action, i) => (
                            <ActionCard key={i} action={action} index={i} />
                        ))}
                    </div>
                </div>
            )}

            {/* Executive Report */}
            {reportData && (
                <div className="rounded-2xl border border-border bg-card overflow-hidden">
                    <div className="px-6 py-4 border-b border-border/50 flex items-center justify-between">
                        <h2 className="text-[16px] font-semibold text-primary">📝 Relatório Executivo</h2>
                        {report?.created_at && (
                            <div className="flex items-center gap-1.5 text-[11px] text-muted">
                                <Clock size={12} />
                                {new Date(report.created_at).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' })}
                                {report.period_start && report.period_end && (
                                    <span className="ml-1">
                                        ({report.period_start} — {report.period_end})
                                    </span>
                                )}
                            </div>
                        )}
                    </div>
                    <div className="p-6 space-y-6">
                        {/* Summary */}
                        <div className="text-[14px] text-secondary leading-relaxed whitespace-pre-line">
                            {reportData.executive_summary}
                        </div>

                        <div className="grid sm:grid-cols-2 gap-4">
                            {/* Opportunities */}
                            {reportData.opportunities?.length > 0 && (
                                <div className="rounded-xl bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-100 dark:border-emerald-900/30 p-4">
                                    <h3 className="text-[13px] font-semibold text-emerald-700 dark:text-emerald-400 mb-3 flex items-center gap-1.5">
                                        <CheckCircle2 size={14} />
                                        Oportunidades
                                    </h3>
                                    <ul className="space-y-2">
                                        {reportData.opportunities.map((o, i) => (
                                            <li key={i} className="flex items-start gap-2 text-[13px] text-emerald-800 dark:text-emerald-300">
                                                <ArrowUpRight size={13} className="mt-0.5 shrink-0" />
                                                <span>{o}</span>
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            )}

                            {/* Risks */}
                            {reportData.risks?.length > 0 && (
                                <div className="rounded-xl bg-red-50 dark:bg-red-950/20 border border-red-100 dark:border-red-900/30 p-4">
                                    <h3 className="text-[13px] font-semibold text-red-700 dark:text-red-400 mb-3 flex items-center gap-1.5">
                                        <AlertTriangle size={14} />
                                        Riscos
                                    </h3>
                                    <ul className="space-y-2">
                                        {reportData.risks.map((r, i) => (
                                            <li key={i} className="flex items-start gap-2 text-[13px] text-red-800 dark:text-red-300">
                                                <TrendingDown size={13} className="mt-0.5 shrink-0" />
                                                <span>{r}</span>
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* No report yet */}
            {!reportData && !loading && actions.length === 0 && (
                <div className="rounded-2xl border border-border bg-card">
                    <EmptyState
                        icon={Target}
                        title="Nenhum relatório estratégico"
                        description="Clique em 'Gerar Relatório' para criar sua primeira análise estratégica com IA."
                    />
                </div>
            )}
        </div>
    );
}
