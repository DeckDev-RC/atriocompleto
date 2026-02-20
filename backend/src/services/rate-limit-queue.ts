import { Queue, Worker, Job } from "bullmq";
import { redis } from "../config/redis";
import { env } from "../config/env";
import { AuditService } from "./audit";

// ── Queue Configuration ──────────────────────────────────
export const rateLimitQueue = new Queue("rate-limit-tasks", {
    connection: redis as any,
    prefix: env.BULLMQ_PREFIX,
});

// ── Worker Implementation ────────────────────────────────
const worker = new Worker(
    "rate-limit-tasks",
    async (job: Job) => {
        const { type, ip, details } = job.data;

        switch (type) {
            case "LOG_VIOLATION":
                console.log(`[RateLimit Worker] Logging violation for IP: ${ip}`);
                // Log to database via AuditService
                await AuditService.log({
                    userId: details.userId || null,
                    action: "security.rate_limit_violation",
                    resource: "api",
                    entityId: ip,
                    ipAddress: ip,
                    userAgent: details.userAgent,
                    details: {
                        endpoint: details.endpoint,
                        limit: details.limit,
                        message: "Limite de requisições excedido",
                    },
                });
                break;

            case "BLOCK_IP":
                console.log(`[RateLimit Worker] Blocking IP: ${ip} for 1 hour`);
                // O bloqueio em si é feito via Redis (set key with TTL)
                // Este job pode ser usado para auditoria adicional do bloqueio
                await AuditService.log({
                    userId: null,
                    action: "security.ip_blocked",
                    resource: "firewall",
                    entityId: ip,
                    ipAddress: ip,
                    details: { reason: "Múltiplas violações de rate limit", duration: "1h" },
                });
                break;

            default:
                console.warn(`[RateLimit Worker] Unknown job type: ${type}`);
        }
    },
    {
        connection: redis as any,
        prefix: env.BULLMQ_PREFIX
    }
);

worker.on("completed", (job) => {
    console.log(`[RateLimit Worker] Job ${job.id} completed`);
});

worker.on("failed", (job, err) => {
    console.error(`[RateLimit Worker] Job ${job?.id} failed:`, err);
});

export const RateLimitQueueService = {
    logViolation: (ip: string, details: any) => {
        return rateLimitQueue.add("LOG_VIOLATION", { type: "LOG_VIOLATION", ip, details });
    },
    reportBlock: (ip: string) => {
        return rateLimitQueue.add("BLOCK_IP", { type: "BLOCK_IP", ip });
    }
};
