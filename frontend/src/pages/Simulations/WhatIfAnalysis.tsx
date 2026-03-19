import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type MutableRefObject,
  type SetStateAction,
} from 'react';
import {
  Barcode,
  BarChart3,
  Calculator,
  Check,
  Copy,
  Download,
  ExternalLink,
  FileText,
  Filter,
  Info,
  LayoutGrid,
  Link2,
  Printer,
  Search,
  Sparkles,
  Table2,
  TrendingDown,
  TrendingUp,
  Trash2,
  Wand2,
} from 'lucide-react';
import JsBarcode from 'jsbarcode';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import amazonLogo from '../../assets/channels/amazon.svg';
import kwaiLogo from '../../assets/channels/kwai.svg';
import magaluLogo from '../../assets/channels/magalu.svg';
import mlLogo from '../../assets/channels/mercado-livre.png';
import sheinLogo from '../../assets/channels/shein.png';
import shopeeLogo from '../../assets/channels/shopee.png';
import tiktokLogo from '../../assets/channels/tiktok-shop.png';
import { useToast } from '../../components/Toast';
import { agentApi } from '../../services/agentApi';
import {
  BRAZILIAN_PREFIX,
  CALCULATOR_HISTORY_KEY,
  CALCULATOR_VISIBLE_MARKETS_KEY,
  CATEGORY_OPTIONS,
  DEFAULT_VISIBLE_MARKETPLACES,
  MARKETPLACE_META,
  NCM_DATABASE,
  UF_OPTIONS,
  buildHistoryEntry,
  calculateMarkupSummary,
  calculateMarketplaceResults,
  calculateWhatIfImpact,
  cloneMarketplaceConfigs,
  createDefaultInputs,
  createDefaultMarketplaceConfigs,
  dedupeHistoryEntry,
  estimateNcmTaxes,
  formatCurrencyBRL,
  formatPercent,
  generateEanCode,
  getMercadoLivreSupermarketFee,
  parseProductNameFromUrl,
  sanitizeHistory,
  searchNcmDatabase,
  validateOrCompleteEan,
  type CalculatorHistoryEntry,
  type CalculatorInputs,
  type CalculatorTab,
  type ComparisonViewMode,
  type DescriptionResponse,
  type DescriptionVariation,
  type GeneratedBarcode,
  type MarketplaceConfigMap,
  type MarketplaceId,
  type MarketplaceResult,
  type NcmEstimate,
  type NcmMatch,
} from '../../utils/marketplaceCalculator';

type DescriptionMarketplace =
  | 'geral'
  | 'mercado-livre'
  | 'amazon'
  | 'shopee'
  | 'shein'
  | 'magalu'
  | 'tiktok'
  | 'kwai';

interface DescriptionFormState {
  productName: string;
  marketplace: DescriptionMarketplace;
  category: string;
  keywords: string;
  features: string;
}

interface WhatIfState {
  salePrice: number;
  productCost: number;
  taxPercent: number;
}

const TAB_ITEMS: Array<{ id: CalculatorTab; label: string; icon: typeof Calculator }> = [
  { id: 'taxes', label: 'Taxas', icon: Calculator },
  { id: 'description', label: 'Descrição', icon: FileText },
  { id: 'ean', label: 'EAN', icon: Barcode },
  { id: 'ncm', label: 'NCM', icon: Search },
];

const VIEW_ITEMS: Array<{ id: ComparisonViewMode; label: string; icon: typeof LayoutGrid }> = [
  { id: 'cards', label: 'Cards', icon: LayoutGrid },
  { id: 'table', label: 'Tabela', icon: Table2 },
  { id: 'chart', label: 'Gráfico', icon: BarChart3 },
];

const MARKETPLACE_ORDER: MarketplaceId[] = [
  'mercadolivre',
  'amazon',
  'shopee',
  'shein',
  'magalu',
  'tiktok',
  'kwai',
];

const DESCRIPTION_MARKETPLACE_OPTIONS: Array<{ value: DescriptionMarketplace; label: string }> = [
  { value: 'geral', label: 'Geral (todos)' },
  { value: 'mercado-livre', label: 'Mercado Livre' },
  { value: 'amazon', label: 'Amazon' },
  { value: 'shopee', label: 'Shopee' },
  { value: 'shein', label: 'SHEIN' },
  { value: 'magalu', label: 'Magazine Luiza' },
  { value: 'tiktok', label: 'TikTok Shop' },
  { value: 'kwai', label: 'Kwai Shop' },
];

const AMAZON_PROFILE_OPTIONS: Array<{
  value: MarketplaceConfigMap['amazon']['sellerProfile'];
  label: string;
}> = [
  { value: 'default', label: 'Padrão' },
  { value: 'new-seller', label: 'Novo Vendedor' },
  { value: 'feb26-new', label: 'Fev 26 Novo' },
];

const HELP_LINK_PANEL_IDS = new Set<MarketplaceId>(['mercadolivre', 'amazon', 'shopee', 'magalu']);

const DEFAULT_DESCRIPTION_FORM: DescriptionFormState = {
  productName: '',
  marketplace: 'geral',
  category: '',
  keywords: '',
  features: '',
};

function readStoredVisibleMarketplaces() {
  try {
    const raw = localStorage.getItem(CALCULATOR_VISIBLE_MARKETS_KEY);
    if (!raw) return DEFAULT_VISIBLE_MARKETPLACES;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) && parsed.length > 0
      ? (parsed.filter((item): item is MarketplaceId => MARKETPLACE_ORDER.includes(item)) as MarketplaceId[])
      : DEFAULT_VISIBLE_MARKETPLACES;
  } catch {
    return DEFAULT_VISIBLE_MARKETPLACES;
  }
}

function readStoredHistory() {
  try {
    const raw = localStorage.getItem(CALCULATOR_HISTORY_KEY);
    if (!raw) return [] as CalculatorHistoryEntry[];
    return sanitizeHistory(JSON.parse(raw));
  } catch {
    return [] as CalculatorHistoryEntry[];
  }
}

function buildClipboardPayload(results: MarketplaceResult[], productName: string) {
  const lines = [`Comparativo de Marketplaces${productName ? ` · ${productName}` : ''}`, ''];
  results
    .slice()
    .sort((left, right) => right.profit - left.profit)
    .forEach((result, index) => {
      lines.push(`${index + 1}. ${result.marketplaceName} · ${result.optionName}`);
      lines.push(`   Taxas: ${formatCurrencyBRL(result.marketplaceFees)}`);
      lines.push(`   Lucro final: ${formatCurrencyBRL(result.profit)} (${formatPercent(result.marginPercent, 1)})`);
      lines.push(`   ROI: ${formatPercent(result.roi, 0)}`);
      lines.push('');
    });
  lines.push(`Gerado em ${new Date().toLocaleString('pt-BR')}`);
  return lines.join('\n');
}

function buildPrintableHtml(inputs: CalculatorInputs, results: MarketplaceResult[]) {
  const rows = results
    .slice()
    .sort((left, right) => right.profit - left.profit)
    .map(
      (result) => `
        <tr>
          <td>${result.marketplaceName}</td>
          <td>${result.optionName}</td>
          <td>${formatCurrencyBRL(result.marketplaceFees)}</td>
          <td>${formatCurrencyBRL(result.profit)}</td>
          <td>${formatPercent(result.marginPercent, 1)}</td>
          <td>${formatPercent(result.roi, 0)}</td>
        </tr>
      `,
    )
    .join('');

  return `
    <!DOCTYPE html>
    <html lang="pt-BR">
      <head>
        <meta charset="utf-8" />
        <title>Comparativo ${inputs.productName || 'produto'}</title>
        <style>
          body { font-family: Arial, sans-serif; margin: 32px; color: #111827; }
          h1 { margin: 0 0 8px; font-size: 24px; }
          p { margin: 4px 0; color: #4b5563; }
          table { width: 100%; border-collapse: collapse; margin-top: 24px; }
          th, td { border: 1px solid #e5e7eb; padding: 10px 12px; text-align: left; }
          th { background: #f3f4f6; }
        </style>
      </head>
      <body>
        <h1>Comparativo de Marketplaces</h1>
        <p>${inputs.productName || 'Produto sem nome'}</p>
        <p>Preço: ${formatCurrencyBRL(inputs.salePrice)} · Custo: ${formatCurrencyBRL(inputs.productCost)} · Embalagem: ${formatCurrencyBRL(inputs.packagingCost)} · Imposto: ${formatPercent(inputs.taxPercent, 1)}</p>
        <table>
          <thead>
            <tr>
              <th>Marketplace</th>
              <th>Opção</th>
              <th>Taxas</th>
              <th>Lucro Final</th>
              <th>Margem</th>
              <th>ROI</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </body>
    </html>
  `;
}

function formatInputNumber(value: number) {
  if (!Number.isFinite(value)) return '0';
  return `${value}`;
}

function safeNumber(value: string) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function safePositiveInt(value: string) {
  const parsed = Math.round(Number(value));
  if (!Number.isFinite(parsed) || parsed <= 0) return 1;
  return parsed;
}

function MarketplaceBadge({ marketplaceId, size = 'md' }: { marketplaceId: MarketplaceId; size?: 'sm' | 'md' }) {
  const cls = size === 'sm' ? 'h-6 w-6 rounded-md' : 'h-9 w-9 rounded-xl';
  const pad = size === 'sm' ? 'p-0.5' : 'p-1';

  const logoMap: Partial<Record<MarketplaceId, { src: string; alt: string; bg: string; padCls?: string }>> = {
    mercadolivre: { src: mlLogo, alt: 'Mercado Livre', bg: 'bg-white' },
    shopee: { src: shopeeLogo, alt: 'Shopee', bg: 'bg-white' },
    shein: { src: sheinLogo, alt: 'SHEIN', bg: 'bg-white', padCls: size === 'sm' ? 'p-0.5' : 'p-1.5' },
    amazon: { src: amazonLogo, alt: 'Amazon', bg: 'bg-white', padCls: size === 'sm' ? 'p-0.5' : 'p-1.5' },
    magalu: { src: magaluLogo, alt: 'Magazine Luiza', bg: 'bg-[#0086FF]' },
    tiktok: { src: tiktokLogo, alt: 'TikTok Shop', bg: 'bg-black' },
    kwai: { src: kwaiLogo, alt: 'Kwai Shop', bg: 'bg-white', padCls: size === 'sm' ? 'p-0.5' : 'p-1' },
  };

  const logo = logoMap[marketplaceId];
  if (logo) {
    return <img src={logo.src} alt={logo.alt} className={`${cls} ${logo.bg} object-contain ${logo.padCls ?? pad} shadow-sm`} />;
  }

  const meta = MARKETPLACE_META[marketplaceId];
  return (
    <div className={`flex ${cls} items-center justify-center ${size === 'sm' ? 'text-[8px]' : 'text-[10px]'} font-black tracking-wider text-white shadow-sm`} style={{ backgroundColor: meta.accentColor }}>
      {meta.shortLabel}
    </div>
  );
}

