export type PriceCalculatorMarketplaceId =
  | 'amazon'
  | 'magalu'
  | 'mercadolivre'
  | 'netshoes'
  | 'shein'
  | 'shopee';

export interface PriceCalculatorInputs {
  productName: string;
  weightGrams: number;
  cost: number;
  operationalCost: number;
  marginPercent: number;
  taxPercent: number;
  difalPercent: number;
}

export interface PriceCalculatorMarketplaceMeta {
  id: PriceCalculatorMarketplaceId;
  name: string;
  shortLabel: string;
  accentColor: string;
  promotionPercent: number;
}

export interface PriceCalculatorResult {
  marketplaceId: PriceCalculatorMarketplaceId;
  marketplaceName: string;
  shortLabel: string;
  accentColor: string;
  promotionPercent: number;
  practicedPrice: number;
  fullPrice: number;
  profit: number;
  shippingCost: number;
  commissionPercent: number;
  commissionAmount: number;
  taxAmount: number;
  difalAmount: number;
  denominator: number;
  iterations: number;
  calculationBaseLabel: string;
  calculationBaseValue: number | null;
  calculationBaseDisplay: string;
  resolvedBand: string;
  ruleSummary: string;
  note?: string;
  warning?: string;
}

export interface PriceCalculatorManagementRow {
  marketplaceId: PriceCalculatorMarketplaceId;
  marketplaceName: string;
  shortLabel: string;
  accentColor: string;
  commissionPercent: number;
  promotionPercent: number;
  finalShipping: number;
  baseLabel: string;
  baseValue: number | null;
  baseDisplay: string;
  resolvedBand: string;
  ruleSummary: string;
  note?: string;
  warning?: string;
}

export interface PriceCalculatorRuleState {
  taxPercent: number;
  difalPercent: number;
  netshoesCommissionBasePrice: number | null;
  managementRows: PriceCalculatorManagementRow[];
}

interface WeightTier {
  maxKg: number;
  fee: number;
  label: string;
}

interface PriceBand<TValue> {
  label: string;
  min?: number;
  max?: number;
  value: TValue;
}

interface ResolvedWeightTier {
  fee: number;
  label: string;
  warning?: string;
}

interface ResultBuildArgs {
  marketplaceId: PriceCalculatorMarketplaceId;
  inputs: PriceCalculatorInputs;
  commissionPercent: number;
  shippingCost: number;
  iterations: number;
  calculationBaseLabel: string;
  calculationBaseValue: number | null;
  calculationBaseDisplay: string;
  resolvedBand: string;
  ruleSummary: string;
  note?: string;
  warning?: string;
}

export const PRICE_CALCULATOR_MARKETPLACE_ORDER: PriceCalculatorMarketplaceId[] = [
  'amazon',
  'magalu',
  'mercadolivre',
  'netshoes',
  'shein',
  'shopee',
];

export const PRICE_CALCULATOR_META: Record<
  PriceCalculatorMarketplaceId,
  PriceCalculatorMarketplaceMeta
> = {
  amazon: {
    id: 'amazon',
    name: 'Amazon',
    shortLabel: 'AMZ',
    accentColor: '#111111',
    promotionPercent: 20,
  },
  magalu: {
    id: 'magalu',
    name: 'Magazine Luiza',
    shortLabel: 'MGL',
    accentColor: '#0086FF',
    promotionPercent: 20,
  },
  mercadolivre: {
    id: 'mercadolivre',
    name: 'Mercado Livre',
    shortLabel: 'ML',
    accentColor: '#FFD60A',
    promotionPercent: 12,
  },
  netshoes: {
    id: 'netshoes',
    name: 'Netshoes',
    shortLabel: 'NET',
    accentColor: '#1A57F0',
    promotionPercent: 20,
  },
  shein: {
    id: 'shein',
    name: 'SHEIN',
    shortLabel: 'SHN',
    accentColor: '#222222',
    promotionPercent: 25,
  },
  shopee: {
    id: 'shopee',
    name: 'Shopee',
    shortLabel: 'SHP',
    accentColor: '#EE4D2D',
    promotionPercent: 40,
  },
};

