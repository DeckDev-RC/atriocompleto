import { useState, useEffect, useCallback, type FormEvent } from 'react';
import {
  Building2,
  Users,
  Plus,
  Pencil,
  Trash2,
  Loader2,
  KeyRound,
  Search,
  Shield,
  User,
  Check,
  AlertCircle,
} from 'lucide-react';
import { Header } from '../components/Header';
import { agentApi } from '../services/agentApi';
import { useAuth } from '../contexts/AuthContext';

/* ===== Types ===== */

interface Tenant {
  id: string;
  name: string;
  created_at: string;
  user_count: number;
}

interface UserProfile {
  id: string;
  email: string;
  full_name: string;
  role: 'master' | 'user';
  tenant_id: string | null;
  tenant_name: string;
  is_active: boolean;
  created_at: string;
}

/* ===== AdminPage ===== */

export function AdminPage() {
  const [activeTab, setActiveTab] = useState<'tenants' | 'users'>('tenants');

  return (
    <div className="p-6 max-md:p-4">
      <Header title="Administração" subtitle="Gerenciar empresas e usuários" />

      {/* Tab bar */}
      <div className="mt-6 mb-6 flex gap-1 rounded-xl bg-border/40 dark:bg-[rgba(255,255,255,0.03)] p-1 w-fit">
        {[
          { key: 'tenants' as const, label: 'Empresas', icon: Building2 },
          { key: 'users' as const, label: 'Usuários', icon: Users },
        ].map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`flex items-center gap-2 rounded-lg px-4 py-2 text-[13px] font-medium transition-all duration-200 ${activeTab === tab.key
              ? 'bg-card text-primary shadow-soft dark:shadow-dark-card'
              : 'text-secondary hover:text-primary'
              }`}
          >
            <tab.icon size={15} strokeWidth={2} />
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'tenants' ? <TenantsPanel /> : <UsersPanel />}
    </div>
  );
}

/* ===== Tenants Panel ===== */

