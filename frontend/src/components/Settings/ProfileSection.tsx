import { useState, useRef } from 'react';
import { Camera, Trash2, Loader2, Pencil, Check, X, ShieldCheck, Lock, Smartphone } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { agentApi } from '../../services/agentApi';
import { useToast } from '../Toast';
import { compressImage } from '../../utils/imageCompression';

export function ProfileSection() {
  const { user, refreshUser } = useAuth();
  const { showToast } = useToast();
  const [uploading, setUploading] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [error, setError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── Edição de nome ──────────────────────────────────
  const [editingName, setEditingName] = useState(false);
  const [nameValue, setNameValue] = useState('');
  const [savingName, setSavingName] = useState(false);
  const nameInputRef = useRef<HTMLInputElement>(null);

  const initials = user?.full_name
    ? user.full_name.split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase()
    : '??';

  const startEditingName = () => {
    setNameValue(user?.full_name || '');
    setEditingName(true);
    setTimeout(() => nameInputRef.current?.focus(), 50);
  };

  const cancelEditingName = () => {
    setEditingName(false);
    setNameValue('');
  };

  const saveName = async () => {
    const trimmed = nameValue.trim();
    if (trimmed.length < 2) {
      showToast('Nome deve ter no mínimo 2 caracteres', 'error');
      return;
    }
    if (trimmed === user?.full_name) {
      setEditingName(false);
      return;
    }

    setSavingName(true);
    try {
      const result = await agentApi.updateProfile({ full_name: trimmed });
      if (result.success) {
        await refreshUser();
        showToast('Nome atualizado com sucesso', 'success');
        setEditingName(false);
      } else {
        showToast(result.error || 'Erro ao atualizar nome', 'error');
      }
    } catch {
      showToast('Erro ao atualizar nome', 'error');
    } finally {
      setSavingName(false);
    }
  };

  const handleNameKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') saveName();
    if (e.key === 'Escape') cancelEditingName();
  };

  // ── Upload de avatar ────────────────────────────────
  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const MAX_INPUT_MB = 10;
    if (file.size > MAX_INPUT_MB * 1024 * 1024) {
      setError(`Arquivo deve ter no máximo ${MAX_INPUT_MB}MB`);
      return;
    }
    if (!['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(file.type)) {
      setError('Use JPEG, PNG, WebP ou GIF');
      return;
    }

    setError('');
    setUploading(true);
    try {
      const compressed = await compressImage(file, {
        maxSizeMB: 1.5,
        maxDimension: 800,
      });

      const result = await agentApi.uploadAvatar(compressed);
      if (result.success) {
        await refreshUser();
        showToast('Foto atualizada com sucesso', 'success');
      } else {
        setError(result.error || 'Erro ao enviar foto');
        showToast(result.error || 'Erro ao enviar foto', 'error');
      }
    } catch {
      setError('Erro ao enviar foto');
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleRemove = async () => {
    setError('');
    setRemoving(true);
    try {
      const result = await agentApi.deleteAvatar();
      if (result.success) {
        await refreshUser();
        showToast('Foto removida', 'success');
      } else {
        setError(result.error || 'Erro ao remover foto');
        showToast(result.error || 'Erro ao remover foto', 'error');
      }
    } catch {
      setError('Erro ao remover foto');
    } finally {
      setRemoving(false);
    }
  };

  // ── 2FA TOTP ──────────────────────────────────────
  const [show2FAConfig, setShow2FAConfig] = useState(false);
  const [qrCode, setQrCode] = useState('');
  const [totpSecret, setTotpSecret] = useState('');
  const [totpCode, setTotpCode] = useState('');
  const [isActivating, setIsActivating] = useState(false);
  const [isDeactivating, setIsDeactivating] = useState(false);
  const [totpPassword, setTotpPassword] = useState('');

  const handleEnable2FA = async () => {
    try {
      const result = await agentApi.enable2FA();
      if (result.success && result.data) {
        setQrCode(result.data.qrCode);
        setTotpSecret(result.data.secret);
        setShow2FAConfig(true);
      } else {
        showToast(result.error || 'Erro ao gerar 2FA', 'error');
      }
    } catch {
      showToast('Erro ao processar 2FA', 'error');
    }
  };

  const handleVerifyTOTP = async () => {
    if (totpCode.length !== 6) return;
    setIsActivating(true);
    try {
      const result = await agentApi.verifyTOTP(totpCode);
      if (result.success) {
        await refreshUser();
        showToast('2FA ativado com sucesso!', 'success');
        setShow2FAConfig(false);
        setTotpCode('');
      } else {
        showToast(result.error || 'Código inválido', 'error');
      }
    } catch {
      showToast('Erro ao validar 2FA', 'error');
    } finally {
      setIsActivating(false);
    }
  };

  const handleDisable2FA = async () => {
    if (!totpPassword) return;
    setIsDeactivating(true);
    try {
      const result = await agentApi.disable2FA(totpPassword);
      if (result.success) {
        await refreshUser();
        showToast('2FA desativado', 'success');
        setTotpPassword('');
      } else {
        showToast(result.error || 'Senha incorreta', 'error');
      }
    } catch {
      showToast('Erro ao desativar 2FA', 'error');
    } finally {
      setIsDeactivating(false);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-6">
        {/* Avatar */}
        <div className="relative group">
          <div className="h-20 w-20 rounded-2xl overflow-hidden bg-primary/5 border border-border/60 flex items-center justify-center shrink-0">
            {user?.avatar_url ? (
              <img
                src={user.avatar_url}
                alt={user.full_name}
                className="h-full w-full object-cover"
              />
            ) : (
              <span className="text-[22px] font-bold text-primary/60">
                {initials}
              </span>
            )}
          </div>

          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="absolute inset-0 flex items-center justify-center rounded-2xl bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity duration-200"
          >
            {uploading ? (
              <Loader2 size={22} className="text-white animate-spin" />
            ) : (
              <Camera size={22} className="text-white" />
            )}
          </button>

          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif"
            onChange={handleUpload}
            className="hidden"
          />
        </div>

        {/* Info do usuário */}
        <div className="flex flex-col gap-1.5 min-w-0">
          {/* Nome editável */}
          {editingName ? (
            <div className="flex items-center gap-2">
              <input
                ref={nameInputRef}
                value={nameValue}
                onChange={(e) => setNameValue(e.target.value)}
                onKeyDown={handleNameKeyDown}
                maxLength={100}
                disabled={savingName}
                className="text-[16px] font-semibold text-primary bg-transparent border-b-2 border-(--color-brand-primary) outline-none py-0.5 min-w-0 w-full max-w-[220px] transition-colors duration-200 placeholder:text-muted/40"
                placeholder="Seu nome completo"
              />
              <button
                onClick={saveName}
                disabled={savingName}
                className="flex items-center justify-center h-7 w-7 rounded-lg transition-all duration-200 hover:bg-green-500/10 text-green-600 disabled:opacity-50"
                title="Salvar"
              >
                {savingName ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <Check size={14} strokeWidth={2.5} />
                )}
              </button>
              <button
                onClick={cancelEditingName}
                disabled={savingName}
                className="flex items-center justify-center h-7 w-7 rounded-lg transition-all duration-200 hover:bg-danger/10 text-danger/70 disabled:opacity-50"
                title="Cancelar"
              >
                <X size={14} strokeWidth={2.5} />
              </button>
            </div>
          ) : (
            <button
              onClick={startEditingName}
              className="flex items-center gap-2 group/name rounded-lg px-2 py-1 -mx-2 -my-1 transition-all duration-200 hover:bg-border/40 cursor-pointer"
              title="Clique para editar o nome"
            >
              <p className="text-[16px] font-semibold text-primary truncate">
                {user?.full_name || 'Usuário'}
              </p>
              <Pencil
                size={12}
                strokeWidth={2}
                className="shrink-0 text-muted/50 group-hover/name:text-primary transition-colors duration-200"
              />
            </button>
          )}

          <p className="text-[13px] text-muted truncate">
            {user?.email}
          </p>
          <p className="text-[11px] text-muted/60 uppercase tracking-wider font-medium">
            {user?.role === 'master' ? 'Master' : 'Usuário'}
            {user?.tenant_name && ` — ${user.tenant_name}`}
          </p>
        </div>
      </div>

      {/* Botões de foto */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          className="flex items-center gap-2 rounded-xl px-4 py-2 text-[12.5px] font-medium text-white transition-all duration-200 hover:opacity-90 active:scale-95 disabled:opacity-50"
          style={{ backgroundColor: 'var(--color-brand-primary)' }}
        >
          {uploading ? (
            <Loader2 size={14} className="animate-spin" />
          ) : (
            <Camera size={14} />
          )}
          {uploading ? 'Enviando...' : 'Alterar foto'}
        </button>

        {user?.avatar_url && (
          <button
            onClick={handleRemove}
            disabled={removing}
            className="flex items-center gap-2 rounded-xl px-4 py-2 text-[12.5px] font-medium text-danger/80 border border-danger/20 transition-all duration-200 hover:bg-danger/5 hover:text-danger active:scale-95 disabled:opacity-50"
          >
            {removing ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <Trash2 size={14} />
            )}
            Remover
          </button>
        )}
      </div>

      {error && (
        <p className="text-[12px] text-danger">{error}</p>
      )}

      {/* 2FA Section */}
      <div className="mt-4 pt-6 border-t border-border/40">
        <div className="flex items-center gap-3 mb-4">
          <div className="h-9 w-9 rounded-xl bg-primary/5 border border-border/60 flex items-center justify-center">
            <ShieldCheck size={18} className="text-primary/70" />
          </div>
          <div>
            <p className="text-[14px] font-semibold text-primary">Autenticação de Dois Fatores (2FA)</p>
            <p className="text-[12px] text-muted">Proteja sua conta com segurança extra via TOTP.</p>
          </div>
        </div>

        {user && (user as any).two_factor_enabled ? (
          <div className="relative group">
            {/* Background Glow */}
            <div className="absolute -inset-0.5 bg-linear-to-r from-brand-primary/20 to-success/20 rounded-3xl blur opacity-30 group-hover:opacity-100 transition duration-1000 group-hover:duration-200" />

            <div className="relative bg-card/60 backdrop-blur-xl border border-success/30 rounded-3xl p-6 shadow-2xl overflow-hidden">
              <div className="absolute top-0 right-0 p-8 opacity-5">
                <ShieldCheck size={120} className="text-success rotate-12" />
              </div>

              <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 relative z-10">
                <div className="flex items-start gap-4">
                  <div className="h-12 w-12 rounded-2xl bg-success/10 flex items-center justify-center shrink-0 border border-success/20 shadow-inner">
                    <ShieldCheck size={24} className="text-success" />
                  </div>
                  <div className="space-y-1">
                    <p className="text-[15px] font-bold text-primary flex items-center gap-2">
                      Sua conta está protegida
                      <span className="flex items-center gap-1 text-[10px] bg-success/10 text-success px-2 py-0.5 rounded-full border border-success/20 uppercase tracking-wider font-bold">
                        Seguro
                      </span>
                    </p>
                    <p className="text-[13px] text-muted leading-relaxed max-w-sm">
                      A autenticação de dois fatores está ativa. Isso adiciona uma camada extra de segurança vital ao seu acesso.
                    </p>
                  </div>
                </div>

                <div className="flex flex-col gap-3 min-w-[240px]">
                  <div className="flex items-center gap-2">
                    <div className="relative flex-1">
                      <Lock size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted/40" />
                      <input
                        type="password"
                        value={totpPassword}
                        onChange={(e) => setTotpPassword(e.target.value)}
                        placeholder="Senha para desativar"
                        className="w-full h-10 pl-10 pr-4 rounded-xl text-[12px] bg-black/20 dark:bg-white/5 border border-border outline-none focus:border-danger/40 transition-all text-primary placeholder:text-muted/30"
                      />
                    </div>
                    <button
                      onClick={handleDisable2FA}
                      disabled={isDeactivating || !totpPassword}
                      className="h-10 px-4 rounded-xl text-[12px] font-bold text-danger hover:bg-danger/10 border border-danger/20 transition-all disabled:opacity-30 disabled:cursor-not-allowed whitespace-nowrap"
                    >
                      {isDeactivating ? <Loader2 size={14} className="animate-spin" /> : 'Desativar'}
                    </button>
                  </div>
                  <p className="text-[10px] text-muted/50 text-center italic">
                    Insira sua senha atual apenas se desejar desativar o 2FA.
                  </p>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="bg-primary/5 border border-border/40 rounded-2xl p-5">
            {!show2FAConfig ? (
              <div className="flex items-center justify-between gap-6">
                <div className="flex items-center gap-4">
                  <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                    <Smartphone size={20} className="text-primary/70" />
                  </div>
                  <p className="text-[13px] text-primary/80 leading-relaxed">
                    Ative a autenticação via Google Authenticator ou similar para maior segurança.
                  </p>
                </div>
                <button
                  onClick={handleEnable2FA}
                  className="shrink-0 h-10 px-5 rounded-xl text-[12.5px] font-semibold text-white bg-primary hover:opacity-90 transition-all active:scale-95"
                  style={{ backgroundColor: 'var(--color-brand-primary)' }}
                >
                  Configurar 2FA
                </button>
              </div>
            ) : (
              <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">
                <div className="flex flex-col md:flex-row gap-8 items-start">
                  {/* QR Code */}
                  <div className="flex flex-col items-center gap-3 bg-white/5 dark:bg-white/10 p-6 rounded-3xl border border-border/40 shadow-inner shrink-0 backdrop-blur-xl">
                    {qrCode ? (
                      <div className="relative group">
                        <div className="absolute -inset-4 bg-brand-primary/10 blur-2xl rounded-full transition-opacity duration-1000" />
                        <img
                          src={qrCode}
                          alt="QR Code 2FA"
                          className="h-32 w-32 relative z-10 brightness-110 contrast-125 drop-shadow-[0_0_8px_rgba(9,202,255,0.2)]"
                        />
                      </div>
                    ) : (
                      <div className="h-32 w-32 flex items-center justify-center">
                        <Loader2 className="animate-spin text-muted" />
                      </div>
                    )}
                    <span className="text-[10px] font-bold text-muted/60 tracking-wider uppercase">Escaneie o QR Code</span>
                  </div>

                  {/* Instructions & Code */}
                  <div className="flex-1 min-w-0">
                    <p className="text-[13.5px] font-semibold text-primary mb-2">Configure seu aplicativo</p>
                    <ol className="text-[12.5px] text-muted space-y-2 mb-6 list-decimal pl-4">
                      <li>Escaneie o código ao lado com seu app autenticador.</li>
                      <li>
                        Se não conseguir escanear, use o segredo:
                        <code className="ml-1 px-1.5 py-0.5 bg-primary/5 rounded font-mono text-primary font-bold">{totpSecret}</code>
                      </li>
                      <li>Insira o código de 6 dígitos gerado pelo app abaixo para confirmar.</li>
                    </ol>

                    <div className="flex flex-col gap-3">
                      <label className="text-[12px] font-medium text-primary/70">Código de 6 dígitos</label>
                      <div className="flex items-center gap-3">
                        <div className="relative flex-1">
                          <Smartphone size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted/40" />
                          <input
                            type="text"
                            value={totpCode}
                            onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                            placeholder="000 000"
                            className="w-full h-12 pl-10 pr-4 rounded-2xl text-[14px] bg-black/20 dark:bg-black/40 border border-border/60 outline-none focus:border-brand-primary focus:ring-4 focus:ring-brand-primary/10 transition-all font-mono tracking-widest text-primary placeholder:text-muted/20 backdrop-blur-sm"
                          />
                        </div>
                        <button
                          onClick={handleVerifyTOTP}
                          disabled={isActivating || totpCode.length !== 6}
                          className="h-10 px-5 rounded-xl text-[12.5px] font-semibold text-white bg-primary hover:opacity-90 transition-colors disabled:opacity-50"
                          style={{ backgroundColor: 'var(--color-brand-primary)' }}
                        >
                          {isActivating ? 'Verificando...' : 'Ativar 2FA'}
                        </button>
                        <button
                          onClick={() => setShow2FAConfig(false)}
                          className="h-10 px-4 rounded-xl text-[12.5px] font-medium text-muted hover:bg-border/20 transition-colors"
                        >
                          Cancelar
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
