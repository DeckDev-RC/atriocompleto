import { useState, useCallback, useEffect } from 'react';
import { agentApi } from '../../services/agentApi';
import { Calendar, Activity, ChevronLeft, ChevronRight, FileText } from 'lucide-react';
import { AuditDetailsModal } from './AuditDetailsModal';

interface AuditLog {
    id: string;
    action: string;
    resource: string;
    entity_id: string;
    ip_address: string;
    user_agent: string;
    created_at: string;
    details: any;
    profiles: {
        full_name: string;
        email: string;
    };
    tenants?: {
        name: string;
    };
}

export function AuditLogPanel() {
    const [logs, setLogs] = useState<AuditLog[]>([]);
    const [loading, setLoading] = useState(true);
    const [actions, setActions] = useState<string[]>([]);
    const [page, setPage] = useState(1);
    const [total, setTotal] = useState(0);
    const [filters, setFilters] = useState({
        action: '',
        userId: '',
        startDate: '',
        endDate: '',
    });
    const [selectedLog, setSelectedLog] = useState<AuditLog | null>(null);
    const [isDetailsOpen, setIsDetailsOpen] = useState(false);
    const [autoRefresh, setAutoRefresh] = useState(false);

    const loadLogs = useCallback(async () => {
        setLoading(true);
        const result = await agentApi.getAuditLogs({ ...filters, page, limit: 20 }) as any;
        if (result.success) {
            setLogs(result.data);
            setTotal(result.count || 0);
        }
        setLoading(false);
    }, [filters, page]);

    const loadActions = useCallback(async () => {
        const result = await agentApi.getAuditActions();
        if (result.success && result.data) {
            setActions(result.data);
        }
    }, []);

    useEffect(() => {
        void loadActions();
    }, [loadActions]);

    useEffect(() => {
        void loadLogs();
    }, [loadLogs]);

    // Auto-refresh logic
    useEffect(() => {
        let interval: ReturnType<typeof setInterval>;
        if (autoRefresh && !loading) {
            interval = setInterval(() => {
                void loadLogs();
            }, 5000); // 5 seconds
        }
        return () => clearInterval(interval);
    }, [autoRefresh, loading, loadLogs]);

    const formatDate = (dateStr: string) => {
        return new Date(dateStr).toLocaleString('pt-BR');
    };

    const getActionColor = (action: string) => {
        if (action.includes('delete')) return 'text-danger bg-danger/10';
        if (action.includes('create')) return 'text-success bg-success/10';
        if (action.includes('update')) return 'text-warning bg-warning/10';
        if (action.includes('security')) return 'text-brand-primary bg-brand-primary/10 border border-brand-primary/30';
        return 'text-primary bg-primary/10';
    };

    const totalPages = Math.ceil(total / 20);

    return (
        <div className="space-y-4">
            {/* Filters */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3 bg-card border border-border rounded-xl p-4">
                <div className="space-y-1">
                    <label className="text-[11px] text-muted font-medium ml-1 uppercase tracking-wider">Ação</label>
                    <div className="relative">
                        <Activity className="absolute left-3 top-1/2 -translate-y-1/2 text-muted pointer-events-none" size={14} />
                        <select
                            className="w-full bg-body/50 border border-border rounded-lg pl-9 pr-3 py-2 text-sm focus:ring-1 focus:ring-brand-primary outline-none transition-all appearance-none"
                            value={filters.action}
                            onChange={(e) => setFilters(p => ({ ...p, action: e.target.value }))}
                        >
                            <option value="">Todas as Ações</option>
                            {actions.map(action => (
                                <option key={action} value={action}>{action}</option>
                            ))}
                        </select>
                    </div>
                </div>
                <div className="space-y-1">
                    <label className="text-[11px] text-muted font-medium ml-1 uppercase tracking-wider">Data Início</label>
                    <div className="relative">
                        <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" size={14} />
                        <input
                            type="date"
                            className="w-full bg-body/50 border border-border rounded-lg pl-9 pr-3 py-2 text-sm focus:ring-1 focus:ring-brand-primary outline-none transition-all"
                            value={filters.startDate}
                            onChange={(e) => setFilters(p => ({ ...p, startDate: e.target.value }))}
                        />
                    </div>
                </div>
                <div className="space-y-1">
                    <label className="text-[11px] text-muted font-medium ml-1 uppercase tracking-wider">Data Fim</label>
                    <div className="relative">
                        <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" size={14} />
                        <input
                            type="date"
                            className="w-full bg-body/50 border border-border rounded-lg pl-9 pr-3 py-2 text-sm focus:ring-1 focus:ring-brand-primary outline-none transition-all"
                            value={filters.endDate}
                            onChange={(e) => setFilters(p => ({ ...p, endDate: e.target.value }))}
                        />
                    </div>
                </div>
                <div className="flex items-end gap-2">
                    <button
                        onClick={() => { setFilters({ action: '', userId: '', startDate: '', endDate: '' }); setPage(1); }}
                        className="flex-1 h-[38px] bg-body border border-border rounded-lg text-sm font-medium hover:bg-card transition-all"
                    >
                        Limpar
                    </button>
                    <button
                        onClick={() => setAutoRefresh(!autoRefresh)}
                        className={`flex items-center justify-center gap-2 h-[38px] px-3 border rounded-lg text-sm font-medium transition-all ${autoRefresh ? 'bg-brand-primary/20 border-brand-primary text-brand-primary shadow-[0_0_10px_rgba(59,130,246,0.3)]' : 'bg-body border-border text-muted hover:border-brand-primary/50'}`}
                        title={autoRefresh ? "Desativar Atualização Automática" : "Ativar Atualização Automática"}
                    >
                        <Activity size={16} className={autoRefresh ? "animate-pulse" : ""} />
                        <span className="hidden lg:inline">{autoRefresh ? 'Ao Vivo' : 'Live'}</span>
                    </button>
                    <a
                        href={agentApi.getAuditExportUrl()}
                        download="audit_logs.csv"
                        className="flex items-center justify-center h-[38px] px-3 bg-brand-primary/10 border border-brand-primary/20 rounded-lg text-brand-primary hover:bg-brand-primary/20 transition-all"
                        title="Exportar CSV"
                    >
                        <FileText size={18} />
                    </a>
                </div>
            </div>

            {/* Table */}
            <div className="overflow-x-auto bg-card border border-border rounded-xl shadow-sm">
                <table className="w-full text-left border-collapse">
                    <thead>
                        <tr className="bg-body/30 border-b border-border">
                            <th className="px-4 py-3 text-[12px] font-semibold text-muted uppercase tracking-wider">Data</th>
                            <th className="px-4 py-3 text-[12px] font-semibold text-muted uppercase tracking-wider">Usuário</th>
                            <th className="px-4 py-3 text-[12px] font-semibold text-muted uppercase tracking-wider">Ação</th>
                            <th className="px-4 py-3 text-[12px] font-semibold text-muted uppercase tracking-wider">Recurso</th>
                            <th className="px-4 py-3 text-[12px] font-semibold text-muted uppercase tracking-wider">IP</th>
                            <th className="px-4 py-3 text-[12px] font-semibold text-muted uppercase tracking-wider text-right">Detalhes</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                        {loading ? (
                            <tr><td colSpan={6} className="px-4 py-8 text-center text-muted">Carregando logs...</td></tr>
                        ) : logs.length === 0 ? (
                            <tr><td colSpan={6} className="px-4 py-8 text-center text-muted">Nenhum log encontrado.</td></tr>
                        ) : logs.map((log) => (
                            <tr key={log.id} className="hover:bg-body/20 transition-colors">
                                <td className="px-4 py-3 text-[13px] whitespace-nowrap">{formatDate(log.created_at)}</td>
                                <td className="px-4 py-3">
                                    <div className="flex flex-col">
                                        <span className="text-[13px] font-medium text-primary">{log.profiles?.full_name || 'Sistema'}</span>
                                        <span className="text-[11px] text-muted">{log.profiles?.email || '-'}</span>
                                    </div>
                                </td>
                                <td className="px-4 py-3">
                                    <span className={`px-2 py-0.5 rounded-full text-[11px] font-bold ${getActionColor(log.action)}`}>
                                        {log.action}
                                    </span>
                                </td>
                                <td className="px-4 py-3">
                                    <div className="flex flex-col">
                                        <span className="text-[13px] text-primary">{log.resource}</span>
                                        <span className="text-[11px] text-muted">ID: {log.entity_id || '-'}</span>
                                    </div>
                                </td>
                                <td className="px-4 py-3 text-[12px] text-muted">{log.ip_address}</td>
                                <td className="px-4 py-3 text-right">
                                    <button
                                        onClick={() => {
                                            setSelectedLog(log);
                                            setIsDetailsOpen(true);
                                        }}
                                        className="p-1.5 hover:bg-card rounded-lg text-muted hover:text-primary transition-all"
                                        title="Ver Detalhes (JSON)"
                                    >
                                        <FileText size={16} />
                                    </button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {/* Pagination */}
            <div className="flex items-center justify-between px-2">
                <p className="text-xs text-muted">Total de {total} registros</p>
                <div className="flex items-center gap-2">
                    <button
                        disabled={page === 1}
                        onClick={() => setPage(p => Math.max(1, p - 1))}
                        className="p-1.5 rounded-lg border border-border bg-card hover:bg-body disabled:opacity-40 transition-all"
                    >
                        <ChevronLeft size={16} />
                    </button>
                    <span className="text-sm font-medium px-2">
                        Página {page} <span className="text-muted font-normal lowercase">de</span> {totalPages || 1}
                    </span>
                    <button
                        disabled={page >= totalPages || logs.length < 20}
                        onClick={() => setPage(p => p + 1)}
                        className="p-1.5 rounded-lg border border-border bg-card hover:bg-body disabled:opacity-40 transition-all"
                    >
                        <ChevronRight size={16} />
                    </button>
                </div>
            </div>

            <AuditDetailsModal
                isOpen={isDetailsOpen}
                onClose={() => setIsDetailsOpen(false)}
                log={selectedLog}
            />
        </div>
    );
}
