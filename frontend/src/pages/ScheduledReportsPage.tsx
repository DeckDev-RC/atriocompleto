import { useEffect, useMemo, useState } from 'react';
import { Clock3, Download, FileText, PauseCircle, PlayCircle, RefreshCw, Trash2, Pencil, Plus } from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Header } from '../components/Header';
import { agentApi } from '../services/agentApi';
import { useToast } from '../components/Toast';
import { useAuth } from '../contexts/AuthContext';
import { ReportExportModal } from '../components/reports/ReportExportModal';
import { ScheduleForm, type ReportsMetadata, type ScheduleFormValues } from '../components/reports/ScheduleForm';
import { ReportsModeToggle } from '../components/reports/ReportsModeToggle';
import { TemplatesGallery, type ReportTemplateSummary } from '../components/reports/TemplatesGallery';

interface ReportExecutionItem {
  id: string;
  execution_type: 'scheduled' | 'manual';
  status: 'running' | 'success' | 'failed';
  executed_at: string;
  duration_ms: number | null;
  error_message: string | null;
  file_name: string | null;
  recipients: string[];
}

interface ScheduledReportItem {
  id: string;
  name: string;
  report_type: 'sales' | 'products' | 'customers' | 'finance' | 'custom';
  custom_report_id?: string | null;
  custom_report_name?: string | null;
  format: 'csv' | 'xlsx' | 'html';
  status: 'active' | 'paused' | 'error';
  recipients: string[];
  next_run_at: string | null;
  last_run_at: string | null;
  schedule_config: ScheduleFormValues['schedule'];
  filters: ScheduleFormValues['filters'];
  stats: {
    total_runs: number;
    success_rate: number;
    avg_duration_ms: number;
  };
  recent_executions: ReportExecutionItem[];
}

function toFormValues(schedule: ScheduledReportItem): ScheduleFormValues {
  return {
    name: schedule.name,
    report_type: schedule.report_type,
    custom_report_id: schedule.custom_report_id ?? null,
    format: schedule.format,
    is_active: schedule.status === 'active',
    recipients: schedule.recipients || [],
    schedule: {
      frequency: schedule.schedule_config.frequency,
      time: schedule.schedule_config.time,
      day_of_week: schedule.schedule_config.day_of_week ?? null,
      day_of_month: schedule.schedule_config.day_of_month ?? null,
      month_of_year: schedule.schedule_config.month_of_year ?? null,
      cron_expression: schedule.schedule_config.cron_expression ?? null,
      timezone: schedule.schedule_config.timezone || 'America/Sao_Paulo',
    },
    filters: {
      period_mode: schedule.filters.period_mode,
      relative_period: schedule.filters.relative_period ?? null,
      start_date: schedule.filters.start_date ?? null,
      end_date: schedule.filters.end_date ?? null,
      status: schedule.filters.status ?? null,
      marketplace: schedule.filters.marketplace ?? null,
      category: schedule.filters.category ?? null,
      low_stock: schedule.filters.low_stock ?? false,
      out_of_stock: schedule.filters.out_of_stock ?? false,
      excess_stock: schedule.filters.excess_stock ?? false,
    },
  };
}

const REPORT_LABELS: Record<ScheduledReportItem['report_type'], string> = {
  sales: 'Vendas',
  products: 'Produtos',
  customers: 'Clientes',
  finance: 'Financeiro',
  custom: 'Customizado',
};

