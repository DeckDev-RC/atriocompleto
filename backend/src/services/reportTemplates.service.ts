import { randomUUID } from "crypto";
import { supabaseAdmin } from "../config/supabase";
import { AuditService } from "./audit";
import {
  CustomReportBuilderService,
  buildDefinitionSql,
  type CustomReportDefinition,
  type DatasetKey,
} from "./customReportBuilder.service";

export type ReportTemplateScope = "system" | "tenant" | "user";

export interface ReportTemplateRow {
  id: string;
  key: string;
  scope: ReportTemplateScope;
  tenant_id: string | null;
  created_by: string | null;
  updated_by: string | null;
  name: string;
  description: string | null;
  category: string;
  tags: string[];
  icon: string | null;
  preview_image_url: string | null;
  definition_json: CustomReportDefinition;
  default_schedule_json: Record<string, unknown>;
  featured: boolean;
  use_count: number;
  created_at: string;
  updated_at: string;
}

export interface ReportTemplateSummary extends ReportTemplateRow {
  dataset: DatasetKey;
  dimensions_count: number;
  metrics_count: number;
}

interface ActorContext {
  userId: string;
  tenantId: string;
  role?: "master" | "user";
}

interface ListTemplateFilters {
  search?: string;
  category?: string;
  dataset?: DatasetKey;
  scope?: ReportTemplateScope | "all";
}

interface CreateTemplateInput {
  actor: ActorContext;
  name: string;
  description?: string | null;
  category: string;
  tags?: string[];
  icon?: string | null;
  previewImageUrl?: string | null;
  scope: Exclude<ReportTemplateScope, "system">;
  sourceDefinitionId?: string | null;
  definition?: CustomReportDefinition;
  defaultSchedule?: Record<string, unknown>;
}

const MAX_TEMPLATE_TAGS = 8;

