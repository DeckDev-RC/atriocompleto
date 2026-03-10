import express from "express";
import cors from "cors";
import helmet from "helmet";
import compression from "compression";
import { globalLimiter, checkIPBlock, publicApiLimiter } from "./middleware/rate-limit";

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

const app = express();
app.set('trust proxy', 1); // Confia no proxy reverso do Easypanel/Traefik para o rate-limit funcionar

// ── Security ────────────────────────────────────────────
app.use(helmet());

// CORS configuration - allow frontend origin
const corsOptions: cors.CorsOptions = {
  origin: (origin, callback) => {
    // Allow requests with no origin (mobile apps, curl, etc)
    if (!origin) return callback(null, true);

    // Check if origin matches FRONTEND_URL
    const allowedOrigins = [
      env.FRONTEND_URL,
      env.FRONTEND_URL.replace('https://', 'http://'), // Allow HTTP variant
    ];

    if (allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      console.warn(`CORS blocked origin: ${origin}`);
      callback(null, true); // Allow anyway for now to debug
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
};
app.use(cors(corsOptions));

// Handle preflight requests explicitly
app.options('*', cors(corsOptions));

// ── Rate Limiting & Security ────────────────────────────
app.use(checkIPBlock); // Bloqueio imediato para IPs na blacklist/blocked
app.use(globalLimiter); // Limite global de 100 req/min via Redis

// ── Compression ─────────────────────────────────────────
app.use(compression());

// ── Body Parsing ────────────────────────────────────────
app.use(express.json({ limit: "1mb" }));

// ── Audit Info Capture ──────────────────────────────────
app.use(auditMiddleware);

// ── Request Logging (dev only) ──────────────────────────
if (env.NODE_ENV !== "production") {
  app.use((req, _res, next) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
    next();
  });
}

// ── Routes ──────────────────────────────────────────────
app.use("/api/health", publicApiLimiter, healthRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/user", userRoutes);
app.use("/api/dashboard", dashboardRoutes);
app.use("/api/ai", aiInsightsRoutes);
app.use("/api/chat", aiInsightsRoutes); // Backward compatibility
app.use("/api/audit-logs", auditRoutes);
app.use("/api/benchmarking", benchmarkingRoutes);
app.use("/api/simulations", simulationsRoutes);
app.use("/api/inventory", inventoryRoutes);
app.use("/api/optimus", optimusSuggestionsRoutes);

// ── Error Handler ───────────────────────────────────────
app.use(errorHandler);

// ── Start Server ────────────────────────────────────────
const server = app.listen(env.PORT, () => {
  console.log(`
  ╔══════════════════════════════════════════╗
  ║   🤖 Agente IA Ambro — Backend API      ║
  ║                                          ║
  ║   Port: ${env.PORT}                           ║
  ║   Env:  ${env.NODE_ENV.padEnd(30)}║
  ║   CORS: ${env.FRONTEND_URL.padEnd(30)}║
  ║   PID:  ${String(process.pid).padEnd(30)}║
  ╚══════════════════════════════════════════╝
  `);

  // Initialize Background Jobs
  setupDailyCrons();
});

// ── Graceful Shutdown + Self-Healing ────────────────────

// Track connection health
let isShuttingDown = false;

// Graceful shutdown handler
function shutdown(signal: string) {
  if (isShuttingDown) return;
  isShuttingDown = true;
  console.log(`\n[${new Date().toISOString()}] ${signal} received — graceful shutdown...`);

  // Stop accepting new connections
  server.close(() => {
    console.log("[Shutdown] HTTP server closed");
    process.exit(0);
  });

  // Force exit after 10s if connections don't close
  setTimeout(() => {
    console.error("[Shutdown] Forcing exit after timeout");
    process.exit(1);
  }, 10_000);
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

// Catch unhandled errors — log and let Docker restart
process.on("uncaughtException", (err) => {
  console.error(`[${new Date().toISOString()}] UNCAUGHT EXCEPTION:`, err);
  // Exit with error code so Docker/Easypanel restarts the container
  process.exit(1);
});

process.on("unhandledRejection", (reason) => {
  console.error(`[${new Date().toISOString()}] UNHANDLED REJECTION:`, reason);
  // Don't crash on unhandled promise rejections — log and continue
  // Docker health check will catch if the server is unhealthy
});

export default app;
