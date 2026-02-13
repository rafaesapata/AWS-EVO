#
# EVO Platform - Azure Quick Connect Script (PowerShell)
# 
# Este script automatiza a criação de um Service Principal no Azure
# com todas as permissões necessárias para a plataforma EVO.
#
# Uso: .\azure-quick-connect.ps1 [-SubscriptionId <ID>]
#
# Se SubscriptionId não for fornecido, o script listará as subscriptions
# disponíveis e pedirá para você escolher uma.
#

param(
    [string]$SubscriptionId = ""
)

$ErrorActionPreference = "Stop"

# Cores para output
function Write-ColorOutput {
    param([string]$Message, [string]$Color = "White")
    Write-Host $Message -ForegroundColor $Color
}

function Write-Success { param([string]$Message) Write-ColorOutput "✓ $Message" "Green" }
function Write-Info { param([string]$Message) Write-ColorOutput $Message "Cyan" }
function Write-Warn { param([string]$Message) Write-ColorOutput "⚠ $Message" "Yellow" }
function Write-Err { param([string]$Message) Write-ColorOutput "❌ $Message" "Red" }

# Nome do App Registration
$AppName = "EVO Platform"

Write-Host ""
Write-Info "╔══════════════════════════════════════════════════════════════╗"
Write-Info "║                                                              ║"
Write-Info "║           EVO Platform - Azure Quick Connect                 ║"
Write-Info "║                                                              ║"
Write-Info "╚══════════════════════════════════════════════════════════════╝"
Write-Host ""

# Verificar se Azure CLI está instalado
try {
    $azVersion = az version 2>$null | ConvertFrom-Json
    Write-Success "Azure CLI encontrado (versão $($azVersion.'azure-cli'))"
} catch {
    Write-Err "Azure CLI não está instalado."
    Write-Host ""
    Write-Host "Por favor, instale o Azure CLI:"
    Write-Host "  - Windows: winget install Microsoft.AzureCLI"
    Write-Host "  - Ou baixe de: https://aka.ms/installazurecliwindows"
    Write-Host ""
    Write-Host "Documentação: https://learn.microsoft.com/cli/azure/install-azure-cli"
    exit 1
}

# Verificar se está logado
Write-Host ""
Write-Info "Verificando autenticação..."
try {
    $accountInfo = az account show 2>$null | ConvertFrom-Json
    $currentUser = $accountInfo.user.name
    Write-Success "Logado como: $currentUser"
} catch {
    Write-Warn "Você não está logado no Azure CLI."
    Write-Host "Iniciando login..."
    az login
    $accountInfo = az account show | ConvertFrom-Json
}

# Obter Tenant ID
$TenantId = $accountInfo.tenantId
Write-Success "Tenant ID: $TenantId"

# Obter ou selecionar Subscription
if ([string]::IsNullOrEmpty($SubscriptionId)) {
    Write-Host ""
    Write-Info "Listando subscriptions disponíveis..."
    Write-Host ""
    
    az account list --query "[].{Name:name, ID:id, State:state}" -o table
    
    Write-Host ""
    $SubscriptionId = Read-Host "Digite o Subscription ID que deseja usar"
    
    if ([string]::IsNullOrEmpty($SubscriptionId)) {
        Write-Err "Subscription ID é obrigatório."
        exit 1
    }
}

# Definir subscription ativa
Write-Host ""
Write-Info "Configurando subscription..."
az account set --subscription $SubscriptionId
$subscriptionInfo = az account show | ConvertFrom-Json
$SubscriptionName = $subscriptionInfo.name
Write-Success "Subscription: $SubscriptionName ($SubscriptionId)"

# Verificar se já existe um App Registration com o mesmo nome
Write-Host ""
Write-Info "Verificando App Registration existente..."
$existingApps = az ad app list --display-name $AppName 2>$null | ConvertFrom-Json
$existingApp = $null
$useExisting = $false

if ($existingApps -and $existingApps.Count -gt 0) {
    $existingApp = $existingApps[0]
    Write-Warn "Já existe um App Registration chamado '$AppName'"
    Write-Host "  App ID: $($existingApp.appId)"
    Write-Host ""
    $response = Read-Host "Deseja usar o existente (s) ou criar um novo (n)? [s/n]"
    
    if ($response -eq "s" -or $response -eq "S") {
        $AppId = $existingApp.appId
        Write-Success "Usando App Registration existente"
        $useExisting = $true
    } else {
        $timestamp = [DateTimeOffset]::Now.ToUnixTimeSeconds()
        $AppName = "EVO Platform $timestamp"
        Write-Info "Criando novo App Registration: $AppName"
        $existingApp = $null
    }
}

# Criar App Registration se não existir
if (-not $useExisting) {
    Write-Host ""
    Write-Info "Passo 1/4: Criando App Registration..."
    
    $appResult = az ad app create `
        --display-name $AppName `
        --sign-in-audience AzureADMyOrg `
        --query "{appId:appId}" `
        -o json | ConvertFrom-Json
    
    $AppId = $appResult.appId
    
    if ([string]::IsNullOrEmpty($AppId)) {
        Write-Err "Falha ao criar App Registration."
        exit 1
    }
    
    Write-Success "App Registration criado"
    Write-Host "  App ID (Client ID): $AppId"
}

