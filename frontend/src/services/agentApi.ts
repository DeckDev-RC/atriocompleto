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
    tenant_name: string | null;
    avatar_url: string | null;
    permissions: Record<string, any>;
    two_factor_enabled: boolean;
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

    // Add cache buster to GET requests
    const url = options.method === 'GET' || !options.method
      ? `${AGENT_API_URL}${path}${path.includes('?') ? '&' : '?'}_t=${Date.now()}`
      : `${AGENT_API_URL}${path}`;

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
      const contentType = response.headers.get('content-type');
      if (contentType && contentType.includes('application/json')) {
        const text = await response.text();
        try {
          data = text ? JSON.parse(text) : {};
        } catch (e) {
          console.error('[agentApi] Error parsing JSON:', e, 'Raw text:', text);
          data = { success: false, error: 'Erro ao processar resposta do servidor' };
        }
      } else {
        const text = await response.text();
        console.error('[agentApi] Unexpected non-JSON response:', text);
        return { success: false, error: 'Resposta inválida do servidor (não JSON)' };
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
      tenant_name: string | null;
      permissions: Record<string, any>;
      two_factor_enabled: boolean;
    }>('/api/auth/me');
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
      created_at: string;
      user_count: number;
    }>>('/api/admin/tenants');
  }

  async createTenant(name: string) {
    return this.request<{ id: string; name: string }>('/api/admin/tenants', {
      method: 'POST',
      body: JSON.stringify({ name }),
    });
  }

  async updateTenant(id: string, name: string) {
    return this.request<{ id: string; name: string }>(`/api/admin/tenants/${id}`, {
      method: 'PUT',
      body: JSON.stringify({ name }),
    });
  }

  async deleteTenant(id: string) {
    return this.request(`/api/admin/tenants/${id}`, { method: 'DELETE' });
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
      created_at: string;
    }>>(url);
  }

  async createUser(data: {
    email: string;
    full_name: string;
    role: 'master' | 'user';
    tenant_id: string | null;
    access_request_id?: string | null;
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

  async sendMessage(message: string, conversationId?: string) {
    return this.request<{
      message: string;
      conversation_id: string;
      suggestions?: string[];
      tokenUsage?: {
        inputTokens: number;
        outputTokens: number;
        totalTokens: number;
        estimatedCostUSD: number;
      };
    }>('/api/chat/message', {
      method: 'POST',
      body: JSON.stringify({ message, conversation_id: conversationId }),
    });
  }

  async getChatHistory() {
    return this.request<
      Array<{
        id: string;
        messages: Array<{ role: string; content: string; timestamp: string }>;
        created_at: string;
        updated_at: string;
      }>
    >('/api/chat/history');
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
}

export const agentApi = new AgentApiService();
