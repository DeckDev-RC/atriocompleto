import { useState, useEffect, useCallback, createContext, useContext, type ReactNode } from 'react';
import { Check, X, AlertCircle, Info } from 'lucide-react';

// ── Types ────────────────────────────────────────────────
type ToastType = 'success' | 'error' | 'info' | 'warning';

interface ToastItem {
  id: number;
  message: string;
  type: ToastType;
  exiting?: boolean;
}

interface ToastContextValue {
  showToast: (message: string, type?: ToastType) => void;
}

// ── Context ──────────────────────────────────────────────
const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast deve ser usado dentro de <ToastProvider>');
  return ctx;
}

// ── Icons ────────────────────────────────────────────────
const TOAST_CONFIG: Record<ToastType, {
  icon: typeof Check;
  bgClass: string;
  iconColor: string;
  borderClass: string;
}> = {
  success: {
    icon: Check,
    bgClass: 'bg-success/10 dark:bg-success/15',
    iconColor: 'var(--color-success)',
    borderClass: 'border-success/20',
  },
  error: {
    icon: AlertCircle,
    bgClass: 'bg-danger/10 dark:bg-danger/15',
    iconColor: 'var(--color-danger)',
    borderClass: 'border-danger/20',
  },
  warning: {
    icon: AlertCircle,
    bgClass: 'bg-warning/10 dark:bg-warning/15',
    iconColor: 'var(--color-warning)',
    borderClass: 'border-warning/20',
  },
  info: {
    icon: Info,
    bgClass: 'bg-[var(--color-brand-primary)]/10',
    iconColor: 'var(--color-brand-primary)',
    borderClass: 'border-[var(--color-brand-primary)]/20',
  },
};

// ── Provider ─────────────────────────────────────────────
let idCounter = 0;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const showToast = useCallback((message: string, type: ToastType = 'info') => {
    const id = ++idCounter;
    setToasts((prev) => [...prev, { id, message, type }]);

    // Auto-dismiss after 4s
    setTimeout(() => {
      setToasts((prev) => prev.map((t) => t.id === id ? { ...t, exiting: true } : t));
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, 300); // animation duration
    }, 4000);
  }, []);

  const dismissToast = useCallback((id: number) => {
    setToasts((prev) => prev.map((t) => t.id === id ? { ...t, exiting: true } : t));
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 300);
  }, []);

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      {/* Toast container */}
      <div className="fixed bottom-6 right-6 z-[9999] flex flex-col gap-2.5 max-sm:bottom-4 max-sm:right-4 max-sm:left-4">
        {toasts.map((toast) => (
          <ToastItem key={toast.id} toast={toast} onDismiss={dismissToast} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

// ── Toast Item ───────────────────────────────────────────
function ToastItem({ toast, onDismiss }: { toast: ToastItem; onDismiss: (id: number) => void }) {
  const config = TOAST_CONFIG[toast.type];
  const Icon = config.icon;
  const [progress, setProgress] = useState(100);

  useEffect(() => {
    const start = Date.now();
    const duration = 4000;
    const interval = setInterval(() => {
      const elapsed = Date.now() - start;
      const remaining = Math.max(0, 100 - (elapsed / duration) * 100);
      setProgress(remaining);
      if (remaining <= 0) clearInterval(interval);
    }, 30);
    return () => clearInterval(interval);
  }, []);

  return (
    <div
      className={`
        relative flex items-center gap-3 rounded-xl border px-4 py-3 pr-10 shadow-float dark:shadow-dark-float
        backdrop-blur-xl overflow-hidden min-w-[280px] max-w-[420px]
        ${config.bgClass} ${config.borderClass}
        ${toast.exiting ? 'animate-toast-exit' : 'animate-toast-enter'}
      `}
    >
      <div
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg"
        style={{ backgroundColor: `color-mix(in srgb, ${config.iconColor} 15%, transparent)` }}
      >
        <Icon size={15} strokeWidth={2.5} style={{ color: config.iconColor }} />
      </div>
      <p className="text-[13px] font-medium text-primary leading-snug">
        {toast.message}
      </p>
      <button
        onClick={() => onDismiss(toast.id)}
        className="absolute right-2.5 top-1/2 -translate-y-1/2 flex h-6 w-6 items-center justify-center rounded-lg text-muted/50 transition-colors hover:text-primary hover:bg-border/40"
      >
        <X size={14} strokeWidth={2.5} />
      </button>
      {/* Progress bar */}
      <div className="absolute bottom-0 left-0 right-0 h-[2px] overflow-hidden">
        <div
          className="h-full transition-[width] duration-100 ease-linear rounded-full"
          style={{ width: `${progress}%`, backgroundColor: config.iconColor }}
        />
      </div>
    </div>
  );
}
