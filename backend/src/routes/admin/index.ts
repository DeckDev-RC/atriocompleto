import { Router } from "express";
import { requireAuth, requireMaster } from "../../middleware/auth";
import tenantRoutes from "./tenants";
import accessRequestRoutes from "./access-requests";
import userRoutes from "./users";
import rbacRoutes from "./rbac";
import publicSignupRoutes from "./public-signup";
import partnerRoutes from "./partners";

const router = Router();

// All admin routes require authentication. Master-only areas are mounted below.
router.use(requireAuth);

router.use("/tenants", tenantRoutes);
router.use("/access-requests", requireMaster, accessRequestRoutes);
router.use("/users", requireMaster, userRoutes);
router.use("/rbac", requireMaster, rbacRoutes);
router.use("/public-signup", requireMaster, publicSignupRoutes);
router.use("/partners", requireMaster, partnerRoutes);

export default router;
