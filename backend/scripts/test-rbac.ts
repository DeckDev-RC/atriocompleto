import { AccessControlService } from "../src/services/access-control";
import { supabaseAdmin } from "../src/config/supabase";

async function testRBAC() {
    console.log("🚀 Iniciando teste do sistema RBAC...");

    try {
        // 1. Verificar Tabelas
        const tables = ["roles", "permissions", "role_permissions", "user_roles"];
        console.log("\n--- Verificando Estrutura ---");
        for (const table of tables) {
            const { error } = await supabaseAdmin.from(table).select("count", { count: "exact", head: true });
            if (error) {
                console.error(`❌ Erro na tabela ${table}:`, error.message);
            } else {
                console.log(`✅ Tabela ${table} está acessível.`);
            }
        }

        // 2. Buscar um usuário de teste
        const { data: profile } = await supabaseAdmin
            .from("profiles")
            .select("id, full_name, email")
            .limit(1)
            .single();

        if (!profile) {
            console.log("⚠️ Nenhum perfil encontrado para testar.");
            return;
        }

        console.log(`\n--- Testando Usuário: ${profile.full_name} (${profile.email}) ---`);

        // 3. Simular atribuição de papel (Admin) se não tiver
        const { data: roles } = await supabaseAdmin.from("roles").select("id").eq("name", "Admin").single();
        if (roles) {
            await supabaseAdmin.from("user_roles").upsert({
                profile_id: profile.id,
                role_id: roles.id
            });
            console.log("ℹ️ Papel 'Admin' atribuído temporariamente para o teste.");
        }

        // 4. Testar AccessControlService
        const permissions = await AccessControlService.getUserPermissions(profile.id);
        console.log("\n--- Permissões Recuperadas ---");
        console.log(JSON.stringify(permissions, null, 2));

        const hasCreatePerm = AccessControlService.hasPermission(permissions, "venda:criar");
        console.log(`\n🔍 Tem permissão 'venda:criar'? ${hasCreatePerm ? "✅ SIM" : "❌ NÃO"}`);

        if (hasCreatePerm) {
            console.log("\n🔥 TESTE CONCLUÍDO COM SUCESSO!");
        } else {
            console.log("\n⚠️ Teste finalizado com avisos (verifique se as permissões foram sementeadas corretamente).");
        }

    } catch (error) {
        console.error("\n❌ Erro crítico no teste:", error);
    }
}

testRBAC();
