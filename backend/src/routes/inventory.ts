import { Router, Request, Response } from "express";
import { requireAuth } from "../middleware/auth";
import { aiLimiter } from "../middleware/rate-limit";
import { runInventorySimulation } from "../services/inventoryOptimization.service";

const router = Router();
router.use(requireAuth);

router.post("/run", aiLimiter, async (req: Request, res: Response) => {
    try {
        const tenantId = req.user!.tenant_id;
        if (!tenantId) return res.status(403).json({ success: false, error: "Empresa não vinculada." });

        const params = req.body;

        // Basic validation
        if (!params.averageDemand || !params.demandStdDev || !params.leadTimeDays || !params.orderCost || !params.holdingCostPercent || !params.unitCost || !params.shortageCost || !params.serviceLevelTarget) {
            return res.status(400).json({ success: false, error: "Parâmetros incompletos para simulação de estoque." });
        }

        const data = await runInventorySimulation(params, tenantId);
        res.json({ success: true, data });
    } catch (error: any) {
        console.error("Erro na simulação de estoque:", error);
        res.status(500).json({ success: false, error: error.message || "Erro interno na simulação" });
    }
});

export default router;