function trimNullable(value?: string | null) {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

function slugify(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
}

export function createReportTemplateKey(name: string) {
  return `${slugify(name) || "template"}-${randomUUID().slice(0, 8)}`;
}

export function normalizeTemplateTags(tags: string[] = []) {
  const deduped: string[] = [];
  const seen = new Set<string>();

  tags
    .map((tag) => tag.trim())
    .filter(Boolean)
    .forEach((tag) => {
      const key = tag.toLowerCase();
      if (seen.has(key)) return;
      seen.add(key);
      deduped.push(tag);
    });

  if (deduped.length > MAX_TEMPLATE_TAGS) {
    throw new Error(`Máximo de ${MAX_TEMPLATE_TAGS} tags por template`);
  }

  return deduped;
}

function mapTemplateRow(row: Record<string, unknown>): ReportTemplateRow {
  const definition = row.definition_json as CustomReportDefinition;

  return {
    id: String(row.id),
    key: String(row.key),
    scope: String(row.scope) as ReportTemplateScope,
    tenant_id: row.tenant_id ? String(row.tenant_id) : null,
    created_by: row.created_by ? String(row.created_by) : null,
    updated_by: row.updated_by ? String(row.updated_by) : null,
    name: String(row.name || ""),
    description: row.description ? String(row.description) : null,
    category: String(row.category || ""),
    tags: Array.isArray(row.tags) ? row.tags.map((tag) => String(tag)).filter(Boolean) : [],
    icon: row.icon ? String(row.icon) : null,
    preview_image_url: row.preview_image_url ? String(row.preview_image_url) : null,
    definition_json: definition,
    default_schedule_json:
      row.default_schedule_json && typeof row.default_schedule_json === "object"
        ? (row.default_schedule_json as Record<string, unknown>)
        : {},
    featured: Boolean(row.featured),
    use_count: Number(row.use_count || 0),
    created_at: String(row.created_at || ""),
    updated_at: String(row.updated_at || ""),
  };
}

function summarizeTemplate(row: ReportTemplateRow): ReportTemplateSummary {
  return {
    ...row,
    dataset: row.definition_json.dataset,
    dimensions_count: row.definition_json.dimensions.length,
    metrics_count: row.definition_json.metrics.length,
  };
}

function matchesAccess(template: ReportTemplateRow, actor: ActorContext) {
  if (template.scope === "system") return true;
  if (template.tenant_id !== actor.tenantId) return false;
  if (template.scope === "tenant") return true;
  return template.created_by === actor.userId || actor.role === "master";
}

function matchesFilters(template: ReportTemplateRow, filters: ListTemplateFilters) {
  if (filters.scope && filters.scope !== "all" && template.scope !== filters.scope) return false;
  if (filters.category && template.category.toLowerCase() !== filters.category.trim().toLowerCase()) return false;
  if (filters.dataset && template.definition_json.dataset !== filters.dataset) return false;

  if (filters.search) {
    const needle = filters.search.trim().toLowerCase();
    const haystack = [
      template.name,
      template.description || "",
      template.category,
      ...template.tags,
      template.definition_json.dataset,
    ]
      .join(" ")
      .toLowerCase();

    if (!haystack.includes(needle)) return false;
  }

  return true;
}

function templateSort(left: ReportTemplateRow, right: ReportTemplateRow) {
  if (left.featured !== right.featured) return left.featured ? -1 : 1;

  const scopeOrder: Record<ReportTemplateScope, number> = {
    system: 0,
    tenant: 1,
    user: 2,
  };
  if (scopeOrder[left.scope] !== scopeOrder[right.scope]) {
    return scopeOrder[left.scope] - scopeOrder[right.scope];
  }

  if (left.use_count !== right.use_count) return right.use_count - left.use_count;
  return right.updated_at.localeCompare(left.updated_at, "pt-BR");
}

async function validateTemplateDefinition(definition: CustomReportDefinition, tenantId: string) {
  buildDefinitionSql(definition, tenantId);
  return definition;
}

async function fetchTemplatesByQuery(
  queryPromise: PromiseLike<{ data: unknown[] | null; error: { message: string } | null }>,
) {
  const { data, error } = await queryPromise;
  if (error) {
    throw new Error(`Erro ao carregar templates: ${error.message}`);
  }

  return ((data || []) as Array<Record<string, unknown>>).map(mapTemplateRow);
}

export class ReportTemplatesService {
  static async listTemplates(actor: ActorContext, filters: ListTemplateFilters = {}) {
    const [systemTemplates, tenantTemplates, userTemplates] = await Promise.all([
      fetchTemplatesByQuery(supabaseAdmin.from("report_templates").select("*").eq("scope", "system")),
      fetchTemplatesByQuery(
        supabaseAdmin
          .from("report_templates")
          .select("*")
          .eq("scope", "tenant")
          .eq("tenant_id", actor.tenantId),
      ),
      fetchTemplatesByQuery(
        supabaseAdmin
          .from("report_templates")
          .select("*")
          .eq("scope", "user")
          .eq("tenant_id", actor.tenantId)
          .eq("created_by", actor.userId),
      ),
    ]);

    const merged = [...systemTemplates, ...tenantTemplates, ...userTemplates]
      .filter((template) => matchesAccess(template, actor))
      .filter((template) => matchesFilters(template, filters))
      .sort(templateSort);

    return merged.map(summarizeTemplate);
  }

  static async getTemplate(templateId: string, actor: ActorContext) {
    const { data, error } = await supabaseAdmin
      .from("report_templates")
      .select("*")
      .eq("id", templateId)
      .maybeSingle();

    if (error) {
      throw new Error(`Erro ao buscar template: ${error.message}`);
    }
    if (!data) return null;

    const template = mapTemplateRow(data as Record<string, unknown>);
    if (!matchesAccess(template, actor)) {
      return null;
    }

    return {
      ...summarizeTemplate(template),
      definition_json: template.definition_json,
      default_schedule_json: template.default_schedule_json,
    };
  }

  static async createTemplate(input: CreateTemplateInput) {
    const definitionFromSource =
      input.sourceDefinitionId
        ? await CustomReportBuilderService.getDefinition(input.sourceDefinitionId, input.actor.tenantId)
        : null;

    if (input.sourceDefinitionId && !definitionFromSource) {
      throw new Error("Definição customizada não encontrada");
    }

    const definition = input.definition || definitionFromSource?.definition;
    if (!definition) {
      throw new Error("Informe uma definição válida para o template");
    }

    await validateTemplateDefinition(definition, input.actor.tenantId);

    const payload = {
      key: createReportTemplateKey(input.name),
      scope: input.scope,
      tenant_id: input.actor.tenantId,
      created_by: input.actor.userId,
      updated_by: input.actor.userId,
      name: input.name.trim(),
      description: trimNullable(input.description),
      category: input.category.trim(),
      tags: normalizeTemplateTags(input.tags),
      icon: trimNullable(input.icon),
      preview_image_url: trimNullable(input.previewImageUrl),
      definition_json: definition,
      default_schedule_json:
        input.defaultSchedule && typeof input.defaultSchedule === "object"
          ? input.defaultSchedule
          : {},
    };

    const { data, error } = await supabaseAdmin
      .from("report_templates")
      .insert(payload)
      .select("*")
      .single();

    if (error || !data) {
      throw new Error(`Erro ao criar template: ${error?.message || "desconhecido"}`);
    }

    void AuditService.log({
      userId: input.actor.userId,
      action: "reports.template_create",
      resource: "report_templates",
      entityId: String(data.id),
      tenantId: input.actor.tenantId,
      details: {
        message: `Template criado: ${input.name.trim()}`,
        scope: input.scope,
        category: input.category.trim(),
      },
    });

    return summarizeTemplate(mapTemplateRow(data as Record<string, unknown>));
  }

  static async useTemplate(templateId: string, actor: ActorContext) {
    const template = await this.getTemplate(templateId, actor);
    if (!template) {
      throw new Error("Template não encontrado");
    }

    const definition = await CustomReportBuilderService.createDefinition({
      tenantId: actor.tenantId,
      userId: actor.userId,
      name: template.name,
      description: template.description,
      definition: template.definition_json,
    });

    const nextUseCount = template.use_count + 1;
    await supabaseAdmin
      .from("report_templates")
      .update({
        use_count: nextUseCount,
        updated_at: new Date().toISOString(),
      })
      .eq("id", templateId);

    void AuditService.log({
      userId: actor.userId,
      action: "reports.template_use",
      resource: "report_templates",
      entityId: templateId,
      tenantId: actor.tenantId,
      details: {
        message: `Template utilizado: ${template.name}`,
        created_definition_id: definition.id,
      },
    });

    return {
      template: {
        ...template,
        use_count: nextUseCount,
      },
      definition,
    };
  }
}