const DIVISOR_ZERO_EPSILON = 1e-9;
const AMAZON_COMMISSION_PERCENT = 15;
const MAGALU_COMMISSION_PERCENT = 18;
const MERCADO_LIVRE_COMMISSION_PERCENT = 14;
const NETSHOES_LOW_COMMISSION_PERCENT = 26;
const NETSHOES_HIGH_COMMISSION_PERCENT = 31;
const NETSHOES_COMMISSION_THRESHOLD = 150;
const NETSHOES_FIXED_COST = 5;
const SHEIN_COMMISSION_PERCENT = 16;
const SHOPEE_COMMISSION_PERCENT = 20;
const SHOPEE_FIXED_COST = 4;

const AMAZON_WEIGHT_TIERS: WeightTier[] = [
  { maxKg: 0.25, fee: 0, label: '0 a 250 g' },
  { maxKg: 0.5, fee: 0, label: '250 g a 500 g' },
  { maxKg: 1, fee: 0, label: '500 g a 1 kg' },
  { maxKg: 2, fee: 0, label: '1 a 2 kg' },
  { maxKg: 3, fee: 0, label: '2 a 3 kg' },
  { maxKg: 4, fee: 0, label: '3 a 4 kg' },
  { maxKg: 5, fee: 0, label: '4 a 5 kg' },
  { maxKg: 6, fee: 0, label: '5 a 6 kg' },
  { maxKg: 7, fee: 0, label: '6 a 7 kg' },
  { maxKg: 8, fee: 0, label: '7 a 8 kg' },
  { maxKg: 9, fee: 0, label: '8 a 9 kg' },
  { maxKg: 10, fee: 0, label: '9 a 10 kg' },
];

const AMAZON_PRICE_BANDS: Array<PriceBand<{ fixedFee?: number; tierFees?: number[]; additionalFee?: number }>> = [
  { label: 'Ate R$ 30', max: 30, value: { fixedFee: 4.5 } },
  { label: 'R$ 30 a 49,99', min: 30, max: 49.99, value: { fixedFee: 6.5 } },
  { label: 'R$ 50 a 78,99', min: 50, max: 78.99, value: { fixedFee: 6.75 } },
  {
    label: 'R$ 79 a 99,99',
    min: 79,
    max: 99.99,
    value: {
      tierFees: [11.95, 12.85, 13.45, 14, 14.95, 16.15, 17, 25, 26, 27, 28, 39.5],
      additionalFee: 3.05,
    },
  },
  {
    label: 'R$ 100 a 119,99',
    min: 100,
    max: 119.99,
    value: {
      tierFees: [13.95, 15, 15.7, 16.35, 17.45, 18.85, 19.9, 30, 31, 32, 33, 46],
      additionalFee: 3.05,
    },
  },
  {
    label: 'R$ 120 a 149,99',
    min: 120,
    max: 149.99,
    value: {
      tierFees: [15.95, 17.15, 17.95, 18.75, 19.95, 21.55, 22.75, 34, 35, 36, 37, 52.75],
      additionalFee: 3.05,
    },
  },
  {
    label: 'R$ 150 a 199,99',
    min: 150,
    max: 199.99,
    value: {
      tierFees: [17.95, 19.3, 20.2, 21.1, 22.4, 24.2, 25.6, 38, 39, 40, 41, 59],
      additionalFee: 3.05,
    },
  },
  {
    label: 'Acima de R$ 200',
    min: 200,
    value: {
      tierFees: [19.95, 20.45, 21.45, 22.95, 23.95, 25.95, 27.95, 36.95, 39.45, 40.45, 45.45, 59.95],
      additionalFee: 4,
    },
  },
];

