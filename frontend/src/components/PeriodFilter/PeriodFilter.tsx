import { useState, useRef, useEffect, useCallback } from 'react';
import React from 'react';
import { Calendar, ChevronDown, Check, Trash2 } from 'lucide-react';
import { DayPicker } from 'react-day-picker';
import { ptBR } from 'react-day-picker/locale/pt-BR';
import type { DashboardPeriod } from '../../hooks/useDashboard';
import { useBrandPrimaryColor, getBrandPrimaryWithOpacity } from '../../hooks/useBrandPrimaryColor';

// ── Custom dropdown (lista com bordas inferiores arredondadas e alinhamento correto) ───
function RdpOption(
  props: React.ComponentPropsWithoutRef<'option'>
) {
  const { onClick, value, disabled, children } = props;
  return (
    <div
      role="option"
      data-value={value}
      onClick={disabled ? undefined : onClick as any}
      className="rdp-custom-option px-3 py-2 text-[13px] font-medium cursor-pointer transition-colors"
      style={{
        color: 'var(--color-primary)',
        backgroundColor: 'transparent',
      }}
    >
      {children}
    </div>
  );
}

function RdpSelect(
  props: React.ComponentPropsWithoutRef<'select'> & { children?: React.ReactNode }
) {
  const { value, onChange, disabled, className, children } = props;
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const selectedChild = React.Children.toArray(children).find(
    (c): c is React.ReactElement<{ value: string | number }> =>
      React.isValidElement(c) && String((c.props as { value?: unknown }).value) === String(value)
  );
  const selectedLabel = selectedChild && React.isValidElement(selectedChild)
    ? (selectedChild.props as { children?: React.ReactNode }).children
    : value;

  const handleSelect = useCallback(
    (val: string | number) => {
      const e = { target: { value: String(val) } } as React.ChangeEvent<HTMLSelectElement>;
      onChange?.(e);
      setOpen(false);
    },
    [onChange]
  );

  useEffect(() => {
    if (!open) return;
    const onDocClick = (ev: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(ev.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [open]);

  return (
    <span ref={containerRef} className="rdp-dropdown_root rdp-custom-select-root" style={{ position: 'relative' }}>
      <span
        role="combobox"
        aria-expanded={open}
        aria-haspopup="listbox"
        onClick={() => !disabled && setOpen((o) => !o)}
        className={className}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          width: 'fit-content',
          minWidth: 0,
          cursor: disabled ? 'default' : 'pointer',
          fontFamily: 'var(--font-sans)',
          fontSize: 13,
          fontWeight: 600,
          color: 'var(--color-primary)',
          padding: '4px 1.5rem 4px 8px',
          borderRadius: 10,
          background: 'transparent',
          backgroundImage: `url("data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3e%3cpath stroke='%236b7280' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='M6 8l4 4 4-4'/%3e%3c/svg%3e")`,
          backgroundPosition: 'right center',
          backgroundRepeat: 'no-repeat',
          backgroundSize: '1.25em 1.25em',
        }}
      >
        {selectedLabel}
      </span>
      {open && (
        <div
          role="listbox"
          className="rdp-custom-select-list"
          style={{
            position: 'absolute',
            left: 0,
            top: '100%',
            marginTop: 2,
            width: '100%',
            minWidth: '100%',
            maxHeight: 220,
            overflowY: 'auto',
            backgroundColor: 'var(--color-card)',
            border: '1px solid var(--color-border)',
            borderRadius: '0 0 10px 10px',
            boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
            zIndex: 5,
          }}
        >
          {React.Children.map(children, (child) => {
            if (!React.isValidElement(child)) return child;
            const val = (child.props as { value?: unknown }).value;
            const dis = (child.props as { disabled?: boolean }).disabled;
            return React.cloneElement(child as React.ReactElement<{ onClick?: () => void; style?: React.CSSProperties }>, {
              onClick: () => !dis && handleSelect(val as string | number),
              style: {
                ...(typeof (child.props as { style?: React.CSSProperties }).style === 'object'
                  ? (child.props as { style: React.CSSProperties }).style
                  : {}),
                backgroundColor: String(value) === String(val) ? 'var(--color-brand-primary)' : undefined,
                color: String(value) === String(val) ? 'white' : undefined,
              },
            });
          })}
        </div>
      )}
    </span>
  );
}

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

function parseDate(dateStr: string): Date | undefined {
  if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return undefined;
  return new Date(dateStr + 'T12:00:00');
}

function toYYYYMMDD(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Parse dd/mm/yyyy ou d/m/yyyy → yyyy-mm-dd ou null */
function parseBRToYYYYMMDD(s: string): string | null {
  const t = s.trim().replace(/\s/g, '');
  const match = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!match) return null;
  const [, d, m, y] = match;
  const day = parseInt(d!, 10);
  const month = parseInt(m!, 10);
  const year = parseInt(y!, 10);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const date = new Date(year, month - 1, day);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return null;
  return toYYYYMMDD(date);
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
  const [whichCalendarOpen, setWhichCalendarOpen] = useState<'start' | 'end' | null>(null);
  const [inputStartValue, setInputStartValue] = useState(formatDateBR(startDate));
  const [inputEndValue, setInputEndValue] = useState(formatDateBR(endDate));
  const [focusStart, setFocusStart] = useState(false);
  const [focusEnd, setFocusEnd] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const brandPrimaryColor = useBrandPrimaryColor();

  // Função helper para obter cor atual (com fallback)
  const getCurrentColor = () => brandPrimaryColor || 'var(--color-brand-primary)';

  // Sync temp dates when external state changes
  useEffect(() => {
    setTempStart(startDate);
    setTempEnd(endDate);
    if (!focusStart) setInputStartValue(formatDateBR(startDate));
    if (!focusEnd) setInputEndValue(formatDateBR(endDate));
  }, [startDate, endDate]);

  // Sync input display when temp dates change (e.g. from calendar) and field not focused
  useEffect(() => {
    if (!focusStart) setInputStartValue(formatDateBR(tempStart));
  }, [tempStart, focusStart]);
  useEffect(() => {
    if (!focusEnd) setInputEndValue(formatDateBR(tempEnd));
  }, [tempEnd, focusEnd]);

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

  function handleClear() {
    setTempStart('');
    setTempEnd('');
    setInputStartValue('');
    setInputEndValue('');
    setWhichCalendarOpen(null);
  }

  return (
    <div ref={containerRef} className="relative">
      {/* Trigger */}
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
        onFocus={(e) => {
          const currentColor = brandPrimaryColor || getComputedStyle(document.documentElement).getPropertyValue('--color-brand-primary').trim();
          if (currentColor && !currentColor.startsWith('var(')) {
            e.currentTarget.style.borderColor = currentColor;
            const rgb = currentColor.match(/\d+/g);
            if (rgb && rgb.length >= 3) {
              e.currentTarget.style.boxShadow = `0 0 0 4px rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, 0.18), 0 0 24px rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, 0.25)`;
            } else if (currentColor.startsWith('#')) {
              const hex = currentColor.replace('#', '');
              const r = parseInt(hex.substring(0, 2), 16);
              const g = parseInt(hex.substring(2, 4), 16);
              const b = parseInt(hex.substring(4, 6), 16);
              e.currentTarget.style.boxShadow = `0 0 0 4px rgba(${r}, ${g}, ${b}, 0.18), 0 0 24px rgba(${r}, ${g}, ${b}, 0.25)`;
            }
          } else {
            e.currentTarget.style.borderColor = 'var(--color-brand-primary)';
          }
        }}
        onBlur={(e) => {
          e.currentTarget.style.boxShadow = '';
        }}
      >
        <Calendar size={14} strokeWidth={2.2} className="shrink-0" style={{ color: getCurrentColor() }} />
        <span className="max-w-[200px] truncate" style={{ color: getCurrentColor() }}>
          {displayLabel}
        </span>
        <ChevronDown
          size={14}
          strokeWidth={2.2}
          className={`shrink-0 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
          style={{ color: getCurrentColor() }}
        />
      </button>

      {/* Dropdown */}
      {open && (
        <div
          className="absolute right-0 top-full mt-2 z-50 w-[320px] rounded-2xl border border-border bg-card shadow-float dark:shadow-dark-float overflow-hidden"
          style={{ animation: 'fade-in 0.15s ease-out both' }}
        >
          {/* Presets */}
          <div className="p-1.5">
            {PRESETS.map((preset) => (
              <button
                key={preset.value}
                onClick={() => handlePreset(preset.value)}
                className={`w-full flex items-center justify-between rounded-xl px-3 py-2.5 text-[13px] text-left transition-colors duration-150 ${value === preset.value
                  ? 'font-medium'
                  : 'text-secondary hover:bg-border/50 hover:text-primary'
                  }`}
                style={value === preset.value ? {
                  backgroundColor: brandPrimaryColor ? getBrandPrimaryWithOpacity(brandPrimaryColor, 0.1) : 'color-mix(in srgb, var(--color-brand-primary) 10%, transparent)',
                  color: getCurrentColor(),
                } : undefined}
              >
                {preset.label}
                {value === preset.value && (
                  <Check size={14} strokeWidth={2.5} style={{ color: getCurrentColor() }} />
                )}
              </button>
            ))}
          </div>

          {/* Divider */}
          <div className="mx-3 h-px bg-border" />

          {/* Custom range */}
          <div className="p-4 pt-3">
            <div className="flex items-center justify-between mb-3">
              <p className="text-[11px] font-semibold tracking-[0.06em] uppercase text-muted">
                Período personalizado
              </p>
              <button
                onClick={handleClear}
                className="hover:bg-red-500/10 hover:text-red-500 text-muted p-1.5 rounded-md transition-colors cursor-pointer"
                title="Limpar datas"
              >
                <Trash2 size={13} />
              </button>
            </div>

            <div className="flex flex-col gap-2.5">
              <div>
                <label className="text-[11px] text-muted mb-1 block">Data inicial</label>
                <input
                  type="text"
                  inputMode="numeric"
                  placeholder="dd/mm/aaaa"
                  value={inputStartValue}
                  onChange={(e) => {
                    let v = e.target.value.replace(/\D/g, '').slice(0, 8);
                    if (v.length >= 5) v = `${v.slice(0, 2)}/${v.slice(2, 4)}/${v.slice(4)}`;
                    else if (v.length >= 3) v = `${v.slice(0, 2)}/${v.slice(2)}`;
                    setInputStartValue(v);
                  }}
                  onFocus={() => {
                    setFocusStart(true);
                    setInputStartValue(formatDateBR(tempStart) || '');
                    setWhichCalendarOpen('start');
                  }}
                  onBlur={() => {
                    const parsed = parseBRToYYYYMMDD(inputStartValue);
                    if (parsed) {
                      setTempStart(parsed);
                      setInputStartValue(formatDateBR(parsed));
                    } else {
                      setInputStartValue(formatDateBR(tempStart) || '');
                    }
                    setFocusStart(false);
                  }}
                  onClick={() => setWhichCalendarOpen('start')}
                  className="w-full rounded-xl border border-border bg-body px-3 py-2 text-[13px] text-primary outline-none transition-colors duration-150 placeholder:text-muted hover:border-border-strong focus:border-[var(--color-brand-primary)] focus:ring-2 focus:ring-[var(--color-brand-primary)]/20"
                />
                {whichCalendarOpen === 'start' && (
                  <div className="rdp-root mt-2 rounded-xl border border-border bg-card p-3 shadow-soft">
                    <DayPicker
                      mode="single"
                      locale={ptBR}
                      captionLayout="dropdown"
                      components={{ Select: RdpSelect, Option: RdpOption }}
                      startMonth={new Date(new Date().getFullYear() - 10, 0, 1)}
                      endMonth={new Date()}
                      selected={parseDate(tempStart)}
                      onSelect={(date) => {
                        if (date) {
                          setTempStart(toYYYYMMDD(date));
                          setWhichCalendarOpen(null);
                        }
                      }}
                      disabled={(() => {
                        const d = parseDate(tempEnd);
                        return d ? { after: d } : undefined;
                      })()}
                      defaultMonth={parseDate(tempStart) || new Date()}
                    />
                  </div>
                )}
              </div>
              <div>
                <label className="text-[11px] text-muted mb-1 block">Data final</label>
                <input
                  type="text"
                  inputMode="numeric"
                  placeholder="dd/mm/aaaa"
                  value={inputEndValue}
                  onChange={(e) => {
                    let v = e.target.value.replace(/\D/g, '').slice(0, 8);
                    if (v.length >= 5) v = `${v.slice(0, 2)}/${v.slice(2, 4)}/${v.slice(4)}`;
                    else if (v.length >= 3) v = `${v.slice(0, 2)}/${v.slice(2)}`;
                    setInputEndValue(v);
                  }}
                  onFocus={() => {
                    setFocusEnd(true);
                    setInputEndValue(formatDateBR(tempEnd) || '');
                    setWhichCalendarOpen('end');
                  }}
                  onBlur={() => {
                    const parsed = parseBRToYYYYMMDD(inputEndValue);
                    if (parsed) {
                      setTempEnd(parsed);
                      setInputEndValue(formatDateBR(parsed));
                    } else {
                      setInputEndValue(formatDateBR(tempEnd) || '');
                    }
                    setFocusEnd(false);
                  }}
                  onClick={() => setWhichCalendarOpen('end')}
                  className="w-full rounded-xl border border-border bg-body px-3 py-2 text-[13px] text-primary outline-none transition-colors duration-150 placeholder:text-muted hover:border-border-strong focus:border-[var(--color-brand-primary)] focus:ring-2 focus:ring-[var(--color-brand-primary)]/20"
                />
                {whichCalendarOpen === 'end' && (
                  <div className="rdp-root mt-2 rounded-xl border border-border bg-card p-3 shadow-soft">
                    <DayPicker
                      mode="single"
                      locale={ptBR}
                      captionLayout="dropdown"
                      components={{ Select: RdpSelect, Option: RdpOption }}
                      startMonth={new Date(new Date().getFullYear() - 10, 0, 1)}
                      endMonth={new Date()}
                      selected={parseDate(tempEnd)}
                      onSelect={(date) => {
                        if (date) {
                          setTempEnd(toYYYYMMDD(date));
                          setWhichCalendarOpen(null);
                        }
                      }}
                      disabled={(() => {
                        const d = parseDate(tempStart);
                        return d ? { before: d } : undefined;
                      })()}
                      defaultMonth={parseDate(tempEnd) || parseDate(tempStart) || new Date()}
                    />
                  </div>
                )}
              </div>
              <button
                onClick={handleApply}
                disabled={!tempStart || !tempEnd}
                className="mt-1 w-full rounded-xl py-2.5 text-[13px] font-semibold text-white transition-all duration-200 active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed"
                style={{
                  backgroundColor: getCurrentColor(),
                }}
                onMouseEnter={(e) => {
                  if (!e.currentTarget.disabled && brandPrimaryColor) {
                    const rgb = brandPrimaryColor.match(/\d+/g);
                    if (rgb && rgb.length >= 3) {
                      const r = parseInt(rgb[0]);
                      const g = parseInt(rgb[1]);
                      const b = parseInt(rgb[2]);
                      e.currentTarget.style.backgroundColor = `rgba(${r}, ${g}, ${b}, 0.85)`;
                    } else if (brandPrimaryColor.startsWith('#')) {
                      const hex = brandPrimaryColor.replace('#', '');
                      const r = parseInt(hex.substring(0, 2), 16);
                      const g = parseInt(hex.substring(2, 4), 16);
                      const b = parseInt(hex.substring(4, 6), 16);
                      e.currentTarget.style.backgroundColor = `rgba(${r}, ${g}, ${b}, 0.85)`;
                    }
                  }
                }}
                onMouseLeave={(e) => {
                  if (!e.currentTarget.disabled) {
                    e.currentTarget.style.backgroundColor = getCurrentColor();
                  }
                }}
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
