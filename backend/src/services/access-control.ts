import { supabaseAdmin } from "../config/supabase";
import { redis } from "../config/redis";

export interface PermissionMap {
    [key: string]: boolean;
}

const RBAC_CACHE_PREFIX = "rbac:perms:";
const RBAC_CACHE_TTL_S = 300; // 5 minutes (same as auth cache)

export class AccessControlService {
    /**
     * Fetches and flattens all permissions for a specific profile.
     * Includes permissions from all assigned roles.
     * Results are cached in Redis for 5 minutes.
     */
    static async getUserPermissions(profileId: string): Promise<PermissionMap> {
        try {
            // 1. Check Redis cache first
            const cacheKey = `${RBAC_CACHE_PREFIX}${profileId}`;
            try {
                const cached = await redis.get(cacheKey);
                if (cached) return JSON.parse(cached) as PermissionMap;
            } catch (err) {
                console.error("[AccessControl] Redis cache read error:", err);
            }

            // 2. Get role IDs for the user
            const { data: userRoles, error: rolesError } = await supabaseAdmin
                .from("user_roles")
                .select("role_id")
                .eq("profile_id", profileId);

            if (rolesError || !userRoles || userRoles.length === 0) {
                // Cache empty result to avoid repeated DB queries for users without roles
                void redis.set(cacheKey, "{}", "EX", RBAC_CACHE_TTL_S).catch(() => {});
                return {};
            }

            const roleIds = userRoles.map((ur) => ur.role_id);

            // 3. Get permissions for those roles
            const { data: permissions, error: permError } = await supabaseAdmin
                .from("role_permissions")
                .select(`
                    permissions (
                        name
                    )
                `)
                .in("role_id", roleIds);

            if (permError || !permissions) {
                console.error("[AccessControl] Error fetching permissions:", permError);
                return {};
            }

            // 4. Flatten into a map for O(1) checks
            const permissionMap: PermissionMap = {};
            permissions.forEach((p: any) => {
                if (p.permissions?.name) {
                    permissionMap[p.permissions.name] = true;
                }
            });

            // 5. Cache the result
            try {
                await redis.set(cacheKey, JSON.stringify(permissionMap), "EX", RBAC_CACHE_TTL_S);
            } catch (err) {
                console.error("[AccessControl] Redis cache write error:", err);
            }

            return permissionMap;
        } catch (error) {
            console.error("[AccessControl] Unexpected error:", error);
            return {};
        }
    }

    /**
     * Invalidates the RBAC cache for a specific user or all users.
     */
    static async invalidateCache(profileId?: string): Promise<void> {
        try {
            if (profileId) {
                await redis.del(`${RBAC_CACHE_PREFIX}${profileId}`);
            } else {
                const keys = await redis.keys(`${RBAC_CACHE_PREFIX}*`);
                if (keys.length > 0) await redis.del(...keys);
            }
        } catch (err) {
            console.error("[AccessControl] Cache invalidation error:", err);
        }
    }

    /**
     * Helper to check if a user has a specific permission.
     */
    static hasPermission(userPermissions: PermissionMap, permissionName: string): boolean {
        return !!userPermissions[permissionName];
    }
}
