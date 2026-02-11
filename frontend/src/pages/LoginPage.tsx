import { useState, type FormEvent } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useApp } from '../contexts/AppContext';
import { Eye, EyeOff, Loader2, Moon, Sun } from 'lucide-react';
import logoLight from '../assets/logo-whitemode.png';
import logoDark from '../assets/logo-darkmode.png';

export function LoginPage() {
  const { login } = useAuth();
  const { theme, toggleTheme } = useApp();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const logoSrc = theme === 'dark' ? logoDark : logoLight;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    const result = await login(email, password);
    if (!result.success) {
      setError(result.error || 'Erro ao fazer login');
    }
    setLoading(false);
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-body px-5 py-8">
      {/* Ambient glow */}
      <div className="pointer-events-none fixed left-1/2 top-[25%] -translate-x-1/2 -translate-y-1/2 h-[600px] w-[600px] rounded-full bg-accent/4 blur-[100px]" />
      <div className="pointer-events-none fixed right-0 bottom-0 h-[400px] w-[400px] rounded-full bg-accent-muted/3 blur-[80px]" />

      {/* Theme toggle */}
      <button
        onClick={toggleTheme}
        className="fixed right-5 top-5 flex h-9 w-9 items-center justify-center rounded-full text-secondary transition-all duration-300 hover:bg-card hover:text-primary hover:shadow-soft active:scale-95"
        aria-label={theme === 'light' ? 'Tema escuro' : 'Tema claro'}
      >
        {theme === 'light' ? <Moon size={18} /> : <Sun size={18} />}
      </button>

      <div className="w-full max-w-[400px] mx-auto -translate-y-4" style={{ animation: 'fade-in 0.5s cubic-bezier(0.16,1,0.3,1) both' }}>
        {/* Form Card */}
        <form
          onSubmit={handleSubmit}
          className="rounded-2xl border border-border bg-card p-8 shadow-soft dark:shadow-dark-card"
        >
          <h2 className="text-[20px] font-bold text-[#0a0b0f] dark:text-primary tracking-[-0.02em] mb-1">
            Entrar
          </h2>
          <p className="text-[13px] text-[#545869] dark:text-muted mb-7">
            Acesse sua conta para continuar
          </p>

          {error && (
            <div
              className="mb-5 rounded-xl border border-danger/20 bg-danger/5 px-4 py-3 text-[13px] text-danger"
              style={{ animation: 'slide-up 0.2s ease-out' }}
            >
              {error}
            </div>
          )}

          {/* Email */}
          <div className="mb-5">
            <label className="mb-2 block text-[12px] font-semibold uppercase tracking-[0.05em] text-[#545869] dark:text-muted">
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="seu@email.com"
              required
              autoFocus
              className="w-full rounded-xl border border-border bg-body/60 px-4 py-3 text-[14px] text-[#0a0b0f] dark:text-primary placeholder:text-[#9498a8] dark:placeholder:text-muted outline-none transition-all duration-300 focus:border-accent/30 focus:bg-card focus:ring-4 focus:ring-accent/8 focus:shadow-[0_0_20px_rgba(56,182,255,0.06)]"
            />
          </div>

          {/* Password */}
          <div className="mb-7">
            <label className="mb-2 block text-[12px] font-semibold uppercase tracking-[0.05em] text-[#545869] dark:text-muted">
              Senha
            </label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                className="w-full rounded-xl border border-border bg-body/60 px-4 py-3 pr-12 text-[14px] text-[#0a0b0f] dark:text-primary placeholder:text-[#9498a8] dark:placeholder:text-muted outline-none transition-all duration-300 focus:border-accent/30 focus:bg-card focus:ring-4 focus:ring-accent/8 focus:shadow-[0_0_20px_rgba(56,182,255,0.06)]"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-[#545869] dark:text-muted transition-colors hover:text-[#0a0b0f] dark:hover:text-primary"
                tabIndex={-1}
              >
                {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
              </button>
            </div>
          </div>

          {/* Submit */}
          <button
            type="submit"
            disabled={loading}
            className={`flex w-full items-center justify-center gap-2.5 rounded-xl py-3.5 text-[14px] font-semibold tracking-[-0.01em] text-white transition-all duration-300 ${loading
              ? 'bg-muted cursor-not-allowed'
              : 'bg-linear-to-r from-accent to-accent-deep shadow-[0_4px_20px_rgba(56,182,255,0.2)] hover:shadow-[0_6px_28px_rgba(56,182,255,0.3)] hover:-translate-y-0.5 active:scale-[0.98]'
              }`}
          >
            {loading && <Loader2 size={17} style={{ animation: 'spin 1s linear infinite' }} />}
            {loading ? 'Entrando...' : 'Entrar'}
          </button>

          {/* Logo */}
          <div className="mt-8 flex flex-col items-center">
            <div className="flex items-center gap-3">
              <div className="h-px w-8 bg-border/40" />
              <img
                src={logoSrc}
                alt="Agregar Negócios"
                className="h-7 w-auto object-contain"
              />
              <div className="h-px w-8 bg-border/40" />
            </div>
          </div>
        </form>

        <p className="mt-6 text-center text-[11px] text-[#545869] dark:text-muted">
          © {new Date().getFullYear()} Agregar Negócios
        </p>
      </div>
    </div>
  );
}
