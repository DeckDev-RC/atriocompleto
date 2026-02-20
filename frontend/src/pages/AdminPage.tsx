import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Header } from '../components/Header';
import { agentApi } from '../services/agentApi';
import { useAuth } from '../contexts/AuthContext';
import { PasswordStrengthIndicator } from '../components/PasswordStrengthIndicator';
import { AuditLogPanel } from '../components/Admin/AuditLogPanel';

import { AccessControlPanel } from '../components/Admin/AccessControlPanel';

type RoleType = 'master' | 'user';
type Tab = 'tenants' | 'users' | 'requests' | 'audit' | 'security' | 'access';
type RequestStatus = 'pending' | 'reviewed' | 'approved' | 'rejected' | 'converted';

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
  role: RoleType;
  tenant_id: string | null;
  tenant_name: string;
  is_active: boolean;
  bypass_2fa: boolean;
  created_at: string;
}

interface AccessRequest {
  id: string;
  full_name: string;
  phone: string;
  email: string;
  company_name: string;
  status: RequestStatus;
  admin_notes: string | null;
  created_at: string;
}

export function AdminPage() {
  const [tab, setTab] = useState<Tab>('tenants');

  return (
    <div className="p-6 max-md:p-4">
      <Header title="Administração" subtitle="Gerenciar empresas, usuários e acessos" />

      <div className="mt-6 mb-6 flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
        <button className={`whitespace-nowrap rounded-lg px-3 py-2 text-sm transition-colors ${tab === 'tenants' ? 'bg-card border border-border shadow-sm text-brand-primary font-medium' : 'text-muted hover:text-body-content'}`} onClick={() => setTab('tenants')}>Empresas</button>
        <button className={`whitespace-nowrap rounded-lg px-3 py-2 text-sm transition-colors ${tab === 'users' ? 'bg-card border border-border shadow-sm text-brand-primary font-medium' : 'text-muted hover:text-body-content'}`} onClick={() => setTab('users')}>Usuários</button>
        <button className={`whitespace-nowrap rounded-lg px-3 py-2 text-sm transition-colors ${tab === 'access' ? 'bg-card border border-border shadow-sm text-brand-primary font-medium' : 'text-muted hover:text-body-content'}`} onClick={() => setTab('access')}>Controle de Acessos</button>
        <button className={`whitespace-nowrap rounded-lg px-3 py-2 text-sm transition-colors ${tab === 'requests' ? 'bg-card border border-border shadow-sm text-brand-primary font-medium' : 'text-muted hover:text-body-content'}`} onClick={() => setTab('requests')}>Solicitações</button>
        <button className={`whitespace-nowrap rounded-lg px-3 py-2 text-sm transition-colors ${tab === 'audit' ? 'bg-card border border-border shadow-sm text-brand-primary font-medium' : 'text-muted hover:text-body-content'}`} onClick={() => setTab('audit')}>Auditoria</button>
        <button className={`whitespace-nowrap rounded-lg px-3 py-2 text-sm transition-colors ${tab === 'security' ? 'bg-card border border-border shadow-sm text-brand-primary font-medium' : 'text-muted hover:text-body-content'}`} onClick={() => setTab('security')}>Segurança</button>
      </div>

      <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">
        {tab === 'tenants' && <TenantsPanel />}
        {tab === 'users' && <UsersPanel />}
        {tab === 'access' && <AccessControlPanel />}
        {tab === 'requests' && <RequestsPanel />}
        {tab === 'audit' && <AuditLogPanel />}
        {tab === 'security' && <SecurityPanel />}
      </div>
    </div>
  );
}

