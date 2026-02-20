import 'dotenv/config';
import { AuditService } from '../src/services/audit';
import { supabase } from '../src/config/supabase';

async function runTest() {
    console.log('--- Inicando Teste de Auditoria ---');

    // 1. Teste de Diff
    console.log('\n[1] Testando lógica de Diff...');
    const before = { id: '1', name: 'Empresa A', active: true, irrelevant: 'ignore' };
    const after = { id: '1', name: 'Empresa A Alterada', active: false, irrelevant: 'ignore' };

    const diff = AuditService.getDiff(before, after);
    console.log('Diff gerado:', JSON.stringify(diff, null, 2));

    if (diff.next.name === 'Empresa A Alterada' && diff.next.active === false && !diff.next.irrelevant) {
        console.log('✅ Lógica de Diff validada!');
    } else {
        console.error('❌ Falha na lógica de Diff');
    }

    // 2. Teste de Persistência (Direto via Service)
    console.log('\n[2] Testando persistência no Banco...');

    // Pegar um usuário real para o log (precisamos de um UUID válido se houver FK, mas o schema usa auth.users)
    // Como é um teste, vamos tentar inserir um log com dados fakes e ver se o Supabase aceita 
    // (considerando que user_id pode ser NULL se o usuário for deletado posteriormente)

    const testLog = {
        userId: '00000000-0000-0000-0000-000000000000', // UUID dummy (se falhar pela FK de auth, usaremos um real)
        action: 'test.verify',
        resource: 'system',
        ipAddress: '127.0.0.1',
        userAgent: 'AuditTester/1.0',
        details: {
            message: 'Este é um log de teste gerado pelo script de verificação',
            ...diff
        }
    };

    // Tentar encontrar um usuário real primeiro para evitar erro de FK
    const { data: userData } = await supabase.from('profiles').select('id').limit(1).single();
    if (userData) {
        testLog.userId = userData.id;
        console.log(`Usando usuário real para o teste: ${userData.id}`);
    }

    await AuditService.log(testLog);
    console.log('Log enviado para o banco (assíncrono). Aguardando 2s...');

    await new Promise(r => setTimeout(r, 2000));

    // 3. Verificar se o log existe
    console.log('\n[3] Verificando existência do log...');
    const { data: logs, error } = await supabase
        .from('audit_logs')
        .select('*')
        .eq('action', 'test.verify')
        .order('created_at', { ascending: false })
        .limit(1);

    if (error) {
        console.error('Erro ao buscar logs:', error);
    } else if (logs && logs.length > 0) {
        console.log('✅ Log encontrado no banco!');
        console.log('Conteúdo do log:', JSON.stringify(logs[0], null, 2));
    } else {
        console.error('❌ Log não encontrado no banco');
    }

    process.exit(0);
}

runTest().catch(err => {
    console.error('Erro fatal no teste:', err);
    process.exit(1);
});
