export const FEATURE_REGISTRY = {
  ecommerce: { label: 'E-Commerce', path: '/', defaultEnabled: true },
  insights: { label: 'Insights', path: '/insights', defaultEnabled: true },
  optimus: { label: 'Optimus', path: '/agente', defaultEnabled: true },
  sugestoes: { label: 'Sugestões', path: '/optimus/sugestoes', defaultEnabled: true },
  padroes: { label: 'Padrões', path: '/analytics/patterns', defaultEnabled: true },
  estrategia: { label: 'Estratégia', path: '/estrategia', defaultEnabled: true },
  relatorios: { label: 'Relatórios', path: '/relatorios', defaultEnabled: true },
  campanhas: { label: 'Campanhas', path: '/campanhas', defaultEnabled: true },
  benchmarking: { label: 'Benchmarking', path: '/benchmarking', defaultEnabled: true },
  calculadora: { label: 'Calculadora de Taxa', path: '/simulacoes', defaultEnabled: true },
  calculadora_precos: {
    label: 'Calculadora de Preços',
    path: '/simulacoes/precos',
    defaultEnabled: false,
  },
  estoque_eoq: { label: 'Estoque EOQ', path: '/simulacoes/inventory', defaultEnabled: true },
} as const;

export type FeatureKey = keyof typeof FEATURE_REGISTRY;

export const VALID_FEATURE_KEYS = Object.keys(FEATURE_REGISTRY) as FeatureKey[];

export function getDefaultFeatureFlags(): Record<FeatureKey, boolean> {
  return Object.fromEntries(
    (Object.entries(FEATURE_REGISTRY) as Array<[FeatureKey, (typeof FEATURE_REGISTRY)[FeatureKey]]>)
      .map(([key, config]) => [key, config.defaultEnabled]),
  ) as Record<FeatureKey, boolean>;
}

export function isFeatureEnabled(
  featureKey: FeatureKey | string,
  flags?: Record<string, boolean> | null,
) {
  const registryEntry = FEATURE_REGISTRY[featureKey as FeatureKey];
  const fallback = registryEntry?.defaultEnabled ?? true;
  if (!flags || Object.keys(flags).length === 0) return fallback;
  return flags[featureKey] ?? fallback;
}
