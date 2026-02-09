import { Router, Request, Response } from "express";
import { supabase } from "../config/supabase";

const router = Router();

router.get("/", async (_req: Request, res: Response) => {
  const checks: Record<string, string> = {
    api: "ok",
    supabase: "unknown",
    timestamp: new Date().toISOString(),
  };

  try {
    // Quick Supabase ping
    const { error } = await supabase.from("orders").select("id", { count: "exact", head: true }).limit(1);
    checks.supabase = error ? "error" : "ok";
  } catch {
    checks.supabase = "error";
  }

  const allOk = checks.api === "ok" && checks.supabase === "ok";

  res.status(allOk ? 200 : 503).json({
    success: allOk,
    data: checks,
  });
});

export default router;
