export type CalculatorTab = 'taxes' | 'description' | 'ean' | 'ncm';
export type ComparisonViewMode = 'cards' | 'table' | 'chart';
export type ProfitMode = 'value' | 'percent';
export type MarketplaceId =
  | 'mercadolivre'
  | 'amazon'
  | 'shopee'
  | 'shein'
  | 'magalu'
  | 'tiktok'
  | 'kwai';

export interface LinkItem {
  label: string;
  url: string;
}

export interface CategoryOption {
  id: string;
  label: string;
  description: string;
}

export interface CalculatorInputs {
  productName: string;
  productUrl: string;
  salePrice: number;
  productCost: number;
  packagingCost: number;
  kitQuantity: number;
  taxPercent: number;
  desiredProfit: number;
  desiredProfitMode: ProfitMode;
  categoryId: string;
}

export interface MarketplaceHeaderMeta {
  id: MarketplaceId;
  name: string;
  rulesUrl: string;
  helpLinks: LinkItem[];
  accentColor: string;
  shortLabel: string;
}

export interface MarketplaceOptionInput {
  id: string;
  label: string;
  commissionPercent: number;
  fixedFee: number;
  shippingCost: number;
  advancePercent: number;
  note?: string;
}

export interface MarketplaceResult {
  id: string;
  marketplaceId: MarketplaceId;
  marketplaceName: string;
  optionName: string;
  commissionPercent: number;
  commissionAmount: number;
  fixedFee: number;
  shippingCost: number;
  advancePercent: number;
  advanceAmount: number;
  taxAmount: number;
  productCost: number;
  packagingCost: number;
  marketplaceFees: number;
  profit: number;
  marginPercent: number;
  roi: number;
  tone: 'good' | 'warning' | 'negative';
  toneLabel: string;
  note?: string;
  fixedFeeLabel?: string;
  profitLabel?: string;
  showRoi?: boolean;
  rulesUrl: string;
  helpLinks: LinkItem[];
  accentColor: string;
  shortLabel: string;
  suggestedPrice: number | null;
}

export interface MercadoLivreConfig {
  url: string;
  classicPercent: number;
  premiumPercent: number;
  shippingCost: number;
  advancePercent: number;
  supermarket: boolean;
}

export interface AmazonConfig {
  url: string;
  sellerProfile: 'default' | 'new-seller' | 'feb26-new' | 'professional' | 'individual';
  referralFeePercent: number;
  dbaCost: number;
  fbaCost: number;
  advancePercent: number;
}

export interface ShopeeConfig {
  accountType: 'cnpj' | 'cpf';
  cnpjPercent: number;
  cpfPercent: number;
  fixedFee: number;
  cpfFixedFee: number;
  advancePercent: number;
}

export interface SheinConfig {
  standardPercent: number;
  fixedFee: number;
  shippingCost: number;
  advancePercent: number;
}

export interface MagaluConfig {
  standardPercent: number;
  fixedFee: number;
  shippingCost: number;
  advancePercent: number;
}

export interface TikTokConfig {
  standardPercent: number;
  affiliatePercent: number;
  fixedFee: number;
  shippingCost: number;
  advancePercent: number;
}

export interface KwaiConfig {
  standardPercent: number;
  newSellerPercent: number;
  fixedFee: number;
  shippingCost: number;
  advancePercent: number;
}

export interface MarketplaceConfigMap {
  mercadolivre: MercadoLivreConfig;
  amazon: AmazonConfig;
  shopee: ShopeeConfig;
  shein: SheinConfig;
  magalu: MagaluConfig;
  tiktok: TikTokConfig;
  kwai: KwaiConfig;
}

export interface CalculatorHistoryEntry {
  id: string;
  createdAt: string;
  productName: string;
  salePrice: number;
  productCost: number;
  packagingCost: number;
  kitQuantity: number;
  taxPercent: number;
  grossMarginPercent: number;
  inputs: CalculatorInputs;
  configs: MarketplaceConfigMap;
}

export interface DescriptionVariation {
  id: string;
  angle: string;
  title: string;
  description: string;
  bulletPoints: string[];
  tags: string[];
  seoScore: number;
}

export interface DescriptionResponse {
  variations: DescriptionVariation[];
  recommendation?: string;
}

export interface GeneratedBarcode {
  id: string;
  code: string;
  type: 'EAN-13' | 'EAN-8';
  createdAt: string;
}

export interface NcmTaxSet {
  ii: number;
  ipi: number;
  pis: number;
  cofins: number;
  icmsBase: number;
}

