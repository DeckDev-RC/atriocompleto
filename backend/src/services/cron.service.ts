import cron from "node-cron";
import { AutoInsightsService } from "./autoInsights.service";
import { StrategicReportService } from "./strategicReport.service";
import { queryFunctions } from "./query-functions";
import { supabaseAdmin } from "../config/supabase";
import { ProactiveSuggestionsService } from "./optimus/proactiveSuggestions";
import { FileProcessor } from "./optimus/fileProcessor";
import { MemoryService } from "./optimus/memoryService";
import { ReportSchedulerService } from "./reportScheduler.service";
import { ReportExporterService } from "./reportExporter.service";

export function setupDailyCrons() {
  cron.schedule("0 6 * * *", async () => {
    console.log("[Cron] Iniciando pre-computacao de padroes...");
    try {
      const { data: tenants } = await supabaseAdmin.from("tenants").select("id, name");
      if (!tenants) return;

      for (const tenant of tenants) {
        const params = { _tenant_id: tenant.id } as any;
        await Promise.allSettled([
          queryFunctions.marketBasketLite(params),
          queryFunctions.getRFMAnalysis(params),
          queryFunctions.topProducts(params),
          queryFunctions.bcgMatrix(params),
        ]);
        console.log(`[Cron] Padroes pre-computados para ${tenant.name}`);
      }

      console.log("[Cron] Pre-computacao finalizada.");
    } catch (error) {
      console.error("[Cron] Erro na pre-computacao:", error);
    }
  });

  cron.schedule("30 6 * * 1", async () => {
    console.log("[Cron] Iniciando geracao do Relatorio Estrategico Semanal...");
    try {
      await StrategicReportService.generateForAllTenants();

      const { data: tenants } = await supabaseAdmin.from("tenants").select("id");
      if (tenants) {
        for (const tenant of tenants) {
          await StrategicReportService.sendReportEmail(tenant.id).catch((err) => {
            console.error(`[Cron] Erro ao enviar email estrategico para tenant ${tenant.id}:`, err);
          });
        }
      }

      console.log("[Cron] Relatorio Estrategico Semanal finalizado.");
    } catch (error) {
      console.error("[Cron] Erro no Relatorio Estrategico:", error);
    }
  });

  cron.schedule("0 7 * * *", async () => {
    console.log("[Cron] Iniciando geracao diaria de Insights Automaticos...");
    try {
      await AutoInsightsService.generateAllDailyInsights();
      console.log("[Cron] Geracao diaria finalizada com sucesso.");
    } catch (error) {
      console.error("[Cron] Erro na geracao diaria de insights:", error);
    }
  });

  cron.schedule("15 7 * * *", async () => {
    console.log("[Cron] Iniciando geracao diaria de Sugestoes Proativas do Optimus...");
    try {
      await ProactiveSuggestionsService.generateForAllTenants();
      console.log("[Cron] Sugestoes Proativas do Optimus geradas com sucesso.");
    } catch (error) {
      console.error("[Cron] Erro na geracao de sugestoes do Optimus:", error);
    }
  });

  cron.schedule("0 * * * *", async () => {
    console.log("[Cron] Limpando uploads temporarios expirados...");
    try {
      await FileProcessor.cleanupExpiredFiles();
    } catch (error) {
      console.error("[Cron] Erro na limpeza de uploads temporarios:", error);
    }
  });

  cron.schedule("30 3 * * *", async () => {
    console.log("[Cron] Limpando conversas e memorias expiradas...");
    try {
      await Promise.allSettled([
        MemoryService.cleanupExpiredConversationData(),
        MemoryService.pruneStaleMemories(),
      ]);
    } catch (error) {
      console.error("[Cron] Erro na limpeza de memoria:", error);
    }
  });

  cron.schedule("0 4 * * *", async () => {
    console.log("[Cron] Limpando histórico expirado de relatórios agendados...");
    try {
      await ReportSchedulerService.cleanupExpiredExecutions(90);
    } catch (error) {
      console.error("[Cron] Erro na limpeza de relatórios expirados:", error);
    }
  });

  cron.schedule("30 4 * * *", async () => {
    console.log("[Cron] Limpando exports expirados de relatórios...");
    try {
      await ReportExporterService.cleanupExpiredExports();
    } catch (error) {
      console.error("[Cron] Erro na limpeza de exports expirados:", error);
    }
  });

  console.log("[Cron] Agendamentos configurados (06:00 padroes, 06:30/seg estrategia, 07:00 insights, 07:15 sugestoes, hora em hora cleanup arquivos, 03:30 cleanup memoria, 04:00 cleanup relatorios, 04:30 cleanup exports).");
}
