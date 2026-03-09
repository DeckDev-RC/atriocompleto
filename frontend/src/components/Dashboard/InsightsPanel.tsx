import { useState, useEffect, useCallback } from 'react';
import { Sparkles, ChevronLeft, ChevronRight, RefreshCw } from 'lucide-react';
import type { AutoInsight } from '../../types/insights';
import { agentApi } from '../../services/agentApi';
import { InsightCard } from './InsightCard';
import { useBrandPrimaryColor } from '../../hooks/useBrandPrimaryColor';
import { SkeletonCard } from '../Skeleton';

interface InsightsPanelProps {
    onSelectInsight: (insight: AutoInsight) => void;
}

export function InsightsPanel({ onSelectInsight }: InsightsPanelProps) {
    const [insights, setInsights] = useState<AutoInsight[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const brandPrimaryColor = useBrandPrimaryColor();

    const fetchInsights = useCallback(async () => {
        try {
            setLoading(true);
            setError(null);
            const response = await agentApi.getDailyInsights();
            if (response.success && response.data) {
                setInsights(response.data);
            } else {
                setError(response.error || 'Falha ao carregar insights.');
            }
        } catch (err) {
            console.error('Error fetching insights:', err);
            setError('Erro de conexão com o servidor.');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchInsights();
    }, [fetchInsights]);

    if (loading) {
        return (
            <div className="mb-8 overflow-hidden">
                <div className="flex items-center gap-2 mb-4 px-1">
                    <div className="h-5 w-32 bg-border animate-pulse rounded" />
                </div>
                <div className="flex gap-4 overflow-x-auto pb-4 scrollbar-hide">
                    {[1, 2, 3].map(i => (
                        <div key={i} className="min-w-[300px]">
                            <SkeletonCard minHeight="180px" />
                        </div>
                    ))}
                </div>
            </div>
        );
    }

    if (error || insights.length === 0) {
        if (error) {
            return (
                <div className="mb-8 p-6 rounded-2xl bg-shopee/5 border border-shopee/10 flex flex-col items-center text-center">
                    <p className="text-shopee text-sm font-medium mb-3">{error}</p>
                    <button
                        onClick={fetchInsights}
                        className="flex items-center gap-2 px-4 py-2 bg-shopee text-white rounded-xl text-sm font-bold transition-transform hover:scale-105 active:scale-95"
                    >
                        <RefreshCw size={14} /> Tentar Novamente
                    </button>
                </div>
            );
        }
        return null; // Don't show anything if no insights
    }

    return (
        <div className="mb-8 relative group/panel">
            <div className="flex items-center justify-between mb-4 px-1">
                <div className="flex items-center gap-2">
                    <div
                        className="flex h-7 w-7 items-center justify-center rounded-lg"
                        style={{ backgroundColor: 'rgba(4, 4, 166, 0.1)' }}
                    >
                        <Sparkles size={16} style={{ color: brandPrimaryColor || 'var(--color-brand-primary)' }} strokeWidth={2.5} />
                    </div>
                    <h2 className="text-[17px] font-bold tracking-tight text-primary">Insights Automáticos</h2>
                    <span className="flex h-5 items-center rounded-full bg-brand-primary/10 px-2.5 text-[10px] font-extrabold text-brand-primary uppercase tracking-wider">
                        IA Proativa
                    </span>
                </div>

                <div className="flex items-center gap-2">
                    <button className="h-8 w-8 flex items-center justify-center rounded-full bg-card border border-border text-muted hover:text-primary transition-colors shadow-sm">
                        <ChevronLeft size={16} />
                    </button>
                    <button className="h-8 w-8 flex items-center justify-center rounded-full bg-card border border-border text-muted hover:text-primary transition-colors shadow-sm">
                        <ChevronRight size={16} />
                    </button>
                </div>
            </div>

            <div className="flex gap-5 overflow-x-auto pb-4 px-1 scrollbar-hide snap-x snap-mandatory">
                {insights.map((insight) => (
                    <div key={insight.id} className="snap-start">
                        <InsightCard
                            insight={insight}
                            onClick={onSelectInsight}
                        />
                    </div>
                ))}
            </div>
        </div>
    );
}
