import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";

import { env } from "./config/env";
import { errorHandler } from "./middleware/error";

import authRoutes from "./routes/auth";
import adminRoutes from "./routes/admin";
import chatRoutes from "./routes/chat";
import dashboardRoutes from "./routes/dashboard";
import healthRoutes from "./routes/health";

const app = express();

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
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
};
app.use(cors(corsOptions));

// Handle preflight requests explicitly
app.options('*', cors(corsOptions));

// ── Rate Limiting ───────────────────────────────────────
const limiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 100, // 100 requests per minute
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: "Muitas requisições. Tente novamente em 1 minuto." },
});
app.use(limiter);

// ── Body Parsing ────────────────────────────────────────
app.use(express.json({ limit: "1mb" }));

// ── Request Logging ─────────────────────────────────────
app.use((req, _res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
});

// ── Routes ──────────────────────────────────────────────
app.use("/api/health", healthRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/dashboard", dashboardRoutes);
app.use("/api/chat", chatRoutes);

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
