import { supabase } from "../config/supabase";
import { ChatMessage, Conversation } from "../types";

const MAX_HISTORY_MESSAGES = 20; // Keep last N messages for context

export async function getOrCreateConversation(userId: string): Promise<Conversation> {
  // Try to get the most recent active conversation
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

  // Create new conversation
  const { data: created, error: createError } = await supabase
    .from("conversations")
    .insert({
      user_id: userId,
      messages: [],
    })
    .select()
    .single();

  if (createError || !created) {
    throw new Error(`Erro ao criar conversa: ${createError?.message}`);
  }

  return created as Conversation;
}

export async function addMessage(
  conversationId: string,
  message: ChatMessage
): Promise<void> {
  // Fetch current messages
  const { data, error: fetchError } = await supabase
    .from("conversations")
    .select("messages")
    .eq("id", conversationId)
    .single();

  if (fetchError || !data) {
    throw new Error(`Erro ao buscar conversa: ${fetchError?.message}`);
  }

  const messages = [...(data.messages as ChatMessage[]), message];

  // Trim to max history
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
  // Actually delete the conversation, not just clear messages
  const { error } = await supabase
    .from("conversations")
    .delete()
    .eq("id", conversationId)
    .eq("user_id", userId);

  if (error) {
    throw new Error(`Erro ao deletar conversa: ${error.message}`);
  }
}

export async function startNewConversation(userId: string): Promise<Conversation> {
  const { data, error } = await supabase
    .from("conversations")
    .insert({ user_id: userId, messages: [] })
    .select()
    .single();

  if (error || !data) {
    throw new Error(`Erro ao criar nova conversa: ${error?.message}`);
  }

  return data as Conversation;
}