const MAGALU_WEIGHT_TIERS: WeightTier[] = [
  { maxKg: 0.5, fee: 35.9, label: 'Ate 500 g' },
  { maxKg: 1, fee: 40.9, label: '500 g a 1 kg' },
  { maxKg: 2, fee: 42.9, label: '1 a 2 kg' },
  { maxKg: 5, fee: 50.9, label: '2 a 5 kg' },
  { maxKg: 9, fee: 77.9, label: '5 a 9 kg' },
  { maxKg: 13, fee: 98.9, label: '9 a 13 kg' },
];

const MERCADO_LIVRE_WEIGHT_TIERS: WeightTier[] = [
  { maxKg: 0.3, fee: 0, label: 'ate 0,3 kg' },
  { maxKg: 0.5, fee: 0, label: 'ate 0,5 kg' },
  { maxKg: 1, fee: 0, label: 'ate 1 kg' },
  { maxKg: 2, fee: 0, label: 'ate 2 kg' },
  { maxKg: 3, fee: 0, label: 'ate 3 kg' },
  { maxKg: 4, fee: 0, label: 'ate 4 kg' },
  { maxKg: Number.POSITIVE_INFINITY, fee: 0, label: 'acima de 4 kg' },
];

const MERCADO_LIVRE_PRICE_BANDS: Array<PriceBand<number[]>> = [
  { label: 'Abaixo de R$ 79', max: 79, value: [6.75, 6.75, 6.75, 6.75, 6.75, 6.75, 6.75] },
  { label: 'R$ 79 a 99,99', min: 79, max: 99.99, value: [11.97, 12.87, 13.47, 14.07, 14.97, 16.17, 17.07] },
  { label: 'R$ 100 a 119,99', min: 100, max: 119.99, value: [13.97, 15.02, 15.72, 16.42, 17.47, 18.87, 19.92] },
  { label: 'R$ 120 a 149,99', min: 120, max: 149.99, value: [15.96, 17.16, 17.96, 18.76, 19.96, 21.56, 22.76] },
  { label: 'R$ 150 a 199,99', min: 150, max: 199.99, value: [17.96, 19.31, 20.21, 21.11, 22.46, 24.26, 25.61] },
  { label: 'Acima de R$ 200', min: 200, value: [19.95, 21.45, 22.45, 23.45, 24.95, 26.95, 28.45] },
];

const SHEIN_WEIGHT_TIERS: WeightTier[] = [
  { maxKg: 0.3, fee: 4, label: 'ate 0,3 kg' },
  { maxKg: 0.6, fee: 5, label: '0,3 a 0,6 kg' },
  { maxKg: 0.9, fee: 6, label: '0,6 a 0,9 kg' },
  { maxKg: 1.2, fee: 8, label: '0,9 a 1,2 kg' },
  { maxKg: 1.5, fee: 10, label: '1,2 a 1,5 kg' },
  { maxKg: 2, fee: 12, label: '1,5 a 2 kg' },
  { maxKg: 5, fee: 15, label: '2 a 5 kg' },
  { maxKg: 9, fee: 32, label: '5 a 9 kg' },
  { maxKg: 13, fee: 63, label: '9 a 13 kg' },
  { maxKg: 17, fee: 73, label: '13 a 17 kg' },
  { maxKg: 23, fee: 89, label: '17 a 23 kg' },
  { maxKg: Number.POSITIVE_INFINITY, fee: 106, label: 'acima de 23 kg' },
];

export function createDefaultPriceCalculatorInputs(): PriceCalculatorInputs {
  return {
    productName: '',
    weightGrams: 0,
    cost: 0,
    operationalCost: 0,
    marginPercent: 10,
    taxPercent: 7,
    difalPercent: 0,
  };
}

function roundCurrency(value: number) {
  return Math.round(value * 100) / 100;
}

function isZeroInputState(inputs: PriceCalculatorInputs) {
  return inputs.cost === 0 && inputs.operationalCost === 0;
}

function getWeightKg(weightGrams: number) {
  return Math.max(weightGrams, 0) / 1000;
}

