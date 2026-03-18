import { Router, Request, Response } from "express";
import { z } from "zod";
import { requireAuth } from "../middleware/auth";
import { requirePermission } from "../middleware/rbac";
import { ReportSchedulerService } from "../services/reportScheduler.service";
import { ScheduledReportsQueueService } from "../jobs/scheduledReports.job";
import { CustomReportBuilderService } from "../services/customReportBuilder.service";
import { ReportTemplatesService } from "../services/reportTemplates.service";
import { ReportExporterService } from "../services/reportExporter.service";
import { ReportExportsQueueService } from "../jobs/reportExports.job";

const router = Router();

const scheduleConfigSchema = z.object({
  frequency: z.enum(["daily", "weekly", "monthly", "quarterly", "annual", "custom"]),
  time: z.string().regex(/^\d{2}:\d{2}$/),
  day_of_week: z.number().int().min(0).max(6).nullable().optional(),
  day_of_month: z.number().int().min(1).max(31).nullable().optional(),
  month_of_year: z.number().int().min(1).max(12).nullable().optional(),
  cron_expression: z.string().trim().max(100).nullable().optional(),
  timezone: z.string().trim().max(100).default("America/Sao_Paulo"),
});

const filtersSchema = z.object({
  period_mode: z.enum(["relative", "fixed"]),
  relative_period: z.enum(["yesterday", "last_7_days", "previous_month_complete"]).nullable().optional(),
  start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  end_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  status: z.string().trim().max(120).nullable().optional(),
  marketplace: z.string().trim().max(120).nullable().optional(),
  category: z.string().trim().max(160).nullable().optional(),
  low_stock: z.boolean().nullable().optional(),
  out_of_stock: z.boolean().nullable().optional(),
  excess_stock: z.boolean().nullable().optional(),
});

const scheduleInputSchema = z.object({
  name: z.string().trim().min(3).max(120),
  report_type: z.enum(["sales", "products", "customers", "finance", "custom"]),
  custom_report_id: z.string().uuid().nullable().optional(),
  format: z.enum(["csv", "xlsx", "html"]),
  is_active: z.boolean().default(true),
  recipients: z.array(z.string().trim().email()).min(1).max(20),
  schedule: scheduleConfigSchema,
  filters: filtersSchema,
});

const statusSchema = z.object({
  status: z.enum(["active", "paused"]),
});

const customFilterSchema = z.object({
  field: z.string().trim().min(1).max(80),
  operator: z.enum(["eq", "in", "between", "gte", "lte"]),
  value: z.union([
    z.string(),
    z.number(),
    z.array(z.string()),
    z.array(z.number()),
  ]),
});

const customDefinitionSchema = z.object({
  dataset: z.enum(["sales", "products", "customers"]),
  dimensions: z.array(z.string().trim().min(1).max(80)).min(1).max(3),
  metrics: z.array(z.string().trim().min(1).max(80)).min(1).max(5),
  filters: z.array(customFilterSchema).max(10).optional(),
  sort: z.object({
    field: z.string().trim().min(1).max(80),
    direction: z.enum(["asc", "desc"]),
  }).optional(),
  limit: z.number().int().min(1).max(200).optional(),
});

const customDefinitionPayloadSchema = z.object({
  name: z.string().trim().min(3).max(120),
  description: z.string().trim().max(240).nullable().optional(),
  definition: customDefinitionSchema,
});

const templateDefaultScheduleSchema = z.object({
  format: z.enum(["csv", "xlsx", "html"]).optional(),
  schedule: scheduleConfigSchema.partial().optional(),
});