function getMarketplaceSurfaceStyle(marketplaceId: MarketplaceId) {
  const palette: Record<MarketplaceId, { accent: string }> = {
    mercadolivre: { accent: '#FFD60A' },
    amazon: { accent: '#FF9900' },
    shopee: { accent: '#EE4D2D' },
    shein: { accent: '#222222' },
    magalu: { accent: '#0086FF' },
    tiktok: { accent: '#FE2C55' },
    kwai: { accent: '#FF6B2C' },
  };

  return palette[marketplaceId];
}

function BarcodePreview({ code }: { code: string }) {
  const svgRef = useRef<SVGSVGElement | null>(null);

  useEffect(() => {
    if (!svgRef.current) return;
    try {
      JsBarcode(svgRef.current, code, {
        format: code.length === 8 ? 'EAN8' : 'EAN13',
        displayValue: true,
        width: 1.5,
        height: 54,
        margin: 4,
        fontSize: 12,
      });
    } catch {
      svgRef.current.innerHTML = '';
    }
  }, [code]);

  return <svg ref={svgRef} className="w-full max-w-[320px]" />;
}

function ComparisonTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{ value: number; payload: MarketplaceResult }>;
  label?: string;
}) {
  if (!active || !payload || payload.length === 0) return null;
  const row = payload[0].payload;

  return (
    <div className="rounded-2xl border border-border bg-card px-4 py-3 shadow-soft dark:shadow-dark-card">
      <p className="text-[12px] font-semibold text-primary">{label}</p>
      <p className="text-[12px] text-muted">{row.marketplaceName} · {row.optionName}</p>
      <p className="mt-2 text-[13px] font-semibold text-primary">{formatCurrencyBRL(row.profit)}</p>
      <p className="text-[11px] text-muted">{formatPercent(row.marginPercent, 1)} · ROI {formatPercent(row.roi, 0)}</p>
    </div>
  );
}

function SectionCard({
  title,
  subtitle,
  icon: Icon,
  children,
  hideHeader,
}: {
  title: string;
  subtitle?: string;
  icon: typeof Calculator;
  children: React.ReactNode;
  hideHeader?: boolean;
}) {
  return (
    <section className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
      {!hideHeader && (
        <div className="flex items-center gap-3 border-b border-border bg-body px-5 py-4">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[var(--color-brand-primary)] text-white">
            <Icon size={17} />
          </div>
          <div className="min-w-0">
            <h2 className="text-[15px] font-bold tracking-[-0.02em] text-primary">{title}</h2>
            {subtitle ? <p className="mt-0.5 text-[11px] text-muted">{subtitle}</p> : null}
          </div>
        </div>
      )}
      <div className="p-4 sm:p-5">{children}</div>
    </section>
  );
}

function MetricRow({ label, value, hiddenWhenZero }: { label: string; value: number; hiddenWhenZero?: boolean }) {
  if (hiddenWhenZero && Math.abs(value) < 0.0001) return null;
  return (
    <div className="flex items-center justify-between gap-4 py-1.5 text-[12px] [&:not(:last-child)]:border-b [&:not(:last-child)]:border-dashed [&:not(:last-child)]:border-border/60">
      <span className="text-muted">{label}</span>
      <span className="font-medium tabular-nums text-primary">- {formatCurrencyBRL(value)}</span>
    </div>
  );
}

