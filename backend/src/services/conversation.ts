import { supabase } from "../config/supabase";
import {
  ChatMessage,
  Conversation,
  ConversationHistoryPage,
  ConversationListItem,
} from "../types";

const DEFAULT_HISTORY_LIMIT = 20;
const DEFAULT_MESSAGES_LIMIT = 200;

type ConversationRow = {
  id: string;
  user_id: string;
  tenant_id?: string | null;
  title?: string | null;
  created_at: string;
  updated_at: string;
  last_message_preview?: string | null;
  last_message_at?: string | null;
  message_count?: number | null;
};

type SummaryRow = {
  conversation_id: string;
  summary: string;
};

type MessageRow = {
  role: "user" | "assistant" | "system";
  content: string;
  metadata: Record<string, unknown> | null;
  tokens_used: number | null;
  created_at: string;
};

function mapMessage(row: MessageRow): ChatMessage {
  return {
    role: row.role === "assistant" ? "assistant" : "user",
    content: row.content,
    timestamp: row.created_at,
    metadata: row.metadata || undefined,
    tokens_used: row.tokens_used,
  };
}

async function getSummariesByConversationIds(conversationIds: string[]): Promise<Map<string, string>> {
  if (conversationIds.length === 0) return new Map();

  const { data, error } = await supabase
    .from("conversation_summaries")
    .select("conversation_id, summary")
    .in("conversation_id", conversationIds);

  if (error || !data) {
    if (error) {
      console.error("[Conversation] Failed to fetch summaries:", error.message);
    }
    return new Map();
  }

  return new Map((data as SummaryRow[]).map((row) => [row.conversation_id, row.summary]));
}

async function getMessagesForConversationIds(
  conversationIds: string[],
  messageLimit = DEFAULT_MESSAGES_LIMIT,
): Promise<Map<string, ChatMessage[]>> {
  if (conversationIds.length === 0) return new Map();

  const { data, error } = await supabase
    .from("conversation_messages")
    .select("conversation_id, role, content, metadata, tokens_used, created_at")
    .in("conversation_id", conversationIds)
    .order("created_at", { ascending: true })
    .limit(Math.max(messageLimit * conversationIds.length, messageLimit));

  if (error) {
    throw new Error(`Erro ao buscar mensagens: ${error.message}`);
  }

  const grouped = new Map<string, ChatMessage[]>();
  for (const row of (data || []) as Array<MessageRow & { conversation_id: string }>) {
    const bucket = grouped.get(row.conversation_id) || [];
    bucket.push(mapMessage(row));
    grouped.set(row.conversation_id, bucket);
  }

  return grouped;
}

function mapConversationRow(row: ConversationRow, summary?: string | null, messages: ChatMessage[] = []): Conversation {
  return {
    id: row.id,
    user_id: row.user_id,
    tenant_id: row.tenant_id || null,
    title: row.title || null,
    created_at: row.created_at,
    updated_at: row.updated_at,
    last_message_preview: row.last_message_preview || null,
    last_message_at: row.last_message_at || null,
    message_count: row.message_count || messages.length,
    summary: summary || null,
    messages,
  };
}

function mapConversationListItem(row: ConversationRow, summary?: string | null): ConversationListItem {
  return {
    id: row.id,
    user_id: row.user_id,
    tenant_id: row.tenant_id || null,
    title: row.title || null,
    created_at: row.created_at,
    updated_at: row.updated_at,
    last_message_preview: row.last_message_preview || null,
    last_message_at: row.last_message_at || null,
    message_count: row.message_count || 0,
    summary: summary || null,
  };
}

async function findConversationRow(
  conversationId: string,
  userId: string,
  tenantId?: string,
): Promise<ConversationRow | null> {
  let query = supabase
    .from("conversations")
    .select("id, user_id, tenant_id, title, created_at, updated_at, last_message_preview, last_message_at, message_count")
    .eq("id", conversationId)
    .eq("user_id", userId)
    .limit(1);

  if (tenantId) {
    query = query.eq("tenant_id", tenantId);
  }

  const { data, error } = await query.maybeSingle();
  if (error) {
    throw new Error(`Erro ao buscar conversa: ${error.message}`);
  }

  return (data as ConversationRow | null) || null;
}

export async function getOrCreateConversation(userId: string, tenantId?: string): Promise<Conversation> {
  let query = supabase
    .from("conversations")
    .select("id, user_id, tenant_id, title, created_at, updated_at, last_message_preview, last_message_at, message_count")
    .eq("user_id", userId)
    .order("last_message_at", { ascending: false, nullsFirst: false })
    .order("updated_at", { ascending: false })
    .limit(1);

  if (tenantId) {
    query = query.eq("tenant_id", tenantId);
  }

  const { data: existing, error } = await query.maybeSingle();
  if (existing && !error) {
    const [summaryMap, messagesMap] = await Promise.all([
      getSummariesByConversationIds([existing.id]),
      getMessagesForConversationIds([existing.id], DEFAULT_MESSAGES_LIMIT),
    ]);

    return mapConversationRow(
      existing as ConversationRow,
      summaryMap.get(existing.id) || null,
      messagesMap.get(existing.id) || [],
    );
  }

  const insertData: Record<string, unknown> = { user_id: userId };
  if (tenantId) insertData.tenant_id = tenantId;

  const { data: created, error: createError } = await supabase
    .from("conversations")
    .insert(insertData)
    .select("id, user_id, tenant_id, title, created_at, updated_at, last_message_preview, last_message_at, message_count")
    .single();

  if (createError || !created) {
    throw new Error(`Erro ao criar conversa: ${createError?.message}`);
  }

  return mapConversationRow(created as ConversationRow, null, []);
}

