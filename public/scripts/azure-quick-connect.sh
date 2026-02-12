#!/bin/bash
#
# EVO Platform - Azure Quick Connect Script
# 
# Este script automatiza a criação de um Service Principal no Azure
# com todas as permissões necessárias para a plataforma EVO.
#
# Uso: ./azure-quick-connect.sh [SUBSCRIPTION_ID]
#
# Se SUBSCRIPTION_ID não for fornecido, o script listará as subscriptions
# disponíveis e pedirá para você escolher uma.
#

set -e

# Cores para output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Nome do App Registration
APP_NAME="EVO Platform"

echo -e "${CYAN}"
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║                                                              ║"
echo "║           EVO Platform - Azure Quick Connect                 ║"
echo "║                                                              ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo -e "${NC}"

# Verificar se Azure CLI está instalado
if ! command -v az &> /dev/null; then
    echo -e "${RED}❌ Azure CLI não está instalado.${NC}"
    echo ""
    echo "Por favor, instale o Azure CLI:"
    echo "  - macOS: brew install azure-cli"
    echo "  - Windows: winget install Microsoft.AzureCLI"
    echo "  - Linux: curl -sL https://aka.ms/InstallAzureCLIDeb | sudo bash"
    echo ""
    echo "Documentação: https://docs.microsoft.com/cli/azure/install-azure-cli"
    exit 1
fi

echo -e "${GREEN}✓ Azure CLI encontrado${NC}"

# Verificar se está logado
echo -e "\n${BLUE}Verificando autenticação...${NC}"
if ! az account show &> /dev/null; then
    echo -e "${YELLOW}⚠ Você não está logado no Azure CLI.${NC}"
    echo -e "Iniciando login..."
    az login
fi

CURRENT_USER=$(az account show --query user.name -o tsv 2>/dev/null || echo "Unknown")
echo -e "${GREEN}✓ Logado como: ${CURRENT_USER}${NC}"

# Obter Tenant ID
TENANT_ID=$(az account show --query tenantId -o tsv)
echo -e "${GREEN}✓ Tenant ID: ${TENANT_ID}${NC}"

# Obter ou selecionar Subscription
SUBSCRIPTION_ID=$1

if [ -z "$SUBSCRIPTION_ID" ]; then
    echo -e "\n${BLUE}Listando subscriptions disponíveis...${NC}\n"
    
    # Listar subscriptions em formato tabela
    az account list --query "[].{Name:name, ID:id, State:state}" -o table
    
    echo ""
    read -p "Digite o Subscription ID que deseja usar: " SUBSCRIPTION_ID
    
    if [ -z "$SUBSCRIPTION_ID" ]; then
        echo -e "${RED}❌ Subscription ID é obrigatório.${NC}"
        exit 1
    fi
fi

# Definir subscription ativa
echo -e "\n${BLUE}Configurando subscription...${NC}"
az account set --subscription "$SUBSCRIPTION_ID"
SUBSCRIPTION_NAME=$(az account show --query name -o tsv)
echo -e "${GREEN}✓ Subscription: ${SUBSCRIPTION_NAME} (${SUBSCRIPTION_ID})${NC}"

# Verificar se já existe um App Registration com o mesmo nome
echo -e "\n${BLUE}Verificando App Registration existente...${NC}"
EXISTING_APP=$(az ad app list --display-name "$APP_NAME" --query "[0].appId" -o tsv 2>/dev/null || echo "")

if [ -n "$EXISTING_APP" ]; then
    echo -e "${YELLOW}⚠ Já existe um App Registration chamado '${APP_NAME}'${NC}"
    echo -e "  App ID: ${EXISTING_APP}"
    echo ""
    read -p "Deseja usar o existente (s) ou criar um novo (n)? [s/n]: " USE_EXISTING
    
    if [ "$USE_EXISTING" = "s" ] || [ "$USE_EXISTING" = "S" ]; then
        APP_ID=$EXISTING_APP
        echo -e "${GREEN}✓ Usando App Registration existente${NC}"
    else
        # Gerar nome único
        TIMESTAMP=$(date +%s)
        APP_NAME="EVO Platform ${TIMESTAMP}"
        echo -e "${BLUE}Criando novo App Registration: ${APP_NAME}${NC}"
        EXISTING_APP=""
    fi
fi

# Criar App Registration se não existir
if [ -z "$EXISTING_APP" ] || [ "$USE_EXISTING" = "n" ] || [ "$USE_EXISTING" = "N" ]; then
    echo -e "\n${BLUE}Passo 1/4: Criando App Registration...${NC}"
    
    APP_RESULT=$(az ad app create \
        --display-name "$APP_NAME" \
        --sign-in-audience AzureADMyOrg \
        --query "{appId:appId, id:id}" \
        -o json)
    
    APP_ID=$(echo $APP_RESULT | jq -r '.appId')
    APP_OBJECT_ID=$(echo $APP_RESULT | jq -r '.id')
    
    echo -e "${GREEN}✓ App Registration criado${NC}"
    echo -e "  App ID (Client ID): ${APP_ID}"
fi

# Criar Service Principal
echo -e "\n${BLUE}Passo 2/4: Criando Service Principal...${NC}"

# Verificar se SP já existe
EXISTING_SP=$(az ad sp list --filter "appId eq '$APP_ID'" --query "[0].id" -o tsv 2>/dev/null || echo "")

