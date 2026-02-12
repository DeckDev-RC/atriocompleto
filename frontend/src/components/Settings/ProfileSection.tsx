import { useState, useRef } from 'react';
import { Camera, Trash2, Loader2, Pencil, Check, X } from 'lucide-react';
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
                className="text-[16px] font-semibold text-primary bg-transparent border-b-2 border-[var(--color-brand-primary)] outline-none py-0.5 min-w-0 w-full max-w-[220px] transition-colors duration-200 placeholder:text-muted/40"
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
    </div>
  );
}
