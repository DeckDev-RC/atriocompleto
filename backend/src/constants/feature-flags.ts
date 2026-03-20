export const FEATURE_REGISTRY = {
  ecommerce:   { label: 'E-Commerce',    path: '/' },
  insights:    { label: 'Insights',      path: '/insights' },
  optimus:     { label: 'Optimus',       path: '/agente' },
  sugestoes:   { label: 'Sugestões',     path: '/optimus/sugestoes' },
  padroes:     { label: 'Padrões',       path: '/analytics/patterns' },
  estrategia:  { label: 'Estratégia',    path: '/estrategia' },
  relatorios:  { label: 'Relatórios',    path: '/relatorios' },
  campanhas:   { label: 'Campanhas',     path: '/campanhas' },
  benchmarking:{ label: 'Benchmarking',  path: '/benchmarking' },
  calculadora: { label: 'Calculadora',   path: '/simulacoes' },
  estoque_eoq: { label: 'Estoque EOQ',   path: '/simulacoes/inventory' },
} as const;

export type FeatureKey = keyof typeof FEATURE_REGISTRY;

export const VALID_FEATURE_KEYS = Object.keys(FEATURE_REGISTRY) as FeatureKey[];
