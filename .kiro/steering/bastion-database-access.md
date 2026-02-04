# Bastion Host - Acesso ao Banco de Dados Production

## ⚠️ USO OBRIGATÓRIO

**SEMPRE use o Bastion Host para acessar o banco de dados RDS em produção.**

O RDS está em subnets privadas e NÃO é acessível diretamente da internet.

---

## Informações do Bastion

| Propriedade | Valor |
|-------------|-------|
| **Instance ID** | `i-00d8aa3ee551d4215` |
| **Public IP** | `44.213.112.31` |
| **Private IP** | `10.0.1.170` |
| **Security Group** | `sg-0dec194e59bf06ec3` |
| **Key Pair** | `evo-production-bastion` |
| **Key Path** | `~/.ssh/evo-production-bastion.pem` |
| **AMI** | Amazon Linux 2023 |
| **Instance Type** | t3.micro |
| **Subnet** | `subnet-02636931ad37fc08c` (public) |
| **VPC** | `vpc-07424c3d1d6fb2dc6` |

---

## Informações do RDS

| Propriedade | Valor |
|-------------|-------|
| **Endpoint** | `evo-uds-v3-production-postgres.cib8kysoo015.us-east-1.rds.amazonaws.com` |
| **Port** | `5432` |
| **Database** | `evouds` |
| **Username** | `evoadmin` |
| **Password** | `xJB8g6z84PzUYRhWMM8QkkQb` |
| **Security Group** | `sg-066e845f73d46814d` |

---

## Como Conectar

### 1. Conectar ao Bastion via SSH

```bash
ssh -i ~/.ssh/evo-production-bastion.pem ec2-user@44.213.112.31
```

### 2. Instalar PostgreSQL Client no Bastion (primeira vez)

```bash
sudo dnf install -y postgresql15
```

### 3. Conectar ao RDS a partir do Bastion

```bash
psql -h evo-uds-v3-production-postgres.cib8kysoo015.us-east-1.rds.amazonaws.com \
     -U evoadmin \
     -d evouds \
     -p 5432
```

Quando solicitado, digite a senha: `xJB8g6z84PzUYRhWMM8QkkQb`

---

## SSH Tunnel (Port Forwarding) - Acesso Local

Para conectar ao RDS a partir da sua máquina local usando ferramentas como DBeaver, pgAdmin, ou Prisma Studio:

### 1. Criar o túnel SSH

```bash
ssh -i ~/.ssh/evo-production-bastion.pem \
    -L 5433:evo-uds-v3-production-postgres.cib8kysoo015.us-east-1.rds.amazonaws.com:5432 \
    -N ec2-user@44.213.112.31
```

**Explicação:**
- `-L 5433:...` - Mapeia a porta local 5433 para o RDS na porta 5432
- `-N` - Não executa comandos remotos (apenas túnel)
- Deixe o terminal aberto enquanto usar o túnel

### 2. Conectar localmente

Agora você pode conectar ao RDS usando `localhost:5433`:

```bash
# psql local
psql -h localhost -p 5433 -U evoadmin -d evouds

# Prisma Studio
DATABASE_URL="postgresql://evoadmin:xJB8g6z84PzUYRhWMM8QkkQb@localhost:5433/evouds?schema=public" npx prisma studio --prefix backend

# DBeaver / pgAdmin
Host: localhost
Port: 5433
Database: evouds
Username: evoadmin
Password: xJB8g6z84PzUYRhWMM8QkkQb
```

---

## Comandos Úteis

### Verificar schema do banco

```sql
-- Listar todas as tabelas
\dt

-- Descrever estrutura de uma tabela
\d profiles

-- Ver colunas de uma tabela
SELECT column_name, data_type, is_nullable 
FROM information_schema.columns 
WHERE table_name = 'profiles';
```

### Executar migrations via Bastion

```bash
# 1. Conectar ao Bastion
ssh -i ~/.ssh/evo-production-bastion.pem ec2-user@44.213.112.31

# 2. Instalar Node.js e npm (primeira vez)
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash
source ~/.bashrc
nvm install 20
nvm use 20

# 3. Clonar repositório (primeira vez)
git clone https://github.com/your-org/evo-platform.git
cd evo-platform/backend

# 4. Instalar dependências
npm install

# 5. Configurar DATABASE_URL
export DATABASE_URL="postgresql://evoadmin:xJB8g6z84PzUYRhWMM8QkkQb@evo-uds-v3-production-postgres.cib8kysoo015.us-east-1.rds.amazonaws.com:5432/evouds?schema=public"

# 6. Executar migrations
npx prisma migrate deploy
```

---

## Gerenciar Bastion

### Iniciar Bastion (se estiver parado)

```bash
AWS_PROFILE=EVO_PRODUCTION aws ec2 start-instances \
  --instance-ids i-00d8aa3ee551d4215 \
  --region us-east-1
```

### Parar Bastion (economizar custos)

```bash
AWS_PROFILE=EVO_PRODUCTION aws ec2 stop-instances \
  --instance-ids i-00d8aa3ee551d4215 \
  --region us-east-1
```

### Verificar status

```bash
AWS_PROFILE=EVO_PRODUCTION aws ec2 describe-instances \
  --instance-ids i-00d8aa3ee551d4215 \
  --region us-east-1 \
  --query 'Reservations[0].Instances[0].{State:State.Name,PublicIp:PublicIpAddress}'
```

**IMPORTANTE:** O IP público muda quando você para e inicia a instância. Sempre verifique o IP atual antes de conectar.

---

## Segurança

- ✅ Bastion está em subnet pública com acesso SSH (porta 22)
- ✅ RDS está em subnets privadas (sem acesso direto da internet)
- ✅ Security Group do RDS permite conexões apenas do Bastion
- ✅ Key pair privada armazenada localmente em `~/.ssh/`
- ⚠️ **NUNCA** commite a key privada no repositório
- ⚠️ **NUNCA** exponha a senha do RDS em logs ou código

---

## Troubleshooting

### Erro: "Permission denied (publickey)"

```bash
# Verificar permissões da key
chmod 400 ~/.ssh/evo-production-bastion.pem

# Verificar se a key está correta
ssh-keygen -l -f ~/.ssh/evo-production-bastion.pem
```

### Erro: "Connection timed out"

1. Verificar se o Bastion está rodando
2. Verificar se o Security Group permite SSH (porta 22)
3. Verificar se o IP público está correto

### Erro: "could not connect to server"

1. Verificar se está conectado ao Bastion
2. Verificar se o Security Group do RDS permite conexões do Bastion
3. Verificar se o endpoint do RDS está correto

---

**Última atualização:** 2026-02-04
