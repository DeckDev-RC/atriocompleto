import { useState, useRef, useEffect } from 'react';
import { Calendar, ChevronDown, Check } from 'lucide-react';
import type { DashboardPeriod } from '../../hooks/useDashboard';

// ── Presets ────────────────────────────────────────

const PRESETS: Array<{ value: DashboardPeriod; label: string }> = [
  { value: 'all', label: 'Todo Histórico' },
  { value: 'current_month', label: 'Mês Atual' },
  { value: '30d', label: 'Últimos 30 dias' },
  { value: '90d', label: 'Últimos 90 dias' },
];

// ── Props ──────────────────────────────────────────

interface PeriodFilterProps {
  value: DashboardPeriod;
  startDate: string;
  endDate: string;
  onChange: (period: DashboardPeriod) => void;
  onDateRangeChange: (start: string, end: string) => void;
}

// ── Helpers ────────────────────────────────────────

function formatDateBR(dateStr: string): string {
  if (!dateStr) return '';
  const [y, m, d] = dateStr.split('-');
  return `${d}/${m}/${y}`;
}

// ── Component ──────────────────────────────────────

export function PeriodFilter({
  value,
  startDate,
  endDate,
  onChange,
  onDateRangeChange,
}: PeriodFilterProps) {
  const [open, setOpen] = useState(false);
  const [tempStart, setTempStart] = useState(startDate);
  const [tempEnd, setTempEnd] = useState(endDate);
  const containerRef = useRef<HTMLDivElement>(null);

  // Sync temp dates when external state changes
  useEffect(() => {
    setTempStart(startDate);
    setTempEnd(endDate);
  }, [startDate, endDate]);

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

  // Display label
  const displayLabel =
    value === 'custom' && startDate && endDate
      ? `${formatDateBR(startDate)} — ${formatDateBR(endDate)}`
      : PRESETS.find((p) => p.value === value)?.label || 'Todo Histórico';

  function handlePreset(preset: DashboardPeriod) {
    onChange(preset);
    setOpen(false);
  }

  function handleApply() {
    if (tempStart && tempEnd) {
      onDateRangeChange(tempStart, tempEnd);
      setOpen(false);
    }
  }

  return (
    <div ref={containerRef} className="relative">
      {/* Trigger */}
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 rounded-full border border-accent/60 bg-card/95 dark:bg-[#151823] backdrop-blur-md py-2.5 pl-3.5 pr-3.5 text-[13px] font-medium text-primary tracking-[-0.01em] outline-none transition-all duration-200 cursor-pointer shadow-soft hover:bg-accent/5 hover:border-accent focus:border-accent focus:ring-4 focus:ring-accent/18 focus:shadow-[0_0_24px_rgba(75,189,255,0.25)]"
      >
        <Calendar size={14} strokeWidth={2.2} className="text-accent shrink-0" />
        <span className="max-w-[200px] truncate text-secondary dark:text-[#e5e7f0]">
          {displayLabel}
        </span>
        <ChevronDown
          size={14}
          strokeWidth={2.2}
          className={`text-accent shrink-0 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {/* Dropdown */}
      {open && (
        <div
          className="absolute right-0 top-full mt-2 z-50 w-[280px] rounded-2xl border border-border bg-card shadow-float dark:shadow-dark-float overflow-hidden"
          style={{ animation: 'fade-in 0.15s ease-out both' }}
        >
          {/* Presets */}
          <div className="p-1.5">
            {PRESETS.map((preset) => (
              <button
                key={preset.value}
                onClick={() => handlePreset(preset.value)}
                className={`w-full flex items-center justify-between rounded-xl px-3 py-2.5 text-[13px] text-left transition-colors duration-150 ${
                  value === preset.value
                    ? 'bg-accent/10 text-accent font-medium'
                    : 'text-secondary hover:bg-border/50 hover:text-primary'
                }`}
              >
                {preset.label}
                {value === preset.value && <Check size={14} strokeWidth={2.5} />}
              </button>
            ))}
          </div>

          {/* Divider */}
          <div className="mx-3 h-px bg-border" />

          {/* Custom range */}
          <div className="p-4 pt-3">
            <p className="text-[11px] font-semibold tracking-[0.06em] uppercase text-muted mb-3">
              Período personalizado
            </p>

            <div className="flex flex-col gap-2.5">
              <div>
                <label className="text-[11px] text-muted mb-1 block">Data inicial</label>
                <input
                  type="date"
                  value={tempStart}
                  max={tempEnd || undefined}
                  onChange={(e) => setTempStart(e.target.value)}
                  className="w-full rounded-xl border border-border bg-body px-3 py-2 text-[13px] text-primary outline-none transition-colors duration-150 focus:border-accent/30 focus:ring-2 focus:ring-accent/8"
                />
              </div>
              <div>
                <label className="text-[11px] text-muted mb-1 block">Data final</label>
                <input
                  type="date"
                  value={tempEnd}
                  min={tempStart || undefined}
                  onChange={(e) => setTempEnd(e.target.value)}
                  className="w-full rounded-xl border border-border bg-body px-3 py-2 text-[13px] text-primary outline-none transition-colors duration-150 focus:border-accent/30 focus:ring-2 focus:ring-accent/8"
                />
              </div>
              <button
                onClick={handleApply}
                disabled={!tempStart || !tempEnd}
                className="mt-1 w-full rounded-xl bg-accent py-2.5 text-[13px] font-semibold text-white transition-all duration-200 hover:bg-accent-deep active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Aplicar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
