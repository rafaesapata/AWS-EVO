# Sistema de Licenças - Implementação Completa

## Visão Geral

Sistema de validação de licenças integrado com API externa, com sincronização diária automática via EventBridge e gerenciamento de seats por usuário.

## Arquitetura

```
┌─────────────────────┐     ┌──────────────────────┐
│   External API      │     │   EventBridge        │
│   (Supabase)        │     │   (Daily 2AM UTC)    │
└─────────┬───────────┘     └──────────┬───────────┘
          │                            │
          ▼                            ▼
┌─────────────────────────────────────────────────────┐
│              License Service (Lambda)                │
│  - syncOrganizationLicenses()                       │
│  - assignSeat() / revokeSeat()                      │
│  - getLicenseSummary()                              │
└─────────────────────────────────────────────────────┘
          │
          ▼
┌─────────────────────────────────────────────────────┐
│              PostgreSQL (RDS)                        │
│  - licenses                                          │
│  - license_seat_assignments                          │
│  - organization_license_configs                      │
└─────────────────────────────────────────────────────┘
```

## Endpoints da API

### 1. Configurar Licença (Admin)
```bash
# GET - Ver configuração atual
curl -X GET https://api-evo.ai.udstec.io/api/functions/configure-license \
  -H "Authorization: Bearer $TOKEN"

# POST - Configurar customer_id
curl -X POST https://api-evo.ai.udstec.io/api/functions/configure-license \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"customer_id": "f7c9c432-d2c9-41ad-be8f-38883c06cb48", "auto_sync": true}'
```

### 2. Validar Licença (Todos)
```bash
curl -X GET https://api-evo.ai.udstec.io/api/functions/validate-license \
  -H "Authorization: Bearer $TOKEN"
```

### 3. Sincronizar Licença (Admin)
```bash
curl -X POST https://api-evo.ai.udstec.io/api/functions/sync-license \
  -H "Authorization: Bearer $TOKEN"
```

### 4. Gerenciar Seats (Admin)
```bash
# GET - Listar seats
curl -X GET https://api-evo.ai.udstec.io/api/functions/manage-seats \
  -H "Authorization: Bearer $TOKEN"

# POST - Atribuir seat
curl -X POST https://api-evo.ai.udstec.io/api/functions/manage-seats \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"action": "assign", "license_id": "uuid", "user_id": "uuid"}'

# POST - Revogar seat
curl -X POST https://api-evo.ai.udstec.io/api/functions/manage-seats \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"action": "revoke", "license_id": "uuid", "user_id": "uuid"}'
```

### 5. Admin Sync (Super Admin)
```bash
# GET - Listar todas organizações com licença
curl -X GET https://api-evo.ai.udstec.io/api/functions/admin-sync-license \
  -H "Authorization: Bearer $TOKEN"

# POST - Sincronizar organizações específicas
curl -X POST https://api-evo.ai.udstec.io/api/functions/admin-sync-license \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"organization_ids": ["uuid1", "uuid2"]}'

# POST - Sincronizar todas
curl -X POST https://api-evo.ai.udstec.io/api/functions/admin-sync-license \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"sync_all": true}'
```

## Variáveis de Ambiente

Adicionar às Lambdas:
```
LICENSE_API_URL=https://mhutjgpipiklepvjrboi.supabase.co/functions/v1/validate-license
LICENSE_API_KEY=nck_59707b56bf8def71dfb657bb8f2f4b9c
```

## Deploy

### 1. Migração do Banco ✅ EXECUTADA
A migração foi executada com sucesso em 30/12/2025:
- Novas colunas adicionadas à tabela `licenses`
- Tabela `license_seat_assignments` criada
- Tabela `organization_license_configs` criada
- Índices e foreign keys configurados

### 2. Lambdas Criadas ✅
- `evo-uds-v3-production-configure-license` - Configurar customer_id
- `evo-uds-v3-production-sync-license` - Sincronizar licenças manualmente
- `evo-uds-v3-production-manage-seats` - Gerenciar seats de usuários
- `evo-uds-v3-production-admin-sync-license` - Super admin sync
- `evo-uds-v3-production-scheduled-license-sync` - Sync diário automático
- `evo-uds-v3-production-validate-license` - Validar licença (atualizado)

### 3. Endpoints API Gateway ✅
- `POST/GET /api/functions/configure-license`
- `POST /api/functions/sync-license`
- `POST/GET /api/functions/manage-seats`
- `POST/GET /api/functions/admin-sync-license`

### 4. EventBridge Rule ✅
- Rule: `evo-uds-production-daily-license-sync`
- Schedule: Daily at 2:00 AM UTC
- Target: `evo-uds-v3-production-scheduled-license-sync`

## Fluxo de Uso

1. **Admin configura customer_id** → `POST /configure-license`
2. **Sistema sincroniza automaticamente** → Busca licenças da API externa
3. **Licenças são persistidas no banco** → Não precisa chamar API externa a cada request
4. **EventBridge sincroniza diariamente** → Mantém dados atualizados
5. **Admin pode forçar sync** → `POST /sync-license`
6. **Admin atribui seats aos usuários** → `POST /manage-seats`
7. **Usuários validam acesso** → `GET /validate-license`

## Modelo de Dados

### licenses
- Armazena licenças sincronizadas da API externa
- Campos: license_key, product_type, total_seats, used_seats, valid_from, valid_until, etc.

### license_seat_assignments
- Vincula usuários a seats de licença
- Cada seat = 1 usuário com acesso

### organization_license_configs
- Configuração de licença por organização
- customer_id para buscar na API externa
- auto_sync para habilitar/desabilitar sync automático
