const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient({
  datasources: {
    db: {
      url: 'postgresql://evoadmin:%29V7%3F9ygLec%3FAMSqn%29.UIU4%24vOfRl%2C%24%5EL@evo-uds-v3-production-postgres.c070y4ceohf7.us-east-1.rds.amazonaws.com:5432/evouds?schema=public'
    }
  }
});

async function debugDailyCosts() {
  try {
    console.log('🔍 Verificando dados na tabela daily_costs...');
    
    const organizationId = 'f7c9c432-d2c9-41ad-be8f-38883c06cb48';
    
    // Contar total de registros
    const totalCount = await prisma.dailyCost.count({
      where: {
        organization_id: organizationId
      }
    });
    
    console.log(`📊 Total de registros para organização: ${totalCount}`);
    
    // Buscar registros mais recentes
    const recentCosts = await prisma.dailyCost.findMany({
      where: {
        organization_id: organizationId
      },
      orderBy: {
        date: 'desc'
      },
      take: 10,
      select: {
        id: true,
        date: true,
        service: true,
        cost: true,
        aws_account_id: true,
        created_at: true
      }
    });
    
    console.log('📅 Registros mais recentes:');
    recentCosts.forEach(cost => {
      console.log(`  ${cost.date.toISOString().split('T')[0]} | ${cost.service} | $${cost.cost} | Account: ${cost.aws_account_id}`);
    });
    
    // Verificar contas AWS
    const awsAccounts = await prisma.awsCredential.findMany({
      where: {
        organization_id: organizationId,
        is_active: true
      },
      select: {
        id: true,
        account_name: true,
        account_id: true
      }
    });
    
    console.log('🔑 Contas AWS ativas:');
    awsAccounts.forEach(account => {
      console.log(`  ${account.id} | ${account.account_name} | AWS ID: ${account.account_id}`);
    });
    
    // Verificar se há dados para cada conta
    for (const account of awsAccounts) {
      const accountCosts = await prisma.dailyCost.count({
        where: {
          organization_id: organizationId,
          aws_account_id: account.id
        }
      });
      console.log(`💰 Registros de custo para ${account.account_name}: ${accountCosts}`);
    }
    
    // Verificar datas disponíveis
    const dateRange = await prisma.dailyCost.aggregate({
      where: {
        organization_id: organizationId
      },
      _min: {
        date: true
      },
      _max: {
        date: true
      }
    });
    
    console.log('📆 Período de dados disponível:');
    console.log(`  Início: ${dateRange._min.date?.toISOString().split('T')[0] || 'N/A'}`);
    console.log(`  Fim: ${dateRange._max.date?.toISOString().split('T')[0] || 'N/A'}`);
    
  } catch (error) {
    console.error('❌ Erro ao verificar dados:', error);
  } finally {
    await prisma.$disconnect();
  }
}

debugDailyCosts();