const templateCreateSchema = z.object({
  name: z.string().trim().min(3).max(120),
  description: z.string().trim().max(240).nullable().optional(),
  category: z.string().trim().min(2).max(60),
  tags: z.array(z.string().trim().min(1).max(30)).max(8).default([]),
  icon: z.string().trim().max(60).nullable().optional(),
  preview_image_url: z.string().trim().url().max(500).nullable().optional(),
  scope: z.enum(["tenant", "user"]).default("user"),
  source_definition_id: z.string().uuid().nullable().optional(),
  definition: customDefinitionSchema.optional(),
  default_schedule: templateDefaultScheduleSchema.optional(),
}).superRefine((value, ctx) => {
  if (!value.source_definition_id && !value.definition) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Informe uma definição ou uma definição customizada de origem",
      path: ["definition"],
    });
  }
});

const exportOptionsSchema = z.object({
  orientation: z.enum(["portrait", "landscape"]).optional(),
  delimiter: z.enum([",", ";"]).optional(),
  include_summary: z.boolean().optional(),
  include_graphs: z.boolean().optional(),
  watermark: z.boolean().optional(),
});

const reportExportCreateSchema = z.discriminatedUnion("source_type", [
  z.object({
    source_type: z.literal("scheduled_report"),
    source_id: z.string().uuid(),
    title: z.string().trim().max(160).nullable().optional(),
    format: z.enum(["csv", "xlsx", "html", "json", "pdf"]),
    options: exportOptionsSchema.optional(),
  }),
  z.object({
    source_type: z.literal("custom_definition"),
    source_id: z.string().uuid(),
    title: z.string().trim().max(160).nullable().optional(),
    format: z.enum(["csv", "xlsx", "html", "json", "pdf"]),
    options: exportOptionsSchema.optional(),
  }),
  z.object({
    source_type: z.literal("custom_builder"),
    title: z.string().trim().min(3).max(160),
    description: z.string().trim().max(240).nullable().optional(),
    format: z.enum(["csv", "xlsx", "html", "json", "pdf"]),
    definition: customDefinitionSchema,
    options: exportOptionsSchema.optional(),
  }),
]);

const reportExportEmailSchema = z.object({
  recipients: z.array(z.string().trim().email()).min(1).max(20),
});

router.get("/public-exports/:token/download", async (req: Request, res: Response) => {
  try {
    const url = await ReportExporterService.getPublicDownloadUrl(String(req.params.token));
    return res.redirect(url);
  } catch (error) {
    return res.status(404).json({
      success: false,
      error: error instanceof Error ? error.message : "Link indisponível",
    });
  }
});

router.use(requireAuth);

router.get("/metadata", requirePermission("visualizar_relatorios"), async (req: Request, res: Response) => {
  try {
    const tenantId = req.user!.tenant_id;
    if (!tenantId) {
      return res.status(403).json({ success: false, error: "Usuário sem tenant vinculado." });
    }

    const data = await ReportSchedulerService.getMetadata(tenantId);
    return res.json({ success: true, data });
  } catch (error) {
    console.error("[Reports] Metadata error:", error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : "Erro ao carregar metadados",
    });
  }
});

router.get("/custom/metadata", requirePermission("visualizar_relatorios"), async (_req: Request, res: Response) => {
  try {
    return res.json({ success: true, data: CustomReportBuilderService.getMetadata() });
  } catch (error) {
    console.error("[Reports] Custom metadata error:", error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : "Erro ao carregar datasets customizados",
    });
  }
});

router.get("/custom/definitions", requirePermission("visualizar_relatorios"), async (req: Request, res: Response) => {
  try {
    const tenantId = req.user!.tenant_id;
    if (!tenantId) {
      return res.status(403).json({ success: false, error: "Usuário sem tenant vinculado." });
    }

    const data = await CustomReportBuilderService.listDefinitions(tenantId);
    return res.json({ success: true, data });
  } catch (error) {
    console.error("[Reports] Custom definitions list error:", error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : "Erro ao listar definições customizadas",
    });
  }
});

