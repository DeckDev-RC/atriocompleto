import { X, Sparkles, CheckCircle2, TrendingUp, Users, Box, Wallet, Megaphone, Settings, Check, RefreshCw, ExternalLink } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { AutoInsight, InsightCategory, InsightPriority } from '../../types/insights';
import { useBrandPrimaryColor } from '../../hooks/useBrandPrimaryColor';
import { agentApi } from '../../services/agentApi';

interface InsightDetailModalProps {
    isOpen: boolean;
    onClose: () => void;
    insight: AutoInsight | null;
    onStatusUpdate: (id: string, newStatus: 'resolved' | 'ignored') => void;
}

const categoryIcons: Record<InsightCategory, any> = {
    vendas: TrendingUp,
    clientes: Users,
    estoque: Box,
    financeiro: Wallet,
    marketing: Megaphone,
    operacional: Settings
};

const priorityLabels: Record<InsightPriority, string> = {
    critical: 'Crítico',
    high: 'Alta',
    medium: 'Média',
    low: 'Baixa'
};

const categoryLabels: Record<InsightCategory, string> = {
    vendas: 'Vendas',
    clientes: 'Clientes',
    estoque: 'Estoque',
    financeiro: 'Financeiro',
    marketing: 'Marketing',
    operacional: 'Operacional'
};

