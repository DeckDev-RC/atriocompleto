import { useEffect, useMemo, useState } from 'react';
import { Download, FileOutput, Link2, Mail, X } from 'lucide-react';
import { agentApi } from '../../services/agentApi';
import { useToast } from '../Toast';

type ExportFormat = 'csv' | 'xlsx' | 'html' | 'json' | 'pdf';
interface ExportRecipient {
  id: string;
  email: string;
  full_name: string;
}

interface CustomDefinitionPayload {
  dataset: 'sales' | 'products' | 'customers';
  dimensions: string[];
  metrics: string[];
  filters?: Array<{
    field: string;
    operator: 'eq' | 'in' | 'between' | 'gte' | 'lte';
    value: string | number | Array<string | number>;
  }>;
  sort?: {
    field: string;
    direction: 'asc' | 'desc';
  };
  limit?: number;
}

type ExportSourceConfig =
  | {
    sourceType: 'scheduled_report';
    sourceId: string;
    defaultTitle: string;
  }
  | {
    sourceType: 'custom_definition';
    sourceId: string;
    defaultTitle: string;
  }
  | {
    sourceType: 'custom_builder';
    defaultTitle: string;
    description?: string | null;
    definition: CustomDefinitionPayload;
  };

interface ExportHistoryItem {
  id: string;
  title: string;
  format: ExportFormat;
  status: 'queued' | 'processing' | 'success' | 'failed' | 'expired';
  progress: number;
  file_name: string | null;
  error_message: string | null;
  created_at: string;
}

interface ReportExportModalProps {
  open: boolean;
  title?: string;
  source: ExportSourceConfig;
  recipientOptions?: ExportRecipient[];
  onClose: () => void;
}

