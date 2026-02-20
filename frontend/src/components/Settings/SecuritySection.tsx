import { useState } from 'react';
import { Lock, Eye, EyeOff, Loader2, Check, AlertCircle } from 'lucide-react';
import { agentApi } from '../../services/agentApi';
import { useToast } from '../Toast';
import { PasswordStrengthIndicator } from '../PasswordStrengthIndicator';
import { TwoFactorSetupModal } from './TwoFactorSetupModal';
import { useAuth } from '../../contexts/AuthContext';
import { ShieldCheck, Trash2 } from 'lucide-react';

export function SecuritySection() {
  const { showToast } = useToast();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const { user, refreshUser } = useAuth();
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const [isSetupModalOpen, setIsSetupModalOpen] = useState(false);
  const [showDisableConfirm, setShowDisableConfirm] = useState(false);
  const [isDisabling, setIsDisabling] = useState(false);
  const [confirmPasswordForDisable, setConfirmPasswordForDisable] = useState('');

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

  const handleDisable2FA = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!confirmPasswordForDisable) return;

    setIsDisabling(true);
    setError('');

    try {
      const result = await agentApi.disable2FA(confirmPasswordForDisable);
      if (result.success) {
        showToast('2FA desativado com sucesso', 'success');
        setShowDisableConfirm(false);
        setConfirmPasswordForDisable('');
        await refreshUser();
      } else {
        setError(result.error || 'Erro ao desativar 2FA');
        showToast(result.error || 'Erro ao desativar 2FA', 'error');
      }
    } catch {
      setError('Erro de conexão');
    } finally {
      setIsDisabling(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-5 max-w-md">
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
            className="w-full h-10 rounded-xl border border-border bg-card pl-10 pr-10 text-[13px] text-primary placeholder:text-muted/40 focus:border-(--color-brand-primary) focus:outline-none transition-colors duration-200"
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
        <label className="text-[12px] font-medium text-muted uppercase tracking-wider">
          Nova senha
        </label>
        <div className="relative">
          <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted/50" />
          <input
            type={showNew ? 'text' : 'password'}
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            placeholder="Mínimo 8, 1 maiúscula e 1 número"
            className="w-full h-10 rounded-xl border border-border bg-card pl-10 pr-10 text-[13px] text-primary placeholder:text-muted/40 focus:border-(--color-brand-primary) focus:outline-none transition-colors duration-200"
          />
          <button
            type="button"
            onClick={() => setShowNew((v) => !v)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted/50 hover:text-primary transition-colors"
          >
            {showNew ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
        </div>
        <PasswordStrengthIndicator
          password={newPassword}
          onValidityChange={setIsPasswordValid}
        />
      </div>

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
            className={`w-full h-10 rounded-xl border bg-card pl-10 pr-10 text-[13px] text-primary placeholder:text-muted/40 focus:outline-none transition-colors duration-200 ${confirmPassword.length > 0 && !passwordsMatch
              ? 'border-danger focus:border-danger'
              : 'border-border focus:border-(--color-brand-primary)'
              }`}
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
          <p className="text-[11px] text-danger">As senhas não coincidem</p>
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

      <div className="h-px bg-border my-4" />

      {/* 2FA Section */}
      <div className="flex flex-col gap-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center justify-between p-4 rounded-2xl bg-black/5 dark:bg-white/5 border border-border/50">
            <div className="flex items-center gap-4">
              <div className={`h-12 w-12 rounded-2xl flex items-center justify-center border transition-all duration-500 ${user?.two_factor_enabled ? 'bg-success/10 border-success/20' : 'bg-muted/5 border-border'}`}>
                <ShieldCheck size={24} className={user?.two_factor_enabled ? 'text-success animate-pulse' : 'text-muted/40'} />
              </div>
              <div className="flex flex-col gap-0.5">
                <div className="flex items-center gap-2">
                  <h4 className="text-[14px] font-bold text-primary">Autenticação 2FA</h4>
                  {user?.two_factor_enabled ? (
                    <span className="flex items-center gap-1 text-[9px] bg-success/10 text-success px-2 py-0.5 rounded-full border border-success/20 uppercase tracking-tighter font-black">
                      Ativado
                    </span>
                  ) : (
                    <span className="flex items-center gap-1 text-[9px] bg-muted/10 text-muted px-2 py-0.5 rounded-full border border-border uppercase tracking-tighter font-black">
                      Desativado
                    </span>
                  )}
                </div>
                <p className="text-[12px] text-muted max-w-sm">
                  Segurança extra via TOTP para sua conta.
                </p>
              </div>
            </div>

            {!user?.two_factor_enabled ? (
              <button
                type="button"
                onClick={() => setIsSetupModalOpen(true)}
                className="px-5 h-10 rounded-xl bg-brand-primary text-white text-[12px] font-bold hover:shadow-lg shadow-brand-primary/20 transition-all active:scale-95"
              >
                Configurar
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setShowDisableConfirm(true)}
                className="px-5 h-10 rounded-xl border border-danger/20 text-danger text-[12px] font-bold hover:bg-danger/5 transition-all active:scale-95"
              >
                Desativar
              </button>
            )}
          </div>
        </div>

        {showDisableConfirm && (
          <div className="rounded-2xl border border-danger/20 bg-danger/5 p-5 animate-in slide-in-from-top-2 duration-300">
            <h5 className="text-[13px] font-semibold text-danger mb-2 flex items-center gap-2">
              <AlertCircle size={14} /> Desativar 2FA?
            </h5>
            <p className="text-[12px] text-[#7c2d12] mb-4">
              Por segurança, insira sua senha para confirmar a desativação da autenticação de dois fatores.
            </p>
            <form onSubmit={handleDisable2FA} className="flex flex-col gap-3">
              <div className="relative">
                <Lock size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted/50" />
                <input
                  type="password"
                  value={confirmPasswordForDisable}
                  onChange={(e) => setConfirmPasswordForDisable(e.target.value)}
                  placeholder="Sua senha atual"
                  className="w-full h-10 rounded-xl border border-danger/20 bg-white pl-10 pr-4 text-[13px] text-primary focus:border-danger focus:outline-none"
                  autoFocus
                />
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="submit"
                  disabled={isDisabling || !confirmPasswordForDisable}
                  className="flex-1 flex items-center justify-center gap-2 h-10 rounded-xl bg-danger text-white text-[12px] font-medium hover:opacity-90 disabled:opacity-50 transition-all"
                >
                  {isDisabling ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                  Sim, desativar
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowDisableConfirm(false);
                    setConfirmPasswordForDisable('');
                  }}
                  className="px-4 h-10 rounded-xl border border-border text-[12px] font-medium text-muted hover:bg-card transition-colors"
                >
                  Cancelar
                </button>
              </div>
            </form>
          </div>
        )}
      </div>

      <TwoFactorSetupModal
        isOpen={isSetupModalOpen}
        onClose={() => setIsSetupModalOpen(false)}
        onSuccess={() => refreshUser()}
      />
    </form>
  );
}