function TenantsPanel() {
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const result = await agentApi.getTenants();
    if (result.success && result.data) setTenants(result.data as Tenant[]);
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    if (editingId) await agentApi.updateTenant(editingId, name.trim());
    else await agentApi.createTenant(name.trim());
    setName('');
    setEditingId(null);
    load();
  };

  const remove = async (tenant: Tenant) => {
    if (!confirm(`Excluir empresa "${tenant.name}"?`)) return;
    const result = await agentApi.deleteTenant(tenant.id);
    if (!result.success) alert(result.error || 'Erro');
    load();
  };

  return (
    <div className="grid gap-4">
      <form onSubmit={submit} className="rounded-xl border border-border bg-card p-4">
        <p className="mb-2 text-sm font-semibold">{editingId ? 'Editar empresa' : 'Nova empresa'}</p>
        <div className="flex gap-2">
          <input className="flex-1 rounded-lg border border-border bg-body/60 px-3 py-2 text-sm" value={name} onChange={(e) => setName(e.target.value)} placeholder="Nome da empresa" required />
          <button className="rounded-lg bg-(--color-brand-primary) px-4 py-2 text-sm text-white">{editingId ? 'Salvar' : 'Criar'}</button>
        </div>
      </form>
      {loading ? <p className="text-sm text-muted">Carregando...</p> : tenants.map((tenant) => (
        <div key={tenant.id} className="rounded-xl border border-border bg-card p-4">
          <div className="flex items-center justify-between gap-2">
            <div>
              <p className="text-sm font-semibold">{tenant.name}</p>
              <p className="text-xs text-muted">{tenant.user_count} usuario(s)</p>
            </div>
            <div className="flex gap-2">
              <button className="rounded-md border border-border px-2 py-1 text-xs" onClick={() => { setEditingId(tenant.id); setName(tenant.name); }}>Editar</button>
              <button className="rounded-md border border-danger/30 px-2 py-1 text-xs text-danger" onClick={() => remove(tenant)}>Excluir</button>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function UsersPanel() {
  const { user: currentUser } = useAuth();
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [resetId, setResetId] = useState<string | null>(null);
  const [form, setForm] = useState({
    full_name: '',
    email: '',
    role: 'user' as RoleType,
    tenant_id: '',
    bypass_2fa: false,
  });
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    const [usersResult, tenantsResult] = await Promise.all([agentApi.getUsers(), agentApi.getTenants()]);

    if (usersResult.success && usersResult.data) {
      setUsers(usersResult.data as UserProfile[]);
    } else if (usersResult.error?.includes('negado') || usersResult.error?.includes('encontrado')) {
      setError('Erro de permissão ou sessão. Tente atualizar seu perfil.');
    } else {
      setError(usersResult.error || 'Erro ao carregar usuários');
    }

    if (tenantsResult.success && tenantsResult.data) {
      setTenants(tenantsResult.data as Tenant[]);
    }
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    if (editingId) {
      const result = await agentApi.updateUser(editingId, {
        full_name: form.full_name,
        role: form.role,
        tenant_id: form.tenant_id || null,
        bypass_2fa: form.bypass_2fa,
      });
      if (!result.success) setError(result.error || 'Erro ao salvar');
    } else {
      const result = await agentApi.createUser({
        full_name: form.full_name,
        email: form.email,
        role: form.role,
        tenant_id: form.tenant_id || null,
        bypass_2fa: form.bypass_2fa,
      });
      if (!result.success) setError(result.error || 'Erro ao criar');
    }
    setEditingId(null);
    setForm({ full_name: '', email: '', role: 'user', tenant_id: '', bypass_2fa: false });
    load();
  };

  const filtered = users.filter((user) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return user.full_name.toLowerCase().includes(q) || user.email.toLowerCase().includes(q) || user.tenant_name.toLowerCase().includes(q);
  });

  const startEdit = (user: UserProfile) => {
    setEditingId(user.id);
    setForm({
      full_name: user.full_name,
      email: user.email,
      role: user.role,
      tenant_id: user.tenant_id || '',
      bypass_2fa: user.bypass_2fa || false,
    });
  };

  const remove = async (user: UserProfile) => {
    if (!confirm(`Excluir usuario "${user.full_name}"?`)) return;
    const result = await agentApi.deleteUser(user.id);
    if (!result.success) alert(result.error || 'Erro');
    load();
  };

  return (
    <div className="grid gap-4">
      <form onSubmit={submit} className="rounded-xl border border-border bg-card p-4">
        <p className="mb-2 text-sm font-semibold">{editingId ? 'Editar usuario' : 'Novo usuario'}</p>
        {error && (
          <div className="mb-4 rounded-lg border border-danger/20 bg-danger/5 p-3">
            <p className="text-xs text-danger">{error}</p>
            {(error.includes('sessão') || error.includes('permissão')) && (
              <button
                type="button"
                onClick={() => { useAuth().refreshUser(); load(); }}
                className="mt-2 text-xs font-semibold text-brand-primary underline"
              >
                Atualizar minha sessão agora
              </button>
            )}
          </div>
        )}
        <div className="grid gap-2 md:grid-cols-2">
          <input className="rounded-lg border border-border bg-body/60 px-3 py-2 text-sm" placeholder="Nome" value={form.full_name} onChange={(e) => setForm((p) => ({ ...p, full_name: e.target.value }))} required />
          <input className="rounded-lg border border-border bg-body/60 px-3 py-2 text-sm" placeholder="Email" value={form.email} disabled={!!editingId} onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))} required />
          <select
            className="rounded-lg border border-border bg-body/60 px-3 py-2 text-sm disabled:opacity-50"
            value={form.role}
            onChange={(e) => setForm((p) => ({ ...p, role: e.target.value as RoleType }))}
            disabled={editingId === currentUser?.id}
          >
            <option value="user">Usuario</option>
            <option value="master">Master</option>
          </select>
          <select
            className="rounded-lg border border-border bg-body/60 px-3 py-2 text-sm disabled:opacity-50"
            value={form.tenant_id}
            onChange={(e) => setForm((p) => ({ ...p, tenant_id: e.target.value }))}
            disabled={editingId === currentUser?.id}
          >
            <option value="">Sem empresa</option>
            {tenants.map((tenant) => <option key={tenant.id} value={tenant.id}>{tenant.name}</option>)}
          </select>
        </div>
        <div className="mt-3 flex items-center gap-2 px-1">
          <input
            type="checkbox"
            id="bypass_2fa"
            checked={form.bypass_2fa}
            onChange={(e) => setForm(p => ({ ...p, bypass_2fa: e.target.checked }))}
            className="rounded border-border accent-brand-primary h-4 w-4"
          />
          <label htmlFor="bypass_2fa" className="text-sm font-medium text-primary cursor-pointer select-none">
            Permitir Login sem 2FA (Para clientes Beta/Testes)
          </label>
        </div>
        {editingId === currentUser?.id && (
          <p className="mt-2 text-xs text-brand-primary">
            ℹ️ Como administrador master, você não pode alterar sua própria empresa ou nível de acesso por aqui para evitar bloqueio acidental.
          </p>
        )}
        <div className="mt-4 flex gap-2">
          <button className="rounded-lg bg-(--color-brand-primary) px-4 py-2 text-sm text-white">{editingId ? 'Salvar' : 'Criar'}</button>
          {editingId && <button type="button" className="rounded-lg border border-border px-4 py-2 text-sm" onClick={() => { setEditingId(null); setForm({ full_name: '', email: '', role: 'user', tenant_id: '', bypass_2fa: false }); }}>Cancelar</button>}
        </div>
      </form>

      <div className="rounded-xl border border-border bg-card p-4">
        <div className="mb-3 flex items-center justify-between gap-2">
          <p className="text-sm font-semibold">Usuarios</p>
          <input className="w-56 rounded-lg border border-border bg-body/60 px-3 py-2 text-sm" placeholder="Buscar..." value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        {loading ? <p className="text-sm text-muted">Carregando...</p> : filtered.map((user) => (
          <div key={user.id} className="mb-2 rounded-lg border border-border p-3">
            <p className="text-sm font-semibold">{user.full_name} ({user.role})</p>
            <p className="text-xs text-muted">{user.email} · {user.tenant_name}</p>
            <div className="mt-2 flex gap-2">
              <button className="rounded-md border border-border px-2 py-1 text-xs" onClick={() => startEdit(user)}>Editar</button>
              <button className="rounded-md border border-border px-2 py-1 text-xs" onClick={() => setResetId(user.id)}>Resetar senha</button>
              {user.role !== 'master' && user.id !== currentUser?.id && (
                <button className="rounded-md border border-danger/30 px-2 py-1 text-xs text-danger" onClick={() => remove(user)}>Excluir</button>
              )}
            </div>
            {resetId === user.id && <ResetInline userId={user.id} onDone={() => { setResetId(null); load(); }} />}
          </div>
        ))}
      </div>
    </div>
  );
}

