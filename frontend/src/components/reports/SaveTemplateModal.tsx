import { useEffect, useState } from 'react';
import { Save, X } from 'lucide-react';

interface SaveTemplateModalProps {
  open: boolean;
  saving: boolean;
  defaultName: string;
  defaultDescription: string;
  defaultCategory: string;
  defaultScope: 'tenant' | 'user';
  categories: string[];
  onClose: () => void;
  onSubmit: (values: {
    name: string;
    description: string;
    category: string;
    tags: string[];
    scope: 'tenant' | 'user';
  }) => Promise<void>;
}

export function SaveTemplateModal({
  open,
  saving,
  defaultName,
  defaultDescription,
  defaultCategory,
  defaultScope,
  categories,
  onClose,
  onSubmit,
}: SaveTemplateModalProps) {
  const [name, setName] = useState(defaultName);
  const [description, setDescription] = useState(defaultDescription);
  const [category, setCategory] = useState(defaultCategory);
  const [tags, setTags] = useState('');
  const [scope, setScope] = useState<'tenant' | 'user'>(defaultScope);

  useEffect(() => {
    if (!open) return;
    setName(defaultName);
    setDescription(defaultDescription);
    setCategory(defaultCategory);
    setScope(defaultScope);
    setTags('');
  }, [open, defaultName, defaultDescription, defaultCategory, defaultScope]);

  if (!open) return null;

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    await onSubmit({
      name: name.trim(),
      description: description.trim(),
      category: category.trim(),
      scope,
      tags: tags.split(',').map((item) => item.trim()).filter(Boolean),
    });
  };

  return (
    <div className="fixed inset-0 z-300 flex items-center justify-center bg-black/45 px-4 py-6 backdrop-blur-sm">
      <form onSubmit={handleSubmit} className="w-full max-w-xl rounded-3xl border border-border bg-card p-6 shadow-soft">
        <div className="mb-5 flex items-start justify-between gap-4">
          <div>
            <h3 className="text-lg font-bold text-primary">Salvar como template</h3>
            <p className="mt-1 text-sm text-muted">Transforme esta definição em um template reutilizável para você ou para a equipe.</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl p-2 text-muted transition-colors hover:bg-muted/10 hover:text-primary"
          >
            <X size={18} />
          </button>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <label className="flex flex-col gap-2 md:col-span-2">
            <span className="text-sm font-medium text-primary">Nome</span>
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              className="rounded-xl border border-border bg-body px-3 py-2.5 text-sm outline-none transition-colors focus:border-brand-primary"
              placeholder="Ex: Receita por canal"
            />
          </label>

          <label className="flex flex-col gap-2 md:col-span-2">
            <span className="text-sm font-medium text-primary">Descrição</span>
            <textarea
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              rows={3}
              className="rounded-2xl border border-border bg-body px-3 py-2.5 text-sm outline-none transition-colors focus:border-brand-primary"
              placeholder="Explique rapidamente quando este template deve ser usado."
            />
          </label>

          <label className="flex flex-col gap-2">
            <span className="text-sm font-medium text-primary">Categoria</span>
            <select
              value={category}
              onChange={(event) => setCategory(event.target.value)}
              className="rounded-xl border border-border bg-body px-3 py-2.5 text-sm outline-none transition-colors focus:border-brand-primary"
            >
              {categories.map((item) => (
                <option key={item} value={item}>{item}</option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-2">
            <span className="text-sm font-medium text-primary">Visibilidade</span>
            <select
              value={scope}
              onChange={(event) => setScope(event.target.value as 'tenant' | 'user')}
              className="rounded-xl border border-border bg-body px-3 py-2.5 text-sm outline-none transition-colors focus:border-brand-primary"
            >
              <option value="user">Privado (apenas eu)</option>
              <option value="tenant">Equipe (tenant)</option>
            </select>
          </label>

          <label className="flex flex-col gap-2 md:col-span-2">
            <span className="text-sm font-medium text-primary">Tags</span>
            <input
              value={tags}
              onChange={(event) => setTags(event.target.value)}
              className="rounded-xl border border-border bg-body px-3 py-2.5 text-sm outline-none transition-colors focus:border-brand-primary"
              placeholder="vendas, semanal, marketplace"
            />
            <span className="text-xs text-muted">Separe por vírgula. Use até 8 tags curtas.</span>
          </label>
        </div>

        <div className="mt-6 flex flex-wrap items-center justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-border px-4 py-2.5 text-sm font-medium text-secondary transition-colors hover:bg-muted/10"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={saving}
            className="inline-flex items-center gap-2 rounded-xl bg-brand-primary px-4 py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            <Save size={16} />
            {saving ? 'Salvando...' : 'Salvar template'}
          </button>
        </div>
      </form>
    </div>
  );
}
