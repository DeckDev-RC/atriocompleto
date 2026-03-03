import { Router, Request, Response } from "express";
import { z } from "zod";
import { processMessage, processMessageStream } from "../services/aiAnalysis.service";
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
import { aiLimiter } from "../middleware/rate-limit";
import { AutoInsightsService } from "../services/autoInsights.service";

const router = Router();

// All chat routes require authentication + acessar_agente permission
router.use(requireAuth);
router.use(requirePermission('acessar_agente'));
router.use(aiLimiter);

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
  stream: z.boolean().optional(), // Added for explicit stream request
});

const handleMessage = async (req: Request, res: Response) => {
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

    // Check if streaming is requested
    const isAnalyzeEndpoint = req.path === "/analyze";
    const wantsStream = isAnalyzeEndpoint || req.headers.accept === "text/event-stream" || req.body.stream === true;

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

    if (wantsStream) {
      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");

      let fullText = "";
      let tokenUsage: any = null;
      let suggestions: string[] = [];

      const stream = processMessageStream(message, history, tenantId || undefined);

      for await (const event of stream) {
        if (event.type === "text") {
          fullText += event.content;
          res.write(`data: ${JSON.stringify({ type: "text", content: event.content })}\n\n`);
        } else if (event.type === "action") {
          res.write(`data: ${JSON.stringify({ type: "action", content: event.content })}\n\n`);
        } else if (event.type === "done") {
          tokenUsage = event.tokenUsage;
          suggestions = event.suggestions || [];
          res.write(`data: ${JSON.stringify({ type: "done", conversation_id: conversation.id, tokenUsage, suggestions })}\n\n`);
        } else if (event.type === "error") {
          res.write(`data: ${JSON.stringify({ type: "error", content: event.content })}\n\n`);
        }
        // flush for compression if middleware is used
        if ((res as any).flush) (res as any).flush();
      }

      // Save assistant message at the end
      if (fullText) {
        const assistantMsg: ChatMessage = {
          role: "assistant",
          content: fullText,
          timestamp: new Date().toISOString(),
          // We can't easily save action/suggestions in basic ChatMessage type yet, 
          // but we save the text content.
        };
        await addMessage(conversation.id, assistantMsg);
      }

      res.end();
      return;
    }

    // Standard non-streaming response
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
    if (!res.headersSent) {
      res.status(500).json({
        success: false,
        error: "Erro ao processar mensagem. Tente novamente.",
      });
    } else {
      res.write(`data: ${JSON.stringify({ type: "error", content: "Erro fatal no processamento." })}\n\n`);
      res.end();
    }
  }
};

router.post("/message", handleMessage);
router.post("/analyze", handleMessage);

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

// ── GET /api/ai/daily-insights ──────────────────────────
// Retorna os insights gerados proativamente pela IA
router.get("/daily-insights", async (req: Request, res: Response) => {
  try {
    const tenantId = req.user!.tenant_id;
    if (!tenantId) {
      return res.status(403).json({ success: false, error: "Empresa não vinculada." });
    }

    const insights = await AutoInsightsService.getLatestInsights(tenantId);
    res.json({ success: true, data: insights });
  } catch (error) {
    console.error("Erro ao buscar insights diários:", error);
    res.status(500).json({ success: false, error: "Erro ao buscar insights" });
  }
});

// ── PATCH /api/ai/insights/:id ──────────────────────────
// Atualiza o status de um insight (visto, resolvido, etc)
router.patch("/insights/:id", async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const { status } = req.body;
    const tenantId = req.user!.tenant_id;

    if (!tenantId) return res.status(403).json({ success: false, error: "Acesso negado." });
    if (!status) return res.status(400).json({ success: false, error: "Status obrigatório." });

    await AutoInsightsService.updateStatus(id, tenantId, status);
    res.json({ success: true });
  } catch (error) {
    console.error("Erro ao atualizar insight:", error);
    res.status(500).json({ success: false, error: "Erro ao atualizar insight" });
  }
});

// ── GET /api/ai/insights/history ────────────────────────
// Retorna o historico de insights com filtros e paginacao
router.get("/insights/history", async (req: Request, res: Response) => {
  try {
    const tenantId = req.user!.tenant_id;
    if (!tenantId) return res.status(403).json({ success: false, error: "Acesso negado." });

    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const category = req.query.category as string;
    const priority = req.query.priority as string;

    const result = await AutoInsightsService.getHistory(tenantId, { page, limit, category, priority });
    res.json({ success: true, data: result });
  } catch (error) {
    console.error("Erro ao buscar histórico de insights:", error);
    res.status(500).json({ success: false, error: "Erro ao buscar histórico" });
  }
});

// ── POST /api/ai/insights/:id/action ──────────────────────
// Executa uma ação sugerida por um insight
router.post("/insights/:id/action", async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const { action, params } = req.body;
    const tenantId = req.user!.tenant_id;

    if (!tenantId) return res.status(403).json({ success: false, error: "Acesso negado." });
    if (!action) return res.status(400).json({ success: false, error: "Ação obrigatória." });

    const result = await AutoInsightsService.executeAction(id, tenantId, action, params);
    res.json({ success: true, data: result });
  } catch (error: any) {
    console.error("Erro ao executar ação do insight:", error);
    res.status(500).json({ success: false, error: error.message || "Erro ao executar ação" });
  }
});

/**
 * GET /api/ai/patterns
 * Returns correlation and patterns data.
 */
router.get('/patterns', async (req: any, res: any) => {
  try {
    const tenantId = req.user.tenant_id;
    const period_days = parseInt(req.query.days as string) || 30;

    const [rfmRaw, correlationRaw, basketRaw] = await Promise.all([
      queryFunctions.getRFMAnalysis({ _tenant_id: tenantId } as any),
      queryFunctions.getMetricCorrelation({ _tenant_id: tenantId, period_days } as any),
      queryFunctions.marketBasketLite({ _tenant_id: tenantId, limit: 10 } as any)
    ]);

    // Transform RFM
    const rfmCustomers = (rfmRaw as any).data || [];
    const rfmSegments: Record<string, number> = {};
    rfmCustomers.forEach((c: any) => {
      rfmSegments[c.segment] = (rfmSegments[c.segment] || 0) + 1;
    });
    const rfm = {
      total_customers: rfmCustomers.length,
      segments: Object.entries(rfmSegments).map(([segment, count]) => ({ segment, count }))
    };

    // Transform Basket
    const basket = ((basketRaw as any).data || []).map((p: any) => ({
      item_a: p.product_a,
      item_b: p.product_b,
      frequency: p.frequency
    }));

    res.json({
      success: true,
      data: { rfm, correlation: correlationRaw, basket }
    });
  } catch (error) {
    console.error("Erro ao buscar padrões:", error);
    res.status(500).json({ success: false, error: "Erro interno" });
  }
});


/**
 * GET /api/ai/segments
 * Returns smart segments (Churn/Upsell).
 */
router.get('/segments', async (req: any, res: any) => {
  try {
    const tenantId = req.user.tenant_id;
    const result = await queryFunctions.getSmartSegments({ _tenant_id: tenantId, limit: 20 } as any);
    // Expose internal .data directly to match PatternDiscoveryPage destructuring
    res.json({ success: true, data: (result as any).data || result });
  } catch (error) {
    console.error("Erro ao buscar segmentos:", error);
    res.status(500).json({ success: false, error: "Erro interno" });
  }
});

export default router;
