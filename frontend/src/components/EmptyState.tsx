import type { LucideIcon } from 'lucide-react';

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description: string;
  action?: { label: string; onClick: () => void };
}

export function EmptyState({ icon: Icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 max-sm:py-8 text-center">
      <div className="p-4 rounded-2xl bg-muted/10 mb-4">
        <Icon size={32} className="text-muted" />
      </div>
      <h3 className="text-base font-semibold text-primary mb-1">{title}</h3>
      <p className="text-[13px] text-muted max-w-sm leading-relaxed">{description}</p>
      {action && (
        <button
          onClick={action.onClick}
          className="mt-4 rounded-lg bg-(--color-brand-primary) px-4 py-2 text-sm text-white hover:opacity-90 transition-opacity"
        >
          {action.label}
        </button>
      )}
    </div>
  );
}