function getDenominator(inputs: PriceCalculatorInputs, commissionPercent: number) {
  return 1 - (inputs.taxPercent + inputs.difalPercent + commissionPercent + inputs.marginPercent) / 100;
}

function hasZeroDivisor(denominator: number) {
  return Math.abs(denominator) < DIVISOR_ZERO_EPSILON;
}

function calculatePracticedPrice(
  inputs: PriceCalculatorInputs,
  commissionPercent: number,
  shippingCost: number,
) {
  if (isZeroInputState(inputs)) return 0;

  const denominator = getDenominator(inputs, commissionPercent);
  if (hasZeroDivisor(denominator)) return null;

  return (inputs.cost + inputs.operationalCost + shippingCost) / denominator;
}

function calculateBasePrice(
  inputs: PriceCalculatorInputs,
  commissionPercent: number,
) {
  return calculatePracticedPrice(inputs, commissionPercent, 0);
}

function calculateFullPrice(practicedPrice: number, promotionPercent: number) {
  const factor = 1 - promotionPercent / 100;
  if (hasZeroDivisor(factor)) return null;
  return practicedPrice / factor;
}

function calculateProfit(
  practicedPrice: number,
  inputs: PriceCalculatorInputs,
  shippingCost: number,
  commissionPercent: number,
) {
  const taxAmount = practicedPrice * (inputs.taxPercent / 100);
  const difalAmount = practicedPrice * (inputs.difalPercent / 100);
  const commissionAmount = practicedPrice * (commissionPercent / 100);
  const profit =
    practicedPrice -
    inputs.cost -
    inputs.operationalCost -
    shippingCost -
    taxAmount -
    difalAmount -
    commissionAmount;

  return {
    profit,
    taxAmount,
    difalAmount,
    commissionAmount,
  };
}

function valueMatchesBand(value: number, band: PriceBand<unknown>) {
  const minOk = band.min === undefined ? true : value >= band.min;
  const maxOk = band.max === undefined ? true : value <= band.max;
  return minOk && maxOk;
}

function resolveWeightTier(weightKg: number, tiers: WeightTier[]): ResolvedWeightTier {
  const tier = tiers.find((item) => weightKg <= item.maxKg) ?? tiers[tiers.length - 1]!;
  return {
    fee: tier.fee,
    label: tier.label,
  };
}

function resolveWeightTierWithFallback(weightKg: number, tiers: WeightTier[]): ResolvedWeightTier {
  const lastTier = tiers[tiers.length - 1]!;
  const tier = tiers.find((item) => weightKg <= item.maxKg);

  if (tier) {
    return {
      fee: tier.fee,
      label: tier.label,
    };
  }

  return {
    fee: lastTier.fee,
    label: `${lastTier.label} (ultima faixa disponivel)`,
    warning: 'Tabela recebida do cliente vai ate 13 kg; acima disso foi aplicada a ultima faixa disponivel.',
  };
}

function resolveAmazonWeightFee(weightKg: number, tierFees: number[], additionalFee: number): ResolvedWeightTier {
  const cappedIndex = AMAZON_WEIGHT_TIERS.findIndex((tier) => weightKg <= tier.maxKg);

  if (cappedIndex >= 0) {
    const tier = AMAZON_WEIGHT_TIERS[cappedIndex]!;
    return {
      fee: tierFees[cappedIndex]!,
      label: tier.label,
    };
  }

  const extraKg = Math.ceil(Math.max(weightKg - 10, 0));
  return {
    fee: tierFees[tierFees.length - 1]! + extraKg * additionalFee,
    label: `9 a 10 kg + ${extraKg} kg adicional`,
  };
}

function getNetshoesCommissionPercent(inputs: PriceCalculatorInputs) {
  const basePrice = calculateBasePrice(inputs, NETSHOES_LOW_COMMISSION_PERCENT);
  if (basePrice === null) return null;

  return basePrice < NETSHOES_COMMISSION_THRESHOLD
    ? NETSHOES_LOW_COMMISSION_PERCENT
    : NETSHOES_HIGH_COMMISSION_PERCENT;
}