function FittedSingleLine({
  children,
  className,
  minScale = 0.78,
}: {
  children: React.ReactNode;
  className: string;
  minScale?: number;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const textRef = useRef<HTMLSpanElement | null>(null);
  const [scale, setScale] = useState(1);

  useEffect(() => {
    const updateScale = () => {
      if (!containerRef.current || !textRef.current) return;
      const availableWidth = containerRef.current.clientWidth;
      const requiredWidth = textRef.current.scrollWidth;

      if (!availableWidth || !requiredWidth) {
        setScale(1);
        return;
      }

      const nextScale = Math.min(1, Math.max(minScale, availableWidth / requiredWidth));
      setScale((current) => (Math.abs(current - nextScale) < 0.01 ? current : nextScale));
    };

    updateScale();

    const resizeObserver = new ResizeObserver(() => updateScale());
    if (containerRef.current) resizeObserver.observe(containerRef.current);
    if (textRef.current) resizeObserver.observe(textRef.current);

    window.addEventListener('resize', updateScale);
    return () => {
      resizeObserver.disconnect();
      window.removeEventListener('resize', updateScale);
    };
  }, [children, minScale]);

  return (
    <div ref={containerRef} className="min-w-0 overflow-hidden">
      <span
        ref={textRef}
        className={`inline-block whitespace-nowrap ${className}`}
        style={scale < 1 ? { transform: `scale(${scale})`, transformOrigin: 'left center' } : undefined}
      >
        {children}
      </span>
    </div>
  );
}

function formatRateDisplay(result: MarketplaceResult) {
  if (result.marketplaceId === 'shopee') return formatPercent(result.commissionPercent, 2);
  return formatPercent(result.commissionPercent, Number.isInteger(result.commissionPercent) ? 0 : 1);
}

function MarketplaceResultCard({ result }: { result: MarketplaceResult }) {
  const toneClasses: Record<MarketplaceResult['tone'], string> = {
    good: 'bg-success/10 text-success',
    warning: 'bg-warning/15 text-warning',
    negative: 'bg-danger/10 text-danger',
  };
  const feeLabel = result.fixedFeeLabel ?? 'Taxa Fixa';
  const shippingLabel = result.marketplaceId === 'mercadolivre' ? 'Frete' : 'Custo Frete';

  return (
    <div className="rounded-xl border border-border bg-body px-3.5 py-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-[12px] font-bold text-primary">{result.optionName}</p>
            <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold ${toneClasses[result.tone]}`}>
              {result.toneLabel}
            </span>
          </div>
        </div>
        <p className="shrink-0 text-[12px] font-bold tabular-nums text-secondary">{formatRateDisplay(result)}</p>
      </div>

      <div className="mt-2">
        <MetricRow label="Comissão" value={result.commissionAmount} />
        <MetricRow label={feeLabel} value={result.fixedFee} hiddenWhenZero />
        <MetricRow label={shippingLabel} value={result.shippingCost} hiddenWhenZero />
        <MetricRow label="Custo Produto" value={result.productCost} />
        <MetricRow label="Embalagem" value={result.packagingCost} hiddenWhenZero />
        <MetricRow label="Imposto" value={result.taxAmount} hiddenWhenZero />
      </div>

      <div className="mt-3 grid grid-cols-1 gap-2">
        <div className="min-w-0 rounded-lg border border-border bg-card px-3 py-2.5">
          <FittedSingleLine className="text-[10px] font-bold uppercase tracking-tight text-muted" minScale={0.9}>
            {result.profitLabel ?? 'Margem Final'}
          </FittedSingleLine>
          <div className="mt-1">
            <FittedSingleLine className={`text-[12px] font-semibold tabular-nums leading-none tracking-tight ${result.profit >= 0 ? 'text-success' : 'text-danger'}`}>
              {result.marginPercent >= 0 ? '+' : ''}
              {formatPercent(result.marginPercent, 2)}
            </FittedSingleLine>
          </div>
          <div className="mt-1">
            <FittedSingleLine className="text-[18px] font-extrabold tabular-nums leading-none tracking-tight text-primary sm:text-[19px]" minScale={0.75}>
              {formatCurrencyBRL(result.profit)}
            </FittedSingleLine>
          </div>
        </div>

        {result.showRoi === false ? null : (
          <div className="min-w-0 rounded-lg border border-border bg-card px-3 py-2.5">
            <FittedSingleLine className="text-[10px] font-bold uppercase tracking-tight text-muted" minScale={0.9}>
              ROI-Lucro
            </FittedSingleLine>
            <div className="mt-1">
              <FittedSingleLine className="text-[10px] leading-none tracking-tight text-muted" minScale={0.8}>
                Lucro / Investimento
              </FittedSingleLine>
            </div>
            <div className="mt-1">
              <FittedSingleLine className={`text-[17px] font-extrabold tabular-nums leading-none tracking-tight ${result.roi >= 0 ? 'text-primary' : 'text-danger'} sm:text-[18px]`} minScale={0.72}>
                {result.roi >= 0 ? '+' : ''}
                {formatPercent(result.roi, 2)}
              </FittedSingleLine>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="h-3 w-3 rounded-sm" style={{ backgroundColor: color }} />
      <span>{label}</span>
    </div>
  );
}

function SliderCard({
  label,
  value,
  min,
  max,
  step,
  displayValue,
  delta,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  displayValue: string;
  delta: number;
  onChange: (value: number) => void;
}) {
  return (
    <div className="rounded-xl border border-border bg-card px-4 py-3.5">
      <div className="mb-2.5 flex items-center justify-between gap-3">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-muted">{label}</p>
        <div className="flex items-baseline gap-2">
          <p className="text-[18px] font-bold tabular-nums tracking-tight text-primary">{displayValue}</p>
          {Math.abs(delta) > 0.001 ? <span className={`rounded-md px-1.5 py-0.5 text-[10px] font-bold ${delta > 0 ? 'bg-success text-white' : 'bg-danger text-white'}`}>{delta > 0 ? '+' : ''}{Number.isInteger(delta) ? delta.toFixed(0) : delta.toFixed(2)}</span> : null}
        </div>
      </div>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(event) => onChange(Number(event.target.value))} className="w-full accent-[var(--color-brand-primary)]" />
      <div className="mt-1.5 flex items-center justify-between text-[10px] text-muted">
        <span>{Number.isInteger(min) ? formatCurrencyBRL(min) : min.toFixed(1)}</span>
        <span>{Number.isInteger(max) ? formatCurrencyBRL(max) : max.toFixed(1)}</span>
      </div>
    </div>
  );
}

function TaxTile({ label, rate, value }: { label: string; rate: number; value: number }) {
  return (
    <div className="rounded-xl border border-border bg-card px-3.5 py-3">
      <div className="flex items-center justify-between">
        <p className="text-[11px] font-bold uppercase tracking-wider text-muted">{label}</p>
        <p className="rounded-md bg-body px-2 py-0.5 text-[10px] font-semibold tabular-nums text-secondary">{formatPercent(rate, 2)}</p>
      </div>
      <p className="mt-1.5 text-[18px] font-bold tabular-nums tracking-tight text-primary">{formatCurrencyBRL(value)}</p>
    </div>
  );
}

function DescriptionOutput({
  response,
  showToast,
}: {
  response: DescriptionResponse;
  showToast: (message: string, type?: 'success' | 'error' | 'info' | 'warning') => void;
}) {
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const copyVariation = async (variation: DescriptionVariation) => {
    const text = `${variation.title}\n\n${variation.description}\n\n✅ Benefícios:\n${variation.bulletPoints.map((item) => `• ${item}`).join('\n')}\n\n🏷️ Tags: ${variation.tags.join(', ')}`;
    await navigator.clipboard.writeText(text);
    setCopiedId(variation.id);
    showToast('Descrição copiada para a área de transferência.', 'success');
    window.setTimeout(() => setCopiedId(null), 1800);
  };

  return (
    <div className="space-y-3">
      {response.recommendation ? (
        <div className="rounded-xl border border-border bg-body px-3.5 py-3">
          <p className="text-[10px] font-bold uppercase tracking-wider text-muted">Recomendação</p>
          <p className="mt-1.5 text-[12px] leading-relaxed text-secondary">{response.recommendation}</p>
        </div>
      ) : null}

      <div className="grid gap-3">
        {response.variations.map((variation) => (
          <article key={variation.id} className="overflow-hidden rounded-xl border border-border bg-card">
            <div className="flex items-start justify-between gap-3 border-b border-border bg-body px-3.5 py-3">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--color-brand-primary)]">{variation.angle}</p>
                <h3 className="mt-1 text-[14px] font-bold tracking-tight text-primary">{variation.title}</h3>
              </div>
              <span className="shrink-0 rounded-md bg-card px-2 py-1 text-center text-[11px] font-bold tabular-nums text-primary">{variation.seoScore}/10</span>
            </div>

            <div className="px-3.5 py-3">
              <p className="text-[12px] leading-relaxed text-secondary">{variation.description}</p>

              <ul className="mt-3 space-y-1.5 text-[11px] text-secondary">
                {variation.bulletPoints.map((item) => (
                  <li key={item} className="flex items-start gap-1.5">
                    <Check size={12} className="mt-0.5 shrink-0 text-success" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>

              <div className="mt-3 flex flex-wrap gap-1.5">
                {variation.tags.map((tag) => (
                  <span key={tag} className="rounded-md bg-body px-2 py-0.5 text-[10px] font-medium text-muted">
                    #{tag}
                  </span>
                ))}
              </div>
            </div>

            <button
              type="button"
              onClick={() => void copyVariation(variation)}
              className="flex w-full items-center justify-center gap-2 border-t border-border bg-body px-4 py-2.5 text-[11px] font-bold text-secondary transition-colors hover:bg-[var(--color-brand-primary)]/10 hover:text-[var(--color-brand-primary)]"
            >
              {copiedId === variation.id ? <Check size={16} /> : <Copy size={16} />}
              {copiedId === variation.id ? 'Copiado' : 'Copiar variação'}
            </button>
          </article>
        ))}
      </div>
    </div>
  );
}

function MarketplacePanel({
  marketplaceId,
  configs,
  setConfigs,
  results,
  inputs,
}: {
  marketplaceId: MarketplaceId;
  configs: MarketplaceConfigMap;
  setConfigs: Dispatch<SetStateAction<MarketplaceConfigMap>>;
  results: MarketplaceResult[];
  inputs: CalculatorInputs;
}) {
  const meta = MARKETPLACE_META[marketplaceId];
  const commonInputClass = 'h-8 w-full rounded-lg border border-border bg-body px-2.5 py-1 text-[12px] text-primary outline-none transition-colors focus:border-[var(--color-brand-primary)] focus:ring-1 focus:ring-[var(--color-brand-primary)]/20';
  const surfaceStyle = getMarketplaceSurfaceStyle(marketplaceId);
  const [showLinks, setShowLinks] = useState(false);
  const hasResults = inputs.salePrice > 0 && results.length > 0;
  const supermarketFee = marketplaceId === 'mercadolivre' && configs.mercadolivre.supermarket
    ? getMercadoLivreSupermarketFee(inputs.salePrice * inputs.kitQuantity)
    : null;

  const updateConfig = (key: string, value: unknown) => {
    setConfigs((current) => ({
      ...current,
      [marketplaceId]: {
        ...current[marketplaceId],
        [key]: value,
      },
    }) as MarketplaceConfigMap);
  };

  return (
    <article className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
      <div className="flex items-center justify-between px-5 py-3" style={{ backgroundColor: surfaceStyle.accent }}>
        <div className="flex items-center gap-3">
          <MarketplaceBadge marketplaceId={marketplaceId} />
          <h3 className={`text-[15px] font-bold tracking-tight ${['#222222', '#111111'].includes(surfaceStyle.accent) ? 'text-white' : 'text-gray-900'}`}>{meta.name}</h3>
        </div>
        <a
          href={meta.rulesUrl}
          target="_blank"
          rel="noreferrer"
          className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[11px] font-semibold transition-colors ${['#222222', '#111111'].includes(surfaceStyle.accent) ? 'border-white/20 text-white/80 hover:bg-white/10 hover:text-white' : 'border-black/10 text-gray-800/70 hover:bg-black/5 hover:text-gray-900'}`}
        >
          Regras
          <ExternalLink size={12} />
        </a>
      </div>

      <div className="space-y-3 px-4 py-3">
        <div className="grid gap-2 sm:grid-cols-2">
          {marketplaceId === 'mercadolivre' ? (
            <>
              <label className="space-y-1">
                <span className="text-[11px] font-semibold text-muted">MLB(U) *</span>
                <input className={commonInputClass} value={configs.mercadolivre.url} onChange={(event) => updateConfig('url', event.target.value)} placeholder="Cole o link do anúncio aqui" />
                <p className="text-[10px] text-muted">Cole o link do anúncio para buscar as taxas reais</p>
              </label>
              <label className="space-y-1">
                <span className="text-[11px] font-semibold text-muted">Clássico %</span>
                <input type="number" step="0.1" className={commonInputClass} value={formatInputNumber(configs.mercadolivre.classicPercent)} onChange={(event) => updateConfig('classicPercent', safeNumber(event.target.value))} />
              </label>
              <label className="space-y-1">
                <span className="text-[11px] font-semibold text-muted">Premium %</span>
                <input type="number" step="0.1" className={commonInputClass} value={formatInputNumber(configs.mercadolivre.premiumPercent)} onChange={(event) => updateConfig('premiumPercent', safeNumber(event.target.value))} />
              </label>
              <label className="flex cursor-pointer items-center justify-between gap-3 rounded-lg border border-border px-3 py-2 transition-colors hover:bg-body">
                <span className="text-[11px] font-semibold text-primary">Supermercado (Full Super)</span>
                <input type="checkbox" checked={configs.mercadolivre.supermarket} onChange={(event) => updateConfig('supermarket', event.target.checked)} className="h-3.5 w-3.5 rounded accent-[var(--color-brand-primary)]" />
              </label>
              <label className="space-y-1">
                <span className="text-[11px] font-semibold text-muted">Custo Frete R$</span>
                <input type="number" step="0.01" className={commonInputClass} value={formatInputNumber(configs.mercadolivre.shippingCost)} onChange={(event) => updateConfig('shippingCost', safeNumber(event.target.value))} />
                <p className="text-[10px] text-muted">Consulte a tabela oficial por peso/preço</p>
              </label>
            </>
          ) : null}
          {marketplaceId === 'amazon' ? (
            <>
              <label className="space-y-1">
                <span className="text-[11px] font-semibold text-muted">Perfil do Vendedor</span>
                <select
                  className={commonInputClass}
                  value={configs.amazon.sellerProfile === 'professional' || configs.amazon.sellerProfile === 'individual' ? 'default' : configs.amazon.sellerProfile}
                  onChange={(event) => updateConfig('sellerProfile', event.target.value as MarketplaceConfigMap['amazon']['sellerProfile'])}
                >
                  {AMAZON_PROFILE_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </label>
              <label className="space-y-1">
                <span className="text-[11px] font-semibold text-muted">ASIN *</span>
                <input className={commonInputClass} value={configs.amazon.url} onChange={(event) => updateConfig('url', event.target.value)} placeholder="Cole o link do anúncio aqui" />
                <p className="text-[10px] text-muted">Cole o link do anúncio para buscar as taxas reais</p>
              </label>
              <label className="space-y-1">
                <span className="text-[11px] font-semibold text-muted">% Comissão (ReferralFee)</span>
                <input type="number" step="0.1" className={commonInputClass} value={formatInputNumber(configs.amazon.referralFeePercent)} onChange={(event) => updateConfig('referralFeePercent', safeNumber(event.target.value))} />
              </label>
              <label className="space-y-1">
                <span className="text-[11px] font-semibold text-muted">Custo Logístico DBA R$</span>
                <input type="number" step="0.01" className={commonInputClass} value={formatInputNumber(configs.amazon.dbaCost)} onChange={(event) => updateConfig('dbaCost', safeNumber(event.target.value))} />
              </label>
              <label className="space-y-1">
                <span className="text-[11px] font-semibold text-muted">Taxa FBA R$ (fulfillment)</span>
                <input type="number" step="0.01" className={commonInputClass} value={formatInputNumber(configs.amazon.fbaCost)} onChange={(event) => updateConfig('fbaCost', safeNumber(event.target.value))} />
              </label>
            </>
          ) : null}
          {marketplaceId === 'shopee' ? (
            <>
              <label className="space-y-1">
                <span className="text-[11px] font-semibold text-muted">Tipo de Conta</span>
                <select className={commonInputClass} value={configs.shopee.accountType} onChange={(event) => updateConfig('accountType', event.target.value as 'cnpj' | 'cpf')}>
                  <option value="cnpj">CNPJ</option>
                  <option value="cpf">CPF</option>
                </select>
              </label>
            </>
          ) : null}
          {marketplaceId === 'shein' ? (
            <>
              <label className="space-y-1">
                <span className="text-[11px] font-semibold text-muted">Padrão %</span>
                <input type="number" step="0.1" className={commonInputClass} value={formatInputNumber(configs.shein.standardPercent)} onChange={(event) => updateConfig('standardPercent', safeNumber(event.target.value))} />
              </label>
              <label className="space-y-1">
                <span className="text-[11px] font-semibold text-muted">Taxa Fixa R$</span>
                <input type="number" step="0.01" className={commonInputClass} value={formatInputNumber(configs.shein.fixedFee)} onChange={(event) => updateConfig('fixedFee', safeNumber(event.target.value))} />
              </label>
              <label className="space-y-1">
                <span className="text-[11px] font-semibold text-muted">Custo Frete R$</span>
                <input type="number" step="0.01" className={commonInputClass} value={formatInputNumber(configs.shein.shippingCost)} onChange={(event) => updateConfig('shippingCost', safeNumber(event.target.value))} />
              </label>
            </>
          ) : null}
          {marketplaceId === 'magalu' ? (
            <>
              <label className="space-y-1">
                <span className="text-[11px] font-semibold text-muted">Padrão %</span>
                <input type="number" step="0.1" className={commonInputClass} value={formatInputNumber(configs.magalu.standardPercent)} onChange={(event) => updateConfig('standardPercent', safeNumber(event.target.value))} />
              </label>
              <label className="space-y-1">
                <span className="text-[11px] font-semibold text-muted">Taxa Fixa R$</span>
                <input type="number" step="0.01" className={commonInputClass} value={formatInputNumber(configs.magalu.fixedFee)} onChange={(event) => updateConfig('fixedFee', safeNumber(event.target.value))} />
              </label>
              <label className="space-y-1">
                <span className="text-[11px] font-semibold text-muted">Custo Frete R$</span>
                <input type="number" step="0.01" className={commonInputClass} value={formatInputNumber(configs.magalu.shippingCost)} onChange={(event) => updateConfig('shippingCost', safeNumber(event.target.value))} />
              </label>
            </>
          ) : null}
          {marketplaceId === 'tiktok' ? (
            <>
              <label className="space-y-1">
                <span className="text-[11px] font-semibold text-muted">Padrão %</span>
                <input type="number" step="0.1" className={commonInputClass} value={formatInputNumber(configs.tiktok.standardPercent)} onChange={(event) => updateConfig('standardPercent', safeNumber(event.target.value))} />
              </label>
              <label className="space-y-1">
                <span className="text-[11px] font-semibold text-muted">Afiliado %</span>
                <input type="number" step="0.1" className={commonInputClass} value={formatInputNumber(configs.tiktok.affiliatePercent)} onChange={(event) => updateConfig('affiliatePercent', safeNumber(event.target.value))} />
              </label>
              <label className="space-y-1">
                <span className="text-[11px] font-semibold text-muted">Taxa Fixa R$</span>
                <input type="number" step="0.01" className={commonInputClass} value={formatInputNumber(configs.tiktok.fixedFee)} onChange={(event) => updateConfig('fixedFee', safeNumber(event.target.value))} />
              </label>
              <label className="space-y-1">
                <span className="text-[11px] font-semibold text-muted">Custo Frete R$</span>
                <input type="number" step="0.01" className={commonInputClass} value={formatInputNumber(configs.tiktok.shippingCost)} onChange={(event) => updateConfig('shippingCost', safeNumber(event.target.value))} />
              </label>
            </>
          ) : null}
          {marketplaceId === 'kwai' ? (
            <>
              <label className="space-y-1">
                <span className="text-[11px] font-semibold text-muted">Padrão %</span>
                <input type="number" step="0.1" className={commonInputClass} value={formatInputNumber(configs.kwai.standardPercent)} onChange={(event) => updateConfig('standardPercent', safeNumber(event.target.value))} />
              </label>
              <label className="space-y-1">
                <span className="text-[11px] font-semibold text-muted">Novo Vendedor (45 dias) %</span>
                <input type="number" step="0.1" className={commonInputClass} value={formatInputNumber(configs.kwai.newSellerPercent)} onChange={(event) => updateConfig('newSellerPercent', safeNumber(event.target.value))} />
              </label>
              <label className="space-y-1">
                <span className="text-[11px] font-semibold text-muted">Taxa Fixa R$</span>
                <input type="number" step="0.01" className={commonInputClass} value={formatInputNumber(configs.kwai.fixedFee)} onChange={(event) => updateConfig('fixedFee', safeNumber(event.target.value))} />
              </label>
              <label className="space-y-1">
                <span className="text-[11px] font-semibold text-muted">Custo Frete R$</span>
                <input type="number" step="0.01" className={commonInputClass} value={formatInputNumber(configs.kwai.shippingCost)} onChange={(event) => updateConfig('shippingCost', safeNumber(event.target.value))} />
              </label>
            </>
          ) : null}
        </div>

        {supermarketFee ? (
          <p className="text-[11px] text-muted">
            <strong className="text-primary">Taxa Supermercado:</strong> R$ {supermarketFee.amount.toFixed(2)} ({supermarketFee.label})
          </p>
        ) : null}

        {hasResults ? (
          <div className="grid gap-2 xl:grid-cols-2">
            {results.map((result) => (
              <MarketplaceResultCard key={result.id} result={result} />
            ))}
          </div>
        ) : null}

        <label className="space-y-1">
          <span className="text-[11px] font-semibold text-muted">Antecipação (%)</span>
          <input
            type="number"
            step="0.1"
            className={commonInputClass}
            value={formatInputNumber(configs[marketplaceId].advancePercent)}
            onChange={(event) => updateConfig('advancePercent', safeNumber(event.target.value))}
            placeholder="0"
          />
          <p className="text-[10px] text-muted">Taxa cobrada ao antecipar o recebimento</p>
        </label>

        {HELP_LINK_PANEL_IDS.has(marketplaceId) ? (
          <div className="space-y-2">
            <button
              type="button"
              onClick={() => setShowLinks((current) => !current)}
              className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-[11px] font-semibold text-muted transition-colors hover:bg-body hover:text-primary"
            >
              <ExternalLink size={13} />
              {showLinks ? 'Ocultar links úteis' : 'Ver links úteis'}
            </button>
            {showLinks ? (
              <div className="rounded-lg border border-border bg-body p-3">
                <div className="space-y-2">
                  {meta.helpLinks.map((link) => (
                    <a key={link.url} href={link.url} target="_blank" rel="noreferrer" className="flex items-center justify-between gap-3 text-[11px] text-primary transition-colors hover:text-[var(--color-brand-primary)]">
                      <span>{link.label}</span>
                      <ExternalLink size={12} />
                    </a>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>

    </article>
  );
}

export default function WhatIfAnalysis() {
  const { showToast } = useToast();
  const [activeTab, setActiveTab] = useState<CalculatorTab>('taxes');
  const [viewMode, setViewMode] = useState<ComparisonViewMode>('cards');
  const [inputs, setInputs] = useState<CalculatorInputs>(() => createDefaultInputs());
  const [marketConfigs, setMarketConfigs] = useState<MarketplaceConfigMap>(() => createDefaultMarketplaceConfigs());
  const [visibleMarketplaces, setVisibleMarketplaces] = useState<MarketplaceId[]>(() => readStoredVisibleMarketplaces());
  const [history, setHistory] = useState<CalculatorHistoryEntry[]>(() => readStoredHistory());
  const [showWhatIf, setShowWhatIf] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [descriptionForm, setDescriptionForm] = useState<DescriptionFormState>(DEFAULT_DESCRIPTION_FORM);
  const [descriptionLoading, setDescriptionLoading] = useState(false);
  const [descriptionResult, setDescriptionResult] = useState<DescriptionResponse | null>(null);
  const [eanType, setEanType] = useState<'EAN-13' | 'EAN-8'>('EAN-13');
  const [eanQuantity, setEanQuantity] = useState(1);
  const [eanPrefix, setEanPrefix] = useState(BRAZILIAN_PREFIX);
  const [eanValidationInput, setEanValidationInput] = useState('');
  const [generatedCodes, setGeneratedCodes] = useState<GeneratedBarcode[]>([]);
  const [ncmQuery, setNcmQuery] = useState('');
  const [ncmState, setNcmState] = useState('SP');
  const [ncmSalePrice, setNcmSalePrice] = useState(0);
  const [ncmMatches, setNcmMatches] = useState<NcmMatch[]>([]);
  const [selectedNcm, setSelectedNcm] = useState<NcmMatch | null>(null);
  const [whatIf, setWhatIf] = useState<WhatIfState>({ salePrice: 0, productCost: 0, taxPercent: 0 });
  const historySaveTimer = useRef<number | null>(null);
  const exportAnchorRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    localStorage.setItem(CALCULATOR_VISIBLE_MARKETS_KEY, JSON.stringify(visibleMarketplaces));
  }, [visibleMarketplaces]);

  useEffect(() => {
    localStorage.setItem(CALCULATOR_HISTORY_KEY, JSON.stringify(history.slice(0, 10)));
  }, [history]);

  useEffect(() => {
    setWhatIf({ salePrice: inputs.salePrice, productCost: inputs.productCost, taxPercent: inputs.taxPercent });
  }, [inputs.salePrice, inputs.productCost, inputs.taxPercent]);

  useEffect(() => {
    if (historySaveTimer.current) window.clearTimeout(historySaveTimer.current);
    if (inputs.salePrice <= 0) return;

    historySaveTimer.current = window.setTimeout(() => {
      const entry = buildHistoryEntry(inputs, marketConfigs);
      setHistory((current) => (dedupeHistoryEntry(current, entry) ? current : [entry, ...current].slice(0, 10)));
    }, 1200);

    return () => {
      if (historySaveTimer.current) window.clearTimeout(historySaveTimer.current);
    };
  }, [inputs, marketConfigs]);

  useEffect(() => {
    if (!showFilters && !showExportMenu) return;
    const handlePointer = (event: MouseEvent) => {
      if (!exportAnchorRef.current) return;
      if (exportAnchorRef.current.contains(event.target as Node)) return;
      setShowFilters(false);
      setShowExportMenu(false);
    };

    document.addEventListener('mousedown', handlePointer);
    return () => document.removeEventListener('mousedown', handlePointer);
  }, [showFilters, showExportMenu]);

  useEffect(() => {
    if (!ncmQuery.trim()) {
      setNcmMatches([]);
      setSelectedNcm(null);
      return;
    }

    const timer = window.setTimeout(() => {
      const matches = searchNcmDatabase(ncmQuery);
      setNcmMatches(matches);
      setSelectedNcm(matches[0] ?? null);
    }, 250);

    return () => window.clearTimeout(timer);
  }, [ncmQuery]);

  const markup = useMemo(() => calculateMarkupSummary(inputs), [inputs]);
  const activeInputs = useMemo<CalculatorInputs>(() => (showWhatIf ? { ...inputs, salePrice: whatIf.salePrice, productCost: whatIf.productCost, taxPercent: whatIf.taxPercent } : inputs), [inputs, showWhatIf, whatIf]);
  const activeResults = useMemo(() => calculateMarketplaceResults(activeInputs, marketConfigs), [activeInputs, marketConfigs]);
  const visibleResults = useMemo(() => activeResults.filter((result) => visibleMarketplaces.includes(result.marketplaceId)), [activeResults, visibleMarketplaces]);
  const groupedResults = useMemo(() => {
    const groups = new Map<MarketplaceId, MarketplaceResult[]>();
    for (const result of visibleResults) {
      const current = groups.get(result.marketplaceId) ?? [];
      current.push(result);
      groups.set(result.marketplaceId, current);
    }
    return groups;
  }, [visibleResults]);
  const compactRows = useMemo(() => visibleResults.slice().sort((left, right) => right.profit - left.profit), [visibleResults]);
  const chartData = useMemo(() => visibleResults.slice().sort((left, right) => right.profit - left.profit).map((result, index) => ({
    ...result,
    shortName: result.marketplaceName.split(' ')[0].slice(0, 8),
    fill: result.profit < 0 ? 'var(--color-danger)' : result.profit < 5 ? 'var(--color-warning)' : index === 0 ? 'var(--color-success)' : 'var(--color-brand-primary)',
  })), [visibleResults]);
  const chartDelta = chartData.length > 1 ? chartData[0].profit - chartData[chartData.length - 1].profit : 0;
  const whatIfImpact = useMemo(() => calculateWhatIfImpact(inputs, whatIf), [inputs, whatIf]);
  const ncmEstimate = useMemo<NcmEstimate | null>(() => estimateNcmTaxes(selectedNcm, ncmState, ncmSalePrice), [selectedNcm, ncmState, ncmSalePrice]);
  const commonInputClass = 'h-8 w-full rounded-lg border border-border bg-body px-2.5 py-1 text-[12px] text-primary outline-none transition-colors focus:border-[var(--color-brand-primary)] focus:ring-1 focus:ring-[var(--color-brand-primary)]/20';

  const updateInputs = <T extends keyof CalculatorInputs>(key: T, value: CalculatorInputs[T]) => {
    setInputs((current) => ({ ...current, [key]: value }));
  };

  const toggleMarketplace = (marketplaceId: MarketplaceId) => {
    setVisibleMarketplaces((current) => {
      if (current.includes(marketplaceId)) {
        const next = current.filter((item) => item !== marketplaceId);
        return next.length > 0 ? next : current;
      }
      return [...current, marketplaceId];
    });
  };

  const copyComparison = async () => {
    await navigator.clipboard.writeText(buildClipboardPayload(compactRows, inputs.productName));
    setShowExportMenu(false);
    showToast('Comparativo copiado para a área de transferência.', 'success');
  };

  const exportPdf = () => {
    const popup = window.open('', '_blank', 'width=1280,height=900');
    if (!popup) {
      showToast('Não foi possível abrir a janela de impressão.', 'error');
      return;
    }
    popup.document.write(buildPrintableHtml(inputs, compactRows));
    popup.document.close();
    popup.focus();
    popup.print();
    setShowExportMenu(false);
    showToast('Visualização pronta para salvar em PDF.', 'success');
  };

  const loadHistoryEntry = (entry: CalculatorHistoryEntry) => {
    setInputs(entry.inputs);
    setMarketConfigs(cloneMarketplaceConfigs(entry.configs));
    setShowWhatIf(false);
    setWhatIf({ salePrice: entry.inputs.salePrice, productCost: entry.inputs.productCost, taxPercent: entry.inputs.taxPercent });
    showToast('Cálculo recuperado do histórico.', 'success');
  };

  const extractProductFromLink = () => {
    const name = parseProductNameFromUrl(inputs.productUrl);
    if (!name) {
      showToast('Não consegui extrair um nome útil desse link.', 'warning');
      return;
    }
    setInputs((current) => ({ ...current, productName: current.productName.trim() || name }));
    showToast('Nome do produto extraído do link.', 'success');
  };

  const resetWhatIf = () => setWhatIf({ salePrice: inputs.salePrice, productCost: inputs.productCost, taxPercent: inputs.taxPercent });

  const generateDescriptions = async () => {
    if (!descriptionForm.productName.trim()) {
      showToast('Digite o nome do produto para gerar as descrições.', 'warning');
      return;
    }

    setDescriptionLoading(true);
    setDescriptionResult(null);
    try {
      const response = await agentApi.generateMarketplaceDescriptions({
        product_name: descriptionForm.productName.trim(),
        marketplace: descriptionForm.marketplace,
        category: descriptionForm.category.trim(),
        keywords: descriptionForm.keywords.trim(),
        features: descriptionForm.features.trim(),
      });
      if (!response.success || !response.data) throw new Error(response.error || 'Falha ao gerar descrições.');
      setDescriptionResult(response.data);
      showToast('3 variações geradas com sucesso.', 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Falha ao gerar descrições.', 'error');
    } finally {
      setDescriptionLoading(false);
    }
  };

  const handleGenerateBarcode = () => {
    const amount = Math.min(Math.max(eanQuantity, 1), 20);
    const created: GeneratedBarcode[] = Array.from({ length: amount }, () => ({
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      code: generateEanCode(eanType, eanPrefix),
      type: eanType,
      createdAt: new Date().toISOString(),
    }));
    setGeneratedCodes((current) => [...created, ...current].slice(0, 50));
    showToast(`${amount} código(s) gerado(s).`, 'success');
  };

  const handleValidateEan = () => {
    const result = validateOrCompleteEan(eanValidationInput);
    if (!result.valid && !result.completed) {
      showToast(result.message, 'warning');
      return;
    }
    if (result.completed) {
      const completedCode = result.completed;
      const generatedType: GeneratedBarcode['type'] = completedCode.length === 13 ? 'EAN-13' : 'EAN-8';
      setGeneratedCodes((current) => [
        {
          id: `${Date.now()}`,
          code: completedCode,
          type: generatedType,
          createdAt: new Date().toISOString(),
        },
        ...current,
      ].slice(0, 50));
      showToast(result.message, 'success');
      return;
    }
    showToast(result.message, result.valid ? 'success' : 'warning');
  };

  const handlePrintBarcode = (code: string) => {
    const popup = window.open('', '_blank', 'width=640,height=480');
    if (!popup) {
      showToast('Não foi possível abrir a janela de impressão.', 'error');
      return;
    }
    popup.document.write(`<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8" /><title>Código ${code}</title><style>body{display:flex;min-height:100vh;align-items:center;justify-content:center;margin:0;font-family:Arial,sans-serif}.wrap{text-align:center}svg{max-width:320px}</style><script src="https://cdn.jsdelivr.net/npm/jsbarcode@3.11.6/dist/JsBarcode.all.min.js"></script></head><body><div class="wrap"><svg id="barcode"></svg><p>${code}</p></div><script>JsBarcode("#barcode","${code}",{format:"${code.length === 8 ? 'EAN8' : 'EAN13'}",displayValue:true,width:1.5,height:60,margin:6});window.print();</script></body></html>`);
    popup.document.close();
  };

  return (
    <div className="min-h-screen bg-body p-4 sm:p-6">
      <div className="mx-auto flex max-w-[1080px] flex-col gap-4">
        <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--color-brand-primary)] text-white">
                <Calculator size={16} />
              </div>
              <h1 className="text-[22px] font-extrabold tracking-tight text-primary">Calculadora</h1>
            </div>
            <p className="mt-1 text-[12px] text-muted">Taxas de marketplace, códigos EAN e NCM em um só lugar.</p>
          </div>
        </header>

        <nav className="flex gap-1 rounded-xl border border-border bg-card p-1">
          {TAB_ITEMS.map((tab) => {
            const Icon = tab.icon;
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-[12px] font-semibold transition-all ${
                  active ? 'bg-[var(--color-brand-primary)] text-white shadow-sm' : 'text-muted hover:bg-body hover:text-primary'
                }`}
              >
                <Icon size={14} />
                {tab.label}
              </button>
            );
          })}
        </nav>

        {activeTab === 'taxes' ? (
          <>
            <SectionCard title="Calcule suas Taxas" subtitle="Insira o preço de venda e o imposto para comparar os marketplaces." icon={Calculator}>
              <div className="grid gap-4 lg:grid-cols-[1fr_180px]">
                <div className="space-y-3">
                  <div className="grid gap-2.5 sm:grid-cols-2">
                    <label className="space-y-1 sm:col-span-2">
                      <span className="text-[11px] font-semibold text-muted">Nome do Produto</span>
                      <input className={commonInputClass} value={inputs.productName} onChange={(event) => updateInputs('productName', event.target.value)} placeholder="Ex: Camiseta Polo ou cole o link do produto..." />
                    </label>
                    <label className="space-y-1 sm:col-span-2">
                      <span className="text-[11px] font-semibold text-muted">Link do produto</span>
                      <div className="flex gap-2">
                        <input className={commonInputClass} value={inputs.productUrl} onChange={(event) => updateInputs('productUrl', event.target.value)} placeholder="Cole o link do produto aqui" />
                        <button type="button" onClick={extractProductFromLink} className="inline-flex shrink-0 items-center justify-center rounded-lg border border-border px-3 text-muted transition-colors hover:border-[var(--color-brand-primary)] hover:text-[var(--color-brand-primary)]">
                          <Link2 size={14} />
                        </button>
                      </div>
                    </label>
                  </div>
                  <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
                    <label className="space-y-1">
                      <span className="text-[11px] font-semibold text-muted">Preço de Venda</span>
                      <input type="number" step="0.01" className={commonInputClass} value={formatInputNumber(inputs.salePrice)} onChange={(event) => updateInputs('salePrice', safeNumber(event.target.value))} placeholder="0,00" />
                    </label>
                    <label className="space-y-1">
                      <span className="text-[11px] font-semibold text-muted">Custo Produto</span>
                      <input type="number" step="0.01" className={commonInputClass} value={formatInputNumber(inputs.productCost)} onChange={(event) => updateInputs('productCost', safeNumber(event.target.value))} placeholder="0,00" />
                    </label>
                    <label className="space-y-1">
                      <span className="text-[11px] font-semibold text-muted">Embalagem</span>
                      <input type="number" step="0.01" className={commonInputClass} value={formatInputNumber(inputs.packagingCost)} onChange={(event) => updateInputs('packagingCost', safeNumber(event.target.value))} placeholder="0,00" />
                    </label>
                    <label className="space-y-1">
                      <span className="text-[11px] font-semibold text-muted">Kit (Qtd)</span>
                      <input type="number" step="1" min="1" className={commonInputClass} value={`${inputs.kitQuantity}`} onChange={(event) => updateInputs('kitQuantity', safePositiveInt(event.target.value))} />
                    </label>
                    <label className="space-y-1">
                      <span className="text-[11px] font-semibold text-muted">Imposto (%)</span>
                      <input type="number" step="0.1" className={commonInputClass} value={formatInputNumber(inputs.taxPercent)} onChange={(event) => updateInputs('taxPercent', safeNumber(event.target.value))} placeholder="0" />
                    </label>
                    <label className="space-y-1">
                      <span className="text-[11px] font-semibold text-muted">Categoria</span>
                      <select className={commonInputClass} value={inputs.categoryId} onChange={(event) => updateInputs('categoryId', event.target.value)}>
                        {CATEGORY_OPTIONS.map((option) => (
                          <option key={option.id} value={option.id}>{option.label}</option>
                        ))}
                      </select>
                    </label>
                  </div>
                  <div className="rounded-xl border border-border bg-body px-3.5 py-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-[11px] font-semibold text-primary">Selecione a categoria para taxas precisas:</span>
                      <span className="text-[11px] text-muted">Usando taxas padrão</span>
                    </div>
                    <p className="mt-2 text-[11px] text-muted">💡 Dica: cole um link do produto para detectar automaticamente ou escolha acima.</p>
                  </div>
                  <div className="max-w-[280px]">
                    <div className="space-y-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[11px] font-semibold text-muted">Lucro Desejado</span>
                        <div className="inline-flex rounded-md border border-border bg-body p-0.5">
                          <button type="button" onClick={() => updateInputs('desiredProfitMode', 'value')} className={`rounded px-2 py-0.5 text-[10px] font-bold transition-colors ${inputs.desiredProfitMode === 'value' ? 'bg-[var(--color-brand-primary)] text-white' : 'text-muted'}`}>R$</button>
                          <button type="button" onClick={() => updateInputs('desiredProfitMode', 'percent')} className={`rounded px-2 py-0.5 text-[10px] font-bold transition-colors ${inputs.desiredProfitMode === 'percent' ? 'bg-[var(--color-brand-primary)] text-white' : 'text-muted'}`}>%</button>
                        </div>
                      </div>
                      <input type="number" step="0.1" className={commonInputClass} value={formatInputNumber(inputs.desiredProfit)} onChange={(event) => updateInputs('desiredProfit', safeNumber(event.target.value))} placeholder={inputs.desiredProfitMode === 'value' ? '0,00' : '0'} />
                    </div>
                  </div>
                </div>

                <div className="flex flex-col gap-3">
                  <div className="flex flex-1 flex-col items-center justify-center rounded-xl border border-border bg-body px-4 py-5 text-center">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-muted">Markup</p>
                    {markup ? (
                      <>
                        <p className="mt-1 text-[28px] font-extrabold tabular-nums tracking-tighter text-primary">+{markup.percent.toFixed(0)}%</p>
                        <p className="text-[11px] font-medium text-muted">{markup.multiplier.toFixed(2)}x</p>
                        <p className="mt-1 text-[13px] font-bold text-[var(--color-brand-primary)]">+{formatCurrencyBRL(markup.gain)}</p>
                      </>
                    ) : (
                      <p className="mt-2 text-[11px] text-muted">Preencha custo e preço</p>
                    )}
                  </div>
                </div>
              </div>
            </SectionCard>
            <SectionCard title="Comparativo de Marketplaces" subtitle="Visualize em cards, tabela ou gráfico." icon={BarChart3} hideHeader>
              <div ref={exportAnchorRef as MutableRefObject<HTMLDivElement | null>} className="relative mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex gap-1 rounded-lg border border-border bg-body p-0.5">
                  {VIEW_ITEMS.map((item) => {
                    const Icon = item.icon;
                    const active = viewMode === item.id;
                    return (
                      <button key={item.id} type="button" onClick={() => setViewMode(item.id)} className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[11px] font-semibold transition-all ${active ? 'bg-card text-primary shadow-sm' : 'text-muted hover:text-primary'}`}>
                        <Icon size={13} />
                        {item.label}
                      </button>
                    );
                  })}
                </div>

                <div className="flex flex-wrap gap-1.5">
                  <button type="button" onClick={() => { setShowWhatIf((current) => !current); if (showFilters) setShowFilters(false); if (showExportMenu) setShowExportMenu(false); }} className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[11px] font-semibold transition-colors ${showWhatIf ? 'border-[var(--color-brand-primary)] bg-[var(--color-brand-primary)] text-white' : 'border-border text-muted hover:text-primary'}`}>
                    <Sparkles size={13} />
                    What-If
                  </button>
                  <button type="button" onClick={() => { setShowExportMenu((current) => !current); setShowFilters(false); }} className="inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-[11px] font-semibold text-muted transition-colors hover:text-primary">
                    <Download size={13} />
                    Exportar
                  </button>
                  <button type="button" onClick={() => { setShowFilters((current) => !current); setShowExportMenu(false); }} className="inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-[11px] font-semibold text-muted transition-colors hover:text-primary">
                    <Filter size={13} />
                    Filtrar ({visibleMarketplaces.length}/{DEFAULT_VISIBLE_MARKETPLACES.length})
                  </button>
                </div>

                {showExportMenu ? (
                  <div className="absolute right-0 top-10 z-20 flex w-[200px] flex-col rounded-xl border border-border bg-card p-1.5 shadow-lg">
                    <button type="button" onClick={exportPdf} className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-left text-[11px] font-medium text-secondary transition-colors hover:bg-body hover:text-primary">
                      <Download size={14} />
                      Exportar PDF
                    </button>
                    <button type="button" onClick={() => void copyComparison()} className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-left text-[11px] font-medium text-secondary transition-colors hover:bg-body hover:text-primary">
                      <Copy size={14} />
                      Copiar texto
                    </button>
                  </div>
                ) : null}

                {showFilters ? (
                  <div className="absolute right-0 top-10 z-20 w-[260px] rounded-xl border border-border bg-card p-3 shadow-lg">
                    <p className="mb-2 text-[12px] font-bold text-primary">Marketplaces visíveis</p>
                    <div className="space-y-1">
                      {MARKETPLACE_ORDER.map((marketplaceId) => (
                        <label key={marketplaceId} className="flex cursor-pointer items-center justify-between rounded-lg px-2.5 py-2 transition-colors hover:bg-body">
                          <span className="flex items-center gap-2 text-[11px] font-medium text-primary">
                            <MarketplaceBadge marketplaceId={marketplaceId} />
                            {MARKETPLACE_META[marketplaceId].name}
                          </span>
                          <input type="checkbox" checked={visibleMarketplaces.includes(marketplaceId)} onChange={() => toggleMarketplace(marketplaceId)} className="h-3.5 w-3.5 rounded border-border accent-[var(--color-brand-primary)]" />
                        </label>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>

              {showWhatIf ? (
                <div className="mb-4 rounded-xl border border-border bg-body p-4">
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <Sparkles size={15} className="text-[var(--color-brand-primary)]" />
                      <h3 className="text-[13px] font-bold text-primary">Simulador What-If</h3>
                      <span className="text-[10px] text-muted">Ajuste sem alterar os dados reais</span>
                    </div>
                    <button type="button" onClick={resetWhatIf} className="rounded-md border border-border px-2.5 py-1 text-[10px] font-semibold text-muted transition-colors hover:text-primary">
                      Resetar
                    </button>
                  </div>

                  <div className="grid gap-3 xl:grid-cols-3">
                    <SliderCard label="Preço de Venda" value={whatIf.salePrice} min={Math.max(0, inputs.salePrice * 0.5)} max={Math.max(inputs.salePrice * 2, inputs.salePrice + 50, 100)} step={1} displayValue={formatCurrencyBRL(whatIf.salePrice)} delta={whatIf.salePrice - inputs.salePrice} onChange={(value) => setWhatIf((current) => ({ ...current, salePrice: value }))} />
                    <SliderCard label="Custo do Produto" value={whatIf.productCost} min={0} max={Math.max(inputs.productCost * 2, inputs.salePrice, 100)} step={1} displayValue={formatCurrencyBRL(whatIf.productCost)} delta={whatIf.productCost - inputs.productCost} onChange={(value) => setWhatIf((current) => ({ ...current, productCost: value }))} />
                    <SliderCard label="Imposto" value={whatIf.taxPercent} min={0} max={30} step={0.5} displayValue={formatPercent(whatIf.taxPercent, 1)} delta={whatIf.taxPercent - inputs.taxPercent} onChange={(value) => setWhatIf((current) => ({ ...current, taxPercent: value }))} />
                  </div>

                  <div className="mt-3 flex items-center justify-between gap-3 rounded-lg bg-card px-4 py-3">
                    <div className="flex items-center gap-2">
                      {whatIfImpact > 0 ? <TrendingUp size={16} className="text-success" /> : whatIfImpact < 0 ? <TrendingDown size={16} className="text-danger" /> : <Info size={16} className="text-muted" />}
                      <span className="text-[11px] font-semibold text-muted">Impacto na Margem</span>
                    </div>
                    <span className={`text-[16px] font-extrabold tabular-nums ${whatIfImpact > 0 ? 'text-success' : whatIfImpact < 0 ? 'text-danger' : 'text-primary'}`}>
                      {whatIfImpact > 0 ? '+' : ''}
                      {formatCurrencyBRL(whatIfImpact)}
                    </span>
                  </div>
                </div>
              ) : null}

              {viewMode === 'cards' ? (
                <div className="grid gap-4 md:grid-cols-2">
                  {MARKETPLACE_ORDER.map((marketplaceId) => {
                    if (!visibleMarketplaces.includes(marketplaceId)) return null;
                    return (
                      <MarketplacePanel
                        key={marketplaceId}
                        marketplaceId={marketplaceId}
                        configs={marketConfigs}
                        setConfigs={setMarketConfigs}
                        results={groupedResults.get(marketplaceId) ?? []}
                        inputs={activeInputs}
                      />
                    );
                  })}
                </div>
              ) : null}

              {viewMode === 'table' ? (
                <div className="overflow-x-auto rounded-xl border border-border">
                  <table className="min-w-full">
                    <thead>
                      <tr className="border-b border-border bg-body text-left text-[10px] font-bold uppercase tracking-wider text-muted">
                        <th className="px-3 py-2.5">#</th>
                        <th className="px-3 py-2.5">Marketplace</th>
                        <th className="px-3 py-2.5">Opção</th>
                        <th className="px-3 py-2.5 text-right">Taxas</th>
                        <th className="px-3 py-2.5 text-right">Lucro</th>
                        <th className="px-3 py-2.5 text-right">Margem</th>
                        <th className="px-3 py-2.5 text-right">ROI</th>
                      </tr>
                    </thead>
                    <tbody>
                      {compactRows.map((row, index) => (
                        <tr key={row.id} className="border-b border-border bg-card text-[12px] transition-colors last:border-b-0 hover:bg-body">
                          <td className="px-3 py-2.5 text-[11px] font-bold text-muted">{index + 1}</td>
                          <td className="px-3 py-2.5 font-bold text-primary">{row.marketplaceName}</td>
                          <td className="px-3 py-2.5 text-secondary">{row.optionName}</td>
                          <td className="px-3 py-2.5 text-right tabular-nums text-secondary">-{formatCurrencyBRL(row.marketplaceFees)}</td>
                          <td className={`px-3 py-2.5 text-right font-bold tabular-nums ${row.profit >= 0 ? 'text-success' : 'text-danger'}`}>{formatCurrencyBRL(row.profit)}</td>
                          <td className="px-3 py-2.5 text-right tabular-nums text-secondary">{formatPercent(row.marginPercent, 1)}</td>
                          <td className="px-3 py-2.5 text-right font-semibold tabular-nums text-primary">{formatPercent(row.roi, 0)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : null}

              {viewMode === 'chart' ? (
                <div>
                  <div className="h-[320px] w-full rounded-xl border border-border bg-body p-3">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={chartData} margin={{ top: 8, right: 8, left: -16, bottom: 4 }}>
                        <CartesianGrid vertical={false} stroke="rgba(128,128,128,0.1)" />
                        <XAxis dataKey="shortName" tick={{ fontSize: 11, fill: 'var(--color-muted)' }} tickLine={false} axisLine={false} />
                        <YAxis tick={{ fontSize: 11, fill: 'var(--color-muted)' }} tickFormatter={(value) => `R$${value}`} tickLine={false} axisLine={false} />
                        <Tooltip content={<ComparisonTooltip />} cursor={{ fill: 'rgba(9, 202, 255, 0.06)' }} />
                        <Bar dataKey="profit" radius={[8, 8, 0, 0]}>
                          {chartData.map((item) => <Cell key={item.id} fill={item.fill} />)}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="mt-2.5 flex flex-wrap items-center justify-between gap-3">
                    <div className="flex flex-wrap items-center gap-3 text-[11px] text-muted">
                      <LegendDot color="var(--color-success)" label="Melhor" />
                      <LegendDot color="var(--color-brand-primary)" label="Bom" />
                      <LegendDot color="var(--color-warning)" label="Baixo" />
                      <LegendDot color="var(--color-danger)" label="Prejuízo" />
                    </div>
                    {chartData.length > 1 ? <p className="text-[11px] text-muted">Diferença: <strong className="text-primary">{formatCurrencyBRL(chartDelta)}</strong></p> : null}
                  </div>
                </div>
              ) : null}

              <div className="mt-4 overflow-hidden rounded-xl border border-border">
                <div className="flex items-center justify-between border-b border-border bg-body px-4 py-2.5">
                  <h3 className="text-[12px] font-bold text-primary">Últimos Cálculos</h3>
                  <span className="text-[10px] font-semibold text-muted">{history.length} de 10</span>
                </div>
                <div className="overflow-x-auto">
                  <table className="min-w-full">
                    <thead>
                      <tr className="border-b border-border bg-body text-left text-[10px] font-bold uppercase tracking-wider text-muted">
                        <th className="px-3 py-2">Data</th>
                        <th className="px-3 py-2">Produto</th>
                        <th className="px-3 py-2 text-right">Preço</th>
                        <th className="px-3 py-2 text-right">Custo</th>
                        <th className="px-3 py-2 text-right">Margem</th>
                      </tr>
                    </thead>
                    <tbody>
                      {history.map((entry) => (
                        <tr key={entry.id} onClick={() => loadHistoryEntry(entry)} className="cursor-pointer border-b border-border bg-card text-[11px] transition-colors last:border-b-0 hover:bg-body">
                          <td className="px-3 py-2.5 text-muted">{new Date(entry.createdAt).toLocaleDateString('pt-BR')}</td>
                          <td className="px-3 py-2.5 font-medium text-primary">{entry.productName}</td>
                          <td className="px-3 py-2.5 text-right tabular-nums text-primary">{formatCurrencyBRL(entry.salePrice)}</td>
                          <td className="px-3 py-2.5 text-right tabular-nums text-secondary">{formatCurrencyBRL(entry.productCost)}</td>
                          <td className="px-3 py-2.5 text-right font-bold tabular-nums text-primary">{formatPercent(entry.grossMarginPercent, 1)}</td>
                        </tr>
                      ))}
                      {history.length === 0 ? <tr><td colSpan={5} className="bg-card px-4 py-6 text-center text-[11px] text-muted">Nenhum cálculo salvo ainda.</td></tr> : null}
                    </tbody>
                  </table>
                </div>
              </div>
              <p className="mt-3 text-[11px] text-muted">* Valores estimados. As taxas podem variar conforme categoria do produto, tipo de anúncio e condições do vendedor.</p>
            </SectionCard>
          </>
        ) : null}
        {activeTab === 'description' ? (
          <SectionCard title="Gerador de Descrições IA" subtitle="3 variações otimizadas por marketplace." icon={FileText}>
              <div className="grid gap-4 xl:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]">
              <div className="space-y-3">
                <div className="grid gap-2.5 sm:grid-cols-2">
                  <label className="space-y-1 sm:col-span-2">
                    <span className="text-[11px] font-semibold text-muted">Nome do Produto *</span>
                    <input className={commonInputClass} value={descriptionForm.productName} onChange={(event) => setDescriptionForm((current) => ({ ...current, productName: event.target.value }))} placeholder="Ex: Fone Bluetooth TWS" />
                  </label>
                  <label className="space-y-1">
                    <span className="text-[11px] font-semibold text-muted">Marketplace</span>
                    <select className={commonInputClass} value={descriptionForm.marketplace} onChange={(event) => setDescriptionForm((current) => ({ ...current, marketplace: event.target.value as DescriptionMarketplace }))}>
                      {DESCRIPTION_MARKETPLACE_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>{option.label}</option>
                      ))}
                    </select>
                  </label>
                  <label className="space-y-1">
                    <span className="text-[11px] font-semibold text-muted">Categoria</span>
                    <input className={commonInputClass} value={descriptionForm.category} onChange={(event) => setDescriptionForm((current) => ({ ...current, category: event.target.value }))} placeholder="Ex: Eletrônicos" />
                  </label>
                  <label className="space-y-1 sm:col-span-2">
                    <span className="text-[11px] font-semibold text-muted">Palavras-chave</span>
                    <input className={commonInputClass} value={descriptionForm.keywords} onChange={(event) => setDescriptionForm((current) => ({ ...current, keywords: event.target.value }))} placeholder="Ex: bluetooth, sem fio, bateria longa" />
                  </label>
                  <label className="space-y-1 sm:col-span-2">
                    <span className="text-[11px] font-semibold text-muted">Características</span>
                    <textarea className="min-h-[100px] w-full resize-none rounded-lg border border-border bg-body px-2.5 py-2 text-[12px] text-primary outline-none transition-colors focus:border-[var(--color-brand-primary)] focus:ring-1 focus:ring-[var(--color-brand-primary)]/20" value={descriptionForm.features} onChange={(event) => setDescriptionForm((current) => ({ ...current, features: event.target.value }))} placeholder="Ex: Cancelamento de ruído, 30h de bateria, IPX4" />
                  </label>
                </div>
                <button type="button" onClick={() => void generateDescriptions()} disabled={descriptionLoading} className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[var(--color-brand-primary)] px-4 py-2.5 text-[12px] font-bold text-white shadow-sm transition-transform hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-60">
                  <Wand2 size={14} />
                  {descriptionLoading ? 'Gerando...' : 'Gerar 3 Variações'}
                </button>
              </div>
              <div>
                {descriptionResult ? (
                  <DescriptionOutput response={descriptionResult} showToast={showToast} />
                ) : (
                  <div className="flex min-h-[280px] items-center justify-center rounded-xl border border-dashed border-border bg-body p-6 text-center">
                    <div>
                      <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-lg bg-[var(--color-brand-primary)] text-white">
                        <Sparkles size={20} />
                      </div>
                      <h3 className="mt-3 text-[14px] font-bold text-primary">Pronto para gerar</h3>
                      <p className="mt-1 text-[11px] text-muted">Título, descrição, benefícios e tags.</p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </SectionCard>
        ) : null}
        {activeTab === 'ean' ? (
          <SectionCard title="Códigos EAN" subtitle="Gere, valide e imprima EAN-8 e EAN-13." icon={Barcode}>
            <div className="grid gap-4 xl:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
              <div className="space-y-3">
                <div className="rounded-xl border border-border bg-body p-3.5">
                  <h3 className="text-[12px] font-bold text-primary">Gerar código</h3>
                  <div className="mt-3 grid gap-2.5 sm:grid-cols-2">
                    <label className="space-y-1">
                      <span className="text-[11px] font-semibold text-muted">Tipo</span>
                      <select className={commonInputClass} value={eanType} onChange={(event) => setEanType(event.target.value as 'EAN-13' | 'EAN-8')}>
                        <option value="EAN-13">EAN-13</option>
                        <option value="EAN-8">EAN-8</option>
                      </select>
                    </label>
                    <label className="space-y-1">
                      <span className="text-[11px] font-semibold text-muted">Quantidade</span>
                      <input type="number" min="1" max="20" className={commonInputClass} value={`${eanQuantity}`} onChange={(event) => setEanQuantity(safePositiveInt(event.target.value))} />
                    </label>
                    <label className="space-y-1 sm:col-span-2">
                      <span className="text-[11px] font-semibold text-muted">Prefixo</span>
                      <div className="flex gap-1.5">
                        <input className={commonInputClass} value={eanPrefix} onChange={(event) => setEanPrefix(event.target.value)} placeholder="Ex: 789" />
                        <button type="button" onClick={() => setEanPrefix(BRAZILIAN_PREFIX)} className="rounded-lg border border-border px-3 text-[11px] font-bold text-muted transition-colors hover:text-primary">789</button>
                        <button type="button" onClick={() => setEanPrefix('')} className="rounded-lg border border-border px-3 text-[11px] font-bold text-muted transition-colors hover:text-primary">Rand</button>
                      </div>
                    </label>
                  </div>
                  <button type="button" onClick={handleGenerateBarcode} className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[var(--color-brand-primary)] px-4 py-2.5 text-[12px] font-bold text-white shadow-sm transition-transform hover:-translate-y-0.5">
                    <Barcode size={14} />
                    Gerar
                  </button>
                </div>

                <div className="rounded-xl border border-border bg-body p-3.5">
                  <h3 className="text-[12px] font-bold text-primary">Validar / Completar</h3>
                  <div className="mt-2.5 flex gap-2">
                    <input className={commonInputClass} value={eanValidationInput} onChange={(event) => setEanValidationInput(event.target.value)} placeholder="7, 8, 12 ou 13 dígitos" />
                    <button type="button" onClick={handleValidateEan} className="shrink-0 rounded-lg border border-border px-3 text-[11px] font-bold text-muted transition-colors hover:text-primary">Validar</button>
                  </div>
                  <p className="mt-2 text-[10px] text-muted">12 dígitos → EAN-13 · 7 dígitos → EAN-8</p>
                </div>
              </div>

              <div className="rounded-xl border border-border bg-body p-3.5">
                <div className="mb-3 flex items-center justify-between">
                  <h3 className="text-[12px] font-bold text-primary">Códigos gerados <span className="font-normal text-muted">({generatedCodes.length})</span></h3>
                  {generatedCodes.length > 0 ? (
                    <button type="button" onClick={() => { setGeneratedCodes([]); showToast('Lista de EAN limpa.', 'success'); }} className="rounded-md px-2 py-1 text-[10px] font-bold text-muted transition-colors hover:bg-card hover:text-danger">
                      <Trash2 size={12} className="inline" /> Limpar
                    </button>
                  ) : null}
                </div>

                <div className="space-y-2">
                  {generatedCodes.length === 0 ? <div className="rounded-lg border border-dashed border-border bg-card px-4 py-8 text-center text-[11px] text-muted">Nenhum código gerado ainda.</div> : null}
                  {generatedCodes.map((item) => (
                    <div key={item.id} className="rounded-xl border border-border bg-card p-3">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-baseline gap-2">
                          <span className="rounded-md bg-body px-1.5 py-0.5 text-[9px] font-bold uppercase text-muted">{item.type}</span>
                          <span className="font-mono text-[14px] font-bold tracking-wider text-primary">{item.code}</span>
                        </div>
                        <div className="flex gap-1">
                          <button type="button" onClick={() => void navigator.clipboard.writeText(item.code).then(() => showToast('Código copiado.', 'success'))} className="rounded-md p-1.5 text-muted transition-colors hover:bg-body hover:text-primary" title="Copiar">
                            <Copy size={13} />
                          </button>
                          <button type="button" onClick={() => handlePrintBarcode(item.code)} className="rounded-md p-1.5 text-muted transition-colors hover:bg-body hover:text-primary" title="Imprimir">
                            <Printer size={13} />
                          </button>
                          <button type="button" onClick={() => setGeneratedCodes((current) => current.filter((code) => code.id !== item.id))} className="rounded-md p-1.5 text-muted transition-colors hover:bg-danger/10 hover:text-danger" title="Remover">
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </div>
                      <div className="mt-2 overflow-x-auto rounded-lg bg-white p-2">
                        <BarcodePreview code={item.code} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </SectionCard>
        ) : null}
        {activeTab === 'ncm' ? (
          <SectionCard title="Buscador de NCM" subtitle="Encontre NCM por similaridade e estime a carga tributária." icon={Search}>
            <div className="grid gap-4 xl:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]">
              <div className="space-y-3">
                <div className="rounded-xl border border-border bg-body p-3.5">
                  <h3 className="text-[12px] font-bold text-primary">Buscar produto</h3>
                  <label className="mt-2.5 block space-y-1">
                    <span className="text-[11px] font-semibold text-muted">Nome do Produto</span>
                    <input className={commonInputClass} value={ncmQuery} onChange={(event) => setNcmQuery(event.target.value)} placeholder="Ex: camiseta, smartphone" />
                  </label>
                  <div className="mt-2.5 flex flex-wrap gap-1.5">
                    {['camiseta', 'smartphone', 'notebook', 'tênis', 'brinquedo'].map((item) => (
                      <button key={item} type="button" onClick={() => setNcmQuery(item)} className="rounded-md bg-card px-2.5 py-1 text-[10px] font-semibold text-muted transition-colors hover:text-primary">
                        {item}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="rounded-xl border border-border bg-body p-3.5">
                  <h3 className="text-[12px] font-bold text-primary">Correspondências</h3>
                  <div className="mt-2.5 space-y-1.5">
                    {ncmMatches.length === 0 ? <div className="rounded-lg border border-dashed border-border bg-card px-4 py-6 text-center text-[11px] text-muted">Digite um produto acima.</div> : null}
                    {ncmMatches.map((match) => (
                      <button key={match.ncm} type="button" onClick={() => setSelectedNcm(match)} className={`w-full rounded-lg border px-3 py-2.5 text-left transition-colors ${selectedNcm?.ncm === match.ncm ? 'border-[var(--color-brand-primary)] bg-body' : 'border-border bg-card hover:bg-body'}`}>
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <p className="font-mono text-[11px] font-bold text-primary">{match.ncm}</p>
                            <p className="mt-0.5 text-[11px] text-secondary">{match.description}</p>
                          </div>
                          <span className="shrink-0 rounded-md bg-body px-1.5 py-0.5 text-[9px] font-bold tabular-nums text-muted">{match.confidence}%</span>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="space-y-3">
                <div className="rounded-xl border border-border bg-body p-3.5">
                  <h3 className="text-[12px] font-bold text-primary">Impostos estimados</h3>
                  {selectedNcm ? (
                    <>
                      <div className="mt-2.5 rounded-lg border border-border bg-card px-3 py-2.5">
                        <p className="font-mono text-[11px] font-bold text-[var(--color-brand-primary)]">{selectedNcm.ncm}</p>
                        <p className="mt-0.5 text-[12px] font-medium text-primary">{selectedNcm.description}</p>
                      </div>
                      <div className="mt-2.5 grid grid-cols-2 gap-2.5">
                        <label className="space-y-1">
                          <span className="text-[11px] font-semibold text-muted">UF</span>
                          <select className={commonInputClass} value={ncmState} onChange={(event) => setNcmState(event.target.value)}>
                            {UF_OPTIONS.map((item) => (
                              <option key={item} value={item}>{item}</option>
                            ))}
                          </select>
                        </label>
                        <label className="space-y-1">
                          <span className="text-[11px] font-semibold text-muted">Preço de Venda</span>
                          <input type="number" step="0.01" className={commonInputClass} value={formatInputNumber(ncmSalePrice)} onChange={(event) => setNcmSalePrice(safeNumber(event.target.value))} placeholder="0,00" />
                        </label>
                      </div>
                      {ncmEstimate ? (
                        <div className="mt-3 grid grid-cols-3 gap-2">
                          <TaxTile label="II" rate={ncmEstimate.ii.rate} value={ncmEstimate.ii.value} />
                          <TaxTile label="IPI" rate={ncmEstimate.ipi.rate} value={ncmEstimate.ipi.value} />
                          <TaxTile label="PIS" rate={ncmEstimate.pis.rate} value={ncmEstimate.pis.value} />
                          <TaxTile label="COFINS" rate={ncmEstimate.cofins.rate} value={ncmEstimate.cofins.value} />
                          <TaxTile label="ICMS" rate={ncmEstimate.icms.rate} value={ncmEstimate.icms.value} />
                          <div className="rounded-xl border border-border bg-body px-3.5 py-3">
                            <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--color-brand-primary)]">Carga total</p>
                            <p className="mt-1 text-[20px] font-extrabold tabular-nums tracking-tight text-primary">{formatPercent(ncmEstimate.effectiveRate, 1)}</p>
                            <p className="text-[10px] font-medium text-muted">{formatCurrencyBRL(ncmEstimate.total)}</p>
                          </div>
                        </div>
                      ) : <div className="mt-3 rounded-lg border border-dashed border-border bg-card px-4 py-6 text-center text-[11px] text-muted">Informe um preço para calcular.</div>}
                    </>
                  ) : <div className="mt-3 rounded-lg border border-dashed border-border bg-card px-4 py-8 text-center text-[11px] text-muted">Selecione um NCM ao lado.</div>}
                </div>

                <div className="rounded-xl border border-border bg-body p-3.5">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-muted">Base local simplificada</p>
                  <p className="mt-1 text-[10px] leading-relaxed text-muted">Para enquadramento oficial, valide com sua contabilidade.</p>
                  <div className="mt-2.5 space-y-1">
                    {NCM_DATABASE.slice(0, 5).map((record) => (
                      <div key={record.ncm} className="rounded-lg bg-card px-2.5 py-2 text-[10px] text-secondary">
                        <strong className="font-mono text-primary">{record.ncm}</strong> · {record.description}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </SectionCard>
        ) : null}
      </div>
    </div>
  );
}
