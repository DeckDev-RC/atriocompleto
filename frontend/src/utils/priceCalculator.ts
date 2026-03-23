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
  note?: string;
  warning?: string;
}

export interface PriceCalculatorManagementRow {
  marketplaceId: PriceCalculatorMarketplaceId;
  marketplaceName: string;
  shortLabel: string;
  accentColor: string;
  referenceValue: number;
  commissionPercent: number;
  promotionPercent: number;
  finalShipping: number;
  helperBase: string;
  ruleSummary: string;
  note?: string;
  warning?: string;
}

export interface PriceCalculatorWorkbookState {
  taxPercent: number;
  difalPercent: number;
  ap1BasePrice: number | null;
  ap2BasePrice: number | null;
  netshoesCommissionPercent: number | null;
  managementRows: PriceCalculatorManagementRow[];
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

const PRICE_CALCULATOR_REFERENCE_VALUES: Record<PriceCalculatorMarketplaceId, number> = {
  amazon: 0,
  magalu: 79,
  mercadolivre: 79,
  netshoes: 150,
  shein: 0,
  shopee: 0,
};

const PRICE_CALCULATOR_HELPER_BASES: Record<PriceCalculatorMarketplaceId, string> = {
  amazon: 'Peso (J7)',
  magalu: 'AP1 + Peso',
  mercadolivre: 'AP1 + Peso',
  netshoes: 'AP2',
  shein: 'AQ5',
  shopee: 'AQ6',
};

const PRICE_CALCULATOR_RULE_SUMMARIES: Record<PriceCalculatorMarketplaceId, string> = {
  amazon: 'Peso < 500 = 13,45; peso = 500 = 17,45; peso > 500 = 19,45.',
  magalu: 'AP1 < 79 = 5,00; depois aplica faixa literal de peso + 5,00.',
  mercadolivre: 'Faixa de AP1 define a tabela de frete por peso em kg.',
  netshoes: 'AP2 < 150 = 26%; caso contrario = 31%.',
  shein: 'Formula usa AQ5, mas o workbook atual sempre resulta em 5,00.',
  shopee: 'Formula usa AQ6, mas o workbook atual sempre resulta em 4,00.',
};

const DIVISOR_ZERO_EPSILON = 1e-9;

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

function getDenominator(inputs: PriceCalculatorInputs, commissionPercent: number) {
  return 1 - (inputs.taxPercent + inputs.difalPercent + commissionPercent + inputs.marginPercent) / 100;
}

function hasZeroDivisor(denominator: number) {
  return Math.abs(denominator) < DIVISOR_ZERO_EPSILON;
}

function calculateWorkbookPrice(
  inputs: PriceCalculatorInputs,
  commissionPercent: number,
  shippingCost: number,
) {
  if (isZeroInputState(inputs)) return 0;

  const denominator = getDenominator(inputs, commissionPercent);
  if (hasZeroDivisor(denominator)) return null;

  return (inputs.cost + inputs.operationalCost + shippingCost) / denominator;
}

function calculateWorkbookBasePrice(
  inputs: PriceCalculatorInputs,
  commissionPercent: number,
) {
  return calculateWorkbookPrice(inputs, commissionPercent, 0);
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

// Mirrors the workbook formula literally, including the narrow middle branch.
function getWorkbookTieredShipping(
  weightGrams: number,
  firstWeightLimit: number,
  firstFee: number,
  secondWeightLimit: number,
  secondFee: number,
  thirdFee: number,
) {
  if (weightGrams < firstWeightLimit) return firstFee;
  if (weightGrams < secondWeightLimit && firstWeightLimit >= weightGrams) return secondFee;
  return thirdFee;
}

function getAmazonShipping(weightGrams: number) {
  return getWorkbookTieredShipping(weightGrams, 500, 13.45, 1000, 17.45, 19.45);
}

function getNetshoesCommissionPercent(inputs: PriceCalculatorInputs) {
  const ap2BasePrice = calculateWorkbookBasePrice(inputs, 26);
  if (ap2BasePrice === null) return null;

  return ap2BasePrice < 150 ? 26 : 31;
}

function getAp1BasePrice(inputs: PriceCalculatorInputs, netshoesCommissionPercent: number) {
  return calculateWorkbookBasePrice(inputs, netshoesCommissionPercent);
}

function getMagaluShipping(ap1BasePrice: number, weightGrams: number) {
  if (ap1BasePrice < 79) return 5;

  return getWorkbookTieredShipping(weightGrams, 500, 22.95, 1000, 25.45, 26.45);
}

function getMercadoLivreShipping(ap1BasePrice: number, weightGrams: number) {
  const weightKg = Math.max(weightGrams, 0) / 1000;
  const priceBands = [
    {
      minPrice: 150,
      fees: [17.96, 19.31, 20.21, 21.11, 22.46, 24.26, 25.61],
    },
    {
      minPrice: 120,
      fees: [15.96, 17.16, 17.96, 18.76, 19.96, 21.56, 22.76],
    },
    {
      minPrice: 100,
      fees: [13.97, 15.02, 15.72, 16.42, 17.47, 18.87, 19.92],
    },
    {
      minPrice: 79,
      fees: [11.97, 12.87, 13.47, 14.07, 14.97, 16.17, 17.07],
    },
  ] as const;

  if (ap1BasePrice > 200) {
    const index =
      weightKg <= 0.3 ? 0 :
      weightKg <= 0.5 ? 1 :
      weightKg <= 1 ? 2 :
      weightKg <= 2 ? 3 :
      weightKg <= 3 ? 4 :
      weightKg <= 4 ? 5 : 6;

    return [19.95, 21.45, 22.45, 23.45, 24.95, 26.95, 28.45][index]!;
  }

  if (ap1BasePrice < 79) return 6.75;

  const band =
    priceBands.find((item) => ap1BasePrice >= item.minPrice) ??
    priceBands[priceBands.length - 1];
  const index =
    weightKg <= 0.3 ? 0 :
    weightKg <= 0.5 ? 1 :
    weightKg <= 1 ? 2 :
    weightKg <= 2 ? 3 :
    weightKg <= 3 ? 4 :
    weightKg <= 4 ? 5 : 6;

  return band.fees[index];
}

function buildResult(
  marketplaceId: PriceCalculatorMarketplaceId,
  inputs: PriceCalculatorInputs,
  commissionPercent: number,
  shippingCost: number,
  note: string,
  iterations = 1,
  warning?: string,
) {
  const meta = PRICE_CALCULATOR_META[marketplaceId];
  const denominator = getDenominator(inputs, commissionPercent);

  if (warning) {
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
      denominator: roundCurrency(denominator * 100) / 100,
      iterations,
      note,
      warning,
    } satisfies PriceCalculatorResult;
  }

  const practicedPrice = calculateWorkbookPrice(inputs, commissionPercent, shippingCost);
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
      denominator: roundCurrency(denominator * 100) / 100,
      iterations,
      note,
      warning: 'Divisor igual a zero em uma das formulas da planilha.',
    } satisfies PriceCalculatorResult;
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
    denominator: roundCurrency(denominator * 100) / 100,
    iterations,
    note,
  } satisfies PriceCalculatorResult;
}