function buildResult(args: ResultBuildArgs): PriceCalculatorResult {
  const {
    marketplaceId,
    inputs,
    commissionPercent,
    shippingCost,
    iterations,
    calculationBaseLabel,
    calculationBaseValue,
    calculationBaseDisplay,
    resolvedBand,
    ruleSummary,
    note,
    warning,
  } = args;
  const meta = PRICE_CALCULATOR_META[marketplaceId];
  const denominator = getDenominator(inputs, commissionPercent);

  if (warning && hasZeroDivisor(denominator)) {
    return {
      marketplaceId,
      marketplaceName: meta.name,
      shortLabel: meta.shortLabel,
      accentColor: meta.accentColor,
      promotionPercent: meta.promotionPercent,
      practicedPrice: 0,
      fullPrice: 0,
      profit: 0,
      shippingCost: roundCurrency(shippingCost),
      commissionPercent,
      commissionAmount: 0,
      taxAmount: 0,
      difalAmount: 0,
      denominator: roundCurrency(denominator),
      iterations,
      calculationBaseLabel,
      calculationBaseValue,
      calculationBaseDisplay,
      resolvedBand,
      ruleSummary,
      note,
      warning,
    };
  }

  const practicedPrice = calculatePracticedPrice(inputs, commissionPercent, shippingCost);
  const fullPrice = practicedPrice === null ? null : calculateFullPrice(practicedPrice, meta.promotionPercent);

  if (practicedPrice === null || fullPrice === null) {
    return {
      marketplaceId,
      marketplaceName: meta.name,
      shortLabel: meta.shortLabel,
      accentColor: meta.accentColor,
      promotionPercent: meta.promotionPercent,
      practicedPrice: 0,
      fullPrice: 0,
      profit: 0,
      shippingCost: roundCurrency(shippingCost),
      commissionPercent,
      commissionAmount: 0,
      taxAmount: 0,
      difalAmount: 0,
      denominator: roundCurrency(denominator),
      iterations,
      calculationBaseLabel,
      calculationBaseValue,
      calculationBaseDisplay,
      resolvedBand,
      ruleSummary,
      note,
      warning: warning ?? 'Os parametros zeraram o divisor do calculo.',
    };
  }

  const { profit, taxAmount, difalAmount, commissionAmount } = calculateProfit(
    practicedPrice,
    inputs,
    shippingCost,
    commissionPercent,
  );

  return {
    marketplaceId,
    marketplaceName: meta.name,
    shortLabel: meta.shortLabel,
    accentColor: meta.accentColor,
    promotionPercent: meta.promotionPercent,
    practicedPrice,
    fullPrice,
    profit,
    shippingCost: roundCurrency(shippingCost),
    commissionPercent,
    commissionAmount,
    taxAmount,
    difalAmount,
    denominator: roundCurrency(denominator),
    iterations,
    calculationBaseLabel,
    calculationBaseValue,
    calculationBaseDisplay,
    resolvedBand,
    ruleSummary,
    note,
    warning,
  };
}

