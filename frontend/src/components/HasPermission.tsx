import React from 'react';
import { useAuth } from '../contexts/AuthContext';

interface HasPermissionProps {
    name: string;
    children: React.ReactNode;
    fallback?: React.ReactNode;
}

/**
 * Component to conditionally render content based on user permissions.
 * Usage:
 * <HasPermission name="venda:deletar">
 *   <button>Deletar</button>
 * </HasPermission>
 */
export const HasPermission: React.FC<HasPermissionProps> = ({ name, children, fallback = null }) => {
    const { hasPermission } = useAuth();

    if (hasPermission(name)) {
        return <>{children}</>;
    }

    return <>{fallback}</>;
};
