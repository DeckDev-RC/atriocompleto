import { useState, useEffect, useCallback } from 'react';
import {
    BarChart3,
    Plus,
    Pencil,
    Trash2,
    RefreshCw,
    Sparkles,
    AlertTriangle,
    TrendingDown,
    TrendingUp,
    ArrowUpDown,
    Clock,
    Bell,
    Eye,
    Shield,
    Crosshair,
    Lightbulb,
    X,
    Check,
    Globe,
    Package,
    DollarSign,
    AlertCircle,
    Target,
    Zap,
    Award,
    Building2,
} from 'lucide-react';
import { agentApi } from '../services/agentApi';

// ── Format helpers ───────────────────────────────────────

function fmtBRL(value: number): string {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
}

function fmtDate(dateStr: string): string {
    return new Date(dateStr).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function fmtPct(value: number): string {
    return `${value > 0 ? '+' : ''}${value.toFixed(1)}%`;
}

// ── Tabs ─────────────────────────────────────────────────

type TabId = 'competitors' | 'comparison' | 'timeline' | 'alerts' | 'swot' | 'industry';

const TABS: { id: TabId; label: string; icon: typeof BarChart3 }[] = [
    { id: 'competitors', label: 'Concorrentes', icon: Globe },
    { id: 'comparison', label: 'Comparação', icon: ArrowUpDown },
    { id: 'timeline', label: 'Timeline', icon: Clock },
    { id: 'alerts', label: 'Alertas', icon: Bell },
    { id: 'swot', label: 'SWOT', icon: Sparkles },
    { id: 'industry', label: 'Setor', icon: Building2 },
];

// ── Competitor Form Modal ────────────────────────────────

function CompetitorModal({
    competitor,
    onSave,
    onClose,
}: {
    competitor?: any;
    onSave: (data: any) => Promise<void>;
    onClose: () => void;
}) {
    const [form, setForm] = useState({
        name: competitor?.name || '',
        website_url: competitor?.website_url || '',
        category: competitor?.category || 'direto',
        region: competitor?.region || '',
        notes: competitor?.notes || '',
    });
    const [saving, setSaving] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setSaving(true);
        await onSave(form);
        setSaving(false);
    };

    return (
        <div className="fixed inset-0 z-999 flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={onClose}>
            <div className="w-full max-w-lg rounded-2xl border border-border/40 bg-card p-6 shadow-2xl mx-4" onClick={(e) => e.stopPropagation()}>
                <div className="flex items-center justify-between mb-6">
                    <h3 className="text-[16px] font-bold text-primary">{competitor ? 'Editar Concorrente' : 'Novo Concorrente'}</h3>
                    <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-border/40 text-muted transition-colors">
                        <X size={18} />
                    </button>
                </div>
                <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                        <label className="block text-[12px] font-medium text-muted mb-1.5">Nome *</label>
                        <input
                            value={form.name}
                            onChange={(e) => setForm({ ...form, name: e.target.value })}
                            required
                            className="w-full rounded-xl border border-border/40 bg-transparent px-4 py-2.5 text-[13px] text-primary placeholder:text-muted/50 outline-none focus:border-(--color-brand-primary) transition-colors"
                            placeholder="Nome do concorrente"
                        />
                    </div>
                    <div>
                        <label className="block text-[12px] font-medium text-muted mb-1.5">Website</label>
                        <input
                            value={form.website_url}
                            onChange={(e) => setForm({ ...form, website_url: e.target.value })}
                            className="w-full rounded-xl border border-border/40 bg-transparent px-4 py-2.5 text-[13px] text-primary placeholder:text-muted/50 outline-none focus:border-(--color-brand-primary) transition-colors"
                            placeholder="https://..."
                        />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-[12px] font-medium text-muted mb-1.5">Categoria</label>
                            <select
                                value={form.category}
                                onChange={(e) => setForm({ ...form, category: e.target.value })}
                                className="w-full rounded-xl border border-border/40 bg-transparent px-4 py-2.5 text-[13px] text-primary outline-none focus:border-(--color-brand-primary) transition-colors"
                            >
                                <option value="direto">Direto</option>
                                <option value="indireto">Indireto</option>
                            </select>
                        </div>
                        <div>
                            <label className="block text-[12px] font-medium text-muted mb-1.5">Região</label>
                            <input
                                value={form.region}
                                onChange={(e) => setForm({ ...form, region: e.target.value })}
                                className="w-full rounded-xl border border-border/40 bg-transparent px-4 py-2.5 text-[13px] text-primary placeholder:text-muted/50 outline-none focus:border-(--color-brand-primary) transition-colors"
                                placeholder="Ex: São Paulo"
                            />
                        </div>
                    </div>
                    <div>
                        <label className="block text-[12px] font-medium text-muted mb-1.5">Observações</label>
                        <textarea
                            value={form.notes}
                            onChange={(e) => setForm({ ...form, notes: e.target.value })}
                            rows={2}
                            className="w-full rounded-xl border border-border/40 bg-transparent px-4 py-2.5 text-[13px] text-primary placeholder:text-muted/50 outline-none focus:border-(--color-brand-primary) transition-colors resize-none"
                            placeholder="Notas sobre este concorrente..."
                        />
                    </div>
                    <div className="flex gap-3 pt-2">
                        <button type="button" onClick={onClose} className="flex-1 rounded-xl border border-border/40 py-2.5 text-[13px] font-medium text-muted hover:bg-border/20 transition-colors">
                            Cancelar
                        </button>
                        <button
                            type="submit"
                            disabled={saving || !form.name.trim()}
                            className="flex-1 flex items-center justify-center gap-2 rounded-xl py-2.5 text-[13px] font-semibold text-white transition-all hover:shadow-lg disabled:opacity-60"
                            style={{ background: 'linear-gradient(135deg, #3b82f6, #6366f1)' }}
                        >
                            {saving ? <RefreshCw size={14} className="animate-spin" /> : <Check size={14} />}
                            {competitor ? 'Salvar' : 'Cadastrar'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}

// ── Product Form Modal ───────────────────────────────────

function ProductModal({
    product,
    competitorId: _competitorId,
    onSave,
    onClose,
}: {
    product?: any;
    competitorId: string;
    onSave: (data: any) => Promise<void>;
    onClose: () => void;
}) {
    const [form, setForm] = useState({
        product_name: product?.product_name || '',
        your_product_name: product?.your_product_name || '',
        current_price: product?.current_price || '',
        your_price: product?.your_price || '',
    });
    const [saving, setSaving] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setSaving(true);
        await onSave({
            ...form,
            current_price: form.current_price ? Number(form.current_price) : 0,
            your_price: form.your_price ? Number(form.your_price) : 0,
        });
        setSaving(false);
    };

    return (
        <div className="fixed inset-0 z-999 flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={onClose}>
            <div className="w-full max-w-lg rounded-2xl border border-border/40 bg-card p-6 shadow-2xl mx-4" onClick={(e) => e.stopPropagation()}>
                <div className="flex items-center justify-between mb-6">
                    <h3 className="text-[16px] font-bold text-primary">{product ? 'Editar Produto' : 'Monitorar Produto'}</h3>
                    <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-border/40 text-muted transition-colors">
                        <X size={18} />
                    </button>
                </div>
                <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                        <label className="block text-[12px] font-medium text-muted mb-1.5">Produto do Concorrente *</label>
                        <input
                            value={form.product_name}
                            onChange={(e) => setForm({ ...form, product_name: e.target.value })}
                            required
                            className="w-full rounded-xl border border-border/40 bg-transparent px-4 py-2.5 text-[13px] text-primary placeholder:text-muted/50 outline-none focus:border-(--color-brand-primary) transition-colors"
                            placeholder="Nome do produto no concorrente"
                        />
                    </div>
                    <div>
                        <label className="block text-[12px] font-medium text-muted mb-1.5">Seu Produto Equivalente</label>
                        <input
                            value={form.your_product_name}
                            onChange={(e) => setForm({ ...form, your_product_name: e.target.value })}
                            className="w-full rounded-xl border border-border/40 bg-transparent px-4 py-2.5 text-[13px] text-primary placeholder:text-muted/50 outline-none focus:border-(--color-brand-primary) transition-colors"
                            placeholder="Nome do seu produto equivalente"
                        />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-[12px] font-medium text-muted mb-1.5">Preço Concorrente (R$)</label>
                            <input
                                type="number"
                                step="0.01"
                                min="0"
                                value={form.current_price}
                                onChange={(e) => setForm({ ...form, current_price: e.target.value })}
                                className="w-full rounded-xl border border-border/40 bg-transparent px-4 py-2.5 text-[13px] text-primary placeholder:text-muted/50 outline-none focus:border-(--color-brand-primary) transition-colors"
                                placeholder="0.00"
                            />
                        </div>
                        <div>
                            <label className="block text-[12px] font-medium text-muted mb-1.5">Seu Preço (R$)</label>
                            <input
                                type="number"
                                step="0.01"
                                min="0"
                                value={form.your_price}
                                onChange={(e) => setForm({ ...form, your_price: e.target.value })}
                                className="w-full rounded-xl border border-border/40 bg-transparent px-4 py-2.5 text-[13px] text-primary placeholder:text-muted/50 outline-none focus:border-(--color-brand-primary) transition-colors"
                                placeholder="0.00"
                            />
                        </div>
                    </div>
                    <div className="flex gap-3 pt-2">
                        <button type="button" onClick={onClose} className="flex-1 rounded-xl border border-border/40 py-2.5 text-[13px] font-medium text-muted hover:bg-border/20 transition-colors">
                            Cancelar
                        </button>
                        <button
                            type="submit"
                            disabled={saving || !form.product_name.trim()}
                            className="flex-1 flex items-center justify-center gap-2 rounded-xl py-2.5 text-[13px] font-semibold text-white transition-all hover:shadow-lg disabled:opacity-60"
                            style={{ background: 'linear-gradient(135deg, #3b82f6, #6366f1)' }}
                        >
                            {saving ? <RefreshCw size={14} className="animate-spin" /> : <Check size={14} />}
                            {product ? 'Salvar' : 'Adicionar'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}

// ── Tab: Competitors ─────────────────────────────────────

function CompetitorsTab() {
    const [competitors, setCompetitors] = useState<any[]>([]);
    const [products, setProducts] = useState<Record<string, any[]>>({});
    const [loading, setLoading] = useState(true);
    const [showCompetitorModal, setShowCompetitorModal] = useState(false);
    const [editingCompetitor, setEditingCompetitor] = useState<any>(null);
    const [expandedCompetitor, setExpandedCompetitor] = useState<string | null>(null);
    const [showProductModal, setShowProductModal] = useState<string | null>(null);
    const [editingProduct, setEditingProduct] = useState<any>(null);

    const fetchCompetitors = useCallback(async () => {
        setLoading(true);
        const res = await agentApi.getCompetitors();
        if (res.success && res.data) setCompetitors(res.data);
        setLoading(false);
    }, []);

    useEffect(() => { fetchCompetitors(); }, [fetchCompetitors]);

    const fetchProducts = async (competitorId: string) => {
        const res = await agentApi.getCompetitorProducts(competitorId);
        if (res.success && res.data) {
            setProducts((prev: Record<string, any[]>) => ({ ...prev, [competitorId]: res.data! }));
        }
    };

    const toggleExpand = (id: string) => {
        if (expandedCompetitor === id) {
            setExpandedCompetitor(null);
        } else {
            setExpandedCompetitor(id);
            if (!products[id]) fetchProducts(id);
        }
    };

    const handleSaveCompetitor = async (data: any) => {
        if (editingCompetitor) {
            await agentApi.updateCompetitor(editingCompetitor.id, data);
        } else {
            await agentApi.createCompetitor(data);
        }
        setShowCompetitorModal(false);
        setEditingCompetitor(null);
        fetchCompetitors();
    };

    const handleDeleteCompetitor = async (id: string) => {
        await agentApi.deleteCompetitor(id);
        fetchCompetitors();
    };

    const handleSaveProduct = async (competitorId: string, data: any) => {
        if (editingProduct) {
            await agentApi.updateCompetitorProduct(editingProduct.id, data);
        } else {
            await agentApi.addCompetitorProduct(competitorId, data);
        }
        setShowProductModal(null);
        setEditingProduct(null);
        fetchProducts(competitorId);
    };

    const handleDeleteProduct = async (productId: string, competitorId: string) => {
        await agentApi.deleteCompetitorProduct(productId);
        fetchProducts(competitorId);
    };

    if (loading) {
        return (
            <div className="flex flex-col items-center justify-center py-20">
                <RefreshCw size={24} className="animate-spin text-muted mb-3" />
                <p className="text-[13px] text-muted">Carregando concorrentes...</p>
            </div>
        );
    }

    return (
        <div className="space-y-4">
            <div className="flex justify-end">
                <button
                    onClick={() => { setEditingCompetitor(null); setShowCompetitorModal(true); }}
                    className="flex items-center gap-2 px-4 py-2 rounded-xl text-[13px] font-semibold text-white transition-all hover:shadow-lg active:scale-[0.97]"
                    style={{ background: 'linear-gradient(135deg, #3b82f6, #6366f1)' }}
                >
                    <Plus size={15} /> Adicionar Concorrente
                </button>
            </div>

            {competitors.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-center">
                    <div className="flex h-20 w-20 items-center justify-center rounded-3xl bg-linear-to-br from-blue-500/10 to-indigo-600/5 mb-5">
                        <Globe size={36} className="text-blue-400/60" />
                    </div>
                    <h2 className="text-[17px] font-semibold text-primary mb-2">Nenhum concorrente cadastrado</h2>
                    <p className="text-[13px] text-muted max-w-md mb-6">Adicione seus concorrentes para começar a monitorar preços e gerar análises competitivas com IA.</p>
                </div>
            ) : (
                <div className="space-y-3">
                    {competitors.map((c) => (
                        <div key={c.id} className="rounded-2xl border border-border/40 bg-card overflow-hidden transition-all duration-200 hover:border-border/60">
                            {/* Competitor header */}
                            <div className="flex items-center justify-between p-4 cursor-pointer" onClick={() => toggleExpand(c.id)}>
                                <div className="flex items-center gap-3">
                                    <div className={`h-3 w-3 rounded-full ${c.category === 'direto' ? 'bg-red-400' : 'bg-amber-400'}`} />
                                    <div>
                                        <p className="text-[14px] font-semibold text-primary">{c.name}</p>
                                        <div className="flex items-center gap-2 mt-0.5">
                                            <span className="text-[11px] text-muted bg-border/30 px-2 py-0.5 rounded-full">{c.category}</span>
                                            {c.region && <span className="text-[11px] text-muted">📍 {c.region}</span>}
                                            {c.website_url && <span className="text-[11px] text-blue-400">🌐 {c.website_url}</span>}
                                        </div>
                                    </div>
                                </div>
                                <div className="flex items-center gap-2">
                                    <button
                                        onClick={(e) => { e.stopPropagation(); setEditingCompetitor(c); setShowCompetitorModal(true); }}
                                        className="p-1.5 rounded-lg hover:bg-border/40 text-muted transition-colors"
                                    >
                                        <Pencil size={14} />
                                    </button>
                                    <button
                                        onClick={(e) => { e.stopPropagation(); handleDeleteCompetitor(c.id); }}
                                        className="p-1.5 rounded-lg hover:bg-red-500/10 text-muted hover:text-red-400 transition-colors"
                                    >
                                        <Trash2 size={14} />
                                    </button>
                                    <Eye size={14} className={`text-muted transition-transform duration-200 ${expandedCompetitor === c.id ? 'rotate-180' : ''}`} />
                                </div>
                            </div>

                            {/* Products (expandable) */}
                            {expandedCompetitor === c.id && (
                                <div className="border-t border-border/30 px-4 pb-4 pt-3">
                                    <div className="flex items-center justify-between mb-3">
                                        <span className="text-[12px] font-semibold text-muted uppercase tracking-wider">Produtos Monitorados</span>
                                        <button
                                            onClick={() => { setEditingProduct(null); setShowProductModal(c.id); }}
                                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-medium text-blue-400 bg-blue-500/10 hover:bg-blue-500/20 transition-colors"
                                        >
                                            <Plus size={12} /> Produto
                                        </button>
                                    </div>

                                    {(!products[c.id] || products[c.id].length === 0) ? (
                                        <p className="text-[12px] text-muted text-center py-6">Nenhum produto monitorado. Adicione um produto para comparar preços.</p>
                                    ) : (
                                        <div className="space-y-2">
                                            {(products[c.id] || []).map((p: any) => {
                                                const diff = p.your_price > 0 ? ((Number(p.current_price) - Number(p.your_price)) / Number(p.your_price)) * 100 : 0;
                                                const statusColor = diff < -5 ? '#22c55e' : diff > 5 ? '#ef4444' : '#f59e0b';
                                                return (
                                                    <div key={p.id} className="flex items-center justify-between rounded-xl bg-border/10 p-3 group">
                                                        <div className="flex-1 min-w-0">
                                                            <p className="text-[13px] font-medium text-primary truncate">{p.product_name}</p>
                                                            {p.your_product_name && (
                                                                <p className="text-[11px] text-muted truncate">≈ {p.your_product_name}</p>
                                                            )}
                                                        </div>
                                                        <div className="flex items-center gap-4">
                                                            <div className="text-right">
                                                                <p className="text-[12px] text-muted">Concorrente</p>
                                                                <p className="text-[14px] font-bold text-primary">{fmtBRL(Number(p.current_price))}</p>
                                                            </div>
                                                            <div className="text-right">
                                                                <p className="text-[12px] text-muted">Seu Preço</p>
                                                                <p className="text-[14px] font-bold text-primary">{fmtBRL(Number(p.your_price))}</p>
                                                            </div>
                                                            <div className="text-right w-16">
                                                                <span className="text-[13px] font-bold" style={{ color: statusColor }}>{fmtPct(diff)}</span>
                                                            </div>
                                                            <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                                                <button
                                                                    onClick={() => { setEditingProduct(p); setShowProductModal(c.id); }}
                                                                    className="p-1 rounded hover:bg-border/40 text-muted"
                                                                >
                                                                    <Pencil size={12} />
                                                                </button>
                                                                <button
                                                                    onClick={() => handleDeleteProduct(p.id, c.id)}
                                                                    className="p-1 rounded hover:bg-red-500/10 text-muted hover:text-red-400"
                                                                >
                                                                    <Trash2 size={12} />
                                                                </button>
                                                            </div>
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            )}

            {showCompetitorModal && (
                <CompetitorModal
                    competitor={editingCompetitor}
                    onSave={handleSaveCompetitor}
                    onClose={() => { setShowCompetitorModal(false); setEditingCompetitor(null); }}
                />
            )}

            {showProductModal && (
                <ProductModal
                    product={editingProduct}
                    competitorId={showProductModal}
                    onSave={(data) => handleSaveProduct(showProductModal, data)}
                    onClose={() => { setShowProductModal(null); setEditingProduct(null); }}
                />
            )}
        </div>
    );
}

// ── Tab: Comparison ──────────────────────────────────────

function ComparisonTab() {
    const [data, setData] = useState<{ products: any[]; summary: any } | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        (async () => {
            setLoading(true);
            const res = await agentApi.getBenchmarkingComparison();
            if (res.success && res.data) setData(res.data);
            setLoading(false);
        })();
    }, []);

    if (loading) return <div className="flex justify-center py-20"><RefreshCw size={24} className="animate-spin text-muted" /></div>;
    if (!data || data.products.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center py-16 text-center">
                <Package size={36} className="text-muted/40 mb-4" />
                <h2 className="text-[17px] font-semibold text-primary mb-2">Nenhum produto para comparar</h2>
                <p className="text-[13px] text-muted max-w-md">Cadastre concorrentes e seus produtos na aba "Concorrentes" para ver a comparação de preços.</p>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Summary KPIs */}
            {data.summary && (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div className="rounded-xl border border-border/40 bg-card p-4">
                        <p className="text-[11px] uppercase tracking-wider text-muted font-medium">Produtos Monitorados</p>
                        <p className="text-[22px] font-bold text-primary mt-1">{data.summary.totalProducts}</p>
                    </div>
                    <div className="rounded-xl border border-border/40 bg-card p-4">
                        <p className="text-[11px] uppercase tracking-wider text-muted font-medium">Mais Baratos que Você</p>
                        <p className="text-[22px] font-bold text-red-400 mt-1">{data.summary.cheaperCount}</p>
                    </div>
                    <div className="rounded-xl border border-border/40 bg-card p-4">
                        <p className="text-[11px] uppercase tracking-wider text-muted font-medium">Mais Caros que Você</p>
                        <p className="text-[22px] font-bold text-emerald-400 mt-1">{data.summary.expensiveCount}</p>
                    </div>
                </div>
            )}

            {/* Comparison Table */}
            <div className="rounded-2xl border border-border/40 bg-card overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-left">
                        <thead>
                            <tr className="border-b border-border/30">
                                <th className="px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-muted">Produto</th>
                                <th className="px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-muted text-right">Seu Preço</th>
                                <th className="px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-muted">Concorrente</th>
                                <th className="px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-muted text-right">Preço</th>
                                <th className="px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-muted text-right">Diferença</th>
                                <th className="px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-muted text-center">Status</th>
                            </tr>
                        </thead>
                        <tbody>
                            {data.products.map((group: any, gi: number) =>
                                group.competitors.map((comp: any, ci: number) => (
                                    <tr key={`${gi}-${ci}`} className="border-b border-border/20 hover:bg-border/10 transition-colors">
                                        {ci === 0 && (
                                            <>
                                                <td className="px-4 py-3 text-[13px] font-medium text-primary" rowSpan={group.competitors.length}>
                                                    {group.your_product}
                                                </td>
                                                <td className="px-4 py-3 text-[13px] font-bold text-primary text-right" rowSpan={group.competitors.length}>
                                                    {fmtBRL(group.your_price)}
                                                </td>
                                            </>
                                        )}
                                        <td className="px-4 py-3 text-[13px] text-secondary">{comp.name}</td>
                                        <td className="px-4 py-3 text-[13px] font-semibold text-primary text-right">{fmtBRL(comp.price)}</td>
                                        <td className="px-4 py-3 text-right">
                                            <span className="text-[13px] font-bold" style={{ color: comp.status === 'cheaper' ? '#22c55e' : comp.status === 'expensive' ? '#ef4444' : '#f59e0b' }}>
                                                {fmtPct(comp.diff_pct)}
                                            </span>
                                        </td>
                                        <td className="px-4 py-3 text-center">
                                            <span
                                                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold"
                                                style={{
                                                    backgroundColor: comp.status === 'cheaper' ? '#22c55e15' : comp.status === 'expensive' ? '#ef444415' : '#f59e0b15',
                                                    color: comp.status === 'cheaper' ? '#22c55e' : comp.status === 'expensive' ? '#ef4444' : '#f59e0b',
                                                }}
                                            >
                                                {comp.status === 'cheaper' ? <TrendingDown size={12} /> : comp.status === 'expensive' ? <TrendingUp size={12} /> : <ArrowUpDown size={12} />}
                                                {comp.status === 'cheaper' ? 'Mais barato' : comp.status === 'expensive' ? 'Mais caro' : 'Similar'}
                                            </span>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}

// ── Tab: Timeline ────────────────────────────────────────

function TimelineTab() {
    const [_competitors, setCompetitors] = useState<any[]>([]);
    const [selectedProduct, setSelectedProduct] = useState<string | null>(null);
    const [allProducts, setAllProducts] = useState<any[]>([]);
    const [history, setHistory] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        (async () => {
            setLoading(true);
            const res = await agentApi.getCompetitors();
            if (res.success && res.data) {
                setCompetitors(res.data);
                // Load all products from all competitors
                const allProds: any[] = [];
                for (const c of res.data) {
                    const pRes = await agentApi.getCompetitorProducts(c.id);
                    if (pRes.success && pRes.data) {
                        allProds.push(...pRes.data.map((p: any) => ({ ...p, competitor_name: c.name })));
                    }
                }
                setAllProducts(allProds);
                if (allProds.length > 0) {
                    setSelectedProduct(allProds[0].id);
                }
            }
            setLoading(false);
        })();
    }, []);

    useEffect(() => {
        if (!selectedProduct) return;
        (async () => {
            const res = await agentApi.getProductPriceHistory(selectedProduct);
            if (res.success && res.data) setHistory(res.data);
        })();
    }, [selectedProduct]);

    if (loading) return <div className="flex justify-center py-20"><RefreshCw size={24} className="animate-spin text-muted" /></div>;

    if (allProducts.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center py-16 text-center">
                <Clock size={36} className="text-muted/40 mb-4" />
                <h2 className="text-[17px] font-semibold text-primary mb-2">Nenhum histórico de preços</h2>
                <p className="text-[13px] text-muted max-w-md">Cadastre produtos e atualize preços ao longo do tempo para gerar o histórico.</p>
            </div>
        );
    }

    const selectedProd = allProducts.find((p) => p.id === selectedProduct);

    return (
        <div className="space-y-6">
            {/* Product selector */}
            <div className="flex items-center gap-4">
                <label className="text-[12px] font-medium text-muted">Produto:</label>
                <select
                    value={selectedProduct || ''}
                    onChange={(e) => setSelectedProduct(e.target.value)}
                    className="flex-1 max-w-md rounded-xl border border-border/40 bg-transparent px-4 py-2.5 text-[13px] text-primary outline-none focus:border-(--color-brand-primary) transition-colors"
                >
                    {allProducts.map((p) => (
                        <option key={p.id} value={p.id}>{p.product_name} ({p.competitor_name})</option>
                    ))}
                </select>
            </div>

            {/* Current price card */}
            {selectedProd && (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div className="rounded-xl border border-border/40 bg-card p-4">
                        <p className="text-[11px] uppercase tracking-wider text-muted font-medium">Preço Concorrente Atual</p>
                        <p className="text-[22px] font-bold text-primary mt-1">{fmtBRL(Number(selectedProd.current_price))}</p>
                    </div>
                    <div className="rounded-xl border border-border/40 bg-card p-4">
                        <p className="text-[11px] uppercase tracking-wider text-muted font-medium">Seu Preço Atual</p>
                        <p className="text-[22px] font-bold text-primary mt-1">{fmtBRL(Number(selectedProd.your_price))}</p>
                    </div>
                    <div className="rounded-xl border border-border/40 bg-card p-4">
                        <p className="text-[11px] uppercase tracking-wider text-muted font-medium">Registros</p>
                        <p className="text-[22px] font-bold text-primary mt-1">{history.length}</p>
                    </div>
                </div>
            )}

            {/* Price history table */}
            {history.length > 0 ? (
                <div className="rounded-2xl border border-border/40 bg-card overflow-hidden">
                    <table className="w-full text-left">
                        <thead>
                            <tr className="border-b border-border/30">
                                <th className="px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-muted">Data</th>
                                <th className="px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-muted text-right">Preço Concorrente</th>
                                <th className="px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-muted text-right">Seu Preço</th>
                                <th className="px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-muted text-right">Diferença</th>
                            </tr>
                        </thead>
                        <tbody>
                            {history.map((h: any, i: number) => {
                                const diff = h.your_price_at_time > 0 ? ((Number(h.price) - Number(h.your_price_at_time)) / Number(h.your_price_at_time)) * 100 : 0;
                                const prevPrice = i > 0 ? Number(history[i - 1].price) : null;
                                const priceChange = prevPrice !== null ? Number(h.price) - prevPrice : null;
                                return (
                                    <tr key={h.id} className="border-b border-border/20 hover:bg-border/10 transition-colors">
                                        <td className="px-4 py-3 text-[13px] text-primary">{fmtDate(h.recorded_at)}</td>
                                        <td className="px-4 py-3 text-right">
                                            <span className="text-[13px] font-semibold text-primary">{fmtBRL(Number(h.price))}</span>
                                            {priceChange !== null && priceChange !== 0 && (
                                                <span className={`ml-2 text-[11px] font-medium ${priceChange > 0 ? 'text-red-400' : 'text-emerald-400'}`}>
                                                    {priceChange > 0 ? '↑' : '↓'} {fmtBRL(Math.abs(priceChange))}
                                                </span>
                                            )}
                                        </td>
                                        <td className="px-4 py-3 text-[13px] font-semibold text-primary text-right">{fmtBRL(Number(h.your_price_at_time))}</td>
                                        <td className="px-4 py-3 text-right">
                                            <span className="text-[12px] font-bold" style={{ color: diff < -5 ? '#22c55e' : diff > 5 ? '#ef4444' : '#f59e0b' }}>{fmtPct(diff)}</span>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            ) : (
                <p className="text-[13px] text-muted text-center py-8">Nenhum registro de preço para este produto. Atualize o preço para criar o histórico.</p>
            )}
        </div>
    );
}

// ── Tab: Alerts ──────────────────────────────────────────

function AlertsTab() {
    const [alerts, setAlerts] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        (async () => {
            setLoading(true);
            const res = await agentApi.getBenchmarkingAlerts();
            if (res.success && res.data) setAlerts(res.data);
            setLoading(false);
        })();
    }, []);

    if (loading) return <div className="flex justify-center py-20"><RefreshCw size={24} className="animate-spin text-muted" /></div>;

    if (alerts.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center py-16 text-center">
                <Bell size={36} className="text-muted/40 mb-4" />
                <h2 className="text-[17px] font-semibold text-primary mb-2">Nenhum alerta ativo</h2>
                <p className="text-[13px] text-muted max-w-md">Alertas aparecem quando há mudanças significativas de preço (±10%) ou quando concorrentes vendem bem mais barato.</p>
            </div>
        );
    }

    const iconMap: Record<string, typeof AlertTriangle> = {
        price_drop: TrendingDown,
        price_increase: TrendingUp,
        cheaper_competitor: AlertTriangle,
        suggestion: Lightbulb,
    };

    const colorMap: Record<string, { bg: string; text: string; border: string }> = {
        high: { bg: 'rgba(239,68,68,0.06)', text: '#ef4444', border: 'rgba(239,68,68,0.2)' },
        medium: { bg: 'rgba(245,158,11,0.06)', text: '#f59e0b', border: 'rgba(245,158,11,0.2)' },
        low: { bg: 'rgba(59,130,246,0.06)', text: '#3b82f6', border: 'rgba(59,130,246,0.2)' },
    };

    return (
        <div className="space-y-3">
            {alerts.map((alert, i) => {
                const Icon = iconMap[alert.type] || AlertCircle;
                const colors = colorMap[alert.severity] || colorMap.low;
                return (
                    <div
                        key={i}
                        className="rounded-2xl p-4 transition-all duration-200 hover:shadow-md"
                        style={{ backgroundColor: colors.bg, border: `1px solid ${colors.border}` }}
                    >
                        <div className="flex items-start gap-3">
                            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl" style={{ backgroundColor: `${colors.text}15` }}>
                                <Icon size={20} style={{ color: colors.text }} />
                            </div>
                            <div className="flex-1">
                                <p className="text-[13px] font-semibold text-primary">{alert.message}</p>
                                <div className="flex flex-wrap gap-3 mt-2">
                                    <span className="text-[11px] text-muted">📦 {alert.product}</span>
                                    <span className="text-[11px] text-muted">🏪 {alert.competitor}</span>
                                    {alert.data?.change_pct !== undefined && (
                                        <span className="text-[11px] font-bold" style={{ color: colors.text }}>
                                            {fmtPct(alert.data.change_pct)}
                                        </span>
                                    )}
                                </div>
                            </div>
                            <span
                                className="px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider shrink-0"
                                style={{ backgroundColor: `${colors.text}15`, color: colors.text }}
                            >
                                {alert.severity === 'high' ? 'Alto' : alert.severity === 'medium' ? 'Médio' : 'Baixo'}
                            </span>
                        </div>
                    </div>
                );
            })}
        </div>
    );
}

// ── Tab: SWOT ────────────────────────────────────────────

function SWOTTab() {
    const [swot, setSwot] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [generating, setGenerating] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        (async () => {
            setLoading(true);
            const res = await agentApi.getLatestBenchmarkingSWOT();
            if (res.success && res.data) setSwot(res.data);
            setLoading(false);
        })();
    }, []);

    const handleGenerate = async () => {
        setGenerating(true);
        setError(null);
        try {
            const res = await agentApi.generateBenchmarkingSWOT();
            if (res.success && res.data) {
                setSwot(res.data);
            } else {
                setError(res.error || 'Erro ao gerar análise SWOT');
            }
        } catch (err: any) {
            setError(err.message || 'Erro ao gerar SWOT');
        } finally {
            setGenerating(false);
        }
    };

    if (loading) return <div className="flex justify-center py-20"><RefreshCw size={24} className="animate-spin text-muted" /></div>;

    const swotData = swot?.swot_data;
    const priceSuggestions = swot?.price_suggestions || [];

    const quadrants: { key: string; label: string; icon: typeof Shield; color: string; gradient: string; items: string[] }[] = swotData ? [
        { key: 'strengths', label: 'Forças', icon: Shield, color: '#22c55e', gradient: 'from-emerald-500/10 to-emerald-600/5', items: swotData.strengths || [] },
        { key: 'weaknesses', label: 'Fraquezas', icon: AlertTriangle, color: '#ef4444', gradient: 'from-red-500/10 to-red-600/5', items: swotData.weaknesses || [] },
        { key: 'opportunities', label: 'Oportunidades', icon: Lightbulb, color: '#3b82f6', gradient: 'from-blue-500/10 to-blue-600/5', items: swotData.opportunities || [] },
        { key: 'threats', label: 'Ameaças', icon: Crosshair, color: '#f59e0b', gradient: 'from-amber-500/10 to-amber-600/5', items: swotData.threats || [] },
    ] : [];

    return (
        <div className="space-y-6">
            {/* Generate / Refresh */}
            <div className="flex items-center justify-between">
                <div>
                    {swot && (
                        <p className="text-[12px] text-muted">Última análise: {fmtDate(swot.created_at)}</p>
                    )}
                </div>
                <button
                    onClick={handleGenerate}
                    disabled={generating}
                    className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-[13px] font-semibold text-white transition-all hover:shadow-lg disabled:opacity-60 active:scale-[0.97]"
                    style={{ background: 'linear-gradient(135deg, #8b5cf6, #6366f1)' }}
                >
                    {generating ? (
                        <><RefreshCw size={15} className="animate-spin" /> Analisando com IA...</>
                    ) : (
                        <><Sparkles size={15} /> {swot ? 'Gerar Nova Análise' : 'Gerar Análise SWOT'}</>
                    )}
                </button>
            </div>

            {error && (
                <div className="flex items-center gap-3 rounded-xl border border-red-500/20 bg-red-500/5 p-4 text-[13px] text-red-400">
                    <AlertCircle size={16} /> {error}
                </div>
            )}

            {!swot && !generating && (
                <div className="flex flex-col items-center justify-center py-16 text-center">
                    <div className="flex h-20 w-20 items-center justify-center rounded-3xl bg-linear-to-br from-violet-500/10 to-indigo-600/5 mb-5">
                        <Sparkles size={36} className="text-violet-400/60" />
                    </div>
                    <h2 className="text-[17px] font-semibold text-primary mb-2">Análise SWOT Competitiva</h2>
                    <p className="text-[13px] text-muted max-w-md mb-6">A IA analisará seus dados de vendas + dados dos concorrentes para gerar uma análise SWOT com sugestões de preço.</p>
                </div>
            )}

            {swotData && (
                <>
                    {/* Executive Summary */}
                    {swotData.executive_summary && (
                        <div className="rounded-2xl border border-border/40 bg-linear-to-r from-violet-500/5 to-indigo-600/5 p-5">
                            <div className="flex items-start gap-3">
                                <BarChart3 size={20} className="text-violet-500 mt-0.5 shrink-0" />
                                <div>
                                    <p className="text-[11px] font-semibold uppercase tracking-wider text-muted mb-2">Resumo Executivo</p>
                                    <p className="text-[13px] text-primary leading-relaxed">{swotData.executive_summary}</p>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* SWOT Grid */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {quadrants.map(({ key, label, icon: Icon, color, gradient, items }) => (
                            <div key={key} className={`rounded-2xl border border-border/40 bg-linear-to-br ${gradient} p-5 transition-all hover:border-border/60`}>
                                <div className="flex items-center gap-2.5 mb-4">
                                    <div className="flex h-9 w-9 items-center justify-center rounded-xl" style={{ backgroundColor: `${color}15` }}>
                                        <Icon size={18} style={{ color }} />
                                    </div>
                                    <h3 className="text-[14px] font-bold text-primary">{label}</h3>
                                    <span className="ml-auto px-2 py-0.5 rounded-full text-[11px] font-medium bg-border/30 text-muted">{items.length}</span>
                                </div>
                                <ul className="space-y-2">
                                    {items.map((item: string, i: number) => (
                                        <li key={i} className="flex items-start gap-2 text-[13px] text-secondary">
                                            <span className="mt-1.5 h-1.5 w-1.5 rounded-full shrink-0" style={{ backgroundColor: color }} />
                                            {item}
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        ))}
                    </div>

                    {/* Price Suggestions */}
                    {priceSuggestions.length > 0 && (
                        <div>
                            <h3 className="text-[14px] font-semibold text-primary mb-4 flex items-center gap-2">
                                <DollarSign size={16} /> Sugestões de Preço
                            </h3>
                            <div className="space-y-3">
                                {priceSuggestions.map((s: any, i: number) => (
                                    <div key={i} className="rounded-xl border border-border/40 bg-card p-4 flex items-center justify-between gap-4 transition-colors hover:border-border/60">
                                        <div className="flex-1 min-w-0">
                                            <p className="text-[13px] font-semibold text-primary">{s.product}</p>
                                            <p className="text-[12px] text-muted mt-0.5">{s.reason}</p>
                                        </div>
                                        <div className="flex items-center gap-4 shrink-0">
                                            <div className="text-right">
                                                <p className="text-[10px] text-muted uppercase">Atual</p>
                                                <p className="text-[14px] font-bold text-secondary line-through">{fmtBRL(s.current_price)}</p>
                                            </div>
                                            <span className="text-muted">→</span>
                                            <div className="text-right">
                                                <p className="text-[10px] text-muted uppercase">Sugerido</p>
                                                <p className="text-[14px] font-bold text-emerald-400">{fmtBRL(s.suggested_price)}</p>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </>
            )}
        </div>
    );
}

// ── Tab: Industry (Setor) ────────────────────────────────

function IndustryTab() {
    const [comparison, setComparison] = useState<any>(null);
    const [analysis, setAnalysis] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [generating, setGenerating] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const fetchData = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const [compRes, analRes] = await Promise.all([
                agentApi.getIndustryComparison(),
                agentApi.getLatestIndustryAnalysis(),
            ]);
            if (compRes.success && compRes.data) setComparison(compRes.data);
            else setError(compRes.error || 'Erro ao carregar comparação');
            if (analRes.success && analRes.data?.swot_data) setAnalysis(analRes.data.swot_data);
        } catch {
            setError('Erro de conexão');
        }
        setLoading(false);
    }, []);

    useEffect(() => { fetchData(); }, [fetchData]);

    const handleGenerateAnalysis = async () => {
        setGenerating(true);
        try {
            const res = await agentApi.generateIndustryAnalysis();
            if (res.success && res.data) {
                setAnalysis(res.data);
                // Refresh comparison too
                if (res.data.comparisons) setComparison({ size: res.data.size, comparisons: res.data.comparisons, generated_at: res.data.generated_at });
            }
        } catch { /* handled by UI */ }
        setGenerating(false);
    };

    if (loading) {
        return (
            <div className="flex flex-col items-center justify-center py-20">
                <RefreshCw size={24} className="animate-spin text-muted mb-3" />
                <p className="text-[13px] text-muted">Calculando métricas e buscando benchmarks...</p>
            </div>
        );
    }

    if (error || !comparison) {
        return (
            <div className="flex flex-col items-center justify-center py-16 text-center">
                <AlertCircle size={36} className="text-red-400/60 mb-4" />
                <h2 className="text-[17px] font-semibold text-primary mb-2">Erro ao carregar dados</h2>
                <p className="text-[13px] text-muted max-w-md mb-4">{error || 'Não foi possível buscar os benchmarks.'}</p>
                <button onClick={fetchData} className="flex items-center gap-2 px-4 py-2 rounded-xl text-[13px] font-medium text-blue-400 bg-blue-500/10 hover:bg-blue-500/20 transition-colors">
                    <RefreshCw size={14} /> Tentar Novamente
                </button>
            </div>
        );
    }

    const tierColors: Record<string, string> = {
        micro: '#f59e0b',
        pequena: '#3b82f6',
        media: '#8b5cf6',
        grande: '#10b981',
    };

    const statusConfig: Record<string, { icon: typeof TrendingUp; color: string; label: string; bg: string }> = {
        above: { icon: TrendingUp, color: '#10b981', label: 'Acima', bg: 'rgba(16,185,129,0.08)' },
        at_range: { icon: ArrowUpDown, color: '#f59e0b', label: 'Na Média', bg: 'rgba(245,158,11,0.08)' },
        below: { icon: TrendingDown, color: '#ef4444', label: 'Abaixo', bg: 'rgba(239,68,68,0.08)' },
    };

    return (
        <div className="space-y-6">
            {/* Size Classification */}
            <div className="rounded-2xl border border-border/40 bg-card p-5">
                <div className="flex items-center justify-between flex-wrap gap-4">
                    <div className="flex items-center gap-4">
                        <div className="flex h-12 w-12 items-center justify-center rounded-2xl" style={{ background: `${tierColors[comparison.size.tier]}15` }}>
                            <Building2 size={22} style={{ color: tierColors[comparison.size.tier] }} />
                        </div>
                        <div>
                            <p className="text-[14px] font-bold text-primary">{comparison.size.label}</p>
                            <p className="text-[12px] text-muted">Receita anual: {fmtBRL(comparison.size.annual_revenue)}</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        {comparison.size.thresholds.map((t: any) => (
                            <span
                                key={t.tier}
                                className="px-3 py-1.5 rounded-full text-[11px] font-semibold transition-all"
                                style={{
                                    backgroundColor: comparison.size.tier === t.tier ? `${tierColors[t.tier]}20` : 'transparent',
                                    color: comparison.size.tier === t.tier ? tierColors[t.tier] : 'var(--color-muted)',
                                    border: comparison.size.tier === t.tier ? `1px solid ${tierColors[t.tier]}40` : '1px solid transparent',
                                }}
                            >
                                {t.label.split(' ')[0]}
                            </span>
                        ))}
                    </div>
                </div>
            </div>

            {/* Metric Comparison Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {comparison.comparisons.map((c: any) => {
                    const cfg = statusConfig[c.status] || statusConfig.at_range;
                    const StatusIcon = cfg.icon;
                    // Calculate gauge fill percentage (0-100, capped)
                    const gaugePct = c.benchmark_value !== 0
                        ? Math.min(Math.max((c.tenant_value / c.benchmark_value) * 100, 0), 200)
                        : 0;
                    // For cancellation rate, invert: lower is better
                    const isInverted = c.metric_key === 'cancellation_rate';
                    const fillPct = Math.min(gaugePct, 100);
                    const gaugeColor = isInverted
                        ? (c.tenant_value <= c.percentile_25 ? '#10b981' : c.tenant_value >= c.percentile_75 ? '#ef4444' : '#f59e0b')
                        : cfg.color;

                    return (
                        <div key={c.metric_key} className="rounded-2xl border border-border/40 bg-card p-5 transition-all duration-200 hover:border-border/60 hover:shadow-sm">
                            <div className="flex items-center justify-between mb-4">
                                <div>
                                    <p className="text-[13px] font-semibold text-primary">{c.metric_label}</p>
                                    <p className="text-[11px] text-muted mt-0.5">{c.source}</p>
                                </div>
                                <span
                                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold"
                                    style={{ backgroundColor: cfg.bg, color: cfg.color }}
                                >
                                    <StatusIcon size={12} />
                                    {cfg.label}
                                </span>
                            </div>

                            {/* Values Row */}
                            <div className="grid grid-cols-3 gap-4 mb-4">
                                <div>
                                    <p className="text-[10px] uppercase tracking-wider text-muted font-medium">Você</p>
                                    <p className="text-[18px] font-bold text-primary mt-0.5">
                                        {c.unit === 'BRL' ? fmtBRL(c.tenant_value) : `${c.tenant_value}${c.unit}`}
                                    </p>
                                </div>
                                <div>
                                    <p className="text-[10px] uppercase tracking-wider text-muted font-medium">Benchmark</p>
                                    <p className="text-[18px] font-bold text-muted mt-0.5">
                                        {c.unit === 'BRL' ? fmtBRL(c.benchmark_value) : `${c.benchmark_value}${c.unit}`}
                                    </p>
                                </div>
                                <div className="text-right">
                                    <p className="text-[10px] uppercase tracking-wider text-muted font-medium">Gap</p>
                                    <p className="text-[18px] font-bold mt-0.5" style={{ color: gaugeColor }}>
                                        {c.gap_pct > 0 ? '+' : ''}{c.gap_pct}%
                                    </p>
                                </div>
                            </div>

                            {/* Gauge Bar */}
                            <div className="relative">
                                <div className="h-2.5 rounded-full bg-border/30 overflow-hidden">
                                    <div
                                        className="h-full rounded-full transition-all duration-700 ease-out"
                                        style={{ width: `${fillPct}%`, backgroundColor: gaugeColor }}
                                    />
                                </div>
                                {/* Percentile markers */}
                                <div className="flex justify-between mt-1.5">
                                    <span className="text-[9px] text-muted">P25: {c.unit === 'BRL' ? fmtBRL(c.percentile_25) : `${c.percentile_25}${c.unit}`}</span>
                                    <span className="text-[9px] text-muted">P75: {c.unit === 'BRL' ? fmtBRL(c.percentile_75) : `${c.percentile_75}${c.unit}`}</span>
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* Gap Analysis Section */}
            <div className="rounded-2xl border border-border/40 bg-card overflow-hidden">
                <div className="flex items-center justify-between p-5 border-b border-border/30">
                    <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-linear-to-br from-purple-500/15 to-indigo-600/10">
                            <Target size={20} className="text-purple-400" />
                        </div>
                        <div>
                            <p className="text-[14px] font-bold text-primary">Análise de Gaps & Posicionamento</p>
                            <p className="text-[11px] text-muted">Análise gerada por IA comparando sua empresa com benchmarks do setor</p>
                        </div>
                    </div>
                    <button
                        onClick={handleGenerateAnalysis}
                        disabled={generating}
                        className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-[13px] font-semibold text-white transition-all hover:shadow-lg disabled:opacity-60 active:scale-[0.97]"
                        style={{ background: 'linear-gradient(135deg, #8b5cf6, #6366f1)' }}
                    >
                        {generating ? <RefreshCw size={14} className="animate-spin" /> : <Sparkles size={14} />}
                        {generating ? 'Analisando...' : analysis ? 'Atualizar Análise' : 'Gerar Análise'}
                    </button>
                </div>

                {analysis ? (
                    <div className="p-5 space-y-6">
                        {/* Positioning Summary */}
                        <div className="rounded-xl bg-border/10 p-4">
                            <div className="flex items-center gap-2 mb-2">
                                <Award size={16} className="text-indigo-400" />
                                <span className="text-[12px] font-semibold text-indigo-400 uppercase tracking-wider">Posicionamento</span>
                            </div>
                            <p className="text-[13px] text-secondary leading-relaxed">{analysis.positioning_summary}</p>
                        </div>

                        {/* Strengths */}
                        {analysis.strengths?.length > 0 && (
                            <div>
                                <h4 className="text-[12px] font-semibold text-emerald-400 uppercase tracking-wider mb-3 flex items-center gap-2">
                                    <TrendingUp size={14} /> Pontos Fortes
                                </h4>
                                <div className="space-y-2">
                                    {analysis.strengths.map((s: string, i: number) => (
                                        <div key={i} className="flex items-start gap-2.5 rounded-lg bg-emerald-500/5 border border-emerald-500/10 p-3">
                                            <Check size={14} className="text-emerald-400 mt-0.5 shrink-0" />
                                            <p className="text-[12px] text-secondary">{s}</p>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Gaps */}
                        {analysis.gaps?.length > 0 && (
                            <div>
                                <h4 className="text-[12px] font-semibold text-red-400 uppercase tracking-wider mb-3 flex items-center gap-2">
                                    <Target size={14} /> Gaps Identificados
                                </h4>
                                <div className="space-y-2">
                                    {analysis.gaps.map((g: any, i: number) => {
                                        const priorityColors: Record<string, { bg: string; text: string }> = {
                                            alta: { bg: 'rgba(239,68,68,0.08)', text: '#ef4444' },
                                            media: { bg: 'rgba(245,158,11,0.08)', text: '#f59e0b' },
                                            baixa: { bg: 'rgba(59,130,246,0.08)', text: '#3b82f6' },
                                        };
                                        const pc = priorityColors[g.priority] || priorityColors.media;
                                        return (
                                            <div key={i} className="rounded-xl border border-border/30 p-4" style={{ backgroundColor: pc.bg }}>
                                                <div className="flex items-center justify-between mb-1.5">
                                                    <p className="text-[13px] font-semibold text-primary">{g.metric}</p>
                                                    <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full" style={{ color: pc.text, backgroundColor: `${pc.text}15` }}>
                                                        {g.priority}
                                                    </span>
                                                </div>
                                                <p className="text-[12px] text-secondary">{g.gap_description}</p>
                                                <div className="flex gap-4 mt-2">
                                                    <span className="text-[11px] text-muted">Você: <strong className="text-primary">{g.your_value}</strong></span>
                                                    <span className="text-[11px] text-muted">Benchmark: <strong className="text-primary">{g.benchmark_value}</strong></span>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        )}

                        {/* Best Practices */}
                        {analysis.best_practices?.length > 0 && (
                            <div>
                                <h4 className="text-[12px] font-semibold text-amber-400 uppercase tracking-wider mb-3 flex items-center gap-2">
                                    <Lightbulb size={14} /> Best Practices do Setor
                                </h4>
                                <div className="space-y-2">
                                    {analysis.best_practices.map((bp: any, i: number) => (
                                        <div key={i} className="rounded-xl border border-amber-500/10 bg-amber-500/5 p-4">
                                            <p className="text-[13px] font-semibold text-primary mb-1">{bp.practice}</p>
                                            <p className="text-[12px] text-secondary mb-2">{bp.description}</p>
                                            <div className="flex items-center gap-2">
                                                <Zap size={12} className="text-amber-400" />
                                                <span className="text-[11px] text-amber-400 font-medium">Impacto: {bp.expected_impact}</span>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Recommended Actions */}
                        {analysis.recommended_actions?.length > 0 && (
                            <div>
                                <h4 className="text-[12px] font-semibold text-blue-400 uppercase tracking-wider mb-3 flex items-center gap-2">
                                    <Crosshair size={14} /> Ações Recomendadas
                                </h4>
                                <div className="space-y-2">
                                    {analysis.recommended_actions.map((a: any, i: number) => (
                                        <div key={i} className="flex items-center gap-4 rounded-xl border border-border/30 bg-card p-4">
                                            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-500/10 text-[14px] font-bold text-blue-400 shrink-0">
                                                {i + 1}
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <p className="text-[13px] font-semibold text-primary">{a.action}</p>
                                                <span className="text-[11px] text-muted">⏱️ {a.estimated_effort}</span>
                                            </div>
                                            <span className="px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider shrink-0"
                                                style={{
                                                    color: a.priority === 'alta' ? '#ef4444' : a.priority === 'media' ? '#f59e0b' : '#3b82f6',
                                                    backgroundColor: a.priority === 'alta' ? '#ef444415' : a.priority === 'media' ? '#f59e0b15' : '#3b82f615',
                                                }}
                                            >
                                                {a.priority}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                ) : (
                    <div className="flex flex-col items-center justify-center py-12 text-center">
                        <div className="flex h-16 w-16 items-center justify-center rounded-3xl bg-linear-to-br from-purple-500/10 to-indigo-600/5 mb-4">
                            <Sparkles size={28} className="text-purple-400/60" />
                        </div>
                        <h3 className="text-[15px] font-semibold text-primary mb-1">Nenhuma análise gerada</h3>
                        <p className="text-[12px] text-muted max-w-sm">Clique em "Gerar Análise" para que a IA analise seus dados e identifique gaps, pontos fortes e recomendações comparando com o setor.</p>
                    </div>
                )}
            </div>
        </div>
    );
}

// ── Main Page ────────────────────────────────────────────

export default function BenchmarkingPage() {
    const [activeTab, setActiveTab] = useState<TabId>('competitors');

    return (
        <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
            {/* Header */}
            <div className="flex items-center gap-3 mb-8">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-linear-to-br from-blue-500/20 to-indigo-600/10">
                    <BarChart3 size={24} className="text-blue-500" />
                </div>
                <div>
                    <h1 className="text-[22px] font-bold text-primary tracking-tight">Benchmarking</h1>
                    <p className="text-[13px] text-muted">Monitore concorrentes, compare preços e receba análises competitivas com IA</p>
                </div>
            </div>

            {/* Tabs */}
            <div className="flex gap-1 mb-8 border-b border-border/30 overflow-x-auto">
                {TABS.map((tab) => {
                    const Icon = tab.icon;
                    const isActive = activeTab === tab.id;
                    return (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id)}
                            className={`flex items-center gap-2 px-4 py-3 text-[13px] font-medium border-b-2 transition-all duration-200 whitespace-nowrap ${isActive
                                ? 'border-(--color-brand-primary) text-(--color-brand-primary)'
                                : 'border-transparent text-muted hover:text-primary hover:border-border/50'
                                }`}
                        >
                            <Icon size={15} />
                            {tab.label}
                        </button>
                    );
                })}
            </div>

            {/* Tab content */}
            {activeTab === 'competitors' && <CompetitorsTab />}
            {activeTab === 'comparison' && <ComparisonTab />}
            {activeTab === 'timeline' && <TimelineTab />}
            {activeTab === 'alerts' && <AlertsTab />}
            {activeTab === 'swot' && <SWOTTab />}
            {activeTab === 'industry' && <IndustryTab />}
        </div>
    );
}
