import { genai, GEMINI_MODEL } from "../../config/gemini";
import { env } from "../../config/env";
import { redis } from "../../config/redis";
import { supabaseAdmin } from "../../config/supabase";
import { ChatMessage } from "../../types";
import { AuditService } from "../audit";
import { ExtractionResult, parseMemoryExtractionResponse } from "./memory-extraction-utils";

const SESSION_KEY_PREFIX = "optimus:session";
const MAX_TRANSCRIPT_CHARS = 24_000;
const RELATED_ITEMS_SCAN_LIMIT = 100;

type SessionMessage = Pick<ChatMessage, "role" | "content" | "timestamp">;

interface SessionState {
  conversation_id: string;
  messages: SessionMessage[];
  summary?: string;
  last_active_at: string;
}

interface ConversationSummaryRow {
  conversation_id: string;
  summary: string;
  updated_at: string;
}

interface MemoryRow {
  id: string;
  scope: "user" | "tenant";
  memory_type: "preference" | "fact" | "decision" | "file_reference" | "context";
  memory_key: string;
  summary: string;
  value_json: Record<string, unknown> | null;
  relevance_score: number;
  confidence_score: number;
  access_count: number;
  updated_at: string;
  last_accessed_at: string | null;
  source_conversation_id: string | null;
  user_id: string | null;
}

interface RelevantItem<T> {
  item: T;
  score: number;
}

function getSessionKey(userId: string, tenantId: string) {
  return `${SESSION_KEY_PREFIX}:${tenantId}:${userId}:current`;
}

function normalizeText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenize(value: string): string[] {
  return normalizeText(value)
    .split(" ")
    .filter((token) => token.length >= 3);
}

function scoreText(query: string, source: string): number {
  const normalizedQuery = normalizeText(query);
  const normalizedSource = normalizeText(source);
  if (!normalizedQuery || !normalizedSource) return 0;

  let score = 0;
  if (normalizedSource.includes(normalizedQuery)) {
    score += 40;
  }

  const queryTokens = tokenize(normalizedQuery);
  if (queryTokens.length === 0) return score;

  for (const token of queryTokens) {
    if (normalizedSource.includes(token)) {
      score += 12;
    }
  }

  return score;
}

function recencyBoost(dateValue?: string | null): number {
  if (!dateValue) return 0;
  const ageMs = Date.now() - new Date(dateValue).getTime();
  const ageDays = ageMs / 86_400_000;
  if (ageDays <= 1) return 18;
  if (ageDays <= 7) return 12;
  if (ageDays <= 30) return 6;
  return 0;
}

function trimTranscript(messages: SessionMessage[]): string {
  let totalChars = 0;
  const lines: string[] = [];

  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i];
    const roleLabel = message.role === "assistant" ? "Optimus" : "Usuario";
    const line = `${roleLabel}: ${message.content}`;
    totalChars += line.length;
    if (totalChars > MAX_TRANSCRIPT_CHARS) break;
    lines.unshift(line);
  }

  return lines.join("\n");
}

async function callGeminiWithRetry<T>(
  fn: () => Promise<T>,
  label: string,
  maxRetries = 3,
): Promise<T> {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error: any) {
      const isRetryable =
        error?.status === 429 ||
        error?.status === 503 ||
        error?.message?.includes("429") ||
        error?.message?.includes("503") ||
        error?.message?.includes("UNAVAILABLE");

      if (!isRetryable || attempt === maxRetries - 1) throw error;

      const delay = 1000 * Math.pow(2, attempt) + Math.random() * 500;
      console.warn(`[${label}] Retry ${attempt + 1}/${maxRetries} after ${Math.round(delay)}ms`);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  throw new Error("Unreachable");
}

export class MemoryService {
  static async recordConversationActivity(params: {
    userId: string;
    tenantId: string;
    conversationId: string;
    message: SessionMessage;
  }): Promise<void> {
    const key = getSessionKey(params.userId, params.tenantId);
    const ttlSeconds = env.OPTIMUS_MEMORY_SESSION_TTL_HOURS * 3600;
    const maxMessages = env.OPTIMUS_MEMORY_SESSION_MAX_MESSAGES;

    let current: SessionState | null = null;
    try {
      const cached = await redis.get(key);
      if (cached) {
        current = JSON.parse(cached) as SessionState;
      }
    } catch (error) {
      console.warn("[MemoryService] Redis session read error:", error);
    }

    const nextState: SessionState = {
      conversation_id: params.conversationId,
      messages: current?.conversation_id === params.conversationId ? [...(current.messages || [])] : [],
      summary: current?.conversation_id === params.conversationId ? current.summary : undefined,
      last_active_at: new Date().toISOString(),
    };

    nextState.messages.push({
      role: params.message.role,
      content: params.message.content,
      timestamp: params.message.timestamp,
    });
    nextState.messages = nextState.messages.slice(-maxMessages);

    try {
      await redis.set(key, JSON.stringify(nextState), "EX", ttlSeconds);
    } catch (error) {
      console.warn("[MemoryService] Redis session write error:", error);
    }
  }