function ResetInline({ userId, onDone }: { userId: string; onDone: () => void }) {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [isPasswordValid, setIsPasswordValid] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    if (!isPasswordValid) { setError("Senha insuficiente"); return; }
    if (password !== confirmPassword) { setError('As senhas nao coincidem'); return; }
    setSaving(true);
    const result = await agentApi.resetUserPassword(userId, password, confirmPassword);
    setSaving(false);
    if (!result.success) { setError(result.error || 'Erro'); return; }
    onDone();
  };

  return (
    <form onSubmit={submit} className="mt-2 rounded-md border border-border bg-body/50 p-2">
      {error && <p className="mb-1 text-xs text-danger">{error}</p>}
      <div className="grid gap-2 md:grid-cols-2">
        <div>
          <input type="password" className="w-full rounded border border-border bg-body px-2 py-1 text-xs" placeholder="Nova senha" value={password} onChange={(e) => setPassword(e.target.value)} required />
          <PasswordStrengthIndicator password={password} onValidityChange={setIsPasswordValid} />
        </div>
        <input type="password" className="h-7 rounded border border-border bg-body px-2 py-1 text-xs" placeholder="Confirmar senha" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} required />
      </div>
      <button className="mt-2 rounded bg-(--color-brand-primary) px-2 py-1 text-xs text-white" disabled={saving}>{saving ? 'Salvando...' : 'Salvar senha'}</button>
    </form>
  );
}

