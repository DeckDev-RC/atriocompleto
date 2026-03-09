import { Router } from "express";
import { requireAuth, requireMaster } from "../../middleware/auth";
import tenantRoutes from "./tenants";
import accessRequestRoutes from "./access-requests";
import userRoutes from "./users";
import rbacRoutes from "./rbac";

const router = Router();

// All admin routes require authentication + master role
router.use(requireAuth, requireMaster);

// ── Sub-routes ───────────────────────────────────────────
router.use("/tenants", tenantRoutes);
router.use("/access-requests", accessRequestRoutes);
router.use("/users", userRoutes);
router.use("/rbac", rbacRoutes);

export default router;
