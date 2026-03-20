import { memo } from 'react';
import {
    TrendingUp,
    Users,
    Box,
    Wallet,
    Megaphone,
    Settings,
    ArrowRight,
    Sparkles
} from 'lucide-react';
import type { AutoInsight, InsightCategory, InsightPriority } from '../../types/insights';
import { useBrandPrimaryColor } from '../../hooks/useBrandPrimaryColor';

interface InsightCardProps {
    insight: AutoInsight;
    onClick: (insight: AutoInsight) => void;
}

const categoryIcons: Record<InsightCategory, any> = {
    vendas: TrendingUp,
    clientes: Users,
    estoque: Box,
    financeiro: Wallet,
    marketing: Megaphone,
    operacional: Settings
};

const priorityColors: Record<InsightPriority, string> = {
    critical: 'text-shopee bg-shopee/10 border-shopee/20',
    high: 'text-orange-500 bg-orange-500/10 border-orange-500/20',
    medium: 'text-blue-500 bg-blue-500/10 border-blue-500/20',
    low: 'text-muted bg-muted/10 border-muted/20'
};

export const InsightCard = memo(function InsightCard({ insight, onClick }: InsightCardProps) {
    const Icon = categoryIcons[insight.category] || Sparkles;
    const brandPrimaryColor = useBrandPrimaryColor();
    const isPriorityHigh = insight.priority === 'critical' || insight.priority === 'high';

    return (
        <div
            onClick={() => onClick(insight)}
            className="group relative flex flex-col min-w-[260px] max-w-[350px] h-[180px] max-sm:min-w-0 max-sm:max-w-none max-sm:h-auto p-5 rounded-2xl bg-card border border-border shadow-soft hover:shadow-soft-hover transition-all duration-300 cursor-pointer overflow-hidden"
        >
            {/* Background Glow for High Priority */}
            {isPriorityHigh && (
                <div
                    className="absolute -right-10 -top-10 w-32 h-32 blur-[60px] opacity-20 pointer-events-none"
                    style={{ backgroundColor: insight.priority === 'critical' ? '#EE4D2D' : (brandPrimaryColor || '#0404A6') }}
                />
            )}

            <div className="flex items-start justify-between mb-3">
                <div
                    className="flex h-10 w-10 items-center justify-center rounded-xl transition-transform duration-300 group-hover:scale-110"
                    style={{ backgroundColor: 'rgba(4, 4, 166, 0.08)' }}
                >
                    <Icon size={20} style={{ color: brandPrimaryColor || 'var(--color-brand-primary)' }} strokeWidth={2} />
                </div>

                <div className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border ${priorityColors[insight.priority]}`}>
                    {insight.priority}
                </div>
            </div>

            <div className="flex-1 min-w-0">
                <h3 className="text-[15px] font-bold text-primary line-clamp-1 mb-1 group-hover:text-brand-primary transition-colors">
                    {insight.title}
                </h3>
                <p className="text-[12px] text-secondary line-clamp-2 leading-relaxed">
                    {insight.description}
                </p>
            </div>

            <div className="mt-auto flex items-center justify-between pt-3">
                <div className="flex items-center gap-1.5">
                    <div className="h-1 w-12 bg-border rounded-full overflow-hidden">
                        <div
                            className="h-full rounded-full transition-all duration-1000"
                            style={{
                                width: `${insight.importance_score}%`,
                                backgroundColor: brandPrimaryColor || 'var(--color-brand-primary)'
                            }}
                        />
                    </div>
                    <span className="text-[10px] font-medium text-muted">{insight.importance_score}% impact</span>
                </div>

                <div className="flex items-center gap-1 text-[11px] font-bold text-brand-primary group-hover:translate-x-1 transition-transform">
                    Ver Detalhes <ArrowRight size={14} />
                </div>
            </div>

            {/* Status indicator if new */}
            {insight.status === 'new' && (
                <div className="absolute top-2 right-2 flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-brand-primary opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-brand-primary"></span>
                </div>
            )}
        </div>
    );
});
