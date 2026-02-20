import { supabaseAdmin } from "../config/supabase";

export interface PermissionMap {
    [key: string]: boolean;
}

export class AccessControlService {
    /**
     * Fetches and flattens all permissions for a specific profile.
     * Includes permissions from all assigned roles.
     */
    static async getUserPermissions(profileId: string): Promise<PermissionMap> {
        try {
            // 1. Get role IDs for the user
            let { data: userRoles, error: rolesError } = await supabaseAdmin
                .from("user_roles")
                .select("role_id")
                .eq("profile_id", profileId);

            // Retry once after 500ms if no roles found (to handle race conditions during updates)
            if (!rolesError && (!userRoles || userRoles.length === 0)) {
                await new Promise(resolve => setTimeout(resolve, 500));
                const retry = await supabaseAdmin
                    .from("user_roles")
                    .select("role_id")
                    .eq("profile_id", profileId);
                userRoles = retry.data;
                rolesError = retry.error;
            }

            if (rolesError || !userRoles || userRoles.length === 0) {

                return {};
            }

            const roleIds = userRoles.map((ur) => ur.role_id);


            // 2. Get permissions for those roles
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

            // 3. Flatten into a map for O(1) checks
            const permissionMap: PermissionMap = {};
            permissions.forEach((p: any) => {
                if (p.permissions?.name) {
                    permissionMap[p.permissions.name] = true;
                }
            });



            return permissionMap;
        } catch (error) {
            console.error("[AccessControl] Unexpected error:", error);
            return {};
        }
    }

    /**
     * Helper to check if a user has a specific permission.
     */
    static hasPermission(userPermissions: PermissionMap, permissionName: string): boolean {
        return !!userPermissions[permissionName];
    }
}
