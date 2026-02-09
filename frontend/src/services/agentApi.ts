const AGENT_API_URL = import.meta.env.VITE_AGENT_API_URL || '';

interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}

class AgentApiService {
  private async request<T>(
    path: string,
    options: RequestInit = {},
  ): Promise<ApiResponse<T>> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...((options.headers as Record<string, string>) || {}),
    };

    try {
      const response = await fetch(`${AGENT_API_URL}${path}`, {
        ...options,
        headers,
      });

      const data = await response.json();
      return data;
    } catch (error) {
      console.error('Agent API Error:', error);
      return { success: false, error: 'Erro de conexão com o servidor' };
    }
  }

  // ── Chat ────────────────────────────────────────
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

  // ── Dashboard ────────────────────────────────────
  async getDashboardSummary(period: string = 'all', startDate?: string, endDate?: string) {
    let url = `/api/dashboard/summary?period=${encodeURIComponent(period)}`;
    if (startDate) url += `&start_date=${encodeURIComponent(startDate)}`;
    if (endDate) url += `&end_date=${encodeURIComponent(endDate)}`;

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
      period: string | { start: string; end: string };
    }>(url);
  }

  // ── Health ──────────────────────────────────────
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
