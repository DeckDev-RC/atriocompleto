import { useEffect, useMemo, useState } from 'react';
import { Download, Filter, Layers3, RefreshCw } from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Header } from '../components/Header';
import { agentApi } from '../services/agentApi';
import { useToast } from '../components/Toast';
import { useAuth } from '../contexts/AuthContext';
import { ReportsModeToggle } from '../components/reports/ReportsModeToggle';
import { ReportExportModal } from '../components/reports/ReportExportModal';
import { SaveTemplateModal } from '../components/reports/SaveTemplateModal';

type DatasetKey = 'sales' | 'products' | 'customers';
type FilterOperator = 'eq' | 'in' | 'between' | 'gte' | 'lte';

interface DatasetField {
  key: string;
  label: string;
}

interface DatasetFilter {
  key: string;
  label: string;
  type: 'text' | 'number' | 'date';
}

interface DatasetDefinition {
  key: DatasetKey;
  label: string;
  description: string;
  dimensions: DatasetField[];
  metrics: DatasetField[];
  filters: DatasetFilter[];
}

interface BuilderFilterState {
  field: string;
  operator: FilterOperator;
  value: string;
}

interface SavedCustomDefinition {
  id: string;
  name: string;
  description: string | null;
  definition: {
    dataset: DatasetKey;
    dimensions: string[];
    metrics: string[];
    filters?: Array<{
      field: string;
      operator: FilterOperator;
      value: string | number | Array<string | number>;
    }>;
    sort?: {
      field: string;
      direction: 'asc' | 'desc';
    };
    limit?: number;
  };
}

const FILTER_OPERATORS: Array<{ value: FilterOperator; label: string }> = [
  { value: 'eq', label: '=' },
  { value: 'in', label: 'IN' },
  { value: 'between', label: 'BETWEEN' },
  { value: 'gte', label: '>=' },
  { value: 'lte', label: '<=' },
];

const TEMPLATE_CATEGORY_OPTIONS: Record<DatasetKey, string[]> = {
  sales: ['Vendas', 'Financeiro', 'Operacional'],
  products: ['Produtos', 'Estoque', 'Operacional'],
  customers: ['Clientes', 'Marketing', 'Operacional'],
};

function defaultTemplateCategory(dataset: DatasetKey) {
  return TEMPLATE_CATEGORY_OPTIONS[dataset][0];
}

