const AGENT_API_URL = import.meta.env.VITE_AGENT_API_URL || '';

interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  details?: Record<string, string[]>;
}

class AgentApiService {
  private token: string | null = null;

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

    try {
      const response = await fetch(`${AGENT_API_URL}${path}`, {
        ...options,
        headers,
        signal,
      });

      const data = await response.json();
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
    return this.request<{
      access_token: string;
      refresh_token: string;
      expires_at: number;
      user: {
        id: string;
        email: string;
        full_name: string;
        role: 'master' | 'user';
        tenant_id: string | null;
        tenant_name: string | null;
        avatar_url: string | null;
      };
    }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
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
    }>('/api/auth/me');
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
    password: string;
    full_name: string;
    role: 'master' | 'user';
    tenant_id: string | null;
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

  async resetUserPassword(id: string, password: string) {
    return this.request(`/api/admin/users/${id}/reset-password`, {
      method: 'POST',
      body: JSON.stringify({ password }),
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
