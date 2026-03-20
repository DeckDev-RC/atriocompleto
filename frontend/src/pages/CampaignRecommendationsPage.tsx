import { useState, useEffect, useCallback } from 'react';
import {
    Megaphone,
    Sparkles,
    Users,
    Clock,
    Gift,
    Mail,
    BarChart3,
    ChevronDown,
    ChevronUp,
    Check,
    X,
    RefreshCw,
    TrendingUp,
    Target,
    AlertCircle,
} from 'lucide-react';
import { agentApi } from '../services/agentApi';

// ── Types ────────────────────────────────────────────────

interface SegmentData {
    name: string;
    label: string;
    count: number;
    total_value: number;
    avg_ticket: number;
}

interface SegmentRecommendation {
    segment: string;
    channel: { primary: string; secondary: string; reasoning: string };
    offer: { type: string; description: string; discount_percent?: number | null; validity_days?: number | null };
    copy: { subject_line: string; body: string; cta: string };
    timing: { best_day: string; best_hour: string; reasoning: string };
    prediction: { open_rate_percent: number; ctr_percent: number; conversion_percent: number; projected_revenue: number };
}

interface CampaignRecommendation {
    id: string;
    tenant_id: string;
    segments: SegmentData[];
    recommendations: {
        recommendations: SegmentRecommendation[];
        overall_summary: string;
        priority_segment: string;
    };
    status: 'generated' | 'approved' | 'dismissed';
    created_at: string;
}

// ── Segment visual config ────────────────────────────────

const SEGMENT_CONFIG: Record<string, { color: string; gradient: string; icon: typeof Users; emoji: string }> = {
    vips: { color: '#f59e0b', gradient: 'from-amber-500/20 to-amber-600/5', icon: Target, emoji: '👑' },
    novos: { color: '#22c55e', gradient: 'from-emerald-500/20 to-emerald-600/5', icon: Sparkles, emoji: '🌟' },
    em_risco: { color: '#ef4444', gradient: 'from-red-500/20 to-red-600/5', icon: AlertCircle, emoji: '⚠️' },
    inativos: { color: '#6b7280', gradient: 'from-gray-500/20 to-gray-600/5', icon: Clock, emoji: '💤' },
    oportunistas: { color: '#8b5cf6', gradient: 'from-violet-500/20 to-violet-600/5', icon: Gift, emoji: '🎯' },
};

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
    generated: { label: 'Nova', color: '#3b82f6', bg: 'rgba(59,130,246,0.1)' },
    approved: { label: 'Aprovada', color: '#22c55e', bg: 'rgba(34,197,94,0.1)' },
    dismissed: { label: 'Descartada', color: '#6b7280', bg: 'rgba(107,114,128,0.1)' },
};

// ── Format helpers ───────────────────────────────────────

function fmtBRL(value: number): string {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
}