router.post("/custom/definitions", requirePermission("gerenciar_relatorios"), async (req: Request, res: Response) => {
  try {
    const tenantId = req.user!.tenant_id;
    if (!tenantId) {
      return res.status(403).json({ success: false, error: "Usuário sem tenant vinculado." });
    }

    const parsed = customDefinitionPayloadSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        error: "Payload inválido",
        details: parsed.error.flatten().fieldErrors,
      });
    }

    const data = await CustomReportBuilderService.createDefinition({
      tenantId,
      userId: req.user!.id,
      name: parsed.data.name,
      description: parsed.data.description,
      definition: parsed.data.definition,
    });
    return res.status(201).json({ success: true, data });
  } catch (error) {
    console.error("[Reports] Custom definition create error:", error);
    return res.status(400).json({
      success: false,
      error: error instanceof Error ? error.message : "Erro ao salvar definição customizada",
    });
  }
});

router.put("/custom/definitions/:id", requirePermission("gerenciar_relatorios"), async (req: Request, res: Response) => {
  try {
    const tenantId = req.user!.tenant_id;
    if (!tenantId) {
      return res.status(403).json({ success: false, error: "Usuário sem tenant vinculado." });
    }

    const parsed = customDefinitionPayloadSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        error: "Payload inválido",
        details: parsed.error.flatten().fieldErrors,
      });
    }

    const data = await CustomReportBuilderService.updateDefinition({
      definitionId: String(req.params.id),
      tenantId,
      userId: req.user!.id,
      name: parsed.data.name,
      description: parsed.data.description,
      definition: parsed.data.definition,
    });
    return res.json({ success: true, data });
  } catch (error) {
    console.error("[Reports] Custom definition update error:", error);
    return res.status(400).json({
      success: false,
      error: error instanceof Error ? error.message : "Erro ao atualizar definição customizada",
    });
  }
});

router.delete("/custom/definitions/:id", requirePermission("gerenciar_relatorios"), async (req: Request, res: Response) => {
  try {
    const tenantId = req.user!.tenant_id;
    if (!tenantId) {
      return res.status(403).json({ success: false, error: "Usuário sem tenant vinculado." });
    }

    await CustomReportBuilderService.deleteDefinition(String(req.params.id), tenantId);
    return res.json({ success: true });
  } catch (error) {
    console.error("[Reports] Custom definition delete error:", error);
    return res.status(400).json({
      success: false,
      error: error instanceof Error ? error.message : "Erro ao excluir definição customizada",
    });
  }
});

router.post("/custom/preview", requirePermission("visualizar_relatorios"), async (req: Request, res: Response) => {
  try {
    const tenantId = req.user!.tenant_id;
    if (!tenantId) {
      return res.status(403).json({ success: false, error: "Usuário sem tenant vinculado." });
    }

    const parsed = customDefinitionSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        error: "Payload inválido",
        details: parsed.error.flatten().fieldErrors,
      });
    }

    const data = await CustomReportBuilderService.preview(parsed.data, tenantId);
    return res.json({ success: true, data });
  } catch (error) {
    console.error("[Reports] Custom preview error:", error);
    return res.status(400).json({
      success: false,
      error: error instanceof Error ? error.message : "Erro ao gerar preview customizado",
    });
  }
});

router.get("/templates", requirePermission("visualizar_relatorios"), async (req: Request, res: Response) => {
  try {
    const tenantId = req.user!.tenant_id;
    if (!tenantId) {
      return res.status(403).json({ success: false, error: "Usuário sem tenant vinculado." });
    }

    const search = typeof req.query.search === "string" ? req.query.search : undefined;
    const category = typeof req.query.category === "string" ? req.query.category : undefined;
    const dataset = typeof req.query.dataset === "string" ? req.query.dataset as "sales" | "products" | "customers" : undefined;
    const scope = typeof req.query.scope === "string" ? req.query.scope as "system" | "tenant" | "user" | "all" : undefined;

    const data = await ReportTemplatesService.listTemplates(
      {
        userId: req.user!.id,
        tenantId,
        role: req.user!.role,
      },
      {
        search,
        category,
        dataset,
        scope,
      },
    );

    return res.json({ success: true, data });
  } catch (error) {
    console.error("[Reports] Templates list error:", error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : "Erro ao listar templates",
    });
  }
});

