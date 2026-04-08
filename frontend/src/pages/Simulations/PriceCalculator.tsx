import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import {
  BookOpen,
  Calculator,
  Database,
  Package2,
  RotateCcw,
  Save,
  Settings2,
  Sparkles,
  Target,
  TrendingUp,
  Trash2,
  Wand2,
  X,
} from 'lucide-react';
import { Header } from '../../components/Header';
import { SaveSnapshotModal } from '../../components/simulations/SaveSnapshotModal';
import { useToast } from '../../components/Toast';
import { usePreferences } from '../../contexts/UserPreferencesContext';
import { agentApi } from '../../services/agentApi';
import type { CalculatorSnapshot } from '../../types/calculatorSnapshots';
import { formatCurrencyBRL, formatPercent } from '../../utils/marketplaceCalculator';
import {
  calculatePriceCalculatorResults,
  calculatePriceCalculatorRuleState,
  createDefaultPriceCalculatorInputs,
  createDefaultPriceCalculatorManagementOverrides,
  normalizePriceCalculatorManagementOverrides,
  PRICE_CALCULATOR_MARKETPLACE_ORDER,
  type PriceCalculatorInputs,
  type PriceCalculatorManagementOverrides,
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

const CALCULATOR_ONBOARDING_STORAGE_KEY = 'atrio-price-calculator-calculator-onboarding-v1';
const MANAGEMENT_ONBOARDING_STORAGE_KEY = 'atrio-price-calculator-management-onboarding-v1';

type TabId = 'calculator' | 'management' | 'base-products';

interface PriceCalculatorSnapshotPayload {
  inputs: PriceCalculatorInputs;
}

interface ManagementOnboardingState {
  completed: boolean;
  dismissed: boolean;
}

const CALCULATOR_ONBOARDING_STEPS: Array<{
  targetId: string;
  title: string;
  description: string;
  helper: string;
}> = [
  {
    targetId: 'calculator-intro',
    title: 'Comece entendendo o objetivo da calculadora',
    description: 'Esta area transforma custo, peso, impostos e margem desejada em precos sugeridos por marketplace, sem voce precisar montar a conta manualmente.',
    helper: 'Pense nela como um passo a passo: voce preenche os dados do produto, confere os resultados e depois, se precisar, ajusta regras especificas na aba Gestao.',
  },
  {
    targetId: 'calculator-inputs',
    title: 'Preencha os dados basicos do produto',
    description: 'Produto, peso, custo e custo operacional formam a base do calculo. Quanto mais fiel estiverem, mais confiavel fica o preco sugerido.',
    helper: 'Se estiver na duvida, comece pelo custo real do item e pelo peso com embalagem. Isso costuma ser o que mais muda o resultado.',
  },
  {
    targetId: 'calculator-formula',
    title: 'Entenda o que entra na conta final',
    description: 'A margem alvo, o imposto, o difal e a comissao do canal entram no divisor do calculo. O frete entra como custo da operacao.',
    helper: 'Voce nao precisa decorar a formula. O importante e saber que margem maior ou custos maiores empurram o preco sugerido para cima.',
  },
  {
    targetId: 'calculator-actions',
    title: 'Use os atalhos para aprender sem medo',
    description: 'O exemplo preenchido ajuda a enxergar a dinamica da calculadora, o limpar zera tudo e o salvar manda o produto para a BaseProdutos.',
    helper: 'Para um usuario leigo, o melhor caminho e: usar exemplo, observar o resultado, depois trocar pelos numeros reais do seu produto.',
  },
  {
    targetId: 'calculator-summary',
    title: 'Leia primeiro os destaques principais',
    description: 'Esses cards resumem o melhor lucro, o menor preco praticado e a faixa de preco cheio para voce nao precisar comparar tudo no olho.',
    helper: 'Eles servem como leitura rapida. Depois disso, role para baixo e compare canal por canal com mais calma.',
  },
  {
    targetId: 'calculator-results',
    title: 'Compare os marketplaces e decida o proximo passo',
    description: 'Aqui voce ve o preco praticado, preco cheio, lucro, comissao, frete e impostos de cada canal. E a parte que apoia a decisao comercial.',
    helper: 'Se algum canal estiver usando uma regra diferente da sua realidade, o proximo passo natural e abrir a aba Gestao para personalizar esse marketplace.',
  },
];

const MANAGEMENT_ONBOARDING_STEPS: Array<{
  targetId: string;
  title: string;
  description: string;
  helper: string;
}> = [
  {
    targetId: 'management-intro',
    title: 'Entenda o que esta aba controla',
    description: 'Aqui voce adapta a calculadora para a sua operacao sem perder a referencia oficial de cada marketplace.',
    helper: 'Comece pela faixa-resumo e veja quantos canais continuam no padrao e quantos ja estao personalizados.',
  },
  {
    targetId: 'management-cards',
    title: 'Escolha somente os canais que fogem da regra oficial',
    description: 'Cada card permite ligar uma personalizacao manual. Se um canal continua fiel a tabela oficial, deixe desativado.',
    helper: 'Use a chave "Ativar personalizacao" apenas quando sua realidade comercial exigir outra comissao, promocao ou frete.',
  },
  {
    targetId: 'management-cards',
    title: 'Preencha seus numeros reais com seguranca',
    description: 'Ao ativar um canal, voce pode copiar a referencia oficial e ajustar so o que mudou na sua operacao.',
    helper: 'Os campos aceitam comissao, promocao e frete. O card mostra lado a lado a referencia oficial e a regra ativa.',
  },
  {
    targetId: 'management-actions',
    title: 'Salve e reaplique a sua realidade',
    description: 'Quando terminar os ajustes, salve para que a conta volte com esses valores na proxima vez que abrir a calculadora.',
    helper: 'Se estiver testando cenarios, voce pode salvar quantas vezes quiser. O estado mais recente substitui o anterior.',
  },
  {
    targetId: 'management-table',
    title: 'Confirme o efeito final e volte ao default quando precisar',
    description: 'A tabela final mostra a regra atualmente ativa por canal. Se quiser recomecar, use o reset para retornar ao padrao oficial.',
    helper: 'Essa ultima checagem ajuda a garantir que o calculo final bate com a operacao antes de salvar um produto na base.',
  },
];

const TAB_ITEMS: Array<{ id: TabId; label: string; icon: LucideIcon }> = [
  { id: 'calculator', label: 'Calculadora', icon: Calculator },
  { id: 'management', label: 'Gestao', icon: Settings2 },
  { id: 'base-products', label: 'BaseProdutos', icon: Database },
];

function loadOnboardingState(storageKey: string): ManagementOnboardingState {
  if (typeof window === 'undefined') {
    return { completed: false, dismissed: false };
  }

  try {
    const stored = window.localStorage.getItem(storageKey);
    if (!stored) return { completed: false, dismissed: false };
    const parsed = JSON.parse(stored) as Partial<ManagementOnboardingState>;
    return {
      completed: Boolean(parsed.completed),
      dismissed: Boolean(parsed.dismissed),
    };
  } catch {
    return { completed: false, dismissed: false };
  }
}

function saveOnboardingState(storageKey: string, state: ManagementOnboardingState) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(storageKey, JSON.stringify(state));
}

