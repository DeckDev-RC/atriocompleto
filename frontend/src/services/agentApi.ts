const AGENT_API_URL = import.meta.env.VITE_AGENT_API_URL || '';

interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  details?: Record<string, string[]>;
}

interface AuthSessionPayload {
  access_token: string;
  refresh_token: string;
  expires_at: number | null;
  user: {
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
    resolved_branding?: {
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
    };
    resolved_host?: string | null;
    two_factor_enabled: boolean;
    needs_tenant_setup: boolean;
  };
}

interface Login2FAChallengePayload {
  requires_2fa: true;
  is_totp?: boolean; // Adicionado para identificar se é TOTP
  challenge_id: string;
  expires_at: string;
  email: string;
  message: string;
}

class AgentApiService {
  private token: string | null = null;
  private refreshPromise: Promise<ApiResponse<any>> | null = null;

  setToken(token: string | null) {
    this.token = token;
  }

  private async request<T>(
    path: string,
    options: RequestInit = {},
    signal?: AbortSignal,
  ): Promise<ApiResponse<T>> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...((options.headers as Record<string, string>) || {}),
    };

    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }

    // Limpar o base URL e o path para evitar barras duplas ou falta de barra
    const baseUrl = AGENT_API_URL.endsWith('/') ? AGENT_API_URL.slice(0, -1) : AGENT_API_URL;
    const cleanPath = path.startsWith('/') ? path : `/${path}`;
    const fullUrl = `${baseUrl}${cleanPath}`;

    // Add cache buster to GET requests
    const url = options.method === 'GET' || !options.method
      ? `${fullUrl}${fullUrl.includes('?') ? '&' : '?'}_t=${Date.now()}`
      : fullUrl;

    try {
      const response = await fetch(url, {
        ...options,
        headers,
        signal,
      });

      // Handle session expiration (401 Unauthorized)
      const isLoginOrAuth = path.includes('/api/auth/login') ||
        path.includes('/api/auth/refresh') ||
        path.includes('/api/auth/2fa/verify') ||
        path.includes('/api/auth/verify-2fa') ||
        path.includes('/api/auth/2fa/disable');

      if (response.status === 401 && !isLoginOrAuth) {
        const refreshToken = localStorage.getItem('atrio_refresh_token');
        if (refreshToken) {
          // Use an existing refresh promise if one is in progress
          if (!this.refreshPromise) {
            console.log('[agentApi] Token active, but unauthorized. Attempting refresh...');
            this.refreshPromise = this.refreshToken(refreshToken).finally(() => {
              this.refreshPromise = null;
            });
          }

          const refreshResult = await this.refreshPromise;
          if (refreshResult.success && refreshResult.data) {
            const { access_token, refresh_token } = refreshResult.data;
            this.setToken(access_token);
            localStorage.setItem('atrio_access_token', access_token);
            localStorage.setItem('atrio_refresh_token', refresh_token);

            // Retry the original request
            console.log('[agentApi] Refresh success, retrying request:', path);
            return this.request(path, options, signal);
          }
        }

        console.warn('Session expired or unauthorized. Redirecting to login...');
        this.setToken(null);
        window.dispatchEvent(new CustomEvent('auth:expired'));
      }

      let data: any = {};
      const text = await response.text();

      try {
        data = text ? JSON.parse(text) : {};
      } catch (e) {
        console.error('[agentApi] Error parsing JSON:', e, 'Raw text:', text);
        const contentType = response.headers.get('content-type');
        if (!contentType || !contentType.includes('application/json')) {
          console.error('[agentApi] Unexpected non-JSON response and parse failed:', text);
          return { success: false, error: 'Resposta inválida do servidor (não JSON)' };
        }
        return { success: false, error: 'Erro ao processar resposta do servidor' };
      }

      // Premium error feedback for Rate Limiting
      if (response.status === 429) {
        return {
          success: false,
          error: data.error || 'Muitas requisições. Tente novamente em breve.',
          details: {
            retry_after: [response.headers.get('Retry-After') || '60'],
            type: ['rate_limit']
          }
        };
      }

      if (response.status === 403 && data.error?.includes('bloqueado')) {
        return {
          success: false,
          error: data.error || 'Seu acesso foi temporariamente bloqueado por segurança.',
          details: { type: ['ip_blocked'] }
        };
      }

      // Permission denied (RBAC)
      if (response.status === 403 && data.error?.includes('Acesso negado')) {
        return {
          success: false,
          error: data.error || 'Você não tem permissão para esta ação.',
          details: { type: ['permission_denied'] }
        };
      }

      return data;
    } catch (error) {
      // Silently handle aborted requests
      if (error instanceof DOMException && error.name === 'AbortError') {
        return { success: false, error: 'Request cancelled' };
      }
      console.error('Agent API Error:', error);
      return { success: false, error: 'Erro de conexão com o servidor' };
    }
  }

  // ══════════════════════════════════════════════════════
  // AUTH
  // ══════════════════════════════════════════════════════

  async login(email: string, password: string) {
    return this.request<Login2FAChallengePayload | AuthSessionPayload>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
  }

  async verify2FA(challengeId: string, code: string) {
    return this.request<AuthSessionPayload>('/api/auth/verify-2fa', {
      method: 'POST',
      body: JSON.stringify({ challenge_id: challengeId, code }),
    });
  }

  async refreshToken(refreshToken: string) {
    return this.request<{
      access_token: string;
      refresh_token: string;
      expires_at: number;
    }>('/api/auth/refresh', {
      method: 'POST',
      body: JSON.stringify({ refresh_token: refreshToken }),
    });
  }

  async getMe() {
    return this.request<{
      id: string;
      email: string;
      full_name: string;
      role: 'master' | 'user';
      tenant_id: string | null;
      partner_id?: string | null;
      tenant_name: string | null;
      permissions: Record<string, any>;
      enabled_features: Record<string, boolean>;
      manageable_features: Record<string, boolean>;
      manageable_tenant_ids: string[];
      managed_partner_ids?: string[];
      resolved_branding?: {
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
      };
      resolved_host?: string | null;
      two_factor_enabled: boolean;
      needs_tenant_setup: boolean;
    }>('/api/auth/me');
  }

  async getPublicSignupConfig() {
    return this.request<{
      enabled: boolean;
      resolved_branding?: {
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
      };
    }>('/api/auth/public-signup-config');
  }

  async register(data: {
    full_name: string;
    email: string;
    password: string;
    confirm_password: string;
    partner_slug?: string;
  }) {
    return this.request<{ message: string }>('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async requestAccess(data: {
    full_name: string;
    phone: string;
    email: string;
    company_name: string;
  }) {
    return this.request<{ message: string }>('/api/auth/access-request', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async forgotPassword(email: string) {
    return this.request<{ message: string }>('/api/auth/forgot-password', {
      method: 'POST',
      body: JSON.stringify({ email }),
    });
  }

  async resetPassword(data: {
    token: string;
    new_password: string;
    confirm_password: string;
  }) {
    return this.request<{ message: string }>('/api/auth/reset-password', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async logout() {
    const result = await this.request<{ message: string }>('/api/auth/logout', {
      method: 'POST',
    });
    this.setToken(null);
    return result;
  }

  async setInitialPassword(data: {
    new_password: string;
    confirm_password: string;
  }) {
    return this.request<{ message: string }>('/api/auth/set-password', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async verifyEmail(token: string) {
    return this.request<{ message: string; invitationLink?: string }>(`/api/auth/verify-email/${token}`);
  }

  async resendVerification(email: string) {
    return this.request<{ message: string }>('/api/auth/resend-verification', {
      method: 'POST',
      body: JSON.stringify({ email }),
    });
  }

  async createOnboardingCompany(name: string) {
    return this.request<{ tenant_id: string; tenant_name: string; tenant_code: string }>('/api/auth/onboarding/company', {
      method: 'POST',
      body: JSON.stringify({ name }),
    });
  }

  // TOTP 2FA
  async enable2FA() {
    return this.request<{ qrCode: string; secret: string; recoveryCodes: string[] }>('/api/auth/2fa/enable', {
      method: 'POST'
    });
  }

  async verifyTOTP(code: string) {
    return this.request<{ message: string }>('/api/auth/2fa/verify', {
      method: 'POST',
      body: JSON.stringify({ code })
    });
  }

  async disable2FA(password: string) {
    return this.request<{ message: string }>('/api/auth/2fa/disable', {
      method: 'POST',
      body: JSON.stringify({ password })
    });
  }

  // ══════════════════════════════════════════════════════
  // ADMIN — Tenants
  // ══════════════════════════════════════════════════════

  async getTenants() {
    return this.request<Array<{
      id: string;
      name: string;
      tenant_code: string;
      ai_rate_limit: number;
      created_at: string;
      user_count: number;
      enabled_features: Record<string, boolean>;
      partner_id?: string | null;
      partner_name?: string | null;
    }>>('/api/admin/tenants');
  }

  async createTenant(name: string, aiRateLimit?: number, partnerId?: string | null) {
    return this.request<{ id: string; name: string; tenant_code: string; ai_rate_limit: number }>('/api/admin/tenants', {
      method: 'POST',
      body: JSON.stringify({ name, ai_rate_limit: aiRateLimit || 20, partner_id: partnerId || null }),
    });
  }

  async updateTenant(id: string, name: string, aiRateLimit: number, partnerId?: string | null) {
    return this.request<{ id: string; name: string; tenant_code: string; ai_rate_limit: number }>(`/api/admin/tenants/${id}`, {
      method: 'PUT',
      body: JSON.stringify({ name, ai_rate_limit: aiRateLimit, partner_id: partnerId || null }),
    });
  }

  async deleteTenant(id: string) {
    return this.request(`/api/admin/tenants/${id}`, { method: 'DELETE' });
  }

  async updateTenantFeatures(id: string, changes: Record<string, boolean>) {
    return this.request(`/api/admin/tenants/${id}/features`, {
      method: 'PUT',
      body: JSON.stringify({ changes }),
    });
  }

  async getPartners() {
    return this.request<Array<{
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
    }>>('/api/admin/partners');
  }

  async createPartner(data: {
    name: string;
    slug: string;
    host: string;
    admin_profile_id?: string | null;
    is_active?: boolean;
    primary_color?: string | null;
    login_logo_url?: string | null;
    sidebar_logo_light_url?: string | null;
    sidebar_logo_dark_url?: string | null;
    icon_logo_url?: string | null;
    footer_logo_url?: string | null;
    favicon_url?: string | null;
  }) {
    return this.request('/api/admin/partners', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async updatePartner(id: string, data: {
    name: string;
    slug: string;
    host: string;
    admin_profile_id?: string | null;
    is_active?: boolean;
    primary_color?: string | null;
    login_logo_url?: string | null;
    sidebar_logo_light_url?: string | null;
    sidebar_logo_dark_url?: string | null;
    icon_logo_url?: string | null;
    footer_logo_url?: string | null;
    favicon_url?: string | null;
  }) {
    return this.request(`/api/admin/partners/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  // ══════════════════════════════════════════════════════
  // ADMIN — Users
  // ══════════════════════════════════════════════════════

  async getUsers(tenantId?: string) {
    const url = tenantId ? `/api/admin/users?tenant_id=${tenantId}` : '/api/admin/users';
    return this.request<Array<{
      id: string;
      email: string;
      full_name: string;
      role: 'master' | 'user';
      tenant_id: string | null;
      tenant_name: string;
      is_active: boolean;
      bypass_2fa: boolean;
      created_at: string;
      manageable_features: Record<string, boolean>;
      manageable_tenant_ids: string[];
    }>>(url);
  }

  async createUser(data: {
    email: string;
    full_name: string;
    role: 'master' | 'user';
    tenant_id: string | null;
    access_request_id?: string | null;
    bypass_2fa?: boolean;
    manageable_features?: Record<string, boolean>;
    manageable_tenant_ids?: string[];
  }) {
    return this.request('/api/admin/users', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async updateUser(id: string, data: Record<string, unknown>) {
    return this.request(`/api/admin/users/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  async deleteUser(id: string) {
    return this.request(`/api/admin/users/${id}`, { method: 'DELETE' });
  }

  async resetUserPassword(id: string, password: string, confirmPassword: string) {
    return this.request(`/api/admin/users/${id}/reset-password`, {
      method: 'POST',
      body: JSON.stringify({ password, confirm_password: confirmPassword }),
    });
  }

  async getAccessRequests(params?: { status?: string; q?: string }) {
    const query = new URLSearchParams();
    if (params?.status) query.set('status', params.status);
    if (params?.q) query.set('q', params.q);
    const suffix = query.toString() ? `?${query.toString()}` : '';
    return this.request<Array<{
      id: string;
      full_name: string;
      phone: string;
      email: string;
      company_name: string;
      status: 'pending' | 'reviewed' | 'approved' | 'rejected' | 'converted';
      admin_notes: string | null;
      processed_at: string | null;
      processed_by: string | null;
      converted_user_id: string | null;
      created_at: string;
      updated_at: string;
    }>>(`/api/admin/access-requests${suffix}`);
  }

  async updateAccessRequest(id: string, payload: {
    status?: 'pending' | 'reviewed' | 'approved' | 'rejected' | 'converted';
    admin_notes?: string | null;
  }) {
    return this.request(`/api/admin/access-requests/${id}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    });
  }

  async convertAccessRequest(id: string, payload: {
    role: 'master' | 'user';
    tenant_id: string | null;
    admin_notes?: string;
  }) {
    return this.request(`/api/admin/access-requests/${id}/convert`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  // ══════════════════════════════════════════════════════
  // CHAT
  // ══════════════════════════════════════════════════════

  async *sendMessageStream(message: string, conversationId?: string, signal?: AbortSignal, fileIds?: string[]) {
    const baseUrl = AGENT_API_URL.endsWith('/') ? AGENT_API_URL.slice(0, -1) : AGENT_API_URL;
    const url = `${baseUrl}/api/ai/analyze`;

    // AbortController with 2-minute timeout for the entire stream
    const controller = new AbortController();
    const streamTimeout = setTimeout(() => controller.abort(), 120_000);

    // If external signal aborts, abort our internal controller
    if (signal) {
      signal.addEventListener('abort', () => controller.abort());
    }

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.token}`,
          'Accept': 'text/event-stream',
        },
        body: JSON.stringify({ message, conversation_id: conversationId, stream: true, file_ids: fileIds }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Erro de conexão' }));
        throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
      }

      const reader = response.body?.getReader();
      if (!reader) return;

      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.trim().startsWith('data: ')) {
            try {
              const jsonStr = line.trim().substring(6);
              if (jsonStr) {
                const data = JSON.parse(jsonStr);
                yield data;
              }
            } catch (e) {
              console.error('[agentApi] Error parsing SSE data:', e, 'Line:', line);
            }
          }
        }
      }
    } finally {
      clearTimeout(streamTimeout);
    }
  }

  async getChatHistory(params?: { limit?: number; offset?: number; q?: string }) {
    const search = new URLSearchParams();
    if (params?.limit) search.append('limit', String(params.limit));
    if (params?.offset) search.append('offset', String(params.offset));
    if (params?.q) search.append('q', params.q);
    const suffix = search.toString() ? `?${search.toString()}` : '';

    return this.request<{
      items: Array<{
        id: string;
        title?: string | null;
        created_at: string;
        updated_at: string;
        last_message_preview?: string | null;
        last_message_at?: string | null;
        message_count?: number;
        summary?: string | null;
      }>;
      total: number;
      has_more: boolean;
    }>(`/api/chat/history${suffix}`);
  }

  async getConversation(id: string) {
    return this.request<{
      id: string;
      title?: string | null;
      messages: Array<{ role: string; content: string; timestamp: string }>;
      created_at: string;
      updated_at: string;
      last_message_preview?: string | null;
      last_message_at?: string | null;
      message_count?: number;
      summary?: string | null;
    }>(`/api/chat/conversation/${id}`);
  }

  async newConversation() {
    return this.request<{ id: string }>('/api/chat/new', { method: 'POST' });
  }

  async clearConversation(id: string) {
    return this.request(`/api/chat/${id}`, { method: 'DELETE' });
  }

  // ══════════════════════════════════════════════════════
  // ADMIN — Segurança / Rate Limit
  // ══════════════════════════════════════════════════════

  async getBlockedIps() {
    return this.request<Array<{ ip: string; ttl: number }>>('/api/admin/rate-limit/blocked-ips');
  }

  async unblockIp(ip: string) {
    return this.request<{ message: string }>('/api/admin/rate-limit/unblock-ip', {
      method: 'POST',
      body: JSON.stringify({ ip }),
    });
  }

  async getPublicSignupSettings() {
    return this.request<{ enabled: boolean }>('/api/admin/public-signup');
  }

  async updatePublicSignupSettings(data: { enabled: boolean }) {
    return this.request<{ enabled: boolean }>('/api/admin/public-signup', {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  // ══════════════════════════════════════════════════════
  // ADMIN — RBAC
  // ══════════════════════════════════════════════════════

  async getRoles() {
    return this.request<Array<{
      id: string;
      name: string;
      description: string | null;
      role_permissions: Array<{ permission_id: string }>;
    }>>('/api/admin/rbac/roles');
  }

  async getPermissions() {
    return this.request<Array<{
      id: string;
      name: string;
      description: string | null;
    }>>('/api/admin/rbac/permissions');
  }

  async toggleRolePermission(roleId: string, permissionId: string, active: boolean) {
    return this.request(`/api/admin/rbac/roles/${roleId}/permissions`, {
      method: 'POST',
      body: JSON.stringify({ permissionId, active }),
    });
  }

  async getUserRoles() {
    return this.request<Array<{
      id: string;
      email: string;
      full_name: string;
      user_roles: Array<{ role_id: string; roles: { name: string } }>;
    }>>('/api/admin/rbac/users-roles');
  }

  async assignUserRole(profileId: string, roleId: string) {
    return this.request(`/api/admin/rbac/users/${profileId}/roles`, {
      method: 'POST',
      body: JSON.stringify({ roleId }),
    });
  }

  async removeUserRole(profileId: string, roleId: string) {
    return this.request(`/api/admin/rbac/users/${profileId}/roles/${roleId}`, {
      method: 'DELETE',
    });
  }

  async createRole(data: { name: string; description?: string | null }) {
    return this.request<{
      id: string;
      name: string;
      description: string | null;
      is_system: boolean;
    }>('/api/admin/rbac/roles', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async updateRole(roleId: string, data: { name?: string; description?: string | null }) {
    return this.request(`/api/admin/rbac/roles/${roleId}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  async deleteRole(roleId: string) {
    return this.request(`/api/admin/rbac/roles/${roleId}`, {
      method: 'DELETE',
    });
  }

  async cloneRole(roleId: string, data: { name: string; description?: string | null }) {
    return this.request(`/api/admin/rbac/roles/${roleId}/clone`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  // ══════════════════════════════════════════════════════
  // DASHBOARD
  // ══════════════════════════════════════════════════════

  async getDashboardSummary(period: string = 'all', startDate?: string, endDate?: string, status?: string, signal?: AbortSignal) {
    let url = `/api/dashboard/summary?period=${encodeURIComponent(period)}`;
    if (startDate) url += `&start_date=${encodeURIComponent(startDate)}`;
    if (endDate) url += `&end_date=${encodeURIComponent(endDate)}`;
    if (status && status !== 'all') url += `&status=${encodeURIComponent(status)}`;

    return this.request<{
      banner: {
        totalRevenue: number;
        trendPct: number | null;
        channels: Array<{
          id: string;
          label: string;
          value: number;
          percentage: number;
          color: string;
          iconType: string;
        }>;
      };
      orderDistribution: Array<{ name: string; value: number; color: string }>;
      monthlyRevenue: Array<{ month: string; paid: number; cancelled: number }>;
      stats: {
        totalOrders: { value: number; change: number | null };
        avgTicket: { value: number; change: number | null };
        cancellationRate: { value: number; change: number | null };
      };
      insights: {
        avgTicket: number;
        cancellationRate: number;
        paidPct: number;
        momTrend: number | null;
      };
      comparedMonths: { current: string; previous: string } | null;
      period: string | { start: string; end: string };
    }>(url, {}, signal);
  }

  async getDashboardStatuses() {
    return this.request<string[]>('/api/dashboard/statuses');
  }

  // ══════════════════════════════════════════════════════
  // USER — Preferences & Profile
  // ══════════════════════════════════════════════════════

  async getPreferences() {
    return this.request<{
      primary_color: string;
      font_family: string;
      number_locale: string;
      number_decimals: number;
      currency_symbol: string;
    }>('/api/user/preferences');
  }

  async updatePreferences(prefs: Partial<{
    primary_color: string;
    font_family: string;
    number_locale: string;
    number_decimals: number;
    currency_symbol: string;
  }>) {
    return this.request('/api/user/preferences', {
      method: 'PUT',
      body: JSON.stringify(prefs),
    });
  }

  async updateProfile(data: { full_name: string }) {
    return this.request<{ id: string; email: string; full_name: string; role: string }>(
      '/api/user/profile',
      {
        method: 'PUT',
        body: JSON.stringify(data),
      },
    );
  }

  async uploadAvatar(file: File) {
    const formData = new FormData();
    formData.append('avatar', file);

    const headers: Record<string, string> = {};
    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }

    try {
      const response = await fetch(`${AGENT_API_URL}/api/user/avatar`, {
        method: 'POST',
        headers,
        body: formData,
      });
      return await response.json();
    } catch {
      return { success: false, error: 'Erro ao enviar avatar' };
    }
  }

  async deleteAvatar() {
    return this.request<{ avatar_url: null }>('/api/user/avatar', {
      method: 'DELETE',
    });
  }

  async changePassword(data: {
    current_password: string;
    new_password: string;
    confirm_password: string;
  }) {
    return this.request<{ message: string }>('/api/user/change-password', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  // ══════════════════════════════════════════════════════
  // HEALTH
  // ══════════════════════════════════════════════════════

  async getAuditLogs(params: { action?: string; userId?: string; startDate?: string; endDate?: string; page?: number; limit?: number }) {
    const searchParams = new URLSearchParams();
    if (params.action) searchParams.append('action', params.action);
    if (params.userId) searchParams.append('userId', params.userId);
    if (params.startDate) searchParams.append('startDate', params.startDate);
    if (params.endDate) searchParams.append('endDate', params.endDate);
    if (params.page) searchParams.append('page', String(params.page));
    if (params.limit) searchParams.append('limit', String(params.limit));

    return this.request<any>(`/api/audit-logs?${searchParams.toString()}`);
  }

  async getAuditActions() {
    return this.request<string[]>('/api/audit-logs/actions');
  }

  getAuditExportUrl() {
    return `${AGENT_API_URL}/api/audit-logs/export?token=${this.token}`;
  }

  async health() {
    return this.request<{ api: string; supabase: string; timestamp: string }>(
      '/api/health',
    );
  }

  async getHealthCheck() {
    return this.request<{
      message: string;
      alerts: Array<{ type: string; message: string }>;
      summary: Record<string, unknown> | null;
    }>('/api/chat/health-check');
  }

  // ══════════════════════════════════════════════════════
  // DAILY INSIGHTS
  // ══════════════════════════════════════════════════════

  async getDailyInsights() {
    return this.request<import('../types/insights').AutoInsight[]>('/api/ai/daily-insights');
  }

  async updateInsightStatus(id: string, status: import('../types/insights').InsightStatus) {
    return this.request<void>(`/api/ai/insights/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    });
  }

  async getDailyInsightsHistory(params: { page?: number; limit?: number; category?: string; priority?: string }) {
    const query = new URLSearchParams();
    if (params.page) query.append('page', String(params.page));
    if (params.limit) query.append('limit', String(params.limit));
    if (params.category) query.append('category', params.category);
    if (params.priority) query.append('priority', params.priority);

    return this.request<{
      insights: import('../types/insights').AutoInsight[];
      total: number;
      page: number;
      totalPages: number;
    }>(`/api/ai/insights/history?${query.toString()}`);
  }

  async executeInsightAction(id: string, action: string, params?: any) {
    return this.request<{ status: string; message: string }>(`/api/ai/insights/${id}/action`, {
      method: 'POST',
      body: JSON.stringify({ action, params }),
    });
  }

  async getPatterns(days: number = 30) {
    return this.request<{
      success: boolean;
      data: {
        rfm: import('../types/insights').RFMAnalysis;
        correlation: any;
        basket: any[];
      };
    }>(`/api/ai/patterns?days=${days}`);
  }

  async getSmartSegments() {
    return this.request<{
      success: boolean;
      data: {
        churn_risk: any[];
        upsell_candidates: any[];
      };
    }>(`/api/ai/segments`);
  }

  // ══════════════════════════════════════════════════════
  // OPTIMUS SUGGESTIONS
  // ══════════════════════════════════════════════════════

  async getOptimusSuggestions() {
    return this.request<{ suggestions: any[] }>('/api/optimus/suggestions');
  }

  async uploadOptimusFiles(files: File[], conversationId?: string | null) {
    const formData = new FormData();
    files.forEach((file) => formData.append('files', file));
    if (conversationId) formData.append('conversation_id', conversationId);

    const headers: Record<string, string> = {};
    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }

    try {
      const response = await fetch(`${AGENT_API_URL}/api/optimus/upload-file`, {
        method: 'POST',
        headers,
        body: formData,
      });
      return await response.json();
    } catch {
      return { success: false, error: 'Erro ao enviar arquivos' };
    }
  }

  async getOptimusFiles(params?: { conversationId?: string | null; limit?: number }) {
    const search = new URLSearchParams();
    if (params?.conversationId) search.append('conversation_id', params.conversationId);
    if (params?.limit) search.append('limit', String(params.limit));
    const suffix = search.toString() ? `?${search.toString()}` : '';
    return this.request<{ files: any[] }>(`/api/optimus/files${suffix}`);
  }

  async getOptimusFile(id: string) {
    return this.request<any>(`/api/optimus/files/${id}`);
  }

  async deleteOptimusFile(id: string) {
    return this.request<{ success: boolean }>(`/api/optimus/files/${id}`, {
      method: 'DELETE',
    });
  }

  async getOptimusFileDownloadUrl(id: string) {
    return this.request<{ url: string }>(`/api/optimus/files/${id}/download`);
  }

  async askOptimusFiles(payload: { question: string; file_ids: string[]; conversation_id?: string }) {
    return this.request<{ message: string }>('/api/optimus/files/ask', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  async generateOptimusSuggestions() {
    return this.request<{ suggestions: any[] }>('/api/optimus/suggestions/generate', {
      method: 'POST',
    });
  }

  async markOptimusSuggestionStatus(id: string, status: 'accepted' | 'dismissed') {
    return this.request<{ success: boolean }>(`/api/optimus/suggestions/${id}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    });
  }

  async executeOptimusSuggestionAction(id: string) {
    return this.request<{
      status: string;
      message: string;
      action_slug?: string;
      deep_link?: string;
      filters?: Record<string, unknown>;
    }>(`/api/optimus/suggestions/${id}/action`, {
      method: 'POST',
    });
  }

  getOptimusExportUrl(filters: Record<string, string | number | boolean | undefined>) {
    const params = new URLSearchParams();
    if (this.token) params.append('token', this.token);

    Object.entries(filters).forEach(([key, value]) => {
      if (value === undefined || value === null || value === '') return;
      params.append(key, String(value));
    });

    const baseUrl = AGENT_API_URL.endsWith('/') ? AGENT_API_URL.slice(0, -1) : AGENT_API_URL;
    return `${baseUrl}/api/optimus/export.csv?${params.toString()}`;
  }

  // ══════════════════════════════════════════════════════
  // STRATEGIC REPORT
  // ══════════════════════════════════════════════════════

  async getStrategicReport() {
    return this.request<{
      report: any;
      bcg: any;
    }>('/api/ai/strategic-report');
  }

  async generateStrategicReport() {
    return this.request<any>('/api/ai/strategic-report/generate', {
      method: 'POST',
    });
  }

  // ══════════════════════════════════════════════════════
  // CAMPAIGN RECOMMENDATIONS
  // ══════════════════════════════════════════════════════

  async getReportMetadata() {
    return this.request<{
      recipients: Array<{ id: string; email: string; full_name: string }>;
      statuses: string[];
      marketplaces: string[];
      categories: string[];
      custom_reports: Array<{ id: string; name: string; description: string | null; dataset: 'sales' | 'products' | 'customers' }>;
    }>('/api/reports/metadata');
  }

  async getScheduledReports() {
    return this.request<any[]>('/api/reports/schedules');
  }

  async getReportExports(params?: {
    source_type?: 'scheduled_report' | 'custom_definition' | 'custom_builder';
    source_id?: string;
    limit?: number;
  }) {
    const query = new URLSearchParams();
    if (params?.source_type) query.set('source_type', params.source_type);
    if (params?.source_id) query.set('source_id', params.source_id);
    if (params?.limit) query.set('limit', String(params.limit));
    const suffix = query.toString() ? `?${query.toString()}` : '';
    return this.request<any[]>(`/api/reports/exports${suffix}`);
  }

  async getReportExport(id: string) {
    return this.request<any>(`/api/reports/exports/${id}`);
  }

  async createReportExport(payload:
    | {
      source_type: 'scheduled_report';
      source_id: string;
      title?: string | null;
      format: 'csv' | 'xlsx' | 'html' | 'json' | 'pdf';
      options?: {
        orientation?: 'portrait' | 'landscape';
        delimiter?: ',' | ';';
        include_summary?: boolean;
        include_graphs?: boolean;
        watermark?: boolean;
      };
    }
    | {
      source_type: 'custom_definition';
      source_id: string;
      title?: string | null;
      format: 'csv' | 'xlsx' | 'html' | 'json' | 'pdf';
      options?: {
        orientation?: 'portrait' | 'landscape';
        delimiter?: ',' | ';';
        include_summary?: boolean;
        include_graphs?: boolean;
        watermark?: boolean;
      };
    }
    | {
      source_type: 'custom_builder';
      title: string;
      description?: string | null;
      format: 'csv' | 'xlsx' | 'html' | 'json' | 'pdf';
      definition: {
        dataset: 'sales' | 'products' | 'customers';
        dimensions: string[];
        metrics: string[];
        filters?: Array<{
          field: string;
          operator: 'eq' | 'in' | 'between' | 'gte' | 'lte';
          value: string | number | Array<string | number>;
        }>;
        sort?: {
          field: string;
          direction: 'asc' | 'desc';
        };
        limit?: number;
      };
      options?: {
        orientation?: 'portrait' | 'landscape';
        delimiter?: ',' | ';';
        include_summary?: boolean;
        include_graphs?: boolean;
        watermark?: boolean;
      };
    }
  ) {
    return this.request<any>('/api/reports/exports', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  async getReportExportDownloadUrl(id: string) {
    return this.request<{ url: string }>(`/api/reports/exports/${id}/download`);
  }

  async shareReportExport(id: string) {
    return this.request<{ token: string; expires_at: string; url: string }>(`/api/reports/exports/${id}/share`, {
      method: 'POST',
    });
  }

  async emailReportExport(id: string, recipients: string[]) {
    return this.request<any>(`/api/reports/exports/${id}/email`, {
      method: 'POST',
      body: JSON.stringify({ recipients }),
    });
  }

  async getScheduledReportExecutions(id: string) {
    return this.request<any[]>(`/api/reports/schedules/${id}/executions`);
  }

  async getReportExecutionDownloadUrl(id: string) {
    return this.request<{ url: string }>(`/api/reports/executions/${id}/download`);
  }

  async previewScheduledReport(payload: {
    name: string;
    report_type: 'sales' | 'products' | 'customers' | 'finance' | 'custom';
    custom_report_id?: string | null;
    format: 'csv' | 'xlsx' | 'html';
    is_active: boolean;
    recipients: string[];
    schedule: {
      frequency: 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'annual' | 'custom';
      time: string;
      day_of_week?: number | null;
      day_of_month?: number | null;
      month_of_year?: number | null;
      cron_expression?: string | null;
      timezone?: string;
    };
    filters: {
      period_mode: 'relative' | 'fixed';
      relative_period?: 'yesterday' | 'last_7_days' | 'previous_month_complete' | null;
      start_date?: string | null;
      end_date?: string | null;
      status?: string | null;
      marketplace?: string | null;
      category?: string | null;
      low_stock?: boolean | null;
      out_of_stock?: boolean | null;
      excess_stock?: boolean | null;
    };
  }) {
    return this.request<{
      cronExpression: string;
      nextRunAt: string;
      description: string;
    }>('/api/reports/preview', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  async createScheduledReport(payload: {
    name: string;
    report_type: 'sales' | 'products' | 'customers' | 'finance' | 'custom';
    custom_report_id?: string | null;
    format: 'csv' | 'xlsx' | 'html';
    is_active: boolean;
    recipients: string[];
    schedule: {
      frequency: 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'annual' | 'custom';
      time: string;
      day_of_week?: number | null;
      day_of_month?: number | null;
      month_of_year?: number | null;
      cron_expression?: string | null;
      timezone?: string;
    };
    filters: {
      period_mode: 'relative' | 'fixed';
      relative_period?: 'yesterday' | 'last_7_days' | 'previous_month_complete' | null;
      start_date?: string | null;
      end_date?: string | null;
      status?: string | null;
      marketplace?: string | null;
      category?: string | null;
      low_stock?: boolean | null;
      out_of_stock?: boolean | null;
      excess_stock?: boolean | null;
    };
  }) {
    return this.request<any>('/api/reports/schedule', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  async updateScheduledReport(id: string, payload: {
    name: string;
    report_type: 'sales' | 'products' | 'customers' | 'finance' | 'custom';
    custom_report_id?: string | null;
    format: 'csv' | 'xlsx' | 'html';
    is_active: boolean;
    recipients: string[];
    schedule: {
      frequency: 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'annual' | 'custom';
      time: string;
      day_of_week?: number | null;
      day_of_month?: number | null;
      month_of_year?: number | null;
      cron_expression?: string | null;
      timezone?: string;
    };
    filters: {
      period_mode: 'relative' | 'fixed';
      relative_period?: 'yesterday' | 'last_7_days' | 'previous_month_complete' | null;
      start_date?: string | null;
      end_date?: string | null;
      status?: string | null;
      marketplace?: string | null;
      category?: string | null;
      low_stock?: boolean | null;
      out_of_stock?: boolean | null;
      excess_stock?: boolean | null;
    };
  }) {
    return this.request<any>(`/api/reports/schedules/${id}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    });
  }

  async updateScheduledReportStatus(id: string, status: 'active' | 'paused') {
    return this.request<any>(`/api/reports/schedules/${id}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    });
  }

  async deleteScheduledReport(id: string) {
    return this.request(`/api/reports/schedules/${id}`, {
      method: 'DELETE',
    });
  }

  async runScheduledReportNow(id: string) {
    return this.request<any>(`/api/reports/schedules/${id}/run-now`, {
      method: 'POST',
    });
  }

  async getCustomReportMetadata() {
    return this.request<{
      datasets: Array<{
        key: 'sales' | 'products' | 'customers';
        label: string;
        description: string;
        dimensions: Array<{ key: string; label: string }>;
        metrics: Array<{ key: string; label: string }>;
        filters: Array<{ key: string; label: string; type: 'text' | 'number' | 'date' }>;
      }>;
    }>('/api/reports/custom/metadata');
  }

  async getCustomReportDefinitions() {
    return this.request<any[]>('/api/reports/custom/definitions');
  }

  async getReportTemplates(params?: {
    search?: string;
    category?: string;
    dataset?: 'sales' | 'products' | 'customers';
    scope?: 'system' | 'tenant' | 'user' | 'all';
  }) {
    const query = new URLSearchParams();
    if (params?.search) query.set('search', params.search);
    if (params?.category) query.set('category', params.category);
    if (params?.dataset) query.set('dataset', params.dataset);
    if (params?.scope) query.set('scope', params.scope);

    const suffix = query.toString() ? `?${query.toString()}` : '';
    return this.request<any[]>(`/api/reports/templates${suffix}`);
  }

  async getReportTemplate(id: string) {
    return this.request<any>(`/api/reports/templates/${id}`);
  }

  async createReportTemplate(payload: {
    name: string;
    description?: string | null;
    category: string;
    tags?: string[];
    icon?: string | null;
    preview_image_url?: string | null;
    scope: 'tenant' | 'user';
    source_definition_id?: string | null;
    definition?: {
      dataset: 'sales' | 'products' | 'customers';
      dimensions: string[];
      metrics: string[];
      filters?: Array<{
        field: string;
        operator: 'eq' | 'in' | 'between' | 'gte' | 'lte';
        value: string | number | Array<string | number>;
      }>;
      sort?: {
        field: string;
        direction: 'asc' | 'desc';
      };
      limit?: number;
    };
    default_schedule?: {
      format?: 'csv' | 'xlsx' | 'html';
      schedule?: {
        frequency?: 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'annual' | 'custom';
        time?: string;
        day_of_week?: number | null;
        day_of_month?: number | null;
        month_of_year?: number | null;
        cron_expression?: string | null;
        timezone?: string;
      };
    };
  }) {
    return this.request<any>('/api/reports/templates', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  async useReportTemplate(id: string) {
    return this.request<any>(`/api/reports/templates/${id}/use`, {
      method: 'POST',
    });
  }

  async createCustomReportDefinition(payload: {
    name: string;
    description?: string | null;
    definition: {
      dataset: 'sales' | 'products' | 'customers';
      dimensions: string[];
      metrics: string[];
      filters?: Array<{
        field: string;
        operator: 'eq' | 'in' | 'between' | 'gte' | 'lte';
        value: string | number | Array<string | number>;
      }>;
      sort?: {
        field: string;
        direction: 'asc' | 'desc';
      };
      limit?: number;
    };
  }) {
    return this.request<any>('/api/reports/custom/definitions', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  async updateCustomReportDefinition(id: string, payload: {
    name: string;
    description?: string | null;
    definition: {
      dataset: 'sales' | 'products' | 'customers';
      dimensions: string[];
      metrics: string[];
      filters?: Array<{
        field: string;
        operator: 'eq' | 'in' | 'between' | 'gte' | 'lte';
        value: string | number | Array<string | number>;
      }>;
      sort?: {
        field: string;
        direction: 'asc' | 'desc';
      };
      limit?: number;
    };
  }) {
    return this.request<any>(`/api/reports/custom/definitions/${id}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    });
  }

  async deleteCustomReportDefinition(id: string) {
    return this.request(`/api/reports/custom/definitions/${id}`, {
      method: 'DELETE',
    });
  }

  async previewCustomReport(payload: {
    dataset: 'sales' | 'products' | 'customers';
    dimensions: string[];
    metrics: string[];
    filters?: Array<{
      field: string;
      operator: 'eq' | 'in' | 'between' | 'gte' | 'lte';
      value: string | number | Array<string | number>;
    }>;
    sort?: {
      field: string;
      direction: 'asc' | 'desc';
    };
    limit?: number;
  }) {
    return this.request<{
      sql: string;
      rowCount: number;
      rows: Array<Record<string, string | number | null>>;
    }>('/api/reports/custom/preview', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  async getCampaignRecommendations() {
    return this.request<{
      latest: any;
      history: any[];
    }>('/api/ai/campaign-recommendations');
  }

  async generateCampaignRecommendations() {
    return this.request<any>('/api/ai/campaign-recommendations/generate', {
      method: 'POST',
    });
  }

  async updateCampaignRecommendationStatus(id: string, status: 'generated' | 'approved' | 'dismissed') {
    return this.request<any>(`/api/ai/campaign-recommendations/${id}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    });
  }

  // ══════════════════════════════════════════════════════
  // BENCHMARKING
  // ══════════════════════════════════════════════════════

  async getCompetitors() {
    return this.request<any[]>('/api/benchmarking/competitors');
  }

  async createCompetitor(data: { name: string; website_url?: string; category?: string; region?: string; notes?: string }) {
    return this.request<any>('/api/benchmarking/competitors', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async updateCompetitor(id: string, data: Record<string, unknown>) {
    return this.request<any>(`/api/benchmarking/competitors/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  async deleteCompetitor(id: string) {
    return this.request(`/api/benchmarking/competitors/${id}`, { method: 'DELETE' });
  }

  async getCompetitorProducts(competitorId: string) {
    return this.request<any[]>(`/api/benchmarking/competitors/${competitorId}/products`);
  }

  async addCompetitorProduct(competitorId: string, data: { product_name: string; your_product_name?: string; current_price?: number; your_price?: number }) {
    return this.request<any>(`/api/benchmarking/competitors/${competitorId}/products`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async updateCompetitorProduct(productId: string, data: Record<string, unknown>) {
    return this.request<any>(`/api/benchmarking/products/${productId}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  async deleteCompetitorProduct(productId: string) {
    return this.request(`/api/benchmarking/products/${productId}`, { method: 'DELETE' });
  }

  async getProductPriceHistory(productId: string) {
    return this.request<any[]>(`/api/benchmarking/products/${productId}/price-history`);
  }

  async getBenchmarkingComparison() {
    return this.request<{ products: any[]; summary: any }>('/api/benchmarking/comparison');
  }

  async getBenchmarkingAlerts() {
    return this.request<any[]>('/api/benchmarking/alerts');
  }

  async generateBenchmarkingSWOT() {
    return this.request<any>('/api/benchmarking/swot', { method: 'POST' });
  }

  async getLatestBenchmarkingSWOT() {
    return this.request<any>('/api/benchmarking/swot');
  }

  // ══════════════════════════════════════════════════════
  // INDUSTRY BENCHMARKING (Sector Comparison)
  // ══════════════════════════════════════════════════════

  async getIndustryComparison() {
    return this.request<{
      size: {
        tier: string;
        label: string;
        annual_revenue: number;
        thresholds: Array<{ tier: string; label: string; max: number | null }>;
      };
      comparisons: Array<{
        metric_key: string;
        metric_label: string;
        unit: string;
        tenant_value: number;
        benchmark_value: number;
        percentile_25: number;
        percentile_75: number;
        gap_pct: number;
        status: 'above' | 'at_range' | 'below';
        source: string;
      }>;
      generated_at: string;
    }>('/api/benchmarking/industry');
  }

  async generateIndustryAnalysis() {
    return this.request<any>('/api/benchmarking/industry/analysis', {
      method: 'POST',
    });
  }

  async getLatestIndustryAnalysis() {
    return this.request<any>('/api/benchmarking/industry/latest');
  }

  // ══════════════════════════════════════════════════════
  // SIMULATIONS (What-If Analysis)
  // ══════════════════════════════════════════════════════

  async getSimulationBaseline() {
    return this.request<{
      revenue: number;
      orders: number;
      avg_ticket: number;
      sessions: number;
      conversion_rate: number;
      generated_at: string;
    }>('/api/simulations/baseline');
  }

  async generateSimulationAnalysis(payload: { scenario_data: any; baseline: any; projected: any }) {
    return this.request<any>('/api/simulations/analysis', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  async getCalculatorSnapshots(calculatorType: 'taxes' | 'prices') {
    return this.request<any[]>(`/api/simulations/calculator-snapshots?calculator_type=${calculatorType}`);
  }

  async saveCalculatorSnapshot(payload: {
    calculator_type: 'taxes' | 'prices';
    name: string;
    payload: Record<string, unknown>;
  }) {
    return this.request<any>('/api/simulations/calculator-snapshots', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  async deleteCalculatorSnapshot(id: string) {
    return this.request(`/api/simulations/calculator-snapshots/${id}`, { method: 'DELETE' });
  }

  async getSavedSimulations() {
    return this.request<any[]>('/api/simulations');
  }

  async saveSimulation(payload: { name: string; scenario_data: any; baseline_metrics: any; projected_metrics: any; ai_analysis?: any }) {
    return this.request<any>('/api/simulations', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  async deleteSimulation(id: string) {
    return this.request(`/api/simulations/${id}`, { method: 'DELETE' });
  }

  async generateMarketplaceDescriptions(payload: {
    product_name: string;
    marketplace?: string;
    category?: string;
    keywords?: string;
    features?: string;
  }) {
    return this.request<{
      recommendation?: string;
      variations: Array<{
        id: string;
        angle: string;
        title: string;
        description: string;
        bulletPoints: string[];
        tags: string[];
        seoScore: number;
      }>;
    }>('/api/simulations/marketplace-description', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  // ══════════════════════════════════════════════════════
  // INVENTORY SIMULATION (What-If Analysis)
  // ══════════════════════════════════════════════════════

  async runInventorySimulation(params: {
    averageDemand: number;
    demandStdDev: number;
    leadTimeDays: number;
    unitCost: number;
    orderCost: number;
    holdingCostPercent: number;
    shortageCost: number;
    serviceLevelTarget: number;
  }) {
    return this.request<any>('/api/inventory/run', {
      method: 'POST',
      body: JSON.stringify(params)
    });
  }
}

export const agentApi = new AgentApiService();