export interface NcmRecord {
  ncm: string;
  description: string;
  keywords: string[];
  taxes: NcmTaxSet;
  notes?: string;
}

export interface NcmMatch extends NcmRecord {
  confidence: number;
}

export interface NcmEstimate {
  ii: { rate: number; value: number };
  ipi: { rate: number; value: number };
  pis: { rate: number; value: number };
  cofins: { rate: number; value: number };
  icms: { rate: number; value: number };
  total: number;
  effectiveRate: number;
}

export const CALCULATOR_HISTORY_KEY = 'atrio:marketplace-calculator:history';
export const CALCULATOR_VISIBLE_MARKETS_KEY = 'atrio:marketplace-calculator:visible';

export const DEFAULT_VISIBLE_MARKETPLACES: MarketplaceId[] = [
  'mercadolivre',
  'amazon',
  'shopee',
  'shein',
  'magalu',
  'tiktok',
  'kwai',
];

export const CATEGORY_OPTIONS: CategoryOption[] = [
  { id: 'default', label: 'Padrão (sem categoria)', description: 'Usa taxas padrão observadas na calculadora.' },
];

export const MARKETPLACE_META: Record<MarketplaceId, MarketplaceHeaderMeta> = {
  mercadolivre: {
    id: 'mercadolivre',
    name: 'Mercado Livre',
    rulesUrl: 'https://www.mercadolivre.com.br/ajuda/quanto-custa-vender-um-produto_1338',
    accentColor: '#FFD60A',
    shortLabel: 'ML',
    helpLinks: [
      { label: 'Tabela oficial de frete', url: 'https://www.mercadolivre.com.br/ajuda/40538' },
      { label: 'Custos da seção Supermercado', url: 'https://www.mercadolivre.com.br/ajuda/quais-sao-as-vantagens-custos-e-requisitos-para-vender-na-secao-supermercado_16449' },
    ],
  },
  amazon: {
    id: 'amazon',
    name: 'Amazon',
    rulesUrl: 'https://venda.amazon.com.br/precos#comissoes-de-venda',
    accentColor: '#111111',
    shortLabel: 'AMZ',
    helpLinks: [
      { label: 'Custos DBA', url: 'https://venda.amazon.com.br/cresca/dba' },
      { label: 'Custos FBA', url: 'https://venda.amazon.com.br/cresca/fba#custos' },
    ],
  },
  shopee: {
    id: 'shopee',
    name: 'Shopee',
    rulesUrl: 'https://seller.shopee.com.br/edu/article/18483/como-funciona-a-politica-de-comissao-para-vendedores-shopee',
    accentColor: '#EE4D2D',
    shortLabel: 'SHP',
    helpLinks: [
      { label: 'Política de comissão', url: 'https://seller.shopee.com.br/edu/article/18483/como-funciona-a-politica-de-comissao-para-vendedores-shopee' },
    ],
  },
  shein: {
    id: 'shein',
    name: 'SHEIN',
    rulesUrl: 'https://br.shein.com/SHEIN-Commission-Policy-a-1420.html',
    accentColor: '#1A1A1A',
    shortLabel: 'SHN',
    helpLinks: [
      { label: 'Política de comissão', url: 'https://br.shein.com/SHEIN-Commission-Policy-a-1420.html' },
    ],
  },
  magalu: {
    id: 'magalu',
    name: 'Magazine Luiza',
    rulesUrl: 'https://universo.magalu.com/',
    accentColor: '#0066FF',
    shortLabel: 'MGL',
    helpLinks: [
      { label: 'Universo Magalu', url: 'https://universo.magalu.com/' },
    ],
  },
  tiktok: {
    id: 'tiktok',
    name: 'TikTok Shop',
    rulesUrl: 'https://seller-br.tiktok.com/university/essay?knowledge_id=5665577566734097&default_language=pt-BR&identity=1',
    accentColor: '#111111',
    shortLabel: 'TTK',
    helpLinks: [
      { label: 'Universidade TikTok Shop', url: 'https://seller-br.tiktok.com/university/essay?knowledge_id=5665577566734097&default_language=pt-BR&identity=1' },
    ],
  },
  kwai: {
    id: 'kwai',
    name: 'Kwai Shop',
    rulesUrl: 'https://shop.kwai.com/',
    accentColor: '#FF4906',
    shortLabel: 'KWA',
    helpLinks: [
      { label: 'Portal Kwai Shop', url: 'https://shop.kwai.com/' },
    ],
  },
};

