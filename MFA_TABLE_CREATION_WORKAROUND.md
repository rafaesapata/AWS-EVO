# Workaround: Criação Manual da Tabela mfa_factors

## Problema
A tabela `mfa_factors` não está sendo criada pelo script de migração, mesmo com os comandos sendo executados com sucesso.

## Solução Temporária

Execute o seguinte SQL diretamente no banco de dados PostgreSQL:

```sql
CREATE TABLE IF NOT EXISTS mfa_factors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  factor_type VARCHAR(50) NOT NULL,
  friendly_name VARCHAR(255),
  secret TEXT,
  status VARCHAR(50) NOT NULL DEFAULT 'pending',
  is_active BOOLEAN NOT NULL DEFAULT true,
  verified_at TIMESTAMPTZ,
  deactivated_at TIMESTAMPTZ,
  last_used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS mfa_factors_user_id_idx ON mfa_factors(user_id);
CREATE INDEX IF NOT EXISTS mfa_factors_is_active_idx ON mfa_factors(is_active);

-- Grant permissions
GRANT SELECT, INSERT, UPDATE, DELETE ON mfa_factors TO evo_app_user;
```

## Como Executar

### Opção 1: Via psql (se tiver acesso direto)
```bash
psql "postgresql://postgres:PASSWORD@HOST:5432/evouds" -f create-mfa-direct.sql
```

### Opção 2: Via AWS RDS Query Editor
1. Acesse o AWS Console → RDS → Query Editor
2. Conecte ao banco `evouds`
3. Cole e execute o SQL acima

### Opção 3: Via DBeaver/pgAdmin
1. Conecte ao RDS usando as credenciais
2. Execute o SQL acima

## Verificação

Após executar, verifique se a tabela foi criada:

```sql
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_name = 'mfa_factors';
```

Deve retornar:
```
 table_name  
-------------
 mfa_factors
```
