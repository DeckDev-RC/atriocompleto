import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Header } from '../components/Header';
import { agentApi } from '../services/agentApi';
import { useAuth } from '../contexts/AuthContext';
import { PasswordStrengthIndicator } from '../components/PasswordStrengthIndicator';
import { AuditLogPanel } from '../components/Admin/AuditLogPanel';
import { AccessControlPanel } from '../components/Admin/AccessControlPanel';
import {
  FEATURE_REGISTRY,
  getAllDisabledFeatureFlags,
  isFeatureEnabled,
  type FeatureKey,
} from '../constants/feature-flags';

type RoleType = 'master' | 'user';
type Tab = 'tenants' | 'users' | 'requests' | 'audit' | 'security' | 'access' | 'partners';
type RequestStatus = 'pending' | 'reviewed' | 'approved' | 'rejected' | 'converted';

interface Tenant {
  id: string;
  name: string;
  tenant_code: string;
  ai_rate_limit: number;
  created_at: string;
  user_count: number;
  enabled_features: Record<string, boolean>;
  partner_id?: string | null;
  partner_name?: string | null;
}

interface Partner {
  id: string;
  name: string;
  slug: string;
  host: string;
  admin_profile_id: string | null;
  admin_profile?: { id: string; full_name: string; email: string } | null;
  tenant_count: number;
  is_active: boolean;
  primary_color: string | null;
  login_logo_url: string | null;
  sidebar_logo_light_url: string | null;
  sidebar_logo_dark_url: string | null;
  icon_logo_url: string | null;
  footer_logo_url: string | null;
  favicon_url: string | null;
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
  manageable_features: Record<string, boolean>;
  manageable_tenant_ids: string[];
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

function createEmptyManageableFeatures(): Record<FeatureKey, boolean> {
  return getAllDisabledFeatureFlags();
}

function countEnabledFlags(flags?: Record<string, boolean> | null) {
  return Object.values(flags || {}).filter(Boolean).length;
}

function countSelectedTenants(tenantIds?: string[] | null) {
  return (tenantIds || []).length;
}

export function AdminPage() {
  const { isMaster, hasPermission } = useAuth();
  const canManageFeatureFlags = isMaster || hasPermission('gerenciar_feature_flags');
  const availableTabs: Array<{ id: Tab; label: string }> = isMaster
    ? [
      { id: 'tenants', label: 'Empresas' },
      { id: 'partners', label: 'Parceiros' },
      { id: 'users', label: 'Usuarios' },
      { id: 'access', label: 'Controle de Acessos' },
      { id: 'requests', label: 'Solicitacoes' },
      { id: 'audit', label: 'Auditoria' },
      { id: 'security', label: 'Seguranca' },
    ]
    : canManageFeatureFlags
      ? [{ id: 'tenants', label: 'Feature Flags' }]
      : [];
  const [tab, setTab] = useState<Tab>(availableTabs[0]?.id || 'tenants');

  useEffect(() => {
    if (!availableTabs.some((item) => item.id === tab) && availableTabs[0]) {
      setTab(availableTabs[0].id);
    }
  }, [availableTabs, tab]);

  return (
    <div className="p-6 max-md:p-4">
      <Header
        title="Administracao"
        subtitle={isMaster ? 'Gerenciar empresas, usuarios e acessos' : 'Operar feature flags delegadas pelo master'}
      />

      <div className="mt-6 mb-6 flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
        {availableTabs.map((item) => (
          <button
            key={item.id}
            className={`whitespace-nowrap rounded-lg px-3 py-2 max-md:py-3 text-sm transition-colors ${tab === item.id ? 'bg-card border border-border shadow-sm text-brand-primary font-medium' : 'text-muted hover:text-body-content'}`}
            onClick={() => setTab(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>

      <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">
        {tab === 'tenants' && <TenantsPanel />}
        {isMaster && tab === 'partners' && <PartnersPanel />}
        {isMaster && tab === 'users' && <UsersPanel />}
        {isMaster && tab === 'access' && <AccessControlPanel />}
        {isMaster && tab === 'requests' && <RequestsPanel />}
        {isMaster && tab === 'audit' && <AuditLogPanel />}
        {isMaster && tab === 'security' && <SecurityPanel />}
      </div>
    </div>
  );
}

function TenantsPanel() {
  const { isMaster, user, hasPermission } = useAuth();
  const canManageFeatureFlags = isMaster || hasPermission('gerenciar_feature_flags');
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState('');
  const [aiLimit, setAiLimit] = useState(20);
  const [partnerId, setPartnerId] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [featuresOpenId, setFeaturesOpenId] = useState<string | null>(null);
  const [savingFeatures, setSavingFeatures] = useState(false);
  const [tenantSearch, setTenantSearch] = useState('');
  const [partners, setPartners] = useState<Partner[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    const [tenantResult, partnerResult] = await Promise.all([
      agentApi.getTenants(),
      isMaster ? agentApi.getPartners() : Promise.resolve({ success: true, data: [] as Partner[] }),
    ]);

    if (tenantResult.success && tenantResult.data) {
      const nextTenants = tenantResult.data as Tenant[];
      setTenants(nextTenants);
      if (!isMaster && nextTenants.length > 0) {
        setFeaturesOpenId((current) => (
          current && nextTenants.some((tenant) => tenant.id === current)
            ? current
            : nextTenants[0].id
        ));
      }
    }

    if (partnerResult.success && partnerResult.data) {
      setPartners(partnerResult.data as Partner[]);
    }
    setLoading(false);
  }, [isMaster]);

  useEffect(() => {
    void load();
  }, [load]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!isMaster || !name.trim()) return;

    if (editingId) {
      await agentApi.updateTenant(editingId, name.trim(), aiLimit, partnerId || null);
    } else {
      await agentApi.createTenant(name.trim(), aiLimit, partnerId || null);
    }

    setName('');
    setAiLimit(20);
    setPartnerId('');
    setEditingId(null);
    void load();
  };

  const remove = async (tenant: Tenant) => {
    if (!isMaster) return;
    if (!confirm(`Excluir empresa "${tenant.name}"?`)) return;
    const result = await agentApi.deleteTenant(tenant.id);
    if (!result.success) alert(result.error || 'Erro');
    void load();
  };

  const toggleFeature = async (tenantId: string, featureKey: FeatureKey, currentValue: boolean) => {
    if (!canManageFeatureFlags) return;

    setSavingFeatures(true);
    const result = await agentApi.updateTenantFeatures(tenantId, { [featureKey]: !currentValue });
    setSavingFeatures(false);

    if (result.success) {
      setTenants((prev) => prev.map((tenant) => (
        tenant.id === tenantId
          ? {
            ...tenant,
            enabled_features: {
              ...tenant.enabled_features,
              [featureKey]: !currentValue,
            },
          }
          : tenant
      )));
    } else {
      alert(result.error || 'Erro ao atualizar features');
    }
  };

  const visibleFeatureEntries = (Object.entries(FEATURE_REGISTRY) as [FeatureKey, { label: string }][]).filter(
    ([key]) => isMaster || user?.manageable_features?.[key] === true,
  );
  const visibleFeatureKeys = visibleFeatureEntries.map(([key]) => key);

  const getDelegatedEnabledCount = (tenant: Tenant) => visibleFeatureKeys.filter(
    (key) => isFeatureEnabled(key, tenant.enabled_features),
  ).length;

  const filteredTenants = (isMaster ? tenants : [...tenants]
    .filter((tenant) => {
      const query = tenantSearch.trim().toLowerCase();
      if (!query) return true;
      return tenant.name.toLowerCase().includes(query)
        || tenant.tenant_code.toLowerCase().includes(query);
    })
    .sort((left, right) => {
      const enabledDiff = getDelegatedEnabledCount(right) - getDelegatedEnabledCount(left);
      if (enabledDiff !== 0) return enabledDiff;
      return left.name.localeCompare(right.name);
    }));

  const delegatedActiveTenants = filteredTenants.filter((tenant) => getDelegatedEnabledCount(tenant) > 0).length;

  return (
    <div className="grid gap-4">
      {isMaster ? (
        <form onSubmit={submit} className="rounded-xl border border-border bg-card p-4">
          <p className="mb-2 text-sm font-semibold">{editingId ? 'Editar empresa' : 'Nova empresa'}</p>
          <div className="flex gap-2 items-end flex-wrap md:flex-nowrap">
            <div className="flex-1 min-w-0 sm:min-w-[200px]">
              <label className="text-xs text-muted mb-1 block">Nome da Empresa</label>
              <input className="w-full rounded-lg border border-border bg-body/60 px-3 py-2 text-sm" value={name} onChange={(e) => setName(e.target.value)} placeholder="Agencia..." required />
            </div>
            <div className="w-48">
              <label className="text-xs text-muted mb-1 block">Parceiro</label>
              <select
                className="w-full rounded-lg border border-border bg-body/60 px-3 py-2 text-sm"
                value={partnerId}
                onChange={(e) => setPartnerId(e.target.value)}
              >
                <option value="">Sem parceiro</option>
                {partners.map((partner) => (
                  <option key={partner.id} value={partner.id}>
                    {partner.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="w-32">
              <label className="text-xs text-muted mb-1 block">Limite IA (hora)</label>
              <input type="number" className="w-full rounded-lg border border-border bg-body/60 px-3 py-2 text-sm" value={aiLimit} onChange={(e) => setAiLimit(parseInt(e.target.value, 10))} required />
            </div>
            <button className="rounded-lg bg-(--color-brand-primary) px-4 py-2 text-sm text-white h-[38px]">{editingId ? 'Salvar' : 'Criar'}</button>
            {editingId && (
              <button
                type="button"
                className="rounded-lg border border-border px-4 py-2 text-sm h-[38px]"
                onClick={() => {
                  setEditingId(null);
                  setName('');
                  setAiLimit(20);
                  setPartnerId('');
                }}
              >
                Cancelar
              </button>
            )}
          </div>
        </form>
      ) : (
        <div className="rounded-xl border border-border bg-card p-3">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-sm font-semibold">Feature flags delegadas</p>
              <p className="mt-1 text-[12px] text-muted">
                Voce pode operar apenas as flags liberadas pelo master.
              </p>
            </div>
            <div className="flex flex-1 flex-col gap-3 sm:flex-row sm:items-center sm:justify-end">
              <div className="grid grid-cols-2 gap-2 sm:flex">
                <div className="rounded-lg border border-border bg-body/40 px-3 py-2">
                  <p className="text-[10px] uppercase tracking-wide text-muted">Tenants</p>
                  <p className="text-sm font-semibold text-primary">{filteredTenants.length}</p>
                </div>
                <div className="rounded-lg border border-border bg-body/40 px-3 py-2">
                  <p className="text-[10px] uppercase tracking-wide text-muted">Com flags ativas</p>
                  <p className="text-sm font-semibold text-primary">{delegatedActiveTenants}</p>
                </div>
                <div className="rounded-lg border border-border bg-body/40 px-3 py-2">
                  <p className="text-[10px] uppercase tracking-wide text-muted">Flags liberadas</p>
                  <p className="text-sm font-semibold text-primary">{visibleFeatureEntries.length}</p>
                </div>
              </div>
              <input
                className="w-full rounded-lg border border-border bg-body/50 px-3 py-2 text-sm sm:w-56"
                placeholder="Buscar tenant..."
                value={tenantSearch}
                onChange={(event) => setTenantSearch(event.target.value)}
              />
            </div>
          </div>
        </div>
      )}

      {loading ? <p className="text-sm text-muted">Carregando...</p> : filteredTenants.map((tenant) => {
        const isOpen = featuresOpenId === tenant.id;
        const enabledCount = getDelegatedEnabledCount(tenant);
        const orderedFeatureEntries = [...visibleFeatureEntries].sort((left, right) => {
          const leftEnabled = isFeatureEnabled(left[0], tenant.enabled_features) ? 1 : 0;
          const rightEnabled = isFeatureEnabled(right[0], tenant.enabled_features) ? 1 : 0;
          if (leftEnabled !== rightEnabled) {
            return rightEnabled - leftEnabled;
          }
          return left[1].label.localeCompare(right[1].label);
        });

        return (
          <div key={tenant.id} className={`rounded-xl border border-border bg-card ${isMaster ? 'p-4' : 'p-3'}`}>
            <div className="flex items-center justify-between gap-2">
              <div>
                <p className="text-sm font-semibold">{tenant.name}</p>
                <div className="flex gap-3 flex-wrap">
                  <p className="text-xs text-muted font-mono">{tenant.tenant_code}</p>
                  <p className="text-xs text-muted">{tenant.user_count} usuario(s)</p>
                  {tenant.partner_name && (
                    <p className="rounded-full border border-border bg-body/40 px-2 py-0.5 text-[11px] text-muted">
                      {tenant.partner_name}
                    </p>
                  )}
                  {!isMaster && (
                    <p className="rounded-full border border-brand-primary/20 bg-brand-primary/5 px-2 py-0.5 text-[11px] font-medium text-brand-primary">
                      {enabledCount}/{visibleFeatureEntries.length} ativas
                    </p>
                  )}
                  {isMaster && (
                    <p className="text-xs text-brand-primary font-medium">Limite IA: {tenant.ai_rate_limit}/h</p>
                  )}
                </div>
              </div>
              {isMaster ? (
                <div className="flex gap-2">
                  <button className="rounded-md border border-border px-3 py-2 text-xs" onClick={() => setFeaturesOpenId(featuresOpenId === tenant.id ? null : tenant.id)}>Features</button>
                  <button className="rounded-md border border-border px-3 py-2 text-xs" onClick={() => { setEditingId(tenant.id); setName(tenant.name); setAiLimit(tenant.ai_rate_limit); setPartnerId(tenant.partner_id || ''); }}>Editar</button>
                  <button className="rounded-md border border-danger/30 px-3 py-2 text-xs text-danger" onClick={() => remove(tenant)}>Excluir</button>
                </div>
              ) : (
                <button
                  type="button"
                  className="rounded-md border border-border px-3 py-1.5 text-[11px] text-muted transition-colors hover:text-primary"
                  onClick={() => setFeaturesOpenId(featuresOpenId === tenant.id ? null : tenant.id)}
                >
                  {isOpen ? 'Ocultar' : 'Gerenciar'}
                </button>
              )}
            </div>

            {isOpen && (
              <div className="mt-3 pt-3 border-t border-border">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <p className="text-xs font-semibold text-muted">Funcionalidades habilitadas</p>
                  {!isMaster && (
                    <p className="text-[11px] text-muted">
                      Toque para ativar ou desativar
                    </p>
                  )}
                </div>
                <div className={`grid gap-2 ${isMaster ? 'grid-cols-2 md:grid-cols-3 lg:grid-cols-4' : 'grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4'}`}>
                  {orderedFeatureEntries.map(([key, { label }]) => {
                    const enabled = isFeatureEnabled(key, tenant.enabled_features);
                    return (
                      <button
                        key={key}
                        disabled={savingFeatures}
                        onClick={() => toggleFeature(tenant.id, key, enabled)}
                        className={`flex items-center gap-2 rounded-lg border transition-colors ${isMaster ? 'px-3 py-2 text-xs' : 'px-2.5 py-1.5 text-[12px]'} ${enabled ? 'border-brand-primary/30 bg-brand-primary/5 text-brand-primary' : 'border-border bg-body/40 text-muted'} ${savingFeatures ? 'opacity-50 cursor-wait' : 'cursor-pointer hover:opacity-80'}`}
                      >
                        <div className={`rounded-full transition-colors ${isMaster ? 'h-2.5 w-2.5' : 'h-2 w-2'} ${enabled ? 'bg-brand-primary' : 'bg-muted/30'}`} />
                        <span className="truncate">{label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function UsersPanel() {
  const { user: currentUser, refreshUser } = useAuth();
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
    manageable_features: createEmptyManageableFeatures(),
    manageable_tenant_ids: [] as string[],
  });
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    const [usersResult, tenantsResult] = await Promise.all([agentApi.getUsers(), agentApi.getTenants()]);

    if (usersResult.success && usersResult.data) {
      setUsers(usersResult.data as UserProfile[]);
    } else if (usersResult.error?.includes('negado') || usersResult.error?.includes('encontrado')) {
      setError('Erro de permissao ou sessao. Tente atualizar seu perfil.');
    } else {
      setError(usersResult.error || 'Erro ao carregar usuarios');
    }

    if (tenantsResult.success && tenantsResult.data) {
      setTenants(tenantsResult.data as Tenant[]);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const resetForm = () => {
    setEditingId(null);
    setForm({
      full_name: '',
      email: '',
      role: 'user',
      tenant_id: '',
      bypass_2fa: false,
      manageable_features: createEmptyManageableFeatures(),
      manageable_tenant_ids: [],
    });
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');

    const manageableFeatures = form.role === 'master'
      ? createEmptyManageableFeatures()
      : form.manageable_features;
    const manageableTenantIds = form.role === 'master'
      ? []
      : form.manageable_tenant_ids;

    if (editingId) {
      const result = await agentApi.updateUser(editingId, {
        full_name: form.full_name,
        role: form.role,
        tenant_id: form.tenant_id || null,
        bypass_2fa: form.bypass_2fa,
        manageable_features: manageableFeatures,
        manageable_tenant_ids: manageableTenantIds,
      });
      if (!result.success) setError(result.error || 'Erro ao salvar');
    } else {
      const result = await agentApi.createUser({
        full_name: form.full_name,
        email: form.email,
        role: form.role,
        tenant_id: form.tenant_id || null,
        bypass_2fa: form.bypass_2fa,
        manageable_features: manageableFeatures,
        manageable_tenant_ids: manageableTenantIds,
      });
      if (!result.success) setError(result.error || 'Erro ao criar');
    }

    resetForm();
    void load();
  };

  const filtered = users.filter((profile) => {
    const query = search.trim().toLowerCase();
    if (!query) return true;
    return profile.full_name.toLowerCase().includes(query)
      || profile.email.toLowerCase().includes(query)
      || profile.tenant_name.toLowerCase().includes(query);
  });

  const startEdit = (profile: UserProfile) => {
    setEditingId(profile.id);
    setForm({
      full_name: profile.full_name,
      email: profile.email,
      role: profile.role,
      tenant_id: profile.tenant_id || '',
      bypass_2fa: profile.bypass_2fa || false,
      manageable_features: {
        ...createEmptyManageableFeatures(),
        ...(profile.manageable_features || {}),
      },
      manageable_tenant_ids: [...(profile.manageable_tenant_ids || [])],
    });
  };

  const remove = async (profile: UserProfile) => {
    if (!confirm(`Excluir usuario "${profile.full_name}"?`)) return;
    const result = await agentApi.deleteUser(profile.id);
    if (!result.success) alert(result.error || 'Erro');
    void load();
  };

  return (
    <div className="grid gap-4">
      <form onSubmit={submit} className="rounded-xl border border-border bg-card p-4">
        <p className="mb-2 text-sm font-semibold">{editingId ? 'Editar usuario' : 'Novo usuario'}</p>
        {error && (
          <div className="mb-4 rounded-lg border border-danger/20 bg-danger/5 p-3">
            <p className="text-xs text-danger">{error}</p>
            {(error.includes('sessao') || error.includes('permissao')) && (
              <button
                type="button"
                onClick={() => { void refreshUser(); void load(); }}
                className="mt-2 text-xs font-semibold text-brand-primary underline"
              >
                Atualizar minha sessao agora
              </button>
            )}
          </div>
        )}

        <div className="grid gap-2 md:grid-cols-2">
          <input className="rounded-lg border border-border bg-body/60 px-3 py-2 text-sm" placeholder="Nome" value={form.full_name} onChange={(e) => setForm((current) => ({ ...current, full_name: e.target.value }))} required />
          <input className="rounded-lg border border-border bg-body/60 px-3 py-2 text-sm" placeholder="Email" value={form.email} disabled={!!editingId} onChange={(e) => setForm((current) => ({ ...current, email: e.target.value }))} required />
          <select
            className="rounded-lg border border-border bg-body/60 px-3 py-2 text-sm disabled:opacity-50"
            value={form.role}
            onChange={(e) => setForm((current) => ({
              ...current,
              role: e.target.value as RoleType,
              manageable_features: e.target.value === 'master' ? createEmptyManageableFeatures() : current.manageable_features,
            }))}
            disabled={editingId === currentUser?.id}
          >
            <option value="user">Usuario</option>
            <option value="master">Master</option>
          </select>
          <select
            className="rounded-lg border border-border bg-body/60 px-3 py-2 text-sm disabled:opacity-50"
            value={form.tenant_id}
            onChange={(e) => setForm((current) => ({ ...current, tenant_id: e.target.value }))}
            disabled={editingId === currentUser?.id}
          >
            <option value="">Sem empresa</option>
            {tenants.map((tenant) => <option key={tenant.id} value={tenant.id}>{tenant.name} • {tenant.tenant_code}</option>)}
          </select>
        </div>

        <div className="mt-3 flex items-center gap-2 px-1">
          <input
            type="checkbox"
            id="bypass_2fa"
            checked={form.bypass_2fa}
            onChange={(e) => setForm((current) => ({ ...current, bypass_2fa: e.target.checked }))}
            className="rounded border-border accent-brand-primary h-4 w-4"
          />
          <label htmlFor="bypass_2fa" className="text-sm font-medium text-primary cursor-pointer select-none">
            Permitir login sem 2FA (para clientes beta/testes)
          </label>
        </div>

        {form.role !== 'master' && (
          <div className="mt-4 rounded-xl border border-border bg-body/30 p-4">
            <div className="mb-3">
              <p className="text-sm font-semibold">Delegacao de feature flags</p>
              <p className="text-xs text-muted">
                Estas sao as flags que o usuario podera ligar ou desligar no painel Admin sem virar master.
              </p>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
              {(Object.entries(FEATURE_REGISTRY) as [FeatureKey, { label: string }][]).map(([key, { label }]) => {
                const active = form.manageable_features[key] === true;
                return (
                  <button
                    key={key}
                    type="button"
                    className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-xs transition-colors ${active ? 'border-brand-primary/30 bg-brand-primary/5 text-brand-primary' : 'border-border bg-card text-muted'}`}
                    onClick={() => setForm((current) => ({
                      ...current,
                      manageable_features: {
                        ...current.manageable_features,
                        [key]: !active,
                      },
                    }))}
                  >
                    <div className={`h-2.5 w-2.5 rounded-full ${active ? 'bg-brand-primary' : 'bg-muted/30'}`} />
                    {label}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {form.role !== 'master' && (
          <div className="mt-4 rounded-xl border border-border bg-body/30 p-4">
            <div className="mb-3 flex items-center justify-between gap-2">
              <div>
                <p className="text-sm font-semibold">Clientes com acesso</p>
                <p className="text-xs text-muted">
                  Defina quais empresas esse admin delegado pode visualizar e controlar.
                </p>
              </div>
              <p className="rounded-full border border-brand-primary/20 bg-brand-primary/5 px-2 py-1 text-[11px] font-medium text-brand-primary">
                {form.manageable_tenant_ids.length} selecionado(s)
              </p>
            </div>
            <div className="grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-3">
              {tenants.map((tenant) => {
                const active = form.manageable_tenant_ids.includes(tenant.id);
                return (
                  <button
                    key={tenant.id}
                    type="button"
                    className={`flex items-center justify-between gap-3 rounded-lg border px-3 py-2 text-left text-xs transition-colors ${active ? 'border-brand-primary/30 bg-brand-primary/5 text-primary' : 'border-border bg-card text-muted'}`}
                    onClick={() => setForm((current) => ({
                      ...current,
                      manageable_tenant_ids: active
                        ? current.manageable_tenant_ids.filter((tenantId) => tenantId !== tenant.id)
                        : [...current.manageable_tenant_ids, tenant.id],
                    }))}
                  >
                    <div className="min-w-0">
                      <p className="truncate font-medium text-primary">{tenant.name}</p>
                      <p className="truncate text-[11px] text-muted">{tenant.tenant_code}</p>
                    </div>
                    <div className={`h-2.5 w-2.5 shrink-0 rounded-full ${active ? 'bg-brand-primary' : 'bg-muted/30'}`} />
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {editingId === currentUser?.id && (
          <p className="mt-2 text-xs text-brand-primary">
            Como administrador master, voce nao pode alterar sua propria empresa ou nivel de acesso por aqui para evitar bloqueio acidental.
          </p>
        )}

        <div className="mt-4 flex gap-2">
          <button className="rounded-lg bg-(--color-brand-primary) px-4 py-2 text-sm text-white">{editingId ? 'Salvar' : 'Criar'}</button>
          {editingId && (
            <button type="button" className="rounded-lg border border-border px-4 py-2 text-sm" onClick={resetForm}>
              Cancelar
            </button>
          )}
        </div>
      </form>

      <div className="rounded-xl border border-border bg-card p-4">
        <div className="mb-3 flex items-center justify-between gap-2">
          <p className="text-sm font-semibold">Usuarios</p>
          <input className="w-56 rounded-lg border border-border bg-body/60 px-3 py-2 text-sm" placeholder="Buscar..." value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>

        {loading ? <p className="text-sm text-muted">Carregando...</p> : filtered.map((profile) => {
          const delegatedFeatureEntries = (Object.entries(FEATURE_REGISTRY) as [FeatureKey, { label: string }][]).filter(
            ([key]) => profile.manageable_features?.[key] === true,
          );
          const delegatedTenants = tenants.filter((tenant) => profile.manageable_tenant_ids?.includes(tenant.id));

          return (
            <div key={profile.id} className="mb-2 rounded-lg border border-border p-3">
              <p className="text-sm font-semibold">{profile.full_name} ({profile.role})</p>
              <p className="text-xs text-muted">{profile.email} • {profile.tenant_name}</p>
              {profile.role !== 'master' && countEnabledFlags(profile.manageable_features) > 0 && (
                <div className="mt-2 flex flex-wrap gap-1">
                  {delegatedFeatureEntries.map(([key, { label }]) => (
                    <span key={key} className="rounded-full border border-brand-primary/20 bg-brand-primary/5 px-2 py-1 text-[11px] text-brand-primary">
                      {label}
                    </span>
                  ))}
                </div>
              )}
              {profile.role !== 'master' && countSelectedTenants(profile.manageable_tenant_ids) > 0 && (
                <div className="mt-2 flex flex-wrap gap-1">
                  {delegatedTenants.map((tenant) => (
                    <span key={tenant.id} className="rounded-full border border-border bg-body/40 px-2 py-1 text-[11px] text-muted">
                      {tenant.name}
                    </span>
                  ))}
                </div>
              )}
              <div className="mt-2 flex gap-2">
                <button className="rounded-md border border-border px-2 py-1 text-xs" onClick={() => startEdit(profile)}>Editar</button>
                <button className="rounded-md border border-border px-2 py-1 text-xs" onClick={() => setResetId(profile.id)}>Resetar senha</button>
                {profile.role !== 'master' && profile.id !== currentUser?.id && (
                  <button className="rounded-md border border-danger/30 px-2 py-1 text-xs text-danger" onClick={() => remove(profile)}>Excluir</button>
                )}
              </div>
              {resetId === profile.id && <ResetInline userId={profile.id} onDone={() => { setResetId(null); void load(); }} />}
            </div>
          );
        })}
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
    if (!isPasswordValid) {
      setError('Senha insuficiente');
      return;
    }
    if (password !== confirmPassword) {
      setError('As senhas nao coincidem');
      return;
    }
    setSaving(true);
    const result = await agentApi.resetUserPassword(userId, password, confirmPassword);
    setSaving(false);
    if (!result.success) {
      setError(result.error || 'Erro');
      return;
    }
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

  useEffect(() => {
    void load();
  }, [load]);

  const updateStatus = async (request: AccessRequest, nextStatus: RequestStatus) => {
    const result = await agentApi.updateAccessRequest(request.id, { status: nextStatus });
    if (!result.success) alert(result.error || 'Erro');
    void load();
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
          <p className="text-sm font-semibold">{request.full_name} • {request.status}</p>
          <p className="text-xs text-muted">{request.email} • {request.phone} • {request.company_name}</p>
          <div className="mt-2 flex gap-2 flex-wrap">
            {request.status === 'pending' && <button className="rounded-md border border-border px-2 py-1 text-xs" onClick={() => updateStatus(request, 'reviewed')}>Revisado</button>}
            {(request.status === 'pending' || request.status === 'reviewed') && <button className="rounded-md border border-success/30 px-2 py-1 text-xs text-success" onClick={() => updateStatus(request, 'approved')}>Aprovar</button>}
            {request.status !== 'rejected' && request.status !== 'converted' && <button className="rounded-md border border-danger/30 px-2 py-1 text-xs text-danger" onClick={() => updateStatus(request, 'rejected')}>Rejeitar</button>}
            {request.status !== 'converted' && request.status !== 'rejected' && <button className="rounded-md bg-(--color-brand-primary) px-2 py-1 text-xs text-white" onClick={() => setConvertId(request.id)}>Converter em usuario</button>}
          </div>
          {convertId === request.id && <ConvertInline request={request} tenants={tenants} onDone={() => { setConvertId(null); void load(); }} />}
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
      console.error('[Admin] Conversion failed:', result);
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
          {tenants.map((tenant) => <option key={tenant.id} value={tenant.id}>{tenant.name} • {tenant.tenant_code}</option>)}
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
  const [publicSignupEnabled, setPublicSignupEnabled] = useState(false);
  const [publicSignupError, setPublicSignupError] = useState('');
  const [publicSignupMessage, setPublicSignupMessage] = useState('');
  const [savingPublicSignup, setSavingPublicSignup] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    setPublicSignupError('');

    const [blockedIpsResult, publicSignupResult] = await Promise.all([
      agentApi.getBlockedIps(),
      agentApi.getPublicSignupSettings(),
    ]);

    if (blockedIpsResult.success && blockedIpsResult.data) {
      setBlockedIps(blockedIpsResult.data as Array<{ ip: string; ttl: number }>);
    } else {
      setError(blockedIpsResult.error || 'Erro ao carregar IPs bloqueados');
    }

    if (publicSignupResult.success && publicSignupResult.data) {
      setPublicSignupEnabled(!!publicSignupResult.data.enabled);
    } else {
      setPublicSignupError(publicSignupResult.error || 'Erro ao carregar configuracao do cadastro publico');
    }

    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const unblock = async (ip: string) => {
    if (!confirm(`Deseja realmente desbloquear o IP ${ip}?`)) return;
    const result = await agentApi.unblockIp(ip);
    if (result.success) {
      void load();
    } else {
      alert(result.error || 'Erro ao desbloquear IP');
    }
  };

  const savePublicSignup = async (e: FormEvent) => {
    e.preventDefault();
    setSavingPublicSignup(true);
    setPublicSignupError('');
    setPublicSignupMessage('');

    const result = await agentApi.updatePublicSignupSettings({
      enabled: publicSignupEnabled,
    });

    setSavingPublicSignup(false);

    if (!result.success) {
      setPublicSignupError(result.error || 'Erro ao salvar cadastro publico');
      return;
    }

    setPublicSignupMessage('Configuracao salva com sucesso.');
    await load();
  };

  const formatTTL = (seconds: number) => {
    if (seconds <= 0) return 'Expirado';
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}m ${secs}s`;
  };

  return (
    <div className="grid gap-4">
      <form onSubmit={savePublicSignup} className="rounded-xl border border-border bg-card p-4">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold">Cadastro publico</h3>
            <p className="text-xs text-muted">Exibe o botao "Criar conta" no login e libera cadastro aberto para novos usuarios.</p>
          </div>
          <button
            type="button"
            onClick={() => void load()}
            className="rounded-lg border border-border px-3 py-1 text-xs hover:bg-body"
          >
            Atualizar
          </button>
        </div>

        {publicSignupError && <p className="mb-4 text-xs text-danger">{publicSignupError}</p>}
        {publicSignupMessage && <p className="mb-4 text-xs text-success">{publicSignupMessage}</p>}

        <div className="grid gap-4">
          <label className="flex items-center gap-3 rounded-xl border border-border bg-body/40 px-4 py-3">
            <input
              type="checkbox"
              checked={publicSignupEnabled}
              onChange={(e) => setPublicSignupEnabled(e.target.checked)}
              className="h-4 w-4 accent-(--color-brand-primary)"
            />
            <div>
              <p className="text-sm font-medium text-primary">Ativar cadastro publico</p>
              <p className="text-xs text-muted">Quando ativo, o login passa a mostrar o fluxo de criacao de conta.</p>
            </div>
          </label>
        </div>

        <button
          type="submit"
          disabled={loading || savingPublicSignup}
          className="mt-4 rounded-lg bg-(--color-brand-primary) px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {savingPublicSignup ? 'Salvando...' : 'Salvar cadastro publico'}
        </button>
      </form>

      <div className="rounded-xl border border-border bg-card p-4">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold">IPs Bloqueados (Rate Limit)</h3>
            <p className="text-xs text-muted">IPs bloqueados automaticamente por abuso de tentativas.</p>
          </div>
          <button
            onClick={() => void load()}
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
    </div>
  );
}

function PartnersPanel() {
  const [partners, setPartners] = useState<Partner[]>([]);
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: '',
    slug: '',
    host: '',
    admin_profile_id: '',
    is_active: true,
    primary_color: '#09CAFF',
    login_logo_url: '',
    sidebar_logo_light_url: '',
    sidebar_logo_dark_url: '',
    icon_logo_url: '',
    footer_logo_url: '',
    favicon_url: '',
  });
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    const [partnersResult, usersResult] = await Promise.all([
      agentApi.getPartners(),
      agentApi.getUsers(),
    ]);

    if (partnersResult.success && partnersResult.data) {
      setPartners(partnersResult.data as Partner[]);
    } else {
      setError(partnersResult.error || 'Erro ao carregar parceiros');
    }

    if (usersResult.success && usersResult.data) {
      setUsers(usersResult.data as UserProfile[]);
    }

    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const resetForm = () => {
    setEditingId(null);
    setForm({
      name: '',
      slug: '',
      host: '',
      admin_profile_id: '',
      is_active: true,
      primary_color: '#09CAFF',
      login_logo_url: '',
      sidebar_logo_light_url: '',
      sidebar_logo_dark_url: '',
      icon_logo_url: '',
      footer_logo_url: '',
      favicon_url: '',
    });
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');

    const payload = {
      name: form.name.trim(),
      slug: form.slug.trim().toLowerCase(),
      host: form.host.trim(),
      admin_profile_id: form.admin_profile_id || null,
      is_active: form.is_active,
      primary_color: form.primary_color || null,
      login_logo_url: form.login_logo_url || null,
      sidebar_logo_light_url: form.sidebar_logo_light_url || null,
      sidebar_logo_dark_url: form.sidebar_logo_dark_url || null,
      icon_logo_url: form.icon_logo_url || null,
      footer_logo_url: form.footer_logo_url || null,
      favicon_url: form.favicon_url || null,
    };

    const result = editingId
      ? await agentApi.updatePartner(editingId, payload)
      : await agentApi.createPartner(payload);

    if (!result.success) {
      setError(result.error || 'Erro ao salvar parceiro');
      return;
    }

    resetForm();
    void load();
  };

  const startEdit = (partner: Partner) => {
    setEditingId(partner.id);
    setForm({
      name: partner.name,
      slug: partner.slug,
      host: partner.host,
      admin_profile_id: partner.admin_profile_id || '',
      is_active: partner.is_active,
      primary_color: partner.primary_color || '#09CAFF',
      login_logo_url: partner.login_logo_url || '',
      sidebar_logo_light_url: partner.sidebar_logo_light_url || '',
      sidebar_logo_dark_url: partner.sidebar_logo_dark_url || '',
      icon_logo_url: partner.icon_logo_url || '',
      footer_logo_url: partner.footer_logo_url || '',
      favicon_url: partner.favicon_url || '',
    });
  };

  return (
    <div className="grid gap-4">
      <form onSubmit={submit} className="rounded-xl border border-border bg-card p-4">
        <p className="mb-3 text-sm font-semibold">{editingId ? 'Editar parceiro' : 'Novo parceiro'}</p>
        {error && <p className="mb-3 text-xs text-danger">{error}</p>}

        <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
          <input className="rounded-lg border border-border bg-body/60 px-3 py-2 text-sm" placeholder="Nome" value={form.name} onChange={(e) => setForm((current) => ({ ...current, name: e.target.value }))} required />
          <input className="rounded-lg border border-border bg-body/60 px-3 py-2 text-sm" placeholder="Slug" value={form.slug} onChange={(e) => setForm((current) => ({ ...current, slug: e.target.value }))} required />
          <input className="rounded-lg border border-border bg-body/60 px-3 py-2 text-sm" placeholder="Host (ex: parceiros.agregarnegocios.com.br)" value={form.host} onChange={(e) => setForm((current) => ({ ...current, host: e.target.value }))} required />
          <select className="rounded-lg border border-border bg-body/60 px-3 py-2 text-sm" value={form.admin_profile_id} onChange={(e) => setForm((current) => ({ ...current, admin_profile_id: e.target.value }))}>
            <option value="">Sem admin responsavel</option>
            {users.filter((user) => user.role !== 'master').map((user) => (
              <option key={user.id} value={user.id}>{user.full_name} • {user.email}</option>
            ))}
          </select>
          <input type="color" className="h-10 rounded-lg border border-border bg-body/60 px-2 py-1" value={form.primary_color} onChange={(e) => setForm((current) => ({ ...current, primary_color: e.target.value }))} />
          <label className="flex items-center gap-2 rounded-lg border border-border bg-body/40 px-3 py-2 text-sm text-primary">
            <input type="checkbox" checked={form.is_active} onChange={(e) => setForm((current) => ({ ...current, is_active: e.target.checked }))} className="h-4 w-4 accent-brand-primary" />
            Parceiro ativo
          </label>
          <input className="rounded-lg border border-border bg-body/60 px-3 py-2 text-sm" placeholder="URL logo login" value={form.login_logo_url} onChange={(e) => setForm((current) => ({ ...current, login_logo_url: e.target.value }))} />
          <input className="rounded-lg border border-border bg-body/60 px-3 py-2 text-sm" placeholder="URL logo sidebar claro" value={form.sidebar_logo_light_url} onChange={(e) => setForm((current) => ({ ...current, sidebar_logo_light_url: e.target.value }))} />
          <input className="rounded-lg border border-border bg-body/60 px-3 py-2 text-sm" placeholder="URL logo sidebar escuro" value={form.sidebar_logo_dark_url} onChange={(e) => setForm((current) => ({ ...current, sidebar_logo_dark_url: e.target.value }))} />
          <input className="rounded-lg border border-border bg-body/60 px-3 py-2 text-sm" placeholder="URL icone/logo compacto" value={form.icon_logo_url} onChange={(e) => setForm((current) => ({ ...current, icon_logo_url: e.target.value }))} />
          <input className="rounded-lg border border-border bg-body/60 px-3 py-2 text-sm" placeholder="URL logo rodape" value={form.footer_logo_url} onChange={(e) => setForm((current) => ({ ...current, footer_logo_url: e.target.value }))} />
          <input className="rounded-lg border border-border bg-body/60 px-3 py-2 text-sm" placeholder="URL favicon" value={form.favicon_url} onChange={(e) => setForm((current) => ({ ...current, favicon_url: e.target.value }))} />
        </div>

        <div className="mt-4 flex gap-2">
          <button className="rounded-lg bg-(--color-brand-primary) px-4 py-2 text-sm text-white">{editingId ? 'Salvar parceiro' : 'Criar parceiro'}</button>
          {editingId && <button type="button" className="rounded-lg border border-border px-4 py-2 text-sm" onClick={resetForm}>Cancelar</button>}
        </div>
      </form>

      <div className="rounded-xl border border-border bg-card p-4">
        <div className="mb-3 flex items-center justify-between">
          <p className="text-sm font-semibold">Parceiros</p>
          <button type="button" className="rounded-lg border border-border px-3 py-1 text-xs" onClick={() => void load()}>Atualizar</button>
        </div>
        {loading ? <p className="text-sm text-muted">Carregando...</p> : partners.map((partner) => (
          <div key={partner.id} className="mb-2 rounded-lg border border-border p-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold">{partner.name}</p>
                <p className="text-xs text-muted">{partner.host} • {partner.slug}</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <span className="rounded-full border border-border bg-body/40 px-2 py-1 text-[11px] text-muted">
                    {partner.tenant_count} tenant(s)
                  </span>
                  {partner.admin_profile && (
                    <span className="rounded-full border border-brand-primary/20 bg-brand-primary/5 px-2 py-1 text-[11px] text-brand-primary">
                      Admin: {partner.admin_profile.full_name}
                    </span>
                  )}
                </div>
              </div>
              <button className="rounded-md border border-border px-3 py-1.5 text-xs" onClick={() => startEdit(partner)}>Editar</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
