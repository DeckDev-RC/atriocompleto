import cron from "node-cron";
import { AutoInsightsService } from "./autoInsights.service";
import { StrategicReportService } from "./strategicReport.service";
import { queryFunctions } from "./query-functions";
import { supabaseAdmin } from "../config/supabase";

export function setupDailyCrons() {
    // Roda todo dia às 06:00 — pré-computa padrões (cache Redis)
    cron.schedule("0 6 * * *", async () => {
        console.log("[Cron] Iniciando pré-computação de padrões...");
        try {
            const { data: tenants } = await supabaseAdmin.from("tenants").select("id, name");
            if (!tenants) return;

            for (const t of tenants) {
                const params = { _tenant_id: t.id } as any;
                await Promise.allSettled([
                    queryFunctions.marketBasketLite(params),
                    queryFunctions.getRFMAnalysis(params),
                    queryFunctions.topProducts(params),
                    queryFunctions.bcgMatrix(params),
                ]);
                console.log(`[Cron] Padrões pré-computados para ${t.name}`);
            }
            console.log("[Cron] Pré-computação finalizada.");
        } catch (error) {
            console.error("[Cron] Erro na pré-computação:", error);
        }
    });

    // Roda toda segunda às 06:30 — Relatório Estratégico Semanal
    cron.schedule("30 6 * * 1", async () => {
        console.log("[Cron] Iniciando geração do Relatório Estratégico Semanal...");
        try {
            await StrategicReportService.generateForAllTenants();

            // Send emails
            const { data: tenants } = await supabaseAdmin.from("tenants").select("id");
            if (tenants) {
                for (const t of tenants) {
                    await StrategicReportService.sendReportEmail(t.id).catch(err =>
                        console.error(`[Cron] Erro ao enviar email estratégico para tenant ${t.id}:`, err)
                    );
                }
            }

            console.log("[Cron] Relatório Estratégico Semanal finalizado.");
        } catch (error) {
            console.error("[Cron] Erro no Relatório Estratégico:", error);
        }
    });

    // Roda todo dia às 07:00 da manhã
    cron.schedule("0 7 * * *", async () => {
        console.log("[Cron] Iniciando geração diária de Insights Automáticos...");
        try {
            await AutoInsightsService.generateAllDailyInsights();
            console.log("[Cron] Geração diária finalizada com sucesso.");
        } catch (error) {
            console.error("[Cron] Erro na geração diária de insights:", error);
        }
    });
    console.log("[Cron] Agendamentos configurados (06:00 padrões, 06:30/seg estratégia, 07:00 insights).");
}

