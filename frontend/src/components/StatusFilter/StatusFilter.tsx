import { useState, useRef, useEffect } from 'react';
import { Filter, ChevronDown, Check } from 'lucide-react';
import { useBrandPrimaryColor, getBrandPrimaryWithOpacity } from '../../hooks/useBrandPrimaryColor';
import { agentApi } from '../../services/agentApi';

interface StatusFilterProps {
    value: string; // 'all' or specific status
    onChange: (status: string) => void;
}

const STATUS_TRANSLATIONS: Record<string, string> = {
    pending: 'Pendente',
    paid: 'Pago',
    shipped: 'Enviado',
    delivered: 'Entregue',
    cancelled: 'Cancelado',
    processing: 'Processando',
    refunded: 'Reembolsado',
    failed: 'Falhou',
    partially_refunded: 'Reembolso Parcial',
    pending_payment: 'Pagamento Pendente',
    pending_shipment: 'Envio Pendente',
    'pending processing': 'Processamento Pendente',
    'pending shipment': 'Envio Pendente',
};

function formatStatus(status: string): string {
    const lower = status.toLowerCase();
    return STATUS_TRANSLATIONS[lower] || status.charAt(0).toUpperCase() + status.slice(1);
}

export function StatusFilter({ value, onChange }: StatusFilterProps) {
    const [open, setOpen] = useState(false);
    const [statuses, setStatuses] = useState<string[]>([]);
    const [loading, setLoading] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);
    const brandPrimaryColor = useBrandPrimaryColor();

    // Load available statuses on mount
    useEffect(() => {
        let mounted = true;
        async function loadStatuses() {
            try {
                setLoading(true);
                const res = await agentApi.getDashboardStatuses();
                if (mounted && res.success && res.data) {
                    setStatuses(res.data);
                }
            } catch (error) {
                console.error('Failed to load statuses', error);
            } finally {
                if (mounted) setLoading(false);
            }
        }
        loadStatuses();
        return () => { mounted = false; };
    }, []);

    // Close on click outside
    useEffect(() => {
        function handler(e: MouseEvent) {
            if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
                setOpen(false);
            }
        }
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, []);

    const getCurrentColor = () => brandPrimaryColor || 'var(--color-brand-primary)';

    const displayLabel = value === 'all'
        ? 'Todos os Status'
        : formatStatus(value);

    return (
        <div ref={containerRef} className="relative">
            <button
                onClick={() => setOpen(!open)}
                className="flex items-center gap-2 rounded-full border bg-card/95 dark:bg-[#151823] backdrop-blur-md py-2.5 pl-3.5 pr-3.5 text-[13px] font-medium tracking-[-0.01em] outline-none transition-all duration-200 cursor-pointer shadow-soft"
                style={{
                    borderColor: brandPrimaryColor ? getBrandPrimaryWithOpacity(brandPrimaryColor, 0.6) : 'color-mix(in srgb, var(--color-brand-primary) 60%, transparent)',
                    color: getCurrentColor(),
                }}
                onMouseEnter={(e) => {
                    if (brandPrimaryColor) {
                        e.currentTarget.style.borderColor = brandPrimaryColor;
                        e.currentTarget.style.backgroundColor = getBrandPrimaryWithOpacity(brandPrimaryColor, 0.05);
                    } else {
                        e.currentTarget.style.borderColor = 'var(--color-brand-primary)';
                        e.currentTarget.style.backgroundColor = 'color-mix(in srgb, var(--color-brand-primary) 5%, var(--color-card))';
                    }
                }}
                onMouseLeave={(e) => {
                    if (brandPrimaryColor) {
                        e.currentTarget.style.borderColor = getBrandPrimaryWithOpacity(brandPrimaryColor, 0.6);
                    } else {
                        e.currentTarget.style.borderColor = 'color-mix(in srgb, var(--color-brand-primary) 60%, transparent)';
                    }
                    e.currentTarget.style.backgroundColor = '';
                }}
            >
                <Filter size={14} strokeWidth={2.2} className="shrink-0" style={{ color: getCurrentColor() }} />
                <span className="max-w-[150px] truncate" style={{ color: getCurrentColor() }}>
                    {displayLabel}
                </span>
                <ChevronDown
                    size={14}
                    strokeWidth={2.2}
                    className={`shrink-0 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
                    style={{ color: getCurrentColor() }}
                />
            </button>

            {open && (
                <div
                    className="absolute left-0 top-full mt-2 z-50 w-[240px] rounded-2xl border border-border bg-card shadow-float dark:shadow-dark-float overflow-hidden"
                    style={{ animation: 'fade-in 0.15s ease-out both' }}
                >
                    <div className="p-1.5 max-h-[300px] overflow-y-auto">
                        <button
                            onClick={() => { onChange('all'); setOpen(false); }}
                            className={`w-full flex items-center justify-between rounded-xl px-3 py-2.5 text-[13px] text-left transition-colors duration-150 ${value === 'all'
                                ? 'font-medium'
                                : 'text-secondary hover:bg-border/50 hover:text-primary'
                                }`}
                            style={value === 'all' ? {
                                backgroundColor: brandPrimaryColor ? getBrandPrimaryWithOpacity(brandPrimaryColor, 0.1) : 'color-mix(in srgb, var(--color-brand-primary) 10%, transparent)',
                                color: getCurrentColor(),
                            } : undefined}
                        >
                            Todos os Status
                            {value === 'all' && (
                                <Check size={14} strokeWidth={2.5} style={{ color: getCurrentColor() }} />
                            )}
                        </button>

                        <div className="mx-2 my-1 h-px bg-border/50" />

                        {loading ? (
                            <div className="px-3 py-4 text-center text-[12px] text-muted">Thinking...</div>
                        ) : statuses.length === 0 ? (
                            <div className="px-3 py-2 text-[12px] text-muted">Nenhum status encontrado</div>
                        ) : (
                            statuses.map((status) => (
                                <button
                                    key={status}
                                    onClick={() => { onChange(status); setOpen(false); }}
                                    className={`w-full flex items-center justify-between rounded-xl px-3 py-2.5 text-[13px] text-left transition-colors duration-150 ${value === status
                                        ? 'font-medium'
                                        : 'text-secondary hover:bg-border/50 hover:text-primary'
                                        }`}
                                    style={value === status ? {
                                        backgroundColor: brandPrimaryColor ? getBrandPrimaryWithOpacity(brandPrimaryColor, 0.1) : 'color-mix(in srgb, var(--color-brand-primary) 10%, transparent)',
                                        color: getCurrentColor(),
                                    } : undefined}
                                >
                                    {formatStatus(status)}
                                    {value === status && (
                                        <Check size={14} strokeWidth={2.5} style={{ color: getCurrentColor() }} />
                                    )}
                                </button>
                            ))
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