# Criar Service Principal
Write-Host ""
Write-Info "Passo 2/4: Criando Service Principal..."

$existingSp = az ad sp list --filter "appId eq '$AppId'" 2>$null | ConvertFrom-Json

if ($existingSp -and $existingSp.Count -gt 0) {
    $SpId = $existingSp[0].id
    Write-Success "Service Principal já existe"
} else {
    $spResult = az ad sp create --id $AppId --query "{id:id, appId:appId}" -o json | ConvertFrom-Json
    $SpId = $spResult.id
    Write-Success "Service Principal criado"
}

Write-Host "  Service Principal ID: $SpId"

# Criar Client Secret
Write-Host ""
Write-Info "Passo 3/4: Criando Client Secret..."

$secretResult = az ad app credential reset `
    --id $AppId `
    --append `
    --display-name "EVO Platform Access" `
    --years 2 `
    --query "{password:password, endDateTime:endDateTime}" `
    -o json | ConvertFrom-Json

$ClientSecret = $secretResult.password
$SecretExpiry = $secretResult.endDateTime

if ([string]::IsNullOrEmpty($ClientSecret)) {
    Write-Err "Falha ao criar Client Secret."
    exit 1
}

Write-Success "Client Secret criado"
Write-Host "  Expira em: $SecretExpiry"

# Aguardar propagação do Service Principal
Write-Host ""
Write-Warn "Aguardando propagação do Service Principal (30 segundos)..."
Start-Sleep -Seconds 30

# Atribuir Roles
Write-Host ""
Write-Info "Passo 4/4: Atribuindo permissões (roles)..."

$roles = @(
    "Reader",
    "Security Reader",
    "Cost Management Reader",
    "Monitoring Reader"
)

$scope = "/subscriptions/$SubscriptionId"

foreach ($role in $roles) {
    Write-Host "  Atribuindo: $role..."
    
    # Verificar se role já está atribuída
    $existingRole = az role assignment list `
        --assignee $AppId `
        --role $role `
        --scope $scope `
        --query "[0].id" `
        -o tsv 2>$null
    
    if ($existingRole) {
        Write-Host "    " -NoNewline
        Write-Success "$role (já atribuída)"
    } else {
        try {
            az role assignment create `
                --assignee $AppId `
                --role $role `
                --scope $scope `
                --output none 2>$null
            Write-Host "    " -NoNewline
            Write-Success $role
        } catch {
            Write-Host "    " -NoNewline
            Write-Warn "Falha ao atribuir $role - pode precisar de permissões adicionais"
        }
    }
}

# Exibir resultado final
Write-Host ""
Write-Info "╔══════════════════════════════════════════════════════════════╗"
Write-Info "║                    CONFIGURAÇÃO COMPLETA                     ║"
Write-Info "╚══════════════════════════════════════════════════════════════╝"
Write-Host ""

Write-ColorOutput "Use estas credenciais na plataforma EVO:" "Green"
Write-Host ""

Write-Host "┌────────────────────────────────────────────────────────────────┐"
Write-Info "│ Tenant ID:"
Write-Host "│ $TenantId"
Write-Host "├────────────────────────────────────────────────────────────────┤"
Write-Info "│ Client ID (Application ID):"
Write-Host "│ $AppId"
Write-Host "├────────────────────────────────────────────────────────────────┤"
Write-Info "│ Client Secret:"
Write-Host "│ $ClientSecret"
Write-Host "├────────────────────────────────────────────────────────────────┤"
Write-Info "│ Subscription ID:"
Write-Host "│ $SubscriptionId"
Write-Host "├────────────────────────────────────────────────────────────────┤"
Write-Info "│ Subscription Name:"
Write-Host "│ $SubscriptionName"
Write-Host "└────────────────────────────────────────────────────────────────┘"

Write-Host ""
Write-Warn "IMPORTANTE: Guarde o Client Secret em local seguro!"
Write-Warn "Ele não poderá ser visualizado novamente."

# Salvar em arquivo
$outputFile = "evo-azure-credentials-$($SubscriptionId.Substring(0,8)).txt"
Write-Host ""
Write-Info "Salvando credenciais em: $outputFile"

$credentialsContent = @"
# EVO Platform - Azure Credentials
# Gerado em: $(Get-Date)
# 
# ATENÇÃO: Este arquivo contém informações sensíveis!
# Guarde em local seguro e delete após usar.

TENANT_ID=$TenantId
CLIENT_ID=$AppId
CLIENT_SECRET=$ClientSecret
SUBSCRIPTION_ID=$SubscriptionId
SUBSCRIPTION_NAME=$SubscriptionName

# Roles atribuídas:
# - Reader (acesso de leitura a todos os recursos)
# - Security Reader (Defender for Cloud, assessments, secure scores)
# - Cost Management Reader (custos, consumo, orçamentos)
# - Monitoring Reader (métricas, logs de atividade, alertas)

# Secret expira em: $SecretExpiry
"@

$credentialsContent | Out-File -FilePath $outputFile -Encoding UTF8

Write-Success "Credenciais salvas em $outputFile"

Write-Host ""
Write-ColorOutput "✅ Configuração concluída com sucesso!" "Green"
Write-Host ""
Write-Host "Agora você pode usar estas credenciais na plataforma EVO."
Write-Info "Acesse: https://evo.nuevacore.com/cloud-accounts"
Write-Host ""