function fmtDate(dateStr: string): string {
    return new Date(dateStr).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

// ── Components ───────────────────────────────────────────

function SegmentCard({ segment }: { segment: SegmentData }) {
    const config = SEGMENT_CONFIG[segment.name] || SEGMENT_CONFIG.oportunistas;
    const Icon = config.icon;

    return (
        <div
            className={`relative overflow-hidden rounded-2xl border border-border/40 bg-linear-to-br ${config.gradient} p-5 transition-all duration-200 hover:border-border/60 hover:shadow-md`}
        >
            <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-2.5">
                    <div
                        className="flex h-10 w-10 items-center justify-center rounded-xl"
                        style={{ backgroundColor: `${config.color}15` }}
                    >
                        <Icon size={20} style={{ color: config.color }} />
                    </div>
                    <div>
                        <p className="text-[13px] font-semibold text-primary">{config.emoji} {segment.label}</p>
                        <p className="text-[11px] text-muted">{segment.count} clientes</p>
                    </div>
                </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
                <div>
                    <p className="text-[10px] uppercase tracking-wider text-muted font-medium">Valor Total</p>
                    <p className="text-[15px] font-bold text-primary">{fmtBRL(segment.total_value)}</p>
                </div>
                <div>
                    <p className="text-[10px] uppercase tracking-wider text-muted font-medium">Ticket Médio</p>
                    <p className="text-[15px] font-bold text-primary">{fmtBRL(segment.avg_ticket)}</p>
                </div>
            </div>
        </div>
    );
}

function RecommendationCard({ rec, segment }: { rec: SegmentRecommendation; segment?: SegmentData }) {
    const [expanded, setExpanded] = useState(false);
    const config = SEGMENT_CONFIG[rec.segment] || SEGMENT_CONFIG.oportunistas;

    return (
        <div className="rounded-2xl border border-border/40 bg-card overflow-hidden transition-all duration-200 hover:border-border/60">
            <button
                onClick={() => setExpanded(!expanded)}
                className="flex w-full items-center justify-between p-5 text-left transition-colors hover:bg-border/10"
            >
                <div className="flex items-center gap-3">
                    <div
                        className="h-3 w-3 rounded-full"
                        style={{ backgroundColor: config.color }}
                    />
                    <span className="text-[14px] font-semibold text-primary">
                        {config.emoji} {segment?.label || rec.segment}
                    </span>
                    {segment && (
                        <span className="text-[11px] text-muted bg-border/30 px-2 py-0.5 rounded-full">
                            {segment.count} clientes
                        </span>
                    )}
                </div>
                {expanded ? <ChevronUp size={16} className="text-muted" /> : <ChevronDown size={16} className="text-muted" />}
            </button>

            {expanded && (
                <div className="px-5 pb-5 space-y-5 border-t border-border/30 pt-4">
                    {/* Channel */}
                    <div>
                        <div className="flex items-center gap-2 mb-2">
                            <Mail size={14} style={{ color: config.color }} />
                            <span className="text-[12px] font-semibold uppercase tracking-wider text-muted">Canal Recomendado</span>
                        </div>
                        <div className="flex flex-wrap gap-2 mb-1.5">
                            <span className="px-3 py-1 rounded-full text-[12px] font-medium" style={{ backgroundColor: `${config.color}15`, color: config.color }}>
                                {rec.channel.primary}
                            </span>
                            <span className="px-3 py-1 rounded-full text-[12px] font-medium bg-border/30 text-secondary">
                                {rec.channel.secondary}
                            </span>
                        </div>
                        <p className="text-[12px] text-muted italic">{rec.channel.reasoning}</p>
                    </div>

                    {/* Offer */}
                    <div>
                        <div className="flex items-center gap-2 mb-2">
                            <Gift size={14} style={{ color: config.color }} />
                            <span className="text-[12px] font-semibold uppercase tracking-wider text-muted">Oferta Sugerida</span>
                        </div>
                        <p className="text-[13px] text-primary font-medium">{rec.offer.type}</p>
                        <p className="text-[12px] text-secondary mt-0.5">{rec.offer.description}</p>
                        {rec.offer.discount_percent && (
                            <span className="inline-block mt-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold" style={{ backgroundColor: '#22c55e15', color: '#22c55e' }}>
                                {rec.offer.discount_percent}% OFF
                            </span>
                        )}
                    </div>

                    {/* Copy */}
                    <div>
                        <div className="flex items-center gap-2 mb-2">
                            <Sparkles size={14} style={{ color: config.color }} />
                            <span className="text-[12px] font-semibold uppercase tracking-wider text-muted">Copy Personalizado</span>
                        </div>
                        <div className="rounded-xl bg-border/20 p-4 space-y-2">
                            <p className="text-[11px] uppercase tracking-wider text-muted font-medium">Subject Line</p>
                            <p className="text-[13px] text-primary font-semibold">{rec.copy.subject_line}</p>
                            <div className="h-px bg-border/30 my-2" />
                            <p className="text-[11px] uppercase tracking-wider text-muted font-medium">Corpo</p>
                            <p className="text-[13px] text-secondary leading-relaxed">{rec.copy.body}</p>
                            <div className="h-px bg-border/30 my-2" />
                            <p className="text-[11px] uppercase tracking-wider text-muted font-medium">CTA (Botão)</p>
                            <div className="inline-block mt-1">
                                <span
                                    className="px-4 py-2 rounded-xl text-[12px] font-bold text-white"
                                    style={{ backgroundColor: config.color }}
                                >
                                    {rec.copy.cta}
                                </span>
                            </div>
                        </div>
                    </div>

                    {/* Timing */}
                    <div>
                        <div className="flex items-center gap-2 mb-2">
                            <Clock size={14} style={{ color: config.color }} />
                            <span className="text-[12px] font-semibold uppercase tracking-wider text-muted">Timing Ideal</span>
                        </div>
                        <div className="flex gap-3">
                            <span className="px-3 py-1.5 rounded-xl text-[12px] font-medium bg-border/20 text-primary">
                                📅 {rec.timing.best_day}
                            </span>
                            <span className="px-3 py-1.5 rounded-xl text-[12px] font-medium bg-border/20 text-primary">
                                ⏰ {rec.timing.best_hour}
                            </span>
                        </div>
                        <p className="text-[12px] text-muted italic mt-1.5">{rec.timing.reasoning}</p>
                    </div>

                    {/* Prediction */}
                    <div>
                        <div className="flex items-center gap-2 mb-3">
                            <BarChart3 size={14} style={{ color: config.color }} />
                            <span className="text-[12px] font-semibold uppercase tracking-wider text-muted">Previsão de Performance</span>
                        </div>
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                            <div className="rounded-xl bg-border/20 p-3 text-center">
                                <p className="text-[18px] font-bold text-primary">{rec.prediction.open_rate_percent}%</p>
                                <p className="text-[10px] text-muted uppercase tracking-wider mt-0.5">Taxa Abertura</p>
                            </div>
                            <div className="rounded-xl bg-border/20 p-3 text-center">
                                <p className="text-[18px] font-bold text-primary">{rec.prediction.ctr_percent}%</p>
                                <p className="text-[10px] text-muted uppercase tracking-wider mt-0.5">CTR</p>
                            </div>
                            <div className="rounded-xl bg-border/20 p-3 text-center">
                                <p className="text-[18px] font-bold text-primary">{rec.prediction.conversion_percent}%</p>
                                <p className="text-[10px] text-muted uppercase tracking-wider mt-0.5">Conversão</p>
                            </div>
                            <div className="rounded-xl p-3 text-center" style={{ backgroundColor: `${config.color}10` }}>
                                <p className="text-[16px] font-bold" style={{ color: config.color }}>{fmtBRL(rec.prediction.projected_revenue)}</p>
                                <p className="text-[10px] text-muted uppercase tracking-wider mt-0.5">Receita Projetada</p>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

// ── Main Page ────────────────────────────────────────────

export default function CampaignRecommendationsPage() {
    const [data, setData] = useState<CampaignRecommendation | null>(null);
    const [history, setHistory] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [generating, setGenerating] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const fetchData = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await agentApi.getCampaignRecommendations();
            if (res.success && res.data) {
                setData(res.data.latest || null);
                setHistory(res.data.history || []);
            }
        } catch (err: any) {
            setError(err.message || 'Erro ao carregar recomendações');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { fetchData(); }, [fetchData]);

    const handleGenerate = async () => {
        setGenerating(true);
        setError(null);
        try {
            const res = await agentApi.generateCampaignRecommendations();
            if (res.success && res.data) {
                setData(res.data);
                await fetchData(); // Refresh history
            } else {
                setError(res.error || 'Erro ao gerar recomendações');
            }
        } catch (err: any) {
            setError(err.message || 'Erro ao gerar recomendações');
        } finally {
            setGenerating(false);
        }
    };

    const handleStatusUpdate = async (id: string, status: 'approved' | 'dismissed') => {
        try {
            const res = await agentApi.updateCampaignRecommendationStatus(id, status);
            if (res.success) {
                setData((prev) => prev ? { ...prev, status } : null);
                // Also update history
                setHistory((prev) => prev.map((h) => h.id === id ? { ...h, status } : h));
            }
        } catch (err: any) {
            console.error('Erro ao atualizar status:', err);
        }
    };

    const segments = data?.segments || [];
    const recs = data?.recommendations?.recommendations || [];
    const summary = data?.recommendations?.overall_summary || '';
    const prioritySegment = data?.recommendations?.priority_segment || '';

    // Calculate total projected revenue across all recommendations
    const totalProjectedRevenue = recs.reduce((s, r) => s + (r.prediction?.projected_revenue || 0), 0);
    const totalClients = segments.reduce((s, seg) => s + seg.count, 0);

    return (
        <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
            {/* Header */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-8">
                <div className="flex items-center gap-3">
                    <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-linear-to-br from-fuchsia-500/20 to-purple-600/10">
                        <Megaphone size={24} className="text-fuchsia-500" />
                    </div>
                    <div>
                        <h1 className="text-[22px] font-bold text-primary tracking-tight">Campanhas Inteligentes</h1>
                        <p className="text-[13px] text-muted">Recomendações de marketing personalizadas por segmento de clientes</p>
                    </div>
                </div>
                <button
                    onClick={handleGenerate}
                    disabled={generating}
                    className="flex items-center gap-2 px-5 py-2.5 max-sm:py-3 rounded-xl text-[13px] font-semibold text-white transition-all duration-200 hover:shadow-lg disabled:opacity-60 disabled:cursor-not-allowed active:scale-[0.97]"
                    style={{ background: 'linear-gradient(135deg, #a855f7, #ec4899)' }}
                >
                    {generating ? (
                        <>
                            <RefreshCw size={15} className="animate-spin" />
                            Gerando com IA...
                        </>
                    ) : (
                        <>
                            <Sparkles size={15} />
                            Gerar Recomendações
                        </>
                    )}
                </button>
            </div>

            {/* Error */}
            {error && (
                <div className="mb-6 flex items-center gap-3 rounded-xl border border-red-500/20 bg-red-500/5 p-4 text-[13px] text-red-400">
                    <AlertCircle size={16} />
                    {error}
                </div>
            )}

            {/* Loading */}
            {loading && !data && (
                <div className="flex flex-col items-center justify-center py-20">
                    <RefreshCw size={24} className="animate-spin text-muted mb-3" />
                    <p className="text-[13px] text-muted">Carregando recomendações...</p>
                </div>
            )}

            {/* Empty state */}
            {!loading && !data && (
                <div className="flex flex-col items-center justify-center py-20 text-center">
                    <div className="flex h-20 w-20 items-center justify-center rounded-3xl bg-linear-to-br from-fuchsia-500/10 to-purple-600/5 mb-5">
                        <Megaphone size={36} className="text-fuchsia-400/60" />
                    </div>
                    <h2 className="text-[17px] font-semibold text-primary mb-2">Nenhuma recomendação gerada ainda</h2>
                    <p className="text-[13px] text-muted max-w-md mb-6">
                        Clique em "Gerar Recomendações" para que a IA analise seus clientes e crie campanhas personalizadas para cada segmento.
                    </p>
                    <button
                        onClick={handleGenerate}
                        disabled={generating}
                        className="flex items-center gap-2 px-6 py-3 max-sm:py-3.5 rounded-xl text-[13px] font-semibold text-white transition-all hover:shadow-lg disabled:opacity-60 active:scale-[0.97]"
                        style={{ background: 'linear-gradient(135deg, #a855f7, #ec4899)' }}
                    >
                        <Sparkles size={15} />
                        Gerar Primeira Recomendação
                    </button>
                </div>
            )}

            {/* Main content */}
            {data && (
                <div className="space-y-8">
                    {/* Status bar */}
                    <div className="flex flex-wrap items-center gap-3">
                        <span
                            className="px-3 py-1 rounded-full text-[12px] font-semibold"
                            style={{ backgroundColor: STATUS_CONFIG[data.status]?.bg, color: STATUS_CONFIG[data.status]?.color }}
                        >
                            {STATUS_CONFIG[data.status]?.label}
                        </span>
                        <span className="text-[12px] text-muted">Gerada em {fmtDate(data.created_at)}</span>
                        {data.status === 'generated' && (
                            <div className="flex gap-2 ml-auto">
                                <button
                                    onClick={() => handleStatusUpdate(data.id, 'approved')}
                                    className="flex items-center gap-1.5 px-3 py-1.5 max-sm:py-2.5 rounded-lg text-[12px] font-medium text-emerald-500 bg-emerald-500/10 hover:bg-emerald-500/20 transition-colors"
                                >
                                    <Check size={13} />
                                    Aprovar
                                </button>
                                <button
                                    onClick={() => handleStatusUpdate(data.id, 'dismissed')}
                                    className="flex items-center gap-1.5 px-3 py-1.5 max-sm:py-2.5 rounded-lg text-[12px] font-medium text-gray-400 bg-gray-500/10 hover:bg-gray-500/20 transition-colors"
                                >
                                    <X size={13} />
                                    Descartar
                                </button>
                            </div>
                        )}
                    </div>

                    {/* Summary Banner */}
                    {summary && (
                        <div className="rounded-2xl border border-border/40 bg-linear-to-r from-fuchsia-500/5 to-purple-600/5 p-5">
                            <div className="flex items-start gap-3">
                                <TrendingUp size={20} className="text-fuchsia-500 mt-0.5 shrink-0" />
                                <div>
                                    <p className="text-[13px] text-primary leading-relaxed">{summary}</p>
                                    {prioritySegment && (
                                        <p className="text-[12px] text-muted mt-2">
                                            Segmento prioritário: <span className="font-semibold text-primary">{SEGMENT_CONFIG[prioritySegment]?.emoji} {segments.find(s => s.name === prioritySegment)?.label || prioritySegment}</span>
                                        </p>
                                    )}
                                </div>
                            </div>
                            {/* Metrics summary */}
                            <div className="flex flex-wrap gap-6 mt-4 pt-4 border-t border-border/30">
                                <div>
                                    <p className="text-[10px] uppercase tracking-wider text-muted font-medium">Segmentos</p>
                                    <p className="text-[17px] font-bold text-primary">{segments.filter(s => s.count > 0).length}</p>
                                </div>
                                <div>
                                    <p className="text-[10px] uppercase tracking-wider text-muted font-medium">Clientes Alcançados</p>
                                    <p className="text-[17px] font-bold text-primary">{totalClients.toLocaleString('pt-BR')}</p>
                                </div>
                                <div>
                                    <p className="text-[10px] uppercase tracking-wider text-muted font-medium">Receita Projetada Total</p>
                                    <p className="text-[17px] font-bold text-fuchsia-500">{fmtBRL(totalProjectedRevenue)}</p>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Segment Cards */}
                    <div>
                        <h2 className="text-[14px] font-semibold text-primary mb-4 flex items-center gap-2">
                            <Users size={16} />
                            Segmentos Identificados
                        </h2>
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
                            {segments.filter(s => s.count > 0).map((seg) => (
                                <SegmentCard key={seg.name} segment={seg} />
                            ))}
                        </div>
                    </div>

                    {/* Recommendations */}
                    <div>
                        <h2 className="text-[14px] font-semibold text-primary mb-4 flex items-center gap-2">
                            <Megaphone size={16} />
                            Recomendações por Segmento
                            <span className="text-[11px] text-muted font-normal ml-1">(clique para expandir)</span>
                        </h2>
                        <div className="space-y-3">
                            {recs.map((rec) => (
                                <RecommendationCard
                                    key={rec.segment}
                                    rec={rec}
                                    segment={segments.find((s) => s.name === rec.segment)}
                                />
                            ))}
                        </div>
                    </div>

                    {/* History */}
                    {history.length > 1 && (
                        <div>
                            <h2 className="text-[14px] font-semibold text-primary mb-4 flex items-center gap-2">
                                <Clock size={16} />
                                Histórico de Recomendações
                            </h2>
                            <div className="space-y-2">
                                {history.slice(1).map((item: any) => (
                                    <div key={item.id} className="flex items-center justify-between rounded-xl border border-border/30 bg-card p-3.5 transition-colors hover:border-border/50">
                                        <div className="flex items-center gap-3">
                                            <span
                                                className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold"
                                                style={{ backgroundColor: STATUS_CONFIG[item.status]?.bg, color: STATUS_CONFIG[item.status]?.color }}
                                            >
                                                {STATUS_CONFIG[item.status]?.label}
                                            </span>
                                            <span className="text-[12px] text-muted">{fmtDate(item.created_at)}</span>
                                        </div>
                                        <span className="text-[12px] text-muted">
                                            {(item.segments || []).reduce((s: number, seg: any) => s + (seg.count || 0), 0)} clientes
                                        </span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
