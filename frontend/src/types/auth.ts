export interface AuthUser {
    id: string;
    email: string;
    full_name: string;
    role: 'master' | 'user';
    tenant_id: string | null;
    tenant_name: string | null;
    avatar_url: string | null;
    permissions: Record<string, any>;
    two_factor_enabled: boolean;
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
}
