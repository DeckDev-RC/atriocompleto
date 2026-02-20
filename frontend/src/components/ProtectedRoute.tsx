import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { ShieldOff } from 'lucide-react';

interface ProtectedRouteProps {
    children: React.ReactNode;
    permission?: string;
    requireMaster?: boolean;
}

/**
 * Route wrapper that checks for authentication and optional permissions.
 * Shows an access denied page instead of redirecting to prevent loops.
 */
export const ProtectedRoute: React.FC<ProtectedRouteProps> = ({
    children,
    permission,
    requireMaster = false
}) => {
    const { isAuthenticated, isLoading, isMaster, hasPermission } = useAuth();
    const location = useLocation();

    if (isLoading) {
        return (
            <div className="flex min-h-screen items-center justify-center bg-body">
                <div className="flex flex-col items-center gap-3">
                    <div className="h-8 w-8 rounded-full border-2 border-t-transparent" style={{ animation: 'spin 0.8s linear infinite', borderColor: 'var(--color-brand-primary)', borderTopColor: 'transparent' }} />
                    <p className="text-[13px] text-muted">Carregando...</p>
                </div>
            </div>
        );
    }

    if (!isAuthenticated) {
        return <Navigate to="/" state={{ from: location }} replace />;
    }

    if (requireMaster && !isMaster) {
        return <Navigate to="/" replace />;
    }

    if (permission && !hasPermission(permission)) {
        return (
            <div className="flex min-h-[60vh] items-center justify-center">
                <div className="flex flex-col items-center gap-4 text-center max-w-sm px-6">
                    <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-danger/10">
                        <ShieldOff size={28} className="text-danger" />
                    </div>
                    <h2 className="text-lg font-semibold text-primary">Acesso Negado</h2>
                    <p className="text-[13px] text-muted leading-relaxed">
                        Você não tem permissão para acessar esta página.
                        Entre em contato com o administrador para solicitar acesso.
                    </p>
                    <p className="text-[11px] text-muted/50 font-mono">
                        Permissão necessária: {permission}
                    </p>
                </div>
            </div>
        );
    }

    return <>{children}</>;
};

