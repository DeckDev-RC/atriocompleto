/**
 * Configuração centralizada de marketplaces.
 * Mapeia IDs do banco para labels, cores e tipos de ícone.
 */
export interface MarketplaceInfo {
  label: string;
  color: string;
  iconType: string;
}

const config: Record<string, MarketplaceInfo> = {
  bagy:           { label: "Bagy",          color: "#38b6ff", iconType: "bagy" },
  shopee:         { label: "Shopee",        color: "#EE4D2D", iconType: "shopee" },
  shein:          { label: "Shein",         color: "#363636", iconType: "shein" },
  mercado_livre:  { label: "Mercado Livre", color: "#FFD60A", iconType: "ml" },
  mercadolivre:   { label: "Mercado Livre", color: "#FFD60A", iconType: "ml" },
  loja_fisica:    { label: "Loja Física",   color: "#34C759", iconType: "store" },
  physical_store: { label: "Loja Física",   color: "#34C759", iconType: "store" },
};

const FALLBACK_COLORS = ["#8B5CF6", "#F59E0B", "#10B981", "#EC4899", "#6366F1"];
let fallbackIdx = 0;

/**
 * Resolve marketplace info from a DB value (case-insensitive).
 */
export function getMarketplaceInfo(dbValue: string): MarketplaceInfo {
  const key = dbValue.toLowerCase().trim().replace(/\s+/g, "_");
  if (config[key]) return config[key];

  // Partial match
  for (const [k, v] of Object.entries(config)) {
    if (key.includes(k) || k.includes(key)) return v;
  }

  // Fallback
  const color = FALLBACK_COLORS[fallbackIdx % FALLBACK_COLORS.length];
  fallbackIdx++;
  return {
    label: dbValue.charAt(0).toUpperCase() + dbValue.slice(1),
    color,
    iconType: "default",
  };
}
