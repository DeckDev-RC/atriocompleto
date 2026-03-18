import multer from "multer";
import { Router, Request, Response } from "express";
import { z } from "zod";
import { env } from "../config/env";
import { requireAuth } from "../middleware/auth";
import { requirePermission } from "../middleware/rbac";
import { aiLimiter, aiReadLimiter } from "../middleware/rate-limit";
import { ProductAnalyzer, OptimusFilters, ProductSortField, ProductTrend } from "../services/optimus/productAnalyzer";
import { ProactiveSuggestionsService, SuggestionStatus } from "../services/optimus/proactiveSuggestions";
import { FileProcessor } from "../services/optimus/fileProcessor";

const router = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: env.OPTIMUS_UPLOAD_MAX_MB * 1024 * 1024,
    files: env.OPTIMUS_UPLOAD_MAX_FILES,
  },
});

const booleanish = z.preprocess((value) => {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["true", "1", "yes", "y", "on"].includes(normalized)) return true;
    if (["false", "0", "no", "n", "off"].includes(normalized)) return false;
  }
  return undefined;
}, z.boolean().optional());

const numberish = z.preprocess((value) => {
  if (value === undefined || value === null || value === "") return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : value;
}, z.number().optional());

const sortFieldSchema = z.enum([
  "name",
  "sale_price",
  "stock_level",
  "margin_percent",
  "last_sale_at",
  "days_since_last_sale",
  "units_sold_30d",
  "revenue_90d",
  "stock_coverage_days",
] satisfies [ProductSortField, ...ProductSortField[]]);

const trendSchema = z.enum([
  "accelerating",
  "stable",
  "decelerating",
] satisfies [ProductTrend, ...ProductTrend[]]);

const filtersSchema = z.object({
  productId: z.string().uuid().optional(),
  nameSearch: z.string().trim().min(1).max(200).optional(),
  category: z.string().trim().min(1).max(120).optional(),
  sku: z.string().trim().min(1).max(120).optional(),
  minPrice: numberish,
  maxPrice: numberish,
  minMargin: numberish,
  maxMargin: numberish,
  lowStock: booleanish,
  outOfStock: booleanish,
  excessStock: booleanish,
  stockBelow: numberish,
  stockAbove: numberish,
  withoutSalesDays: numberish,
  trend: trendSchema.optional(),
  includeHealth: booleanish,
  includeSummary: booleanish,
  includeSimilar: booleanish,
  sortBy: sortFieldSchema.optional(),
  sortOrder: z.enum(["asc", "desc"]).optional(),
  limit: numberish,
  offset: numberish,
});

const suggestionStatusSchema = z.object({
  status: z.enum(["accepted", "dismissed"] satisfies [SuggestionStatus, SuggestionStatus]),
});

const uploadBodySchema = z.object({
  conversation_id: z.string().uuid().optional(),
});

const fileAskSchema = z.object({
  question: z.string().min(1).max(2000),
  file_ids: z.array(z.string().uuid()).min(1).max(env.OPTIMUS_UPLOAD_MAX_FILES),
  conversation_id: z.string().uuid().optional(),
});

const filesQuerySchema = z.object({
  conversation_id: z.string().uuid().optional(),
  limit: numberish,
});

function parseFilters(raw: unknown, tenantId: string): OptimusFilters {
  const parsed = filtersSchema.safeParse(raw || {});
  if (!parsed.success) {
    throw new z.ZodError(parsed.error.issues);
  }

  return {
    ...parsed.data,
    tenantId,
  };
}

router.use(requireAuth);
router.use(requirePermission("acessar_agente"));

router.post("/upload-file", aiLimiter, upload.array("files", env.OPTIMUS_UPLOAD_MAX_FILES), async (req: Request, res: Response) => {
  try {
    const tenantId = req.user!.tenant_id;
    const userId = req.user!.id;

    if (!tenantId) {
      return res.status(403).json({ success: false, error: "Vincule uma empresa para usar o Optimus." });
    }

    const parsed = uploadBodySchema.safeParse(req.body || {});
    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        error: "Payload invalido",
        details: parsed.error.flatten().fieldErrors,
      });
    }

    const files = (req.files || []) as Express.Multer.File[];
    const uploaded = await FileProcessor.uploadFiles({
      files: files.map((file) => ({
        originalname: file.originalname,
        mimetype: file.mimetype,
        size: file.size,
        buffer: file.buffer,
      })),
      userId,
      tenantId,
      conversationId: parsed.data.conversation_id || null,
    });

    return res.json({
      success: true,
      data: {
        files: uploaded,
      },
    });
  } catch (error) {
    console.error("[Optimus] Upload file error:", error);
    return res.status(400).json({
      success: false,
      error: error instanceof Error ? error.message : "Erro ao enviar arquivo",
    });
  }
});

