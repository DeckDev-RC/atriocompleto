import { X, FileText, Activity, Clock, Server, Monitor } from 'lucide-react';

interface AuditDetailsModalProps {
    isOpen: boolean;
    onClose: () => void;
    log: any | null;
}

export function AuditDetailsModal({ isOpen, onClose, log }: AuditDetailsModalProps) {
    if (!isOpen || !log) return null;

    const formatDate = (dateStr: string) => {
        if (!dateStr) return '—';
        try {
            const date = new Date(dateStr);
            if (isNaN(date.getTime())) return 'Data Inválida';
            return date.toLocaleString('pt-BR');
        } catch {
            return 'Erro na Data';
        }
    };

    const formatDiff = (details: any) => {
        if (!details) return null;

        // Se houver previous/next, mostrar de forma mais amigável
        if (details.previous || details.next) {
            return (
                <div className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <h5 className="text-[11px] font-bold text-muted uppercase tracking-wider">Estado Anterior</h5>
                            <pre className="p-3 bg-danger/5 border border-danger/10 rounded-lg text-[12px] font-mono whitespace-pre-wrap overflow-x-auto text-danger-dark">
                                {JSON.stringify(details.previous, null, 2)}
                            </pre>
                        </div>
                        <div className="space-y-2">
                            <h5 className="text-[11px] font-bold text-muted uppercase tracking-wider">Estado Atual</h5>
                            <pre className="p-3 bg-success/5 border border-success/10 rounded-lg text-[12px] font-mono whitespace-pre-wrap overflow-x-auto text-success-dark">
                                {JSON.stringify(details.next, null, 2)}
                            </pre>
                        </div>
                    </div>
                </div>
            );
        }

        // Caso contrário, mostrar o JSON bruto formatado
        return (
            <div className="space-y-2">
                <h5 className="text-[11px] font-bold text-muted uppercase tracking-wider">Dados Detalhados</h5>
                <pre className="p-4 bg-muted/5 border border-border rounded-xl text-[12px] font-mono whitespace-pre-wrap overflow-x-auto text-primary">
                    {JSON.stringify(details, null, 2)}
                </pre>
            </div>
        );
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200"
            onClick={onClose}>
            <div
                className="w-full max-w-2xl bg-card rounded-2xl border border-border shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="flex items-center justify-between p-5 border-b border-border">
                    <div className="flex items-center gap-2">
                        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-primary/10">
                            <FileText size={18} className="text-brand-primary" />
                        </div>
                        <h3 className="font-semibold text-primary">Detalhes da Auditoria</h3>
                    </div>
                    <button onClick={onClose} className="p-2 text-muted/50 hover:text-primary transition-colors">
                        <X size={20} />
                    </button>
                </div>

                <div className="p-6 space-y-6 max-h-[80vh] overflow-y-auto">
                    {/* Header Info */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <div className="p-3 rounded-xl bg-body/50 border border-border">
                            <div className="flex items-center gap-2 text-muted mb-1">
                                <Activity size={14} />
                                <span className="text-[10px] font-bold uppercase tracking-wider">Ação</span>
                            </div>
                            <p className="text-sm font-semibold text-primary">{log.action}</p>
                        </div>
                        <div className="p-3 rounded-xl bg-body/50 border border-border">
                            <div className="flex items-center gap-2 text-muted mb-1">
                                <Clock size={14} />
                                <span className="text-[10px] font-bold uppercase tracking-wider">Horário</span>
                            </div>
                            <p className="text-sm font-semibold text-primary">{formatDate(log.created_at)}</p>
                        </div>
                        <div className="p-3 rounded-xl bg-body/50 border border-border">
                            <div className="flex items-center gap-2 text-muted mb-1">
                                <Server size={14} />
                                <span className="text-[10px] font-bold uppercase tracking-wider">IP</span>
                            </div>
                            <p className="text-sm font-semibold text-primary">{log.ip_address || '—'}</p>
                        </div>
                        <div className="p-3 rounded-xl bg-body/50 border border-border overflow-hidden">
                            <div className="flex items-center gap-2 text-muted mb-1">
                                <Monitor size={14} />
                                <span className="text-[10px] font-bold uppercase tracking-wider">Sistema</span>
                            </div>
                            <p className="text-sm font-semibold text-primary truncate" title={log.user_agent || 'Desconhecido'}>
                                {log.user_agent?.split('/')[0] || 'Sistema'}
                            </p>
                        </div>
                    </div>

                    {/* Diff/Details Area */}
                    {formatDiff(log.details)}

                    {/* Meta Info */}
                    <div className="flex flex-col gap-2 p-4 bg-muted/5 rounded-xl border border-dashed border-border text-[12px] text-muted leading-relaxed">
                        <p><strong>Usuário:</strong> {log.profiles?.full_name || 'Desconhecido'} ({log.profiles?.email || 'sem email'})</p>
                        <p><strong>Recurso:</strong> {log.resource || 'N/A'} (ID: {log.entity_id || '-'})</p>
                    </div>
                </div>

                <div className="p-4 bg-body/30 border-t border-border flex justify-end">
                    <button
                        onClick={onClose}
                        className="px-6 h-10 rounded-xl bg-brand-primary text-white font-medium hover:opacity-90 transition-all active:scale-[0.98]"
                    >
                        Fechar
                    </button>
                </div>
            </div>
        </div>
    );
}
