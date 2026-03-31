import Redis, { type RedisOptions } from "ioredis";
import { env } from "./env";

const parsedRedisUrl = new URL(env.REDIS_URL);

const baseRedisOptions: RedisOptions = {
  host: parsedRedisUrl.hostname,
  port: Number.parseInt(parsedRedisUrl.port || "6379", 10),
  password: env.REDIS_PASSWORD || parsedRedisUrl.password || undefined,
  connectTimeout: 5_000,
};

function createRedisClient(label: string, options: RedisOptions) {
  const client = new Redis(env.REDIS_URL, {
    ...baseRedisOptions,
    ...options,
  });

  client.on("connect", () => {
    console.log(`[Redis:${label}] Connected`);
  });

  client.on("ready", () => {
    console.log(`[Redis:${label}] Ready`);
  });

  client.on("reconnecting", (delay: number) => {
    console.warn(`[Redis:${label}] Reconnecting in ${delay}ms`);
  });

  client.on("close", () => {
    console.warn(`[Redis:${label}] Connection closed`);
  });

  client.on("error", (err) => {
    console.error(`[Redis:${label}] Error:`, err);
  });

  return client;
}

// HTTP/cache path: fail fast instead of hanging requests forever.
export const redis = createRedisClient("app", {
  maxRetriesPerRequest: 1,
  commandTimeout: 2_000,
});

// Queue producers may run inside request handlers, so they should also fail fast.
export const queueRedis = createRedisClient("queue", {
  maxRetriesPerRequest: 1,
  enableOfflineQueue: false,
  commandTimeout: 2_000,
});

// BullMQ workers must wait for Redis to come back instead of failing jobs prematurely.
export const workerRedis = createRedisClient("worker", {
  maxRetriesPerRequest: null,
});