function roundCurrency(value: number) {
  return Math.round(value * 100) / 100;
}

export function formatCurrencyBRL(value: number) {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number.isFinite(value) ? value : 0);
}

export function formatPercent(value: number, digits = 1) {
  return `${value.toFixed(digits)}%`;
}

export function getMarginTone(marginPercent: number): MarketplaceResult['tone'] {
  if (marginPercent < 0) return 'negative';
  if (marginPercent < 10) return 'warning';
  return 'good';
}

export function getMarginToneLabel(tone: MarketplaceResult['tone']) {
  if (tone === 'good') return 'Boa margem';
  if (tone === 'warning') return 'Margem baixa';
  return 'Prejuízo';
}

export function createDefaultInputs(): CalculatorInputs {
  return {
    productName: '',
    productUrl: '',
    salePrice: 0,
    productCost: 0,
    packagingCost: 0,
    kitQuantity: 1,
    taxPercent: 0,
    desiredProfit: 0,
    desiredProfitMode: 'value',
    categoryId: 'default',
  };
}

export function createDefaultMarketplaceConfigs(): MarketplaceConfigMap {
  return {
    mercadolivre: {
      url: '',
      classicPercent: 12,
      premiumPercent: 17,
      shippingCost: 5.65,
      advancePercent: 0,
      supermarket: false,
    },
    amazon: {
      url: '',
      sellerProfile: 'default',
      referralFeePercent: 15,
      dbaCost: 5.5,
      fbaCost: 8.5,
      advancePercent: 0,
    },
    shopee: {
      accountType: 'cnpj',
      cnpjPercent: 20,
      cpfPercent: 20,
      fixedFee: 4,
      cpfFixedFee: 7,
      advancePercent: 0,
    },
    shein: {
      standardPercent: 16,
      fixedFee: 0,
      shippingCost: 0,
      advancePercent: 0,
    },
    magalu: {
      standardPercent: 16,
      fixedFee: 0,
      shippingCost: 0,
      advancePercent: 0,
    },
    tiktok: {
      standardPercent: 12,
      affiliatePercent: 13,
      fixedFee: 4,
      shippingCost: 0,
      advancePercent: 0,
    },
    kwai: {
      standardPercent: 20,
      newSellerPercent: 14,
      fixedFee: 4,
      shippingCost: 0,
      advancePercent: 0,
    },
  };
}

function applyCategoryCommission(
  _marketplaceId: MarketplaceId,
  _categoryId: string,
  fallbackPercent: number,
) {
  return fallbackPercent;
}

interface GenericCalculationArgs {
  marketplaceId: MarketplaceId;
  optionName: string;
  commissionPercent: number;
  fixedFee: number;
  shippingCost: number;
  advancePercent: number;
  inputs: CalculatorInputs;
  note?: string;
  fixedFeeLabel?: string;
  profitLabel?: string;
  showRoi?: boolean;
}

export interface PricedMarketplaceFee {
  amount: number;
  label: string;
}

export function getMercadoLivreSupermarketFee(totalSale: number): PricedMarketplaceFee {
  if (totalSale <= 29.99) return { amount: 1, label: 'até R$29,99' };
  if (totalSale <= 49.99) return { amount: 2, label: 'R$30-49,99' };
  if (totalSale <= 99.99) return { amount: 4, label: 'R$50-99,99' };
  if (totalSale <= 198.99) return { amount: 6, label: 'R$100-198,99' };
  return { amount: 6, label: 'acima de R$199' };
}

export function getShopeeRule(totalSale: number, accountType: ShopeeConfig['accountType']) {
  const commissionPercent = totalSale <= 50 ? 20 : 14;

  if (totalSale <= 50) {
    return {
      commissionPercent,
      fixedFee: accountType === 'cpf' ? 7 : 4,
    };
  }

  if (totalSale < 100) {
    return {
      commissionPercent,
      fixedFee: accountType === 'cpf' ? 19 : 16,
    };
  }

  if (totalSale < 200) {
    return {
      commissionPercent,
      fixedFee: accountType === 'cpf' ? 23 : 20,
    };
  }

  return {
    commissionPercent,
    fixedFee: accountType === 'cpf' ? 29 : 26,
  };
}

