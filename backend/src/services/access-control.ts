import { supabaseAdmin } from "../config/supabase";
import { redis } from "../config/redis";
import { deleteRedisKeysByPattern } from "../utils/redis-keys";

export interface PermissionMap {
  [key: string]: boolean;
}

const RBAC_CACHE_PREFIX = "rbac:perms:";
const RBAC_CACHE_TTL_S = 300; // 5 minutes (same as auth cache)

export class AccessControlService {
  static async getUserPermissions(profileId: string): Promise<PermissionMap> {
    try {
      const cacheKey = `${RBAC_CACHE_PREFIX}${profileId}`;
      try {
        const cached = await redis.get(cacheKey);
        if (cached) return JSON.parse(cached) as PermissionMap;
      } catch (err) {
        console.error("[AccessControl] Redis cache read error:", err);
      }

      const permissionMap = await this.fetchPermissionMapForProfiles([profileId]);
      const result = permissionMap.get(profileId) || {};

      try {
        await redis.set(cacheKey, JSON.stringify(result), "EX", RBAC_CACHE_TTL_S);
      } catch (err) {
        console.error("[AccessControl] Redis cache write error:", err);
      }

      return result;
    } catch (error) {
      console.error("[AccessControl] Unexpected error:", error);
      return {};
    }
  }

  static async getUsersPermissionsMap(profileIds: string[]): Promise<Map<string, PermissionMap>> {
    const uniqueProfileIds = [...new Set(profileIds.filter(Boolean))];
    const permissionMap = new Map<string, PermissionMap>();

    if (uniqueProfileIds.length === 0) {
      return permissionMap;
    }

    const uncachedIds: string[] = [];

    await Promise.all(
      uniqueProfileIds.map(async (profileId) => {
        try {
          const cached = await redis.get(`${RBAC_CACHE_PREFIX}${profileId}`);
          if (cached) {
            permissionMap.set(profileId, JSON.parse(cached) as PermissionMap);
            return;
          }
        } catch (err) {
          console.error("[AccessControl] Redis batch cache read error:", err);
        }

        uncachedIds.push(profileId);
      }),
    );

    if (uncachedIds.length === 0) {
      return permissionMap;
    }

    const fetched = await this.fetchPermissionMapForProfiles(uncachedIds);
    await Promise.all(
      uncachedIds.map(async (profileId) => {
        const permissions = fetched.get(profileId) || {};
        permissionMap.set(profileId, permissions);

        try {
          await redis.set(`${RBAC_CACHE_PREFIX}${profileId}`, JSON.stringify(permissions), "EX", RBAC_CACHE_TTL_S);
        } catch (err) {
          console.error("[AccessControl] Redis batch cache write error:", err);
        }
      }),
    );

    return permissionMap;
  }

  static async invalidateCache(profileId?: string): Promise<void> {
    try {
      if (profileId) {
        await redis.del(`${RBAC_CACHE_PREFIX}${profileId}`);
      } else {
        await deleteRedisKeysByPattern(redis, `${RBAC_CACHE_PREFIX}*`);
      }
    } catch (err) {
      console.error("[AccessControl] Cache invalidation error:", err);
    }
  }

  static hasPermission(userPermissions: PermissionMap, permissionName: string): boolean {
    return !!userPermissions[permissionName];
  }

  private static async fetchPermissionMapForProfiles(profileIds: string[]): Promise<Map<string, PermissionMap>> {
    const uniqueProfileIds = [...new Set(profileIds.filter(Boolean))];
    const result = new Map<string, PermissionMap>();

    uniqueProfileIds.forEach((profileId) => result.set(profileId, {}));

    if (uniqueProfileIds.length === 0) {
      return result;
    }

    const { data: userRoles, error: userRolesError } = await supabaseAdmin
      .from("user_roles")
      .select("profile_id, role_id")
      .in("profile_id", uniqueProfileIds);

    if (userRolesError) {
      console.error("[AccessControl] Error fetching user roles:", userRolesError);
      return result;
    }

    const roleIds = [...new Set((userRoles || []).map((row) => String(row.role_id)).filter(Boolean))];
    if (roleIds.length === 0) {
      return result;
    }

    const { data: rolePermissions, error: permissionsError } = await supabaseAdmin
      .from("role_permissions")
      .select(`
        role_id,
        permissions (
          name
        )
      `)
      .in("role_id", roleIds);

    if (permissionsError) {
      console.error("[AccessControl] Error fetching role permissions:", permissionsError);
      return result;
    }

    const permissionsByRole = new Map<string, string[]>();
    for (const row of (rolePermissions || []) as Array<{ role_id: string; permissions?: { name?: string | null } | null }>) {
      const roleId = String(row.role_id);
      const permissionName = row.permissions?.name;
      if (!permissionName) continue;

      const current = permissionsByRole.get(roleId) || [];
      current.push(permissionName);
      permissionsByRole.set(roleId, current);
    }

    for (const row of userRoles || []) {
      const profileId = String(row.profile_id);
      const permissionMap = result.get(profileId) || {};
      for (const permissionName of permissionsByRole.get(String(row.role_id)) || []) {
        permissionMap[permissionName] = true;
      }
      result.set(profileId, permissionMap);
    }

    return result;
  }
}
