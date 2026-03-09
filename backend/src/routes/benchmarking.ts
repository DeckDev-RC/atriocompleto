import { Router, Request, Response } from "express";
import { z } from "zod";
import { requireAuth } from "../middleware/auth";
import { requirePermission } from "../middleware/rbac";
import { aiLimiter, aiReadLimiter } from "../middleware/rate-limit";
import { BenchmarkingService } from "../services/benchmarking.service";
import { IndustryBenchmarkingService } from "../services/industryBenchmarking.service";

const router = Router();

router.use(requireAuth);
router.use(requirePermission("acessar_agente"));

// ═══════════════════════════════════════════════════════════
// COMPETITORS CRUD
// ═══════════════════════════════════════════════════════════

const competitorSchema = z.object({
    name: z.string().min(1).max(200),
    website_url: z.string().url().optional().or(z.literal("")),
    category: z.enum(["direto", "indireto"]).optional(),
    region: z.string().max(200).optional(),
    notes: z.string().max(2000).optional(),
    is_active: z.boolean().optional(),
});

// GET /api/benchmarking/competitors
router.get("/competitors", aiReadLimiter, async (req: Request, res: Response) => {
    try {
        const tenantId = req.user!.tenant_id;
        if (!tenantId) return res.status(403).json({ success: false, error: "Empresa não vinculada." });

        const data = await BenchmarkingService.listCompetitors(tenantId);
        res.json({ success: true, data });
    } catch (error: any) {
        console.error("Erro ao listar concorrentes:", error);
        res.status(500).json({ success: false, error: error.message || "Erro interno" });
    }
});

// POST /api/benchmarking/competitors
router.post("/competitors", async (req: Request, res: Response) => {
    try {
        const tenantId = req.user!.tenant_id;
        if (!tenantId) return res.status(403).json({ success: false, error: "Empresa não vinculada." });

        const parsed = competitorSchema.safeParse(req.body);
        if (!parsed.success) {
            return res.status(400).json({ success: false, error: "Dados inválidos", details: parsed.error.flatten().fieldErrors });
        }

        const data = await BenchmarkingService.createCompetitor(tenantId, parsed.data);
        res.status(201).json({ success: true, data });
    } catch (error: any) {
        console.error("Erro ao criar concorrente:", error);
        res.status(500).json({ success: false, error: error.message || "Erro interno" });
    }
});

// PUT /api/benchmarking/competitors/:id
router.put("/competitors/:id", async (req: Request, res: Response) => {
    try {
        const tenantId = req.user!.tenant_id;
        if (!tenantId) return res.status(403).json({ success: false, error: "Empresa não vinculada." });

        const parsed = competitorSchema.partial().safeParse(req.body);
        if (!parsed.success) {
            return res.status(400).json({ success: false, error: "Dados inválidos", details: parsed.error.flatten().fieldErrors });
        }

        const data = await BenchmarkingService.updateCompetitor(req.params.id as string, tenantId, parsed.data);
        res.json({ success: true, data });
    } catch (error: any) {
        console.error("Erro ao atualizar concorrente:", error);
        res.status(500).json({ success: false, error: error.message || "Erro interno" });
    }
});

// DELETE /api/benchmarking/competitors/:id
router.delete("/competitors/:id", async (req: Request, res: Response) => {
    try {
        const tenantId = req.user!.tenant_id;
        if (!tenantId) return res.status(403).json({ success: false, error: "Empresa não vinculada." });

        await BenchmarkingService.deleteCompetitor(req.params.id as string, tenantId);
        res.json({ success: true });
    } catch (error: any) {
        console.error("Erro ao deletar concorrente:", error);
        res.status(500).json({ success: false, error: error.message || "Erro interno" });
    }
});

// ═══════════════════════════════════════════════════════════
// PRODUCTS CRUD
// ═══════════════════════════════════════════════════════════

const productSchema = z.object({
    product_name: z.string().min(1).max(300),
    your_product_name: z.string().max(300).optional(),
    current_price: z.number().min(0).optional(),
    your_price: z.number().min(0).optional(),
});

// GET /api/benchmarking/competitors/:id/products
router.get("/competitors/:id/products", aiReadLimiter, async (req: Request, res: Response) => {
    try {
        const tenantId = req.user!.tenant_id;
        if (!tenantId) return res.status(403).json({ success: false, error: "Empresa não vinculada." });

        const data = await BenchmarkingService.listProducts(tenantId, req.params.id as string);
        res.json({ success: true, data });
    } catch (error: any) {
        console.error("Erro ao listar produtos:", error);
        res.status(500).json({ success: false, error: error.message || "Erro interno" });
    }
});

// POST /api/benchmarking/competitors/:id/products
router.post("/competitors/:id/products", async (req: Request, res: Response) => {
    try {
        const tenantId = req.user!.tenant_id;
        if (!tenantId) return res.status(403).json({ success: false, error: "Empresa não vinculada." });

        const parsed = productSchema.safeParse(req.body);
        if (!parsed.success) {
            return res.status(400).json({ success: false, error: "Dados inválidos", details: parsed.error.flatten().fieldErrors });
        }

        const data = await BenchmarkingService.addProduct(tenantId, req.params.id as string, parsed.data);
        res.status(201).json({ success: true, data });
    } catch (error: any) {
        console.error("Erro ao adicionar produto:", error);
        res.status(500).json({ success: false, error: error.message || "Erro interno" });
    }
});

