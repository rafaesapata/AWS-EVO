// Script para aplicar migração via Lambda existente
const AWS = require('aws-sdk');

const lambda = new AWS.Lambda({
  region: 'us-east-1',
  credentials: new AWS.SharedIniFileCredentials({ profile: 'EVO' })
});

async function applyMigration() {
  try {
    console.log('🚀 Aplicando migração RI/SP via QueryTableFunction...');
    
    // Usar a QueryTableFunction para executar SQL direto
    const migrationSQL = `
      -- Criar tabela reserved_instances
      CREATE TABLE IF NOT EXISTS "reserved_instances" (
        "id" UUID NOT NULL DEFAULT gen_random_uuid(),
        "organization_id" UUID NOT NULL,
        "aws_account_id" UUID NOT NULL,
        "aws_account_number" TEXT,
        "reserved_instance_id" TEXT NOT NULL,
        "instance_type" TEXT NOT NULL,
        "product_description" TEXT NOT NULL,
        "availability_zone" TEXT,
        "region" TEXT NOT NULL,
        "instance_count" INTEGER NOT NULL,
        "state" TEXT NOT NULL,
        "offering_class" TEXT NOT NULL,
        "offering_type" TEXT NOT NULL,
        "fixed_price" DOUBLE PRECISION,
        "usage_price" DOUBLE PRECISION,
        "recurring_charges" JSONB,
        "start_date" TIMESTAMPTZ(6) NOT NULL,
        "end_date" TIMESTAMPTZ(6) NOT NULL,
        "duration_seconds" INTEGER NOT NULL,
        "utilization_percentage" DOUBLE PRECISION,
        "hours_used" DOUBLE PRECISION,
        "hours_unused" DOUBLE PRECISION,
        "net_savings" DOUBLE PRECISION,
        "on_demand_cost_equivalent" DOUBLE PRECISION,
        "scope" TEXT,
        "tags" JSONB,
        "last_analyzed_at" TIMESTAMPTZ(6),
        "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "reserved_instances_pkey" PRIMARY KEY ("id")
      );
      
      -- Criar índices para reserved_instances
      CREATE UNIQUE INDEX IF NOT EXISTS "reserved_instances_reserved_instance_id_key" ON "reserved_instances"("reserved_instance_id");
      CREATE INDEX IF NOT EXISTS "reserved_instances_organization_id_idx" ON "reserved_instances"("organization_id");
      CREATE INDEX IF NOT EXISTS "reserved_instances_aws_account_id_idx" ON "reserved_instances"("aws_account_id");
      CREATE INDEX IF NOT EXISTS "reserved_instances_state_idx" ON "reserved_instances"("state");
    `;
    
    const payload = {
      body: JSON.stringify({
        query: migrationSQL
      })
    };
    
    const result = await lambda.invoke({
      FunctionName: 'EvoUdsDevelopmentApiStack-QueryTableFunction1F3065-6XRX7I401vYK',
      Payload: JSON.stringify(payload)
    }).promise();
    
    const response = JSON.parse(result.Payload);
    console.log('✅ Primeira parte da migração aplicada:', response);
    
    return response;
  } catch (error) {
    console.error('❌ Erro na migração:', error);
    throw error;
  }
}

// Executar
applyMigration().then(() => {
  console.log('🎉 Migração concluída!');
}).catch(console.error);