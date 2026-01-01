import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient({
  datasources: {
    db: {
      url: process.env.DATABASE_URL
    }
  }
});

async function debugCloudTrailAnalysis() {
  try {
    console.log('🔍 Verificando análises CloudTrail...\n');

    // Buscar análises recentes
    const recentAnalyses = await prisma.cloudTrailAnalysis.findMany({
      orderBy: { created_at: 'desc' },
      take: 10,
      select: {
        id: true,
        status: true,
        aws_account_id: true,
        organization_id: true,
        hours_back: true,
        events_processed: true,
        started_at: true,
        completed_at: true,
        created_at: true,
        period_start: true,
        period_end: true,
        results: true
      }
    });

    console.log(`📊 Encontradas ${recentAnalyses.length} análises recentes:`);
    
    for (const analysis of recentAnalyses) {
      const duration = analysis.completed_at 
        ? Math.round((new Date(analysis.completed_at) - new Date(analysis.started_at)) / 1000)
        : Math.round((new Date() - new Date(analysis.started_at)) / 1000);
      
      console.log(`\n🔸 ID: ${analysis.id}`);
      console.log(`   Status: ${analysis.status}`);
      console.log(`   Account: ${analysis.aws_account_id}`);
      console.log(`   Org: ${analysis.organization_id}`);
      console.log(`   Período: ${analysis.hours_back}h (${analysis.period_start?.toISOString()} - ${analysis.period_end?.toISOString()})`);
      console.log(`   Eventos: ${analysis.events_processed || 'N/A'}`);
      console.log(`   Iniciado: ${analysis.started_at?.toISOString()}`);
      console.log(`   Concluído: ${analysis.completed_at?.toISOString() || 'Em andamento'}`);
      console.log(`   Duração: ${duration}s`);
      
      if (analysis.results) {
        const results = typeof analysis.results === 'string' 
          ? JSON.parse(analysis.results) 
          : analysis.results;
        
        if (results.error) {
          console.log(`   ❌ Erro: ${results.error}`);
        } else if (results.summary) {
          console.log(`   📈 Resumo: ${JSON.stringify(results.summary, null, 2)}`);
        }
      }
    }

    // Verificar análises em execução
    const runningAnalyses = await prisma.cloudTrailAnalysis.findMany({
      where: { status: 'running' },
      select: {
        id: true,
        aws_account_id: true,
        started_at: true,
        hours_back: true
      }
    });

    console.log(`\n🏃 Análises em execução: ${runningAnalyses.length}`);
    for (const analysis of runningAnalyses) {
      const duration = Math.round((new Date() - new Date(analysis.started_at)) / 1000);
      console.log(`   - ID: ${analysis.id}, Account: ${analysis.aws_account_id}, Duração: ${duration}s`);
    }

    // Verificar análises com falha
    const failedAnalyses = await prisma.cloudTrailAnalysis.findMany({
      where: { status: 'failed' },
      orderBy: { created_at: 'desc' },
      take: 5,
      select: {
        id: true,
        aws_account_id: true,
        started_at: true,
        results: true
      }
    });

    console.log(`\n❌ Análises com falha (últimas 5): ${failedAnalyses.length}`);
    for (const analysis of failedAnalyses) {
      console.log(`   - ID: ${analysis.id}, Account: ${analysis.aws_account_id}`);
      if (analysis.results) {
        const results = typeof analysis.results === 'string' 
          ? JSON.parse(analysis.results) 
          : analysis.results;
        if (results.error) {
          console.log(`     Erro: ${results.error}`);
        }
      }
    }

    // Verificar contas AWS disponíveis
    const awsAccounts = await prisma.awsCredential.findMany({
      where: { is_active: true },
      select: {
        id: true,
        account_id: true,
        organization_id: true,
        account_name: true
      }
    });

    console.log(`\n🏦 Contas AWS ativas: ${awsAccounts.length}`);
    for (const account of awsAccounts) {
      console.log(`   - ${account.account_name} (${account.account_id}) - Org: ${account.organization_id}`);
    }

  } catch (error) {
    console.error('❌ Erro ao verificar análises CloudTrail:', error);
  } finally {
    await prisma.$disconnect();
  }
}

debugCloudTrailAnalysis();