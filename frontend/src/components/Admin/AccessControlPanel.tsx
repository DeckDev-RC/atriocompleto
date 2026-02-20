import { Fragment, useCallback, useEffect, useState, type FormEvent } from 'react';
import { agentApi } from '../../services/agentApi';
import { ToggleLeft, ToggleRight, Shield, UserCog, Check, X, ShoppingCart, User, Settings, Bot, FileText, Lock, Plus, Copy, Pencil, Trash2, CheckCircle, AlertTriangle, XCircle } from 'lucide-react';

// Icon map for dynamic lookup from DB icon names
const ICON_MAP: Record<string, any> = {
    ShoppingCart, User, Settings, Bot, FileText, Lock,
};

interface Role {
    id: string;
    name: string;
    description: string | null;
    is_system?: boolean;
    role_permissions: Array<{ permission_id: string }>;
}

interface Permission {
    id: string;
    name: string;
    description: string | null;
    label: string | null;
    category: string | null;
    icon: string | null;
}

interface UserRoleInfo {
    id: string;
    email: string;
    full_name: string;
    user_roles: Array<{ role_id: string; roles: { name: string } }>;
}

interface Toast {
    id: number;
    type: 'success' | 'error' | 'warning';
    message: string;
}

let toastIdCounter = 0;