function calculateAmazonResult(inputs: PriceCalculatorInputs): PriceCalculatorResult {
  const ruleSummary = 'Tarifa DBA oficial por preco praticado e faixa de peso.';
  const denominator = getDenominator(inputs, AMAZON_COMMISSION_PERCENT);

  if (hasZeroDivisor(denominator)) {
    return buildResult({
      marketplaceId: 'amazon',
      inputs,
      commissionPercent: AMAZON_COMMISSION_PERCENT,
      shippingCost: 0,
      iterations: 1,
      calculationBaseLabel: 'Preco praticado',
      calculationBaseValue: null,
      calculationBaseDisplay: 'Indefinido',
      resolvedBand: 'Indefinido',
      ruleSummary,
      note: 'A Amazon resolve o frete do proprio canal com base no preco praticado e peso.',
      warning: 'Os parametros zeraram o divisor do calculo.',
    });
  }

  const candidates = AMAZON_PRICE_BANDS.map((band) => {
    if (band.value.fixedFee !== undefined) {
      return {
        band,
        shippingCost: band.value.fixedFee,
        resolvedBand: band.label,
      };
    }

    const weightTier = resolveAmazonWeightFee(
      getWeightKg(inputs.weightGrams),
      band.value.tierFees ?? [],
      band.value.additionalFee ?? 0,
    );

    return {
      band,
      shippingCost: weightTier.fee,
      resolvedBand: `${band.label} | ${weightTier.label}`,
    };
  });

  const matchingIndex = candidates.findIndex((candidate) => {
    const practicedPrice = calculatePracticedPrice(inputs, AMAZON_COMMISSION_PERCENT, candidate.shippingCost);
    return practicedPrice !== null && valueMatchesBand(practicedPrice, candidate.band);
  });

  const candidate = candidates[matchingIndex >= 0 ? matchingIndex : candidates.length - 1]!;
  const practicedPrice = calculatePracticedPrice(inputs, AMAZON_COMMISSION_PERCENT, candidate.shippingCost);

  return buildResult({
    marketplaceId: 'amazon',
    inputs,
    commissionPercent: AMAZON_COMMISSION_PERCENT,
    shippingCost: candidate.shippingCost,
    iterations: matchingIndex >= 0 ? matchingIndex + 1 : candidates.length,
    calculationBaseLabel: 'Preco praticado',
    calculationBaseValue: practicedPrice,
    calculationBaseDisplay: practicedPrice === null ? 'Indefinido' : `Preco praticado ${roundCurrency(practicedPrice).toFixed(2)}`,
    resolvedBand: candidate.resolvedBand,
    ruleSummary,
    note: 'A Amazon foi recalculada pela tabela DBA oficial, usando o proprio preco praticado para escolher a faixa.',
  });
}

function calculateMagaluResult(inputs: PriceCalculatorInputs): PriceCalculatorResult {
  const weightTier = resolveWeightTierWithFallback(getWeightKg(inputs.weightGrams), MAGALU_WEIGHT_TIERS);
  const shippingCost = weightTier.fee + 5;

  return buildResult({
    marketplaceId: 'magalu',
    inputs,
    commissionPercent: MAGALU_COMMISSION_PERCENT,
    shippingCost,
    iterations: 1,
    calculationBaseLabel: 'Peso do produto',
    calculationBaseValue: inputs.weightGrams,
    calculationBaseDisplay: `${inputs.weightGrams} g`,
    resolvedBand: `${weightTier.label} | coluna < 92%`,
    ruleSummary: 'Faixa de peso do Magalu no cenario < 92% sem desconto, somada a R$ 5,00 fixos por pedido.',
    note: 'Comissao ajustada para 18% e frete composto pela faixa do Programa Frete Gratis + R$ 5,00 fixos.',
    warning: weightTier.warning,
  });
}