function parseNullableNumber(value: string) {
  const normalized = value.replace(',', '.').trim();
  if (!normalized) return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function SectionCard({
  title,
  subtitle,
  icon: Icon,
  children,
}: {
  title: string;
  subtitle?: string;
  icon: LucideIcon;
  children: ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
      <div className="flex items-center gap-3 border-b border-border bg-body px-5 py-4">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[var(--color-brand-primary)] text-white">
          <Icon size={17} />
        </div>
        <div className="min-w-0">
          <h2 className="text-[15px] font-bold tracking-[-0.02em] text-primary">{title}</h2>
          {subtitle ? <p className="mt-0.5 text-[11px] text-muted">{subtitle}</p> : null}
        </div>
      </div>
      <div className="p-4 sm:p-5">{children}</div>
    </section>
  );
}

function StatCard({
  label,
  value,
  helper,
  tone = 'default',
}: {
  label: string;
  value: string;
  helper: string;
  tone?: 'default' | 'success';
}) {
  return (
    <div className="rounded-xl border border-border bg-body px-4 py-3.5">
      <p className="text-[10px] font-bold uppercase tracking-wider text-muted">{label}</p>
      <p className={`mt-1 text-[24px] font-extrabold tracking-tight ${tone === 'success' ? 'text-success' : 'text-primary'}`}>
        {value}
      </p>
      <p className="mt-1 text-[11px] text-muted">{helper}</p>
    </div>
  );
}

function MarketplacePill({
  result,
}: {
  result: Pick<PriceCalculatorResult, 'accentColor' | 'shortLabel' | 'marketplaceName'>;
}) {
  return (
    <div className="inline-flex items-center gap-2 rounded-full bg-body px-2.5 py-1">
      <span
        className="flex h-6 w-6 items-center justify-center rounded-full text-[9px] font-black text-white"
        style={{ backgroundColor: result.accentColor }}
      >
        {result.shortLabel}
      </span>
      <span className="text-[11px] font-semibold text-primary">{result.marketplaceName}</span>
    </div>
  );
}

function ResultCard({ result }: { result: PriceCalculatorResult }) {
  return (
    <article className="rounded-2xl border border-border bg-card shadow-sm">
      <div className="flex items-center justify-between gap-3 border-b border-border bg-body px-4 py-3">
        <MarketplacePill result={result} />
        <span className="rounded-full border border-border bg-card px-2.5 py-1 text-[10px] font-bold text-muted">
          Promo {formatPercent(result.promotionPercent, 0)}
        </span>
      </div>
      <div className="space-y-3 px-4 py-4">
        <div className="grid gap-2 sm:grid-cols-2">
          <div className="rounded-xl border border-border bg-body px-3.5 py-3">
            <p className="text-[10px] font-bold uppercase tracking-wider text-muted">Preco praticado</p>
            <p className="mt-1 text-[24px] font-extrabold tracking-tight text-primary">{formatCurrencyBRL(result.practicedPrice)}</p>
          </div>
          <div className="rounded-xl border border-border bg-body px-3.5 py-3">
            <p className="text-[10px] font-bold uppercase tracking-wider text-muted">Preco cheio</p>
            <p className="mt-1 text-[24px] font-extrabold tracking-tight text-primary">{formatCurrencyBRL(result.fullPrice)}</p>
          </div>
        </div>
        <div className="rounded-xl border border-border bg-body px-3.5 py-3">
          <p className="text-[10px] font-bold uppercase tracking-wider text-muted">Lucro estimado</p>
          <p className={`mt-1 text-[24px] font-extrabold tracking-tight ${result.profit >= 0 ? 'text-success' : 'text-danger'}`}>
            {formatCurrencyBRL(result.profit)}
          </p>
        </div>
        <div className="grid gap-2 sm:grid-cols-3">
          <div className="rounded-lg border border-border bg-card px-3 py-2">
            <p className="text-[10px] font-bold uppercase tracking-wider text-muted">Comissao</p>
            <p className="mt-1 text-[13px] font-semibold tabular-nums text-primary">
              {formatPercent(result.commissionPercent, 0)} · {formatCurrencyBRL(result.commissionAmount)}
            </p>
          </div>
          <div className="rounded-lg border border-border bg-card px-3 py-2">
            <p className="text-[10px] font-bold uppercase tracking-wider text-muted">Frete</p>
            <p className="mt-1 text-[13px] font-semibold tabular-nums text-primary">{formatCurrencyBRL(result.shippingCost)}</p>
          </div>
          <div className="rounded-lg border border-border bg-card px-3 py-2">
            <p className="text-[10px] font-bold uppercase tracking-wider text-muted">Imposto + Difal</p>
            <p className="mt-1 text-[13px] font-semibold tabular-nums text-primary">
              {formatCurrencyBRL(result.taxAmount + result.difalAmount)}
            </p>
          </div>
        </div>
        <div className="rounded-xl border border-dashed border-border px-3.5 py-3">
          <p className="text-[11px] font-semibold text-primary">Divisor {result.denominator.toFixed(2)}</p>
          <p className="mt-2 text-[11px] text-muted">{result.note}</p>
          {result.warning ? <p className="mt-1 text-[10px] font-medium text-danger">{result.warning}</p> : null}
        </div>
      </div>
    </article>
  );
}

function getResultById(results: PriceCalculatorResult[], marketplaceId: PriceCalculatorMarketplaceId) {
  return results.find((result) => result.marketplaceId === marketplaceId)!;
}

export default function PriceCalculatorPage() {
  const { showToast } = useToast();
  const { preferences, updatePreferences } = usePreferences();

  const savedManagementOverrides = useMemo(
    () => normalizePriceCalculatorManagementOverrides(preferences.price_calculator_management_overrides),
    [preferences.price_calculator_management_overrides],
  );

  const [activeTab, setActiveTab] = useState<TabId>('calculator');
  const [inputs, setInputs] = useState<PriceCalculatorInputs>(() => createDefaultPriceCalculatorInputs());
  const [managementOverrides, setManagementOverrides] = useState<PriceCalculatorManagementOverrides>(savedManagementOverrides);
  const [savedSnapshots, setSavedSnapshots] = useState<CalculatorSnapshot<PriceCalculatorSnapshotPayload>[]>([]);
  const [selectedBaseProductId, setSelectedBaseProductId] = useState<string | null>(null);
  const [saveSnapshotOpen, setSaveSnapshotOpen] = useState(false);
  const [snapshotName, setSnapshotName] = useState('');
  const [snapshotLoading, setSnapshotLoading] = useState(false);
  const [managementSaving, setManagementSaving] = useState(false);
  const [calculatorOnboardingOpen, setCalculatorOnboardingOpen] = useState(false);
  const [calculatorOnboardingStepIndex, setCalculatorOnboardingStepIndex] = useState(0);
  const [calculatorOnboardingState, setCalculatorOnboardingState] = useState<ManagementOnboardingState>(() => loadOnboardingState(CALCULATOR_ONBOARDING_STORAGE_KEY));
  const [managementOnboardingOpen, setManagementOnboardingOpen] = useState(false);
  const [managementOnboardingStepIndex, setManagementOnboardingStepIndex] = useState(0);
  const [managementOnboardingState, setManagementOnboardingState] = useState<ManagementOnboardingState>(() => loadOnboardingState(MANAGEMENT_ONBOARDING_STORAGE_KEY));

  useEffect(() => {
    setManagementOverrides(savedManagementOverrides);
  }, [savedManagementOverrides]);

  const loadSavedSnapshots = useCallback(async () => {
    const response = await agentApi.getCalculatorSnapshots('prices');
    if (response.success && response.data) {
      setSavedSnapshots(response.data as CalculatorSnapshot<PriceCalculatorSnapshotPayload>[]);
    }
  }, []);

  useEffect(() => {
    void loadSavedSnapshots();
  }, [loadSavedSnapshots]);

  const automaticRuleState = useMemo(() => calculatePriceCalculatorRuleState(inputs), [inputs]);
  const results = useMemo(
    () => calculatePriceCalculatorResults(inputs, managementOverrides),
    [inputs, managementOverrides],
  );
  const ruleState = useMemo(
    () => calculatePriceCalculatorRuleState(inputs, managementOverrides),
    [inputs, managementOverrides],
  );

  const bestProfit = useMemo(
    () => results.reduce((best, current) => (current.profit > best.profit ? current : best), results[0]!),
    [results],
  );
  const lowestPracticed = useMemo(
    () => results.reduce((best, current) => (current.practicedPrice < best.practicedPrice ? current : best), results[0]!),
    [results],
  );
  const fullPriceRange = useMemo(
    () => ({
      min: Math.min(...results.map((result) => result.fullPrice)),
      max: Math.max(...results.map((result) => result.fullPrice)),
    }),
    [results],
  );
  const baseRows = useMemo(
    () =>
      savedSnapshots.map((snapshot) => ({
        snapshot,
        results: calculatePriceCalculatorResults(snapshot.payload.inputs, managementOverrides),
      })),
    [savedSnapshots, managementOverrides],
  );
  const warningCount = useMemo(
    () => automaticRuleState.managementRows.filter((row) => row.warning).length,
    [automaticRuleState.managementRows],
  );
  const savedOverrideCount = useMemo(
    () => PRICE_CALCULATOR_MARKETPLACE_ORDER.filter((marketplaceId) => savedManagementOverrides[marketplaceId].enabled).length,
    [savedManagementOverrides],
  );
  const managementDirty = useMemo(
    () => JSON.stringify(managementOverrides) !== JSON.stringify(savedManagementOverrides),
    [managementOverrides, savedManagementOverrides],
  );

  const automaticManagementRowsById = useMemo(
    () =>
      automaticRuleState.managementRows.reduce((accumulator, row) => {
        accumulator[row.marketplaceId] = row;
        return accumulator;
      }, {} as Record<PriceCalculatorMarketplaceId, PriceCalculatorManagementRow>),
    [automaticRuleState.managementRows],
  );

  useEffect(() => {
    setSelectedBaseProductId((current) =>
      current && baseRows.some((row) => row.snapshot.id === current)
        ? current
        : baseRows[0]?.snapshot.id ?? null,
    );
  }, [baseRows]);

  useEffect(() => {
    if (activeTab !== 'calculator') {
      setCalculatorOnboardingOpen(false);
    }

    if (activeTab !== 'management') {
      setManagementOnboardingOpen(false);
    }
  }, [activeTab]);

  useEffect(() => {
    if (
      activeTab !== 'calculator' ||
      calculatorOnboardingOpen ||
      calculatorOnboardingState.completed ||
      calculatorOnboardingState.dismissed
    ) {
      return;
    }

    const timer = window.setTimeout(() => {
      setCalculatorOnboardingStepIndex(0);
      setCalculatorOnboardingOpen(true);
    }, 250);

    return () => window.clearTimeout(timer);
  }, [activeTab, calculatorOnboardingOpen, calculatorOnboardingState]);

  useEffect(() => {
    if (
      activeTab !== 'management' ||
      managementOnboardingOpen ||
      managementOnboardingState.completed ||
      managementOnboardingState.dismissed
    ) {
      return;
    }

    const timer = window.setTimeout(() => {
      setManagementOnboardingStepIndex(0);
      setManagementOnboardingOpen(true);
    }, 250);

    return () => window.clearTimeout(timer);
  }, [activeTab, managementOnboardingOpen, managementOnboardingState]);

  useEffect(() => {
    if (!calculatorOnboardingOpen || activeTab !== 'calculator') return;
    const step = CALCULATOR_ONBOARDING_STEPS[calculatorOnboardingStepIndex];
    const node = document.querySelector<HTMLElement>(`[data-guide-id="${step.targetId}"]`);
    if (node) {
      node.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [activeTab, calculatorOnboardingOpen, calculatorOnboardingStepIndex]);

  useEffect(() => {
    if (!managementOnboardingOpen || activeTab !== 'management') return;
    const step = MANAGEMENT_ONBOARDING_STEPS[managementOnboardingStepIndex];
    const node = document.querySelector<HTMLElement>(`[data-guide-id="${step.targetId}"]`);
    if (node) {
      node.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [activeTab, managementOnboardingOpen, managementOnboardingStepIndex]);

  const selectedBaseRow = useMemo(
    () => baseRows.find((row) => row.snapshot.id === selectedBaseProductId) ?? null,
    [baseRows, selectedBaseProductId],
  );
  const averageCost = useMemo(
    () =>
      baseRows.length === 0
        ? 0
        : baseRows.reduce((sum, row) => sum + row.snapshot.payload.inputs.cost, 0) / baseRows.length,
    [baseRows],
  );

  const commonInputClass =
    'h-10 w-full rounded-xl border border-border bg-body px-3 py-2 text-[13px] text-primary outline-none transition-colors focus:border-[var(--color-brand-primary)] focus:ring-1 focus:ring-[var(--color-brand-primary)]/20';
  const managementInputClass =
    'h-10 w-full rounded-xl border border-border bg-body px-3 py-2 text-[13px] text-primary outline-none transition-colors disabled:cursor-not-allowed disabled:border-border disabled:bg-body/70 disabled:text-muted focus:border-[var(--color-brand-primary)] focus:ring-1 focus:ring-[var(--color-brand-primary)]/20';

  const updateInputs = <T extends keyof PriceCalculatorInputs>(key: T, value: PriceCalculatorInputs[T]) => {
    setInputs((current) => ({ ...current, [key]: value }));
  };

  const handleResetInputs = () => {
    setInputs(createDefaultPriceCalculatorInputs());
    showToast('Entradas resetadas.', 'success');
  };

  const handleUseExample = () => {
    setInputs(EXAMPLE_INPUTS);
    showToast('Exemplo padrao carregado.', 'success');
  };

  const openSaveSnapshotModal = () => {
    setSnapshotName(inputs.productName.trim() || 'Calculo de precos');
    setSaveSnapshotOpen(true);
  };

  const handleSaveSnapshot = async () => {
    if (!snapshotName.trim()) {
      return showToast('Informe um nome para salvar o calculo.', 'warning');
    }

    setSnapshotLoading(true);
    const response = await agentApi.saveCalculatorSnapshot({
      calculator_type: 'prices',
      name: snapshotName.trim(),
      payload: { inputs },
    });
    setSnapshotLoading(false);

    if (!response.success) {
      return showToast(response.error || 'Erro ao salvar calculo.', 'error');
    }

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
    if (!response.success) {
      return showToast(response.error || 'Erro ao remover calculo salvo.', 'error');
    }

    await loadSavedSnapshots();
    showToast('Registro removido da base.', 'success');
  };

  const updateManagementOverrideField = (
    marketplaceId: PriceCalculatorMarketplaceId,
    field: 'commissionPercent' | 'promotionPercent' | 'shippingCost',
    value: number | null,
  ) => {
    setManagementOverrides((current) => ({
      ...current,
      [marketplaceId]: {
        ...current[marketplaceId],
        [field]: value,
      },
    }));
  };

  const useAutomaticReference = (marketplaceId: PriceCalculatorMarketplaceId) => {
    const automaticRow = automaticManagementRowsById[marketplaceId];
    if (!automaticRow) return;

    setManagementOverrides((current) => ({
      ...current,
      [marketplaceId]: {
        enabled: true,
        commissionPercent: automaticRow.commissionPercent,
        promotionPercent: automaticRow.promotionPercent,
        shippingCost: automaticRow.finalShipping,
      },
    }));
  };

  const toggleManagementOverride = (marketplaceId: PriceCalculatorMarketplaceId) => {
    const automaticRow = automaticManagementRowsById[marketplaceId];
    if (!automaticRow) return;

    setManagementOverrides((current) => {
      const nextEnabled = !current[marketplaceId].enabled;
      return {
        ...current,
        [marketplaceId]: {
          enabled: nextEnabled,
          commissionPercent: nextEnabled
            ? current[marketplaceId].commissionPercent ?? automaticRow.commissionPercent
            : current[marketplaceId].commissionPercent,
          promotionPercent: nextEnabled
            ? current[marketplaceId].promotionPercent ?? automaticRow.promotionPercent
            : current[marketplaceId].promotionPercent,
          shippingCost: nextEnabled
            ? current[marketplaceId].shippingCost ?? automaticRow.finalShipping
            : current[marketplaceId].shippingCost,
        },
      };
    });
  };

  const saveManagementSettings = async () => {
    const normalized = normalizePriceCalculatorManagementOverrides(managementOverrides);
    setManagementSaving(true);
    const persisted = await updatePreferences({
      price_calculator_management_overrides: normalized,
    });
    setManagementSaving(false);

    showToast(
      persisted
        ? 'Ajustes da Gestao salvos na sua conta.'
        : 'Ajustes aplicados neste navegador. A sincronizacao com o servidor falhou.',
      persisted ? 'success' : 'warning',
    );
  };

  const restoreDefaultManagementSettings = async () => {
    const defaults = createDefaultPriceCalculatorManagementOverrides();
    setManagementOverrides(defaults);
    setManagementSaving(true);
    const persisted = await updatePreferences({
      price_calculator_management_overrides: defaults,
    });
    setManagementSaving(false);

    showToast(
      persisted
        ? 'Valores da Gestao voltaram ao padrao oficial.'
        : 'Padrao oficial reaplicado neste navegador. A sincronizacao com o servidor falhou.',
      persisted ? 'success' : 'warning',
    );
  };

  const openCalculatorGuide = () => {
    setActiveTab('calculator');
    setCalculatorOnboardingStepIndex(0);
    setCalculatorOnboardingOpen(true);
  };

  const openManagementGuide = () => {
    setActiveTab('management');
    setManagementOnboardingStepIndex(0);
    setManagementOnboardingOpen(true);
  };

  const closeCalculatorGuide = (mode: 'dismissed' | 'completed') => {
    const nextState =
      mode === 'completed'
        ? { completed: true, dismissed: true }
        : { ...calculatorOnboardingState, dismissed: true };

    setCalculatorOnboardingState(nextState);
    saveOnboardingState(CALCULATOR_ONBOARDING_STORAGE_KEY, nextState);
    setCalculatorOnboardingOpen(false);

    if (mode === 'completed') {
      showToast('Tutorial da Calculadora concluido.', 'success');
    }
  };

  const closeManagementGuide = (mode: 'dismissed' | 'completed') => {
    const nextState =
      mode === 'completed'
        ? { completed: true, dismissed: true }
        : { ...managementOnboardingState, dismissed: true };

    setManagementOnboardingState(nextState);
    saveOnboardingState(MANAGEMENT_ONBOARDING_STORAGE_KEY, nextState);
    setManagementOnboardingOpen(false);

    if (mode === 'completed') {
      showToast('Tutorial da Gestao concluido.', 'success');
    }
  };

  const highlightTargetId =
    activeTab === 'calculator' && calculatorOnboardingOpen
      ? CALCULATOR_ONBOARDING_STEPS[calculatorOnboardingStepIndex]?.targetId
      : activeTab === 'management' && managementOnboardingOpen
        ? MANAGEMENT_ONBOARDING_STEPS[managementOnboardingStepIndex]?.targetId
        : null;

  const highlightedSectionClass = (targetId: string) =>
    highlightTargetId === targetId
      ? 'ring-2 ring-[var(--color-brand-primary)] ring-offset-2 ring-offset-body shadow-[0_0_0_8px_rgba(9,202,255,0.08)]'
      : '';

  return (
    <div className="min-h-screen bg-body p-4 sm:p-6">
      <div className="price-calculator-shell mx-auto flex w-full flex-col gap-4">
        <Header
          title="Calculadora de Precos"
          subtitle="A tela foi organizada em tres visoes: Calculadora, Gestao e BaseProdutos."
        />

        <div className="rounded-2xl border border-border bg-card p-2 shadow-sm">
          <div className="flex flex-wrap gap-2">
            {TAB_ITEMS.map((tab) => {
              const Icon = tab.icon;
              const active = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  className={`inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-[12px] font-bold transition-colors ${
                    active ? 'bg-[var(--color-brand-primary)] text-white shadow-sm' : 'bg-body text-muted hover:text-primary'
                  }`}
                >
                  <Icon size={14} />
                  {tab.label}
                  {tab.id === 'base-products' ? (
                    <span className={`rounded-full px-2 py-0.5 text-[10px] ${active ? 'bg-white/15 text-white' : 'bg-card text-primary'}`}>
                      {savedSnapshots.length}
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>
        </div>

        {activeTab === 'calculator' ? (
          <>
            <div
              data-guide-id="calculator-intro"
              className={`rounded-2xl border border-border bg-card p-4 shadow-sm transition-shadow ${highlightedSectionClass('calculator-intro')}`}
            >
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div className="max-w-3xl">
                  <span className="inline-flex items-center gap-2 rounded-full border border-[var(--color-brand-primary)]/20 bg-[var(--color-brand-primary)]/10 px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-[var(--color-brand-primary)]">
                    <Sparkles size={12} />
                    Guia para quem quer aprender rapido
                  </span>
                  <h3 className="mt-3 text-[22px] font-extrabold tracking-tight text-primary">
                    Preencha uma vez e compare seus canais com clareza
                  </h3>
                  <p className="mt-2 text-[13px] leading-6 text-secondary">
                    Se voce nunca usou a calculadora, siga o tutorial passo a passo. Ele mostra o que preencher, como interpretar os numeros e
                    quando vale ir para a aba Gestao para ajustar regras especiais.
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={openCalculatorGuide}
                    className="inline-flex items-center gap-2 rounded-xl border border-border px-4 py-2.5 text-[12px] font-bold text-primary transition-colors hover:bg-body"
                  >
                    <Wand2 size={14} />
                    Abrir tutorial da Calculadora
                  </button>
                  <button
                    type="button"
                    onClick={openManagementGuide}
                    className="inline-flex items-center gap-2 rounded-xl border border-border px-4 py-2.5 text-[12px] font-bold text-primary transition-colors hover:bg-body"
                  >
                    <Settings2 size={14} />
                    Ver tutorial da Gestao
                  </button>
                </div>
              </div>
            </div>

            <SectionCard
              title="Entradas do produto"
              subtitle="A margem alvo entra no divisor junto com imposto, difal e comissao."
              icon={Calculator}
            >
              <div className="price-calculator-input-layout grid gap-4">
                <div data-guide-id="calculator-inputs" className={`space-y-3 ${highlightedSectionClass('calculator-inputs')}`}>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="space-y-1 sm:col-span-2">
                      <span className="text-[11px] font-semibold text-muted">Produto</span>
                      <input
                        className={commonInputClass}
                        value={inputs.productName}
                        onChange={(event) => updateInputs('productName', event.target.value)}
                        placeholder="Ex: Camisa Preta"
                      />
                    </label>
                    <label className="space-y-1">
                      <span className="text-[11px] font-semibold text-muted">Peso (g)</span>
                      <input
                        type="number"
                        step="1"
                        min="0"
                        className={commonInputClass}
                        value={`${inputs.weightGrams}`}
                        onChange={(event) => updateInputs('weightGrams', Number(event.target.value) || 0)}
                      />
                    </label>
                    <label className="space-y-1">
                      <span className="text-[11px] font-semibold text-muted">Custo</span>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        className={commonInputClass}
                        value={`${inputs.cost}`}
                        onChange={(event) => updateInputs('cost', Number(event.target.value) || 0)}
                      />
                    </label>
                    <label className="space-y-1">
                      <span className="text-[11px] font-semibold text-muted">Custo operacional</span>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        className={commonInputClass}
                        value={`${inputs.operationalCost}`}
                        onChange={(event) => updateInputs('operationalCost', Number(event.target.value) || 0)}
                      />
                    </label>
                    <label className="space-y-1">
                      <span className="text-[11px] font-semibold text-muted">Margem alvo (%)</span>
                      <input
                        type="number"
                        step="0.1"
                        min="0"
                        className={commonInputClass}
                        value={`${inputs.marginPercent}`}
                        onChange={(event) => updateInputs('marginPercent', Number(event.target.value) || 0)}
                      />
                    </label>
                    <label className="space-y-1">
                      <span className="text-[11px] font-semibold text-muted">Imposto (%)</span>
                      <input
                        type="number"
                        step="0.1"
                        min="0"
                        className={commonInputClass}
                        value={`${inputs.taxPercent}`}
                        onChange={(event) => updateInputs('taxPercent', Number(event.target.value) || 0)}
                      />
                    </label>
                    <label className="space-y-1">
                      <span className="text-[11px] font-semibold text-muted">Difal (%)</span>
                      <input
                        type="number"
                        step="0.1"
                        min="0"
                        className={commonInputClass}
                        value={`${inputs.difalPercent}`}
                        onChange={(event) => updateInputs('difalPercent', Number(event.target.value) || 0)}
                      />
                    </label>
                  </div>
                  <div data-guide-id="calculator-formula" className={`rounded-2xl border border-border bg-body px-4 py-3.5 ${highlightedSectionClass('calculator-formula')}`}>
                    <p className="text-[11px] font-semibold text-primary">Formula base</p>
                    <p className="mt-1 text-[11px] text-muted">
                      Preco praticado = (custo + custo operacional + frete) / (1 - imposto - difal - comissao - margem)
                    </p>
                    <p className="mt-2 text-[10px] text-muted">
                      Cada canal resolve o proprio frete pela regra comercial configurada na calculadora.
                    </p>
                  </div>
                  <div data-guide-id="calculator-actions" className={`flex flex-wrap gap-2 ${highlightedSectionClass('calculator-actions')}`}>
                    <button
                      type="button"
                      onClick={handleUseExample}
                      className="inline-flex items-center gap-2 rounded-xl border border-border px-4 py-2.5 text-[12px] font-bold text-primary transition-colors hover:bg-body"
                    >
                      <Package2 size={14} />
                      Usar exemplo
                    </button>
                    <button
                      type="button"
                      onClick={handleResetInputs}
                      className="inline-flex items-center gap-2 rounded-xl border border-border px-4 py-2.5 text-[12px] font-bold text-primary transition-colors hover:bg-body"
                    >
                      <RotateCcw size={14} />
                      Limpar
                    </button>
                    <button
                      type="button"
                      onClick={openSaveSnapshotModal}
                      className="inline-flex items-center gap-2 rounded-xl bg-[var(--color-brand-primary)] px-4 py-2.5 text-[12px] font-bold text-white shadow-sm transition-transform hover:-translate-y-0.5"
                    >
                      <Save size={14} />
                      Salvar na BaseProdutos
                    </button>
                  </div>
                </div>
                <div data-guide-id="calculator-summary" className={`grid gap-3 ${highlightedSectionClass('calculator-summary')}`}>
                  <StatCard
                    label="Melhor lucro"
                    value={formatCurrencyBRL(bestProfit.profit)}
                    helper={`${bestProfit.marketplaceName} · preco praticado ${formatCurrencyBRL(bestProfit.practicedPrice)}`}
                    tone="success"
                  />
                  <StatCard
                    label="Menor preco praticado"
                    value={formatCurrencyBRL(lowestPracticed.practicedPrice)}
                    helper={`${lowestPracticed.marketplaceName} · lucro ${formatCurrencyBRL(lowestPracticed.profit)}`}
                  />
                  <StatCard
                    label="Faixa de preco cheio"
                    value={`${formatCurrencyBRL(fullPriceRange.min)} - ${formatCurrencyBRL(fullPriceRange.max)}`}
                    helper="Comparando os descontos promocionais de cada canal"
                  />
                </div>
              </div>
            </SectionCard>

            <SectionCard
              title="Resultados por marketplace"
              subtitle="Os precos cheios ja consideram o desconto promocional de cada canal."
              icon={TrendingUp}
            >
              <div data-guide-id="calculator-results" className={`grid gap-4 lg:grid-cols-2 xl:grid-cols-3 ${highlightedSectionClass('calculator-results')}`}>
                {results.map((result) => (
                  <ResultCard key={result.marketplaceId} result={result} />
                ))}
              </div>
            </SectionCard>
          </>
        ) : null}

        {activeTab === 'management' ? (
          <SectionCard
            title="Gestao"
            subtitle="Ajuste comissao, promocao e frete por marketplace, salve sua realidade e use o tutorial interativo quando precisar."
            icon={Settings2}
          >
            <div className="space-y-4">
              <div
                data-guide-id="management-intro"
                className={`rounded-2xl border border-border bg-body p-4 transition-shadow ${highlightedSectionClass('management-intro')}`}
              >
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div className="max-w-3xl">
                    <span className="inline-flex items-center gap-2 rounded-full border border-[var(--color-brand-primary)]/20 bg-[var(--color-brand-primary)]/10 px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-[var(--color-brand-primary)]">
                      <Sparkles size={12} />
                      Ajuste fino da sua operacao
                    </span>
                    <h3 className="mt-3 text-[22px] font-extrabold tracking-tight text-primary">
                      Personalize so o que foge da regra oficial
                    </h3>
                    <p className="mt-2 text-[13px] leading-6 text-secondary">
                      A referencia automatica continua visivel em todos os canais. Voce ativa o manual apenas onde sua operacao usa comissao,
                      promocao ou frete diferentes da tabela oficial.
                    </p>
                  </div>
                  <div data-guide-id="management-actions" className={`flex flex-wrap gap-2 ${highlightedSectionClass('management-actions')}`}>
                    <button
                      type="button"
                      onClick={openManagementGuide}
                      className="inline-flex items-center gap-2 rounded-xl border border-border px-4 py-2.5 text-[12px] font-bold text-primary transition-colors hover:bg-card"
                    >
                      <Wand2 size={14} />
                      Abrir tutorial
                    </button>
                    <button
                      type="button"
                      onClick={() => void saveManagementSettings()}
                      disabled={!managementDirty || managementSaving}
                      className="inline-flex items-center gap-2 rounded-xl bg-[var(--color-brand-primary)] px-4 py-2.5 text-[12px] font-bold text-white shadow-sm transition-opacity disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      <Save size={14} />
                      {managementSaving ? 'Salvando...' : 'Salvar minha realidade'}
                    </button>
                    <button
                      type="button"
                      onClick={() => void restoreDefaultManagementSettings()}
                      disabled={managementSaving || (!managementDirty && savedOverrideCount === 0)}
                      className="inline-flex items-center gap-2 rounded-xl border border-border px-4 py-2.5 text-[12px] font-bold text-primary transition-colors hover:bg-card disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      <RotateCcw size={14} />
                      Voltar ao default
                    </button>
                  </div>
                </div>

                <div className="mt-4 grid gap-3 xl:grid-cols-5">
                  <StatCard label="Imposto base" value={formatPercent(ruleState.taxPercent, 1)} helper="Aliquota global aplicada no calculo" />
                  <StatCard label="Difal" value={formatPercent(ruleState.difalPercent, 1)} helper="Diferenca de aliquota aplicada no calculo" />
                  <StatCard label="Base Netshoes 26%" value={ruleState.netshoesCommissionBasePrice === null ? 'Indefinido' : formatCurrencyBRL(ruleState.netshoesCommissionBasePrice)} helper="Base sem frete que decide 26% ou 31%" />
                  <StatCard label="Canais personalizados" value={`${ruleState.overrideCount}`} helper="Ajustes manuais ativos neste momento" />
                  <StatCard label="Canais com alerta" value={`${warningCount}`} helper="Regras oficiais com ressalva operacional" />
                </div>

                <div className="mt-4 rounded-2xl border border-dashed border-border bg-card px-4 py-3">
                  <p className="text-[12px] font-semibold text-primary">
                    {managementDirty
                      ? 'Voce tem alteracoes ainda nao salvas.'
                      : savedOverrideCount > 0
                        ? `Sua conta ja guarda ajustes personalizados em ${savedOverrideCount} canal${savedOverrideCount > 1 ? 's' : ''}.`
                        : 'Sua conta esta usando 100% da regra oficial no momento.'}
                  </p>
                  <p className="mt-1 text-[11px] text-muted">
                    Salve quando quiser reaplicar automaticamente esses parametros. Se algo sair do esperado, o reset volta tudo para a referencia oficial.
                  </p>
                </div>
              </div>

              <div
                data-guide-id="management-cards"
                className={`grid gap-4 xl:grid-cols-2 ${highlightedSectionClass('management-cards')}`}
              >
                {PRICE_CALCULATOR_MARKETPLACE_ORDER.map((marketplaceId) => {
                  const currentRow = ruleState.managementRows.find((row) => row.marketplaceId === marketplaceId)!;
                  const automaticRow = automaticManagementRowsById[marketplaceId];
                  const override = managementOverrides[marketplaceId];

                  return (
                    <article
                      key={marketplaceId}
                      className={`rounded-2xl border p-4 transition-colors ${
                        override.enabled
                          ? 'border-[var(--color-brand-primary)]/30 bg-[var(--color-brand-primary)]/5'
                          : 'border-border bg-card'
                      }`}
                    >
                      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                        <div className="space-y-2">
                          <MarketplacePill
                            result={{
                              accentColor: currentRow.accentColor,
                              shortLabel: currentRow.shortLabel,
                              marketplaceName: currentRow.marketplaceName,
                            }}
                          />
                          <div className="flex flex-wrap items-center gap-2 text-[11px]">
                            <span
                              className={`inline-flex rounded-full px-2.5 py-1 font-bold ${
                                override.enabled
                                  ? 'bg-[var(--color-brand-primary)] text-white'
                                  : 'bg-body text-muted'
                              }`}
                            >
                              {override.enabled ? 'Usando meus valores' : 'Usando regra oficial'}
                            </span>
                            <span className="text-muted">
                              Referencia oficial: {formatPercent(automaticRow.commissionPercent, 0)} · {formatPercent(automaticRow.promotionPercent, 0)} · {formatCurrencyBRL(automaticRow.finalShipping)}
                            </span>
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={() => toggleManagementOverride(marketplaceId)}
                          className={`inline-flex items-center gap-2 self-start rounded-full border px-3 py-1.5 text-[11px] font-bold transition-colors ${
                            override.enabled
                              ? 'border-[var(--color-brand-primary)] bg-[var(--color-brand-primary)] text-white'
                              : 'border-border bg-body text-primary hover:bg-card'
                          }`}
                        >
                          <Target size={12} />
                          {override.enabled ? 'Personalizar este canal' : 'Ativar personalizacao'}
                        </button>
                      </div>

                      <div className="mt-4 grid gap-3 md:grid-cols-3">
                        <label className="space-y-1">
                          <span className="text-[11px] font-semibold text-muted">Comissao (%)</span>
                          <input
                            type="number"
                            step="0.1"
                            min="0"
                            disabled={!override.enabled}
                            className={managementInputClass}
                            value={override.commissionPercent ?? ''}
                            placeholder={`${automaticRow.commissionPercent}`}
                            onChange={(event) =>
                              updateManagementOverrideField(
                                marketplaceId,
                                'commissionPercent',
                                parseNullableNumber(event.target.value),
                              )
                            }
                          />
                        </label>
                        <label className="space-y-1">
                          <span className="text-[11px] font-semibold text-muted">Promocao (%)</span>
                          <input
                            type="number"
                            step="0.1"
                            min="0"
                            disabled={!override.enabled}
                            className={managementInputClass}
                            value={override.promotionPercent ?? ''}
                            placeholder={`${automaticRow.promotionPercent}`}
                            onChange={(event) =>
                              updateManagementOverrideField(
                                marketplaceId,
                                'promotionPercent',
                                parseNullableNumber(event.target.value),
                              )
                            }
                          />
                        </label>
                        <label className="space-y-1">
                          <span className="text-[11px] font-semibold text-muted">Frete (R$)</span>
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            disabled={!override.enabled}
                            className={managementInputClass}
                            value={override.shippingCost ?? ''}
                            placeholder={`${automaticRow.finalShipping}`}
                            onChange={(event) =>
                              updateManagementOverrideField(
                                marketplaceId,
                                'shippingCost',
                                parseNullableNumber(event.target.value),
                              )
                            }
                          />
                        </label>
                      </div>

                      <div className="mt-3 flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          onClick={() => useAutomaticReference(marketplaceId)}
                          className="rounded-lg border border-border px-3 py-1.5 text-[11px] font-bold text-primary transition-colors hover:bg-body"
                        >
                          Preencher com a referencia oficial
                        </button>
                        <span className="text-[11px] text-muted">
                          Assim voce parte da base do sistema e ajusta so o que muda no seu contrato.
                        </span>
                      </div>

                      <div className="mt-4 rounded-xl border border-border bg-body px-3.5 py-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <p className="text-[11px] font-semibold text-primary">
                            {override.enabled ? 'Regra ativa agora' : 'Regra oficial de referencia'}
                          </p>
                          <span className="text-[10px] font-bold uppercase tracking-wider text-muted">{currentRow.resolvedBand}</span>
                        </div>
                        <p className="mt-2 text-[11px] text-secondary">
                          {override.enabled ? currentRow.ruleSummary : automaticRow.ruleSummary}
                        </p>
                        <p className="mt-2 text-[11px] text-muted">
                          {override.enabled ? currentRow.note : automaticRow.note}
                        </p>
                        {currentRow.warning ? <p className="mt-2 text-[11px] font-medium text-danger">{currentRow.warning}</p> : null}
                      </div>
                    </article>
                  );
                })}
              </div>

              <div
                data-guide-id="management-table"
                className={`overflow-x-auto rounded-2xl border border-border ${highlightedSectionClass('management-table')}`}
              >
                <table className="min-w-full">
                  <thead>
                    <tr className="border-b border-border bg-body text-left text-[10px] font-bold uppercase tracking-wider text-muted">
                      <th className="px-3 py-2.5">Marketplace</th>
                      <th className="px-3 py-2.5">Modo</th>
                      <th className="px-3 py-2.5 text-right">Comissao</th>
                      <th className="px-3 py-2.5 text-right">Promo</th>
                      <th className="px-3 py-2.5 text-right">Frete final</th>
                      <th className="px-3 py-2.5">Base usada</th>
                      <th className="px-3 py-2.5">Faixa resolvida</th>
                      <th className="px-3 py-2.5">Regra aplicada</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ruleState.managementRows.map((row: PriceCalculatorManagementRow) => (
                      <tr
                        key={row.marketplaceId}
                        className={`border-b border-border text-[12px] last:border-b-0 ${
                          row.isOverrideActive ? 'bg-[var(--color-brand-primary)]/5' : 'bg-card'
                        }`}
                      >
                        <td className="px-3 py-2.5">
                          <MarketplacePill
                            result={{
                              accentColor: row.accentColor,
                              shortLabel: row.shortLabel,
                              marketplaceName: row.marketplaceName,
                            }}
                          />
                        </td>
                        <td className="px-3 py-2.5">
                          <span
                            className={`inline-flex rounded-full px-2.5 py-1 text-[10px] font-bold ${
                              row.isOverrideActive
                                ? 'bg-[var(--color-brand-primary)] text-white'
                                : 'bg-body text-muted'
                            }`}
                          >
                            {row.isOverrideActive ? 'Manual' : 'Oficial'}
                          </span>
                        </td>
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
            </div>
          </SectionCard>
        ) : null}

        {activeTab === 'base-products' ? (
          <>
            <SectionCard
              title="BaseProdutos"
              subtitle="Catalogo derivado dos snapshots salvos, exibido em formato de base de produtos."
              icon={Database}
            >
              <div className="grid gap-3 lg:grid-cols-3">
                <StatCard label="Registros" value={`${baseRows.length}`} helper="Snapshots salvos na calculadora" />
                <StatCard label="Custo medio" value={formatCurrencyBRL(averageCost)} helper="Media do custo dos registros salvos" />
                <StatCard
                  label="Ultimo registro"
                  value={baseRows[0] ? new Date(baseRows[0].snapshot.updated_at).toLocaleDateString('pt-BR') : 'Sem dados'}
                  helper={baseRows[0]?.snapshot.payload.inputs.productName || 'Salve um calculo para criar a base'}
                />
              </div>
              <div className="mt-4 overflow-x-auto rounded-2xl border border-border">
                <table className="min-w-[1180px]">
                  <thead>
                    <tr className="border-b border-border bg-body text-left text-[10px] font-bold uppercase tracking-wider text-muted">
                      <th className="px-3 py-2.5">Nome</th>
                      <th className="px-3 py-2.5">Produto</th>
                      <th className="px-3 py-2.5 text-right">Peso</th>
                      <th className="px-3 py-2.5 text-right">Custo</th>
                      <th className="px-3 py-2.5 text-right">C. Op.</th>
                      <th className="px-3 py-2.5 text-right">Margem</th>
                      <th className="px-3 py-2.5 text-right">PP AMZ</th>
                      <th className="px-3 py-2.5 text-right">PP MGL</th>
                      <th className="px-3 py-2.5 text-right">PP ML</th>
                      <th className="px-3 py-2.5 text-right">PP NET</th>
                      <th className="px-3 py-2.5 text-right">PP SHN</th>
                      <th className="px-3 py-2.5 text-right">PP SHP</th>
                      <th className="px-3 py-2.5 text-right">Acoes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {baseRows.map((row) => (
                      <tr
                        key={row.snapshot.id}
                        className={`border-b text-[12px] last:border-b-0 ${selectedBaseProductId === row.snapshot.id ? 'bg-body' : 'bg-card'}`}
                      >
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
                        <td className="px-3 py-2.5">
                          <div className="flex justify-end gap-2">
                            <button
                              type="button"
                              onClick={() => setSelectedBaseProductId(row.snapshot.id)}
                              className="rounded-md border border-border px-2.5 py-1 text-[10px] font-bold text-muted transition-colors hover:text-primary"
                            >
                              Detalhes
                            </button>
                            <button
                              type="button"
                              onClick={() => loadSavedSnapshot(row.snapshot)}
                              className="rounded-md border border-border px-2.5 py-1 text-[10px] font-bold text-muted transition-colors hover:text-primary"
                            >
                              Carregar
                            </button>
                            <button
                              type="button"
                              onClick={() => void deleteSavedSnapshot(row.snapshot.id)}
                              className="rounded-md border border-danger/20 px-2.5 py-1 text-[10px] font-bold text-danger transition-colors hover:bg-danger/10"
                            >
                              <Trash2 size={12} className="inline" /> Remover
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                    {baseRows.length === 0 ? (
                      <tr>
                        <td colSpan={13} className="bg-card px-4 py-8 text-center text-[11px] text-muted">
                          Nenhum registro salvo ainda. Use a aba Calculadora e clique em salvar para preencher a BaseProdutos.
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            </SectionCard>

            {selectedBaseRow ? (
              <SectionCard
                title={`Detalhe do registro · ${selectedBaseRow.snapshot.name}`}
                subtitle="Resumo da linha selecionada com precos, impostos e fretes derivados do snapshot."
                icon={BookOpen}
              >
                <div className="grid gap-3 lg:grid-cols-4">
                  <StatCard label="Produto" value={selectedBaseRow.snapshot.payload.inputs.productName || 'Sem nome'} helper="Campo de entrada" />
                  <StatCard label="Peso" value={`${selectedBaseRow.snapshot.payload.inputs.weightGrams} g`} helper="Peso salvo" />
                  <StatCard label="Custo" value={formatCurrencyBRL(selectedBaseRow.snapshot.payload.inputs.cost)} helper="Custo do produto" />
                  <StatCard label="Margem" value={formatPercent(selectedBaseRow.snapshot.payload.inputs.marginPercent, 1)} helper="Margem alvo" />
                </div>
                <div className="mt-4 grid gap-4 xl:grid-cols-2">
                  <div className="overflow-x-auto rounded-2xl border border-border">
                    <table className="min-w-full">
                      <thead>
                        <tr className="border-b border-border bg-body text-left text-[10px] font-bold uppercase tracking-wider text-muted">
                          <th className="px-3 py-2.5">Marketplace</th>
                          <th className="px-3 py-2.5 text-right">Preco praticado</th>
                          <th className="px-3 py-2.5 text-right">Preco cheio</th>
                          <th className="px-3 py-2.5 text-right">Lucro</th>
                        </tr>
                      </thead>
                      <tbody>
                        {PRICE_CALCULATOR_MARKETPLACE_ORDER.map((id) => {
                          const result = getResultById(selectedBaseRow.results, id);
                          return (
                            <tr key={id} className="border-b border-border bg-card text-[12px] last:border-b-0">
                              <td className="px-3 py-2.5">
                                <MarketplacePill result={result} />
                              </td>
                              <td className="px-3 py-2.5 text-right tabular-nums text-primary">{formatCurrencyBRL(result.practicedPrice)}</td>
                              <td className="px-3 py-2.5 text-right tabular-nums text-primary">{formatCurrencyBRL(result.fullPrice)}</td>
                              <td className={`px-3 py-2.5 text-right font-bold tabular-nums ${result.profit >= 0 ? 'text-success' : 'text-danger'}`}>
                                {formatCurrencyBRL(result.profit)}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  <div className="overflow-x-auto rounded-2xl border border-border">
                    <table className="min-w-full">
                      <thead>
                        <tr className="border-b border-border bg-body text-left text-[10px] font-bold uppercase tracking-wider text-muted">
                          <th className="px-3 py-2.5">Marketplace</th>
                          <th className="px-3 py-2.5 text-right">Imposto</th>
                          <th className="px-3 py-2.5 text-right">Frete</th>
                          <th className="px-3 py-2.5 text-right">Comissao</th>
                        </tr>
                      </thead>
                      <tbody>
                        {PRICE_CALCULATOR_MARKETPLACE_ORDER.map((id) => {
                          const result = getResultById(selectedBaseRow.results, id);
                          return (
                            <tr key={id} className="border-b border-border bg-card text-[12px] last:border-b-0">
                              <td className="px-3 py-2.5">
                                <MarketplacePill result={result} />
                              </td>
                              <td className="px-3 py-2.5 text-right tabular-nums text-primary">{formatCurrencyBRL(result.taxAmount)}</td>
                              <td className="px-3 py-2.5 text-right tabular-nums text-primary">{formatCurrencyBRL(result.shippingCost)}</td>
                              <td className="px-3 py-2.5 text-right tabular-nums text-secondary">{formatPercent(result.commissionPercent, 0)}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              </SectionCard>
            ) : null}
          </>
        ) : null}
      </div>

      <SaveSnapshotModal
        open={saveSnapshotOpen}
        title="Salvar na BaseProdutos"
        description="O snapshot fica salvo no backend e aparece na aba BaseProdutos."
        name={snapshotName}
        loading={snapshotLoading}
        onNameChange={setSnapshotName}
        onClose={() => setSaveSnapshotOpen(false)}
        onConfirm={() => void handleSaveSnapshot()}
      />

      {activeTab === 'calculator' && calculatorOnboardingOpen ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/45 px-4 py-6 sm:items-center">
          <button
            type="button"
            aria-label="Fechar tutorial"
            className="absolute inset-0"
            onClick={() => closeCalculatorGuide('dismissed')}
          />
          <div className="relative w-full max-w-xl rounded-[28px] border border-border bg-card shadow-2xl">
            <div className="flex items-start justify-between gap-4 border-b border-border px-5 py-5">
              <div>
                <span className="inline-flex rounded-full bg-[var(--color-brand-primary)]/10 px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-[var(--color-brand-primary)]">
                  Guia interativo · Passo {calculatorOnboardingStepIndex + 1} de {CALCULATOR_ONBOARDING_STEPS.length}
                </span>
                <h3 className="mt-3 text-[22px] font-extrabold tracking-tight text-primary">
                  {CALCULATOR_ONBOARDING_STEPS[calculatorOnboardingStepIndex].title}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => closeCalculatorGuide('dismissed')}
                className="rounded-full border border-border p-2 text-muted transition-colors hover:text-primary"
              >
                <X size={16} />
              </button>
            </div>

            <div className="space-y-4 px-5 py-5">
              <p className="text-[14px] leading-6 text-secondary">
                {CALCULATOR_ONBOARDING_STEPS[calculatorOnboardingStepIndex].description}
              </p>

              <div className="rounded-2xl border border-dashed border-[var(--color-brand-primary)]/30 bg-[var(--color-brand-primary)]/5 px-4 py-3">
                <p className="text-[11px] font-bold uppercase tracking-wider text-[var(--color-brand-primary)]">Onde olhar agora</p>
                <p className="mt-2 text-[12px] leading-5 text-secondary">
                  {CALCULATOR_ONBOARDING_STEPS[calculatorOnboardingStepIndex].helper}
                </p>
              </div>

              <div className="flex flex-wrap gap-2">
                {CALCULATOR_ONBOARDING_STEPS.map((step, index) => (
                  <span
                    key={step.title}
                    className={`h-2 flex-1 rounded-full ${index <= calculatorOnboardingStepIndex ? 'bg-[var(--color-brand-primary)]' : 'bg-border'}`}
                  />
                ))}
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-5 py-4">
              <button
                type="button"
                onClick={() => closeCalculatorGuide('dismissed')}
                className="rounded-xl border border-border px-4 py-2 text-[12px] font-bold text-primary transition-colors hover:bg-body"
              >
                Pular por agora
              </button>

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setCalculatorOnboardingStepIndex((current) => Math.max(0, current - 1))}
                  disabled={calculatorOnboardingStepIndex === 0}
                  className="rounded-xl border border-border px-4 py-2 text-[12px] font-bold text-primary transition-colors hover:bg-body disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Voltar
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (calculatorOnboardingStepIndex === CALCULATOR_ONBOARDING_STEPS.length - 1) {
                      closeCalculatorGuide('completed');
                      return;
                    }
                    setCalculatorOnboardingStepIndex((current) => current + 1);
                  }}
                  className="rounded-xl bg-[var(--color-brand-primary)] px-4 py-2 text-[12px] font-bold text-white shadow-sm"
                >
                  {calculatorOnboardingStepIndex === CALCULATOR_ONBOARDING_STEPS.length - 1 ? 'Concluir tutorial' : 'Proximo passo'}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {activeTab === 'management' && managementOnboardingOpen ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/45 px-4 py-6 sm:items-center">
          <button
            type="button"
            aria-label="Fechar tutorial"
            className="absolute inset-0"
            onClick={() => closeManagementGuide('dismissed')}
          />
          <div className="relative w-full max-w-xl rounded-[28px] border border-border bg-card shadow-2xl">
            <div className="flex items-start justify-between gap-4 border-b border-border px-5 py-5">
              <div>
                <span className="inline-flex rounded-full bg-[var(--color-brand-primary)]/10 px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-[var(--color-brand-primary)]">
                  Guia interativo · Passo {managementOnboardingStepIndex + 1} de {MANAGEMENT_ONBOARDING_STEPS.length}
                </span>
                <h3 className="mt-3 text-[22px] font-extrabold tracking-tight text-primary">
                  {MANAGEMENT_ONBOARDING_STEPS[managementOnboardingStepIndex].title}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => closeManagementGuide('dismissed')}
                className="rounded-full border border-border p-2 text-muted transition-colors hover:text-primary"
              >
                <X size={16} />
              </button>
            </div>

            <div className="space-y-4 px-5 py-5">
              <p className="text-[14px] leading-6 text-secondary">
                {MANAGEMENT_ONBOARDING_STEPS[managementOnboardingStepIndex].description}
              </p>

              <div className="rounded-2xl border border-dashed border-[var(--color-brand-primary)]/30 bg-[var(--color-brand-primary)]/5 px-4 py-3">
                <p className="text-[11px] font-bold uppercase tracking-wider text-[var(--color-brand-primary)]">Onde olhar agora</p>
                <p className="mt-2 text-[12px] leading-5 text-secondary">
                  {MANAGEMENT_ONBOARDING_STEPS[managementOnboardingStepIndex].helper}
                </p>
              </div>

              <div className="flex flex-wrap gap-2">
                {MANAGEMENT_ONBOARDING_STEPS.map((step, index) => (
                  <span
                    key={step.title}
                    className={`h-2 flex-1 rounded-full ${index <= managementOnboardingStepIndex ? 'bg-[var(--color-brand-primary)]' : 'bg-border'}`}
                  />
                ))}
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-5 py-4">
              <button
                type="button"
                onClick={() => closeManagementGuide('dismissed')}
                className="rounded-xl border border-border px-4 py-2 text-[12px] font-bold text-primary transition-colors hover:bg-body"
              >
                Pular por agora
              </button>

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setManagementOnboardingStepIndex((current) => Math.max(0, current - 1))}
                  disabled={managementOnboardingStepIndex === 0}
                  className="rounded-xl border border-border px-4 py-2 text-[12px] font-bold text-primary transition-colors hover:bg-body disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Voltar
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (managementOnboardingStepIndex === MANAGEMENT_ONBOARDING_STEPS.length - 1) {
                      closeManagementGuide('completed');
                      return;
                    }
                    setManagementOnboardingStepIndex((current) => current + 1);
                  }}
                  className="rounded-xl bg-[var(--color-brand-primary)] px-4 py-2 text-[12px] font-bold text-white shadow-sm"
                >
                  {managementOnboardingStepIndex === MANAGEMENT_ONBOARDING_STEPS.length - 1 ? 'Concluir tutorial' : 'Proximo passo'}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
