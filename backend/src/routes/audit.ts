import { Router, Request, Response } from "express";
import { supabase } from "../config/supabase";
import { requireAuth, requireMaster } from "../middleware/auth";
import { AuditService } from "../services/audit";

const router = Router();

router.use(requireAuth, requireMaster);

router.get("/", async (req: Request, res: Response) => {
    try {
        const { action, userId, tenantId, startDate, endDate, page = "1", limit = "50" } = req.query;

        const from = (Number(page) - 1) * Number(limit);
        const to = from + Number(limit) - 1;

        let query = supabase
            .from("audit_logs")
            .select(`
        *,
        profiles!audit_logs_user_id_fkey(full_name, email),
        tenants(name)
      `, { count: "exact" })
            .order("created_at", { ascending: false })
            .range(from, to);

        if (action) query = query.eq("action", action);
        if (userId) query = query.eq("user_id", userId);
        if (tenantId) query = query.eq("tenant_id", tenantId);
        if (startDate) query = query.gte("created_at", startDate);
        if (endDate) query = query.lte("created_at", endDate);

        const { data, error, count } = await query;

        if (error) throw error;

        res.json({
            success: true,
            data,
            count,
            page: Number(page),
            limit: Number(limit),
        });

        // Audit log for listing
        void AuditService.log({
            userId: req.user!.id,
            action: "audit.list",
            resource: "audit_logs",
            entityId: (tenantId as string) || "all",
            details: {
                message: `Listagem de logs (Página ${page}${action ? `, Ação: ${action}` : ""})`,
                filters: { action, userId, tenantId, startDate, endDate }
            },
            ipAddress: req.auditInfo?.ip,
            userAgent: req.auditInfo?.userAgent,
        });
    } catch (error) {
        console.error("[AuditAPI] List logs error:", error);
        res.status(500).json({ success: false, error: "Erro ao listar logs de auditoria" });
    }
});

router.get("/export", async (req: Request, res: Response) => {
    try {
        const { data, error } = await supabase
            .from("audit_logs")
            .select(`
        created_at,
        profiles!audit_logs_user_id_fkey(full_name, email),
        action,
        resource,
        entity_id,
        ip_address,
        user_agent
      `)
            .order("created_at", { ascending: false })
            .limit(1000);

        if (error) throw error;

        // Adiciona BOM para o Excel identificar como UTF-8
        let csv = "\uFEFFData;Usuário;Email;Ação;Recurso;Entidade;IP;Sistema\n";

        data.forEach((log: any) => {
            const row = [
                new Date(log.created_at).toLocaleString("pt-BR"),
                log.profiles?.full_name || "Sistema",
                log.profiles?.email || "-",
                log.action,
                log.resource,
                log.entity_id || "-",
                log.ip_address || "-",
                `"${(log.user_agent || "Sistema").replace(/"/g, '""')}"`
            ];
            csv += row.join(";") + "\n";
        });

        res.setHeader("Content-Type", "text/csv; charset=utf-8");
        res.setHeader("Content-Disposition", "attachment; filename=audit_logs.csv");
        res.send(csv);

        // Audit log
        void AuditService.log({
            userId: req.user!.id,
            action: "audit.export",
            resource: "audit_logs",
            entityId: "all",
            details: {
                message: "Exportação de logs de auditoria realizada (CSV)",
            },
            ipAddress: req.auditInfo?.ip,
            userAgent: req.auditInfo?.userAgent,
        });
    } catch (error) {
        console.error("[AuditAPI] Export error:", error);
        res.status(500).json({ success: false, error: "Erro ao exportar logs" });
    }
});

// Endpoint for the cron job (protected by secret or master user)
router.post("/cleanup", async (req: Request, res: Response) => {
    try {
        const ninetyDaysAgo = new Date();
        ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

        const { error, count } = await supabase
            .from("audit_logs")
            .delete()
            .lte("created_at", ninetyDaysAgo.toISOString())
            .select('count');

        if (error) throw error;

        res.json({ success: true, message: `Deletados ${count || 0} logs antigos.` });

        // Audit log (system or triggered by user)
        void AuditService.log({
            userId: req.user?.id || "00000000-0000-0000-0000-000000000000", // System UUID fallback
            action: "audit.cleanup",
            resource: "audit_logs",
            details: { message: `Limpeza executada: ${count || 0} registros removidos.` },
            ipAddress: req.auditInfo?.ip,
        });
    } catch (error) {
        console.error("[AuditAPI] Cleanup error:", error);
        res.status(500).json({ success: false, error: "Erro ao limpar logs" });
    }
});

router.get("/actions", async (req: Request, res: Response) => {
    try {
        const { data, error } = await supabase
            .from("audit_logs")
            .select("action")
            .order("action", { ascending: true });

        if (error) throw error;

        // Get unique actions
        const uniqueActions = Array.from(new Set(data.map((item: any) => item.action)));

        res.json({ success: true, data: uniqueActions });
    } catch (error) {
        console.error("[AuditAPI] Get actions error:", error);
        res.status(500).json({ success: false, error: "Erro ao listar tipos de ações" });
    }
});

export default router;
