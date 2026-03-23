import { Request, Response, NextFunction } from "express";
import { isFeatureEnabled } from "../constants/feature-flags";

/**
 * Middleware: requires a specific feature to be enabled for the user's tenant.
 * Master role always bypasses. Missing flags fall back to the feature default.
 */
export function requireFeature(featureKey: string) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ success: false, error: "Não autenticado" });
      return;
    }

    // Master always bypasses feature flags
    if (req.user.role === "master") return next();
    const isEnabled = isFeatureEnabled(featureKey, req.user.enabled_features);

    if (!isEnabled) {
      res.status(403).json({
        success: false,
        error: "Funcionalidade não disponível para sua empresa",
      });
      return;
    }

    next();
  };
}
