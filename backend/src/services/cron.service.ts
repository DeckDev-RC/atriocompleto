import cron from "node-cron";
import { AutoInsightsService } from "./autoInsights.service";

export function setupDailyCrons() {
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
    console.log("[Cron] Agendamentos de Inteligência Artificial configurados (07:00).");
}