router.get("/templates/:id", requirePermission("visualizar_relatorios"), async (req: Request, res: Response) => {
  try {
    const tenantId = req.user!.tenant_id;
    if (!tenantId) {
      return res.status(403).json({ success: false, error: "Usuário sem tenant vinculado." });
    }

    const data = await ReportTemplatesService.getTemplate(String(req.params.id), {
      userId: req.user!.id,
      tenantId,
      role: req.user!.role,
    });

    if (!data) {
      return res.status(404).json({ success: false, error: "Template não encontrado" });
    }

    return res.json({ success: true, data });
  } catch (error) {
    console.error("[Reports] Template detail error:", error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : "Erro ao carregar template",
    });
  }
});

router.post("/templates", requirePermission("gerenciar_relatorios"), async (req: Request, res: Response) => {
  try {
    const tenantId = req.user!.tenant_id;
    if (!tenantId) {
      return res.status(403).json({ success: false, error: "Usuário sem tenant vinculado." });
    }

    const parsed = templateCreateSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        error: "Payload inválido",
        details: parsed.error.flatten().fieldErrors,
      });
    }

    const data = await ReportTemplatesService.createTemplate({
      actor: {
        userId: req.user!.id,
        tenantId,
        role: req.user!.role,
      },
      name: parsed.data.name,
      description: parsed.data.description,
      category: parsed.data.category,
      tags: parsed.data.tags,
      icon: parsed.data.icon,
      previewImageUrl: parsed.data.preview_image_url,
      scope: parsed.data.scope,
      sourceDefinitionId: parsed.data.source_definition_id,
      definition: parsed.data.definition,
      defaultSchedule: parsed.data.default_schedule,
    });

    return res.status(201).json({ success: true, data });
  } catch (error) {
    console.error("[Reports] Template create error:", error);
    return res.status(400).json({
      success: false,
      error: error instanceof Error ? error.message : "Erro ao criar template",
    });
  }
});

router.post("/templates/:id/use", requirePermission("gerenciar_relatorios"), async (req: Request, res: Response) => {
  try {
    const tenantId = req.user!.tenant_id;
    if (!tenantId) {
      return res.status(403).json({ success: false, error: "Usuário sem tenant vinculado." });
    }

    const data = await ReportTemplatesService.useTemplate(String(req.params.id), {
      userId: req.user!.id,
      tenantId,
      role: req.user!.role,
    });

    return res.status(201).json({ success: true, data });
  } catch (error) {
    console.error("[Reports] Template use error:", error);
    return res.status(400).json({
      success: false,
      error: error instanceof Error ? error.message : "Erro ao usar template",
    });
  }
});

router.get("/exports", requirePermission("visualizar_relatorios"), async (req: Request, res: Response) => {
  try {
    const tenantId = req.user!.tenant_id;
    if (!tenantId) {
      return res.status(403).json({ success: false, error: "Usuário sem tenant vinculado." });
    }

    const sourceType = typeof req.query.source_type === "string"
      ? req.query.source_type as "scheduled_report" | "custom_definition" | "custom_builder"
      : undefined;
    const sourceId = typeof req.query.source_id === "string" ? req.query.source_id : undefined;
    const limit = typeof req.query.limit === "string" ? Number(req.query.limit) : undefined;

    const data = await ReportExporterService.listExports(req.user!, {
      source_type: sourceType,
      source_id: sourceId,
      limit,
    });

    return res.json({ success: true, data });
  } catch (error) {
    console.error("[Reports] Export list error:", error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : "Erro ao listar exports",
    });
  }
});

router.get("/exports/:id", requirePermission("visualizar_relatorios"), async (req: Request, res: Response) => {
  try {
    const data = await ReportExporterService.getExport(String(req.params.id), req.user!);
    if (!data) {
      return res.status(404).json({ success: false, error: "Export não encontrado" });
    }
    return res.json({ success: true, data });
  } catch (error) {
    console.error("[Reports] Export detail error:", error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : "Erro ao carregar export",
    });
  }
});

