export interface ResolvedBranding {
    is_whitelabel: boolean;
    partner_id: string | null;
    partner_name: string | null;
    partner_slug: string | null;
    resolved_host: string | null;
    primary_color: string | null;
    login_logo_url: string | null;
    sidebar_logo_light_url: string | null;
    sidebar_logo_dark_url: string | null;
    icon_logo_url: string | null;
    footer_logo_url: string | null;
    favicon_url: string | null;
}

export interface AuthUser {
    id: string;
    email: string;
    full_name: string;
    role: 'master' | 'user';
    tenant_id: string | null;
    partner_id?: string | null;
    tenant_name: string | null;
    avatar_url: string | null;
    permissions: Record<string, any>;
    enabled_features: Record<string, boolean>;
    manageable_features: Record<string, boolean>;
    manageable_tenant_ids: string[];
    managed_partner_ids?: string[];
    resolved_branding?: ResolvedBranding;
    resolved_host?: string | null;
    two_factor_enabled: boolean;
    needs_tenant_setup: boolean;
}

export type LoginResult =
    | {
        success: true;
        requires2FA: true;
        challengeId: string;
        email: string;
        expiresAt: string;
        is_totp?: boolean;
    }
    | {
        success: true;
        requires2FA: false;
    }
    | {
        success: false;
        error: string;
    };

export interface AuthContextValue {
    user: AuthUser | null;
    isAuthenticated: boolean;
    isLoading: boolean;
    isMaster: boolean;
    login: (email: string, password: string) => Promise<LoginResult>;
    verify2FA: (challengeId: string, code: string) => Promise<{ success: boolean; error?: string }>;
    logout: () => void;
    refreshUser: () => Promise<void>;
    hasPermission: (permission: string) => boolean;
    hasFeature: (featureKey: string) => boolean;
}
