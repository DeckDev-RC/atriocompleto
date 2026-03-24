import { useEffect, useState, type FormEvent } from 'react';
import { Building2, LogOut } from 'lucide-react';
import { Outlet } from 'react-router-dom';
import { agentApi } from '../services/agentApi';
import { useAuth } from '../contexts/AuthContext';

export function TenantSetupGate() {
  const { user, refreshUser, logout } = useAuth();
  const [companyName, setCompanyName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!user?.needs_tenant_setup) {
      setCompanyName('');
      setError('');
    }
  }, [user?.needs_tenant_setup]);

  if (!user?.needs_tenant_setup) {
    return <Outlet />;
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!companyName.trim()) return;

    setLoading(true);
    setError('');

    const result = await agentApi.createOnboardingCompany(companyName.trim());
    if (!result.success) {
      setLoading(false);
      setError(result.error || 'Nao foi possivel criar sua empresa.');
      return;
    }

    await refreshUser();
    setLoading(false);
  };

  return (
    <div className="relative min-h-screen bg-body">
      <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" />
      <div className="relative z-10 flex min-h-screen items-center justify-center p-5">
        <div className="w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-2xl">
          <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-2xl bg-(--color-brand-primary)/10 text-(--color-brand-primary)">
            <Building2 size={22} />
          </div>

          <h1 className="text-2xl font-bold text-primary mb-2">Configure sua empresa</h1>
          <p className="text-[14px] text-muted mb-6">
            Antes de entrar na plataforma, crie a empresa que vai agrupar seus dados.
          </p>

          {error && (
            <div className="mb-4 rounded-xl border border-danger/20 bg-danger/5 px-4 py-3 text-[13px] text-danger">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="grid gap-4">
            <div>
              <label className="mb-1.5 block text-[12px] font-medium text-muted uppercase tracking-wide">Nome da empresa</label>
              <input
                type="text"
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                required
                autoFocus
                className="w-full rounded-xl border border-border bg-body/60 px-4 py-3 text-[14px] text-primary outline-none focus:border-(--color-brand-primary)"
              />
            </div>

            <button
              type="submit"
              disabled={loading || !companyName.trim()}
              className="rounded-xl bg-(--color-brand-primary) px-4 py-3 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {loading ? 'Criando empresa...' : 'Continuar'}
            </button>
          </form>

          <button
            type="button"
            onClick={() => void logout()}
            className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl border border-border px-4 py-3 text-sm font-medium text-muted transition-colors hover:bg-body hover:text-primary"
          >
            <LogOut size={16} />
            Sair
          </button>
        </div>
      </div>
    </div>
  );
}