  static async updateSessionSummary(params: {
    userId: string;
    tenantId: string;
    conversationId: string;
    summary: string;
  }): Promise<void> {
    const key = getSessionKey(params.userId, params.tenantId);
    try {
      const cached = await redis.get(key);
      if (!cached) return;

      const current = JSON.parse(cached) as SessionState;
      if (current.conversation_id !== params.conversationId) return;

      current.summary = params.summary;
      current.last_active_at = new Date().toISOString();
      await redis.set(
        key,
        JSON.stringify(current),
        "EX",
        env.OPTIMUS_MEMORY_SESSION_TTL_HOURS * 3600,
      );
    } catch (error) {
      console.warn("[MemoryService] Redis session summary error:", error);
    }
  }

  static async buildPromptContext(params: {
    userId: string;
    tenantId: string;
    conversationId: string;
    query: string;
  }): Promise<string> {
    const [session, currentSummary, memories, relatedSummaries, relatedMessages] = await Promise.all([
      this.getSessionState(params.userId, params.tenantId),
      this.getConversationSummary(params.conversationId),
      this.findRelevantMemories(params),
      this.findRelevantConversationSummaries(params),
      this.findRelevantConversationMessages(params),
    ]);

    const sections: string[] = [];

    if (session && session.conversation_id === params.conversationId) {
      const transcript = trimTranscript(session.messages.slice(-8));
      if (transcript) {
        sections.push("CONTEXTO CURTO DA SESSAO ATIVA:");
        sections.push(transcript);
      }
      if (session.summary) {
        sections.push("RESUMO ACUMULADO DA SESSAO:");
        sections.push(`- ${session.summary}`);
      }
    }

    if (currentSummary) {
      sections.push("RESUMO DA CONVERSA ATUAL:");
      sections.push(`- ${currentSummary.summary}`);
      if (currentSummary.topics.length > 0) {
        sections.push(`- Topicos: ${currentSummary.topics.join(", ")}`);
      }
      if (currentSummary.decisions.length > 0) {
        sections.push(`- Decisoes: ${currentSummary.decisions.join(", ")}`);
      }
    }

    if (memories.length > 0) {
      sections.push("MEMORIAS RELEVANTES:");
      memories.forEach(({ item }) => {
        sections.push(
          `- [${item.scope}/${item.memory_type}] ${item.summary}`,
        );
      });
      void this.markMemoriesAccessed(memories.map(({ item }) => item.id));
    }

    if (relatedSummaries.length > 0) {
      sections.push("CONVERSAS RELACIONADAS:");
      relatedSummaries.forEach(({ item }) => {
        sections.push(`- ${item.summary}`);
      });
    }

    if (relatedMessages.length > 0) {
      sections.push("MENSAGENS ANTIGAS RELACIONADAS:");
      relatedMessages.forEach(({ item }) => {
        sections.push(`- ${item.content}`);
      });
    }

    return sections.join("\n");
  }

