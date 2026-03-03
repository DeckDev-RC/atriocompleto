import { AutoInsightsService } from "./services/autoInsights.service";
import dotenv from "dotenv";

dotenv.config();

async function testGeneration() {
    console.log("🚀 Iniciando teste de geração de insights...");

    // Teste para um tenant específico (substituir pelo ID real para teste manual)
    // Ou usar o generateAllDailyInsights
    try {
        await AutoInsightsService.generateAllDailyInsights();
        console.log("✅ Geração concluída com sucesso.");
    } catch (err) {
        console.error("❌ Erro no teste:", err);
    }
}

testGeneration();