export function InsightDetailModal({ isOpen, onClose, insight, onStatusUpdate }: InsightDetailModalProps) {
    const [updating, setUpdating] = useState(false);
    const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
    const brandPrimaryColor = useBrandPrimaryColor();
    const navigate = useNavigate();

    if (!isOpen || !insight) return null;

    const Icon = categoryIcons[insight.category] || Sparkles;

    const showToast = (message: string, type: 'success' | 'error' = 'success') => {
        setToast({ message, type });
        setTimeout(() => setToast(null), 3000);
    };

    const handleUpdateStatus = async (status: 'resolved' | 'ignored') => {
        try {
            setUpdating(true);
            const response = await agentApi.updateInsightStatus(insight.id, status);
            if (response.success) {
                onStatusUpdate(insight.id, status);
                onClose();
            }
        } catch (err) {
            console.error('Error updating insight status:', err);
        } finally {
            setUpdating(false);
        }
    };

    const handleExecuteAction = async (action: string, label: string) => {
        try {
            setUpdating(true);
            const response = await agentApi.executeInsightAction(insight.id, action);
            if (response.success) {
                showToast(response.data?.message || `Ação "${label}" executada com sucesso!`);
                await handleUpdateStatus('resolved');
            } else {
                showToast(`Erro ao executar: ${response.error || 'Desconhecido'}`, 'error');
            }
        } catch (err) {
            console.error('Error executing action:', err);
            showToast('Falha na conexão com o servidor.', 'error');
        } finally {
            setUpdating(false);
        }
    };

    return (
        <div
            className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-black/60 backdrop-blur-md animate-in fade-in duration-300"
            onClick={onClose}
        >
            <div
                className="relative w-full max-w-2xl bg-card rounded-3xl border border-border shadow-2xl overflow-hidden animate-in zoom-in-95 slide-in-from-bottom-4 duration-400"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header with Background Decorative Element */}
                <div className="absolute top-0 right-0 w-64 h-64 bg-brand-primary/5 rounded-full -translate-y-1/2 translate-x-1/2 blur-3xl pointer-events-none" />

                <div className="relative flex items-center justify-between p-6 border-b border-border">
                    <div className="flex items-center gap-4">
                        <div
                            className="flex h-12 w-12 items-center justify-center rounded-2xl shadow-soft"
                            style={{ backgroundColor: 'rgba(4, 4, 166, 0.08)' }}
                        >
                            <Icon size={24} style={{ color: brandPrimaryColor || 'var(--color-brand-primary)' }} strokeWidth={2} />
                        </div>
                        <div>
                            <div className="flex items-center gap-2 mb-0.5">
                                <span className="text-[10px] font-bold uppercase tracking-widest text-muted">{categoryLabels[insight.category]}</span>
                                <span className="h-1 w-1 bg-border rounded-full" />
                                <span className={`text-[10px] font-bold uppercase tracking-widest ${insight.priority === 'critical' ? 'text-shopee' : 'text-brand-primary'
                                    }`}>Prioridade {priorityLabels[insight.priority]}</span>
                            </div>
                            <h3 className="text-xl font-bold text-primary tracking-tight">Insight da IA</h3>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-2.5 rounded-full hover:bg-muted/10 text-muted transition-colors"
                    >
                        <X size={20} />
                    </button>
                </div>

                <div className="p-8 space-y-8 max-h-[70vh] overflow-y-auto custom-scrollbar">
                    {/* Main Content */}
                    <div className="space-y-4">
                        <h2 className="text-[22px] font-extrabold text-primary leading-tight tracking-tight">
                            {insight.title}
                        </h2>
                        <div className="prose prose-sm dark:prose-invert max-w-none text-secondary leading-relaxed">
                            {insight.description.split('\n\n').map((para, i) => (
                                <p key={i} className="mb-4 last:mb-0">{para}</p>
                            ))}
                        </div>
                    </div>

                    {/* Recommended Actions */}
                    {insight.recommended_actions?.length > 0 && (
                        <div className="space-y-4">
                            <div className="flex items-center gap-2">
                                <CheckCircle2 size={18} className="text-success" />
                                <h4 className="text-[15px] font-bold text-primary">Ações Recomendadas</h4>
                            </div>
                            <div className="grid gap-3">
                                {insight.recommended_actions.map((item: any, index: number) => {
                                    const isObject = typeof item === 'object' && item !== null;
                                    const label = isObject ? item.label : item;
                                    const action = isObject ? item.action : null;

                                    return (
                                        <div
                                            key={index}
                                            className="flex items-center justify-between p-4 rounded-2xl bg-success/5 border border-success/10 group transition-colors hover:bg-success/8 shadow-sm"
                                        >
                                            <div className="flex items-start gap-3">
                                                <div className="mt-1 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-success/10 text-success text-[11px] font-bold">
                                                    {index + 1}
                                                </div>
                                                <span className="text-[13.5px] font-medium text-secondary">{label}</span>
                                            </div>

                                            {action && (
                                                <button
                                                    disabled={updating}
                                                    onClick={() => handleExecuteAction(action, label)}
                                                    className="px-3 py-1.5 rounded-lg bg-success/20 text-success text-[11px] font-bold uppercase tracking-wider hover:bg-success/30 transition-all disabled:opacity-50"
                                                >
                                                    Executar
                                                </button>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}

                    {/* Data Support / Evidence */}
                    {insight.data_support && (
                        <div className="p-5 rounded-2xl bg-muted/5 border border-dashed border-border">
                            <h4 className="text-[12px] font-bold text-muted uppercase tracking-wider mb-3">Dados de Suporte</h4>
                            <div className="grid grid-cols-2 gap-4">
                                {Object.entries(insight.data_support).map(([key, value]) => (
                                    <div key={key}>
                                        <p className="text-[10px] font-bold text-muted uppercase tracking-tight mb-0.5">{key.replace(/_/g, ' ')}</p>
                                        <p className="text-sm font-bold text-primary">{String(value)}</p>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>

                {/* Footer Actions */}
                <div className="p-6 bg-muted/5 border-t border-border flex flex-col md:flex-row justify-between items-center gap-6 md:gap-4 flex-wrap">
                    <div className="flex items-center gap-2">
                        <div className="h-2 w-2 rounded-full bg-brand-primary/40 animate-pulse" />
                        <span className="text-[11px] font-medium text-muted">Gerado proativamente às 07:00 AM</span>
                    </div>

                    <div className="flex flex-wrap items-center gap-3 w-full md:w-auto justify-center md:justify-end">
                        <button
                            disabled={updating}
                            onClick={() => handleUpdateStatus('ignored')}
                            className="flex-1 md:flex-none px-4 h-11 rounded-xl border border-border font-bold text-muted text-sm hover:bg-muted/5 hover:text-primary transition-all disabled:opacity-50 min-w-[100px]"
                        >
                            Ignorar
                        </button>

                        <button
                            onClick={() => {
                                // Redireciona para o histórico de insights
                                navigate('/insights/history');
                                onClose();
                            }}
                            className="flex-1 md:flex-none flex items-center justify-center gap-2 px-4 h-11 rounded-xl bg-muted/10 border border-border font-bold text-secondary text-sm hover:bg-muted/15 transition-all min-w-[130px]"
                        >
                            <ExternalLink size={16} />
                            Ver Histórico
                        </button>

                        <button
                            disabled={updating}
                            onClick={() => handleUpdateStatus('resolved')}
                            style={{ backgroundColor: brandPrimaryColor || 'var(--color-brand-primary)' }}
                            className="flex-1 md:flex-none flex items-center justify-center gap-2 px-6 h-11 rounded-xl text-white font-bold text-sm shadow-md hover:opacity-90 transition-all active:scale-[0.98] disabled:opacity-50 min-w-[180px]"
                        >
                            {updating ? <RefreshCw className="animate-spin" size={18} /> : <Check size={18} />}
                            Marcar como Resolvido
                        </button>
                    </div>
                </div>
                {/* Toast Notification */}
                {toast && (
                    <div className={`absolute bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-2 px-5 py-3.5 rounded-2xl shadow-2xl animate-in slide-in-from-bottom-5 fade-in zoom-in-95 duration-300 z-50 pointer-events-none ${toast.type === 'success' ? 'bg-success text-white' : 'bg-shopee text-white'}`}>
                        {toast.type === 'success' ? <CheckCircle2 size={20} strokeWidth={2.5} /> : <X size={20} strokeWidth={2.5} />}
                        <span className="text-[14px] font-bold tracking-tight whitespace-nowrap">{toast.message}</span>
                    </div>
                )}
            </div>
        </div>
    );
}
