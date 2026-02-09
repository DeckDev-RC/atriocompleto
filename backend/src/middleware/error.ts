import { Request, Response, NextFunction } from "express";
import { env } from "../config/env";

export function errorHandler(err: Error, req: Request, res: Response, _next: NextFunction): void {
  const requestId = req.headers["x-request-id"] || Date.now().toString();

  console.error(`[${new Date().toISOString()}] [${requestId}] ERROR:`, {
    message: err.message,
    stack: env.NODE_ENV === "development" ? err.stack : undefined,
    path: req.path,
    method: req.method,
  });

  res.status(500).json({
    success: false,
    error: env.NODE_ENV === "development" ? err.message : "Erro interno do servidor",
  });
}