  static async refreshConversationArtifacts(params: {
    conversationId: string;
    userId: string;
    tenantId: string;
  }): Promise<void> {
    const messages = await this.getConversationMessages(params.conversationId);
    if (messages.length < env.OPTIMUS_MEMORY_SUMMARY_MIN_MESSAGES) {
      return;
    }

    const transcript = trimTranscript(messages.map((message) => ({
      role: message.role,
      content: message.content,
      timestamp: message.timestamp,
    })));

    if (!transcript) return;

    const prompt = `
Analise a conversa abaixo entre um usuario e o assistente Optimus.

Objetivo:
1. Gere um resumo curto e util para continuidade.
2. Extraia apenas memorias realmente duraveis e relevantes.
3. Prefira fatos explicitos, decisoes, preferencias operacionais e contexto de negocio.
4. Nao armazene numeros temporarios de relatorio diario, saudações ou pedidos passageiros.
5. Quando algo for claramente sobre a empresa toda, use scope "tenant". Preferencias individuais usam scope "user".

Retorne APENAS JSON valido com esta estrutura:
{
  "summary": "texto",
  "topics": ["..."],
  "decisions": ["..."],
  "memories": [
    {
      "scope": "user|tenant",
      "memory_type": "preference|fact|decision|context",
      "memory_key": "chave_estavel",
      "summary": "texto curto",
      "relevance_score": 0,
      "confidence_score": 0,
      "value_json": {}
    }
  ]
}

Conversa:
${transcript}
    `.trim();

    const response = await callGeminiWithRetry(
      () =>
        genai.models.generateContent({
          model: GEMINI_MODEL,
          contents: prompt,
          config: {
            temperature: 0.2,
            maxOutputTokens: 2048,
            responseMimeType: "application/json",
          },
        }),
      "MemoryExtraction",
    );

    const rawText = response.text || response.candidates?.[0]?.content?.parts?.map((part) => part.text || "").join("") || "";
    const extracted = parseMemoryExtractionResponse(rawText);
    if (!extracted) {
      console.error("[MemoryService] Failed to parse extraction payload", {
        rawLength: rawText.length,
        rawPreview: rawText.slice(0, 500),
      });
      return;
    }

    await Promise.all([
      this.upsertConversationSummary(params, extracted, messages.length),
      this.upsertExtractedMemories(params, extracted.memories),
      this.captureFileReferenceMemories(params),
      this.updateSessionSummary({
        userId: params.userId,
        tenantId: params.tenantId,
        conversationId: params.conversationId,
        summary: extracted.summary,
      }),
    ]);
  }

  static async cleanupExpiredConversationData(): Promise<void> {
    const cutoff = new Date(Date.now() - env.OPTIMUS_MEMORY_RETENTION_DAYS * 86_400_000).toISOString();

    const { error } = await supabaseAdmin
      .from("conversations")
      .delete()
      .lt("updated_at", cutoff);

    if (error) {
      console.error("[MemoryService] Failed to cleanup old conversations:", error.message);
    }
  }

  static async pruneStaleMemories(): Promise<void> {
    const staleCutoff = new Date(Date.now() - 180 * 86_400_000).toISOString();

    const { error } = await supabaseAdmin
      .from("optimus_memories")
      .delete()
      .eq("is_active", false)
      .lt("updated_at", staleCutoff);

    if (error) {
      console.error("[MemoryService] Failed to prune stale memories:", error.message);
    }
  }

  private static async getSessionState(userId: string, tenantId: string): Promise<SessionState | null> {
    try {
      const cached = await redis.get(getSessionKey(userId, tenantId));
      return cached ? (JSON.parse(cached) as SessionState) : null;
    } catch (error) {
      console.warn("[MemoryService] Redis get session error:", error);
      return null;
    }
  }

  private static async getConversationSummary(conversationId: string): Promise<{
    summary: string;
    topics: string[];
    decisions: string[];
  } | null> {
    const { data, error } = await supabaseAdmin
      .from("conversation_summaries")
      .select("summary, topics, decisions")
      .eq("conversation_id", conversationId)
      .maybeSingle();

    if (error || !data) return null;

    return {
      summary: String((data as any).summary || ""),
      topics: Array.isArray((data as any).topics) ? ((data as any).topics as string[]) : [],
      decisions: Array.isArray((data as any).decisions) ? ((data as any).decisions as string[]) : [],
    };
  }

