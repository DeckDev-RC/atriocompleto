import { useEffect, useMemo, useState } from 'react';
import { CalendarClock, Mail, PlayCircle, Save, X } from 'lucide-react';

export interface ReportsMetadata {
  recipients: Array<{ id: string; email: string; full_name: string }>;
  statuses: string[];
  marketplaces: string[];
  categories: string[];
  custom_reports: Array<{ id: string; name: string; description: string | null; dataset: 'sales' | 'products' | 'customers' }>;
}

export interface ScheduleFormValues {
  name: string;
  report_type: 'sales' | 'products' | 'customers' | 'finance' | 'custom';
  custom_report_id?: string | null;
  format: 'csv' | 'xlsx' | 'html';
  is_active: boolean;
  recipients: string[];
  schedule: {
    frequency: 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'annual' | 'custom';
    time: string;
    day_of_week?: number | null;
    day_of_month?: number | null;
    month_of_year?: number | null;
    cron_expression?: string | null;
    timezone?: string;
  };
  filters: {
    period_mode: 'relative' | 'fixed';
    relative_period?: 'yesterday' | 'last_7_days' | 'previous_month_complete' | null;
    start_date?: string | null;
    end_date?: string | null;
    status?: string | null;
    marketplace?: string | null;
    category?: string | null;
    low_stock?: boolean | null;
    out_of_stock?: boolean | null;
    excess_stock?: boolean | null;
  };
}

interface ScheduleFormProps {
  metadata: ReportsMetadata;
  initialValues?: ScheduleFormValues | null;
  saving: boolean;
  onCancel: () => void;
  onSubmit: (values: ScheduleFormValues) => Promise<void>;
  onPreview: (values: ScheduleFormValues) => Promise<{ cronExpression: string; nextRunAt: string; description: string }>;
}

const WEEKDAYS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

function defaultValues(): ScheduleFormValues {
  return {
    name: '',
    report_type: 'sales',
    custom_report_id: null,
    format: 'xlsx',
    is_active: true,
    recipients: [],
    schedule: {
      frequency: 'weekly',
      time: '08:00',
      day_of_week: 1,
      day_of_month: 1,
      month_of_year: 1,
      cron_expression: null,
      timezone: 'America/Sao_Paulo',
    },
    filters: {
      period_mode: 'relative',
      relative_period: 'last_7_days',
      start_date: null,
      end_date: null,
      status: null,
      marketplace: null,
      category: null,
      low_stock: false,
      out_of_stock: false,
      excess_stock: false,
    },
  };
}

