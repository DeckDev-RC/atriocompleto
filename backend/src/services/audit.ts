import { supabaseAdmin } from "../config/supabase";

export interface AuditLogData {
    userId: string | null;
    action: string;
    resource: string;
    entityId?: string;
    ipAddress?: string;
    userAgent?: string;
    details?: {
        previous?: any;
        next?: any;
        message?: string;
        [key: string]: any;
    };
    tenantId?: string;
}

export class AuditService {
    /**
     * Logs an action to the audit_logs table asynchronously.
     */
    static async log(data: AuditLogData): Promise<void> {
        try {
            // Run as background task to not block the main request
            const { error } = await supabaseAdmin.from("audit_logs").insert({
                user_id: data.userId,
                action: data.action,
                resource: data.resource,
                entity_id: data.entityId,
                ip_address: data.ipAddress,
                user_agent: data.userAgent,
                details: data.details || {},
                tenant_id: data.tenantId,
            });

            if (error) {
                console.error("[AuditService] Error saving log:", error);
            }
        } catch (err) {
            console.error("[AuditService] Critical error:", err);
        }
    }

    /**
     * Helper to capture changes between two objects.
     */
    static getDiff(previous: any, next: any): { previous: any; next: any } {
        const diffPrev: any = {};
        const diffNext: any = {};

        if (!previous) return { previous: {}, next };

        const allKeys = new Set([...Object.keys(previous), ...Object.keys(next)]);

        for (const key of allKeys) {
            // Skip internal fields
            if (["updated_at", "created_at"].includes(key)) continue;

            const pVal = previous[key];
            const nVal = next[key];

            if (JSON.stringify(pVal) !== JSON.stringify(nVal)) {
                diffPrev[key] = pVal;
                diffNext[key] = nVal;
            }
        }

        return { previous: diffPrev, next: diffNext };
    }
}
