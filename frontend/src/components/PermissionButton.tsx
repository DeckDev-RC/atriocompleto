import React, { type ButtonHTMLAttributes } from 'react';
import { usePermission } from '../hooks/usePermission';

interface PermissionButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
    /** Permission name to check (e.g. 'criar_venda') */
    permission: string;
    /** Custom tooltip text when disabled due to lack of permission */
    tooltipText?: string;
}

/**
 * A button that automatically disables when the user lacks a specific permission.
 * Shows a tooltip explaining why the button is disabled.
 *
 * Usage:
 *   <PermissionButton permission="criar_venda" onClick={handleCreate}>
 *     Nova Venda
 *   </PermissionButton>
 */
export const PermissionButton: React.FC<PermissionButtonProps> = ({
    permission,
    tooltipText,
    children,
    className = '',
    disabled,
    style,
    ...props
}) => {
    const allowed = usePermission(permission);
    const isDisabled = !allowed || disabled;

    return (
        <button
            {...props}
            disabled={isDisabled}
            title={!allowed ? (tooltipText || `Sem permissão para: ${permission.replace('_', ' ')}`) : props.title}
            className={`${className} ${!allowed ? 'permission-denied' : ''}`}
            style={{
                ...style,
                ...((!allowed) ? { opacity: 0.5, cursor: 'not-allowed', pointerEvents: 'auto' } : {}),
            }}
        >
            {children}
        </button>
    );
};
