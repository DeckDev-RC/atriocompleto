import { supabase } from "../config/supabase";
import { ChatMessage, Conversation } from "../types";

const MAX_HISTORY_MESSAGES = 20;

export async function getOrCreateConversation(userId: string, tenantId?: string): Promise<Conversation> {
  const { data: existing, error } = await supabase
    .from("conversations")
    .select("*")
    .eq("user_id", userId)
    .order("updated_at", { ascending: false })
    .limit(1)
    .single();

  if (existing && !error) {
    return existing as Conversation;
  }

  const insertData: Record<string, unknown> = { user_id: userId, messages: [] };
  if (tenantId) insertData.tenant_id = tenantId;

  const { data: created, error: createError } = await supabase
    .from("conversations")
    .insert(insertData)
    .select()
    .single();

  if (createError || !created) {
    throw new Error(`Erro ao criar conversa: ${createError?.message}`);
  }

  return created as Conversation;
}

export async function addMessage(conversationId: string, message: ChatMessage): Promise<void> {
  const { data, error: fetchError } = await supabase
    .from("conversations")
    .select("messages")
    .eq("id", conversationId)
    .single();

  if (fetchError || !data) {
    throw new Error(`Erro ao buscar conversa: ${fetchError?.message}`);
  }

  const messages = [...(data.messages as ChatMessage[]), message];
  const trimmed = messages.slice(-MAX_HISTORY_MESSAGES);

  const { error } = await supabase
    .from("conversations")
    .update({ messages: trimmed, updated_at: new Date().toISOString() })
    .eq("id", conversationId);

  if (error) {
    throw new Error(`Erro ao salvar mensagem: ${error.message}`);
  }
}

export async function getConversationHistory(userId: string): Promise<Conversation[]> {
  const { data, error } = await supabase
    .from("conversations")
    .select("*")
    .eq("user_id", userId)
    .order("updated_at", { ascending: false })
    .limit(10);

  if (error) {
    throw new Error(`Erro ao buscar histórico: ${error.message}`);
  }

  return (data || []) as Conversation[];
}

export async function clearConversation(conversationId: string, userId: string): Promise<void> {
  const { error } = await supabase
    .from("conversations")
    .delete()
    .eq("id", conversationId)
    .eq("user_id", userId);

  if (error) {
    throw new Error(`Erro ao deletar conversa: ${error.message}`);
  }
}

export async function startNewConversation(userId: string, tenantId?: string): Promise<Conversation> {
  const insertData: Record<string, unknown> = { user_id: userId, messages: [] };
  if (tenantId) insertData.tenant_id = tenantId;

  const { data, error } = await supabase
    .from("conversations")
    .insert(insertData)
    .select()
    .single();

  if (error || !data) {
    throw new Error(`Erro ao criar nova conversa: ${error?.message}`);
  }

  return data as Conversation;
}
