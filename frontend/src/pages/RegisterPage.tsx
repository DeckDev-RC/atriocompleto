import { useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { Eye, EyeOff } from 'lucide-react';
import { agentApi } from '../services/agentApi';
import { useAuth } from '../contexts/AuthContext';
import { PasswordStrengthIndicator } from '../components/PasswordStrengthIndicator';

export function RegisterPage() {
  const { login } = useAuth();
  const [signupEnabled, setSignupEnabled] = useState<boolean | null>(null);
  const [form, setForm] = useState({
    full_name: '',
    email: '',
    password: '',
    confirm_password: '',
  });
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isPasswordValid, setIsPasswordValid] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadingConfig, setLoadingConfig] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let mounted = true;

    agentApi.getPublicSignupConfig().then((result) => {
      if (!mounted) return;
      setSignupEnabled(result.success ? !!result.data?.enabled : false);
      setLoadingConfig(false);
    });

    return () => {
      mounted = false;
    };
  }, []);

  const setField = (field: keyof typeof form, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const passwordsMatch = form.password.length > 0 && form.password === form.confirm_password;
  const canSubmit = Boolean(
    signupEnabled
    && form.full_name.trim()
    && form.email.trim()
    && passwordsMatch
    && isPasswordValid,
  );

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;

    setError('');
    setLoading(true);

    const registerResult = await agentApi.register(form);
    if (!registerResult.success) {
      setLoading(false);
      setError(registerResult.error || 'Erro ao criar conta');
      return;
    }

    const loginResult = await login(form.email, form.password);
    setLoading(false);

    if (!loginResult.success) {
      setError(loginResult.error || 'Conta criada, mas nao foi possivel entrar automaticamente.');
      return;
    }

    if (loginResult.requires2FA) {
      setError('Conta criada, mas o login exigiu verificacao adicional inesperada.');
    }
  };

  if (loadingConfig) {
    return (
      <div className="min-h-screen bg-body flex items-center justify-center p-5">
        <div className="w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-soft text-center">
          <div className="mx-auto mb-4 h-8 w-8 rounded-full border-2 border-t-transparent" style={{ animation: 'spin 0.8s linear infinite', borderColor: 'var(--color-brand-primary)', borderTopColor: 'transparent' }} />
          <p className="text-sm text-muted">Carregando cadastro publico...</p>
        </div>
      </div>
    );
  }

  if (!signupEnabled) {
    return (
      <div className="min-h-screen bg-body flex items-center justify-center p-5">
        <div className="w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-soft text-center">
          <h1 className="text-2xl font-bold text-primary mb-2">Cadastro indisponivel</h1>
          <p className="text-[14px] text-muted mb-6">
            O cadastro publico nao esta ativo no momento.
          </p>
          <Link to="/" className="text-sm text-(--color-brand-primary) hover:underline">
            Voltar para login
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-body flex items-center justify-center p-5">
      <div className="w-full max-w-lg rounded-2xl border border-border bg-card p-6 shadow-soft">
        <h1 className="text-2xl font-bold text-primary mb-2">Criar conta</h1>
        <p className="text-[14px] text-muted mb-6">
          Cadastre sua conta e, no primeiro acesso, voce criara a empresa para comecar a usar a plataforma.
        </p>

        {error && (
          <div className="mb-4 rounded-xl border border-danger/20 bg-danger/5 px-4 py-3 text-[13px] text-danger">
            {error}
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
              autoFocus
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
            <label className="mb-1.5 block text-[12px] font-medium text-muted uppercase tracking-wide">Senha</label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                value={form.password}
                onChange={(e) => setField('password', e.target.value)}
                required
                className="w-full rounded-xl border border-border bg-body/60 px-4 py-3 pr-11 text-[14px] text-primary outline-none focus:border-(--color-brand-primary)"
              />
              <button
                type="button"
                onClick={() => setShowPassword((prev) => !prev)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted hover:text-primary"
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
            <PasswordStrengthIndicator password={form.password} onValidityChange={setIsPasswordValid} />
          </div>

          <div>
            <label className="mb-1.5 block text-[12px] font-medium text-muted uppercase tracking-wide">Confirmar senha</label>
            <div className="relative">
              <input
                type={showConfirmPassword ? 'text' : 'password'}
                value={form.confirm_password}
                onChange={(e) => setField('confirm_password', e.target.value)}
                required
                className="w-full rounded-xl border border-border bg-body/60 px-4 py-3 pr-11 text-[14px] text-primary outline-none focus:border-(--color-brand-primary)"
              />
              <button
                type="button"
                onClick={() => setShowConfirmPassword((prev) => !prev)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted hover:text-primary"
              >
                {showConfirmPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
            {form.confirm_password.length > 0 && !passwordsMatch && (
              <p className="mt-1 text-[11px] text-danger">As senhas nao coincidem.</p>
            )}
          </div>

          <button
            type="submit"
            disabled={!canSubmit || loading}
            className="mt-2 rounded-xl bg-(--color-brand-primary) px-4 py-3 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {loading ? 'Criando conta...' : 'Criar conta'}
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
