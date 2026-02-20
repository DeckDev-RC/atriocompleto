
import { supabaseAdmin } from "../src/config/supabase";

async function verifyUserAudit() {
    console.log("🚀 Verificando logs de auditoria de usuário...");

    // 1. Verificar logs recentes de usuários
    const { data: logs, error } = await supabaseAdmin
        .from("audit_logs")
        .select("*")
        .in("action", ["user.update_profile", "user.upload_avatar", "user.delete_avatar", "user.change_password"])
        .order("created_at", { ascending: false })
        .limit(10);

    if (error) {
        console.error("❌ Erro ao buscar logs:", error);
        return;
    }

    if (logs.length === 0) {
        console.log("⚠️ Nenhum log encontrado. Certifique-se de realizar as ações no sistema.");
    } else {
        console.log(`✅ Foram encontrados ${logs.length} logs recentes:`);
        logs.forEach(log => {
            console.log(`- [${log.created_at}] Action: ${log.action}, EntityID: ${log.entity_id}, UserID: ${log.user_id}`);
            if (log.details) {
                console.log(`  Details: ${JSON.stringify(log.details)}`);
            }
        });
    }

    console.log("\n✨ Verificação concluída!");
}

verifyUserAudit();
