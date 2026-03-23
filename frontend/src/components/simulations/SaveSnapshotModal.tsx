import { Save, X } from 'lucide-react';

interface SaveSnapshotModalProps {
  open: boolean;
  title: string;
  description: string;
  name: string;
  loading: boolean;
  onNameChange: (value: string) => void;
  onClose: () => void;
  onConfirm: () => void;
  confirmLabel?: string;
}

export function SaveSnapshotModal({
  open,
  title,
  description,
  name,
  loading,
  onNameChange,
  onClose,
  onConfirm,
  confirmLabel = 'Salvar',
}: SaveSnapshotModalProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="w-full max-w-sm rounded-2xl border border-border bg-card p-6 shadow-2xl">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h3 className="text-lg font-bold text-primary">{title}</h3>
          <button
            type="button"
            onClick={onClose}
            className="text-muted transition-colors hover:text-primary"
            aria-label="Fechar"
          >
            <X size={18} />
          </button>
        </div>

        <p className="mb-4 text-sm text-muted">{description}</p>

        <input
          type="text"
          value={name}
          onChange={(event) => onNameChange(event.target.value)}
          placeholder="Ex: Camiseta preta premium"
          className="mb-5 h-11 w-full rounded-xl border border-border bg-body px-4 py-2.5 text-sm text-primary outline-none transition-colors focus:border-[var(--color-brand-primary)] focus:ring-1 focus:ring-[var(--color-brand-primary)]/20"
          autoFocus
        />

        <div className="flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl px-4 py-2 text-sm font-semibold text-muted transition-colors hover:bg-body hover:text-primary"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={!name.trim() || loading}
            className="inline-flex items-center gap-2 rounded-xl bg-[var(--color-brand-primary)] px-4 py-2 text-sm font-semibold text-white transition-colors hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Save size={16} />
            {loading ? 'Salvando...' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