function calculateMarketplaceOption({
  marketplaceId,
  optionName,
  commissionPercent,
  fixedFee,
  shippingCost,
  advancePercent,
  inputs,
  note,
  fixedFeeLabel,
  profitLabel,
  showRoi,
}: GenericCalculationArgs): MarketplaceResult {
  const meta = MARKETPLACE_META[marketplaceId];
  const totalSale = roundCurrency(inputs.salePrice * inputs.kitQuantity);
  const totalProductCost = roundCurrency(inputs.productCost * inputs.kitQuantity);
  const totalPackagingCost = roundCurrency(inputs.packagingCost * inputs.kitQuantity);
  const commissionAmount = roundCurrency(totalSale * (commissionPercent / 100));
  const advanceAmount = roundCurrency(totalSale * (advancePercent / 100));
  const taxAmount = roundCurrency(totalSale * (inputs.taxPercent / 100));
  const marketplaceFees = roundCurrency(commissionAmount + fixedFee + shippingCost + advanceAmount);
  const profit = roundCurrency(
    totalSale -
      commissionAmount -
      fixedFee -
      shippingCost -
      advanceAmount -
      taxAmount -
      totalProductCost -
      totalPackagingCost,
  );
  const marginPercent = totalSale > 0 ? (profit / totalSale) * 100 : 0;
  const roiBase = totalProductCost + totalPackagingCost;
  const roi = roiBase > 0 ? (profit / roiBase) * 100 : 0;
  const tone = getMarginTone(marginPercent);

  return {
    id: `${marketplaceId}-${optionName.toLowerCase().replace(/\s+/g, '-')}`,
    marketplaceId,
    marketplaceName: meta.name,
    optionName,
    commissionPercent,
    commissionAmount,
    fixedFee: roundCurrency(fixedFee),
    shippingCost: roundCurrency(shippingCost),
    advancePercent,
    advanceAmount,
    taxAmount,
    productCost: totalProductCost,
    packagingCost: totalPackagingCost,
    marketplaceFees,
    profit,
    marginPercent,
    roi,
    tone,
    toneLabel: getMarginToneLabel(tone),
    note,
    fixedFeeLabel,
    profitLabel,
    showRoi,
    rulesUrl: meta.rulesUrl,
    helpLinks: meta.helpLinks,
    accentColor: meta.accentColor,
    shortLabel: meta.shortLabel,
    suggestedPrice: calculateSuggestedPrice({
      commissionPercent,
      advancePercent,
      fixedFee,
      shippingCost,
      inputs,
    }),
  };
}

