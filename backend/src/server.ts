import express from "express";
import cors from "cors";
import helmet from "helmet";
import compression from "compression";
import { globalLimiter, checkIPBlock } from "./middleware/rate-limit";

import { env } from "./config/env";
import { setupDailyCrons } from "./services/cron.service";
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
import "./services/file-processing-queue";
import "./services/memory-processing-queue";
import "./jobs/reportExports.job";

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
      callback(null, true);
    }
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
};

app.use(cors(corsOptions));
app.options("*", cors(corsOptions));

// Health endpoints must stay lightweight and avoid Redis-backed middleware.
app.use("/api/health", healthRoutes);

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

let isShuttingDown = false;

function shutdown(signal: string) {
  if (isShuttingDown) return;
  isShuttingDown = true;
  console.log(`\n[${new Date().toISOString()}] ${signal} received - graceful shutdown...`);

  server.close(() => {
    console.log("[Shutdown] HTTP server closed");
    process.exit(0);
  });

  setTimeout(() => {
    console.error("[Shutdown] Forcing exit after timeout");
    process.exit(1);
  }, 10_000);
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

process.on("uncaughtException", (err) => {
  console.error(`[${new Date().toISOString()}] UNCAUGHT EXCEPTION:`, err);
  process.exit(1);
});

process.on("unhandledRejection", (reason) => {
  console.error(`[${new Date().toISOString()}] UNHANDLED REJECTION:`, reason);
});

export default app;