  private static async getConversationMessages(conversationId: string): Promise<ChatMessage[]> {
    const { data, error } = await supabaseAdmin
      .from("conversation_messages")
      .select("role, content, metadata, tokens_used, created_at")
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: true })
      .limit(200);

    if (error) {
      throw new Error(`Erro ao buscar mensagens da conversa: ${error.message}`);
    }

    return ((data || []) as any[]).map((row) => ({
      role: row.role === "assistant" ? "assistant" : "user",
      content: String(row.content || ""),
      timestamp: String(row.created_at),
      metadata: (row.metadata as Record<string, unknown> | null) || undefined,
      tokens_used: row.tokens_used ? Number(row.tokens_used) : null,
    }));
  }

  private static async findRelevantMemories(params: {
    userId: string;
    tenantId: string;
    query: string;
  }): Promise<Array<RelevantItem<MemoryRow>>> {
    const { data, error } = await supabaseAdmin
      .from("optimus_memories")
      .select("id, scope, memory_type, memory_key, summary, value_json, relevance_score, confidence_score, access_count, updated_at, last_accessed_at, source_conversation_id, user_id")
      .eq("tenant_id", params.tenantId)
      .eq("is_active", true)
      .order("updated_at", { ascending: false })
      .limit(RELATED_ITEMS_SCAN_LIMIT);

    if (error || !data) {
      if (error) {
        console.error("[MemoryService] Failed to fetch memories:", error.message);
      }
      return [];
    }

    const relevant = (data as MemoryRow[])
      .filter((row) => row.scope === "tenant" || row.user_id === params.userId)
      .map((row) => {
        const searchable = `${row.memory_key} ${row.summary} ${JSON.stringify(row.value_json || {})}`;
        const score =
          scoreText(params.query, searchable) +
          row.relevance_score * 0.4 +
          Math.min(row.access_count, 10) +
          recencyBoost(row.last_accessed_at || row.updated_at);

        return { item: row, score };
      })
      .filter((row) => row.score > 20)
      .sort((a, b) => b.score - a.score)
      .slice(0, env.OPTIMUS_MEMORY_RECALL_LIMIT);

    return relevant;
  }

  private static async findRelevantConversationSummaries(params: {
    userId: string;
    tenantId: string;
    conversationId: string;
    query: string;
  }): Promise<Array<RelevantItem<ConversationSummaryRow>>> {
    const { data, error } = await supabaseAdmin
      .from("conversation_summaries")
      .select("conversation_id, summary, updated_at")
      .eq("tenant_id", params.tenantId)
      .eq("user_id", params.userId)
      .neq("conversation_id", params.conversationId)
      .order("updated_at", { ascending: false })
      .limit(RELATED_ITEMS_SCAN_LIMIT);

    if (error || !data) {
      return [];
    }

    return (data as ConversationSummaryRow[])
      .map((row) => ({
        item: row,
        score: scoreText(params.query, row.summary) + recencyBoost(row.updated_at),
      }))
      .filter((row) => row.score > 20)
      .sort((a, b) => b.score - a.score)
      .slice(0, 2);
  }

  private static async findRelevantConversationMessages(params: {
    userId: string;
    tenantId: string;
    conversationId: string;
    query: string;
  }): Promise<Array<RelevantItem<{ content: string }>>> {
    const { data, error } = await supabaseAdmin
      .from("conversation_messages")
      .select("content, created_at")
      .eq("tenant_id", params.tenantId)
      .eq("user_id", params.userId)
      .neq("conversation_id", params.conversationId)
      .order("created_at", { ascending: false })
      .limit(RELATED_ITEMS_SCAN_LIMIT);

    if (error || !data) {
      return [];
    }

    return (data as Array<{ content: string; created_at: string }>)
      .map((row) => ({
        item: { content: row.content },
        score: scoreText(params.query, row.content) + recencyBoost(row.created_at),
      }))
      .filter((row) => row.score > 24)
      .sort((a, b) => b.score - a.score)
      .slice(0, 2);
  }

  private static async markMemoriesAccessed(memoryIds: string[]): Promise<void> {
    if (memoryIds.length === 0) return;

    const { data, error } = await supabaseAdmin
      .from("optimus_memories")
      .select("id, access_count")
      .in("id", memoryIds);

    if (error || !data) return;

    await Promise.all(
      (data as Array<{ id: string; access_count: number | null }>).map((row) =>
        supabaseAdmin
          .from("optimus_memories")
          .update({
            access_count: (row.access_count || 0) + 1,
            last_accessed_at: new Date().toISOString(),
          })
          .eq("id", row.id),
      ),
    );
  }

  private static async upsertConversationSummary(
    params: { conversationId: string; userId: string; tenantId: string },
    extracted: ExtractionResult,
    messageCount: number,
  ): Promise<void> {
    const payload = {
      conversation_id: params.conversationId,
      tenant_id: params.tenantId,
      user_id: params.userId,
      summary: extracted.summary,
      topics: extracted.topics,
      decisions: extracted.decisions,
      message_count_covered: messageCount,
      updated_at: new Date().toISOString(),
    };

    const { error } = await supabaseAdmin
      .from("conversation_summaries")
      .upsert(payload, { onConflict: "conversation_id" });

    if (error) {
      console.error("[MemoryService] Failed to upsert conversation summary:", error.message);
      return;
    }

    void supabaseAdmin
      .from("conversations")
      .update({ updated_at: new Date().toISOString() })
      .eq("id", params.conversationId)
      .eq("tenant_id", params.tenantId)
      .eq("user_id", params.userId);
  }

  private static async upsertExtractedMemories(
    params: { conversationId: string; userId: string; tenantId: string },
    memories: ExtractionResult["memories"],
  ): Promise<void> {
    for (const memory of memories) {
      let existingQuery = supabaseAdmin
        .from("optimus_memories")
        .select("id, summary, value_json, relevance_score")
        .eq("tenant_id", params.tenantId)
        .eq("scope", memory.scope)
        .eq("memory_type", memory.memory_type)
        .eq("memory_key", memory.memory_key)
        .eq("is_active", true)
        .limit(1);

      if (memory.scope === "user") {
        existingQuery = existingQuery.eq("user_id", params.userId);
      } else {
        existingQuery = existingQuery.is("user_id", null);
      }

      const { data: existing } = await existingQuery.maybeSingle();
      const payload = {
        tenant_id: params.tenantId,
        user_id: memory.scope === "user" ? params.userId : null,
        scope: memory.scope,
        memory_type: memory.memory_type,
        memory_key: memory.memory_key,
        summary: memory.summary,
        value_json: memory.value_json,
        relevance_score: memory.relevance_score,
        confidence_score: memory.confidence_score,
        source_conversation_id: params.conversationId,
        created_by: params.userId,
        updated_by: params.userId,
        updated_at: new Date().toISOString(),
      };

      if (existing) {
        const { error } = await supabaseAdmin
          .from("optimus_memories")
          .update(payload)
          .eq("id", (existing as any).id);

        if (!error) {
          void AuditService.log({
            userId: params.userId,
            tenantId: params.tenantId,
            action: "optimus.memory.updated",
            resource: "optimus_memories",
            entityId: String((existing as any).id),
            details: {
              previous: {
                summary: (existing as any).summary,
                value_json: (existing as any).value_json,
                relevance_score: (existing as any).relevance_score,
              },
              next: payload,
            },
          });
        }
      } else {
        const { data, error } = await supabaseAdmin
          .from("optimus_memories")
          .insert(payload)
          .select("id")
          .single();

        if (!error && data) {
          void AuditService.log({
            userId: params.userId,
            tenantId: params.tenantId,
            action: "optimus.memory.created",
            resource: "optimus_memories",
            entityId: String((data as any).id),
            details: { next: payload },
          });
        }
      }
    }
  }

  private static async captureFileReferenceMemories(params: {
    conversationId: string;
    userId: string;
    tenantId: string;
  }): Promise<void> {
    const { data, error } = await supabaseAdmin
      .from("uploaded_files")
      .select("id, original_name, summary, mime_type, uploaded_at")
      .eq("conversation_id", params.conversationId)
      .eq("tenant_id", params.tenantId)
      .eq("user_id", params.userId)
      .neq("status", "deleted")
      .order("uploaded_at", { ascending: false })
      .limit(10);

    if (error || !data) return;

    for (const file of data as Array<Record<string, unknown>>) {
      const memoryKey = `file:${String(file.original_name || "").toLowerCase()}`;
      const existing = await supabaseAdmin
        .from("optimus_memories")
        .select("id")
        .eq("tenant_id", params.tenantId)
        .eq("user_id", params.userId)
        .eq("scope", "user")
        .eq("memory_type", "file_reference")
        .eq("memory_key", memoryKey)
        .eq("is_active", true)
        .limit(1)
        .maybeSingle();

      if (existing.data) continue;

      await supabaseAdmin.from("optimus_memories").insert({
        tenant_id: params.tenantId,
        user_id: params.userId,
        scope: "user",
        memory_type: "file_reference",
        memory_key: memoryKey,
        summary: `Arquivo anterior disponivel: ${String(file.original_name || "arquivo")}`,
        value_json: {
          file_id: file.id,
          original_name: file.original_name,
          mime_type: file.mime_type,
          uploaded_at: file.uploaded_at,
          summary: file.summary || null,
        },
        relevance_score: 70,
        confidence_score: 100,
        source_conversation_id: params.conversationId,
        created_by: params.userId,
        updated_by: params.userId,
      });
    }
  }
}
