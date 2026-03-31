import { Router, Request, Response } from "express";
import { redis } from "../config/redis";
import { supabaseAdmin } from "../config/supabase";

const router = Router();

const DEPENDENCY_TIMEOUT_MS = 2_000;
const HEALTHCHECK_TABLE = "tenants";

type DependencyState = "ok" | "error" | "timeout";

function mapTimeoutState(error: unknown): DependencyState {
  return error instanceof Error && error.name === "AbortError" ? "timeout" : "error";
}

async function checkSupabase(): Promise<DependencyState> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DEPENDENCY_TIMEOUT_MS);

  try {
    const { error } = await supabaseAdmin
      .from(HEALTHCHECK_TABLE)
      .select("id", { head: true })
      .limit(1)
      .abortSignal(controller.signal);

    return error ? "error" : "ok";
  } catch (error) {
    return mapTimeoutState(error);
  } finally {
    clearTimeout(timeout);
  }
}

async function checkRedis(): Promise<DependencyState> {
  let timeoutId: NodeJS.Timeout | undefined;

  try {
    const result = await Promise.race([
      redis.ping(),
      new Promise<string>((_, reject) => {
        timeoutId = setTimeout(() => reject(new Error("Redis health check timeout")), DEPENDENCY_TIMEOUT_MS);
      }),
    ]);

    return result === "PONG" ? "ok" : "error";
  } catch (error) {
    return error instanceof Error && error.message === "Redis health check timeout" ? "timeout" : "error";
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

router.get("/live", (_req: Request, res: Response) => {
  res.status(200).json({
    success: true,
    data: {
      api: "ok",
      timestamp: new Date().toISOString(),
    },
  });
});

const readinessHandler = async (_req: Request, res: Response) => {
  const [supabase, redisStatus] = await Promise.all([checkSupabase(), checkRedis()]);

  const checks: Record<string, string> = {
    api: "ok",
    redis: redisStatus,
    supabase,
    timestamp: new Date().toISOString(),
  };

  const allOk = checks.api === "ok" && checks.redis === "ok" && checks.supabase === "ok";

  res.status(allOk ? 200 : 503).json({
    success: allOk,
    data: checks,
  });
};

router.get("/", readinessHandler);
router.get("/ready", readinessHandler);

export default router;