export async function getConversationById(
  conversationId: string,
  userId: string,
  tenantId?: string,
): Promise<Conversation | null> {
  const conversation = await findConversationRow(conversationId, userId, tenantId);
  if (!conversation) return null;

  const [summaryMap, messagesMap] = await Promise.all([
    getSummariesByConversationIds([conversation.id]),
    getMessagesForConversationIds([conversation.id], DEFAULT_MESSAGES_LIMIT),
  ]);

  return mapConversationRow(
    conversation,
    summaryMap.get(conversation.id) || null,
    messagesMap.get(conversation.id) || [],
  );
}

export async function addMessage(
  conversationId: string,
  userId: string,
  tenantId: string,
  message: ChatMessage,
): Promise<void> {
  const conversation = await findConversationRow(conversationId, userId, tenantId);
  if (!conversation) {
    throw new Error("Conversa nao encontrada ou sem permissao.");
  }

  const { error } = await supabase
    .from("conversation_messages")
    .insert({
      conversation_id: conversationId,
      tenant_id: tenantId,
      user_id: userId,
      role: message.role,
      content: message.content,
      metadata: message.metadata || {},
      tokens_used: message.tokens_used ?? null,
      created_at: message.timestamp || new Date().toISOString(),
    });

  if (error) {
    throw new Error(`Erro ao salvar mensagem: ${error.message}`);
  }
}

export async function updateConversationTitle(
  conversationId: string,
  userId: string,
  tenantId: string,
  title: string,
): Promise<void> {
  const { error } = await supabase
    .from("conversations")
    .update({ title, updated_at: new Date().toISOString() })
    .eq("id", conversationId)
    .eq("user_id", userId)
    .eq("tenant_id", tenantId);

  if (error) {
    console.error(`Erro ao atualizar titulo da conversa: ${error.message}`);
  }
}

export async function getConversationHistory(
  userId: string,
  options: {
    tenantId?: string;
    limit?: number;
    offset?: number;
    query?: string;
  } = {},
): Promise<ConversationHistoryPage> {
  const limit = Math.min(Math.max(options.limit || DEFAULT_HISTORY_LIMIT, 1), 100);
  const offset = Math.max(options.offset || 0, 0);

  let query = supabase
    .from("conversations")
    .select(
      "id, user_id, tenant_id, title, created_at, updated_at, last_message_preview, last_message_at, message_count",
      { count: "exact" },
    )
    .eq("user_id", userId)
    .order("last_message_at", { ascending: false, nullsFirst: false })
    .order("updated_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (options.tenantId) {
    query = query.eq("tenant_id", options.tenantId);
  }

  if (options.query) {
    const safeQuery = options.query.trim().replace(/[,%]/g, " ");
    if (safeQuery.length > 0) {
      query = query.or(`title.ilike.%${safeQuery}%,last_message_preview.ilike.%${safeQuery}%`);
    }
  }

  const { data, error, count } = await query;
  if (error) {
    throw new Error(`Erro ao buscar historico: ${error.message}`);
  }

  const rows = (data || []) as ConversationRow[];
  const summaryMap = await getSummariesByConversationIds(rows.map((row) => row.id));

  const items = rows.map((row) => mapConversationListItem(row, summaryMap.get(row.id) || null));
  const total = count || items.length;

  return {
    items,
    total,
    has_more: offset + items.length < total,
  };
}

export async function clearConversation(
  conversationId: string,
  userId: string,
  tenantId?: string,
): Promise<void> {
  let query = supabase
    .from("conversations")
    .delete()
    .eq("id", conversationId)
    .eq("user_id", userId);

  if (tenantId) {
    query = query.eq("tenant_id", tenantId);
  }

  const { error } = await query;
  if (error) {
    throw new Error(`Erro ao deletar conversa: ${error.message}`);
  }
}

export async function startNewConversation(userId: string, tenantId?: string): Promise<Conversation> {
  const insertData: Record<string, unknown> = { user_id: userId, title: "Nova Conversa" };
  if (tenantId) insertData.tenant_id = tenantId;

  const { data, error } = await supabase
    .from("conversations")
    .insert(insertData)
    .select("id, user_id, tenant_id, title, created_at, updated_at, last_message_preview, last_message_at, message_count")
    .single();

  if (error || !data) {
    throw new Error(`Erro ao criar nova conversa: ${error?.message}`);
  }

  return mapConversationRow(data as ConversationRow, null, []);
}