function RequestsPanel() {
  const [requests, setRequests] = useState<AccessRequest[]>([]);
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<'all' | RequestStatus>('all');
  const [search, setSearch] = useState('');
  const [convertId, setConvertId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const [requestsResult, tenantsResult] = await Promise.all([
      agentApi.getAccessRequests({ status: status === 'all' ? undefined : status, q: search || undefined }),
      agentApi.getTenants(),
    ]);
    if (requestsResult.success && requestsResult.data) setRequests(requestsResult.data as AccessRequest[]);
    if (tenantsResult.success && tenantsResult.data) setTenants(tenantsResult.data as Tenant[]);
    setLoading(false);
  }, [search, status]);

  useEffect(() => { void load(); }, [load]);

  const updateStatus = async (request: AccessRequest, nextStatus: RequestStatus) => {
    const result = await agentApi.updateAccessRequest(request.id, { status: nextStatus });
    if (!result.success) alert(result.error || 'Erro');
    load();
  };

  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="mb-3 flex items-center justify-between gap-2 flex-wrap">
        <p className="text-sm font-semibold">Solicitacoes</p>
        <div className="flex gap-2">
          <input className="rounded-lg border border-border bg-body/60 px-3 py-2 text-sm" placeholder="Buscar..." value={search} onChange={(e) => setSearch(e.target.value)} />
          <select className="rounded-lg border border-border bg-body/60 px-3 py-2 text-sm" value={status} onChange={(e) => setStatus(e.target.value as 'all' | RequestStatus)}>
            <option value="all">Todos</option>
            <option value="pending">Pendente</option>
            <option value="reviewed">Revisado</option>
            <option value="approved">Aprovado</option>
            <option value="rejected">Rejeitado</option>
            <option value="converted">Convertido</option>
          </select>
        </div>
      </div>
      {loading ? <p className="text-sm text-muted">Carregando...</p> : requests.map((request) => (
        <div key={request.id} className="mb-2 rounded-lg border border-border p-3">
          <p className="text-sm font-semibold">{request.full_name} · {request.status}</p>
          <p className="text-xs text-muted">{request.email} · {request.phone} · {request.company_name}</p>
          <div className="mt-2 flex gap-2 flex-wrap">
            {request.status === 'pending' && <button className="rounded-md border border-border px-2 py-1 text-xs" onClick={() => updateStatus(request, 'reviewed')}>Revisado</button>}
            {(request.status === 'pending' || request.status === 'reviewed') && <button className="rounded-md border border-success/30 px-2 py-1 text-xs text-success" onClick={() => updateStatus(request, 'approved')}>Aprovar</button>}
            {request.status !== 'rejected' && request.status !== 'converted' && <button className="rounded-md border border-danger/30 px-2 py-1 text-xs text-danger" onClick={() => updateStatus(request, 'rejected')}>Rejeitar</button>}
            {request.status !== 'converted' && request.status !== 'rejected' && <button className="rounded-md bg-(--color-brand-primary) px-2 py-1 text-xs text-white" onClick={() => setConvertId(request.id)}>Converter em usuario</button>}
          </div>
          {convertId === request.id && <ConvertInline request={request} tenants={tenants} onDone={() => { setConvertId(null); load(); }} />}
        </div>
      ))}
    </div>
  );
}

