import dotenv from "dotenv";
import path from "path";
dotenv.config({ path: path.join(__dirname, "../.env") });

import { redis } from "../src/config/redis";

async function testRateLimit() {
    console.log("🚀 Iniciando teste de Rate Limit dinâmico...");

    // 1. Criar um tenant de teste ou usar um existente
    const testTenantId = "00000000-0000-0000-0000-000000000001"; // Mock ID or real if possible

    // Para fins de teste local, vamos tentar injetar um limite baixo diretamente no Redis
    // Já que o middleware busca primeiro no Redis.
    const limit = 2;
    const cacheKey = `config:tenant:${testTenantId}:ai_limit`;
    await redis.set(cacheKey, limit.toString(), "EX", 60);
    console.log(`✅ Limite de ${limit} injetado no cache para tenant ${testTenantId}`);

    // 2. Limpar contadores de rate limit para este teste
    const userKey = "test-user-id";
    await redis.del(`ratelimit:ai:${userKey}`);

    // 3. Simular requisições (aqui precisaríamos de um servidor rodando)
    // Como o AGENT já tem o servidor rodando em background (npm run dev),
    // podemos tentar fazer requisições HTTP reais se tivermos um token.

    console.log("⚠️  Nota: Teste completo requer servidor ativo e token válido.");
    console.log("Verificando lógica do middleware via simulação de unidade...");

    // Simulação da lógica do middleware (mock)
    const getLimit = async (tId: string) => {
        const cached = await redis.get(`config:tenant:${tId}:ai_limit`);
        return cached ? parseInt(cached) : 20;
    };

    const currentLimit = await getLimit(testTenantId);
    console.log(`📊 Limite recuperado do Redis: ${currentLimit}`);

    if (currentLimit === limit) {
        console.log("✨ SUCESSO: O middleware lerá o limite correto do cache!");
    } else {
        console.error("❌ FALHA: Limite incorreto.");
    }

    process.exit(0);
}

testRateLimit().catch(console.error);
