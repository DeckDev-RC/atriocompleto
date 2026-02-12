import { useState } from 'react';
import { Lock, Eye, EyeOff, Loader2, Check } from 'lucide-react';
import { agentApi } from '../../services/agentApi';
import { useToast } from '../Toast';

/** Calcula força da senha (0-4) */
function getPasswordStrength(password: string): number {
  let score = 0;
  if (password.length >= 6) score++;
  if (password.length >= 10) score++;
  if (/[A-Z]/.test(password) && /[a-z]/.test(password)) score++;
  if (/[0-9]/.test(password)) score++;
  if (/[^A-Za-z0-9]/.test(password)) score++;
  return Math.min(score, 4);
}

const STRENGTH_LABELS = ['', 'Fraca', 'Razoável', 'Boa', 'Forte'];
const STRENGTH_COLORS = ['', '#EF4444', '#F97316', '#EAB308', '#22C55E'];

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

  const strength = getPasswordStrength(newPassword);
  const passwordsMatch = newPassword === confirmPassword;
  const canSubmit = currentPassword.length > 0
    && newPassword.length >= 6
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

      if (result.success) {
        setSuccess(true);
        setCurrentPassword('');
        setNewPassword('');
        setConfirmPassword('');
        showToast('Senha alterada com sucesso', 'success');
        setTimeout(() => setSuccess(false), 5000);
      } else {
        setError(result.error || 'Erro ao alterar senha');
        showToast(result.error || 'Erro ao alterar senha', 'error');
      }
    } catch {
      setError('Erro de conexão');
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-5 max-w-md">
      {/* Senha atual */}
      <div className="flex flex-col gap-1.5">
        <label className="text-[12px] font-medium text-muted uppercase tracking-wider">
          Senha atual
        </label>
        <div className="relative">
          <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted/50" />
          <input
            type={showCurrent ? 'text' : 'password'}
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            placeholder="Digite sua senha atual"
            className="w-full h-10 rounded-xl border border-border bg-card pl-10 pr-10 text-[13px] text-primary placeholder:text-muted/40 focus:border-[var(--color-brand-primary)] focus:outline-none transition-colors duration-200"
          />
          <button
            type="button"
            onClick={() => setShowCurrent(!showCurrent)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted/50 hover:text-primary transition-colors"
          >
            {showCurrent ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
        </div>
      </div>

      {/* Nova senha */}
      <div className="flex flex-col gap-1.5">
        <label className="text-[12px] font-medium text-muted uppercase tracking-wider">
          Nova senha
        </label>
        <div className="relative">
          <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted/50" />
          <input
            type={showNew ? 'text' : 'password'}
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            placeholder="Mínimo 6 caracteres"
            className="w-full h-10 rounded-xl border border-border bg-card pl-10 pr-10 text-[13px] text-primary placeholder:text-muted/40 focus:border-[var(--color-brand-primary)] focus:outline-none transition-colors duration-200"
          />
          <button
            type="button"
            onClick={() => setShowNew(!showNew)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted/50 hover:text-primary transition-colors"
          >
            {showNew ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
        </div>

        {/* Indicador de força */}
        {newPassword.length > 0 && (
          <div className="flex items-center gap-2 mt-1">
            <div className="flex gap-1 flex-1">
              {[1, 2, 3, 4].map((level) => (
                <div
                  key={level}
                  className="h-1 flex-1 rounded-full transition-colors duration-300"
                  style={{
                    backgroundColor: level <= strength
                      ? STRENGTH_COLORS[strength]
                      : 'var(--color-border)',
                  }}
                />
              ))}
            </div>
            <span
              className="text-[11px] font-medium"
              style={{ color: STRENGTH_COLORS[strength] }}
            >
              {STRENGTH_LABELS[strength]}
            </span>
          </div>
        )}
      </div>

      {/* Confirmar senha */}
      <div className="flex flex-col gap-1.5">
        <label className="text-[12px] font-medium text-muted uppercase tracking-wider">
          Confirmar nova senha
        </label>
        <div className="relative">
          <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted/50" />
          <input
            type={showConfirm ? 'text' : 'password'}
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            placeholder="Repita a nova senha"
            className={`w-full h-10 rounded-xl border bg-card pl-10 pr-10 text-[13px] text-primary placeholder:text-muted/40 focus:outline-none transition-colors duration-200 ${
              confirmPassword.length > 0 && !passwordsMatch
                ? 'border-danger focus:border-danger'
                : 'border-border focus:border-[var(--color-brand-primary)]'
            }`}
          />
          <button
            type="button"
            onClick={() => setShowConfirm(!showConfirm)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted/50 hover:text-primary transition-colors"
          >
            {showConfirm ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
        </div>
        {confirmPassword.length > 0 && !passwordsMatch && (
          <p className="text-[11px] text-danger">As senhas não coincidem</p>
        )}
      </div>

      {/* Mensagens */}
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

      {/* Botão */}
      <button
        type="submit"
        disabled={!canSubmit}
        className="flex items-center justify-center gap-2 h-10 rounded-xl px-6 text-[13px] font-medium text-white transition-all duration-200 hover:opacity-90 active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed self-start"
        style={{ backgroundColor: 'var(--color-brand-primary)' }}
      >
        {loading ? (
          <Loader2 size={16} className="animate-spin" />
        ) : (
          <Lock size={16} />
        )}
        {loading ? 'Alterando...' : 'Alterar senha'}
      </button>
    </form>
  );
}
