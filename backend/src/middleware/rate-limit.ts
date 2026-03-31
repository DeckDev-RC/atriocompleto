import rateLimit from "express-rate-limit";
import RedisStore from "rate-limit-redis";
import { Request, Response } from "express";
import { redis } from "../config/redis";
import { env } from "../config/env";
import { RateLimitQueueService } from "../services/rate-limit-queue";
import { supabaseAdmin } from "../config/supabase";

const whitelist = env.WHITELIST_IPS.split(",").map((ip) => ip.trim()).filter(Boolean);
const healthCheckPathPattern = /^\/api\/health(?:\/|$)/;

const isWhitelisted = (req: Request) => {
  const ip = req.ip || req.socket.remoteAddress || "";
  return whitelist.includes(ip);
};

const isHealthCheckRequest = (req: Request) => {
  const requestPath = req.originalUrl || req.url || req.path || "";
  return healthCheckPathPattern.test(requestPath);
};

const handleViolation = (req: Request, res: Response, options: any) => {
  const ip = req.ip || req.socket.remoteAddress || "unknown";

  void RateLimitQueueService.logViolation(ip, {
    endpoint: req.originalUrl,
    limit: options.limit,
    userAgent: req.headers["user-agent"],
    userId: (req as any).user?.id,
  }).catch((error) => {
    console.error("[RateLimit] Failed to enqueue violation log:", error);
  });

  const violationKey = `ratelimit:violations:${ip}`;

  void redis
    .incr(violationKey)
    .then(async (violations) => {
      if (violations === 1) {
        await redis.expire(violationKey, 3600);
      }

      if (violations >= 10) {
        const blockKey = `ratelimit:blocked:${ip}`;
        await redis.set(blockKey, "true", "EX", 3600);
        void RateLimitQueueService.reportBlock(ip).catch((error) => {
          console.error("[RateLimit] Failed to enqueue IP block report:", error);
        });
        console.warn(`[RateLimit] IP ${ip} blocked due to 10 violations`);
      }
    })
    .catch((error) => {
      console.error("[RateLimit] Failed to persist violation state:", error);
    });

  res.status(429).json(options.message);
};

export const checkIPBlock = async (req: Request, res: Response, next: any) => {
  if (isWhitelisted(req) || isHealthCheckRequest(req)) return next();

  const ip = req.ip || req.socket.remoteAddress || "unknown";

  try {
    const blocked = await redis.get(`ratelimit:blocked:${ip}`);

    if (blocked) {
      return res.status(403).json({
        success: false,
        error: "Seu IP esta temporariamente bloqueado por abuso da API. Tente novamente em 1 hora.",
      });
    }
  } catch (error) {
    console.error("[RateLimit] Failed to check blocked IP:", error);
  }

  next();
};

const redisStore = (prefix: string) =>
  new RedisStore({
    sendCommand: (async (...args: string[]) => redis.call(args[0], ...args.slice(1))) as any,
    prefix,
  });

export const globalLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 100,
  standardHeaders: true,
  legacyHeaders: true,
  skip: (req) => isWhitelisted(req) || isHealthCheckRequest(req),
  passOnStoreError: true,
  store: redisStore("ratelimit:global:"),
  message: { success: false, error: "Muitas requisicoes. Tente novamente em 1 minuto." },
  handler: handleViolation,
});

export const authLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: true,
  skip: isWhitelisted,
  passOnStoreError: true,
  store: redisStore("ratelimit:auth:"),
  message: { success: false, error: "Muitas tentativas de login. Tente novamente em 1 minuto." },
  handler: handleViolation,
});

export const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: true,
  skip: isWhitelisted,
  passOnStoreError: true,
  store: redisStore("ratelimit:register:"),
  message: { success: false, error: "Limite de cadastros excedido. Tente novamente em 1 hora." },
  handler: handleViolation,
});

export const publicApiLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: true,
  skip: (req) => isWhitelisted(req) || isHealthCheckRequest(req) || !!(req as any).user,
  passOnStoreError: true,
  store: redisStore("ratelimit:public:"),
  message: { success: false, error: "Limite de API publica excedido. Tente novamente daqui a pouco." },
  handler: handleViolation,
});

export const aiReadLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
  skip: isWhitelisted,
  passOnStoreError: true,
  keyGenerator: (req: Request) => (req as any).user?.id || req.ip || "unknown",
  store: redisStore("ratelimit:ai-read:"),
  message: { success: false, error: "Muitas requisicoes de leitura. Tente novamente em breve." },
  handler: handleViolation,
});

export const aiLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: async (req: Request) => {
    const tenantId = (req as any).user?.tenant_id;
    if (!tenantId) return 20;

    const cacheKey = `config:tenant:${tenantId}:ai_limit`;

    try {
      const cachedLimit = await redis.get(cacheKey);
      if (cachedLimit) return Number.parseInt(cachedLimit, 10);

      const { data, error } = await supabaseAdmin
        .from("tenants")
        .select("ai_rate_limit")
        .eq("id", tenantId)
        .single();

      if (error || !data) return 20;

      const limit = data.ai_rate_limit || 20;
      await redis.set(cacheKey, limit.toString(), "EX", 3600);

      return limit;
    } catch (error) {
      console.error("[RateLimit] Error fetching AI limit:", error);
      return 20;
    }
  },
  standardHeaders: true,
  legacyHeaders: false,
  passOnStoreError: true,
  keyGenerator: (req: Request) => (req as any).user?.id || req.ip || "unknown",
  store: redisStore("ratelimit:ai:"),
  message: {
    success: false,
    error: "Limite de perguntas excedido para esta hora. Tente novamente mais tarde.",
  },
  handler: handleViolation,
});
