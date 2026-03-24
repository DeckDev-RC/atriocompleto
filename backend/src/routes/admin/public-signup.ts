import { Router, Request, Response } from "express";
import { z } from "zod";
import { AuditService } from "../../services/audit";
import {
  getPublicSignupAdminView,
  updatePublicSignupSettings,
} from "../../services/publicSignup";

const router = Router();

const updateSchema = z.object({
  enabled: z.boolean(),
});

router.get("/", async (_req: Request, res: Response) => {
  try {
    const data = await getPublicSignupAdminView();
    res.json({ success: true, data });
  } catch (error) {
    console.error("[Admin] Public signup get error:", error);
    res.status(500).json({ success: false, error: "Erro ao carregar configuracao do cadastro publico" });
  }
});

router.put("/", async (req: Request, res: Response) => {
  try {
    const parsed = updateSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        success: false,
        error: "Dados invalidos",
        details: parsed.error.flatten().fieldErrors,
      });
      return;
    }

    const data = await updatePublicSignupSettings({
      enabled: parsed.data.enabled,
    });

    res.json({ success: true, data });

    void AuditService.log({
      userId: req.user!.id,
      action: "public_signup.update",
      resource: "public_signup_settings",
      entityId: "default",
      ipAddress: req.auditInfo?.ip,
      userAgent: req.auditInfo?.userAgent,
      details: {
        next: {
          enabled: data.enabled,
        },
      },
    });
  } catch (error) {
    console.error("[Admin] Public signup update error:", error);
    const message = error instanceof Error
      ? error.message
      : "Erro ao salvar configuracao do cadastro publico";
    res.status(400).json({ success: false, error: message });
  }
});

export default router;
