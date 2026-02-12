/**
 * Cores dos marketplaces/canais — alinhadas ao dashboard e ao backend (config/marketplace.ts).
 * Usado nos gráficos do agente para manter as mesmas cores do dashboard.
 */
const MARKETPLACE_COLORS: Record<string, string> = {
  bagy: '#38b6ff',
  shopee: '#EE4D2D',
  shein: '#363636',
  'mercado livre': '#FFD60A',
  mercadolivre: '#FFD60A',
  ml: '#FFD60A',
  'loja física': '#E6007E',
  loja_fisica: '#E6007E',
  'loja fisica': '#E6007E',
  physical_store: '#E6007E',
  ambro: '#E6007E',
};

const FALLBACK_COLORS = ['#8B5CF6', '#F59E0B', '#10B981', '#EC4899', '#6366F1'];
let fallbackIdx = 0;

function normalizeKey(label: string): string {
  return label
    .toLowerCase()
    .trim()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/\s+/g, ' ');
}

/**
 * Retorna a cor do marketplace/canal pelo nome (igual ao dashboard).
 * Aceita variações: "Bagy", "Mercado Livre", "ML", "Loja Física", etc.
 */
export function getMarketplaceColor(label: string): string {
  if (!label || typeof label !== 'string') return FALLBACK_COLORS[fallbackIdx++ % FALLBACK_COLORS.length];
  const key = normalizeKey(label).replace(/\s+/g, '_');
  if (MARKETPLACE_COLORS[key]) return MARKETPLACE_COLORS[key];
  const withSpaces = normalizeKey(label);
  if (MARKETPLACE_COLORS[withSpaces]) return MARKETPLACE_COLORS[withSpaces];
  // match parcial
  for (const [k, color] of Object.entries(MARKETPLACE_COLORS)) {
    const kNorm = k.replace(/_/g, ' ');
    if (withSpaces.includes(kNorm) || kNorm.includes(withSpaces)) return color;
  }
  return FALLBACK_COLORS[fallbackIdx++ % FALLBACK_COLORS.length];
}
