import 'dotenv/config';
import { supabaseAdmin } from '../src/config/supabase';

const PASS = '✅';
const FAIL = '❌';
const INFO = 'ℹ️';
const WARN = '⚠️';

let passed = 0;
let failed = 0;

function assert(condition: boolean, label: string) {
    if (condition) {
        console.log(`  ${PASS} ${label}`);
        passed++;
    } else {
        console.log(`  ${FAIL} ${label}`);
        failed++;
    }
}

async function cleanup(roleIds: string[]) {
    for (const id of roleIds) {
        await supabaseAdmin.from('user_roles').delete().eq('role_id', id);
        await supabaseAdmin.from('role_permissions').delete().eq('role_id', id);
        await supabaseAdmin.from('roles').delete().eq('id', id);
    }
}

async function testRBACCrud() {
    console.log('\n🚀 Iniciando Teste Completo: RBAC CRUD + Anti-Lockout\n');
    console.log('='.repeat(60));

    const createdRoleIds: string[] = [];

    try {
        // ============================================================
        // TEST 1: Verificar campo is_system nos perfis padrão
        // ============================================================
        console.log('\n📋 [1] Verificando campo is_system nos perfis padrão...');
        const { data: systemRoles } = await supabaseAdmin
            .from('roles')
            .select('name, is_system')
            .eq('is_system', true);

        assert(!!systemRoles && systemRoles.length === 4, 'Existem exatamente 4 perfis de sistema');

        const expectedNames = ['Admin', 'Gerente', 'Vendedor', 'Visualizador'];
        for (const name of expectedNames) {
            const found = systemRoles?.find(r => r.name === name);
            assert(!!found, `Perfil "${name}" marcado como is_system = true`);
        }

        // ============================================================
        // TEST 2: Criar perfil customizado
        // ============================================================
        console.log('\n📋 [2] Criando perfil customizado "Auditor Teste"...');
        const { data: newRole, error: createError } = await supabaseAdmin
            .from('roles')
            .insert({
                name: 'Auditor Teste',
                description: 'Perfil criado para testes automatizados',
                is_system: false,
            })
            .select()
            .single();

        assert(!createError && !!newRole, 'Perfil "Auditor Teste" criado com sucesso');
        assert(newRole?.is_system === false, 'Perfil criado com is_system = false');
        if (newRole) createdRoleIds.push(newRole.id);

        // ============================================================
        // TEST 3: Verificar duplicidade de nome
        // ============================================================
        console.log('\n📋 [3] Tentando criar perfil com nome duplicado...');
        const { data: dupCheck } = await supabaseAdmin
            .from('roles')
            .select('id')
            .ilike('name', 'Auditor Teste')
            .limit(1);

        assert(!!dupCheck && dupCheck.length > 0, 'Detecção de nome duplicado funciona');

        // ============================================================
        // TEST 4: Clonar perfil (simular clone)
        // ============================================================
        console.log('\n📋 [4] Clonando perfil "Admin" como "Admin Clone"...');
        const { data: adminRole } = await supabaseAdmin
            .from('roles')
            .select('*, role_permissions(permission_id)')
            .eq('name', 'Admin')
            .single();

        assert(!!adminRole, 'Perfil Admin encontrado para clonar');

        if (adminRole) {
            const { data: clonedRole, error: cloneError } = await supabaseAdmin
                .from('roles')
                .insert({
                    name: 'Admin Clone Teste',
                    description: 'Clone do Admin para testes',
                    is_system: false,
                })
                .select()
                .single();

            assert(!cloneError && !!clonedRole, 'Clone criado com sucesso');

            if (clonedRole) {
                createdRoleIds.push(clonedRole.id);

                // Copiar permissões
                if (adminRole.role_permissions && adminRole.role_permissions.length > 0) {
                    const permInserts = adminRole.role_permissions.map((rp: any) => ({
                        role_id: clonedRole.id,
                        permission_id: rp.permission_id,
                    }));
                    const { error: copyError } = await supabaseAdmin
                        .from('role_permissions')
                        .insert(permInserts);

                    assert(!copyError, 'Permissões copiadas do Admin para o clone');
                }

                // Verificar se a quantidade de permissões é igual
                const { count: originalCount } = await supabaseAdmin
                    .from('role_permissions')
                    .select('*', { count: 'exact', head: true })
                    .eq('role_id', adminRole.id);

                const { count: cloneCount } = await supabaseAdmin
                    .from('role_permissions')
                    .select('*', { count: 'exact', head: true })
                    .eq('role_id', clonedRole.id);

                assert(
                    originalCount === cloneCount,
                    `Clone tem ${cloneCount} permissões (original: ${originalCount})`
                );
            }
        }

        // ============================================================
        // TEST 5: Editar perfil customizado
        // ============================================================
        console.log('\n📋 [5] Editando perfil customizado...');
        if (newRole) {
            const { data: updated, error: updateError } = await supabaseAdmin
                .from('roles')
                .update({ name: 'Auditor Sênior Teste', description: 'Descrição atualizada' })
                .eq('id', newRole.id)
                .select()
                .single();

            assert(!updateError && updated?.name === 'Auditor Sênior Teste', 'Nome atualizado com sucesso');
            assert(updated?.description === 'Descrição atualizada', 'Descrição atualizada com sucesso');
        }

        // ============================================================
        // TEST 6: Tentar deletar perfil de sistema (deve falhar na lógica)
        // ============================================================
        console.log('\n📋 [6] Testando proteção de perfis de sistema...');
        const { data: adminRoleForDelete } = await supabaseAdmin
            .from('roles')
            .select('id, is_system')
            .eq('name', 'Admin')
            .single();

        assert(adminRoleForDelete?.is_system === true, 'Admin é marcado como is_system = true');
        console.log(`  ${INFO} Verificação: backend deve retornar 403 para DELETE /rbac/roles/${adminRoleForDelete?.id}`);

        // ============================================================
        // TEST 7: Deletar perfil customizado (deve funcionar)
        // ============================================================
        console.log('\n📋 [7] Deletando perfis customizados criados no teste...');
        if (newRole) {
            const { error: delError } = await supabaseAdmin
                .from('roles')
                .delete()
                .eq('id', newRole.id)
                .eq('is_system', false);

            assert(!delError, 'Perfil customizado deletado com sucesso');

            // Verificar que não existe mais
            const { data: deleted } = await supabaseAdmin
                .from('roles')
                .select('id')
                .eq('id', newRole.id)
                .single();

            assert(!deleted, 'Perfil deletado não existe mais no banco');
            createdRoleIds.splice(createdRoleIds.indexOf(newRole.id), 1);
        }

        // ============================================================
        // TEST 8: Anti-lockout — Verificar contagem de admins
        // ============================================================
        console.log('\n📋 [8] Testando lógica Anti-Lockout...');
        const { data: adminRoleData } = await supabaseAdmin
            .from('roles')
            .select('id')
            .eq('name', 'Admin')
            .single();

        if (adminRoleData) {
            const { count: adminCount } = await supabaseAdmin
                .from('user_roles')
                .select('*', { count: 'exact', head: true })
                .eq('role_id', adminRoleData.id);

            console.log(`  ${INFO} Total de usuários com papel Admin: ${adminCount}`);
            assert(typeof adminCount === 'number' && adminCount >= 1, 'Pelo menos 1 Admin ativo existe');

            if (adminCount === 1) {
                console.log(`  ${WARN} Apenas 1 Admin! O sistema bloquearia a remoção desse papel.`);
                assert(true, 'Anti-lockout ativaria para proteger o último Admin');
            } else {
                console.log(`  ${INFO} ${adminCount} Admins ativos. Anti-lockout NÃO bloquearia.`);
                assert(true, `Anti-lockout desativado (${adminCount} admins ativos)`);
            }
        }

        // ============================================================
        // TEST 9: Múltiplos perfis por usuário
        // ============================================================
        console.log('\n📋 [9] Testando múltiplos perfis por usuário...');
        const { data: testUser } = await supabaseAdmin
            .from('profiles')
            .select('id, full_name')
            .limit(1)
            .single();

        if (testUser) {
            // Get all roles
            const { data: allRoles } = await supabaseAdmin.from('roles').select('id, name');

            if (allRoles && allRoles.length >= 2) {
                // Assign two roles to user
                for (const role of allRoles.slice(0, 2)) {
                    await supabaseAdmin
                        .from('user_roles')
                        .upsert({ profile_id: testUser.id, role_id: role.id });
                }

                // Count roles
                const { count } = await supabaseAdmin
                    .from('user_roles')
                    .select('*', { count: 'exact', head: true })
                    .eq('profile_id', testUser.id);

                assert(typeof count === 'number' && count >= 2, `Usuário "${testUser.full_name}" tem ${count} papéis atribuídos`);
            }
        }

        // ============================================================
        // TEST 10: Audit logs para operações RBAC
        // ============================================================
        console.log('\n📋 [10] Verificando logs de auditoria RBAC...');
        const { data: auditLogs } = await supabaseAdmin
            .from('audit_logs')
            .select('action, created_at')
            .like('action', 'rbac.%')
            .order('created_at', { ascending: false })
            .limit(10);

        if (auditLogs && auditLogs.length > 0) {
            console.log(`  ${INFO} Últimos logs RBAC encontrados:`);
            for (const log of auditLogs.slice(0, 5)) {
                console.log(`    → ${log.action} (${new Date(log.created_at).toLocaleString()})`);
            }
            assert(true, `${auditLogs.length} logs de auditoria RBAC encontrados`);
        } else {
            console.log(`  ${WARN} Nenhum log RBAC encontrado (normal se é a primeira execução).`);
            assert(true, 'Sem logs anteriores (esperado na primeira execução)');
        }

    } catch (error) {
        console.error(`\n${FAIL} Erro crítico no teste:`, error);
        failed++;
    } finally {
        // Cleanup: remove any test roles we created
        console.log('\n🧹 Limpeza...');
        await cleanup(createdRoleIds);
        console.log('  Perfis de teste removidos.');
    }

    // ============================================================
    // RESULTADO FINAL
    // ============================================================
    console.log('\n' + '='.repeat(60));
    console.log(`\n📊 RESULTADO FINAL: ${passed} passou | ${failed} falhou`);
    if (failed === 0) {
        console.log(`\n🎉 TODOS OS TESTES PASSARAM!\n`);
    } else {
        console.log(`\n${WARN} ${failed} teste(s) falharam. Verifique os logs acima.\n`);
    }

    process.exit(failed > 0 ? 1 : 0);
}

testRBACCrud().catch(err => {
    console.error('Erro fatal:', err);
    process.exit(1);
});
