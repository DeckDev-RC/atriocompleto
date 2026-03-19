import { Router, Request, Response } from "express";
import { requireAuth } from "../middleware/auth";
import { requirePermission } from "../middleware/rbac";
import { aiLimiter, aiReadLimiter } from "../middleware/rate-limit";
import { ScenarioSimulationService } from "../services/scenarioSimulation.service";
import { MarketplaceCalculatorService } from "../services/marketplaceCalculator.service";

const router = Router();

// Middleware
router.use(requireAuth);
// Opcional: router.use(requirePermission("acessar_simulacoes")); // Se existir a role, ou usa uma geral
router.use(requirePermission("acessar_agente")); // Usando acesso ao agente por enquanto

// GET /api/simulations/baseline
router.get("/baseline", aiReadLimiter, async (req: Request, res: Response) => {
    try {
        const tenantId = req.user!.tenant_id;
        if (!tenantId) return res.status(403).json({ success: false, error: "Empresa não vinculada." });

        const data = await ScenarioSimulationService.getBaseline(tenantId);
        res.json({ success: true, data });
    } catch (error: any) {
        console.error("Erro ao buscar baseline de simulação:", error);
        res.status(500).json({ success: false, error: error.message || "Erro interno" });
    }
});

// POST /api/simulations/analysis
router.post("/analysis", aiLimiter, async (req: Request, res: Response) => {
    try {
        const tenantId = req.user!.tenant_id;
        if (!tenantId) return res.status(403).json({ success: false, error: "Empresa não vinculada." });

        const { scenario_data, baseline, projected } = req.body;
        if (!scenario_data || !baseline || !projected) {
            return res.status(400).json({ success: false, error: "Dados incompletos para análise." });
        }

        const data = await ScenarioSimulationService.generateAnalysis(tenantId, { scenario_data, baseline, projected });
        res.json({ success: true, data });
    } catch (error: any) {
        console.error("Erro ao gerar análise do cenário:", error);
        res.status(500).json({ success: false, error: error.message || "Erro interno" });
    }
});

// POST /api/simulations/marketplace-description
router.post("/marketplace-description", aiLimiter, async (req: Request, res: Response) => {
    try {
        const { product_name, marketplace, category, keywords, features } = req.body ?? {};

        if (!product_name || typeof product_name !== "string" || !product_name.trim()) {
            return res.status(400).json({ success: false, error: "Nome do produto é obrigatório." });
        }

        const data = await MarketplaceCalculatorService.generateDescriptions({
            productName: product_name.trim(),
            marketplace: typeof marketplace === "string" ? marketplace.trim() : "",
            category: typeof category === "string" ? category.trim() : "",
            keywords: typeof keywords === "string" ? keywords.trim() : "",
            features: typeof features === "string" ? features.trim() : "",
        });

        res.json({ success: true, data });
    } catch (error: any) {
        console.error("Erro ao gerar descrições da calculadora:", error);
        res.status(500).json({ success: false, error: error.message || "Erro interno" });
    }
});

// GET /api/simulations
router.get("/", aiReadLimiter, async (req: Request, res: Response) => {
    try {
        const tenantId = req.user!.tenant_id;
        if (!tenantId) return res.status(403).json({ success: false, error: "Empresa não vinculada." });

        const data = await ScenarioSimulationService.listScenarios(tenantId);
        res.json({ success: true, data });
    } catch (error: any) {
        console.error("Erro ao listar simulações:", error);
        res.status(500).json({ success: false, error: error.message || "Erro interno" });
    }
});

// POST /api/simulations
router.post("/", async (req: Request, res: Response) => {
    try {
        const tenantId = req.user!.tenant_id;
        if (!tenantId) return res.status(403).json({ success: false, error: "Empresa não vinculada." });

        const { name, scenario_data, baseline_metrics, projected_metrics, ai_analysis } = req.body;
        if (!name || !scenario_data || !baseline_metrics || !projected_metrics) {
            return res.status(400).json({ success: false, error: "Dados incompletos para salvar." });
        }

        const data = await ScenarioSimulationService.saveScenario(tenantId, {
            name,
            scenario_data,
            baseline_metrics,
            projected_metrics,
            ai_analysis
        });

        res.status(201).json({ success: true, data });
    } catch (error: any) {
        console.error("Erro ao salvar simulação:", error);
        res.status(500).json({ success: false, error: error.message || "Erro interno" });
    }
});

// DELETE /api/simulations/:id
router.delete("/:id", async (req: Request, res: Response) => {
    try {
        const tenantId = req.user!.tenant_id;
        if (!tenantId) return res.status(403).json({ success: false, error: "Empresa não vinculada." });

        await ScenarioSimulationService.deleteScenario(tenantId, req.params.id as string);
        res.json({ success: true });
    } catch (error: any) {
        console.error("Erro ao deletar simulação:", error);
        res.status(500).json({ success: false, error: error.message || "Erro interno" });
    }
});

export default router;