function calculateMercadoLivreResult(inputs: PriceCalculatorInputs): PriceCalculatorResult {
  const meta = PRICE_CALCULATOR_META.mercadolivre;
  const weightKg = getWeightKg(inputs.weightGrams);
  const ruleSummary = 'Ate R$ 79 usa preco praticado; acima disso usa o preco cheio do proprio canal para definir a faixa de frete.';
  const denominator = getDenominator(inputs, MERCADO_LIVRE_COMMISSION_PERCENT);

  if (hasZeroDivisor(denominator)) {
    return buildResult({
      marketplaceId: 'mercadolivre',
      inputs,
      commissionPercent: MERCADO_LIVRE_COMMISSION_PERCENT,
      shippingCost: 0,
      iterations: 1,
      calculationBaseLabel: 'Preco do canal',
      calculationBaseValue: null,
      calculationBaseDisplay: 'Indefinido',
      resolvedBand: 'Indefinido',
      ruleSummary,
      note: 'O Mercado Livre resolve o frete no proprio canal: abaixo de R$ 79 pelo preco praticado e acima disso pelo preco cheio.',
      warning: 'Os parametros zeraram o divisor do calculo.',
    });
  }

  const candidates = MERCADO_LIVRE_PRICE_BANDS.map((band) => {
    const weightIndex = MERCADO_LIVRE_WEIGHT_TIERS.findIndex((tier) => weightKg <= tier.maxKg);
    const resolvedIndex = weightIndex >= 0 ? weightIndex : MERCADO_LIVRE_WEIGHT_TIERS.length - 1;
    const weightTier = MERCADO_LIVRE_WEIGHT_TIERS[resolvedIndex]!;

    return {
      band,
      shippingCost: band.value[resolvedIndex]!,
      resolvedBand: `${band.label} | ${weightTier.label}`,
    };
  });

  const matchingIndex = candidates.findIndex((candidate) => {
    const practicedPrice = calculatePracticedPrice(inputs, MERCADO_LIVRE_COMMISSION_PERCENT, candidate.shippingCost);
    if (practicedPrice === null) return false;

    if (practicedPrice <= 79) {
      return candidate.band.max !== undefined && candidate.band.max <= 79;
    }

    const fullPrice = calculateFullPrice(practicedPrice, meta.promotionPercent);
    return fullPrice !== null && candidate.band.min !== undefined && candidate.band.min >= 79 && valueMatchesBand(fullPrice, candidate.band);
  });

  const candidate = candidates[matchingIndex >= 0 ? matchingIndex : candidates.length - 1]!;
  const practicedPrice = calculatePracticedPrice(inputs, MERCADO_LIVRE_COMMISSION_PERCENT, candidate.shippingCost);
  const fullPrice = practicedPrice === null ? null : calculateFullPrice(practicedPrice, meta.promotionPercent);
  const calculationBaseLabel = practicedPrice !== null && practicedPrice <= 79 ? 'Preco praticado' : 'Preco cheio';
  const calculationBaseValue = practicedPrice !== null && practicedPrice <= 79 ? practicedPrice : fullPrice;

  return buildResult({
    marketplaceId: 'mercadolivre',
    inputs,
    commissionPercent: MERCADO_LIVRE_COMMISSION_PERCENT,
    shippingCost: candidate.shippingCost,
    iterations: matchingIndex >= 0 ? matchingIndex + 1 : candidates.length,
    calculationBaseLabel,
    calculationBaseValue,
    calculationBaseDisplay: calculationBaseValue === null ? 'Indefinido' : `${calculationBaseLabel} ${roundCurrency(calculationBaseValue).toFixed(2)}`,
    resolvedBand: candidate.resolvedBand,
    ruleSummary,
    note: 'Acima de R$ 79 o Mercado Livre passa a usar o preco cheio para escolher a faixa de frete, conforme regra comercial do cliente.',
  });
}

function calculateNetshoesResult(inputs: PriceCalculatorInputs): PriceCalculatorResult {
  const basePrice = calculateBasePrice(inputs, NETSHOES_LOW_COMMISSION_PERCENT);
  const commissionPercent = getNetshoesCommissionPercent(inputs);
  const resolvedCommission = commissionPercent ?? NETSHOES_LOW_COMMISSION_PERCENT;

  return buildResult({
    marketplaceId: 'netshoes',
    inputs,
    commissionPercent: resolvedCommission,
    shippingCost: NETSHOES_FIXED_COST,
    iterations: 1,
    calculationBaseLabel: 'Base da comissao (26%)',
    calculationBaseValue: basePrice,
    calculationBaseDisplay: basePrice === null ? 'Indefinido' : `Base ${roundCurrency(basePrice).toFixed(2)}`,
    resolvedBand: resolvedCommission === NETSHOES_LOW_COMMISSION_PERCENT ? 'Abaixo de R$ 150' : 'A partir de R$ 150',
    ruleSummary: 'Base sem frete com 26% define 26% ou 31%; o canal agora soma R$ 5,00 fixos por pedido.',
    note: resolvedCommission === NETSHOES_LOW_COMMISSION_PERCENT
      ? 'Comissao de 26% mantida pela base da Netshoes, com custo fixo de R$ 5,00 por pedido.'
      : 'Comissao de 31% mantida pela base da Netshoes, com custo fixo de R$ 5,00 por pedido.',
    warning: commissionPercent === null ? 'Nao foi possivel determinar a base da comissao da Netshoes; o calculo caiu no padrao de 26%.' : undefined,
  });
}

