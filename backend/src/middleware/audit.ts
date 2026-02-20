import { Request, Response, NextFunction } from "express";

declare global {
    namespace Express {
        interface Request {
            auditInfo?: {
                ip: string;
                userAgent: string;
            };
        }
    }
}

export const auditMiddleware = (req: Request, _res: Response, next: NextFunction) => {
    req.auditInfo = {
        ip: (req.headers["x-forwarded-for"] as string) || req.socket.remoteAddress || "",
        userAgent: req.headers["user-agent"] || "",
    };
    next();
};
