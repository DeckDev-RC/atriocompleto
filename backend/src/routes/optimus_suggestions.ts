import express from "express";
import { ProactiveSuggestionsService } from "../services/optimus/proactiveSuggestions";
import { requireAuth } from "../middleware/auth";
import { requirePermission } from "../middleware/rbac";

const router = express.Router();

router.use(requireAuth);
router.use(requirePermission('acessar_agente'));

// GET /api/optimus/suggestions
router.get("/suggestions", async (req: any, res: any) => {
  try {
    const tenantId = req.user!.tenant_id;
    if (!tenantId) {
      return res.status(403).json({ success: false, error: "Vincule uma empresa para visualizar as sugestões." });
    }

    const suggestions = await ProactiveSuggestionsService.getSuggestions(tenantId);
    res.json({ success: true, data: { suggestions } });
  } catch (err: any) {
    console.error("[Optimus GET /suggestions] Error:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/optimus/suggestions/generate
router.post("/suggestions/generate", async (req: any, res: any) => {
  try {
    const tenantId = req.user!.tenant_id;
    if (!tenantId) {
      return res.status(403).json({ success: false, error: "Vincule uma empresa para gerar sugestões." });
    }

    const suggestions = await ProactiveSuggestionsService.generateDailySuggestions(tenantId);
    res.json({ success: true, data: { suggestions } });
  } catch (err: any) {
    console.error("[Optimus POST /suggestions/generate] Error:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// PATCH /api/optimus/suggestions/:id/status
router.patch("/suggestions/:id/status", async (req: any, res: any) => {
  try {
    const tenantId = req.user!.tenant_id;
    if (!tenantId) {
      return res.status(403).json({ success: false, error: "Vincule uma empresa para atualizar sugestões." });
    }

    const { id } = req.params;
    const { status } = req.body; // e.g., 'accepted' or 'dismissed'

    if (!["accepted", "dismissed"].includes(status)) {
      return res.status(400).json({ success: false, error: "Invalid status" });
    }

    const ok = await ProactiveSuggestionsService.markSuggestionStatus(id, tenantId, status);
    res.json({ success: true, data: { success: ok } });
  } catch (err: any) {
    console.error("[Optimus PATCH /suggestions/:id/status] Error:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