router.get("/files", aiReadLimiter, async (req: Request, res: Response) => {
  try {
    const tenantId = req.user!.tenant_id;
    const userId = req.user!.id;
    if (!tenantId) {
      return res.status(403).json({ success: false, error: "Vincule uma empresa para usar o Optimus." });
    }

    const parsed = filesQuerySchema.safeParse(req.query || {});
    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        error: "Filtros invalidos",
        details: parsed.error.flatten().fieldErrors,
      });
    }

    const files = await FileProcessor.listFiles({
      userId,
      tenantId,
      conversationId: parsed.data.conversation_id || null,
      limit: parsed.data.limit || 30,
    });

    return res.json({ success: true, data: { files } });
  } catch (error) {
    console.error("[Optimus] List files error:", error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : "Erro ao listar arquivos",
    });
  }
});

router.get("/files/:id", aiReadLimiter, async (req: Request, res: Response) => {
  try {
    const tenantId = req.user!.tenant_id;
    const userId = req.user!.id;
    if (!tenantId) {
      return res.status(403).json({ success: false, error: "Vincule uma empresa para usar o Optimus." });
    }

    const file = await FileProcessor.getFileById({
      fileId: String(req.params.id),
      userId,
      tenantId,
    });

    if (!file) {
      return res.status(404).json({ success: false, error: "Arquivo nao encontrado" });
    }

    return res.json({ success: true, data: file });
  } catch (error) {
    console.error("[Optimus] File detail error:", error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : "Erro ao buscar arquivo",
    });
  }
});

router.get("/files/:id/download", aiReadLimiter, async (req: Request, res: Response) => {
  try {
    const tenantId = req.user!.tenant_id;
    const userId = req.user!.id;
    if (!tenantId) {
      return res.status(403).json({ success: false, error: "Vincule uma empresa para usar o Optimus." });
    }

    const { url } = await FileProcessor.getSignedDownloadUrl({
      fileId: String(req.params.id),
      userId,
      tenantId,
    });

    return res.json({
      success: true,
      data: { url },
    });
  } catch (error) {
    console.error("[Optimus] Download URL error:", error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : "Erro ao gerar download",
    });
  }
});

router.delete("/files/:id", aiLimiter, async (req: Request, res: Response) => {
  try {
    const tenantId = req.user!.tenant_id;
    const userId = req.user!.id;
    if (!tenantId) {
      return res.status(403).json({ success: false, error: "Vincule uma empresa para usar o Optimus." });
    }

    await FileProcessor.deleteFile({
      fileId: String(req.params.id),
      userId,
      tenantId,
    });

    return res.json({ success: true });
  } catch (error) {
    console.error("[Optimus] Delete file error:", error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : "Erro ao deletar arquivo",
    });
  }
});

router.post("/files/ask", aiLimiter, async (req: Request, res: Response) => {
  try {
    const tenantId = req.user!.tenant_id;
    const userId = req.user!.id;
    if (!tenantId) {
      return res.status(403).json({ success: false, error: "Vincule uma empresa para usar o Optimus." });
    }

    const parsed = fileAskSchema.safeParse(req.body || {});
    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        error: "Payload invalido",
        details: parsed.error.flatten().fieldErrors,
      });
    }

    if (parsed.data.conversation_id) {
      await FileProcessor.attachFilesToConversation({
        fileIds: parsed.data.file_ids,
        conversationId: parsed.data.conversation_id,
        userId,
        tenantId,
      });
    }

    const result = await FileProcessor.askAboutFiles({
      question: parsed.data.question,
      fileIds: parsed.data.file_ids,
      userId,
      tenantId,
      conversationId: parsed.data.conversation_id,
    });

    return res.json({ success: true, data: result });
  } catch (error) {
    console.error("[Optimus] Ask files error:", error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : "Erro ao analisar arquivos",
    });
  }
});

router.post("/analyze", aiLimiter, async (req: Request, res: Response) => {
  try {
    const tenantId = req.user!.tenant_id;
    if (!tenantId) {
      return res.status(403).json({ success: false, error: "Vincule uma empresa para usar o Optimus." });
    }

    const filters = parseFilters(req.body, tenantId);
    const result = await ProductAnalyzer.queryProducts(filters);

    return res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        success: false,
        error: "Filtros invalidos",
        details: error.flatten().fieldErrors,
      });
    }

    console.error("[Optimus] Analyze error:", error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : "Erro ao analisar produtos",
    });
  }
});

router.get("/health", aiReadLimiter, async (req: Request, res: Response) => {
  try {
    const tenantId = req.user!.tenant_id;
    if (!tenantId) {
      return res.status(403).json({ success: false, error: "Vincule uma empresa para usar o Optimus." });
    }

    const filters = parseFilters(req.query, tenantId);
    const summary = await ProductAnalyzer.getInventoryHealth(tenantId, filters);

    return res.json({
      success: true,
      data: summary,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        success: false,
        error: "Filtros invalidos",
        details: error.flatten().fieldErrors,
      });
    }

    console.error("[Optimus] Health error:", error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : "Erro ao carregar saude do estoque",
    });
  }
});

