import {
  Boxes,
  CalendarDays,
  CirclePercent,
  FileText,
  HeartHandshake,
  LineChart,
  PackageSearch,
  TrendingUp,
  Users,
} from 'lucide-react';

export interface ReportTemplateSummary {
  id: string;
  key: string;
  scope: 'system' | 'tenant' | 'user';
  name: string;
  description: string | null;
  category: string;
  tags: string[];
  icon: string | null;
  preview_image_url: string | null;
  featured: boolean;
  use_count: number;
  dataset: 'sales' | 'products' | 'customers';
  dimensions_count: number;
  metrics_count: number;
}

interface TemplatesGalleryProps {
  templates: ReportTemplateSummary[];
  categories: string[];
  search: string;
  category: string;
  loading: boolean;
  usingTemplateId?: string | null;
  canUse: boolean;
  onSearchChange: (value: string) => void;
  onCategoryChange: (value: string) => void;
  onUse: (template: ReportTemplateSummary) => Promise<void>;
}

const ICONS = {
  TrendingUp,
  CalendarDays,
  LineChart,
  PackageSearch,
  Boxes,
  CirclePercent,
  Users,
  HeartHandshake,
  FileText,
} as const;

const DATASET_LABELS: Record<ReportTemplateSummary['dataset'], string> = {
  sales: 'Vendas',
  products: 'Produtos',
  customers: 'Clientes',
};

const SCOPE_LABELS: Record<ReportTemplateSummary['scope'], string> = {
  system: 'Sistema',
  tenant: 'Equipe',
  user: 'Meu',
};

const CARD_ACCENTS: Record<ReportTemplateSummary['dataset'], string> = {
  sales: 'from-emerald-500/18 via-teal-500/10 to-transparent',
  products: 'from-sky-500/18 via-cyan-500/10 to-transparent',
  customers: 'from-amber-500/18 via-orange-500/10 to-transparent',
};

function resolveIcon(name: string | null) {
  if (!name) return FileText;
  if (name === 'PercentCircle') return CirclePercent;
  if (name === 'BadgeAlert') return FileText;
  return ICONS[name as keyof typeof ICONS] || FileText;
}

export function TemplatesGallery({
  templates,
  categories,
  search,
  category,
  loading,
  usingTemplateId,
  canUse,
  onSearchChange,
  onCategoryChange,
  onUse,
}: TemplatesGalleryProps) {
  return (
    <section className="rounded-3xl border border-border bg-card p-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h2 className="text-lg font-bold text-primary">Templates de Relatório</h2>
          <p className="mt-1 text-sm text-muted">Escolha um ponto de partida validado e abra o builder já preenchido.</p>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_180px]">
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium uppercase tracking-wide text-muted">Busca</span>
            <input
              value={search}
              onChange={(event) => onSearchChange(event.target.value)}
              placeholder="Nome, descrição ou tag"
              className="rounded-xl border border-border bg-body px-3 py-2.5 text-sm outline-none transition-colors focus:border-brand-primary"
            />
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium uppercase tracking-wide text-muted">Categoria</span>
            <select
              value={category}
              onChange={(event) => onCategoryChange(event.target.value)}
              className="rounded-xl border border-border bg-body px-3 py-2.5 text-sm outline-none transition-colors focus:border-brand-primary"
            >
              <option value="">Todas</option>
              {categories.map((item) => (
                <option key={item} value={item}>{item}</option>
              ))}
            </select>
          </label>
        </div>
      </div>

      {loading ? (
        <div className="mt-5 grid grid-cols-1 gap-4 xl:grid-cols-3">
          {Array.from({ length: 3 }).map((_, index) => (
            <div key={index} className="h-56 animate-pulse rounded-3xl border border-border bg-body" />
          ))}
        </div>
      ) : templates.length === 0 ? (
        <div className="mt-5 rounded-2xl border border-dashed border-border bg-body p-6 text-sm text-muted">
          Nenhum template encontrado para os filtros atuais.
        </div>
      ) : (
        <div className="mt-5 grid grid-cols-1 gap-4 xl:grid-cols-3">
          {templates.map((template) => {
            const Icon = resolveIcon(template.icon);
            return (
              <article key={template.id} className="overflow-hidden rounded-3xl border border-border bg-body">
                <div className={`relative h-28 bg-gradient-to-br ${CARD_ACCENTS[template.dataset]}`}>
                  <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(255,255,255,0.14),transparent_45%)]" />
                  <div className="relative flex h-full items-start justify-between p-4">
                    <div className="rounded-2xl bg-card/80 p-3 text-brand-primary shadow-soft backdrop-blur">
                      <Icon size={20} />
                    </div>
                    <div className="flex flex-wrap justify-end gap-2">
                      <span className="rounded-full bg-card/80 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-primary backdrop-blur">
                        {DATASET_LABELS[template.dataset]}
                      </span>
                      <span className="rounded-full bg-card/80 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-secondary backdrop-blur">
                        {SCOPE_LABELS[template.scope]}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="space-y-4 p-4">
                  <div>
                    <div className="mb-2 flex flex-wrap items-center gap-2">
                      <span className="rounded-full bg-card px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-muted">{template.category}</span>
                      {template.featured && (
                        <span className="rounded-full bg-brand-primary/10 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-brand-primary">
                          Destaque
                        </span>
                      )}
                    </div>
                    <h3 className="text-base font-semibold text-primary">{template.name}</h3>
                    <p className="mt-1 min-h-[40px] text-sm text-muted">{template.description || 'Template sem descrição adicional.'}</p>
                  </div>

                  <div className="grid grid-cols-3 gap-2 text-center text-xs">
                    <div className="rounded-2xl border border-border bg-card px-2 py-2.5">
                      <div className="font-semibold text-primary">{template.dimensions_count}</div>
                      <div className="mt-1 text-muted">Dimensões</div>
                    </div>
                    <div className="rounded-2xl border border-border bg-card px-2 py-2.5">
                      <div className="font-semibold text-primary">{template.metrics_count}</div>
                      <div className="mt-1 text-muted">Métricas</div>
                    </div>
                    <div className="rounded-2xl border border-border bg-card px-2 py-2.5">
                      <div className="font-semibold text-primary">{template.use_count}</div>
                      <div className="mt-1 text-muted">Usos</div>
                    </div>
                  </div>

                  <div className="flex min-h-[32px] flex-wrap gap-2">
                    {template.tags.slice(0, 4).map((tag) => (
                      <span key={tag} className="rounded-full border border-border px-2.5 py-1 text-[11px] font-medium text-secondary">
                        {tag}
                      </span>
                    ))}
                  </div>

                  <button
                    onClick={() => void onUse(template)}
                    disabled={!canUse || usingTemplateId === template.id}
                    className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-brand-primary px-4 py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {usingTemplateId === template.id ? 'Preparando...' : canUse ? 'Usar template' : 'Sem permissão'}
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
