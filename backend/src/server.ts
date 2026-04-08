import express from "express";
import cors from "cors";
import helmet from "helmet";
import compression from "compression";
import type { Socket } from "node:net";
import { globalLimiter, checkIPBlock } from "./middleware/rate-limit";

import { env } from "./config/env";
import { closeRedisClients } from "./config/redis";
import { setShuttingDown } from "./config/runtime-state";
import { setupDailyCrons, shutdownDailyCrons } from "./services/cron.service";
import { shutdownDashboardCache } from "./services/dashboard";
import { errorHandler } from "./middleware/error";
import { auditMiddleware } from "./middleware/audit";

import authRoutes from "./routes/auth";
import adminRoutes from "./routes/admin";
import userRoutes from "./routes/user";
import aiInsightsRoutes from "./routes/ai-insights";
import dashboardRoutes from "./routes/dashboard";
import healthRoutes from "./routes/health";
import auditRoutes from "./routes/audit";
import benchmarkingRoutes from "./routes/benchmarking";
import simulationsRoutes from "./routes/simulations";
import inventoryRoutes from "./routes/inventory";
import optimusSuggestionsRoutes from "./routes/optimus_suggestions";
import reportsRoutes from "./routes/reports";
import { shutdownFileProcessingQueue } from "./services/file-processing-queue";
import { shutdownMemoryProcessingQueue } from "./services/memory-processing-queue";
import { shutdownRateLimitQueue } from "./services/rate-limit-queue";
import { shutdownSSEClients } from "./services/sse";
import { shutdownReportExportsQueue } from "./jobs/reportExports.job";
import { shutdownScheduledReportsQueue } from "./jobs/scheduledReports.job";

const app = express();
app.set("trust proxy", 1); // Trust Easypanel/Traefik reverse proxy headers.

app.use(helmet());

const corsOptions: cors.CorsOptions = {
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);

    const configuredExtraOrigins = env.FRONTEND_URLS
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
    const normalizedHostname = (() => {
      try {
        return new URL(origin).hostname.toLowerCase();
      } catch {
        return "";
      }
    })();

    const allowedOrigins = [
      env.FRONTEND_URL,
      env.FRONTEND_URL.replace("https://", "http://"),
      ...configuredExtraOrigins,
    ];

    if (allowedOrigins.includes(origin) || normalizedHostname.endsWith(".agregarnegocios.com.br")) {
      callback(null, true);
    } else {
      console.warn(`CORS blocked origin: ${origin}`);
      callback(null, false);
    }
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "X-Client-Host"],
};

app.use(cors(corsOptions));
app.options("*", cors(corsOptions));

// Health endpoints must stay lightweight and avoid Redis-backed middleware.
app.use("/api/health", healthRoutes);

let isShuttingDown = false;
app.use((req, res, next) => {
  if (!isShuttingDown) {
    next();
    return;
  }

  if ((req.originalUrl || req.url || "").startsWith("/api/health")) {
    next();
    return;
  }

  res.setHeader("Connection", "close");
  res.status(503).json({
    success: false,
    error: "Servidor em desligamento controlado. Tente novamente em instantes.",
  });
});

app.use(checkIPBlock);
app.use(globalLimiter);

// Skip compression for SSE (text/event-stream) to prevent chunk corruption.
app.use(
  compression({
    filter: (_req, res) => {
      const contentType = res.getHeader("Content-Type");
      if (typeof contentType === "string" && contentType.includes("text/event-stream")) {
        return false;
      }
      return compression.filter(_req, res);
    },
  }),
);

app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: false, limit: "1mb" }));

app.use((_req, res, next) => {
  const originalJson = res.json.bind(res);
  res.json = (body: unknown) => {
    if (!res.getHeader("Content-Type")) {
      res.setHeader("Content-Type", "application/json; charset=utf-8");
    }
    return originalJson(body);
  };
  next();
});

app.use(auditMiddleware);

if (env.NODE_ENV !== "production") {
  app.use((req, _res, next) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
    next();
  });
}

app.use("/api/auth", authRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/user", userRoutes);
app.use("/api/dashboard", dashboardRoutes);
app.use("/api/ai", aiInsightsRoutes);
app.use("/api/chat", aiInsightsRoutes);
app.use("/api/audit-logs", auditRoutes);
app.use("/api/benchmarking", benchmarkingRoutes);
app.use("/api/simulations", simulationsRoutes);
app.use("/api/inventory", inventoryRoutes);
app.use("/api/optimus", optimusSuggestionsRoutes);
app.use("/api/reports", reportsRoutes);

app.use(errorHandler);

const server = app.listen(env.PORT, () => {
  console.log(`
  ============================================
   Agente IA Ambro - Backend API
   Port: ${env.PORT}
   Env:  ${env.NODE_ENV}
   CORS: ${env.FRONTEND_URL}
   PID:  ${process.pid}
  ============================================
  `);

  setupDailyCrons();
});

const sockets = new Set<Socket>();
server.on("connection", (socket) => {
  sockets.add(socket);
  socket.on("close", () => sockets.delete(socket));

  if (isShuttingDown) {
    socket.destroy();
  }
});

async function closeRuntimeDependencies() {
  await Promise.allSettled([
    shutdownDailyCrons(),
    shutdownDashboardCache(),
    shutdownSSEClients(),
    shutdownFileProcessingQueue(),
    shutdownMemoryProcessingQueue(),
    shutdownRateLimitQueue(),
    shutdownReportExportsQueue(),
    shutdownScheduledReportsQueue(),
    closeRedisClients(),
  ]);
}

function shutdown(signal: string, reason?: unknown) {
  if (isShuttingDown) return;
  isShuttingDown = true;
  setShuttingDown(true);
  console.log(`\n[${new Date().toISOString()}] ${signal} received - graceful shutdown...`);
  if (reason) {
    console.error(`[Shutdown] Trigger reason:`, reason);
  }

  for (const socket of sockets) {
    socket.end();
    setTimeout(() => socket.destroy(), 5_000).unref?.();
  }

  server.close(async () => {
    console.log("[Shutdown] HTTP server closed");
    await closeRuntimeDependencies();
    process.exit(signal === "uncaughtException" || signal === "unhandledRejection" ? 1 : 0);
  });

  setTimeout(async () => {
    console.error("[Shutdown] Forcing exit after timeout");
    await closeRuntimeDependencies();
    for (const socket of sockets) {
      socket.destroy();
    }
    process.exit(1);
  }, 15_000).unref?.();
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

process.on("uncaughtException", (err) => {
  console.error(`[${new Date().toISOString()}] UNCAUGHT EXCEPTION:`, err);
  shutdown("uncaughtException", err);
});

process.on("unhandledRejection", (reason) => {
  console.error(`[${new Date().toISOString()}] UNHANDLED REJECTION:`, reason);
  shutdown("unhandledRejection", reason);
});

export default app;
