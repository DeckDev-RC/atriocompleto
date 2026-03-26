import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { BookOpen, Calculator, Database, Package2, RotateCcw, Save, Settings2, TrendingUp, Trash2 } from 'lucide-react';
import { Header } from '../../components/Header';
import { useToast } from '../../components/Toast';
import { SaveSnapshotModal } from '../../components/simulations/SaveSnapshotModal';
import { agentApi } from '../../services/agentApi';
import type { CalculatorSnapshot } from '../../types/calculatorSnapshots';
import { formatCurrencyBRL, formatPercent } from '../../utils/marketplaceCalculator';
import {
  calculatePriceCalculatorResults,
  calculatePriceCalculatorRuleState,
  createDefaultPriceCalculatorInputs,
  PRICE_CALCULATOR_MARKETPLACE_ORDER,
  type PriceCalculatorInputs,
  type PriceCalculatorManagementRow,
  type PriceCalculatorMarketplaceId,
  type PriceCalculatorResult,
} from '../../utils/priceCalculator';

const EXAMPLE_INPUTS: PriceCalculatorInputs = {
  productName: 'Camisa Preta',
  weightGrams: 499,
  cost: 45,
  operationalCost: 4,
  marginPercent: 10,
  taxPercent: 7,
  difalPercent: 0,
};

type TabId = 'calculator' | 'management' | 'base-products';

interface PriceCalculatorSnapshotPayload {
  inputs: PriceCalculatorInputs;
}

const TAB_ITEMS: Array<{ id: TabId; label: string; icon: LucideIcon }> = [
  { id: 'calculator', label: 'Calculadora', icon: Calculator },
  { id: 'management', label: 'Gestao', icon: Settings2 },
  { id: 'base-products', label: 'BaseProdutos', icon: Database },
];

function SectionCard({ title, subtitle, icon: Icon, children }: { title: string; subtitle?: string; icon: LucideIcon; children: ReactNode }) {
  return (
    <section className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
      <div className="flex items-center gap-3 border-b border-border bg-body px-5 py-4">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[var(--color-brand-primary)] text-white"><Icon size={17} /></div>
        <div className="min-w-0">
          <h2 className="text-[15px] font-bold tracking-[-0.02em] text-primary">{title}</h2>
          {subtitle ? <p className="mt-0.5 text-[11px] text-muted">{subtitle}</p> : null}
        </div>
      </div>
      <div className="p-4 sm:p-5">{children}</div>
    </section>
  );
}

function StatCard({ label, value, helper, tone = 'default' }: { label: string; value: string; helper: string; tone?: 'default' | 'success' }) {
  return (
    <div className="rounded-xl border border-border bg-body px-4 py-3.5">
      <p className="text-[10px] font-bold uppercase tracking-wider text-muted">{label}</p>
      <p className={`mt-1 text-[24px] font-extrabold tracking-tight ${tone === 'success' ? 'text-success' : 'text-primary'}`}>{value}</p>
      <p className="mt-1 text-[11px] text-muted">{helper}</p>
    </div>
  );
}

function MarketplacePill({ result }: { result: Pick<PriceCalculatorResult, 'accentColor' | 'shortLabel' | 'marketplaceName'> }) {
  return (
    <div className="inline-flex items-center gap-2 rounded-full bg-body px-2.5 py-1">
      <span className="flex h-6 w-6 items-center justify-center rounded-full text-[9px] font-black text-white" style={{ backgroundColor: result.accentColor }}>{result.shortLabel}</span>
      <span className="text-[11px] font-semibold text-primary">{result.marketplaceName}</span>
    </div>
  );
}