export function AccessControlPanel() {
    const [subTab, setSubTab] = useState<'matrix' | 'users'>('matrix');
    const [roles, setRoles] = useState<Role[]>([]);
    const [permissions, setPermissions] = useState<Permission[]>([]);
    const [users, setUsers] = useState<UserRoleInfo[]>([]);
    const [loading, setLoading] = useState(true);
    const [toggling, setToggling] = useState<string | null>(null);
    const [toasts, setToasts] = useState<Toast[]>([]);

    // Modal state
    const [modalOpen, setModalOpen] = useState(false);
    const [modalMode, setModalMode] = useState<'create' | 'edit' | 'clone'>('create');
    const [modalRoleId, setModalRoleId] = useState<string | null>(null);
    const [modalName, setModalName] = useState('');
    const [modalDescription, setModalDescription] = useState('');
    const [modalSaving, setModalSaving] = useState(false);
    const [modalError, setModalError] = useState('');

    // --- Toast system ---
    const showToast = useCallback((type: Toast['type'], message: string) => {
        const id = ++toastIdCounter;
        setToasts(prev => [...prev, { id, type, message }]);
        setTimeout(() => {
            setToasts(prev => prev.filter(t => t.id !== id));
        }, 4000);
    }, []);

    const loadData = useCallback(async () => {
        setLoading(true);
        const [rolesRes, permsRes, usersRes] = await Promise.all([
            agentApi.getRoles(),
            agentApi.getPermissions(),
            agentApi.getUserRoles()
        ]);

        if (rolesRes.success && rolesRes.data) setRoles(rolesRes.data as Role[]);
        if (permsRes.success && permsRes.data) setPermissions(permsRes.data as Permission[]);
        if (usersRes.success && usersRes.data) setUsers(usersRes.data as UserRoleInfo[]);

        setLoading(false);
    }, []);

    useEffect(() => {
        void loadData();
    }, [loadData]);

    const togglePermission = async (roleId: string, permissionId: string, isActive: boolean) => {
        const key = `${roleId}-${permissionId}`;
        setToggling(key);
        const result = await agentApi.toggleRolePermission(roleId, permissionId, !isActive);
        if (result.success) {
            await loadData();
        } else {
            showToast('error', result.error || 'Erro ao alterar permissão');
        }
        setToggling(null);
    };

    const handleAssignRole = async (userId: string, roleId: string, isAssigned: boolean) => {
        setLoading(true);
        const result = isAssigned
            ? await agentApi.removeUserRole(userId, roleId)
            : await agentApi.assignUserRole(userId, roleId);

        if (result.success) {
            // Small delay to allow DB propagation and cache invalidation to settle
            setTimeout(async () => {
                await loadData();
                showToast('success', isAssigned ? 'Papel removido com sucesso' : 'Papel atribuído com sucesso');
            }, 100);
        } else {
            showToast('error', result.error || 'Erro ao alterar papel');
        }
        setLoading(false);
    };

    // --- Modal handlers ---
    const openCreateModal = () => {
        setModalMode('create');
        setModalRoleId(null);
        setModalName('');
        setModalDescription('');
        setModalError('');
        setModalOpen(true);
    };

    const openEditModal = (role: Role) => {
        setModalMode('edit');
        setModalRoleId(role.id);
        setModalName(role.name);
        setModalDescription(role.description || '');
        setModalError('');
        setModalOpen(true);
    };

    const openCloneModal = (role: Role) => {
        setModalMode('clone');
        setModalRoleId(role.id);
        setModalName(`${role.name} (Cópia)`);
        setModalDescription(role.description || '');
        setModalError('');
        setModalOpen(true);
    };

    const handleDeleteRole = async (role: Role) => {
        if (role.is_system) {
            showToast('warning', 'Perfis de sistema não podem ser excluídos.');
            return;
        }
        if (!confirm(`Excluir o perfil "${role.name}"? Todos os usuários perderão este papel.`)) return;

        const result = await agentApi.deleteRole(role.id);
        if (result.success) {
            await loadData();
            showToast('success', `Perfil "${role.name}" excluído com sucesso.`);
        } else {
            showToast('error', result.error || 'Erro ao excluir perfil');
        }
    };

    const submitModal = async (e: FormEvent) => {
        e.preventDefault();
        setModalError('');
        setModalSaving(true);

        let result;
        if (modalMode === 'create') {
            result = await agentApi.createRole({ name: modalName.trim(), description: modalDescription.trim() || null });
        } else if (modalMode === 'clone' && modalRoleId) {
            result = await agentApi.cloneRole(modalRoleId, { name: modalName.trim(), description: modalDescription.trim() || null });
        } else if (modalMode === 'edit' && modalRoleId) {
            result = await agentApi.updateRole(modalRoleId, { name: modalName.trim(), description: modalDescription.trim() || null });
        }

        setModalSaving(false);

        if (result?.success) {
            setModalOpen(false);
            await loadData();
            const actionLabel = modalMode === 'create' ? 'criado' : modalMode === 'clone' ? 'clonado' : 'atualizado';
            showToast('success', `Perfil "${modalName.trim()}" ${actionLabel} com sucesso!`);
        } else {
            setModalError(result?.error || 'Erro ao salvar perfil');
        }
    };

    // Group permissions by category (dynamic from DB)
    const groupedPermissions = permissions.reduce((acc, perm) => {
        const category = perm.category || 'Outros';
        if (!acc[category]) acc[category] = [];
        acc[category].push(perm);
        return acc;
    }, {} as Record<string, Permission[]>);

    const getPermIcon = (perm: Permission) => {
        return ICON_MAP[perm.icon || ''] || Lock;
    };

    if (loading && roles.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center p-12 text-muted animate-pulse">
                <Shield size={48} className="mb-4 opacity-20" />
                <p>Carregando configurações de acesso...</p>
            </div>
        );
    }

    return (
        <div className="flex flex-col gap-6">
            {/* Toast Container */}
            {toasts.length > 0 && (
                <div className="fixed top-4 right-4 z-100 flex flex-col gap-2 max-w-sm">
                    {toasts.map(toast => (
                        <div
                            key={toast.id}
                            className={`flex items-center gap-2.5 px-4 py-3 rounded-xl border shadow-lg backdrop-blur-md text-sm font-medium animate-in slide-in-from-right duration-300 ${toast.type === 'success' ? 'bg-success/10 border-success/30 text-success' :
                                toast.type === 'error' ? 'bg-danger/10 border-danger/30 text-danger' :
                                    'bg-warning/10 border-warning/30 text-warning'
                                }`}
                        >
                            {toast.type === 'success' && <CheckCircle size={16} />}
                            {toast.type === 'error' && <XCircle size={16} />}
                            {toast.type === 'warning' && <AlertTriangle size={16} />}
                            <span className="flex-1">{toast.message}</span>
                            <button
                                onClick={() => setToasts(prev => prev.filter(t => t.id !== toast.id))}
                                className="opacity-50 hover:opacity-100 transition-opacity"
                            >
                                <X size={14} />
                            </button>
                        </div>
                    ))}
                </div>
            )}

            <div className="flex items-center justify-between flex-wrap gap-3">
                <div className="flex bg-card/60 backdrop-blur-sm border border-border rounded-xl p-1 gap-1 shadow-sm">
                    <button
                        onClick={() => setSubTab('matrix')}
                        className={`px-4 py-2 rounded-lg text-sm flex items-center gap-2 transition-all duration-200 ${subTab === 'matrix' ? 'bg-body text-brand-primary shadow-sm font-semibold' : 'text-muted hover:text-body-content'}`}
                    >
                        <Shield size={16} />
                        Matriz de Permissões
                    </button>
                    <button
                        onClick={() => setSubTab('users')}
                        className={`px-4 py-2 rounded-lg text-sm flex items-center gap-2 transition-all duration-200 ${subTab === 'users' ? 'bg-body text-brand-primary shadow-sm font-semibold' : 'text-muted hover:text-body-content'}`}
                    >
                        <UserCog size={16} />
                        Papéis por Usuário
                    </button>
                </div>
                <div className="flex items-center gap-2">
                    <button
                        onClick={openCreateModal}
                        className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-(--color-brand-primary) text-white text-sm font-medium shadow-sm hover:opacity-90 transition-opacity"
                    >
                        <Plus size={16} />
                        Novo Perfil
                    </button>
                    <div className="text-xs text-muted flex items-center gap-2 bg-card/40 px-3 py-1.5 rounded-full border border-border/50">
                        <span className="w-2 h-2 rounded-full bg-success"></span>
                        Sincronizado com Supabase
                    </div>
                </div>
            </div>

            {subTab === 'matrix' ? (
                <div className="bg-card/40 border border-border/60 rounded-2xl overflow-hidden shadow-sm backdrop-blur-[2px]">
                    <div className="overflow-x-auto overflow-y-auto max-h-[70vh] scrollbar-thin">
                        <table className="w-full text-left border-collapse">
                            <thead className="sticky top-0 z-10 bg-body/95 backdrop-blur-md">
                                <tr className="border-b border-border">
                                    <th className="p-4 text-xs font-semibold uppercase tracking-wider text-muted min-w-[240px]">Funcionalidade</th>
                                    {roles.map(role => (
                                        <th key={role.id} className="p-4 text-xs font-bold uppercase tracking-wider text-center min-w-[140px]">
                                            <div className="flex flex-col items-center gap-1">
                                                <div className="flex items-center gap-1.5">
                                                    {role.is_system && (
                                                        <span title="Perfil de sistema">
                                                            <Lock size={10} className="text-muted/60" />
                                                        </span>
                                                    )}
                                                    <span className="text-brand-primary">{role.name}</span>
                                                </div>
                                                <span className="text-[10px] font-normal text-muted lowercase">{role.description || 'Sem descrição'}</span>
                                                <div className="flex items-center gap-1 mt-1">
                                                    {!role.is_system && (
                                                        <button
                                                            onClick={() => openEditModal(role)}
                                                            className="text-muted/50 hover:text-brand-primary transition-colors"
                                                            title="Editar perfil"
                                                        >
                                                            <Pencil size={11} />
                                                        </button>
                                                    )}
                                                    <button
                                                        onClick={() => openCloneModal(role)}
                                                        className="text-muted/50 hover:text-brand-primary transition-colors"
                                                        title="Clonar perfil"
                                                    >
                                                        <Copy size={11} />
                                                    </button>
                                                    {!role.is_system && (
                                                        <button
                                                            onClick={() => handleDeleteRole(role)}
                                                            className="text-muted/50 hover:text-danger transition-colors"
                                                            title="Excluir perfil"
                                                        >
                                                            <Trash2 size={11} />
                                                        </button>
                                                    )}
                                                </div>
                                            </div>
                                        </th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-border/30">
                                {Object.entries(groupedPermissions).map(([category, perms]) => (
                                    <Fragment key={category}>
                                        <tr className="bg-body/40">
                                            <td colSpan={roles.length + 1} className="px-4 py-2 text-[10px] font-bold uppercase tracking-widest text-brand-primary/70">
                                                {category}
                                            </td>
                                        </tr>
                                        {perms.map(perm => {
                                            const PermIcon = getPermIcon(perm);
                                            return (
                                                <tr key={perm.id} className="hover:bg-body/20 transition-colors group">
                                                    <td className="p-4 flex items-center gap-3">
                                                        <div className="w-8 h-8 rounded-lg bg-body flex items-center justify-center text-muted group-hover:text-brand-primary transition-colors border border-border/40">
                                                            <PermIcon size={16} />
                                                        </div>
                                                        <div>
                                                            <p className="text-sm font-medium">{perm.label || perm.name}</p>
                                                            <p className="text-[11px] text-muted leading-tight mt-0.5">{perm.description || 'Sem descrição detalhada'}</p>
                                                        </div>
                                                    </td>
                                                    {roles.map(role => {
                                                        const isActive = role.role_permissions.some(rp => rp.permission_id === perm.id);
                                                        const isToggling = toggling === `${role.id}-${perm.id}`;

                                                        return (
                                                            <td key={role.id} className="p-4 text-center">
                                                                <button
                                                                    onClick={() => togglePermission(role.id, perm.id, isActive)}
                                                                    disabled={isToggling}
                                                                    className={`relative inline-flex items-center justify-center transition-all ${isToggling ? 'opacity-50 cursor-not-allowed' : 'hover:scale-105 active:scale-95'}`}
                                                                >
                                                                    {isActive ? (
                                                                        <div className="text-brand-primary">
                                                                            <ToggleRight size={36} />
                                                                        </div>
                                                                    ) : (
                                                                        <div className="text-muted/30 hover:text-muted/50">
                                                                            <ToggleLeft size={36} />
                                                                        </div>
                                                                    )}
                                                                    {isToggling && (
                                                                        <div className="absolute inset-0 flex items-center justify-center">
                                                                            <div className="w-4 h-4 border-2 border-brand-primary border-t-transparent rounded-full animate-spin"></div>
                                                                        </div>
                                                                    )}
                                                                </button>
                                                            </td>
                                                        );
                                                    })}
                                                </tr>
                                            );
                                        })}
                                    </Fragment>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            ) : (
                <div className="grid gap-4">
                    <div className="bg-card/40 border border-border/60 rounded-2xl overflow-hidden shadow-sm backdrop-blur-[2px]">
                        <table className="w-full text-left">
                            <thead>
                                <tr className="bg-body/60 border-b border-border">
                                    <th className="p-4 text-xs font-semibold uppercase tracking-wider text-muted">Usuário</th>
                                    <th className="p-4 text-xs font-semibold uppercase tracking-wider text-muted text-center">Papéis Atribuídos</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-border/30">
                                {users.map(user => (
                                    <tr key={user.id} className="hover:bg-body/20 transition-colors group">
                                        <td className="p-4">
                                            <div className="flex items-center gap-3">
                                                <div className="w-9 h-9 rounded-full bg-brand-primary/10 flex items-center justify-center text-brand-primary font-bold text-xs border border-brand-primary/20">
                                                    {user.full_name.charAt(0).toUpperCase()}
                                                </div>
                                                <div>
                                                    <p className="text-sm font-semibold">{user.full_name}</p>
                                                    <p className="text-xs text-muted font-mono">{user.email}</p>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="p-4">
                                            <div className="flex flex-wrap justify-center gap-2">
                                                {roles.map(role => {
                                                    const isAssigned = user.user_roles.some(ur => ur.role_id === role.id);
                                                    return (
                                                        <button
                                                            key={role.id}
                                                            onClick={() => handleAssignRole(user.id, role.id, isAssigned)}
                                                            className={`px-3 py-1.5 rounded-full text-[11px] font-semibold border transition-all flex items-center gap-1.5 ${isAssigned
                                                                ? 'bg-brand-primary text-white border-brand-primary shadow-sm'
                                                                : 'bg-body/50 border-border text-muted hover:border-muted'
                                                                }`}
                                                        >
                                                            {isAssigned ? (
                                                                <div className="bg-white/20 rounded-full p-0.5"><Check size={8} /></div>
                                                            ) : (
                                                                <div className="bg-muted/20 rounded-full p-0.5"><X size={8} /></div>
                                                            )}
                                                            {role.name}
                                                        </button>
                                                    );
                                                })}
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* Role Modal (Create / Edit / Clone) */}
            {modalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={() => setModalOpen(false)}>
                    <div className="bg-card border border-border rounded-2xl p-6 w-full max-w-md shadow-2xl animate-in fade-in zoom-in-95 duration-200" onClick={e => e.stopPropagation()}>
                        <h3 className="text-lg font-bold mb-1">
                            {modalMode === 'create' && 'Criar Novo Perfil'}
                            {modalMode === 'edit' && 'Editar Perfil'}
                            {modalMode === 'clone' && 'Clonar Perfil'}
                        </h3>
                        <p className="text-xs text-muted mb-4">
                            {modalMode === 'create' && 'Crie um novo perfil de acesso e atribua permissões depois.'}
                            {modalMode === 'edit' && 'Edite o nome e a descrição do perfil.'}
                            {modalMode === 'clone' && 'Crie uma cópia deste perfil com todas as suas permissões.'}
                        </p>

                        {modalError && (
                            <div className="mb-4 rounded-lg border border-danger/30 bg-danger/5 px-3 py-2 text-xs text-danger flex items-center gap-2">
                                <XCircle size={14} className="shrink-0" />
                                {modalError}
                            </div>
                        )}

                        <form onSubmit={submitModal} className="grid gap-3">
                            <div>
                                <label className="text-xs font-medium text-muted mb-1 block">Nome do Perfil</label>
                                <input
                                    className="w-full rounded-lg border border-border bg-body/60 px-3 py-2 text-sm focus:border-brand-primary focus:outline-none transition-colors"
                                    value={modalName}
                                    onChange={e => setModalName(e.target.value)}
                                    placeholder="Ex: Supervisor, Auditor..."
                                    required
                                    minLength={2}
                                    maxLength={50}
                                    autoFocus
                                />
                            </div>
                            <div>
                                <label className="text-xs font-medium text-muted mb-1 block">Descrição (opcional)</label>
                                <input
                                    className="w-full rounded-lg border border-border bg-body/60 px-3 py-2 text-sm focus:border-brand-primary focus:outline-none transition-colors"
                                    value={modalDescription}
                                    onChange={e => setModalDescription(e.target.value)}
                                    placeholder="Breve descrição do perfil..."
                                    maxLength={200}
                                />
                            </div>
                            <div className="flex gap-2 mt-2">
                                <button
                                    type="submit"
                                    disabled={modalSaving}
                                    className="flex-1 rounded-lg bg-(--color-brand-primary) px-4 py-2.5 text-sm text-white font-medium hover:opacity-90 disabled:opacity-50 transition-opacity"
                                >
                                    {modalSaving ? 'Salvando...' : modalMode === 'create' ? 'Criar Perfil' : modalMode === 'clone' ? 'Clonar Perfil' : 'Salvar'}
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setModalOpen(false)}
                                    className="rounded-lg border border-border px-4 py-2.5 text-sm hover:bg-body/50 transition-colors"
                                >
                                    Cancelar
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
