import { Request, Response, NextFunction } from "express";

/**
 * Middleware: requires a specific feature to be enabled for the user's tenant.
 * Master role always bypasses. Empty enabled_features = all enabled (backwards-compatible).
 */
export function requireFeature(featureKey: string) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ success: false, error: "Não autenticado" });
      return;
    }

    // Master always bypasses feature flags
    if (req.user.role === "master") return next();

    const flags = req.user.enabled_features || {};
    // Empty object = all features enabled (backwards-compatible)
    const isEnabled = Object.keys(flags).length === 0 || flags[featureKey] !== false;

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