export default function ScheduledReportsPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { showToast } = useToast();
  const { hasPermission } = useAuth();
  const canManage = hasPermission('gerenciar_relatorios');

  const [metadata, setMetadata] = useState<ReportsMetadata | null>(null);
  const [schedules, setSchedules] = useState<ScheduledReportItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [usingTemplateId, setUsingTemplateId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editing, setEditing] = useState<ScheduledReportItem | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [exportingSchedule, setExportingSchedule] = useState<ScheduledReportItem | null>(null);
  const [templates, setTemplates] = useState<ReportTemplateSummary[]>([]);
  const [templateSearch, setTemplateSearch] = useState('');
  const [templateCategory, setTemplateCategory] = useState('');

  const selected = useMemo(
    () => schedules.find((schedule) => schedule.id === selectedId) || schedules[0] || null,
    [schedules, selectedId],
  );
  const templateCategories = useMemo(
    () => Array.from(new Set(templates.map((template) => template.category))).sort((left, right) => left.localeCompare(right, 'pt-BR')),
    [templates],
  );
  const filteredTemplates = useMemo(() => {
    const needle = templateSearch.trim().toLowerCase();

    return templates.filter((template) => {
      if (templateCategory && template.category !== templateCategory) return false;
      if (!needle) return true;

      const haystack = [
        template.name,
        template.description || '',
        template.category,
        ...template.tags,
        template.dataset,
      ].join(' ').toLowerCase();

      return haystack.includes(needle);
    });
  }, [templates, templateSearch, templateCategory]);

  const loadData = async (silent = false) => {
    try {
      if (silent) setRefreshing(true);
      else setLoading(true);

      const [metadataResult, schedulesResult, templatesResult] = await Promise.all([
        agentApi.getReportMetadata(),
        agentApi.getScheduledReports(),
        agentApi.getReportTemplates(),
      ]);

      if (!metadataResult.success || !metadataResult.data) {
        throw new Error(metadataResult.error || 'Erro ao carregar metadados');
      }
      if (!schedulesResult.success || !schedulesResult.data) {
        throw new Error(schedulesResult.error || 'Erro ao carregar agendamentos');
      }
      if (!templatesResult.success || !templatesResult.data) {
        throw new Error(templatesResult.error || 'Erro ao carregar templates');
      }

      setMetadata(metadataResult.data);
      setSchedules(schedulesResult.data as ScheduledReportItem[]);
      setTemplates(templatesResult.data as ReportTemplateSummary[]);
      if (!selectedId && schedulesResult.data.length > 0) {
        setSelectedId((schedulesResult.data[0] as ScheduledReportItem).id);
      }
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Erro ao carregar relatórios', 'error');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const handleUseTemplate = async (template: ReportTemplateSummary) => {
    if (!canManage) return;

    try {
      setUsingTemplateId(template.id);
      const result = await agentApi.useReportTemplate(template.id);
      if (!result.success || !result.data?.definition?.id) {
        throw new Error(result.error || 'Erro ao preparar template');
      }

      showToast(`Template "${template.name}" carregado no builder`, 'success');
      navigate(`/relatorios/customizados?definitionId=${result.data.definition.id}&fromTemplate=1`);
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Erro ao usar template', 'error');
    } finally {
      setUsingTemplateId(null);
    }
  };

  useEffect(() => {
    void loadData();
  }, []);

  useEffect(() => {
    const customReportId = searchParams.get('customReportId');
    if (!metadata || !customReportId || showForm) return;

    const definition = metadata.custom_reports.find((item) => item.id === customReportId);
    if (!definition) return;

    setEditing({
      id: 'new-custom',
      name: definition.name,
      report_type: 'custom',
      custom_report_id: definition.id,
      custom_report_name: definition.name,
      format: 'xlsx',
      status: 'active',
      recipients: [],
      next_run_at: null,
      last_run_at: null,
      schedule_config: {
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
      stats: {
        total_runs: 0,
        success_rate: 0,
        avg_duration_ms: 0,
      },
      recent_executions: [],
    });
    setShowForm(true);
    setSearchParams((current) => {
      const next = new URLSearchParams(current);
      next.delete('customReportId');
      return next;
    }, { replace: true });
  }, [metadata, searchParams, showForm]);

  const handlePreview = async (values: ScheduleFormValues) => {
    const result = await agentApi.previewScheduledReport(values);
    if (!result.success || !result.data) {
      throw new Error(result.error || 'Erro ao validar agendamento');
    }
    return result.data;
  };

  const handleSubmit = async (values: ScheduleFormValues) => {
    try {
      setSaving(true);
      const result = editing && editing.id !== 'new-custom'
        ? await agentApi.updateScheduledReport(editing.id, values)
        : await agentApi.createScheduledReport(values);

      if (!result.success) {
        throw new Error(result.error || 'Erro ao salvar agendamento');
      }

      showToast(editing ? 'Agendamento atualizado' : 'Agendamento criado', 'success');
      setShowForm(false);
      setEditing(null);
      await loadData(true);
    } finally {
      setSaving(false);
    }
  };

  const handleRunNow = async (id: string) => {
    const result = await agentApi.runScheduledReportNow(id);
    if (!result.success) {
      showToast(result.error || 'Erro ao executar relatório', 'error');
      return;
    }
    showToast('Execução manual iniciada e enviada ao seu email', 'success');
    await loadData(true);
  };

  const handleStatusToggle = async (schedule: ScheduledReportItem) => {
    const nextStatus = schedule.status === 'active' ? 'paused' : 'active';
    const result = await agentApi.updateScheduledReportStatus(schedule.id, nextStatus);
    if (!result.success) {
      showToast(result.error || 'Erro ao atualizar status', 'error');
      return;
    }
    showToast(nextStatus === 'active' ? 'Agendamento reativado' : 'Agendamento pausado', 'success');
    await loadData(true);
  };

  const handleDelete = async (schedule: ScheduledReportItem) => {
    if (!window.confirm(`Excluir o agendamento "${schedule.name}"?`)) return;
    const result = await agentApi.deleteScheduledReport(schedule.id);
    if (!result.success) {
      showToast(result.error || 'Erro ao excluir agendamento', 'error');
      return;
    }
    showToast('Agendamento excluído', 'success');
    setSelectedId(null);
    await loadData(true);
  };

  const handleDownload = async (executionId: string) => {
    const result = await agentApi.getReportExecutionDownloadUrl(executionId);
    if (!result.success || !result.data?.url) {
      showToast(result.error || 'Erro ao gerar link de download', 'error');
      return;
    }
    window.open(result.data.url, '_blank', 'noopener,noreferrer');
  };

  if (loading) {
    return <div className="p-7 text-sm text-muted">Carregando relatórios agendados...</div>;
  }

  return (
    <div className="p-7 max-md:p-5 max-sm:p-4">
      <Header title="Relatórios Agendados" subtitle="Geração automática, envio por email e histórico de execuções.">
        <ReportsModeToggle mode="templates" />
        <button onClick={() => void loadData(true)} className="inline-flex items-center gap-2 rounded-xl border border-border px-4 py-2 text-sm font-medium text-secondary transition-colors hover:bg-muted/10">
          <RefreshCw size={16} className={refreshing ? 'animate-spin' : ''} />
          Atualizar
        </button>
        {canManage && (
          <button onClick={() => { setEditing(null); setShowForm(true); }} className="inline-flex items-center gap-2 rounded-xl bg-brand-primary px-4 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-90">
            <Plus size={16} />
            Novo agendamento
          </button>
        )}
      </Header>

      <div className="mb-8">
        <TemplatesGallery
          templates={filteredTemplates}
          categories={templateCategories}
          search={templateSearch}
          category={templateCategory}
          loading={loading}
          usingTemplateId={usingTemplateId}
          canUse={canManage}
          onSearchChange={setTemplateSearch}
          onCategoryChange={setTemplateCategory}
          onUse={handleUseTemplate}
        />
      </div>

      {showForm && metadata && (
        <div className="mb-8">
          <ScheduleForm
            metadata={metadata}
            initialValues={editing ? toFormValues(editing) : null}
            saving={saving}
            onCancel={() => { setShowForm(false); setEditing(null); }}
            onSubmit={handleSubmit}
            onPreview={handlePreview}
          />
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <div className="space-y-4">
          {schedules.length === 0 ? (
            <div className="rounded-3xl border border-dashed border-border bg-card p-8 text-center text-sm text-muted">
              Nenhum relatório agendado ainda.
            </div>
          ) : (
            schedules.map((schedule) => (
              <div key={schedule.id} onClick={() => setSelectedId(schedule.id)} className={`cursor-pointer rounded-3xl border p-5 transition-colors ${selected?.id === schedule.id ? 'border-brand-primary bg-brand-primary/5' : 'border-border bg-card hover:bg-muted/5'}`}>
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="mb-2 flex flex-wrap items-center gap-2">
                      <span className="rounded-full bg-body px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-muted">{REPORT_LABELS[schedule.report_type]}</span>
                      <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide ${schedule.status === 'active' ? 'bg-success/10 text-success' : schedule.status === 'paused' ? 'bg-warning/10 text-warning' : 'bg-danger/10 text-danger'}`}>
                        {schedule.status}
                      </span>
                    </div>
                    <h3 className="text-lg font-semibold text-primary">{schedule.name}</h3>
                    <p className="mt-1 text-sm text-muted">
                      Formato {schedule.format.toUpperCase()} • {schedule.recipients.length} destinatário(s)
                      {schedule.report_type === 'custom' && schedule.custom_report_name ? ` • ${schedule.custom_report_name}` : ''}
                    </p>
                  </div>

                  {canManage && (
                    <div className="flex items-center gap-2">
                      <button onClick={(event) => { event.stopPropagation(); setEditing(schedule); setShowForm(true); }} className="rounded-xl p-2 text-muted transition-colors hover:bg-muted/10 hover:text-primary">
                        <Pencil size={16} />
                      </button>
                      <button onClick={(event) => { event.stopPropagation(); void handleStatusToggle(schedule); }} className="rounded-xl p-2 text-muted transition-colors hover:bg-muted/10 hover:text-primary">
                        {schedule.status === 'active' ? <PauseCircle size={16} /> : <PlayCircle size={16} />}
                      </button>
                      <button onClick={(event) => { event.stopPropagation(); setExportingSchedule(schedule); }} className="rounded-xl p-2 text-muted transition-colors hover:bg-muted/10 hover:text-primary">
                        <Download size={16} />
                      </button>
                      <button onClick={(event) => { event.stopPropagation(); void handleRunNow(schedule.id); }} className="rounded-xl p-2 text-muted transition-colors hover:bg-muted/10 hover:text-primary">
                        <PlayCircle size={16} />
                      </button>
                      <button onClick={(event) => { event.stopPropagation(); void handleDelete(schedule); }} className="rounded-xl p-2 text-muted transition-colors hover:bg-danger/10 hover:text-danger">
                        <Trash2 size={16} />
                      </button>
                    </div>
                  )}
                </div>

                <div className="mt-4 grid grid-cols-1 gap-3 text-sm text-secondary md:grid-cols-3">
                  <div className="rounded-2xl bg-body px-3 py-2">
                    <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-muted"><Clock3 size={14} /> Próxima</div>
                    <p className="mt-1 font-medium text-primary">{schedule.next_run_at ? new Date(schedule.next_run_at).toLocaleString('pt-BR') : '—'}</p>
                  </div>
                  <div className="rounded-2xl bg-body px-3 py-2">
                    <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-muted"><FileText size={14} /> Última</div>
                    <p className="mt-1 font-medium text-primary">{schedule.last_run_at ? new Date(schedule.last_run_at).toLocaleString('pt-BR') : '—'}</p>
                  </div>
                  <div className="rounded-2xl bg-body px-3 py-2">
                    <div className="text-xs uppercase tracking-wide text-muted">Taxa de sucesso</div>
                    <p className="mt-1 font-medium text-primary">{schedule.stats.success_rate}%</p>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        <aside className="rounded-3xl border border-border bg-card p-5">
          <h2 className="text-lg font-bold text-primary">Histórico recente</h2>
          <p className="mt-1 text-sm text-muted">Últimas execuções do agendamento selecionado.</p>

          {!selected ? (
            <p className="mt-6 text-sm text-muted">Selecione um agendamento para ver o histórico.</p>
          ) : selected.recent_executions.length === 0 ? (
            <p className="mt-6 text-sm text-muted">Nenhuma execução registrada ainda.</p>
          ) : (
            <div className="mt-4 space-y-3">
              {selected.recent_executions.map((execution) => (
                <div key={execution.id} className="rounded-2xl border border-border bg-body p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-primary">{execution.execution_type === 'manual' ? 'Execução manual' : 'Execução agendada'}</p>
                      <p className="mt-1 text-xs text-muted">{new Date(execution.executed_at).toLocaleString('pt-BR')}</p>
                    </div>
                    <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide ${execution.status === 'success' ? 'bg-success/10 text-success' : execution.status === 'failed' ? 'bg-danger/10 text-danger' : 'bg-warning/10 text-warning'}`}>
                      {execution.status}
                    </span>
                  </div>

                  <div className="mt-3 space-y-1 text-sm text-secondary">
                    <p>Destinatários: {execution.recipients.join(', ') || '—'}</p>
                    <p>Duração: {execution.duration_ms ? `${Math.round(execution.duration_ms / 1000)}s` : '—'}</p>
                    {execution.error_message && <p className="text-danger">{execution.error_message}</p>}
                  </div>

                  {execution.file_name && (
                    <button onClick={() => void handleDownload(execution.id)} className="mt-3 inline-flex items-center gap-2 rounded-xl border border-border px-3 py-2 text-sm font-medium text-secondary transition-colors hover:bg-muted/10">
                      <Download size={15} />
                      Baixar {execution.file_name}
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </aside>
      </div>

      {exportingSchedule && metadata && (
        <ReportExportModal
          open={Boolean(exportingSchedule)}
          title={`Exportar ${exportingSchedule.name}`}
          source={{
            sourceType: 'scheduled_report',
            sourceId: exportingSchedule.id,
            defaultTitle: exportingSchedule.name,
          }}
          recipientOptions={metadata.recipients}
          onClose={() => setExportingSchedule(null)}
        />
      )}
    </div>
  );
}
