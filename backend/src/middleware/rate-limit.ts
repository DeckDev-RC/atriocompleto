import rateLimit from "express-rate-limit";
import RedisStore from "rate-limit-redis";
import { Request, Response } from "express";
import { redis } from "../config/redis";
import { env } from "../config/env";
import { RateLimitQueueService } from "../services/rate-limit-queue";
import { supabaseAdmin } from "../config/supabase";

// ── Helpers ─────────────────────────────────────────────
const whitelist = env.WHITELIST_IPS.split(",").map(ip => ip.trim()).filter(Boolean);

const isWhitelisted = (req: Request) => {
    const ip = req.ip || req.socket.remoteAddress || "";
    return whitelist.includes(ip);
};

const handleViolation = (req: Request, res: Response, options: any) => {
    const ip = req.ip || req.socket.remoteAddress || "unknown";

    // Enviar para a fila do BullMQ para logar no Audit
    RateLimitQueueService.logViolation(ip, {
        endpoint: req.originalUrl,
        limit: options.limit,
        userAgent: req.headers["user-agent"],
        userId: (req as any).user?.id
    });

    // Lógica de bloqueio progressivo (Redis Side)
    const violationKey = `ratelimit:violations:${ip}`;

    redis.incr(violationKey).then(async (violations) => {
        if (violations === 1) {
            await redis.expire(violationKey, 3600); // Reset violation count after 1h
        }

        if (violations >= 10) {
            const blockKey = `ratelimit:blocked:${ip}`;
            await redis.set(blockKey, "true", "EX", 3600); // Block for 1h
            RateLimitQueueService.reportBlock(ip);
            console.warn(`[RateLimit] IP ${ip} blocked due to 10 violations`);
        }
    });

    res.status(429).json(options.message);
};

// ── Check Blocked IP Middleware ──────────────────────────
export const checkIPBlock = async (req: Request, res: Response, next: any) => {
    if (isWhitelisted(req)) return next();

    const ip = req.ip || req.socket.remoteAddress || "unknown";
    const blocked = await redis.get(`ratelimit:blocked:${ip}`);

    if (blocked) {
        return res.status(403).json({
            success: false,
            error: "Seu IP está temporariamente bloqueado por abuso da API. Tente novamente em 1 hora."
        });
    }
    next();
};

// ── Limiter Configurations ──────────────────────────────

// 1. Global Limiter (100 req/min)
export const globalLimiter = rateLimit({
    windowMs: 60 * 1000,
    limit: 100,
    standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
    legacyHeaders: true, // Send the `X-RateLimit-*` headers
    skip: isWhitelisted,
    store: new RedisStore({
        sendCommand: (async (...args: string[]) => redis.call(args[0], ...args.slice(1))) as any,
        prefix: "ratelimit:global:",
    }),
    message: { success: false, error: "Muitas requisições. Tente novamente em 1 minuto." },
    handler: handleViolation
});

// 2. Auth Limiter (Login: 5/min)
export const authLimiter = rateLimit({
    windowMs: 60 * 1000,
    limit: 5,
    standardHeaders: true,
    legacyHeaders: true,
    skip: isWhitelisted,
    store: new RedisStore({
        sendCommand: (async (...args: string[]) => redis.call(args[0], ...args.slice(1))) as any,
        prefix: "ratelimit:auth:",
    }),
    message: { success: false, error: "Muitas tentativas de login. Tente novamente em 1 minuto." },
    handler: handleViolation
});

// 3. Register Limiter (3/hour)
export const registerLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    limit: 10,
    standardHeaders: true,
    legacyHeaders: true,
    skip: isWhitelisted,
    store: new RedisStore({
        sendCommand: (async (...args: string[]) => redis.call(args[0], ...args.slice(1))) as any,
        prefix: "ratelimit:register:",
    }),
    message: { success: false, error: "Limite de cadastros excedido. Tente novamente em 1 hora." },
    handler: handleViolation
});

// 4. Public API Limiter (20/min)
export const publicApiLimiter = rateLimit({
    windowMs: 60 * 1000,
    limit: 20,
    standardHeaders: true,
    legacyHeaders: true,
    skip: (req) => isWhitelisted(req) || !!(req as any).user, // Skip if whitelisted or authenticated
    store: new RedisStore({
        sendCommand: (async (...args: string[]) => redis.call(args[0], ...args.slice(1))) as any,
        prefix: "ratelimit:public:",
    }),
    message: { success: false, error: "Limite de API pública excedido. Tente novamente daqui a pouco." },
    handler: handleViolation
});

// 5. AI Insights Limiter (Configurable per Tenant)
export const aiLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, // 1 hour window
    limit: async (req: Request) => {
        const tenantId = (req as any).user?.tenant_id;
        if (!tenantId) return 20; // Default fallback

        const cacheKey = `config:tenant:${tenantId}:ai_limit`;

        try {
            // Check Redis cache first
            const cachedLimit = await redis.get(cacheKey);
            if (cachedLimit) return parseInt(cachedLimit);

            // Fetch from Supabase
            const { data, error } = await supabaseAdmin
                .from("tenants")
                .select("ai_rate_limit")
                .eq("id", tenantId)
                .single();

            if (error || !data) return 20;

            const limit = data.ai_rate_limit || 20;

            // Cache for 1 hour
            await redis.set(cacheKey, limit.toString(), "EX", 3600);

            return limit;
        } catch (err) {
            console.error("[RateLimit] Error fetching AI limit:", err);
            return 20;
        }
    },
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req: Request) => (req as any).user?.id || req.ip || "unknown",
    store: new RedisStore({
        sendCommand: (async (...args: string[]) => redis.call(args[0], ...args.slice(1))) as any,
        prefix: "ratelimit:ai:",
    }),
    message: {
        success: false,
        error: "Limite de perguntas excedido para esta hora. Tente novamente mais tarde."
    },
    handler: handleViolation
});