export function calculateMarketplaceResults(
  inputs: CalculatorInputs,
  configs: MarketplaceConfigMap,
): MarketplaceResult[] {
  const results: MarketplaceResult[] = [];

  const mlClassic = applyCategoryCommission(
    'mercadolivre',
    inputs.categoryId,
    configs.mercadolivre.classicPercent,
  );
  const mlPremium = applyCategoryCommission(
    'mercadolivre',
    inputs.categoryId,
    configs.mercadolivre.premiumPercent,
  );
  const totalSale = roundCurrency(inputs.salePrice * inputs.kitQuantity);
  const supermarketFee = configs.mercadolivre.supermarket ? getMercadoLivreSupermarketFee(totalSale) : null;

  results.push(
    calculateMarketplaceOption({
      marketplaceId: 'mercadolivre',
      optionName: 'Clássico',
      commissionPercent: mlClassic,
      fixedFee: supermarketFee?.amount ?? 0,
      fixedFeeLabel: supermarketFee ? 'Taxa Supermercado' : undefined,
      shippingCost: supermarketFee ? 0 : configs.mercadolivre.shippingCost,
      advancePercent: configs.mercadolivre.advancePercent,
      inputs,
      note: supermarketFee ? `Taxa Supermercado: R$ ${supermarketFee.amount.toFixed(2)} (${supermarketFee.label})` : undefined,
    }),
    calculateMarketplaceOption({
      marketplaceId: 'mercadolivre',
      optionName: 'Premium',
      commissionPercent: mlPremium,
      fixedFee: supermarketFee?.amount ?? 0,
      fixedFeeLabel: supermarketFee ? 'Taxa Supermercado' : undefined,
      shippingCost: supermarketFee ? 0 : configs.mercadolivre.shippingCost,
      advancePercent: configs.mercadolivre.advancePercent,
      inputs,
      note: supermarketFee ? `Taxa Supermercado: R$ ${supermarketFee.amount.toFixed(2)} (${supermarketFee.label})` : undefined,
    }),
  );

  const amazonCommission = applyCategoryCommission(
    'amazon',
    inputs.categoryId,
    configs.amazon.referralFeePercent,
  );
  results.push(
    calculateMarketplaceOption({
      marketplaceId: 'amazon',
      optionName: 'DBA',
      commissionPercent: amazonCommission,
      fixedFee: configs.amazon.dbaCost,
      fixedFeeLabel: 'Taxa Fixa',
      shippingCost: 0,
      advancePercent: configs.amazon.advancePercent,
      inputs,
    }),
    calculateMarketplaceOption({
      marketplaceId: 'amazon',
      optionName: 'FBA',
      commissionPercent: amazonCommission,
      fixedFee: configs.amazon.fbaCost,
      fixedFeeLabel: 'Taxa Fixa',
      shippingCost: 0,
      advancePercent: configs.amazon.advancePercent,
      inputs,
    }),
  );

  const shopeeRule = getShopeeRule(totalSale, configs.shopee.accountType);
  results.push(
    calculateMarketplaceOption({
      marketplaceId: 'shopee',
      optionName: 'Shopee',
      commissionPercent: shopeeRule.commissionPercent,
      fixedFee: shopeeRule.fixedFee,
      fixedFeeLabel: 'Taxa Fixa',
      shippingCost: 0,
      advancePercent: 0,
      inputs,
      profitLabel: 'Sobra',
      showRoi: false,
    }),
  );

  results.push(
    calculateMarketplaceOption({
      marketplaceId: 'shein',
      optionName: 'Padrão',
      commissionPercent: applyCategoryCommission('shein', inputs.categoryId, configs.shein.standardPercent),
      fixedFee: configs.shein.fixedFee,
      shippingCost: configs.shein.shippingCost,
      advancePercent: configs.shein.advancePercent,
      inputs,
    }),
  );

  results.push(
    calculateMarketplaceOption({
      marketplaceId: 'magalu',
      optionName: 'Padrão',
      commissionPercent: applyCategoryCommission('magalu', inputs.categoryId, configs.magalu.standardPercent),
      fixedFee: configs.magalu.fixedFee,
      shippingCost: configs.magalu.shippingCost,
      advancePercent: configs.magalu.advancePercent,
      inputs,
    }),
  );

  results.push(
    calculateMarketplaceOption({
      marketplaceId: 'tiktok',
      optionName: 'Padrão',
      commissionPercent: applyCategoryCommission('tiktok', inputs.categoryId, configs.tiktok.standardPercent),
      fixedFee: configs.tiktok.fixedFee,
      shippingCost: configs.tiktok.shippingCost,
      advancePercent: configs.tiktok.advancePercent,
      inputs,
    }),
    calculateMarketplaceOption({
      marketplaceId: 'tiktok',
      optionName: 'Afiliado',
      commissionPercent: applyCategoryCommission('tiktok', inputs.categoryId, configs.tiktok.affiliatePercent),
      fixedFee: configs.tiktok.fixedFee,
      shippingCost: configs.tiktok.shippingCost,
      advancePercent: configs.tiktok.advancePercent,
      inputs,
    }),
  );

  results.push(
    calculateMarketplaceOption({
      marketplaceId: 'kwai',
      optionName: 'Padrão',
      commissionPercent: applyCategoryCommission('kwai', inputs.categoryId, configs.kwai.standardPercent),
      fixedFee: configs.kwai.fixedFee,
      shippingCost: configs.kwai.shippingCost,
      advancePercent: configs.kwai.advancePercent,
      inputs,
    }),
    calculateMarketplaceOption({
      marketplaceId: 'kwai',
      optionName: 'Novo Vendedor (45 dias)',
      commissionPercent: applyCategoryCommission('kwai', inputs.categoryId, configs.kwai.newSellerPercent),
      fixedFee: configs.kwai.fixedFee,
      shippingCost: configs.kwai.shippingCost,
      advancePercent: configs.kwai.advancePercent,
      inputs,
    }),
  );

  return results;
}

export function calculateSuggestedPrice(args: {
  commissionPercent: number;
  advancePercent: number;
  fixedFee: number;
  shippingCost: number;
  inputs: CalculatorInputs;
}) {
  const {
    commissionPercent,
    advancePercent,
    fixedFee,
    shippingCost,
    inputs,
  } = args;
  const productCost = inputs.productCost * inputs.kitQuantity;
  const packagingCost = inputs.packagingCost * inputs.kitQuantity;
  const variableCost = productCost + packagingCost;
  const percentageFee = (inputs.taxPercent + commissionPercent + advancePercent) / 100;
  const fixedCost = fixedFee + shippingCost;

  if (inputs.desiredProfitMode === 'value') {
    const denominator = 1 - percentageFee;
    if (denominator <= 0) return null;
    return roundCurrency((variableCost + inputs.desiredProfit + fixedCost) / denominator);
  }

  const denominator = 1 - percentageFee - inputs.desiredProfit / 100;
  if (denominator <= 0) return null;
  return roundCurrency((variableCost + fixedCost) / denominator);
}