router.post("/exports", requirePermission("visualizar_relatorios"), async (req: Request, res: Response) => {
  try {
    const tenantId = req.user!.tenant_id;
    if (!tenantId) {
      return res.status(403).json({ success: false, error: "Usuário sem tenant vinculado." });
    }

    const parsed = reportExportCreateSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        error: "Payload inválido",
        details: parsed.error.flatten().fieldErrors,
      });
    }

    const exportRow = await ReportExporterService.createExport(parsed.data, req.user!);
    await ReportExportsQueueService.enqueue(exportRow.id);
    return res.status(202).json({ success: true, data: exportRow });
  } catch (error) {
    console.error("[Reports] Export create error:", error);
    return res.status(400).json({
      success: false,
      error: error instanceof Error ? error.message : "Erro ao solicitar export",
    });
  }
});

router.get("/exports/:id/download", requirePermission("visualizar_relatorios"), async (req: Request, res: Response) => {
  try {
    const url = await ReportExporterService.getDownloadUrl(String(req.params.id), req.user!);
    return res.json({ success: true, data: { url } });
  } catch (error) {
    console.error("[Reports] Export download error:", error);
    return res.status(400).json({
      success: false,
      error: error instanceof Error ? error.message : "Erro ao gerar link de download",
    });
  }
});

router.post("/exports/:id/share", requirePermission("visualizar_relatorios"), async (req: Request, res: Response) => {
  try {
    const data = await ReportExporterService.shareExport(String(req.params.id), req.user!);
    return res.json({ success: true, data });
  } catch (error) {
    console.error("[Reports] Export share error:", error);
    return res.status(400).json({
      success: false,
      error: error instanceof Error ? error.message : "Erro ao compartilhar export",
    });
  }
});

router.post("/exports/:id/email", requirePermission("visualizar_relatorios"), async (req: Request, res: Response) => {
  try {
    const parsed = reportExportEmailSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        error: "Payload inválido",
        details: parsed.error.flatten().fieldErrors,
      });
    }

    const data = await ReportExporterService.emailExport(String(req.params.id), req.user!, parsed.data.recipients);
    return res.json({ success: true, data });
  } catch (error) {
    console.error("[Reports] Export email error:", error);
    return res.status(400).json({
      success: false,
      error: error instanceof Error ? error.message : "Erro ao enviar export por email",
    });
  }
});

router.get("/schedules", requirePermission("visualizar_relatorios"), async (req: Request, res: Response) => {
  try {
    const tenantId = req.user!.tenant_id;
    if (!tenantId) {
      return res.status(403).json({ success: false, error: "Usuário sem tenant vinculado." });
    }

    const data = await ReportSchedulerService.listSchedules(tenantId);
    return res.json({ success: true, data });
  } catch (error) {
    console.error("[Reports] List schedules error:", error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : "Erro ao listar agendamentos",
    });
  }
});

router.get("/schedules/:id/executions", requirePermission("visualizar_relatorios"), async (req: Request, res: Response) => {
  try {
    const tenantId = req.user!.tenant_id;
    if (!tenantId) {
      return res.status(403).json({ success: false, error: "Usuário sem tenant vinculado." });
    }

    const data = await ReportSchedulerService.listExecutions(String(req.params.id), tenantId);
    return res.json({ success: true, data });
  } catch (error) {
    console.error("[Reports] List executions error:", error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : "Erro ao listar execuções",
    });
  }
});

router.get("/executions/:id/download", requirePermission("visualizar_relatorios"), async (req: Request, res: Response) => {
  try {
    const url = await ReportSchedulerService.getExecutionDownloadUrl(String(req.params.id), req.user!.tenant_id);
    return res.json({ success: true, data: { url } });
  } catch (error) {
    console.error("[Reports] Download URL error:", error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : "Erro ao gerar link de download",
    });
  }
});

