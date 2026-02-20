import 'dotenv/config';
import { supabaseAdmin } from '../src/config/supabase';

const PASS = '✅';
const FAIL = '❌';

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

async function testPermissionMetadata() {
    console.log('\n🚀 Teste: Verificação das Correções (Fix 1, 2, 3)\n');
    console.log('='.repeat(60));

    // ============================================================
    // TEST 1: Verificar colunas label, category, icon existem
    // ============================================================
    console.log('\n📋 [Fix 3] Verificando colunas de metadata na tabela permissions...');

    // Direct query to check columns
    const { data: perms, error: permsError } = await supabaseAdmin
        .from('permissions')
        .select('name, label, category, icon')
        .order('category');

    assert(!permsError, 'Consulta permissions com label/category/icon sem erros');
    assert(!!perms && perms.length > 0, `${perms?.length || 0} permissões encontradas`);

    // ============================================================
    // TEST 2: Todas as 7 permissões têm label preenchido
    // ============================================================
    console.log('\n📋 [Fix 3] Verificando que todas permissões têm label...');
    if (perms) {
        const withLabel = perms.filter(p => p.label && p.label.length > 0);
        assert(withLabel.length === perms.length, `${withLabel.length}/${perms.length} permissões com label preenchido`);

        for (const perm of perms) {
            assert(!!perm.label, `  "${perm.name}" → label: "${perm.label}"`);
        }
    }

    // ============================================================
    // TEST 3: Todas as permissões têm category preenchido
    // ============================================================
    console.log('\n📋 [Fix 3] Verificando que todas permissões têm category...');
    if (perms) {
        const withCategory = perms.filter(p => p.category && p.category.length > 0);
        assert(withCategory.length === perms.length, `${withCategory.length}/${perms.length} permissões com category preenchido`);

        // Verificar categorias esperadas
        const categories = [...new Set(perms.map(p => p.category))];
        console.log(`  ℹ️ Categorias encontradas: ${categories.join(', ')}`);
        assert(categories.length >= 3, `Pelo menos 3 categorias distintas (encontradas: ${categories.length})`);
    }

    // ============================================================
    // TEST 4: Todas as permissões têm icon preenchido
    // ============================================================
    console.log('\n📋 [Fix 3] Verificando que todas permissões têm icon...');
    if (perms) {
        const withIcon = perms.filter(p => p.icon && p.icon.length > 0);
        assert(withIcon.length === perms.length, `${withIcon.length}/${perms.length} permissões com icon preenchido`);

        // Validar que os nomes do icon são válidos para o ICON_MAP do frontend
        const validIcons = ['ShoppingCart', 'User', 'Settings', 'Bot', 'FileText', 'Lock'];
        for (const perm of perms) {
            const isValid = validIcons.includes(perm.icon || '');
            assert(isValid, `  "${perm.name}" → icon: "${perm.icon}" (${isValid ? 'mapeado' : 'NÃO MAPEADO'})`);
        }
    }

    // ============================================================
    // TEST 5: Testa que is_system está consistente nos roles
    // ============================================================
    console.log('\n📋 [Regressão] Verificando is_system nos roles...');
    const { data: roles } = await supabaseAdmin
        .from('roles')
        .select('name, is_system');

    if (roles) {
        const systemRoles = roles.filter(r => r.is_system);
        assert(systemRoles.length === 4, `4 perfis de sistema (encontrados: ${systemRoles.length})`);

        const customRoles = roles.filter(r => !r.is_system);
        console.log(`  ℹ️ Perfis customizados: ${customRoles.length}`);
    }

    // ============================================================
    // TEST 6: Verificar integridade da relação role_permissions
    // ============================================================
    console.log('\n📋 [Regressão] Verificando integridade de role_permissions...');
    const { data: rps, error: rpError } = await supabaseAdmin
        .from('role_permissions')
        .select('role_id, permission_id, roles(name), permissions(name)')
        .limit(50);

    assert(!rpError, 'Consulta role_permissions com JOINs sem erros');
    assert(!!rps && rps.length > 0, `${rps?.length || 0} associações role↔permission encontradas`);

    // Verify no orphaned references
    if (rps) {
        const orphaned = rps.filter((rp: any) => !rp.roles || !rp.permissions);
        assert(orphaned.length === 0, `0 referências órfãs (encontradas: ${orphaned.length})`);
    }

    // ============================================================
    // RESULTADO FINAL
    // ============================================================
    console.log('\n' + '='.repeat(60));
    console.log(`\n📊 RESULTADO FINAL: ${passed} passou | ${failed} falhou`);
    if (failed === 0) {
        console.log(`\n🎉 TODAS AS CORREÇÕES VALIDADAS!\n`);
    } else {
        console.log(`\n⚠️ ${failed} teste(s) falharam.\n`);
    }

    process.exit(failed > 0 ? 1 : 0);
}

testPermissionMetadata().catch(err => {
    console.error('Erro fatal:', err);
    process.exit(1);
});