export function calculateMarkupSummary(inputs: CalculatorInputs) {
  const sale = inputs.salePrice * inputs.kitQuantity;
  const cost = inputs.productCost * inputs.kitQuantity;
  if (cost <= 0) return null;

  const gain = sale - cost;
  return {
    percent: (gain / cost) * 100,
    multiplier: sale / cost,
    gain,
  };
}

export function calculateGrossMarginEstimate(inputs: CalculatorInputs) {
  const totalSale = inputs.salePrice * inputs.kitQuantity;
  if (totalSale <= 0) return 0;
  const gross = totalSale - inputs.productCost * inputs.kitQuantity - inputs.packagingCost * inputs.kitQuantity;
  return (gross / totalSale) * 100;
}

export function cloneMarketplaceConfigs(configs: MarketplaceConfigMap): MarketplaceConfigMap {
  return JSON.parse(JSON.stringify(configs)) as MarketplaceConfigMap;
}

export function parseProductNameFromUrl(url: string) {
  try {
    const parsed = new URL(url);
    const segments = parsed.pathname
      .split('/')
      .map((segment) => segment.trim())
      .filter(Boolean);
    const slug = segments.reverse().find((segment) => /[a-z]/i.test(segment));
    if (!slug) return '';

    return slug
      .replace(/[-_]+/g, ' ')
      .replace(/\b(p|dp|mlb|asin)\b/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  } catch {
    return '';
  }
}

export function buildHistoryEntry(
  inputs: CalculatorInputs,
  configs: MarketplaceConfigMap,
): CalculatorHistoryEntry {
  return {
    id: `${Date.now()}`,
    createdAt: new Date().toISOString(),
    productName: inputs.productName || 'Produto sem nome',
    salePrice: inputs.salePrice,
    productCost: inputs.productCost,
    packagingCost: inputs.packagingCost,
    kitQuantity: inputs.kitQuantity,
    taxPercent: inputs.taxPercent,
    grossMarginPercent: calculateGrossMarginEstimate(inputs),
    inputs: { ...inputs },
    configs: cloneMarketplaceConfigs(configs),
  };
}

export function dedupeHistoryEntry(
  history: CalculatorHistoryEntry[],
  entry: CalculatorHistoryEntry,
) {
  return history.find((item) =>
    item.salePrice === entry.salePrice &&
    item.productCost === entry.productCost &&
    item.packagingCost === entry.packagingCost &&
    item.kitQuantity === entry.kitQuantity &&
    item.taxPercent === entry.taxPercent &&
    item.productName.toLowerCase() === entry.productName.toLowerCase(),
  );
}

export function sanitizeHistory(raw: unknown): CalculatorHistoryEntry[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((item): item is CalculatorHistoryEntry => Boolean(item && typeof item === 'object'))
    .slice(0, 10);
}

export function calculateWhatIfImpact(
  inputs: CalculatorInputs,
  overrides: Pick<CalculatorInputs, 'salePrice' | 'productCost' | 'taxPercent'>,
) {
  const baseSale = inputs.salePrice * inputs.kitQuantity;
  const overrideSale = overrides.salePrice * inputs.kitQuantity;
  const baseTax = baseSale * (inputs.taxPercent / 100);
  const overrideTax = overrideSale * (overrides.taxPercent / 100);
  const baseGross = baseSale - baseTax - inputs.productCost * inputs.kitQuantity - inputs.packagingCost * inputs.kitQuantity;
  const overrideGross = overrideSale - overrideTax - overrides.productCost * inputs.kitQuantity - inputs.packagingCost * inputs.kitQuantity;

  return roundCurrency(overrideGross - baseGross);
}

export function computeEan13CheckDigit(payload: string) {
  let sum = 0;
  for (let index = 0; index < payload.length; index += 1) {
    const digit = Number(payload[index]);
    sum += index % 2 === 0 ? digit : digit * 3;
  }
  return (10 - (sum % 10)) % 10;
}

export function computeEan8CheckDigit(payload: string) {
  let sum = 0;
  for (let index = 0; index < payload.length; index += 1) {
    const digit = Number(payload[index]);
    sum += index % 2 === 0 ? digit * 3 : digit;
  }
  return (10 - (sum % 10)) % 10;
}

export function validateOrCompleteEan(code: string) {
  const numeric = code.replace(/\D/g, '');
  if (!numeric) {
    return { valid: false, message: 'Digite apenas números.', completed: null as string | null };
  }

  if (numeric.length === 12) {
    const checkDigit = computeEan13CheckDigit(numeric);
    return { valid: true, message: `Código completado com dígito ${checkDigit}.`, completed: `${numeric}${checkDigit}` };
  }

  if (numeric.length === 7) {
    const checkDigit = computeEan8CheckDigit(numeric);
    return { valid: true, message: `Código completado com dígito ${checkDigit}.`, completed: `${numeric}${checkDigit}` };
  }

  if (numeric.length === 13) {
    const checkDigit = computeEan13CheckDigit(numeric.slice(0, 12));
    return {
      valid: Number(numeric[12]) === checkDigit,
      message:
        Number(numeric[12]) === checkDigit
          ? 'EAN-13 válido.'
          : `Dígito verificador esperado: ${checkDigit}.`,
      completed: null,
    };
  }

  if (numeric.length === 8) {
    const checkDigit = computeEan8CheckDigit(numeric.slice(0, 7));
    return {
      valid: Number(numeric[7]) === checkDigit,
      message:
        Number(numeric[7]) === checkDigit
          ? 'EAN-8 válido.'
          : `Dígito verificador esperado: ${checkDigit}.`,
      completed: null,
    };
  }

  return {
    valid: false,
    message: 'EAN deve ter 7, 8, 12 ou 13 dígitos.',
    completed: null,
  };
}

export function generateEanCode(
  type: 'EAN-13' | 'EAN-8',
  prefix = '',
) {
  const cleanPrefix = prefix.replace(/\D/g, '');
  if (type === 'EAN-13') {
    let payload = cleanPrefix.padEnd(12, '0').slice(0, 12).split('');
    payload = payload.map((digit, index) =>
      cleanPrefix[index] ? digit : `${Math.floor(Math.random() * 10)}`,
    );
    const base = payload.join('');
    return `${base}${computeEan13CheckDigit(base)}`;
  }

  let payload = cleanPrefix.padEnd(7, '0').slice(0, 7).split('');
  payload = payload.map((digit, index) =>
    cleanPrefix[index] ? digit : `${Math.floor(Math.random() * 10)}`,
  );
  const base = payload.join('');
  return `${base}${computeEan8CheckDigit(base)}`;
}

export const BRAZILIAN_PREFIX = '789';

export const UF_OPTIONS = [
  'AC',
  'AL',
  'AP',
  'AM',
  'BA',
  'CE',
  'DF',
  'ES',
  'GO',
  'MA',
  'MT',
  'MS',
  'MG',
  'PA',
  'PB',
  'PR',
  'PE',
  'PI',
  'RJ',
  'RN',
  'RS',
  'RO',
  'RR',
  'SC',
  'SP',
  'SE',
  'TO',
];

export const NCM_DATABASE: NcmRecord[] = [
  {
    ncm: '6109.10.00',
    description: 'Camisetas de malha de algodão',
    keywords: ['camiseta', 'camiseta algodão', 't-shirt', 'blusa de malha', 'camiseta polo'],
    taxes: { ii: 35, ipi: 0, pis: 1.65, cofins: 7.6, icmsBase: 18 },
    notes: 'Vestuário: ICMS costuma variar por estado.',
  },
  {
    ncm: '6110.20.00',
    description: 'Suéteres, pulôveres e moletons de algodão',
    keywords: ['moletom', 'pulôver', 'suéter', 'casaco de malha'],
    taxes: { ii: 35, ipi: 0, pis: 1.65, cofins: 7.6, icmsBase: 18 },
  },
  {
    ncm: '6204.62.00',
    description: 'Calças femininas de algodão',
    keywords: ['calça feminina', 'jeans feminino', 'calça mulher'],
    taxes: { ii: 35, ipi: 0, pis: 1.65, cofins: 7.6, icmsBase: 18 },
  },
  {
    ncm: '6203.42.00',
    description: 'Calças masculinas de algodão',
    keywords: ['calça masculina', 'jeans masculino', 'calça homem'],
    taxes: { ii: 35, ipi: 0, pis: 1.65, cofins: 7.6, icmsBase: 18 },
  },
  {
    ncm: '8517.12.31',
    description: 'Telefones celulares e smartphones',
    keywords: ['celular', 'smartphone', 'iphone', 'android', 'telefone'],
    taxes: { ii: 0, ipi: 0, pis: 1.65, cofins: 7.6, icmsBase: 12 },
    notes: 'Eletrônicos: carga tende a ser menor em II para celulares.',
  },
  {
    ncm: '8471.30.19',
    description: 'Computadores portáteis e notebooks',
    keywords: ['notebook', 'laptop', 'macbook', 'computador portátil'],
    taxes: { ii: 0, ipi: 0, pis: 1.65, cofins: 7.6, icmsBase: 12 },
  },
  {
    ncm: '9503.00.39',
    description: 'Brinquedos diversos',
    keywords: ['brinquedo', 'boneco', 'jogo infantil', 'educativo'],
    taxes: { ii: 20, ipi: 10, pis: 1.65, cofins: 7.6, icmsBase: 18 },
  },
  {
    ncm: '6403.59.90',
    description: 'Calçados tipo tênis',
    keywords: ['tênis', 'calcado esportivo', 'sapatenis', 'sneaker'],
    taxes: { ii: 35, ipi: 0, pis: 1.65, cofins: 7.6, icmsBase: 18 },
  },
  {
    ncm: '9403.60.00',
    description: 'Móveis e peças de madeira',
    keywords: ['mesa', 'cadeira', 'rack', 'aparador', 'móvel'],
    taxes: { ii: 16, ipi: 5, pis: 1.65, cofins: 7.6, icmsBase: 18 },
  },
  {
    ncm: '3304.99.90',
    description: 'Preparações de beleza e cuidados pessoais',
    keywords: ['cosmético', 'creme', 'serum', 'maquiagem', 'hidratante'],
    taxes: { ii: 18, ipi: 8, pis: 1.65, cofins: 7.6, icmsBase: 18 },
  },
  {
    ncm: '3924.10.00',
    description: 'Utensílios de mesa e cozinha em plástico',
    keywords: ['pote', 'organizador', 'utensílio cozinha', 'garrafa'],
    taxes: { ii: 16, ipi: 5, pis: 1.65, cofins: 7.6, icmsBase: 18 },
  },
];

export function searchNcmDatabase(query: string) {
  const normalizedQuery = query
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();

  if (!normalizedQuery) return [] as NcmMatch[];

  const queryTokens = normalizedQuery.split(/\s+/).filter(Boolean);
  const matches = NCM_DATABASE.map((record) => {
    const haystack = `${record.description} ${record.keywords.join(' ')}`.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

    let score = 0;
    for (const token of queryTokens) {
      if (haystack.includes(token)) score += 35;
      if (record.keywords.some((keyword) => keyword.toLowerCase().includes(token))) score += 15;
    }

    if (haystack.includes(normalizedQuery)) score += 25;

    return {
      ...record,
      confidence: Math.min(score, 100),
    };
  })
    .filter((record) => record.confidence > 0)
    .sort((left, right) => right.confidence - left.confidence)
    .slice(0, 5);

  return matches;
}

export function estimateNcmTaxes(
  record: NcmRecord | null,
  stateCode: string,
  salePrice: number,
) {
  if (!record || salePrice <= 0) return null;

  let icmsRate = record.taxes.icmsBase;
  if (stateCode && stateCode !== 'SP') {
    icmsRate = ['SP', 'RJ', 'MG'].includes(stateCode) ? 18 : 17;
  }

  const ii = roundCurrency(salePrice * (record.taxes.ii / 100));
  const ipi = roundCurrency(salePrice * (record.taxes.ipi / 100));
  const pis = roundCurrency(salePrice * (record.taxes.pis / 100));
  const cofins = roundCurrency(salePrice * (record.taxes.cofins / 100));
  const icms = roundCurrency(salePrice * (icmsRate / 100));
  const total = roundCurrency(ii + ipi + pis + cofins + icms);

  return {
    ii: { rate: record.taxes.ii, value: ii },
    ipi: { rate: record.taxes.ipi, value: ipi },
    pis: { rate: record.taxes.pis, value: pis },
    cofins: { rate: record.taxes.cofins, value: cofins },
    icms: { rate: icmsRate, value: icms },
    total,
    effectiveRate: salePrice > 0 ? (total / salePrice) * 100 : 0,
  } as NcmEstimate;
}
