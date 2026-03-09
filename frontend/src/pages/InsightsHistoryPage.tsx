import React, { useState, useEffect } from 'react';
import { agentApi } from '../services/agentApi';
import type { AutoInsight, InsightStatus } from '../types/insights';
import { InsightCard } from '../components/Dashboard/InsightCard';
import { InsightDetailModal } from '../components/Dashboard/InsightDetailModal';
import { ChevronLeft, Filter, Search, Sparkles, Download } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useBrandPrimaryColor } from '../hooks/useBrandPrimaryColor';
import { InsightsPanel } from '../components/Dashboard/InsightsPanel';

const InsightsHistoryPage: React.FC = () => {
    const navigate = useNavigate();
    const brandPrimaryColor = useBrandPrimaryColor();
    const [insights, setInsights] = useState<AutoInsight[]>([]);
    const [loading, setLoading] = useState(true);
    const [page, setPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const [selectedInsight, setSelectedInsight] = useState<AutoInsight | null>(null);

    const [category, setCategory] = useState('all');
    const [priority, setPriority] = useState('all');

    const handleExportCSV = () => {
        if (!insights.length) return;

        // Headers in Portuguese for consistency
        const headers = ['Data', 'Categoria', 'Prioridade', 'Titulo', 'Descricao', 'Impacto', 'Acoes Recomendadas'];
        const csvContent = [
            headers.join(','),
            ...insights.map(i => [
                new Date(i.created_at).toLocaleString('pt-BR'),
                i.category,
                i.priority,
                `"${i.title.replace(/"/g, '""')}"`,
                `"${i.description.replace(/"/g, '""')}"`,
                `${i.importance_score}%`,
                `"${i.recommended_actions?.join(' | ').replace(/"/g, '""')}"`
            ].join(','))
        ].join('\n');

        const blob = new Blob([new Uint8Array([0xEF, 0xBB, 0xBF]), csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        const url = URL.createObjectURL(blob);
        link.setAttribute('href', url);
        link.setAttribute('download', `atrio_insights_${new Date().toISOString().split('T')[0]}.csv`);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    const fetchHistory = async () => {
        setLoading(true);
        try {
            const result = await agentApi.getDailyInsightsHistory({
                page,
                limit: 12,
                category: category !== 'all' ? category : undefined,
                priority: priority !== 'all' ? priority : undefined
            });

            if (result.success && result.data) {
                setInsights(result.data.insights);
                setTotalPages(result.data.totalPages);
            }
        } catch (error) {
            console.error('Erro ao buscar histórico:', error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchHistory();
    }, [page, category, priority]);

    const handleUpdateStatus = async (id: string, status: InsightStatus) => {
        try {
            await agentApi.updateInsightStatus(id, status);
            // Refresh local state
            setInsights(prev => prev.map(ins => ins.id === id ? { ...ins, status } : ins));
            if (selectedInsight?.id === id) {
                setSelectedInsight(prev => prev ? { ...prev, status } : null);
            }
        } catch (error) {
            console.error('Erro ao atualizar status:', error);
        }
    };

    return (
        <div className="p-6 max-w-7xl mx-auto animate-in fade-in duration-500">
            {/* Header */}
            <div className="flex items-center justify-between mb-8">
                <div className="flex items-center gap-4">
                    <button
                        onClick={() => navigate(-1)}
                        className="p-2 hover:bg-muted/10 rounded-full transition-colors group"
                    >
                        <ChevronLeft className="w-6 h-6 text-muted group-hover:text-primary" />
                    </button>
                    <div>
                        <div className="flex items-center gap-2 mb-1">
                            <div
                                className="flex h-6 w-6 items-center justify-center rounded-lg"
                                style={{ backgroundColor: brandPrimaryColor ? `${brandPrimaryColor}1A` : 'rgba(4, 4, 166, 0.1)' }}
                            >
                                <Sparkles size={14} style={{ color: brandPrimaryColor || 'var(--color-brand-primary)' }} strokeWidth={2.5} />
                            </div>
                            <span className="flex h-5 items-center rounded-full bg-brand-primary/10 px-2.5 text-[10px] font-extrabold text-brand-primary uppercase tracking-wider">
                                IA Proativa
                            </span>
                        </div>
                        <h1 className="text-2xl font-bold text-primary tracking-tight">Insights Automáticos</h1>
                        <p className="text-muted text-sm font-medium">Reveja todas as análises e recomendações da IA.</p>
                    </div>
                </div>
            </div>

            <InsightsPanel onSelectInsight={setSelectedInsight} />

            <div className="flex items-center gap-2 mb-4">
                <h2 className="text-lg font-bold text-primary tracking-tight">Histórico Completo</h2>
            </div>

            {/* Filters Bar */}
            <div className="bg-muted/5 p-4 rounded-xl shadow-sm border border-border/50 mb-6 flex flex-wrap gap-4 items-center backdrop-blur-sm">
                <div className="flex items-center gap-2 text-muted mr-2">
                    <Filter className="w-4 h-4" />
                    <span className="text-sm font-medium">Filtros:</span>
                </div>

                <select
                    value={category}
                    onChange={(e) => { setCategory(e.target.value); setPage(1); }}
                    className="bg-card border border-border text-primary text-sm rounded-xl focus:ring-brand-primary focus:ring-2 focus:border-brand-primary p-2.5 outline-none transition-all shadow-sm"
                >
                    <option value="all">Todas as Categorias</option>
                    <option value="vendas">Vendas</option>
                    <option value="clientes">Clientes</option>
                    <option value="financeiro">Financeiro</option>
                    <option value="estoque">Estoque</option>
                    <option value="marketing">Marketing</option>
                    <option value="operacional">Operacional</option>
                </select>

                <select
                    value={priority}
                    onChange={(e) => { setPriority(e.target.value); setPage(1); }}
                    className="bg-card border border-border text-primary text-sm rounded-xl focus:ring-brand-primary focus:ring-2 focus:border-brand-primary p-2.5 outline-none transition-all shadow-sm"
                >
                    <option value="all">Todas as Prioridades</option>
                    <option value="critical">Crítica</option>
                    <option value="high">Alta</option>
                    <option value="medium">Média</option>
                    <option value="low">Baixa</option>
                </select>

                <div className="flex-1"></div>

                <div className="flex items-center gap-4">
                    <div className="text-[12px] font-bold text-muted uppercase tracking-wider hidden sm:block">
                        {insights.length} insights
                    </div>
                    <button
                        onClick={handleExportCSV}
                        className="flex items-center gap-2 px-4 py-2.5 bg-muted/10 border border-border rounded-xl font-bold text-sm text-secondary hover:bg-muted/20 transition-all shadow-sm"
                    >
                        <Download className="w-4 h-4" />
                        <span className="hidden sm:inline">Exportar CSV</span>
                    </button>
                </div>
            </div>

            {/* Grid */}
            {loading ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {[...Array(6)].map((_, i) => (
                        <div key={i} className="h-64 bg-card border border-border/50 rounded-2xl animate-pulse" />
                    ))}
                </div>
            ) : insights.length > 0 ? (
                <>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {insights.map((insight) => (
                            <InsightCard
                                key={insight.id}
                                insight={insight}
                                onClick={() => setSelectedInsight(insight)}
                            />
                        ))}
                    </div>

                    {/* Pagination */}
                    {totalPages > 1 && (
                        <div className="flex justify-center mt-12 gap-3">
                            <button
                                disabled={page === 1}
                                onClick={() => setPage(p => p - 1)}
                                className="px-6 py-2.5 bg-muted/10 border border-border rounded-xl font-bold text-sm text-secondary hover:bg-muted/20 disabled:opacity-30 disabled:cursor-not-allowed transition-all shadow-sm"
                            >
                                Anterior
                            </button>
                            <div className="flex items-center px-4 font-extrabold text-sm text-primary bg-muted/5 rounded-xl border border-border">
                                {page} / {totalPages}
                            </div>
                            <button
                                disabled={page === totalPages}
                                onClick={() => setPage(p => p + 1)}
                                className="px-6 py-2.5 bg-muted/10 border border-border rounded-xl font-bold text-sm text-secondary hover:bg-muted/20 disabled:opacity-30 disabled:cursor-not-allowed transition-all shadow-sm"
                            >
                                Próxima
                            </button>
                        </div>
                    )}
                </>
            ) : (
                <div className="text-center py-20 bg-muted/5 rounded-2xl border-2 border-dashed border-border">
                    <Search className="w-12 h-12 text-muted/30 mx-auto mb-4" />
                    <h3 className="text-lg font-medium text-primary">Nenhum insight encontrado</h3>
                    <p className="text-muted">Tente ajustar seus filtros para encontrar o que procura.</p>
                </div>
            )}

            {/* Detail Modal */}
            <InsightDetailModal
                isOpen={selectedInsight !== null}
                insight={selectedInsight}
                onClose={() => setSelectedInsight(null)}
                onStatusUpdate={(id, status) => handleUpdateStatus(id, status)}
            />
        </div>
    );
};

export default InsightsHistoryPage;
