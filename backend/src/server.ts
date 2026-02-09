import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";

import { env } from "./config/env";
import { errorHandler } from "./middleware/error";

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
  allowedHeaders: ['Content-Type'],
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
app.use("/api/dashboard", dashboardRoutes);
app.use("/api/chat", chatRoutes);

// ── Error Handler ───────────────────────────────────────
app.use(errorHandler);

// ── Start Server ────────────────────────────────────────
app.listen(env.PORT, () => {
  console.log(`
  ╔══════════════════════════════════════════╗
  ║   🤖 Agente IA Ambro — Backend API      ║
  ║                                          ║
  ║   Port: ${env.PORT}                           ║
  ║   Env:  ${env.NODE_ENV.padEnd(30)}║
  ║   CORS: ${env.FRONTEND_URL.padEnd(30)}║
  ╚══════════════════════════════════════════╝
  `);
});

export default app;