function calculateSheinResult(inputs: PriceCalculatorInputs): PriceCalculatorResult {
  const weightTier = resolveWeightTier(getWeightKg(inputs.weightGrams), SHEIN_WEIGHT_TIERS);

  return buildResult({
    marketplaceId: 'shein',
    inputs,
    commissionPercent: SHEIN_COMMISSION_PERCENT,
    shippingCost: weightTier.fee,
    iterations: 1,
    calculationBaseLabel: 'Peso do produto',
    calculationBaseValue: inputs.weightGrams,
    calculationBaseDisplay: `${inputs.weightGrams} g`,
    resolvedBand: weightTier.label,
    ruleSummary: 'Frete por faixa de peso conforme tabela operacional recebida do cliente.',
    note: 'A SHEIN deixou de usar frete fixo e agora aplica a tabela por peso enviada pelo cliente.',
  });
}

function calculateShopeeResult(inputs: PriceCalculatorInputs): PriceCalculatorResult {
  return buildResult({
    marketplaceId: 'shopee',
    inputs,
    commissionPercent: SHOPEE_COMMISSION_PERCENT,
    shippingCost: SHOPEE_FIXED_COST,
    iterations: 1,
    calculationBaseLabel: 'Regra atual do canal',
    calculationBaseValue: null,
    calculationBaseDisplay: 'Pendente de tabela contratual',
    resolvedBand: 'Pendente de regra contratual',
    ruleSummary: 'Shopee mantida com regra atual enquanto a tabela comercial especifica nao e enviada.',
    note: 'O subsido PIX nao entra neste calculo. O frete permanece no valor atual ate a regra contratual ser formalizada.',
    warning: 'Regra de frete da Shopee ainda pendente de validacao comercial; o canal segue temporariamente com o valor fixo atual.',
  });
}

export function calculatePriceCalculatorResults(inputs: PriceCalculatorInputs) {
  return [
    calculateAmazonResult(inputs),
    calculateMagaluResult(inputs),
    calculateMercadoLivreResult(inputs),
    calculateNetshoesResult(inputs),
    calculateSheinResult(inputs),
    calculateShopeeResult(inputs),
  ];
}

export function calculatePriceCalculatorRuleState(inputs: PriceCalculatorInputs): PriceCalculatorRuleState {
  const results = calculatePriceCalculatorResults(inputs);

  return {
    taxPercent: inputs.taxPercent,
    difalPercent: inputs.difalPercent,
    netshoesCommissionBasePrice: calculateBasePrice(inputs, NETSHOES_LOW_COMMISSION_PERCENT),
    managementRows: results.map((result) => ({
      marketplaceId: result.marketplaceId,
      marketplaceName: result.marketplaceName,
      shortLabel: result.shortLabel,
      accentColor: result.accentColor,
      commissionPercent: result.commissionPercent,
      promotionPercent: result.promotionPercent,
      finalShipping: result.shippingCost,
      baseLabel: result.calculationBaseLabel,
      baseValue: result.calculationBaseValue,
      baseDisplay: result.calculationBaseDisplay,
      resolvedBand: result.resolvedBand,
      ruleSummary: result.ruleSummary,
      note: result.note,
      warning: result.warning,
    })),
  };
}

export const calculatePriceCalculatorWorkbookState = calculatePriceCalculatorRuleState;