export function calculatePriceCalculatorResults(inputs: PriceCalculatorInputs) {
  const results: PriceCalculatorResult[] = [];
  const netshoesCommission = getNetshoesCommissionPercent(inputs);
  const ap1BasePrice = netshoesCommission === null ? null : getAp1BasePrice(inputs, netshoesCommission);

  results.push(
    buildResult(
      'amazon',
      inputs,
      15,
      getAmazonShipping(inputs.weightGrams),
      'Replica literal da formula Gestao!E2.',
    ),
  );

  results.push(
    buildResult(
      'magalu',
      inputs,
      16,
      ap1BasePrice === null ? 0 : getMagaluShipping(ap1BasePrice, inputs.weightGrams),
      'Replica literal da formula Gestao!E3 usando AP1.',
      1,
      ap1BasePrice === null ? 'A celula auxiliar AP1 da planilha ficou indefinida.' : undefined,
    ),
  );

  results.push(
    buildResult(
      'mercadolivre',
      inputs,
      14,
      ap1BasePrice === null ? 0 : getMercadoLivreShipping(ap1BasePrice, inputs.weightGrams),
      'Replica literal da formula Gestao!E4 usando AP1.',
      1,
      ap1BasePrice === null ? 'A celula auxiliar AP1 da planilha ficou indefinida.' : undefined,
    ),
  );

  results.push(
    buildResult(
      'netshoes',
      inputs,
      netshoesCommission ?? 26,
      0,
      netshoesCommission === 26
        ? 'Comissao de 26% conforme Gestao!F5 e AP2.'
        : 'Comissao de 31% conforme Gestao!F5 e AP2.',
      1,
      netshoesCommission === null ? 'A celula auxiliar AP2 da planilha ficou indefinida.' : undefined,
    ),
  );

  results.push(
    buildResult(
      'shein',
      inputs,
      16,
      5,
      'Replica literal das formulas Gestao!E6 e Calculadora!AQ5.',
    ),
  );

  results.push(
    buildResult(
      'shopee',
      inputs,
      20,
      4,
      'Replica literal das formulas Gestao!E7 e Calculadora!AQ6.',
    ),
  );

  return results;
}

export function calculatePriceCalculatorWorkbookState(inputs: PriceCalculatorInputs): PriceCalculatorWorkbookState {
  const ap2BasePrice = calculateWorkbookBasePrice(inputs, 26);
  const netshoesCommissionPercent = getNetshoesCommissionPercent(inputs);
  const ap1BasePrice = netshoesCommissionPercent === null ? null : getAp1BasePrice(inputs, netshoesCommissionPercent);
  const results = calculatePriceCalculatorResults(inputs);

  return {
    taxPercent: inputs.taxPercent,
    difalPercent: inputs.difalPercent,
    ap1BasePrice,
    ap2BasePrice,
    netshoesCommissionPercent,
    managementRows: results.map((result) => ({
      marketplaceId: result.marketplaceId,
      marketplaceName: result.marketplaceName,
      shortLabel: result.shortLabel,
      accentColor: result.accentColor,
      referenceValue: PRICE_CALCULATOR_REFERENCE_VALUES[result.marketplaceId],
      commissionPercent: result.commissionPercent,
      promotionPercent: result.promotionPercent,
      finalShipping: result.shippingCost,
      helperBase: PRICE_CALCULATOR_HELPER_BASES[result.marketplaceId],
      ruleSummary: PRICE_CALCULATOR_RULE_SUMMARIES[result.marketplaceId],
      note: result.note,
      warning: result.warning,
    })),
  };
}