export function ScheduleForm({ metadata, initialValues, saving, onCancel, onSubmit, onPreview }: ScheduleFormProps) {
  const [values, setValues] = useState<ScheduleFormValues>(initialValues || defaultValues());
  const [preview, setPreview] = useState<{ cronExpression: string; nextRunAt: string; description: string } | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [recipientsInput, setRecipientsInput] = useState((initialValues?.recipients || []).join(', '));

  useEffect(() => {
    setValues(initialValues || defaultValues());
    setRecipientsInput((initialValues?.recipients || []).join(', '));
    setPreview(null);
  }, [initialValues]);

  const availableEmails = useMemo(() => metadata.recipients.map((recipient) => recipient.email), [metadata.recipients]);

  const syncRecipients = (raw: string) => {
    setRecipientsInput(raw);
    const parsed = raw
      .split(',')
      .map((item) => item.trim().toLowerCase())
      .filter(Boolean);
    setValues((current) => ({ ...current, recipients: Array.from(new Set(parsed)) }));
  };

  const toggleRecipient = (email: string) => {
    const next = values.recipients.includes(email)
      ? values.recipients.filter((item) => item !== email)
      : [...values.recipients, email];
    setValues((current) => ({ ...current, recipients: next }));
    setRecipientsInput(next.join(', '));
  };

  const updateSchedule = (patch: Partial<ScheduleFormValues['schedule']>) => {
    setValues((current) => ({ ...current, schedule: { ...current.schedule, ...patch } }));
  };

  const updateFilters = (patch: Partial<ScheduleFormValues['filters']>) => {
    setValues((current) => ({ ...current, filters: { ...current.filters, ...patch } }));
  };

  const handlePreview = async () => {
    setPreviewing(true);
    try {
      const nextPreview = await onPreview(values);
      setPreview(nextPreview);
    } finally {
      setPreviewing(false);
    }
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    await onSubmit(values);
  };

  return (
    <form onSubmit={handleSubmit} className="rounded-3xl border border-border bg-card p-6 shadow-soft">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-primary">{initialValues ? 'Editar agendamento' : 'Novo agendamento'}</h2>
          <p className="mt-1 text-sm text-muted">Defina tipo, período, destinatários e a frequência de geração.</p>
        </div>
        <button type="button" onClick={onCancel} className="rounded-xl p-2 text-muted transition-colors hover:bg-muted/10 hover:text-primary">
          <X size={18} />
        </button>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <label className="flex flex-col gap-2">
          <span className="text-sm font-medium text-primary">Nome do relatório</span>
          <input value={values.name} onChange={(event) => setValues((current) => ({ ...current, name: event.target.value }))} className="rounded-xl border border-border bg-body px-3 py-2.5 text-sm outline-none transition-colors focus:border-brand-primary" placeholder="Ex: Vendas Semanais" />
        </label>

        <label className="flex flex-col gap-2">
          <span className="text-sm font-medium text-primary">Tipo</span>
          <select value={values.report_type} onChange={(event) => setValues((current) => ({ ...current, report_type: event.target.value as ScheduleFormValues['report_type'] }))} className="rounded-xl border border-border bg-body px-3 py-2.5 text-sm outline-none transition-colors focus:border-brand-primary">
            <option value="sales">Vendas</option>
            <option value="products">Produtos</option>
            <option value="customers">Clientes</option>
            <option value="finance">Financeiro</option>
            <option value="custom">Customizado</option>
          </select>
        </label>

        {values.report_type === 'custom' && (
          <label className="flex flex-col gap-2">
            <span className="text-sm font-medium text-primary">Definição customizada</span>
            <select value={values.custom_report_id || ''} onChange={(event) => setValues((current) => ({ ...current, custom_report_id: event.target.value || null }))} className="rounded-xl border border-border bg-body px-3 py-2.5 text-sm outline-none transition-colors focus:border-brand-primary">
              <option value="">Selecione uma definição</option>
              {metadata.custom_reports.map((report) => (
                <option key={report.id} value={report.id}>{report.name}</option>
              ))}
            </select>
          </label>
        )}

        <label className="flex flex-col gap-2">
          <span className="text-sm font-medium text-primary">Formato</span>
          <select value={values.format} onChange={(event) => setValues((current) => ({ ...current, format: event.target.value as ScheduleFormValues['format'] }))} className="rounded-xl border border-border bg-body px-3 py-2.5 text-sm outline-none transition-colors focus:border-brand-primary">
            <option value="xlsx">Excel (XLSX)</option>
            <option value="csv">CSV</option>
            <option value="html">HTML</option>
          </select>
        </label>

        <label className="flex items-center gap-3 rounded-2xl border border-border bg-body px-4 py-3">
          <input type="checkbox" checked={values.is_active} onChange={(event) => setValues((current) => ({ ...current, is_active: event.target.checked }))} className="h-4 w-4 rounded border-border text-brand-primary" />
          <div>
            <p className="text-sm font-medium text-primary">Agendamento ativo</p>
            <p className="text-xs text-muted">Se desmarcado, o relatório fica salvo como pausado.</p>
          </div>
        </label>

        <label className="flex flex-col gap-2">
          <span className="text-sm font-medium text-primary">Frequência</span>
          <select value={values.schedule.frequency} onChange={(event) => updateSchedule({ frequency: event.target.value as ScheduleFormValues['schedule']['frequency'] })} className="rounded-xl border border-border bg-body px-3 py-2.5 text-sm outline-none transition-colors focus:border-brand-primary">
            <option value="daily">Diário</option>
            <option value="weekly">Semanal</option>
            <option value="monthly">Mensal</option>
            <option value="quarterly">Trimestral</option>
            <option value="annual">Anual</option>
            <option value="custom">Cron customizada</option>
          </select>
        </label>

        <label className="flex flex-col gap-2">
          <span className="text-sm font-medium text-primary">Horário</span>
          <input type="time" value={values.schedule.time} onChange={(event) => updateSchedule({ time: event.target.value })} className="rounded-xl border border-border bg-body px-3 py-2.5 text-sm outline-none transition-colors focus:border-brand-primary" />
        </label>

        {values.schedule.frequency === 'weekly' && (
          <label className="flex flex-col gap-2">
            <span className="text-sm font-medium text-primary">Dia da semana</span>
            <select value={values.schedule.day_of_week ?? 1} onChange={(event) => updateSchedule({ day_of_week: Number(event.target.value) })} className="rounded-xl border border-border bg-body px-3 py-2.5 text-sm outline-none transition-colors focus:border-brand-primary">
              {WEEKDAYS.map((weekday, index) => (
                <option key={weekday} value={index}>{weekday}</option>
              ))}
            </select>
          </label>
        )}

        {(values.schedule.frequency === 'monthly' || values.schedule.frequency === 'quarterly' || values.schedule.frequency === 'annual') && (
          <label className="flex flex-col gap-2">
            <span className="text-sm font-medium text-primary">Dia do mês</span>
            <input type="number" min={1} max={31} value={values.schedule.day_of_month ?? 1} onChange={(event) => updateSchedule({ day_of_month: Number(event.target.value) })} className="rounded-xl border border-border bg-body px-3 py-2.5 text-sm outline-none transition-colors focus:border-brand-primary" />
          </label>
        )}

        {values.schedule.frequency === 'annual' && (
          <label className="flex flex-col gap-2">
            <span className="text-sm font-medium text-primary">Mês</span>
            <input type="number" min={1} max={12} value={values.schedule.month_of_year ?? 1} onChange={(event) => updateSchedule({ month_of_year: Number(event.target.value) })} className="rounded-xl border border-border bg-body px-3 py-2.5 text-sm outline-none transition-colors focus:border-brand-primary" />
          </label>
        )}

        {values.schedule.frequency === 'custom' && (
          <label className="flex flex-col gap-2 md:col-span-2">
            <span className="text-sm font-medium text-primary">Cron expression</span>
            <input value={values.schedule.cron_expression || ''} onChange={(event) => updateSchedule({ cron_expression: event.target.value })} className="rounded-xl border border-border bg-body px-3 py-2.5 text-sm outline-none transition-colors focus:border-brand-primary" placeholder="0 8 * * 1" />
          </label>
        )}

        {values.report_type !== 'custom' && (
        <label className="flex flex-col gap-2">
          <span className="text-sm font-medium text-primary">Período</span>
          <select value={values.filters.period_mode} onChange={(event) => updateFilters({ period_mode: event.target.value as 'relative' | 'fixed' })} className="rounded-xl border border-border bg-body px-3 py-2.5 text-sm outline-none transition-colors focus:border-brand-primary">
            <option value="relative">Dinâmico</option>
            <option value="fixed">Fixo</option>
          </select>
        </label>
        )}

        {values.report_type !== 'custom' && values.filters.period_mode === 'relative' ? (
          <label className="flex flex-col gap-2">
            <span className="text-sm font-medium text-primary">Preset</span>
            <select value={values.filters.relative_period || 'last_7_days'} onChange={(event) => updateFilters({ relative_period: event.target.value as ScheduleFormValues['filters']['relative_period'] })} className="rounded-xl border border-border bg-body px-3 py-2.5 text-sm outline-none transition-colors focus:border-brand-primary">
              <option value="yesterday">Ontem</option>
              <option value="last_7_days">Últimos 7 dias</option>
              <option value="previous_month_complete">Mês anterior completo</option>
            </select>
          </label>
        ) : values.report_type !== 'custom' ? (
          <>
            <label className="flex flex-col gap-2">
              <span className="text-sm font-medium text-primary">Data inicial</span>
              <input type="date" value={values.filters.start_date || ''} onChange={(event) => updateFilters({ start_date: event.target.value || null })} className="rounded-xl border border-border bg-body px-3 py-2.5 text-sm outline-none transition-colors focus:border-brand-primary" />
            </label>
            <label className="flex flex-col gap-2">
              <span className="text-sm font-medium text-primary">Data final</span>
              <input type="date" value={values.filters.end_date || ''} onChange={(event) => updateFilters({ end_date: event.target.value || null })} className="rounded-xl border border-border bg-body px-3 py-2.5 text-sm outline-none transition-colors focus:border-brand-primary" />
            </label>
          </>
        ) : null}

        {values.report_type !== 'custom' && (
        <label className="flex flex-col gap-2">
          <span className="text-sm font-medium text-primary">Marketplace</span>
          <select value={values.filters.marketplace || ''} onChange={(event) => updateFilters({ marketplace: event.target.value || null })} className="rounded-xl border border-border bg-body px-3 py-2.5 text-sm outline-none transition-colors focus:border-brand-primary">
            <option value="">Todos</option>
            {metadata.marketplaces.map((marketplace) => (
              <option key={marketplace} value={marketplace}>{marketplace}</option>
            ))}
          </select>
        </label>
        )}

        {values.report_type !== 'custom' && (
        <label className="flex flex-col gap-2">
          <span className="text-sm font-medium text-primary">Status</span>
          <select value={values.filters.status || ''} onChange={(event) => updateFilters({ status: event.target.value || null })} className="rounded-xl border border-border bg-body px-3 py-2.5 text-sm outline-none transition-colors focus:border-brand-primary">
            <option value="">Todos</option>
            {metadata.statuses.map((status) => (
              <option key={status} value={status}>{status}</option>
            ))}
          </select>
        </label>
        )}

        {values.report_type !== 'custom' && (
        <label className="flex flex-col gap-2">
          <span className="text-sm font-medium text-primary">Categoria</span>
          <input list="report-categories" value={values.filters.category || ''} onChange={(event) => updateFilters({ category: event.target.value || null })} className="rounded-xl border border-border bg-body px-3 py-2.5 text-sm outline-none transition-colors focus:border-brand-primary" placeholder="Categoria de produto" />
          <datalist id="report-categories">
            {metadata.categories.map((category) => (
              <option key={category} value={category} />
            ))}
          </datalist>
        </label>
        )}

        {values.report_type === 'products' && (
          <div className="grid grid-cols-1 gap-2 rounded-2xl border border-border bg-body px-4 py-3 md:col-span-2">
            <span className="text-sm font-medium text-primary">Filtros de produto</span>
            <label className="flex items-center gap-2 text-sm text-secondary"><input type="checkbox" checked={Boolean(values.filters.low_stock)} onChange={(event) => updateFilters({ low_stock: event.target.checked })} /> Estoque baixo</label>
            <label className="flex items-center gap-2 text-sm text-secondary"><input type="checkbox" checked={Boolean(values.filters.out_of_stock)} onChange={(event) => updateFilters({ out_of_stock: event.target.checked })} /> Sem estoque</label>
            <label className="flex items-center gap-2 text-sm text-secondary"><input type="checkbox" checked={Boolean(values.filters.excess_stock)} onChange={(event) => updateFilters({ excess_stock: event.target.checked })} /> Excesso de estoque</label>
          </div>
        )}

        <label className="flex flex-col gap-2 md:col-span-2">
          <span className="flex items-center gap-2 text-sm font-medium text-primary"><Mail size={15} /> Destinatários autorizados</span>
          <textarea value={recipientsInput} onChange={(event) => syncRecipients(event.target.value)} rows={3} className="rounded-2xl border border-border bg-body px-3 py-2.5 text-sm outline-none transition-colors focus:border-brand-primary" placeholder="email1@empresa.com, email2@empresa.com" />
          <div className="flex flex-wrap gap-2">
            {metadata.recipients.map((recipient) => {
              const selected = values.recipients.includes(recipient.email);
              return (
                <button key={recipient.id} type="button" onClick={() => toggleRecipient(recipient.email)} className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${selected ? 'border-brand-primary bg-brand-primary/10 text-brand-primary' : 'border-border text-secondary hover:bg-muted/10'}`}>
                  {recipient.full_name || recipient.email}
                </button>
              );
            })}
          </div>
          <p className="text-xs text-muted">Emails disponíveis: {availableEmails.join(', ') || 'nenhum usuário elegível encontrado.'}</p>
        </label>
      </div>

      {preview && (
        <div className="mt-6 rounded-2xl border border-brand-primary/20 bg-brand-primary/5 px-4 py-3">
          <div className="flex items-center gap-2 text-sm font-semibold text-primary">
            <CalendarClock size={16} />
            {preview.description}
          </div>
          <p className="mt-1 text-sm text-secondary">Próxima execução em {new Date(preview.nextRunAt).toLocaleString('pt-BR')}</p>
          <p className="mt-1 text-xs text-muted">Cron: {preview.cronExpression}</p>
        </div>
      )}

      <div className="mt-6 flex flex-wrap items-center justify-end gap-3">
        <button type="button" onClick={handlePreview} disabled={previewing || saving} className="inline-flex items-center gap-2 rounded-xl border border-border px-4 py-2.5 text-sm font-medium text-secondary transition-colors hover:bg-muted/10 disabled:opacity-50">
          <PlayCircle size={16} />
          {previewing ? 'Validando...' : 'Validar agendamento'}
        </button>
        <button type="submit" disabled={saving} className="inline-flex items-center gap-2 rounded-xl bg-brand-primary px-4 py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50">
          <Save size={16} />
          {saving ? 'Salvando...' : initialValues ? 'Salvar alterações' : 'Criar agendamento'}
        </button>
      </div>
    </form>
  );
}