function exportRowsToCsv(rows: Array<Record<string, string | number | null>>) {
  if (!rows.length) return;
  const headers = Object.keys(rows[0]);
  const csv = [
    headers.join(';'),
    ...rows.map((row) => headers.map((header) => `"${String(row[header] ?? '').replace(/"/g, '""')}"`).join(';')),
  ].join('\n');

  const blob = new Blob([new Uint8Array([0xef, 0xbb, 0xbf]), csv], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `custom_report_${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

export default function CustomReportsPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { showToast } = useToast();
  const { hasPermission } = useAuth();
  const canManage = hasPermission('gerenciar_relatorios');
  const [datasets, setDatasets] = useState<DatasetDefinition[]>([]);
  const [definitions, setDefinitions] = useState<SavedCustomDefinition[]>([]);
  const [reportRecipients, setReportRecipients] = useState<Array<{ id: string; email: string; full_name: string }>>([]);
  const [definitionId, setDefinitionId] = useState<string | null>(null);
  const [definitionName, setDefinitionName] = useState('');
  const [definitionDescription, setDefinitionDescription] = useState('');
  const [datasetKey, setDatasetKey] = useState<DatasetKey>('sales');
  const [dimensions, setDimensions] = useState<string[]>([]);
  const [metrics, setMetrics] = useState<string[]>([]);
  const [filters, setFilters] = useState<BuilderFilterState[]>([]);
  const [sortField, setSortField] = useState('');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
  const [limit, setLimit] = useState(25);
  const [previewRows, setPreviewRows] = useState<Array<Record<string, string | number | null>>>([]);
  const [previewSql, setPreviewSql] = useState('');
  const [loading, setLoading] = useState(true);
  const [previewing, setPreviewing] = useState(false);
  const [savingDefinition, setSavingDefinition] = useState(false);
  const [savingTemplate, setSavingTemplate] = useState(false);
  const [showTemplateModal, setShowTemplateModal] = useState(false);
  const [showExportModal, setShowExportModal] = useState(false);
  const [templateSourceDefinition, setTemplateSourceDefinition] = useState<SavedCustomDefinition | null>(null);

  const currentDataset = useMemo(
    () => datasets.find((dataset) => dataset.key === datasetKey) || null,
    [datasets, datasetKey],
  );
  const templateCategoryOptions = useMemo(
    () => TEMPLATE_CATEGORY_OPTIONS[templateSourceDefinition?.definition.dataset || datasetKey],
    [datasetKey, templateSourceDefinition],
  );

  const buildDefinitionPayload = () => ({
    dataset: datasetKey,
    dimensions,
    metrics,
    filters: filters
      .filter((filter) => filter.field && filter.value)
      .map((filter) => ({
        field: filter.field,
        operator: filter.operator,
        value:
          filter.operator === 'in' || filter.operator === 'between'
            ? filter.value.split(',').map((item) => item.trim()).filter(Boolean)
            : filter.value,
      })),
    sort: sortField ? { field: sortField, direction: sortDirection } : undefined,
    limit,
  });

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);
        const [metadataResult, definitionsResult, reportMetadataResult] = await Promise.all([
          agentApi.getCustomReportMetadata(),
          agentApi.getCustomReportDefinitions(),
          agentApi.getReportMetadata(),
        ]);

        if (!metadataResult.success || !metadataResult.data) {
          throw new Error(metadataResult.error || 'Erro ao carregar datasets');
        }
        if (!definitionsResult.success) {
          throw new Error(definitionsResult.error || 'Erro ao carregar definições');
        }

        if (!reportMetadataResult.success || !reportMetadataResult.data) {
          throw new Error(reportMetadataResult.error || 'Erro ao carregar metadados de exportação');
        }

        setDatasets(metadataResult.data.datasets as DatasetDefinition[]);
        setDefinitions((definitionsResult.data || []) as SavedCustomDefinition[]);
        setReportRecipients(reportMetadataResult.data.recipients || []);
        const first = (metadataResult.data.datasets[0] as DatasetDefinition | undefined) || null;
        if (first) {
          setDatasetKey(first.key);
          setDimensions(first.dimensions.slice(0, 1).map((item) => item.key));
          setMetrics(first.metrics.slice(0, 1).map((item) => item.key));
          setSortField(first.metrics[0]?.key || first.dimensions[0]?.key || '');
        }
      } catch (error) {
        showToast(error instanceof Error ? error.message : 'Erro ao carregar builder', 'error');
      } finally {
        setLoading(false);
      }
    };

    void load();
  }, []);

  useEffect(() => {
    if (!currentDataset) return;
    if (definitionId) return;
    setDimensions(currentDataset.dimensions.slice(0, 1).map((item) => item.key));
    setMetrics(currentDataset.metrics.slice(0, 1).map((item) => item.key));
    setFilters([]);
    setSortField(currentDataset.metrics[0]?.key || currentDataset.dimensions[0]?.key || '');
    setPreviewRows([]);
    setPreviewSql('');
  }, [datasetKey, currentDataset?.key, definitionId]);

  useEffect(() => {
    const definitionIdFromQuery = searchParams.get('definitionId');
    if (!definitionIdFromQuery || definitions.length === 0) return;
    if (definitionId === definitionIdFromQuery) return;

    const target = definitions.find((definition) => definition.id === definitionIdFromQuery);
    if (!target) return;

    setDefinitionId(target.id);
    setDefinitionName(target.name);
    setDefinitionDescription(target.description || '');
    setDatasetKey(target.definition.dataset);
    setDimensions(target.definition.dimensions);
    setMetrics(target.definition.metrics);
    setFilters(
      (target.definition.filters || []).map((filter) => ({
        field: filter.field,
        operator: filter.operator,
        value: Array.isArray(filter.value) ? filter.value.join(', ') : String(filter.value),
      })),
    );
    setSortField(target.definition.sort?.field || target.definition.metrics[0] || target.definition.dimensions[0] || '');
    setSortDirection(target.definition.sort?.direction || 'desc');
    setLimit(target.definition.limit || 25);
    setPreviewRows([]);
    setPreviewSql('');

    if (searchParams.get('fromTemplate') === '1') {
      showToast('Template carregado no builder customizado', 'success');
      setSearchParams((current) => {
        const next = new URLSearchParams(current);
        next.delete('fromTemplate');
        return next;
      }, { replace: true });
    }
  }, [searchParams, definitions, definitionId, setSearchParams, showToast]);

  const toggleSelection = (setter: React.Dispatch<React.SetStateAction<string[]>>, key: string, max: number) => {
    setter((current) => {
      if (current.includes(key)) {
        return current.filter((item) => item !== key);
      }
      if (current.length >= max) return current;
      return [...current, key];
    });
  };

  const handlePreview = async () => {
    if (!currentDataset) return;
    try {
      setPreviewing(true);
      const payload = buildDefinitionPayload();

      const result = await agentApi.previewCustomReport(payload);
      if (!result.success || !result.data) {
        throw new Error(result.error || 'Erro ao gerar preview');
      }
      setPreviewRows(result.data.rows || []);
      setPreviewSql(result.data.sql || '');
      showToast(`Preview gerado com ${result.data.rowCount} linha(s)`, 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Erro ao gerar preview', 'error');
    } finally {
      setPreviewing(false);
    }
  };

  const resetBuilder = (nextDataset?: DatasetKey) => {
    const dataset = datasets.find((item) => item.key === (nextDataset || datasetKey)) || null;
    if (!dataset) return;
    setDefinitionId(null);
    setDefinitionName('');
    setDefinitionDescription('');
    setDatasetKey(dataset.key);
    setDimensions(dataset.dimensions.slice(0, 1).map((item) => item.key));
    setMetrics(dataset.metrics.slice(0, 1).map((item) => item.key));
    setFilters([]);
    setSortField(dataset.metrics[0]?.key || dataset.dimensions[0]?.key || '');
    setSortDirection('desc');
    setLimit(25);
    setPreviewRows([]);
    setPreviewSql('');
  };

  const handleLoadDefinition = (definition: SavedCustomDefinition) => {
    setDefinitionId(definition.id);
    setDefinitionName(definition.name);
    setDefinitionDescription(definition.description || '');
    setDatasetKey(definition.definition.dataset);
    setDimensions(definition.definition.dimensions);
    setMetrics(definition.definition.metrics);
    setFilters(
      (definition.definition.filters || []).map((filter) => ({
        field: filter.field,
        operator: filter.operator,
        value: Array.isArray(filter.value) ? filter.value.join(', ') : String(filter.value),
      })),
    );
    setSortField(definition.definition.sort?.field || definition.definition.metrics[0] || definition.definition.dimensions[0] || '');
    setSortDirection(definition.definition.sort?.direction || 'desc');
    setLimit(definition.definition.limit || 25);
    setPreviewRows([]);
    setPreviewSql('');
  };

  const handleSaveDefinition = async () => {
    if (!canManage) return;
    if (!definitionName.trim()) {
      showToast('Informe um nome para a definição', 'warning');
      return;
    }

    try {
      setSavingDefinition(true);
      const payload = {
        name: definitionName.trim(),
        description: definitionDescription.trim() || null,
        definition: buildDefinitionPayload(),
      };

      const result = definitionId
        ? await agentApi.updateCustomReportDefinition(definitionId, payload)
        : await agentApi.createCustomReportDefinition(payload);

      if (!result.success) {
        throw new Error(result.error || 'Erro ao salvar definição');
      }

      const definitionsResult = await agentApi.getCustomReportDefinitions();
      if (definitionsResult.success && definitionsResult.data) {
        setDefinitions(definitionsResult.data as SavedCustomDefinition[]);
      }
      setDefinitionId((result.data as SavedCustomDefinition).id);
      showToast(definitionId ? 'Definição atualizada' : 'Definição salva', 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Erro ao salvar definição', 'error');
    } finally {
      setSavingDefinition(false);
    }
  };

  const openTemplateModalFromBuilder = () => {
    setTemplateSourceDefinition(null);
    setShowTemplateModal(true);
  };

  const openTemplateModalFromDefinition = (definition: SavedCustomDefinition) => {
    setTemplateSourceDefinition(definition);
    setShowTemplateModal(true);
  };

  const handleSaveTemplate = async (values: {
    name: string;
    description: string;
    category: string;
    tags: string[];
    scope: 'tenant' | 'user';
  }) => {
    try {
      setSavingTemplate(true);
      const result = await agentApi.createReportTemplate({
        name: values.name,
        description: values.description || null,
        category: values.category,
        tags: values.tags,
        scope: values.scope,
        source_definition_id: templateSourceDefinition?.id || undefined,
        definition: templateSourceDefinition ? undefined : buildDefinitionPayload(),
      });

      if (!result.success) {
        throw new Error(result.error || 'Erro ao salvar template');
      }

      showToast('Template salvo com sucesso', 'success');
      setShowTemplateModal(false);
      setTemplateSourceDefinition(null);
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Erro ao salvar template', 'error');
    } finally {
      setSavingTemplate(false);
    }
  };

  const handleDeleteDefinition = async (definition: SavedCustomDefinition) => {
    if (!canManage) return;
    if (!window.confirm(`Excluir a definição "${definition.name}"?`)) return;
    const result = await agentApi.deleteCustomReportDefinition(definition.id);
    if (!result.success) {
      showToast(result.error || 'Erro ao excluir definição', 'error');
      return;
    }
    setDefinitions((current) => current.filter((item) => item.id !== definition.id));
    if (definitionId === definition.id) {
      resetBuilder();
    }
    showToast('Definição excluída', 'success');
  };

  if (loading) {
    return <div className="p-7 text-sm text-muted">Carregando builder de relatórios...</div>;
  }

  return (
    <div className="p-7 max-md:p-5 max-sm:p-4">
      <Header title="Relatórios Customizados" subtitle="Builder restrito por datasets e campos permitidos.">
        <ReportsModeToggle mode="builder" />
        {canManage && (
          <button onClick={() => resetBuilder()} className="inline-flex items-center gap-2 rounded-xl border border-border px-4 py-2 text-sm font-medium text-secondary transition-colors hover:bg-muted/10">
            <Layers3 size={16} />
            Nova definição
          </button>
        )}
        <button onClick={handlePreview} disabled={previewing || !currentDataset} className="inline-flex items-center gap-2 rounded-xl bg-brand-primary px-4 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50">
          <RefreshCw size={16} className={previewing ? 'animate-spin' : ''} />
          {previewing ? 'Gerando...' : 'Gerar preview'}
        </button>
      </Header>

      {!currentDataset ? null : (
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-[0.85fr_1.15fr]">
          <section className="rounded-3xl border border-border bg-card p-5">
            <div className="mb-5">
              <h2 className="text-lg font-bold text-primary">Configuração</h2>
              <p className="mt-1 text-sm text-muted">Monte um preview seguro sem SQL livre.</p>
            </div>

            <div className="space-y-4">
              {canManage && (
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <label className="flex flex-col gap-2">
                    <span className="text-sm font-medium text-primary">Nome da definição</span>
                    <input value={definitionName} onChange={(event) => setDefinitionName(event.target.value)} className="rounded-xl border border-border bg-body px-3 py-2.5 text-sm outline-none focus:border-brand-primary" placeholder="Ex: Receita por marketplace" />
                  </label>
                  <label className="flex flex-col gap-2">
                    <span className="text-sm font-medium text-primary">Descrição</span>
                    <input value={definitionDescription} onChange={(event) => setDefinitionDescription(event.target.value)} className="rounded-xl border border-border bg-body px-3 py-2.5 text-sm outline-none focus:border-brand-primary" placeholder="Opcional" />
                  </label>
                </div>
              )}

              <label className="flex flex-col gap-2">
                <span className="text-sm font-medium text-primary">Dataset</span>
                <select value={datasetKey} onChange={(event) => setDatasetKey(event.target.value as DatasetKey)} className="rounded-xl border border-border bg-body px-3 py-2.5 text-sm outline-none focus:border-brand-primary">
                  {datasets.map((dataset) => (
                    <option key={dataset.key} value={dataset.key}>{dataset.label}</option>
                  ))}
                </select>
                <span className="text-xs text-muted">{currentDataset.description}</span>
              </label>

              <div className="rounded-2xl border border-border bg-body p-4">
                <div className="mb-3 flex items-center gap-2 text-sm font-medium text-primary"><Layers3 size={16} /> Dimensões</div>
                <div className="flex flex-wrap gap-2">
                  {currentDataset.dimensions.map((dimension) => {
                    const active = dimensions.includes(dimension.key);
                    return (
                      <button key={dimension.key} type="button" onClick={() => toggleSelection(setDimensions, dimension.key, 3)} className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${active ? 'border-brand-primary bg-brand-primary/10 text-brand-primary' : 'border-border text-secondary hover:bg-muted/10'}`}>
                        {dimension.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="rounded-2xl border border-border bg-body p-4">
                <div className="mb-3 flex items-center gap-2 text-sm font-medium text-primary"><Layers3 size={16} /> Métricas</div>
                <div className="flex flex-wrap gap-2">
                  {currentDataset.metrics.map((metric) => {
                    const active = metrics.includes(metric.key);
                    return (
                      <button key={metric.key} type="button" onClick={() => toggleSelection(setMetrics, metric.key, 5)} className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${active ? 'border-brand-primary bg-brand-primary/10 text-brand-primary' : 'border-border text-secondary hover:bg-muted/10'}`}>
                        {metric.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="rounded-2xl border border-border bg-body p-4">
                <div className="mb-3 flex items-center gap-2 text-sm font-medium text-primary"><Filter size={16} /> Filtros</div>
                <div className="space-y-3">
                  {filters.map((filter, index) => (
                    <div key={`${filter.field}-${index}`} className="grid grid-cols-1 gap-2 md:grid-cols-[1fr_0.8fr_1.4fr_auto]">
                      <select value={filter.field} onChange={(event) => setFilters((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, field: event.target.value } : item))} className="rounded-xl border border-border bg-card px-3 py-2 text-sm outline-none focus:border-brand-primary">
                        <option value="">Campo</option>
                        {currentDataset.filters.map((field) => (
                          <option key={field.key} value={field.key}>{field.label}</option>
                        ))}
                      </select>
                      <select value={filter.operator} onChange={(event) => setFilters((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, operator: event.target.value as FilterOperator } : item))} className="rounded-xl border border-border bg-card px-3 py-2 text-sm outline-none focus:border-brand-primary">
                        {FILTER_OPERATORS.map((operator) => (
                          <option key={operator.value} value={operator.value}>{operator.label}</option>
                        ))}
                      </select>
                      <input value={filter.value} onChange={(event) => setFilters((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, value: event.target.value } : item))} className="rounded-xl border border-border bg-card px-3 py-2 text-sm outline-none focus:border-brand-primary" placeholder="Valor ou lista separada por vírgula" />
                      <button type="button" onClick={() => setFilters((current) => current.filter((_, itemIndex) => itemIndex !== index))} className="rounded-xl border border-border px-3 py-2 text-sm text-muted transition-colors hover:bg-muted/10">
                        Remover
                      </button>
                    </div>
                  ))}
                  <button type="button" onClick={() => setFilters((current) => [...current, { field: '', operator: 'eq', value: '' }])} className="rounded-xl border border-border px-3 py-2 text-sm font-medium text-secondary transition-colors hover:bg-muted/10">
                    Adicionar filtro
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                <label className="flex flex-col gap-2">
                  <span className="text-sm font-medium text-primary">Ordenar por</span>
                  <select value={sortField} onChange={(event) => setSortField(event.target.value)} className="rounded-xl border border-border bg-body px-3 py-2.5 text-sm outline-none focus:border-brand-primary">
                    {[...currentDataset.dimensions, ...currentDataset.metrics].map((field) => (
                      <option key={field.key} value={field.key}>{field.label}</option>
                    ))}
                  </select>
                </label>
                <label className="flex flex-col gap-2">
                  <span className="text-sm font-medium text-primary">Direção</span>
                  <select value={sortDirection} onChange={(event) => setSortDirection(event.target.value as 'asc' | 'desc')} className="rounded-xl border border-border bg-body px-3 py-2.5 text-sm outline-none focus:border-brand-primary">
                    <option value="desc">Desc</option>
                    <option value="asc">Asc</option>
                  </select>
                </label>
                <label className="flex flex-col gap-2">
                  <span className="text-sm font-medium text-primary">Limite</span>
                  <input type="number" min={1} max={200} value={limit} onChange={(event) => setLimit(Number(event.target.value) || 25)} className="rounded-xl border border-border bg-body px-3 py-2.5 text-sm outline-none focus:border-brand-primary" />
                </label>
              </div>
            </div>
          </section>

          <section className="rounded-3xl border border-border bg-card p-5">
            <div className="mb-5 flex items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-bold text-primary">Preview</h2>
                <p className="mt-1 text-sm text-muted">Tabela resultante do builder restrito.</p>
              </div>
              {previewRows.length > 0 && (
                <button onClick={() => exportRowsToCsv(previewRows)} className="inline-flex items-center gap-2 rounded-xl border border-border px-3 py-2 text-sm font-medium text-secondary transition-colors hover:bg-muted/10">
                  <Download size={15} />
                  Exportar CSV
                </button>
              )}
            </div>

            {previewSql && (
              <details className="mb-4 rounded-2xl border border-border bg-body p-4">
                <summary className="cursor-pointer text-sm font-medium text-primary">SQL gerado</summary>
                <pre className="mt-3 whitespace-pre-wrap text-xs text-muted">{previewSql}</pre>
              </details>
            )}

            {previewRows.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-border bg-body p-8 text-center text-sm text-muted">
                Gere um preview para visualizar o resultado.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="border-b border-border">
                      {Object.keys(previewRows[0]).map((header) => (
                        <th key={header} className="px-3 py-2 text-left font-semibold text-primary">{header}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {previewRows.map((row, rowIndex) => (
                      <tr key={rowIndex} className="border-b border-border/60">
                        {Object.keys(previewRows[0]).map((header) => (
                          <td key={`${rowIndex}-${header}`} className="px-3 py-2 text-secondary">{String(row[header] ?? '—')}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {canManage && (
              <div className="mt-4 flex flex-wrap gap-3">
                <button onClick={handleSaveDefinition} disabled={savingDefinition} className="inline-flex items-center gap-2 rounded-xl border border-border px-4 py-2 text-sm font-medium text-secondary transition-colors hover:bg-muted/10 disabled:opacity-50">
                  <RefreshCw size={15} className={savingDefinition ? 'animate-spin' : ''} />
                  {savingDefinition ? 'Salvando...' : definitionId ? 'Atualizar definição' : 'Salvar definição'}
                </button>
                <button onClick={openTemplateModalFromBuilder} className="inline-flex items-center gap-2 rounded-xl border border-border px-4 py-2 text-sm font-medium text-secondary transition-colors hover:bg-muted/10">
                  Salvar como template
                </button>
                <button onClick={() => setShowExportModal(true)} className="inline-flex items-center gap-2 rounded-xl border border-border px-4 py-2 text-sm font-medium text-secondary transition-colors hover:bg-muted/10">
                  Exportar
                </button>
                {definitionId && (
                  <button onClick={() => navigate(`/relatorios?customReportId=${definitionId}`)} className="inline-flex items-center gap-2 rounded-xl bg-brand-primary px-4 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-90">
                    Agendar definição
                  </button>
                )}
              </div>
            )}
          </section>
        </div>
      )}

      <section className="mt-6 rounded-3xl border border-border bg-card p-5">
        <h2 className="text-lg font-bold text-primary">Definições salvas</h2>
        <p className="mt-1 text-sm text-muted">Relatórios customizados persistidos para reuso e agendamento.</p>

        {definitions.length === 0 ? (
          <div className="mt-4 rounded-2xl border border-dashed border-border bg-body p-6 text-sm text-muted">
            Nenhuma definição customizada salva ainda.
          </div>
        ) : (
          <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
            {definitions.map((definition) => (
              <div key={definition.id} className="rounded-2xl border border-border bg-body p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-semibold text-primary">{definition.name}</h3>
                    <p className="mt-1 text-xs text-muted">{definition.description || 'Sem descrição'}</p>
                    <p className="mt-2 text-xs text-secondary">
                      Dataset: {definition.definition.dataset} • {definition.definition.dimensions.length} dimensão(ões) • {definition.definition.metrics.length} métrica(s)
                    </p>
                  </div>
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  <button onClick={() => handleLoadDefinition(definition)} className="rounded-xl border border-border px-3 py-2 text-sm text-secondary transition-colors hover:bg-muted/10">
                    Editar
                  </button>
                  {canManage && (
                    <button onClick={() => openTemplateModalFromDefinition(definition)} className="rounded-xl border border-border px-3 py-2 text-sm text-secondary transition-colors hover:bg-muted/10">
                      Salvar como template
                    </button>
                  )}
                  <button onClick={() => navigate(`/relatorios?customReportId=${definition.id}`)} className="rounded-xl border border-border px-3 py-2 text-sm text-secondary transition-colors hover:bg-muted/10">
                    Agendar
                  </button>
                  {canManage && (
                    <button onClick={() => void handleDeleteDefinition(definition)} className="rounded-xl border border-danger/20 px-3 py-2 text-sm text-danger transition-colors hover:bg-danger/10">
                      Excluir
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <SaveTemplateModal
        open={showTemplateModal}
        saving={savingTemplate}
        defaultName={templateSourceDefinition?.name || definitionName || 'Novo template'}
        defaultDescription={templateSourceDefinition?.description || definitionDescription || ''}
        defaultCategory={defaultTemplateCategory(templateSourceDefinition?.definition.dataset || datasetKey)}
        defaultScope="user"
        categories={templateCategoryOptions}
        onClose={() => {
          setShowTemplateModal(false);
          setTemplateSourceDefinition(null);
        }}
        onSubmit={handleSaveTemplate}
      />

      <ReportExportModal
        open={showExportModal}
        title="Exportar relatório customizado"
        source={{
          sourceType: 'custom_builder',
          defaultTitle: definitionName || 'Relatório customizado',
          description: definitionDescription || null,
          definition: buildDefinitionPayload(),
        }}
        recipientOptions={reportRecipients}
        onClose={() => setShowExportModal(false)}
      />
    </div>
  );
}
