import Redis from "ioredis";
import { env } from "./env";

const redisConfig = {
    host: new URL(env.REDIS_URL).hostname,
    port: parseInt(new URL(env.REDIS_URL).port || "6379"),
    password: env.REDIS_PASSWORD || undefined,
    maxRetriesPerRequest: null, // Requisito do BullMQ
};

export const redis = new Redis(env.REDIS_URL, redisConfig);

redis.on("error", (err) => {
    console.error("[Redis] Error:", err);
});

redis.on("connect", () => {
    console.log("[Redis] Connected successfully");
});
