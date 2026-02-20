import { useAuth } from '../contexts/AuthContext';

/**
 * Hook to check if the current user has a specific permission.
 * Returns true if the user has the permission, or if user is master.
 *
 * Usage:
 *   const canCreateSale = usePermission('criar_venda');
 */
export function usePermission(permission: string): boolean {
    const { hasPermission } = useAuth();
    return hasPermission(permission);
}
