import 'dotenv/config';
import { supabase } from '../src/config/supabase';

async function runFullTest() {
    console.log('🚀 Iniciando Verificação Completa do Sistema de Auditoria...\n');

    try {
        // 1. Setup: Encontrar um usuário Master para os testes de API
        const { data: adminUser, error: userError } = await supabase
            .from('profiles')
            .select('id, email, role')
            .eq('role', 'master')
            .limit(1)
            .single();

        if (userError || !adminUser) {
            console.error('❌ Erro: Nenhum usuário master encontrado para realizar os testes.');
            return;
        }
        console.log(`✅ Usando Admin: ${adminUser.email} para testes.`);

        // 2. Teste de Inserção de Log "Antigo" para testar o Cleanup
        console.log('\n[1] Testando Log Antigo (> 90 dias)...');
        const ninetyOneDaysAgo = new Date();
        ninetyOneDaysAgo.setDate(ninetyOneDaysAgo.getDate() - 91);

        const { data: oldLog, error: insertError } = await supabase
            .from('audit_logs')
            .insert({
                user_id: adminUser.id,
                action: 'test.cleanup_target',
                resource: 'test',
                ip_address: '1.1.1.1',
                created_at: ninetyOneDaysAgo.toISOString(),
                details: { note: 'Este log deve ser deletado pelo cleanup' }
            })
            .select()
            .single();

        if (insertError) throw insertError;
        console.log(`✅ Log antigo criado: ${oldLog.id} (Data: ${ninetyOneDaysAgo.toISOString()})`);

        // 3. Teste de Inserção de Log "Recente"
        console.log('\n[2] Testando Log Recente (< 90 dias)...');
        const { data: recentLog, error: recentError } = await supabase
            .from('audit_logs')
            .insert({
                user_id: adminUser.id,
                action: 'test.keep_me',
                resource: 'test',
                ip_address: '2.2.2.2',
                details: { note: 'Este log deve ser MANTIDO' }
            })
            .select()
            .single();

        if (recentError) throw recentError;
        console.log(`✅ Log recente criado: ${recentLog.id}`);

        // 4. Teste da Lógica de Cleanup
        console.log('\n[3] Executando lógica de Cleanup (Manualmente simulado)...');

        const ninetyDaysAgo = new Date();
        ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

        const { data: deletedData, error: cleanupError, count } = await supabase
            .from('audit_logs')
            .delete()
            .lte('created_at', ninetyDaysAgo.toISOString())
            .select('*', { count: 'exact' });

        if (cleanupError) throw cleanupError;
        console.log(`✅ Cleanup executado! Registros deletados: ${count || 0}`);

        // 5. Verificação dos resultados
        console.log('\n[4] Verificando se as regras de retenção foram aplicadas...');

        const { data: checkOld } = await supabase.from('audit_logs').select('id').eq('id', oldLog.id).maybeSingle();
        if (!checkOld) {
            console.log('✅ SUCESSO: Log antigo foi removido.');
        } else {
            console.error('❌ FALHA: Log antigo ainda está no banco!');
        }

        const { data: checkRecent } = await supabase.from('audit_logs').select('id').eq('id', recentLog.id).maybeSingle();
        if (checkRecent) {
            console.log('✅ SUCESSO: Log recente foi mantido.');
        } else {
            console.error('❌ FALHA: Log recente foi removido indevidamente!');
        }

        // 6. Teste de Listagem
        console.log('\n[5] Testando Listagem de Logs...');
        const { data: listData, error: listError } = await supabase
            .from('audit_logs')
            .select('*, profiles!audit_logs_user_id_fkey(full_name)')
            .order('created_at', { ascending: false })
            .limit(5);

        if (listError) {
            console.error('❌ Erro na listagem:', listError.message);
        } else {
            console.log(`✅ Foram encontrados ${listData?.length || 0} logs na listagem.`);
        }

        console.log('\n✨ Verificação de integridade concluída!');

    } catch (err) {
        console.error('\n❌ Erro durante a verificação:', err);
    }
}

runFullTest();
