import { Request, Response, NextFunction } from "express";
import { AuditService } from "../services/audit";

/**
 * Middleware: requires a specific permission to be present in user profile.
 * Must be used AFTER requireAuth.
 */
export function requirePermission(permissionName: string) {
    return (req: Request, res: Response, next: NextFunction): void => {
        if (!req.user) {
            res.status(401).json({ success: false, error: "Usuário não autenticado" });
            return;
        }

        // Master always has all permissions
        if (req.user.role === "master") {
            return next();
        }

        const hasPerm = !!req.user.permissions?.[permissionName];

        if (!hasPerm) {
            // Log access denial to audit
            void AuditService.log({
                userId: req.user.id,
                action: "access.denied",
                resource: permissionName,
                details: {
                    message: `Tentativa de acesso sem permissão: ${permissionName}`,
                    path: req.originalUrl,
                    method: req.method,
                },
                ipAddress: req.auditInfo?.ip || req.socket.remoteAddress || "",
            });

            res.status(403).json({
                success: false,
                error: `Acesso negado. Permissão necessária: ${permissionName}`,
            });
            return;
        }

        next();
    };
}

/**
 * Middleware: requires at least one of the provided permissions.
 */
export function requireAnyPermission(permissionNames: string[]) {
    return (req: Request, res: Response, next: NextFunction): void => {
        if (!req.user) {
            res.status(401).json({ success: false, error: "Usuário não autenticado" });
            return;
        }

        if (req.user.role === "master") {
            return next();
        }

        const hasAny = permissionNames.some((p) => !!req.user?.permissions?.[p]);

        if (!hasAny) {
            // Log access denial to audit
            void AuditService.log({
                userId: req.user.id,
                action: "access.denied",
                resource: permissionNames.join(", "),
                details: {
                    message: `Tentativa de acesso sem nenhuma das permissões: ${permissionNames.join(", ")}`,
                    path: req.originalUrl,
                    method: req.method,
                },
                ipAddress: req.auditInfo?.ip || req.socket.remoteAddress || "",
            });

            res.status(403).json({
                success: false,
                error: "Acesso negado. Você não tem permissão para esta ação.",
            });
            return;
        }

        next();
    };
}