router.get("/products/:id", aiReadLimiter, async (req: Request, res: Response) => {
  try {
    const tenantId = req.user!.tenant_id;
    if (!tenantId) {
      return res.status(403).json({ success: false, error: "Vincule uma empresa para usar o Optimus." });
    }

    const result = await ProductAnalyzer.queryProducts({
      tenantId,
      productId: String(req.params.id),
      limit: 1,
      includeSummary: true,
      includeSimilar: false,
    });

    if (result.products.length === 0) {
      return res.status(404).json({ success: false, error: "Produto nao encontrado" });
    }

    return res.json({
      success: true,
      data: result.products[0],
      summary: result.summary,
      recommendations: result.recommendations,
    });
  } catch (error) {
    console.error("[Optimus] Product detail error:", error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : "Erro ao buscar produto",
    });
  }
});

router.get("/suggestions", aiReadLimiter, async (_req: Request, res: Response) => {
  try {
    const tenantId = _req.user!.tenant_id;
    if (!tenantId) {
      return res.status(403).json({ success: false, error: "Vincule uma empresa para usar o Optimus." });
    }

    const suggestions = await ProactiveSuggestionsService.getSuggestions(tenantId);
    return res.json({ success: true, data: { suggestions } });
  } catch (error) {
    console.error("[Optimus] Suggestions error:", error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : "Erro ao buscar sugestoes",
    });
  }
});

router.post("/suggestions/generate", aiLimiter, async (req: Request, res: Response) => {
  try {
    const tenantId = req.user!.tenant_id;
    if (!tenantId) {
      return res.status(403).json({ success: false, error: "Vincule uma empresa para usar o Optimus." });
    }

    const suggestions = await ProactiveSuggestionsService.generateDailySuggestions(tenantId);
    return res.json({ success: true, data: { suggestions } });
  } catch (error) {
    console.error("[Optimus] Generate suggestions error:", error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : "Erro ao gerar sugestoes",
    });
  }
});

router.patch("/suggestions/:id/status", aiLimiter, async (req: Request, res: Response) => {
  try {
    const tenantId = req.user!.tenant_id;
    if (!tenantId) {
      return res.status(403).json({ success: false, error: "Vincule uma empresa para usar o Optimus." });
    }

    const parsed = suggestionStatusSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        error: "Status invalido",
        details: parsed.error.flatten().fieldErrors,
      });
    }

    const success = await ProactiveSuggestionsService.markSuggestionStatus(
      String(req.params.id),
      tenantId,
      parsed.data.status,
    );

    if (!success) {
      return res.status(404).json({ success: false, error: "Sugestao nao encontrada" });
    }

    return res.json({ success: true });
  } catch (error) {
    console.error("[Optimus] Update suggestion status error:", error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : "Erro ao atualizar sugestao",
    });
  }
});

router.post("/suggestions/:id/action", aiLimiter, async (req: Request, res: Response) => {
  try {
    const tenantId = req.user!.tenant_id;
    if (!tenantId) {
      return res.status(403).json({ success: false, error: "Vincule uma empresa para usar o Optimus." });
    }

    const result = await ProactiveSuggestionsService.executeSuggestionAction(String(req.params.id), tenantId);
    return res.json({ success: true, data: result });
  } catch (error) {
    console.error("[Optimus] Execute suggestion action error:", error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : "Erro ao executar sugestao",
    });
  }
});

router.post("/export", aiReadLimiter, async (req: Request, res: Response) => {
  try {
    const tenantId = req.user!.tenant_id;
    if (!tenantId) {
      return res.status(403).json({ success: false, error: "Vincule uma empresa para usar o Optimus." });
    }

    const filters = parseFilters(req.body, tenantId);
    const params = new URLSearchParams();

    Object.entries(filters).forEach(([key, value]) => {
      if (value === undefined || value === null || key === "tenantId") return;
      params.append(key, String(value));
    });

    return res.json({
      success: true,
      data: {
        downloadUrl: `/api/optimus/export.csv?${params.toString()}`,
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        success: false,
        error: "Filtros invalidos",
        details: error.flatten().fieldErrors,
      });
    }

    console.error("[Optimus] Export link error:", error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : "Erro ao preparar exportacao",
    });
  }
});

router.get("/export.csv", aiReadLimiter, async (req: Request, res: Response) => {
  try {
    const tenantId = req.user!.tenant_id;
    if (!tenantId) {
      return res.status(403).json({ success: false, error: "Vincule uma empresa para usar o Optimus." });
    }

    const filters = parseFilters(req.query, tenantId);
    const result = await ProductAnalyzer.exportProductsCsv(filters);

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename=${result.filename}`);
    return res.send(result.csv);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        success: false,
        error: "Filtros invalidos",
        details: error.flatten().fieldErrors,
      });
    }

    console.error("[Optimus] Export error:", error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : "Erro ao exportar produtos",
    });
  }
});

export default router;