if [ -n "$EXISTING_SP" ]; then
    SP_ID=$EXISTING_SP
    echo -e "${GREEN}✓ Service Principal já existe${NC}"
else
    SP_RESULT=$(az ad sp create --id "$APP_ID" --query "{id:id, appId:appId}" -o json)
    SP_ID=$(echo $SP_RESULT | jq -r '.id')
    echo -e "${GREEN}✓ Service Principal criado${NC}"
fi

echo -e "  Service Principal ID: ${SP_ID}"

# Criar Client Secret
echo -e "\n${BLUE}Passo 3/4: Criando Client Secret...${NC}"

SECRET_RESULT=$(az ad app credential reset \
    --id "$APP_ID" \
    --append \
    --display-name "EVO Platform Access" \
    --years 2 \
    --query "{password:password, endDateTime:endDateTime}" \
    -o json)

CLIENT_SECRET=$(echo $SECRET_RESULT | jq -r '.password')
SECRET_EXPIRY=$(echo $SECRET_RESULT | jq -r '.endDateTime')

echo -e "${GREEN}✓ Client Secret criado${NC}"
echo -e "  Expira em: ${SECRET_EXPIRY}"

# Aguardar propagação do Service Principal
echo -e "\n${YELLOW}Aguardando propagação do Service Principal (30 segundos)...${NC}"
sleep 30

# Atribuir Roles
echo -e "\n${BLUE}Passo 4/4: Atribuindo permissões (roles)...${NC}"

ROLES=(
    "Reader"
    "Security Reader"
    "Cost Management Reader"
    "Log Analytics Reader"
)

SCOPE="/subscriptions/${SUBSCRIPTION_ID}"

for ROLE in "${ROLES[@]}"; do
    echo -e "  Atribuindo: ${ROLE}..."
    
    # Verificar se role já está atribuída
    EXISTING_ROLE=$(az role assignment list \
        --assignee "$APP_ID" \
        --role "$ROLE" \
        --scope "$SCOPE" \
        --query "[0].id" \
        -o tsv 2>/dev/null || echo "")
    
    if [ -n "$EXISTING_ROLE" ]; then
        echo -e "    ${GREEN}✓ ${ROLE} (já atribuída)${NC}"
    else
        az role assignment create \
            --assignee "$APP_ID" \
            --role "$ROLE" \
            --scope "$SCOPE" \
            --output none 2>/dev/null || {
                echo -e "    ${YELLOW}⚠ Falha ao atribuir ${ROLE} - pode precisar de permissões adicionais${NC}"
                continue
            }
        echo -e "    ${GREEN}✓ ${ROLE}${NC}"
    fi
done

# Exibir resultado final
echo -e "\n${CYAN}"
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║                    CONFIGURAÇÃO COMPLETA                     ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo -e "${NC}"

echo -e "${GREEN}Use estas credenciais na plataforma EVO:${NC}\n"

echo -e "┌────────────────────────────────────────────────────────────────┐"
echo -e "│ ${CYAN}Tenant ID:${NC}"
echo -e "│ ${TENANT_ID}"
echo -e "├────────────────────────────────────────────────────────────────┤"
echo -e "│ ${CYAN}Client ID (Application ID):${NC}"
echo -e "│ ${APP_ID}"
echo -e "├────────────────────────────────────────────────────────────────┤"
echo -e "│ ${CYAN}Client Secret:${NC}"
echo -e "│ ${CLIENT_SECRET}"
echo -e "├────────────────────────────────────────────────────────────────┤"
echo -e "│ ${CYAN}Subscription ID:${NC}"
echo -e "│ ${SUBSCRIPTION_ID}"
echo -e "├────────────────────────────────────────────────────────────────┤"
echo -e "│ ${CYAN}Subscription Name:${NC}"
echo -e "│ ${SUBSCRIPTION_NAME}"
echo -e "└────────────────────────────────────────────────────────────────┘"

echo -e "\n${YELLOW}⚠ IMPORTANTE: Guarde o Client Secret em local seguro!${NC}"
echo -e "${YELLOW}  Ele não poderá ser visualizado novamente.${NC}"

# Salvar em arquivo (opcional)
OUTPUT_FILE="evo-azure-credentials-${SUBSCRIPTION_ID:0:8}.txt"
echo -e "\n${BLUE}Salvando credenciais em: ${OUTPUT_FILE}${NC}"

cat > "$OUTPUT_FILE" << EOF
# EVO Platform - Azure Credentials
# Gerado em: $(date)
# 
# ATENÇÃO: Este arquivo contém informações sensíveis!
# Guarde em local seguro e delete após usar.

TENANT_ID=${TENANT_ID}
CLIENT_ID=${APP_ID}
CLIENT_SECRET=${CLIENT_SECRET}
SUBSCRIPTION_ID=${SUBSCRIPTION_ID}
SUBSCRIPTION_NAME=${SUBSCRIPTION_NAME}

# Roles atribuídas:
# - Reader
# - Security Reader
# - Cost Management Reader
# - Log Analytics Reader

# Secret expira em: ${SECRET_EXPIRY}
EOF

echo -e "${GREEN}✓ Credenciais salvas em ${OUTPUT_FILE}${NC}"

echo -e "\n${GREEN}✅ Configuração concluída com sucesso!${NC}"
echo -e "\nAgora você pode usar estas credenciais na plataforma EVO."
echo -e "Acesse: ${CYAN}https://evo.nuevacore.com/cloud-accounts${NC}\n"
