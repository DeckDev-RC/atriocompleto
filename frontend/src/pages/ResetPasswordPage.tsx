import { useState, type FormEvent } from 'react';
import { Link, useParams, useSearchParams, useNavigate } from 'react-router-dom';
import { Eye, EyeOff } from 'lucide-react';
import { agentApi } from '../services/agentApi';
import { useAuth } from '../contexts/AuthContext';
import { PasswordStrengthIndicator } from '../components/PasswordStrengthIndicator';

export function ResetPasswordPage() {
  const navigate = useNavigate();
  const { isAuthenticated, logout } = useAuth();
  const [searchParams] = useSearchParams();
  const { token: pathToken } = useParams<{ token: string }>();
  const token = pathToken || searchParams.get('token') || '';

  // Mode: if we have a token, it's a reset. If no token but authenticated, it's an invite/first-setup.
  const isInviteMode = !token && isAuthenticated;

  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const [isSuccess, setIsSuccess] = useState(false);
  const [isPasswordValid, setIsPasswordValid] = useState(false);
  const passwordsMatch = newPassword.length > 0 && newPassword === confirmPassword;

  // Can submit if:
  // 1. We have a token (reset flow)
  // OR 2. We are in invite mode (already logged in via hash)
  const canSubmit = (token.length > 0 || isInviteMode) && isPasswordValid && passwordsMatch;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;

    setError('');
    setMessage('');
    setLoading(true);

    let result;
    if (token) {
      result = await agentApi.resetPassword({
        token,
        new_password: newPassword,
        confirm_password: confirmPassword,
      });
    } else {
      result = await agentApi.setInitialPassword({
        new_password: newPassword,
        confirm_password: confirmPassword,
      });
    }

    setLoading(false);
    if (!result.success) {
      setError(result.error || 'Erro ao definir senha');
      return;
    }

    const successMsg = (result.data as { message: string } | undefined)?.message || 'Senha definida com sucesso!';
    setMessage(successMsg);
    setNewPassword('');
    setConfirmPassword('');
    setIsSuccess(true);

    // Forçamos o logout local para limpar qualquer token invalidado pelo Supabase
    logout();

    // Sucesso generalizado: redireciona para login após 3 segundos
    setTimeout(() => navigate('/'), 3000);
  };

  if (!isSuccess && !token && !isAuthenticated) {
    return (
      <div className="min-h-screen bg-body flex items-center justify-center p-5">
        <div className="w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-soft text-center">
          <h1 className="text-2xl font-bold text-primary mb-2">Link expirado ou inválido</h1>
          <p className="text-[14px] text-muted mb-6">O link de redefinição não é mais válido ou você não possui uma sessão ativa.</p>
          <Link to="/esqueci-senha" className="text-sm text-(--color-brand-primary) hover:underline">
            Solicitar novo link
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-body flex items-center justify-center p-5">
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-soft">
        <h1 className="text-2xl font-bold text-primary mb-2">
          {isInviteMode ? 'Bem-vindo! Defina sua senha' : 'Redefinir senha'}
        </h1>
        <p className="text-[14px] text-muted mb-6">
          {isInviteMode
            ? 'Para acessar sua conta, escolha uma senha segura abaixo.'
            : 'Crie uma nova senha forte para acessar sua conta.'}
        </p>

        {error && (
          <div className="mb-4 rounded-xl border border-danger/20 bg-danger/5 px-4 py-3 text-[13px] text-danger">
            {error}
          </div>
        )}
        {message && (
          <div className="mb-4 rounded-xl border border-success/20 bg-success/5 px-4 py-3 text-[13px] text-success">
            {message}
          </div>
        )}

        <form onSubmit={handleSubmit} className="grid gap-4">
          <div>
            <label className="mb-1.5 block text-[12px] font-medium text-muted uppercase tracking-wide">Nova senha</label>
            <div className="relative">
              <input
                type={showNew ? 'text' : 'password'}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                required
                className="w-full rounded-xl border border-border bg-body/60 px-4 py-3 pr-11 text-[14px] text-primary outline-none focus:border-(--color-brand-primary)"
                placeholder="Mínimo 8, 1 maiúscula e 1 número"
              />
              <button
                type="button"
                onClick={() => setShowNew((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted hover:text-primary"
              >
                {showNew ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
            <PasswordStrengthIndicator
              password={newPassword}
              onValidityChange={setIsPasswordValid}
            />
          </div>

          <div>
            <label className="mb-1.5 block text-[12px] font-medium text-muted uppercase tracking-wide">Confirmar senha</label>
            <div className="relative">
              <input
                type={showConfirm ? 'text' : 'password'}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                className="w-full rounded-xl border border-border bg-body/60 px-4 py-3 pr-11 text-[14px] text-primary outline-none focus:border-(--color-brand-primary)"
              />
              <button
                type="button"
                onClick={() => setShowConfirm((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted hover:text-primary"
              >
                {showConfirm ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
            {confirmPassword.length > 0 && !passwordsMatch && (
              <p className="mt-1 text-[11px] text-danger">As senhas não coincidem.</p>
            )}
          </div>

          <button
            type="submit"
            disabled={!canSubmit || loading}
            className="rounded-xl bg-(--color-brand-primary) px-4 py-3 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {loading ? 'Salvando...' : 'Redefinir senha'}
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
