import { Router, Request, Response } from "express";
import { z } from "zod";
import { processMessage } from "../services/agent";
import { queryFunctions } from "../services/query-functions";
import {
  getOrCreateConversation,
  addMessage,
  getConversationHistory,
  clearConversation,
  startNewConversation,
} from "../services/conversation";
import { ChatMessage } from "../types";
import { requireAuth } from "../middleware/auth";
import { requirePermission } from "../middleware/rbac";

const router = Router();

// All chat routes require authentication + acessar_agente permission
router.use(requireAuth);
router.use(requirePermission('acessar_agente'));

// ── GET /api/chat/health-check ──────────────────────────
// Executa healthCheck diretamente sem Gemini — rápido e sem custo de tokens
router.get("/health-check", async (req: Request, res: Response) => {
  try {
    const tenantId = req.user!.tenant_id;
    if (!tenantId) {
      return res.status(403).json({ success: false, error: "Vincule uma empresa para usar o diagnóstico rápido." });
    }
    const result = await queryFunctions.healthCheck({ _tenant_id: tenantId } as unknown as Record<string, unknown>);
    const r = result as {
      alerts: Array<{ type: string; message: string }>;
      summary: Record<string, unknown> | null;
    };

    const icons: Record<string, string> = { danger: "🔴", warning: "⚠️", success: "🟢", info: "ℹ️" };
    const fBRL = (v: number) => "R$ " + v.toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 0 });

    let text = "## 🩺 Diagnóstico Rápido\n\n";
    r.alerts.forEach((a) => { text += icons[a.type] + " " + a.message + "\n\n"; });

    if (r.summary) {
      text += "---\n";
      text += `📊 **Mês atual (${r.summary.current_month}):** ${fBRL((r.summary.revenue_so_far as number) || 0)} em ${r.summary.days_passed} dias | ${((r.summary.orders_so_far as number) || 0).toLocaleString("pt-BR")} pedidos | Faltam ${r.summary.days_remaining} dias`;
    }

    res.json({ success: true, data: { message: text, alerts: r.alerts, summary: r.summary } });
  } catch (error) {
    console.error("Erro no health-check:", error);
    res.status(500).json({ success: false, error: "Erro ao gerar diagnóstico" });
  }
});

// ── POST /api/chat/message ──────────────────────────────
const messageSchema = z.object({
  message: z.string().min(1).max(2000),
  conversation_id: z.string().uuid().optional(),
});

router.post("/message", async (req: Request, res: Response) => {
  try {
    const parsed = messageSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        success: false,
        error: "Mensagem inválida",
        details: parsed.error.flatten().fieldErrors,
      });
      return;
    }

    const userId = req.user!.id;
    const tenantId = req.user!.tenant_id;
    const { message } = parsed.data;

    if (!tenantId) {
      return res.status(403).json({ success: false, error: "Vincule uma empresa para usar o chat." });
    }

    // Get or create conversation
    const conversation = parsed.data.conversation_id
      ? { id: parsed.data.conversation_id, messages: [] as ChatMessage[], user_id: userId, created_at: "", updated_at: "" }
      : await getOrCreateConversation(userId, tenantId || undefined);

    // Fetch full conversation if ID was provided
    let history: ChatMessage[] = conversation.messages || [];
    if (parsed.data.conversation_id) {
      const convos = await getConversationHistory(userId);
      const found = convos.find((c) => c.id === parsed.data.conversation_id);
      if (found) history = found.messages;
    }

    // Save user message
    const userMsg: ChatMessage = {
      role: "user",
      content: message,
      timestamp: new Date().toISOString(),
    };
    await addMessage(conversation.id, userMsg);

    // Process with AI agent
    const aiResult = await processMessage(message, history, tenantId || undefined);

    // Save assistant message
    const assistantMsg: ChatMessage = {
      role: "assistant",
      content: aiResult.text,
      timestamp: new Date().toISOString(),
    };
    await addMessage(conversation.id, assistantMsg);

    res.json({
      success: true,
      data: {
        message: aiResult.text,
        conversation_id: conversation.id,
        tokenUsage: aiResult.tokenUsage,
        suggestions: aiResult.suggestions,
      },
    });
  } catch (error) {
    console.error("Erro no chat:", error);
    res.status(500).json({
      success: false,
      error: "Erro ao processar mensagem. Tente novamente.",
    });
  }
});

// ── GET /api/chat/history ───────────────────────────────
router.get("/history", async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const tenantId = req.user!.tenant_id;

    if (!tenantId) {
      return res.json({ success: true, data: [] });
    }

    const conversations = await getConversationHistory(userId);

    res.json({
      success: true,
      data: conversations,
    });
  } catch (error) {
    console.error("Erro ao buscar histórico:", error);
    res.status(500).json({ success: false, error: "Erro ao buscar histórico" });
  }
});

// ── POST /api/chat/new ──────────────────────────────────
router.post("/new", async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const tenantId = req.user!.tenant_id;

    if (!tenantId) {
      return res.status(403).json({ success: false, error: "Vincule uma empresa para iniciar novas conversas." });
    }

    const conversation = await startNewConversation(userId, tenantId);

    res.json({
      success: true,
      data: conversation,
    });
  } catch (error) {
    console.error("Erro ao criar conversa:", error);
    res.status(500).json({ success: false, error: "Erro ao criar nova conversa" });
  }
});

// ── DELETE /api/chat/:id ────────────────────────────────
router.delete("/:id", async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const tenantId = req.user!.tenant_id;
    const conversationId = req.params.id as string;

    await clearConversation(conversationId, userId);

    res.json({ success: true });
  } catch (error) {
    console.error("Erro ao limpar conversa:", error);
    res.status(500).json({ success: false, error: "Erro ao limpar conversa" });
  }
});

export default router;