function ResultCard({ result }: { result: PriceCalculatorResult }) {
  return (
    <article className="rounded-2xl border border-border bg-card shadow-sm">
      <div className="flex items-center justify-between gap-3 border-b border-border bg-body px-4 py-3">
        <MarketplacePill result={result} />
        <span className="rounded-full border border-border bg-card px-2.5 py-1 text-[10px] font-bold text-muted">Promo {formatPercent(result.promotionPercent, 0)}</span>
      </div>
      <div className="space-y-3 px-4 py-4">
        <div className="grid gap-2 sm:grid-cols-2">
          <div className="rounded-xl border border-border bg-body px-3.5 py-3"><p className="text-[10px] font-bold uppercase tracking-wider text-muted">Preco praticado</p><p className="mt-1 text-[24px] font-extrabold tracking-tight text-primary">{formatCurrencyBRL(result.practicedPrice)}</p></div>
          <div className="rounded-xl border border-border bg-body px-3.5 py-3"><p className="text-[10px] font-bold uppercase tracking-wider text-muted">Preco cheio</p><p className="mt-1 text-[24px] font-extrabold tracking-tight text-primary">{formatCurrencyBRL(result.fullPrice)}</p></div>
        </div>
        <div className="rounded-xl border border-border bg-body px-3.5 py-3"><p className="text-[10px] font-bold uppercase tracking-wider text-muted">Lucro estimado</p><p className={`mt-1 text-[24px] font-extrabold tracking-tight ${result.profit >= 0 ? 'text-success' : 'text-danger'}`}>{formatCurrencyBRL(result.profit)}</p></div>
        <div className="grid gap-2 sm:grid-cols-3">
          <div className="rounded-lg border border-border bg-card px-3 py-2"><p className="text-[10px] font-bold uppercase tracking-wider text-muted">Comissao</p><p className="mt-1 text-[13px] font-semibold tabular-nums text-primary">{formatPercent(result.commissionPercent, 0)} · {formatCurrencyBRL(result.commissionAmount)}</p></div>
          <div className="rounded-lg border border-border bg-card px-3 py-2"><p className="text-[10px] font-bold uppercase tracking-wider text-muted">Frete</p><p className="mt-1 text-[13px] font-semibold tabular-nums text-primary">{formatCurrencyBRL(result.shippingCost)}</p></div>
          <div className="rounded-lg border border-border bg-card px-3 py-2"><p className="text-[10px] font-bold uppercase tracking-wider text-muted">Imposto + Difal</p><p className="mt-1 text-[13px] font-semibold tabular-nums text-primary">{formatCurrencyBRL(result.taxAmount + result.difalAmount)}</p></div>
        </div>
        <div className="rounded-xl border border-dashed border-border px-3.5 py-3"><p className="text-[11px] font-semibold text-primary">Divisor {result.denominator.toFixed(2)}</p><p className="mt-2 text-[11px] text-muted">{result.note}</p>{result.warning ? <p className="mt-1 text-[10px] font-medium text-danger">{result.warning}</p> : null}</div>
      </div>
    </article>
  );
}

function getResultById(results: PriceCalculatorResult[], marketplaceId: PriceCalculatorMarketplaceId) {
  return results.find((result) => result.marketplaceId === marketplaceId)!;
}

