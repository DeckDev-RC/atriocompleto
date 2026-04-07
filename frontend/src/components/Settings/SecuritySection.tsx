import { useState } from 'react';
import { Lock, Eye, EyeOff, Loader2, Check, ShieldOff } from 'lucide-react';
import { agentApi } from '../../services/agentApi';
import { useToast } from '../Toast';
import { PasswordStrengthIndicator } from '../PasswordStrengthIndicator';

export function SecuritySection() {
  const { showToast } = useToast();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [isPasswordValid, setIsPasswordValid] = useState(false);

  const passwordsMatch = newPassword === confirmPassword;
  const canSubmit = currentPassword.length > 0
    && isPasswordValid
    && confirmPassword.length > 0
    && passwordsMatch
    && !loading;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;

    setError('');
    setSuccess(false);
    setLoading(true);

    try {
      const result = await agentApi.changePassword({
        current_password: currentPassword,
        new_password: newPassword,
        confirm_password: confirmPassword,
      });

      if (!result.success) {
        setError(result.error || 'Erro ao alterar senha');
        showToast(result.error || 'Erro ao alterar senha', 'error');
        return;
      }

      setSuccess(true);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      showToast('Senha alterada com sucesso', 'success');
      setTimeout(() => setSuccess(false), 5000);
    } catch {
      setError('Erro de conexão');
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="flex max-w-md flex-col gap-5">
      <div className="rounded-2xl border border-border bg-card/60 p-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl border border-border bg-body/50">
            <ShieldOff size={18} className="text-muted" />
          </div>
          <div>
            <p className="text-sm font-semibold text-primary">2FA desabilitado</p>
            <p className="text-xs text-muted">
              A verificação em duas etapas foi desligada globalmente nesta plataforma.
            </p>
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <label className="text-[12px] font-medium uppercase tracking-wider text-muted">
          Senha atual
        </label>
        <div className="relative">
          <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted/50" />
          <input
            type={showCurrent ? 'text' : 'password'}
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            placeholder="Digite sua senha atual"
            className="h-10 w-full rounded-xl border border-border bg-card pl-10 pr-10 text-[13px] text-primary placeholder:text-muted/40 focus:border-(--color-brand-primary) focus:outline-none transition-colors duration-200"
          />
          <button
            type="button"
            onClick={() => setShowCurrent((v) => !v)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted/50 hover:text-primary transition-colors"
          >
            {showCurrent ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <label className="text-[12px] font-medium uppercase tracking-wider text-muted">
          Nova senha
        </label>
        <div className="relative">
          <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted/50" />
          <input
            type={showNew ? 'text' : 'password'}
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            placeholder="Minimo 8, 1 maiuscula e 1 numero"
            className="h-10 w-full rounded-xl border border-border bg-card pl-10 pr-10 text-[13px] text-primary placeholder:text-muted/40 focus:border-(--color-brand-primary) focus:outline-none transition-colors duration-200"
          />
          <button
            type="button"
            onClick={() => setShowNew((v) => !v)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted/50 hover:text-primary transition-colors"
          >
            {showNew ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
        </div>
        <PasswordStrengthIndicator password={newPassword} onValidityChange={setIsPasswordValid} />
      </div>

      <div className="flex flex-col gap-1.5">
        <label className="text-[12px] font-medium uppercase tracking-wider text-muted">
          Confirmar nova senha
        </label>
        <div className="relative">
          <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted/50" />
          <input
            type={showConfirm ? 'text' : 'password'}
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            placeholder="Repita a nova senha"
            className={`h-10 w-full rounded-xl border bg-card pl-10 pr-10 text-[13px] text-primary placeholder:text-muted/40 focus:outline-none transition-colors duration-200 ${confirmPassword.length > 0 && !passwordsMatch ? 'border-danger focus:border-danger' : 'border-border focus:border-(--color-brand-primary)'}`}
          />
          <button
            type="button"
            onClick={() => setShowConfirm((v) => !v)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted/50 hover:text-primary transition-colors"
          >
            {showConfirm ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
        </div>
        {confirmPassword.length > 0 && !passwordsMatch && (
          <p className="text-[11px] text-danger">As senhas nao coincidem</p>
        )}
      </div>

      {error && (
        <div className="rounded-xl border border-danger/20 bg-danger/5 px-4 py-2.5 text-[12.5px] text-danger">
          {error}
        </div>
      )}

      {success && (
        <div className="flex items-center gap-2 rounded-xl border border-success/20 bg-success/5 px-4 py-2.5 text-[12.5px] text-success">
          <Check size={15} />
          Senha alterada com sucesso!
        </div>
      )}

      <button
        type="submit"
        disabled={!canSubmit}
        className="flex h-10 items-center justify-center gap-2 self-start rounded-xl px-6 text-[13px] font-medium text-white transition-all duration-200 hover:opacity-90 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40"
        style={{ backgroundColor: 'var(--color-brand-primary)' }}
      >
        {loading ? <Loader2 size={16} className="animate-spin" /> : <Lock size={16} />}
        {loading ? 'Alterando...' : 'Alterar senha'}
      </button>
    </form>
  );
}