function TenantsPanel() {
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingTenant, setEditingTenant] = useState<Tenant | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const r = await agentApi.getTenants();
    if (r.success && r.data) setTenants(r.data as Tenant[]);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Excluir empresa "${name}"? Essa ação não pode ser desfeita.`)) return;
    const r = await agentApi.deleteTenant(id);
    if (r.success) load();
    else alert(r.error || 'Erro ao excluir');
  };

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-[16px] font-semibold text-primary tracking-[-0.01em]">
          {loading ? '...' : `${tenants.length} empresa${tenants.length !== 1 ? 's' : ''}`}
        </h2>
        <button
          onClick={() => { setEditingTenant(null); setShowForm(true); }}
          className="flex items-center gap-2 rounded-xl bg-accent px-4 py-2.5 text-[13px] font-semibold text-white shadow-sm transition-all duration-200 hover:shadow-md hover:-translate-y-0.5 active:scale-95"
        >
          <Plus size={15} strokeWidth={2.5} />
          Nova Empresa
        </button>
      </div>

      {loading ? (
        <LoadingSkeleton count={3} />
      ) : tenants.length === 0 ? (
        <EmptyState icon={Building2} text="Nenhuma empresa cadastrada" />
      ) : (
        <div className="grid gap-3">
          {tenants.map((t) => (
            <div
              key={t.id}
              className="flex items-center justify-between rounded-2xl border border-border bg-card p-5 shadow-soft dark:shadow-dark-card transition-all duration-200 hover:shadow-soft-hover dark:hover:shadow-dark-hover"
            >
              <div className="flex items-center gap-4">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent/10">
                  <Building2 size={18} className="text-accent" strokeWidth={1.8} />
                </div>
                <div>
                  <p className="text-[14px] font-semibold text-primary tracking-[-0.01em]">{t.name}</p>
                  <p className="text-[12px] text-muted">
                    {t.user_count} usuário{t.user_count !== 1 ? 's' : ''} · Criada em {new Date(t.created_at).toLocaleDateString('pt-BR')}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => { setEditingTenant(t); setShowForm(true); }}
                  className="flex h-8 w-8 items-center justify-center rounded-lg text-secondary transition-all hover:bg-border/60 hover:text-primary active:scale-90"
                  title="Editar"
                >
                  <Pencil size={14} />
                </button>
                <button
                  onClick={() => handleDelete(t.id, t.name)}
                  className="flex h-8 w-8 items-center justify-center rounded-lg text-secondary transition-all hover:bg-danger/10 hover:text-danger active:scale-90"
                  title="Excluir"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {showForm && (
        <TenantFormModal
          tenant={editingTenant}
          onClose={() => setShowForm(false)}
          onSaved={() => { setShowForm(false); load(); }}
        />
      )}
    </div>
  );
}

/* ===== Users Panel ===== */

function UsersPanel() {
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingUser, setEditingUser] = useState<UserProfile | null>(null);
  const [resetUserId, setResetUserId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const { refreshUser } = useAuth();

  const load = useCallback(async () => {
    console.log('[Admin] Loading users and tenants...');
    setLoading(true);
    const [uRes, tRes] = await Promise.all([agentApi.getUsers(), agentApi.getTenants()]);
    console.log('[Admin] Users response:', uRes);
    if (uRes.success && uRes.data) {
      setUsers(uRes.data as UserProfile[]);
      console.log('[Admin] Users set:', (uRes.data as any[]).length);
    }
    if (tRes.success && tRes.data) setTenants(tRes.data as Tenant[]);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Excluir "${name}"? O usuário será removido permanentemente.`)) return;
    const r = await agentApi.deleteUser(id);
    if (r.success) load();
    else alert(r.error || 'Erro ao excluir');
  };

  const handleToggleActive = async (user: UserProfile) => {
    const r = await agentApi.updateUser(user.id, { is_active: !user.is_active });
    if (r.success) load();
  };

  const filtered = users.filter((u) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return u.full_name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q) || u.tenant_name.toLowerCase().includes(q);
  });

  return (
    <div>
      <div className="mb-4 flex items-center justify-between gap-3 flex-wrap">
        <h2 className="text-[16px] font-semibold text-primary tracking-[-0.01em]">
          {loading ? '...' : `${users.length} usuário${users.length !== 1 ? 's' : ''}`}
        </h2>
        <div className="flex items-center gap-3">
          {/* Search */}
          <div className="relative">
            <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
            <input
              type="text"
              placeholder="Buscar..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-48 rounded-xl border border-border bg-body/60 py-2 pl-9 pr-3 text-[13px] text-primary placeholder:text-muted outline-none transition-all duration-200 focus:w-56 focus:border-accent/30 focus:ring-2 focus:ring-accent/8"
            />
          </div>
          <button
            onClick={() => { setEditingUser(null); setShowForm(true); }}
            className="flex items-center gap-2 rounded-xl bg-accent px-4 py-2.5 text-[13px] font-semibold text-white shadow-sm transition-all duration-200 hover:shadow-md hover:-translate-y-0.5 active:scale-95"
          >
            <Plus size={15} strokeWidth={2.5} />
            Novo Usuário
          </button>
        </div>
      </div>

      {loading ? (
        <LoadingSkeleton count={4} />
      ) : filtered.length === 0 ? (
        <EmptyState icon={Users} text={search ? 'Nenhum resultado' : 'Nenhum usuário cadastrado'} />
      ) : (
        <div className="grid gap-3">
          {filtered.map((u) => (
            <div
              key={u.id}
              className={`flex items-center justify-between rounded-2xl border bg-card p-5 shadow-soft dark:shadow-dark-card transition-all duration-200 hover:shadow-soft-hover dark:hover:shadow-dark-hover ${u.is_active ? 'border-border' : 'border-danger/20 opacity-60'
                }`}
            >
              <div className="flex items-center gap-4 min-w-0">
                <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${u.role === 'master' ? 'bg-warning/10' : 'bg-accent/10'
                  }`}>
                  {u.role === 'master' ? (
                    <Shield size={18} className="text-warning" strokeWidth={1.8} />
                  ) : (
                    <User size={18} className="text-accent" strokeWidth={1.8} />
                  )}
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-[14px] font-semibold text-primary tracking-[-0.01em] truncate">
                      {u.full_name}
                    </p>
                    <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${u.role === 'master' ? 'bg-warning/10 text-warning' : 'bg-accent/10 text-accent'
                      }`}>
                      {u.role}
                    </span>
                    {!u.is_active && (
                      <span className="shrink-0 rounded-full bg-danger/10 px-2 py-0.5 text-[10px] font-semibold text-danger uppercase">
                        Inativo
                      </span>
                    )}
                  </div>
                  <p className="text-[12px] text-muted truncate">
                    {u.email} · {u.tenant_name || 'Sem empresa'}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-1.5 shrink-0 ml-3">
                <button
                  onClick={() => handleToggleActive(u)}
                  className={`flex h-8 w-8 items-center justify-center rounded-lg text-secondary transition-all hover:bg-border/60 active:scale-90 ${u.is_active ? 'hover:text-success' : 'hover:text-danger'
                    }`}
                  title={u.is_active ? 'Desativar' : 'Ativar'}
                >
                  {u.is_active ? <Check size={14} /> : <AlertCircle size={14} />}
                </button>
                <button
                  onClick={() => setResetUserId(u.id)}
                  className="flex h-8 w-8 items-center justify-center rounded-lg text-secondary transition-all hover:bg-border/60 hover:text-warning active:scale-90"
                  title="Resetar senha"
                >
                  <KeyRound size={14} />
                </button>
                <button
                  onClick={() => { setEditingUser(u); setShowForm(true); }}
                  className="flex h-8 w-8 items-center justify-center rounded-lg text-secondary transition-all hover:bg-border/60 hover:text-primary active:scale-90"
                  title="Editar"
                >
                  <Pencil size={14} />
                </button>
                {u.role !== 'master' && (
                  <button
                    onClick={() => handleDelete(u.id, u.full_name)}
                    className="flex h-8 w-8 items-center justify-center rounded-lg text-secondary transition-all hover:bg-danger/10 hover:text-danger active:scale-90"
                    title="Excluir"
                  >
                    <Trash2 size={14} />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {showForm && (
        <UserFormModal
          user={editingUser}
          tenants={tenants}
          onClose={() => setShowForm(false)}
          onSaved={() => {
            console.log('[Admin] User saved, refreshing list...');
            setShowForm(false);
            load();
            refreshUser();
          }}
        />
      )}

      {resetUserId && (
        <ResetPasswordModal
          userId={resetUserId}
          onClose={() => setResetUserId(null)}
        />
      )}
    </div>
  );
}

/* ===== Modal: Tenant Form ===== */

function TenantFormModal({
  tenant,
  onClose,
  onSaved,
}: {
  tenant: Tenant | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(tenant?.name || '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const isEdit = !!tenant;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    const r = isEdit
      ? await agentApi.updateTenant(tenant!.id, name)
      : await agentApi.createTenant(name);

    if (r.success) onSaved();
    else setError(r.error || 'Erro ao salvar');
    setLoading(false);
  };

  return (
    <ModalOverlay onClose={onClose}>
      <form onSubmit={handleSubmit}>
        <h3 className="text-[17px] font-bold text-primary tracking-[-0.02em] mb-5">
          {isEdit ? 'Editar Empresa' : 'Nova Empresa'}
        </h3>

        {error && <ErrorBanner text={error} />}

        <div className="mb-6">
          <label className="mb-2 block text-[12px] font-semibold uppercase tracking-[0.05em] text-muted">
            Nome da empresa
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Ex: Ambro"
            required
            autoFocus
            className="w-full rounded-xl border border-border bg-body/60 px-4 py-3 text-[14px] text-primary placeholder:text-muted outline-none transition-all focus:border-accent/30 focus:ring-2 focus:ring-accent/8"
          />
        </div>

        <div className="flex justify-end gap-3">
          <button type="button" onClick={onClose} className="rounded-xl px-4 py-2.5 text-[13px] font-medium text-secondary transition-all hover:bg-border/60">
            Cancelar
          </button>
          <SubmitButton loading={loading} text={isEdit ? 'Salvar' : 'Criar Empresa'} />
        </div>
      </form>
    </ModalOverlay>
  );
}

/* ===== Modal: User Form ===== */

function UserFormModal({
  user,
  tenants,
  onClose,
  onSaved,
}: {
  user: UserProfile | null;
  tenants: Tenant[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const isEdit = !!user;
  const [form, setForm] = useState({
    full_name: user?.full_name || '',
    email: user?.email || '',
    password: '',
    role: user?.role || 'user' as 'master' | 'user',
    tenant_id: user?.tenant_id || '',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});

  const set = (key: string, value: string) => setForm((p) => ({ ...p, [key]: value }));

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setFieldErrors({});
    setLoading(true);

    if (isEdit) {
      const r = await agentApi.updateUser(user!.id, {
        full_name: form.full_name,
        role: form.role,
        tenant_id: form.tenant_id || null,
      });
      if (r.success) onSaved();
      else setError(r.error || 'Erro ao salvar');
    } else {
      const r = await agentApi.createUser({
        email: form.email,
        password: form.password,
        full_name: form.full_name,
        role: form.role,
        tenant_id: form.tenant_id || null,
      });
      if (r.success) onSaved();
      else {
        setError(r.error || 'Erro ao criar');
        setFieldErrors(r.details || {});
      }
    }
    setLoading(false);
  };

  return (
    <ModalOverlay onClose={onClose}>
      <form onSubmit={handleSubmit}>
        <h3 className="text-[17px] font-bold text-primary tracking-[-0.02em] mb-5">
          {isEdit ? 'Editar Usuário' : 'Novo Usuário'}
        </h3>

        {error && <ErrorBanner text={error} />}

        <div className="grid gap-4 mb-6">
          <div>
            <label className="mb-2 block text-[12px] font-semibold uppercase tracking-[0.05em] text-muted">Nome</label>
            <input type="text" value={form.full_name} onChange={(e) => set('full_name', e.target.value)} required autoFocus
              className="w-full rounded-xl border border-border bg-body/60 px-4 py-3 text-[14px] text-primary placeholder:text-muted outline-none transition-all focus:border-accent/30 focus:ring-2 focus:ring-accent/8"
              placeholder="Nome completo"
            />
            {fieldErrors.full_name && (
              <p className="mt-1 text-[11px] text-danger">
                {fieldErrors.full_name[0]}
              </p>
            )}
          </div>

          {!isEdit && (
            <>
              <div>
                <label className="mb-2 block text-[12px] font-semibold uppercase tracking-[0.05em] text-muted">Email</label>
                <input type="email" value={form.email} onChange={(e) => set('email', e.target.value)} required
                  className="w-full rounded-xl border border-border bg-body/60 px-4 py-3 text-[14px] text-primary placeholder:text-muted outline-none transition-all focus:border-accent/30 focus:ring-2 focus:ring-accent/8"
                  placeholder="usuario@email.com"
                />
                {fieldErrors.email && (
                  <p className="mt-1 text-[11px] text-danger">
                    {fieldErrors.email[0]}
                  </p>
                )}
              </div>
              <div>
                <label className="mb-2 block text-[12px] font-semibold uppercase tracking-[0.05em] text-muted">Senha</label>
                <input type="password" value={form.password} onChange={(e) => set('password', e.target.value)} required minLength={6}
                  className="w-full rounded-xl border border-border bg-body/60 px-4 py-3 text-[14px] text-primary placeholder:text-muted outline-none transition-all focus:border-accent/30 focus:ring-2 focus:ring-accent/8"
                  placeholder="Mínimo 6 caracteres"
                />
                {fieldErrors.password && (
                  <p className="mt-1 text-[11px] text-danger">
                    {fieldErrors.password[0]}
                  </p>
                )}
              </div>
            </>
          )}

          <div className="grid grid-cols-2 gap-4 max-sm:grid-cols-1">
            <div>
              <label className="mb-2 block text-[12px] font-semibold uppercase tracking-[0.05em] text-muted">Papel</label>
              <select value={form.role} onChange={(e) => set('role', e.target.value)}
                className="w-full rounded-xl border border-border bg-body/60 px-4 py-3 text-[14px] text-primary outline-none transition-all focus:border-accent/30 focus:ring-2 focus:ring-accent/8 appearance-none"
              >
                <option value="user">Usuário</option>
                <option value="master">Master</option>
              </select>
            </div>
            <div>
              <label className="mb-2 block text-[12px] font-semibold uppercase tracking-[0.05em] text-muted">Empresa</label>
              <select value={form.tenant_id} onChange={(e) => set('tenant_id', e.target.value)}
                className="w-full rounded-xl border border-border bg-body/60 px-4 py-3 text-[14px] text-primary outline-none transition-all focus:border-accent/30 focus:ring-2 focus:ring-accent/8 appearance-none"
              >
                <option value="">— Nenhuma —</option>
                {tenants.map((t) => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-3">
          <button type="button" onClick={onClose} className="rounded-xl px-4 py-2.5 text-[13px] font-medium text-secondary transition-all hover:bg-border/60">
            Cancelar
          </button>
          <SubmitButton loading={loading} text={isEdit ? 'Salvar' : 'Criar Usuário'} />
        </div>
      </form>
    </ModalOverlay>
  );
}

/* ===== Modal: Reset Password ===== */

function ResetPasswordModal({ userId, onClose }: { userId: string; onClose: () => void }) {
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    const r = await agentApi.resetUserPassword(userId, password);
    if (r.success) {
      setSuccess(true);
      setTimeout(onClose, 1200);
    } else setError(r.error || 'Erro');
    setLoading(false);
  };

  return (
    <ModalOverlay onClose={onClose}>
      <form onSubmit={handleSubmit}>
        <h3 className="text-[17px] font-bold text-primary tracking-[-0.02em] mb-5">
          Resetar Senha
        </h3>

        {error && <ErrorBanner text={error} />}
        {success && (
          <div className="mb-5 rounded-xl border border-success/20 bg-success/5 px-4 py-3 text-[13px] text-success flex items-center gap-2">
            <Check size={15} /> Senha alterada com sucesso!
          </div>
        )}

        <div className="mb-6">
          <label className="mb-2 block text-[12px] font-semibold uppercase tracking-[0.05em] text-muted">Nova senha</label>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} autoFocus
            className="w-full rounded-xl border border-border bg-body/60 px-4 py-3 text-[14px] text-primary placeholder:text-muted outline-none transition-all focus:border-accent/30 focus:ring-2 focus:ring-accent/8"
            placeholder="Mínimo 6 caracteres"
          />
        </div>

        <div className="flex justify-end gap-3">
          <button type="button" onClick={onClose} className="rounded-xl px-4 py-2.5 text-[13px] font-medium text-secondary transition-all hover:bg-border/60">
            Cancelar
          </button>
          <SubmitButton loading={loading} text="Resetar Senha" />
        </div>
      </form>
    </ModalOverlay>
  );
}

/* ===== Shared Components ===== */

function ModalOverlay({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-500 flex items-center justify-center p-4 bg-overlay backdrop-blur-[3px]"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      style={{ animation: 'fade-in 0.2s ease-out' }}
    >
      <div className="w-full max-w-[460px] rounded-2xl border border-border bg-card p-7 shadow-float dark:shadow-dark-float"
        style={{ animation: 'scale-in 0.25s cubic-bezier(0.16,1,0.3,1)' }}
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}

function SubmitButton({ loading, text }: { loading: boolean; text: string }) {
  return (
    <button
      type="submit"
      disabled={loading}
      className={`flex items-center gap-2 rounded-xl px-5 py-2.5 text-[13px] font-semibold text-white transition-all duration-200 ${loading ? 'bg-muted cursor-not-allowed' : 'bg-accent hover:shadow-md active:scale-95'
        }`}
    >
      {loading && <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} />}
      {text}
    </button>
  );
}

function ErrorBanner({ text }: { text: string }) {
  return (
    <div className="mb-5 rounded-xl border border-danger/20 bg-danger/5 px-4 py-3 text-[13px] text-danger">
      {text}
    </div>
  );
}

function EmptyState({ icon: Icon, text }: { icon: typeof Building2; text: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center rounded-2xl border border-dashed border-border bg-card/50">
      <Icon size={32} className="text-muted mb-3" strokeWidth={1.2} />
      <p className="text-[14px] text-muted">{text}</p>
    </div>
  );
}

function LoadingSkeleton({ count }: { count: number }) {
  return (
    <div className="grid gap-3">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="h-[76px] rounded-2xl shimmer" />
      ))}
    </div>
  );
}