// PUT /api/benchmarking/products/:id
router.put("/products/:id", async (req: Request, res: Response) => {
    try {
        const tenantId = req.user!.tenant_id;
        if (!tenantId) return res.status(403).json({ success: false, error: "Empresa não vinculada." });

        const parsed = productSchema.partial().safeParse(req.body);
        if (!parsed.success) {
            return res.status(400).json({ success: false, error: "Dados inválidos", details: parsed.error.flatten().fieldErrors });
        }

        const data = await BenchmarkingService.updateProduct(req.params.id as string, tenantId, parsed.data);
        res.json({ success: true, data });
    } catch (error: any) {
        console.error("Erro ao atualizar produto:", error);
        res.status(500).json({ success: false, error: error.message || "Erro interno" });
    }
});

// DELETE /api/benchmarking/products/:id
router.delete("/products/:id", async (req: Request, res: Response) => {
    try {
        const tenantId = req.user!.tenant_id;
        if (!tenantId) return res.status(403).json({ success: false, error: "Empresa não vinculada." });

        await BenchmarkingService.deleteProduct(req.params.id as string, tenantId);
        res.json({ success: true });
    } catch (error: any) {
        console.error("Erro ao deletar produto:", error);
        res.status(500).json({ success: false, error: error.message || "Erro interno" });
    }
});

// ═══════════════════════════════════════════════════════════
// PRICE HISTORY & COMPARISON
// ═══════════════════════════════════════════════════════════

// GET /api/benchmarking/products/:id/price-history
router.get("/products/:id/price-history", aiReadLimiter, async (req: Request, res: Response) => {
    try {
        const data = await BenchmarkingService.getPriceHistory(req.params.id as string);
        res.json({ success: true, data });
    } catch (error: any) {
        console.error("Erro ao buscar histórico:", error);
        res.status(500).json({ success: false, error: error.message || "Erro interno" });
    }
});

// GET /api/benchmarking/comparison
router.get("/comparison", aiReadLimiter, async (req: Request, res: Response) => {
    try {
        const tenantId = req.user!.tenant_id;
        if (!tenantId) return res.status(403).json({ success: false, error: "Empresa não vinculada." });

        const data = await BenchmarkingService.getComparison(tenantId);
        res.json({ success: true, data });
    } catch (error: any) {
        console.error("Erro ao gerar comparação:", error);
        res.status(500).json({ success: false, error: error.message || "Erro interno" });
    }
});

// GET /api/benchmarking/alerts
router.get("/alerts", aiReadLimiter, async (req: Request, res: Response) => {
    try {
        const tenantId = req.user!.tenant_id;
        if (!tenantId) return res.status(403).json({ success: false, error: "Empresa não vinculada." });

        const data = await BenchmarkingService.getAlerts(tenantId);
        res.json({ success: true, data });
    } catch (error: any) {
        console.error("Erro ao buscar alertas:", error);
        res.status(500).json({ success: false, error: error.message || "Erro interno" });
    }
});

// ═══════════════════════════════════════════════════════════
// SWOT ANALYSIS (Gemini)
// ═══════════════════════════════════════════════════════════

// POST /api/benchmarking/swot
router.post("/swot", aiLimiter, async (req: Request, res: Response) => {
    try {
        const tenantId = req.user!.tenant_id;
        if (!tenantId) return res.status(403).json({ success: false, error: "Empresa não vinculada." });

        const data = await BenchmarkingService.generateSWOT(tenantId);
        res.json({ success: true, data });
    } catch (error: any) {
        console.error("Erro ao gerar SWOT:", error);
        res.status(500).json({ success: false, error: error.message || "Erro interno" });
    }
});

// GET /api/benchmarking/swot
router.get("/swot", aiReadLimiter, async (req: Request, res: Response) => {
    try {
        const tenantId = req.user!.tenant_id;
        if (!tenantId) return res.status(403).json({ success: false, error: "Empresa não vinculada." });

        const data = await BenchmarkingService.getLatestSWOT(tenantId);
        res.json({ success: true, data });
    } catch (error: any) {
        console.error("Erro ao buscar SWOT:", error);
        res.status(500).json({ success: false, error: error.message || "Erro interno" });
    }
});

// ═══════════════════════════════════════════════════════════
// INDUSTRY BENCHMARKING (Sector Comparison)
// ═══════════════════════════════════════════════════════════

// GET /api/benchmarking/industry
router.get("/industry", aiReadLimiter, async (req: Request, res: Response) => {
    try {
        const tenantId = req.user!.tenant_id;
        if (!tenantId) return res.status(403).json({ success: false, error: "Empresa não vinculada." });

        const data = await IndustryBenchmarkingService.getIndustryComparison(tenantId);
        res.json({ success: true, data });
    } catch (error: any) {
        console.error("Erro ao buscar comparação setorial:", error);
        res.status(500).json({ success: false, error: error.message || "Erro interno" });
    }
});

// POST /api/benchmarking/industry/analysis
router.post("/industry/analysis", aiLimiter, async (req: Request, res: Response) => {
    try {
        const tenantId = req.user!.tenant_id;
        if (!tenantId) return res.status(403).json({ success: false, error: "Empresa não vinculada." });

        const data = await IndustryBenchmarkingService.generateGapAnalysis(tenantId);
        res.json({ success: true, data });
    } catch (error: any) {
        console.error("Erro ao gerar análise setorial:", error);
        res.status(500).json({ success: false, error: error.message || "Erro interno" });
    }
});

// GET /api/benchmarking/industry/latest
router.get("/industry/latest", aiReadLimiter, async (req: Request, res: Response) => {
    try {
        const tenantId = req.user!.tenant_id;
        if (!tenantId) return res.status(403).json({ success: false, error: "Empresa não vinculada." });

        const data = await IndustryBenchmarkingService.getLatestAnalysis(tenantId);
        res.json({ success: true, data });
    } catch (error: any) {
        console.error("Erro ao buscar análise setorial:", error);
        res.status(500).json({ success: false, error: error.message || "Erro interno" });
    }
});

export default router;
