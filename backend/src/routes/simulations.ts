import { Router, Request, Response } from "express";
import { z } from "zod";
import { requireAuth } from "../middleware/auth";
import { requirePermission } from "../middleware/rbac";
import { aiLimiter, aiReadLimiter } from "../middleware/rate-limit";
import { ScenarioSimulationService } from "../services/scenarioSimulation.service";
import { MarketplaceCalculatorService } from "../services/marketplaceCalculator.service";
import { CalculatorSnapshotsService } from "../services/calculatorSnapshots.service";

const router = Router();

const calculatorTypeSchema = z.enum(["taxes", "prices"]);
const calculatorSnapshotSchema = z.object({
  calculator_type: calculatorTypeSchema,
  name: z.string().trim().min(2).max(120),
  payload: z.record(z.unknown()),
});

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

// GET /api/simulations/calculator-snapshots?calculator_type=taxes|prices
router.get("/calculator-snapshots", async (req: Request, res: Response) => {
    try {
        const tenantId = req.user!.tenant_id;
        if (!tenantId) return res.status(403).json({ success: false, error: "Empresa não vinculada." });

        const parsed = calculatorTypeSchema.safeParse(req.query.calculator_type);
        if (!parsed.success) {
            return res.status(400).json({ success: false, error: "Tipo de calculadora inválido." });
        }

        const data = await CalculatorSnapshotsService.listSnapshots({
            tenantId,
            userId: req.user!.id,
            calculatorType: parsed.data,
        });

        return res.json({ success: true, data });
    } catch (error: any) {
        console.error("Erro ao listar snapshots da calculadora:", error);
        return res.status(500).json({ success: false, error: error.message || "Erro interno" });
    }
});

// POST /api/simulations/calculator-snapshots
router.post("/calculator-snapshots", async (req: Request, res: Response) => {
    try {
        const tenantId = req.user!.tenant_id;
        if (!tenantId) return res.status(403).json({ success: false, error: "Empresa não vinculada." });

        const parsed = calculatorSnapshotSchema.safeParse(req.body);
        if (!parsed.success) {
            return res.status(400).json({
                success: false,
                error: "Payload inválido",
                details: parsed.error.flatten().fieldErrors,
            });
        }

        const data = await CalculatorSnapshotsService.createSnapshot({
            tenantId,
            userId: req.user!.id,
            calculatorType: parsed.data.calculator_type,
            name: parsed.data.name,
            payload: parsed.data.payload,
        });

        return res.status(201).json({ success: true, data });
    } catch (error: any) {
        console.error("Erro ao salvar snapshot da calculadora:", error);
        return res.status(400).json({ success: false, error: error.message || "Erro interno" });
    }
});

// DELETE /api/simulations/calculator-snapshots/:id
router.delete("/calculator-snapshots/:id", async (req: Request, res: Response) => {
    try {
        const tenantId = req.user!.tenant_id;
        if (!tenantId) return res.status(403).json({ success: false, error: "Empresa não vinculada." });

        await CalculatorSnapshotsService.deleteSnapshot({
            tenantId,
            userId: req.user!.id,
            id: String(req.params.id),
        });

        return res.json({ success: true });
    } catch (error: any) {
        console.error("Erro ao excluir snapshot da calculadora:", error);
        return res.status(400).json({ success: false, error: error.message || "Erro interno" });
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
