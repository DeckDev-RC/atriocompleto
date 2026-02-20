import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { agentApi } from '../services/agentApi';

export function AccessRequestPage() {
  const [form, setForm] = useState({
    full_name: '',
    phone: '',
    email: '',
    company_name: '',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const setField = (field: keyof typeof form, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setLoading(true);

    const result = await agentApi.requestAccess(form);
    setLoading(false);

    if (!result.success) {
      setError(result.error || 'Erro ao enviar solicitação');
      return;
    }

    setSuccess((result.data as { message: string } | undefined)?.message || 'Solicitação enviada com sucesso');
    setForm({
      full_name: '',
      phone: '',
      email: '',
      company_name: '',
    });
  };

  return (
    <div className="min-h-screen bg-body flex items-center justify-center p-5">
      <div className="w-full max-w-xl rounded-2xl border border-border bg-card p-6 shadow-soft">
        <h1 className="text-2xl font-bold text-primary mb-2">Quero ter uma conta</h1>
        <p className="text-[14px] text-muted mb-6">
          Envie sua solicitação e nossa equipe vai entrar em contato.
        </p>

        {error && (
          <div className="mb-4 rounded-xl border border-danger/20 bg-danger/5 px-4 py-3 text-[13px] text-danger">
            {error}
          </div>
        )}
        {success && (
          <div className="mb-4 rounded-xl border border-success/20 bg-success/5 px-4 py-3 text-[13px] text-success">
            {success}
          </div>
        )}

        <form onSubmit={handleSubmit} className="grid gap-4">
          <div>
            <label className="mb-1.5 block text-[12px] font-medium text-muted uppercase tracking-wide">Nome</label>
            <input
              type="text"
              value={form.full_name}
              onChange={(e) => setField('full_name', e.target.value)}
              required
              className="w-full rounded-xl border border-border bg-body/60 px-4 py-3 text-[14px] text-primary outline-none focus:border-(--color-brand-primary)"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-[12px] font-medium text-muted uppercase tracking-wide">Telefone</label>
            <input
              type="tel"
              value={form.phone}
              onChange={(e) => setField('phone', e.target.value)}
              required
              className="w-full rounded-xl border border-border bg-body/60 px-4 py-3 text-[14px] text-primary outline-none focus:border-(--color-brand-primary)"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-[12px] font-medium text-muted uppercase tracking-wide">Email</label>
            <input
              type="email"
              value={form.email}
              onChange={(e) => setField('email', e.target.value)}
              required
              className="w-full rounded-xl border border-border bg-body/60 px-4 py-3 text-[14px] text-primary outline-none focus:border-(--color-brand-primary)"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-[12px] font-medium text-muted uppercase tracking-wide">Empresa</label>
            <input
              type="text"
              value={form.company_name}
              onChange={(e) => setField('company_name', e.target.value)}
              required
              className="w-full rounded-xl border border-border bg-body/60 px-4 py-3 text-[14px] text-primary outline-none focus:border-(--color-brand-primary)"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="mt-2 rounded-xl bg-(--color-brand-primary) px-4 py-3 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {loading ? 'Enviando...' : 'Enviar solicitação'}
          </button>
        </form>

        <div className="mt-6 text-center">
          <Link to="/" className="text-sm text-(--color-brand-primary) hover:underline">
            Voltar para login
          </Link>
        </div>
      </div>
    </div>
  );
}
