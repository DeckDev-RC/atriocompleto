
import dotenv from 'dotenv';

dotenv.config();

const API_URL = process.env.API_URL || 'http://localhost:3001';
const TEST_EMAIL = 'test-stress@example.com';
const TEST_PASSWORD = 'password123';

async function runStressTest() {
    console.log("🚀 Iniciando Teste de Estresse de Rate Limiting...");
    console.log(`📍 Alvo: ${API_URL}/api/auth/login`);

    let attempts = 0;
    let blocked = false;
    const maxAttempts = 20;

    for (let i = 1; i <= maxAttempts; i++) {
        attempts++;
        try {
            process.stdout.write(`[\u23F3] Tentativa ${i}... `);
            const response = await fetch(`${API_URL}/api/auth/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    email: TEST_EMAIL,
                    password: TEST_PASSWORD
                })
            });

            const data = await response.json().catch(() => ({}));

            if (response.status === 200) {
                console.log("✅ Sucesso (200)");
            } else if (response.status === 429) {
                console.log("⚠️ Rate Limit (429)");
            } else if (response.status === 403) {
                console.log("🚫 BLOQUEADO (403) - IP banido com sucesso!");
                blocked = true;
                break;
            } else {
                console.log(`❓ Status ${response.status}: ${JSON.stringify(data)}`);
            }

        } catch (error: any) {
            console.log(`❌ Erro: ${error.message}`);
        }

        await new Promise(resolve => setTimeout(resolve, 100));
    }

    console.log("\n--- RESULTADO ---");
    console.log(`Tentativas totais: ${attempts}`);
    if (blocked) {
        console.log("✅ RESULTADO: O sistema bloqueou o IP automaticamente conforme esperado.");
        console.log("💡 Agora você pode verificar o IP bloqueado no painel Admin (Aba Segurança).");
    } else {
        console.log("❌ RESULTADO: O IP não foi bloqueado. Verifique os limites configurados.");
    }
}

runStressTest();
