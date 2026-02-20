
import { redis } from '../src/config/redis';

async function unblockDev() {
    console.log("🔓 Limpando todos os bloqueios e contadores de Rate Limit...");

    try {
        const keys = await redis.keys('ratelimit:*');

        if (keys.length === 0) {
            console.log("✨ Nenhum bloqueio encontrado no Redis.");
            return;
        }

        console.log(`🗑️ Removendo ${keys.length} chaves...`);
        await redis.del(...keys);

        console.log("✅ Sistema liberado! Você já pode acessar a aplicação novamente.");
    } catch (error: any) {
        console.error("❌ Erro ao limpar chaves:", error.message);
    } finally {
        process.exit(0);
    }
}

unblockDev();