router.post("/preview", requirePermission("gerenciar_relatorios"), async (req: Request, res: Response) => {
  try {
    const parsed = scheduleInputSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        error: "Payload inválido",
        details: parsed.error.flatten().fieldErrors,
      });
    }

    const data = await ReportSchedulerService.previewSchedule(parsed.data);
    return res.json({ success: true, data });
  } catch (error) {
    console.error("[Reports] Preview error:", error);
    return res.status(400).json({
      success: false,
      error: error instanceof Error ? error.message : "Erro ao validar agendamento",
    });
  }
});

router.post("/schedule", requirePermission("gerenciar_relatorios"), async (req: Request, res: Response) => {
  try {
    const parsed = scheduleInputSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        error: "Payload inválido",
        details: parsed.error.flatten().fieldErrors,
      });
    }

    const schedule = await ReportSchedulerService.createSchedule(parsed.data, req.user!);
    if (schedule.status === "active") {
      await ScheduledReportsQueueService.removePendingJobs(schedule.id);
      await ScheduledReportsQueueService.enqueueSchedule(schedule);
    }

    return res.status(201).json({ success: true, data: schedule });
  } catch (error) {
    console.error("[Reports] Create schedule error:", error);
    return res.status(400).json({
      success: false,
      error: error instanceof Error ? error.message : "Erro ao criar agendamento",
    });
  }
});

router.put("/schedules/:id", requirePermission("gerenciar_relatorios"), async (req: Request, res: Response) => {
  try {
    const parsed = scheduleInputSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        error: "Payload inválido",
        details: parsed.error.flatten().fieldErrors,
      });
    }

    const schedule = await ReportSchedulerService.updateSchedule(String(req.params.id), parsed.data, req.user!);
    await ScheduledReportsQueueService.removePendingJobs(schedule.id);
    if (schedule.status === "active") {
      await ScheduledReportsQueueService.enqueueSchedule(schedule);
    }

    return res.json({ success: true, data: schedule });
  } catch (error) {
    console.error("[Reports] Update schedule error:", error);
    return res.status(400).json({
      success: false,
      error: error instanceof Error ? error.message : "Erro ao atualizar agendamento",
    });
  }
});

router.patch("/schedules/:id/status", requirePermission("gerenciar_relatorios"), async (req: Request, res: Response) => {
  try {
    const parsed = statusSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        error: "Status inválido",
        details: parsed.error.flatten().fieldErrors,
      });
    }

    const schedule = await ReportSchedulerService.updateScheduleStatus(String(req.params.id), parsed.data.status, req.user!);
    await ScheduledReportsQueueService.removePendingJobs(schedule.id);
    if (schedule.status === "active") {
      await ScheduledReportsQueueService.enqueueSchedule(schedule);
    }

    return res.json({ success: true, data: schedule });
  } catch (error) {
    console.error("[Reports] Update status error:", error);
    return res.status(400).json({
      success: false,
      error: error instanceof Error ? error.message : "Erro ao atualizar status",
    });
  }
});

router.delete("/schedules/:id", requirePermission("gerenciar_relatorios"), async (req: Request, res: Response) => {
  try {
    const schedule = await ReportSchedulerService.deleteSchedule(String(req.params.id), req.user!.tenant_id);
    await ScheduledReportsQueueService.removePendingJobs(schedule.id);
    return res.json({ success: true });
  } catch (error) {
    console.error("[Reports] Delete schedule error:", error);
    return res.status(400).json({
      success: false,
      error: error instanceof Error ? error.message : "Erro ao excluir agendamento",
    });
  }
});

router.post("/schedules/:id/run-now", requirePermission("gerenciar_relatorios"), async (req: Request, res: Response) => {
  try {
    const data = await ReportSchedulerService.executeNow(String(req.params.id), req.user!);
    return res.json({ success: true, data });
  } catch (error) {
    console.error("[Reports] Run now error:", error);
    return res.status(400).json({
      success: false,
      error: error instanceof Error ? error.message : "Erro ao executar relatório",
    });
  }
});

export default router;