export function ReportExportModal({ open, title = 'Exportar relatório', source, recipientOptions = [], onClose }: ReportExportModalProps) {
  const { showToast } = useToast();
  const [format, setFormat] = useState<ExportFormat>('xlsx');
  const [orientation, setOrientation] = useState<'portrait' | 'landscape'>('portrait');
  const [delimiter, setDelimiter] = useState<',' | ';'>(';');
  const [includeSummary, setIncludeSummary] = useState(true);
  const [includeGraphs, setIncludeGraphs] = useState(true);
  const [watermark, setWatermark] = useState(false);
  const [history, setHistory] = useState<ExportHistoryItem[]>([]);
  const [currentExportId, setCurrentExportId] = useState<string | null>(null);
  const [currentExport, setCurrentExport] = useState<ExportHistoryItem | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [emailing, setEmailing] = useState(false);
  const [recipientsInput, setRecipientsInput] = useState('');

  const normalizedRecipients = useMemo(
    () => Array.from(new Set(recipientsInput.split(',').map((item) => item.trim().toLowerCase()).filter(Boolean))),
    [recipientsInput],
  );

  const loadHistory = async () => {
    if (!open) return;

    const params = source.sourceType === 'custom_builder'
      ? { source_type: source.sourceType, limit: 10 }
      : { source_type: source.sourceType, source_id: source.sourceId, limit: 10 };
    const result = await agentApi.getReportExports(params);
    if (result.success && result.data) {
      setHistory(result.data as ExportHistoryItem[]);
    }
  };

  useEffect(() => {
    if (!open) return;
    setCurrentExportId(null);
    setCurrentExport(null);
    void loadHistory();
  }, [open, source.sourceType, 'sourceId' in source ? source.sourceId : 'inline']);

  useEffect(() => {
    if (!open || !currentExportId) return;

    const interval = window.setInterval(async () => {
      const result = await agentApi.getReportExport(currentExportId);
      if (!result.success || !result.data) return;

      const next = result.data as ExportHistoryItem;
      setCurrentExport(next);
      if (next.status === 'success' || next.status === 'failed' || next.status === 'expired') {
        window.clearInterval(interval);
        await loadHistory();
      }
    }, 2000);

    return () => window.clearInterval(interval);
  }, [open, currentExportId]);

  const toggleRecipient = (email: string) => {
    const next = normalizedRecipients.includes(email)
      ? normalizedRecipients.filter((item) => item !== email)
      : [...normalizedRecipients, email];
    setRecipientsInput(next.join(', '));
  };

  const handleGenerate = async () => {
    try {
      setSubmitting(true);
      const options = {
        orientation,
        delimiter,
        include_summary: includeSummary,
        include_graphs: includeGraphs,
        watermark,
      };

      const payload = source.sourceType === 'custom_builder'
        ? {
          source_type: source.sourceType,
          title: source.defaultTitle,
          description: source.description || null,
          definition: source.definition,
          format,
          options,
        }
        : {
          source_type: source.sourceType,
          source_id: source.sourceId,
          title: source.defaultTitle,
          format,
          options,
        };

      const result = await agentApi.createReportExport(payload as never);
      if (!result.success || !result.data?.id) {
        throw new Error(result.error || 'Erro ao solicitar export');
      }

      setCurrentExportId(result.data.id as string);
      setCurrentExport(result.data as ExportHistoryItem);
      showToast('Export solicitado. Acompanhe o progresso no modal.', 'success');
      await loadHistory();
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Erro ao solicitar export', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDownload = async (exportId: string) => {
    const result = await agentApi.getReportExportDownloadUrl(exportId);
    if (!result.success || !result.data?.url) {
      showToast(result.error || 'Erro ao gerar link de download', 'error');
      return;
    }
    window.open(result.data.url, '_blank', 'noopener,noreferrer');
  };

  const handleShare = async (exportId: string) => {
    try {
      setSharing(true);
      const result = await agentApi.shareReportExport(exportId);
      if (!result.success || !result.data?.url) {
        throw new Error(result.error || 'Erro ao compartilhar export');
      }
      await navigator.clipboard.writeText(result.data.url);
      showToast('Link temporário copiado', 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Erro ao compartilhar export', 'error');
    } finally {
      setSharing(false);
    }
  };

  const handleEmail = async (exportId: string) => {
    try {
      if (normalizedRecipients.length === 0) {
        showToast('Informe ao menos um destinatário', 'warning');
        return;
      }

      setEmailing(true);
      const result = await agentApi.emailReportExport(exportId, normalizedRecipients);
      if (!result.success) {
        throw new Error(result.error || 'Erro ao enviar export por email');
      }
      showToast('Export enviado por email', 'success');
      await loadHistory();
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Erro ao enviar export por email', 'error');
    } finally {
      setEmailing(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[310] flex items-center justify-center bg-black/45 px-4 py-6 backdrop-blur-sm">
      <div className="w-full max-w-5xl rounded-3xl border border-border bg-card p-6 shadow-soft">
        <div className="mb-6 flex items-start justify-between gap-4">
          <div>
            <h3 className="text-lg font-bold text-primary">{title}</h3>
            <p className="mt-1 text-sm text-muted">Gere um arquivo profissional, acompanhe o processamento e compartilhe quando estiver pronto.</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-xl p-2 text-muted transition-colors hover:bg-muted/10 hover:text-primary">
            <X size={18} />
          </button>
        </div>

        <div className="grid grid-cols-1 gap-6 xl:grid-cols-[0.8fr_1.2fr]">
          <section className="rounded-3xl border border-border bg-body p-5">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <label className="flex flex-col gap-2">
                <span className="text-sm font-medium text-primary">Formato</span>
                <select value={format} onChange={(event) => setFormat(event.target.value as ExportFormat)} className="rounded-xl border border-border bg-card px-3 py-2.5 text-sm outline-none focus:border-brand-primary">
                  <option value="xlsx">Excel (.xlsx)</option>
                  <option value="csv">CSV</option>
                  <option value="html">HTML</option>
                  <option value="json">JSON</option>
                  <option value="pdf">PDF</option>
                </select>
              </label>

              {format === 'pdf' && (
                <label className="flex flex-col gap-2">
                  <span className="text-sm font-medium text-primary">Orientação</span>
                  <select value={orientation} onChange={(event) => setOrientation(event.target.value as 'portrait' | 'landscape')} className="rounded-xl border border-border bg-card px-3 py-2.5 text-sm outline-none focus:border-brand-primary">
                    <option value="portrait">Retrato</option>
                    <option value="landscape">Paisagem</option>
                  </select>
                </label>
              )}

              {format === 'csv' && (
                <label className="flex flex-col gap-2">
                  <span className="text-sm font-medium text-primary">Separador</span>
                  <select value={delimiter} onChange={(event) => setDelimiter(event.target.value as ',' | ';')} className="rounded-xl border border-border bg-card px-3 py-2.5 text-sm outline-none focus:border-brand-primary">
                    <option value=";">Ponto e vírgula</option>
                    <option value=",">Vírgula</option>
                  </select>
                </label>
              )}

              <label className="flex items-center gap-3 rounded-2xl border border-border bg-card px-4 py-3">
                <input type="checkbox" checked={includeSummary} onChange={(event) => setIncludeSummary(event.target.checked)} />
                <div>
                  <p className="text-sm font-medium text-primary">Incluir sumário</p>
                  <p className="text-xs text-muted">Resumo executivo e cards no HTML/PDF.</p>
                </div>
              </label>

              <label className="flex items-center gap-3 rounded-2xl border border-border bg-card px-4 py-3">
                <input type="checkbox" checked={includeGraphs} onChange={(event) => setIncludeGraphs(event.target.checked)} />
                <div>
                  <p className="text-sm font-medium text-primary">Incluir gráficos</p>
                  <p className="text-xs text-muted">Preparado para evoluções futuras do render visual.</p>
                </div>
              </label>

              <label className="flex items-center gap-3 rounded-2xl border border-border bg-card px-4 py-3 md:col-span-2">
                <input type="checkbox" checked={watermark} onChange={(event) => setWatermark(event.target.checked)} />
                <div>
                  <p className="text-sm font-medium text-primary">Marca d&apos;água</p>
                  <p className="text-xs text-muted">Aplica “Confidencial • Uso Interno” em HTML/PDF.</p>
                </div>
              </label>

              <label className="flex flex-col gap-2 md:col-span-2">
                <span className="text-sm font-medium text-primary">Destinatários para envio por email</span>
                <textarea
                  value={recipientsInput}
                  onChange={(event) => setRecipientsInput(event.target.value)}
                  rows={3}
                  placeholder="email1@empresa.com, email2@empresa.com"
                  className="rounded-2xl border border-border bg-card px-3 py-2.5 text-sm outline-none focus:border-brand-primary"
                />
                {recipientOptions.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {recipientOptions.map((recipient) => {
                      const selected = normalizedRecipients.includes(recipient.email);
                      return (
                        <button
                          key={recipient.id}
                          type="button"
                          onClick={() => toggleRecipient(recipient.email)}
                          className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${selected ? 'border-brand-primary bg-brand-primary/10 text-brand-primary' : 'border-border text-secondary hover:bg-muted/10'}`}
                        >
                          {recipient.full_name || recipient.email}
                        </button>
                      );
                    })}
                  </div>
                )}
              </label>
            </div>

            <div className="mt-6 flex flex-wrap justify-end gap-3">
              <button type="button" onClick={handleGenerate} disabled={submitting} className="inline-flex items-center gap-2 rounded-xl bg-brand-primary px-4 py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50">
                <FileOutput size={16} />
                {submitting ? 'Solicitando...' : 'Gerar export'}
              </button>
            </div>
          </section>

          <section className="rounded-3xl border border-border bg-body p-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h4 className="text-base font-bold text-primary">Progresso e histórico</h4>
                <p className="mt-1 text-sm text-muted">Acompanhe o export atual e os últimos arquivos gerados para esta origem.</p>
              </div>
              <button type="button" onClick={() => void loadHistory()} className="rounded-xl border border-border px-3 py-2 text-sm text-secondary transition-colors hover:bg-muted/10">
                Atualizar
              </button>
            </div>

            {currentExport && (
              <div className="mt-4 rounded-2xl border border-brand-primary/20 bg-brand-primary/5 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-primary">{currentExport.title}</p>
                    <p className="mt-1 text-xs text-muted uppercase tracking-wide">{currentExport.format} • {currentExport.status}</p>
                  </div>
                  <span className="text-sm font-semibold text-primary">{currentExport.progress}%</span>
                </div>
                <div className="mt-3 h-2 overflow-hidden rounded-full bg-border">
                  <div className="h-full rounded-full bg-brand-primary transition-all" style={{ width: `${currentExport.progress}%` }} />
                </div>
                {currentExport.error_message && <p className="mt-3 text-sm text-danger">{currentExport.error_message}</p>}
                {currentExport.status === 'success' && (
                  <div className="mt-4 flex flex-wrap gap-2">
                    <button type="button" onClick={() => void handleDownload(currentExport.id)} className="inline-flex items-center gap-2 rounded-xl border border-border px-3 py-2 text-sm text-secondary transition-colors hover:bg-muted/10">
                      <Download size={15} />
                      Baixar
                    </button>
                    <button type="button" onClick={() => void handleShare(currentExport.id)} disabled={sharing} className="inline-flex items-center gap-2 rounded-xl border border-border px-3 py-2 text-sm text-secondary transition-colors hover:bg-muted/10 disabled:opacity-50">
                      <Link2 size={15} />
                      {sharing ? 'Gerando link...' : 'Copiar link'}
                    </button>
                    <button type="button" onClick={() => void handleEmail(currentExport.id)} disabled={emailing} className="inline-flex items-center gap-2 rounded-xl border border-border px-3 py-2 text-sm text-secondary transition-colors hover:bg-muted/10 disabled:opacity-50">
                      <Mail size={15} />
                      {emailing ? 'Enviando...' : 'Enviar por email'}
                    </button>
                  </div>
                )}
              </div>
            )}

            {history.length === 0 ? (
              <div className="mt-4 rounded-2xl border border-dashed border-border bg-card p-6 text-sm text-muted">
                Nenhum export registrado ainda para esta origem.
              </div>
            ) : (
              <div className="mt-4 space-y-3">
                {history.map((item) => (
                  <div key={item.id} className="rounded-2xl border border-border bg-card p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-primary">{item.title}</p>
                        <p className="mt-1 text-xs text-muted">{new Date(item.created_at).toLocaleString('pt-BR')} • {item.format.toUpperCase()}</p>
                      </div>
                      <div className="text-right">
                        <span className="rounded-full bg-body px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-secondary">{item.status}</span>
                        <p className="mt-2 text-xs text-muted">{item.progress}%</p>
                      </div>
                    </div>
                    {item.status === 'success' && (
                      <div className="mt-3">
                        <button type="button" onClick={() => void handleDownload(item.id)} className="inline-flex items-center gap-2 rounded-xl border border-border px-3 py-2 text-sm text-secondary transition-colors hover:bg-muted/10">
                          <Download size={15} />
                          Baixar {item.file_name || 'arquivo'}
                        </button>
                      </div>
                    )}
                    {item.error_message && <p className="mt-3 text-sm text-danger">{item.error_message}</p>}
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