function ConvertInline({ request, tenants, onDone }: { request: AccessRequest; tenants: Tenant[]; onDone: () => void }) {
  const [role, setRole] = useState<RoleType>('user');
  const [tenantId, setTenantId] = useState('');
  const [notes, setNotes] = useState(request.admin_notes || '');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setSaving(true);
    const result = await agentApi.convertAccessRequest(request.id, {
      role,
      tenant_id: tenantId || null,
      admin_notes: notes || undefined,
    });
    setSaving(false);
    if (!result.success) {
      console.error("[Admin] Conversion failed:", result);
      setError(result.error || 'Erro ao converter');
      return;
    }
    onDone();
  };

  return (
    <form onSubmit={submit} className="mt-2 rounded-md border border-border bg-body/50 p-2">
      {error && <p className="mb-1 text-xs text-danger">{error}</p>}
      <div className="grid gap-2 md:grid-cols-2">
        <select className="rounded border border-border bg-body px-2 py-1 text-xs" value={role} onChange={(e) => setRole(e.target.value as RoleType)}>
          <option value="user">Usuario</option>
          <option value="master">Master</option>
        </select>
        <select className="rounded border border-border bg-body px-2 py-1 text-xs" value={tenantId} onChange={(e) => setTenantId(e.target.value)}>
          <option value="">Sem empresa</option>
          {tenants.map((tenant) => <option key={tenant.id} value={tenant.id}>{tenant.name}</option>)}
        </select>
      </div>
      <textarea className="mt-2 w-full rounded border border-border bg-body px-2 py-1 text-xs" rows={2} placeholder="Notas (opcional)" value={notes} onChange={(e) => setNotes(e.target.value)} />
      <button className="mt-2 rounded bg-(--color-brand-primary) px-2 py-1 text-xs text-white" disabled={saving}>{saving ? 'Convertendo...' : 'Confirmar conversao'}</button>
    </form>
  );
}

function SecurityPanel() {
  const [blockedIps, setBlockedIps] = useState<Array<{ ip: string; ttl: number }>>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    const result = await agentApi.getBlockedIps();
    if (result.success && result.data) {
      setBlockedIps(result.data as Array<{ ip: string; ttl: number }>);
    } else {
      setError(result.error || 'Erro ao carregar IPs bloqueados');
    }
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  const unblock = async (ip: string) => {
    if (!confirm(`Deseja realmente desbloquear o IP ${ip}?`)) return;
    const result = await agentApi.unblockIp(ip);
    if (result.success) {
      load();
    } else {
      alert(result.error || 'Erro ao desbloquear IP');
    }
  };

  const formatTTL = (seconds: number) => {
    if (seconds <= 0) return 'Expirado';
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}m ${secs}s`;
  };

  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold">IPs Bloqueados (Rate Limit)</h3>
          <p className="text-xs text-muted">IPs bloqueados automaticamente por abuso de tentativas.</p>
        </div>
        <button
          onClick={() => load()}
          className="rounded-lg border border-border px-3 py-1 text-xs hover:bg-body"
        >
          Atualizar
        </button>
      </div>

      {error && <p className="mb-4 text-xs text-danger">{error}</p>}

      {loading ? (
        <p className="text-sm text-muted">Carregando...</p>
      ) : blockedIps.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border py-8 text-center text-muted">
          <p className="text-sm">Nenhum IP bloqueado no momento.</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-border text-xs text-muted uppercase tracking-wider">
                <th className="px-3 py-2 font-medium">IP Address</th>
                <th className="px-3 py-2 font-medium">Tempo Restante</th>
                <th className="px-3 py-2 font-medium text-right">Acoes</th>
              </tr>
            </thead>
            <tbody>
              {blockedIps.map((item) => (
                <tr key={item.ip} className="border-b border-border/50 hover:bg-body/30 transition-colors">
                  <td className="px-3 py-3 font-mono text-xs">{item.ip}</td>
                  <td className="px-3 py-3 text-xs">{formatTTL(item.ttl)}</td>
                  <td className="px-3 py-3 text-right">
                    <button
                      onClick={() => unblock(item.ip)}
                      className="rounded-md border border-danger/30 px-2 py-1 text-xs text-danger hover:bg-danger/10 transition-colors"
                    >
                      Desbloquear
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

