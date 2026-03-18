import { FileText, Layers3 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

interface ReportsModeToggleProps {
  mode: 'templates' | 'builder';
}

export function ReportsModeToggle({ mode }: ReportsModeToggleProps) {
  const navigate = useNavigate();

  return (
    <div className="inline-flex items-center rounded-2xl border border-border bg-body p-1 shadow-soft">
      <button
        onClick={() => navigate('/relatorios')}
        className={`inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium transition-colors ${
          mode === 'templates'
            ? 'bg-brand-primary text-white'
            : 'text-secondary hover:bg-card hover:text-primary'
        }`}
      >
        <FileText size={15} />
        Templates
      </button>

      <button
        onClick={() => navigate('/relatorios/customizados')}
        className={`inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium transition-colors ${
          mode === 'builder'
            ? 'bg-brand-primary text-white'
            : 'text-secondary hover:bg-card hover:text-primary'
        }`}
      >
        <Layers3 size={15} />
        Builder
      </button>
    </div>
  );
}