export default function PriceCalculatorPage() {
  const { showToast } = useToast();
  const [activeTab, setActiveTab] = useState<TabId>('calculator');
  const [inputs, setInputs] = useState<PriceCalculatorInputs>(() => createDefaultPriceCalculatorInputs());
  const [savedSnapshots, setSavedSnapshots] = useState<CalculatorSnapshot<PriceCalculatorSnapshotPayload>[]>([]);
  const [selectedBaseProductId, setSelectedBaseProductId] = useState<string | null>(null);
  const [saveSnapshotOpen, setSaveSnapshotOpen] = useState(false);
  const [snapshotName, setSnapshotName] = useState('');
  const [snapshotLoading, setSnapshotLoading] = useState(false);

  const loadSavedSnapshots = useCallback(async () => {
    const response = await agentApi.getCalculatorSnapshots('prices');
    if (response.success && response.data) setSavedSnapshots(response.data as CalculatorSnapshot<PriceCalculatorSnapshotPayload>[]);
  }, []);

  useEffect(() => { void loadSavedSnapshots(); }, [loadSavedSnapshots]);

  const results = useMemo(() => calculatePriceCalculatorResults(inputs), [inputs]);
  const ruleState = useMemo(() => calculatePriceCalculatorRuleState(inputs), [inputs]);
  const bestProfit = useMemo(() => results.reduce((best, current) => (current.profit > best.profit ? current : best), results[0]!), [results]);
  const lowestPracticed = useMemo(() => results.reduce((best, current) => (current.practicedPrice < best.practicedPrice ? current : best), results[0]!), [results]);
  const fullPriceRange = useMemo(() => ({ min: Math.min(...results.map((result) => result.fullPrice)), max: Math.max(...results.map((result) => result.fullPrice)) }), [results]);
  const baseRows = useMemo(() => savedSnapshots.map((snapshot) => ({ snapshot, results: calculatePriceCalculatorResults(snapshot.payload.inputs) })), [savedSnapshots]);
  const warningCount = useMemo(() => ruleState.managementRows.filter((row) => row.warning).length, [ruleState.managementRows]);

  useEffect(() => {
    setSelectedBaseProductId((current) => current && baseRows.some((row) => row.snapshot.id === current) ? current : baseRows[0]?.snapshot.id ?? null);
  }, [baseRows]);

  const selectedBaseRow = useMemo(() => baseRows.find((row) => row.snapshot.id === selectedBaseProductId) ?? null, [baseRows, selectedBaseProductId]);
  const averageCost = useMemo(() => baseRows.length === 0 ? 0 : baseRows.reduce((sum, row) => sum + row.snapshot.payload.inputs.cost, 0) / baseRows.length, [baseRows]);
  const commonInputClass = 'h-10 w-full rounded-xl border border-border bg-body px-3 py-2 text-[13px] text-primary outline-none transition-colors focus:border-[var(--color-brand-primary)] focus:ring-1 focus:ring-[var(--color-brand-primary)]/20';

  const updateInputs = <T extends keyof PriceCalculatorInputs>(key: T, value: PriceCalculatorInputs[T]) => setInputs((current) => ({ ...current, [key]: value }));
  const handleReset = () => { setInputs(createDefaultPriceCalculatorInputs()); showToast('Entradas resetadas.', 'success'); };
  const handleUseExample = () => { setInputs(EXAMPLE_INPUTS); showToast('Exemplo padrao carregado.', 'success'); };
  const openSaveSnapshotModal = () => { setSnapshotName(inputs.productName.trim() || 'Calculo de precos'); setSaveSnapshotOpen(true); };

  const handleSaveSnapshot = async () => {
    if (!snapshotName.trim()) return showToast('Informe um nome para salvar o calculo.', 'warning');
    setSnapshotLoading(true);
    const response = await agentApi.saveCalculatorSnapshot({ calculator_type: 'prices', name: snapshotName.trim(), payload: { inputs } });
    setSnapshotLoading(false);
    if (!response.success) return showToast(response.error || 'Erro ao salvar calculo.', 'error');
    setSaveSnapshotOpen(false);
    setSnapshotName('');
    await loadSavedSnapshots();
    setActiveTab('base-products');
    showToast('Calculo salvo com sucesso.', 'success');
  };

  const loadSavedSnapshot = (snapshot: CalculatorSnapshot<PriceCalculatorSnapshotPayload>) => {
    setInputs(snapshot.payload.inputs);
    setActiveTab('calculator');
    showToast('Registro carregado na calculadora.', 'success');
  };

  const deleteSavedSnapshot = async (snapshotId: string) => {
    const response = await agentApi.deleteCalculatorSnapshot(snapshotId);
    if (!response.success) return showToast(response.error || 'Erro ao remover calculo salvo.', 'error');
    await loadSavedSnapshots();
    showToast('Registro removido da base.', 'success');
  };

  return (
    <div className="min-h-screen bg-body p-4 sm:p-6">
      <div className="price-calculator-shell mx-auto flex w-full flex-col gap-4">
        <Header title="Calculadora de Precos" subtitle="A tela foi organizada em tres visoes: Calculadora, Gestao e BaseProdutos." />

        <div className="rounded-2xl border border-border bg-card p-2 shadow-sm">
          <div className="flex flex-wrap gap-2">
            {TAB_ITEMS.map((tab) => {
              const Icon = tab.icon;
              const active = activeTab === tab.id;
              return (
                <button key={tab.id} type="button" onClick={() => setActiveTab(tab.id)} className={`inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-[12px] font-bold transition-colors ${active ? 'bg-[var(--color-brand-primary)] text-white shadow-sm' : 'bg-body text-muted hover:text-primary'}`}>
                  <Icon size={14} />
                  {tab.label}
                  {tab.id === 'base-products' ? <span className={`rounded-full px-2 py-0.5 text-[10px] ${active ? 'bg-white/15 text-white' : 'bg-card text-primary'}`}>{savedSnapshots.length}</span> : null}
                </button>
              );
            })}
          </div>
        </div>

        {activeTab === 'calculator' ? (
          <>
            <SectionCard title="Entradas do produto" subtitle="A margem alvo entra no divisor junto com imposto, difal e comissao." icon={Calculator}>
              <div className="price-calculator-input-layout grid gap-4">
                <div className="space-y-3">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="space-y-1 sm:col-span-2"><span className="text-[11px] font-semibold text-muted">Produto</span><input className={commonInputClass} value={inputs.productName} onChange={(event) => updateInputs('productName', event.target.value)} placeholder="Ex: Camisa Preta" /></label>
                    <label className="space-y-1"><span className="text-[11px] font-semibold text-muted">Peso (g)</span><input type="number" step="1" min="0" className={commonInputClass} value={`${inputs.weightGrams}`} onChange={(event) => updateInputs('weightGrams', Number(event.target.value) || 0)} /></label>
                    <label className="space-y-1"><span className="text-[11px] font-semibold text-muted">Custo</span><input type="number" step="0.01" min="0" className={commonInputClass} value={`${inputs.cost}`} onChange={(event) => updateInputs('cost', Number(event.target.value) || 0)} /></label>
                    <label className="space-y-1"><span className="text-[11px] font-semibold text-muted">Custo operacional</span><input type="number" step="0.01" min="0" className={commonInputClass} value={`${inputs.operationalCost}`} onChange={(event) => updateInputs('operationalCost', Number(event.target.value) || 0)} /></label>
                    <label className="space-y-1"><span className="text-[11px] font-semibold text-muted">Margem alvo (%)</span><input type="number" step="0.1" min="0" className={commonInputClass} value={`${inputs.marginPercent}`} onChange={(event) => updateInputs('marginPercent', Number(event.target.value) || 0)} /></label>
                    <label className="space-y-1"><span className="text-[11px] font-semibold text-muted">Imposto (%)</span><input type="number" step="0.1" min="0" className={commonInputClass} value={`${inputs.taxPercent}`} onChange={(event) => updateInputs('taxPercent', Number(event.target.value) || 0)} /></label>
                    <label className="space-y-1"><span className="text-[11px] font-semibold text-muted">Difal (%)</span><input type="number" step="0.1" min="0" className={commonInputClass} value={`${inputs.difalPercent}`} onChange={(event) => updateInputs('difalPercent', Number(event.target.value) || 0)} /></label>
                  </div>
                  <div className="rounded-2xl border border-border bg-body px-4 py-3.5"><p className="text-[11px] font-semibold text-primary">Formula base</p><p className="mt-1 text-[11px] text-muted">Preco praticado = (custo + custo operacional + frete) / (1 - imposto - difal - comissao - margem)</p><p className="mt-2 text-[10px] text-muted">Cada canal resolve o proprio frete pela regra comercial configurada na calculadora.</p></div>
                  <div className="flex flex-wrap gap-2">
                    <button type="button" onClick={handleUseExample} className="inline-flex items-center gap-2 rounded-xl border border-border px-4 py-2.5 text-[12px] font-bold text-primary transition-colors hover:bg-body"><Package2 size={14} />Usar exemplo</button>
                    <button type="button" onClick={handleReset} className="inline-flex items-center gap-2 rounded-xl border border-border px-4 py-2.5 text-[12px] font-bold text-primary transition-colors hover:bg-body"><RotateCcw size={14} />Limpar</button>
                    <button type="button" onClick={openSaveSnapshotModal} className="inline-flex items-center gap-2 rounded-xl bg-[var(--color-brand-primary)] px-4 py-2.5 text-[12px] font-bold text-white shadow-sm transition-transform hover:-translate-y-0.5"><Save size={14} />Salvar na BaseProdutos</button>
                  </div>
                </div>
                <div className="grid gap-3">
                  <StatCard label="Melhor lucro" value={formatCurrencyBRL(bestProfit.profit)} helper={`${bestProfit.marketplaceName} · preco praticado ${formatCurrencyBRL(bestProfit.practicedPrice)}`} tone="success" />
                  <StatCard label="Menor preco praticado" value={formatCurrencyBRL(lowestPracticed.practicedPrice)} helper={`${lowestPracticed.marketplaceName} · lucro ${formatCurrencyBRL(lowestPracticed.profit)}`} />
                  <StatCard label="Faixa de preco cheio" value={`${formatCurrencyBRL(fullPriceRange.min)} - ${formatCurrencyBRL(fullPriceRange.max)}`} helper="Comparando os descontos promocionais de cada canal" />
                </div>
              </div>
            </SectionCard>

            <SectionCard title="Resultados por marketplace" subtitle="Os precos cheios ja consideram o desconto promocional de cada canal." icon={TrendingUp}>
              <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">{results.map((result) => <ResultCard key={result.marketplaceId} result={result} />)}</div>
            </SectionCard>
          </>
        ) : null}

        {activeTab === 'management' ? (
          <SectionCard title="Gestao" subtitle="Visao operacional das regras atuais por marketplace e dos criterios que cada canal usa no calculo." icon={Settings2}>
            <div className="grid gap-3 lg:grid-cols-4">
              <StatCard label="Imposto base" value={formatPercent(ruleState.taxPercent, 1)} helper="Aliquota global aplicada no calculo" />
              <StatCard label="Difal" value={formatPercent(ruleState.difalPercent, 1)} helper="Diferenca de aliquota aplicada no calculo" />
              <StatCard label="Base Netshoes 26%" value={ruleState.netshoesCommissionBasePrice === null ? 'Indefinido' : formatCurrencyBRL(ruleState.netshoesCommissionBasePrice)} helper="Base sem frete que decide 26% ou 31% na Netshoes" />
              <StatCard label="Canais com alerta" value={`${warningCount}`} helper="Regras pendentes ou tabelas com ressalva operacional" />
            </div>
            <div className="mt-4 overflow-x-auto rounded-2xl border border-border">
              <table className="min-w-full">
                <thead>
                  <tr className="border-b border-border bg-body text-left text-[10px] font-bold uppercase tracking-wider text-muted">
                    <th className="px-3 py-2.5">Marketplace</th><th className="px-3 py-2.5 text-right">Comissao</th><th className="px-3 py-2.5 text-right">Promo</th><th className="px-3 py-2.5 text-right">Frete final</th><th className="px-3 py-2.5">Base usada</th><th className="px-3 py-2.5">Faixa resolvida</th><th className="px-3 py-2.5">Regra aplicada</th>
                  </tr>
                </thead>
                <tbody>
                  {ruleState.managementRows.map((row: PriceCalculatorManagementRow) => (
                    <tr key={row.marketplaceId} className="border-b border-border bg-card text-[12px] last:border-b-0">
                      <td className="px-3 py-2.5"><MarketplacePill result={{ accentColor: row.accentColor, shortLabel: row.shortLabel, marketplaceName: row.marketplaceName }} /></td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-secondary">{formatPercent(row.commissionPercent, 0)}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-secondary">{formatPercent(row.promotionPercent, 0)}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums font-semibold text-primary">{formatCurrencyBRL(row.finalShipping)}</td>
                      <td className="px-3 py-2.5 text-secondary">
                        <p className="font-semibold text-primary">{row.baseLabel}</p>
                        <p className="mt-1 text-[11px] text-muted">{row.baseDisplay}</p>
                      </td>
                      <td className="px-3 py-2.5 text-secondary">{row.resolvedBand}</td>
                      <td className="px-3 py-2.5 text-muted">
                        <p>{row.ruleSummary}</p>
                        {row.note ? <p className="mt-1 text-[11px] text-secondary">{row.note}</p> : null}
                        {row.warning ? <p className="mt-1 text-[11px] font-medium text-danger">{row.warning}</p> : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </SectionCard>
        ) : null}

        {activeTab === 'base-products' ? (
          <>
            <SectionCard title="BaseProdutos" subtitle="Catalogo derivado dos snapshots salvos, exibido em formato de base de produtos." icon={Database}>
              <div className="grid gap-3 lg:grid-cols-3">
                <StatCard label="Registros" value={`${baseRows.length}`} helper="Snapshots salvos na calculadora" />
                <StatCard label="Custo medio" value={formatCurrencyBRL(averageCost)} helper="Media do custo dos registros salvos" />
                <StatCard label="Ultimo registro" value={baseRows[0] ? new Date(baseRows[0].snapshot.updated_at).toLocaleDateString('pt-BR') : 'Sem dados'} helper={baseRows[0]?.snapshot.payload.inputs.productName || 'Salve um calculo para criar a base'} />
              </div>
              <div className="mt-4 overflow-x-auto rounded-2xl border border-border">
                <table className="min-w-[1180px]">
                  <thead>
                    <tr className="border-b border-border bg-body text-left text-[10px] font-bold uppercase tracking-wider text-muted">
                      <th className="px-3 py-2.5">Nome</th><th className="px-3 py-2.5">Produto</th><th className="px-3 py-2.5 text-right">Peso</th><th className="px-3 py-2.5 text-right">Custo</th><th className="px-3 py-2.5 text-right">C. Op.</th><th className="px-3 py-2.5 text-right">Margem</th><th className="px-3 py-2.5 text-right">PP AMZ</th><th className="px-3 py-2.5 text-right">PP MGL</th><th className="px-3 py-2.5 text-right">PP ML</th><th className="px-3 py-2.5 text-right">PP NET</th><th className="px-3 py-2.5 text-right">PP SHN</th><th className="px-3 py-2.5 text-right">PP SHP</th><th className="px-3 py-2.5 text-right">Acoes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {baseRows.map((row) => (
                      <tr key={row.snapshot.id} className={`border-b text-[12px] last:border-b-0 ${selectedBaseProductId === row.snapshot.id ? 'bg-body' : 'bg-card'}`}>
                        <td className="px-3 py-2.5 font-semibold text-primary">{row.snapshot.name}</td>
                        <td className="px-3 py-2.5 text-secondary">{row.snapshot.payload.inputs.productName || 'Produto sem nome'}</td>
                        <td className="px-3 py-2.5 text-right tabular-nums text-secondary">{row.snapshot.payload.inputs.weightGrams} g</td>
                        <td className="px-3 py-2.5 text-right tabular-nums text-secondary">{formatCurrencyBRL(row.snapshot.payload.inputs.cost)}</td>
                        <td className="px-3 py-2.5 text-right tabular-nums text-secondary">{formatCurrencyBRL(row.snapshot.payload.inputs.operationalCost)}</td>
                        <td className="px-3 py-2.5 text-right tabular-nums text-secondary">{formatPercent(row.snapshot.payload.inputs.marginPercent, 1)}</td>
                        <td className="px-3 py-2.5 text-right tabular-nums text-primary">{formatCurrencyBRL(getResultById(row.results, 'amazon').practicedPrice)}</td>
                        <td className="px-3 py-2.5 text-right tabular-nums text-primary">{formatCurrencyBRL(getResultById(row.results, 'magalu').practicedPrice)}</td>
                        <td className="px-3 py-2.5 text-right tabular-nums text-primary">{formatCurrencyBRL(getResultById(row.results, 'mercadolivre').practicedPrice)}</td>
                        <td className="px-3 py-2.5 text-right tabular-nums text-primary">{formatCurrencyBRL(getResultById(row.results, 'netshoes').practicedPrice)}</td>
                        <td className="px-3 py-2.5 text-right tabular-nums text-primary">{formatCurrencyBRL(getResultById(row.results, 'shein').practicedPrice)}</td>
                        <td className="px-3 py-2.5 text-right tabular-nums text-primary">{formatCurrencyBRL(getResultById(row.results, 'shopee').practicedPrice)}</td>
                        <td className="px-3 py-2.5"><div className="flex justify-end gap-2"><button type="button" onClick={() => setSelectedBaseProductId(row.snapshot.id)} className="rounded-md border border-border px-2.5 py-1 text-[10px] font-bold text-muted transition-colors hover:text-primary">Detalhes</button><button type="button" onClick={() => loadSavedSnapshot(row.snapshot)} className="rounded-md border border-border px-2.5 py-1 text-[10px] font-bold text-muted transition-colors hover:text-primary">Carregar</button><button type="button" onClick={() => void deleteSavedSnapshot(row.snapshot.id)} className="rounded-md border border-danger/20 px-2.5 py-1 text-[10px] font-bold text-danger transition-colors hover:bg-danger/10"><Trash2 size={12} className="inline" /> Remover</button></div></td>
                      </tr>
                    ))}
                    {baseRows.length === 0 ? <tr><td colSpan={13} className="bg-card px-4 py-8 text-center text-[11px] text-muted">Nenhum registro salvo ainda. Use a aba Calculadora e clique em salvar para preencher a BaseProdutos.</td></tr> : null}
                  </tbody>
                </table>
              </div>
            </SectionCard>

            {selectedBaseRow ? (
              <SectionCard title={`Detalhe do registro · ${selectedBaseRow.snapshot.name}`} subtitle="Resumo da linha selecionada com precos, impostos e fretes derivados do snapshot." icon={BookOpen}>
                <div className="grid gap-3 lg:grid-cols-4">
                  <StatCard label="Produto" value={selectedBaseRow.snapshot.payload.inputs.productName || 'Sem nome'} helper="Campo de entrada" />
                  <StatCard label="Peso" value={`${selectedBaseRow.snapshot.payload.inputs.weightGrams} g`} helper="Peso salvo" />
                  <StatCard label="Custo" value={formatCurrencyBRL(selectedBaseRow.snapshot.payload.inputs.cost)} helper="Custo do produto" />
                  <StatCard label="Margem" value={formatPercent(selectedBaseRow.snapshot.payload.inputs.marginPercent, 1)} helper="Margem alvo" />
                </div>
                <div className="mt-4 grid gap-4 xl:grid-cols-2">
                  <div className="overflow-x-auto rounded-2xl border border-border">
                    <table className="min-w-full">
                      <thead><tr className="border-b border-border bg-body text-left text-[10px] font-bold uppercase tracking-wider text-muted"><th className="px-3 py-2.5">Marketplace</th><th className="px-3 py-2.5 text-right">Preco praticado</th><th className="px-3 py-2.5 text-right">Preco cheio</th><th className="px-3 py-2.5 text-right">Lucro</th></tr></thead>
                      <tbody>{PRICE_CALCULATOR_MARKETPLACE_ORDER.map((id) => { const result = getResultById(selectedBaseRow.results, id); return <tr key={id} className="border-b border-border bg-card text-[12px] last:border-b-0"><td className="px-3 py-2.5"><MarketplacePill result={result} /></td><td className="px-3 py-2.5 text-right tabular-nums text-primary">{formatCurrencyBRL(result.practicedPrice)}</td><td className="px-3 py-2.5 text-right tabular-nums text-primary">{formatCurrencyBRL(result.fullPrice)}</td><td className={`px-3 py-2.5 text-right font-bold tabular-nums ${result.profit >= 0 ? 'text-success' : 'text-danger'}`}>{formatCurrencyBRL(result.profit)}</td></tr>; })}</tbody>
                    </table>
                  </div>
                  <div className="overflow-x-auto rounded-2xl border border-border">
                    <table className="min-w-full">
                      <thead><tr className="border-b border-border bg-body text-left text-[10px] font-bold uppercase tracking-wider text-muted"><th className="px-3 py-2.5">Marketplace</th><th className="px-3 py-2.5 text-right">Imposto</th><th className="px-3 py-2.5 text-right">Frete</th><th className="px-3 py-2.5 text-right">Comissao</th></tr></thead>
                      <tbody>{PRICE_CALCULATOR_MARKETPLACE_ORDER.map((id) => { const result = getResultById(selectedBaseRow.results, id); return <tr key={id} className="border-b border-border bg-card text-[12px] last:border-b-0"><td className="px-3 py-2.5"><MarketplacePill result={result} /></td><td className="px-3 py-2.5 text-right tabular-nums text-primary">{formatCurrencyBRL(result.taxAmount)}</td><td className="px-3 py-2.5 text-right tabular-nums text-primary">{formatCurrencyBRL(result.shippingCost)}</td><td className="px-3 py-2.5 text-right tabular-nums text-secondary">{formatPercent(result.commissionPercent, 0)}</td></tr>; })}</tbody>
                    </table>
                  </div>
                </div>
              </SectionCard>
            ) : null}
          </>
        ) : null}
      </div>

      <SaveSnapshotModal open={saveSnapshotOpen} title="Salvar na BaseProdutos" description="O snapshot fica salvo no backend e aparece na aba BaseProdutos." name={snapshotName} loading={snapshotLoading} onNameChange={setSnapshotName} onClose={() => setSaveSnapshotOpen(false)} onConfirm={() => void handleSaveSnapshot()} />
    </div>
  );
}
