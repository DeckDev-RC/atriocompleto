export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  timestamp: string;
  metadata?: Record<string, unknown>;
  tokens_used?: number | null;
}

export interface Conversation {
  id: string;
  user_id: string;
  tenant_id?: string | null;
  messages: ChatMessage[];
  created_at: string;
  updated_at: string;
  title?: string | null;
  last_message_preview?: string | null;
  last_message_at?: string | null;
  message_count?: number;
  summary?: string | null;
}

export interface ConversationListItem {
  id: string;
  user_id: string;
  tenant_id?: string | null;
  title?: string | null;
  created_at: string;
  updated_at: string;
  last_message_preview?: string | null;
  last_message_at?: string | null;
  message_count?: number;
  summary?: string | null;
}

export interface ConversationHistoryPage {
  items: ConversationListItem[];
  total: number;
  has_more: boolean;
}

export interface OrderQueryResult {
  data: Record<string, unknown>[] | null;
  error: string | null;
  query_type: "function_call" | "text_to_sql" | "direct";
}

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}
