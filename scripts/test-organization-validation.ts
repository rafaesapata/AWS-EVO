#!/usr/bin/env tsx
/**
 * Script de Teste: Validação de Organização
 * 
 * Testa o fluxo completo de validação de organização no login
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

interface TestResult {
  test: string;
  passed: boolean;
  message: string;
}

async function runTests() {
  console.log('🧪 Iniciando testes de validação de organização...\n');

  const results: TestResult[] = [];

  try {
    // Test 1: Verificar se organização UDS existe
    console.log('📋 Test 1: Verificar organização UDS...');
    const organization = await prisma.organization.findUnique({
      where: { slug: 'uds' },
    });

    if (organization) {
      results.push({
        test: 'Organização UDS existe',
        passed: true,
        message: `Organização encontrada: ${organization.id}`,
      });
      console.log('   ✅ PASSOU: Organização UDS existe\n');
    } else {
      results.push({
        test: 'Organização UDS existe',
        passed: false,
        message: 'Organização UDS não encontrada',
      });
      console.log('   ❌ FALHOU: Organização UDS não encontrada\n');
    }

    // Test 2: Verificar se existem profiles vinculados
    console.log('📋 Test 2: Verificar profiles vinculados...');
    const profileCount = await prisma.profile.count({
      where: { organization_id: organization?.id },
    });

    if (profileCount > 0) {
      results.push({
        test: 'Profiles vinculados à organização',
        passed: true,
        message: `${profileCount} profiles encontrados`,
      });
      console.log(`   ✅ PASSOU: ${profileCount} profiles vinculados\n`);
    } else {
      results.push({
        test: 'Profiles vinculados à organização',
        passed: false,
        message: 'Nenhum profile vinculado',
      });
      console.log('   ⚠️  AVISO: Nenhum profile vinculado ainda\n');
    }

    // Test 3: Verificar estrutura da tabela profiles
    console.log('📋 Test 3: Verificar estrutura da tabela profiles...');
    const sampleProfile = await prisma.profile.findFirst({
      include: {
        organization: true,
      },
    });

    if (sampleProfile) {
      const hasRequiredFields = 
        sampleProfile.user_id &&
        sampleProfile.organization_id &&
        sampleProfile.organization;

      if (hasRequiredFields) {
        results.push({
          test: 'Estrutura da tabela profiles',
          passed: true,
          message: 'Todos os campos obrigatórios presentes',
        });
        console.log('   ✅ PASSOU: Estrutura correta\n');
      } else {
        results.push({
          test: 'Estrutura da tabela profiles',
          passed: false,
          message: 'Campos obrigatórios ausentes',
        });
        console.log('   ❌ FALHOU: Campos obrigatórios ausentes\n');
      }
    } else {
      results.push({
        test: 'Estrutura da tabela profiles',
        passed: false,
        message: 'Nenhum profile para validar estrutura',
      });
      console.log('   ⚠️  AVISO: Nenhum profile para validar\n');
    }

    // Test 4: Verificar unicidade de user_id + organization_id
    console.log('📋 Test 4: Verificar constraint de unicidade...');
    const duplicates = await prisma.$queryRaw<Array<{ user_id: string; count: number }>>`
      SELECT user_id, COUNT(*) as count
      FROM profiles
      WHERE organization_id = ${organization?.id}::uuid
      GROUP BY user_id
      HAVING COUNT(*) > 1
    `;

    if (duplicates.length === 0) {
      results.push({
        test: 'Constraint de unicidade',
        passed: true,
        message: 'Nenhum usuário duplicado',
      });
      console.log('   ✅ PASSOU: Sem duplicatas\n');
    } else {
      results.push({
        test: 'Constraint de unicidade',
        passed: false,
        message: `${duplicates.length} usuários duplicados encontrados`,
      });
      console.log(`   ❌ FALHOU: ${duplicates.length} duplicatas encontradas\n`);
    }

    // Test 5: Verificar índices
    console.log('📋 Test 5: Verificar índices da tabela...');
    const indexes = await prisma.$queryRaw<Array<{ indexname: string }>>`
      SELECT indexname
      FROM pg_indexes
      WHERE tablename = 'profiles'
    `;

    const hasUniqueIndex = indexes.some(idx => 
      idx.indexname.includes('user_id') && idx.indexname.includes('organization_id')
    );

    if (hasUniqueIndex) {
      results.push({
        test: 'Índices da tabela',
        passed: true,
        message: 'Índice único encontrado',
      });
      console.log('   ✅ PASSOU: Índices corretos\n');
    } else {
      results.push({
        test: 'Índices da tabela',
        passed: false,
        message: 'Índice único não encontrado',
      });
      console.log('   ⚠️  AVISO: Índice único pode estar ausente\n');
    }

    // Test 6: Simular criação de profile
    console.log('📋 Test 6: Simular criação de profile...');
    const testUserId = '00000000-0000-0000-0000-000000000001';
    
    try {
      // Tentar criar profile de teste
      const testProfile = await prisma.profile.create({
        data: {
          user_id: testUserId,
          organization_id: organization!.id,
          full_name: 'Usuário Teste',
          role: 'user',
        },
      });

      // Limpar profile de teste
      await prisma.profile.delete({
        where: { id: testProfile.id },
      });

      results.push({
        test: 'Criação de profile',
        passed: true,
        message: 'Profile criado e removido com sucesso',
      });
      console.log('   ✅ PASSOU: Criação de profile funciona\n');
    } catch (error: any) {
      if (error.code === 'P2002') {
        // Constraint violation - esperado se já existe
        results.push({
          test: 'Criação de profile',
          passed: true,
          message: 'Constraint de unicidade funcionando',
        });
        console.log('   ✅ PASSOU: Constraint funcionando\n');
      } else {
        results.push({
          test: 'Criação de profile',
          passed: false,
          message: `Erro: ${error.message}`,
        });
        console.log(`   ❌ FALHOU: ${error.message}\n`);
      }
    }

    // Resumo dos testes
    console.log('\n' + '='.repeat(60));
    console.log('📊 RESUMO DOS TESTES');
    console.log('='.repeat(60) + '\n');

    const passedTests = results.filter(r => r.passed).length;
    const totalTests = results.length;
    const percentage = ((passedTests / totalTests) * 100).toFixed(1);

    results.forEach(result => {
      const icon = result.passed ? '✅' : '❌';
      console.log(`${icon} ${result.test}`);
      console.log(`   ${result.message}\n`);
    });

    console.log('='.repeat(60));
    console.log(`Testes passados: ${passedTests}/${totalTests} (${percentage}%)`);
    console.log('='.repeat(60) + '\n');

    if (passedTests === totalTests) {
      console.log('🎉 Todos os testes passaram! Sistema pronto para uso.\n');
      process.exit(0);
    } else {
      console.log('⚠️  Alguns testes falharam. Verifique os erros acima.\n');
      process.exit(1);
    }

  } catch (error) {
    console.error('\n❌ Erro durante os testes:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

// Executar testes
runTests().catch(console.error);
