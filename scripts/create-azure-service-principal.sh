#!/bin/bash
# =============================================================================
# Azure Service Principal Creation Script for EVO Platform
# =============================================================================
# This script creates an Azure Service Principal with the required permissions
# for the EVO Platform to monitor and analyze Azure resources.
#
# Prerequisites:
# - Azure CLI installed and logged in (az login)
# - Sufficient permissions to create Service Principals
#
# Usage:
#   ./create-azure-service-principal.sh [subscription-id] [service-principal-name]
#
# Example:
#   ./create-azure-service-principal.sh "12345678-1234-1234-1234-123456789012" "EVO-Platform"
# =============================================================================

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Default values
DEFAULT_SP_NAME="EVO-Platform"
SUBSCRIPTION_ID="${1:-}"
SP_NAME="${2:-$DEFAULT_SP_NAME}"

echo -e "${BLUE}╔════════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║     EVO Platform - Azure Service Principal Setup              ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════════════════════════════╝${NC}"
echo ""

# Check if Azure CLI is installed
if ! command -v az &> /dev/null; then
    echo -e "${RED}Error: Azure CLI is not installed.${NC}"
    echo "Please install it from: https://docs.microsoft.com/en-us/cli/azure/install-azure-cli"
    exit 1
fi

# Check if logged in
if ! az account show &> /dev/null; then
    echo -e "${YELLOW}You are not logged in to Azure CLI.${NC}"
    echo "Running 'az login'..."
    az login
fi

# Get subscription ID if not provided
if [ -z "$SUBSCRIPTION_ID" ]; then
    echo -e "${YELLOW}No subscription ID provided. Listing available subscriptions...${NC}"
    echo ""
    az account list --output table
    echo ""
    read -p "Enter the Subscription ID to use: " SUBSCRIPTION_ID
fi

# Validate subscription ID
if ! az account show --subscription "$SUBSCRIPTION_ID" &> /dev/null; then
    echo -e "${RED}Error: Invalid subscription ID or no access to subscription.${NC}"
    exit 1
fi

# Set the subscription
az account set --subscription "$SUBSCRIPTION_ID"
echo -e "${GREEN}✓ Using subscription: $SUBSCRIPTION_ID${NC}"

# Get tenant ID
TENANT_ID=$(az account show --query tenantId -o tsv)
echo -e "${GREEN}✓ Tenant ID: $TENANT_ID${NC}"

echo ""
echo -e "${BLUE}Creating Service Principal: $SP_NAME${NC}"
echo ""

# Create Service Principal with required roles
# The SP will be created with a client secret that expires in 2 years
SP_OUTPUT=$(az ad sp create-for-rbac \
    --name "$SP_NAME" \
    --role "Reader" \
    --scopes "/subscriptions/$SUBSCRIPTION_ID" \
    --years 2 \
    --output json)

# Extract credentials
CLIENT_ID=$(echo $SP_OUTPUT | jq -r '.appId')
CLIENT_SECRET=$(echo $SP_OUTPUT | jq -r '.password')

echo -e "${GREEN}✓ Service Principal created${NC}"

# Assign additional roles
echo ""
echo -e "${BLUE}Assigning additional roles...${NC}"

# Security Reader
az role assignment create \
    --assignee "$CLIENT_ID" \
    --role "Security Reader" \
    --scope "/subscriptions/$SUBSCRIPTION_ID" \
    --output none 2>/dev/null || echo -e "${YELLOW}  Security Reader role may already exist${NC}"
echo -e "${GREEN}✓ Security Reader role assigned${NC}"

# Cost Management Reader
az role assignment create \
    --assignee "$CLIENT_ID" \
    --role "Cost Management Reader" \
    --scope "/subscriptions/$SUBSCRIPTION_ID" \
    --output none 2>/dev/null || echo -e "${YELLOW}  Cost Management Reader role may already exist${NC}"
echo -e "${GREEN}✓ Cost Management Reader role assigned${NC}"

# Log Analytics Reader
az role assignment create \
    --assignee "$CLIENT_ID" \
    --role "Log Analytics Reader" \
    --scope "/subscriptions/$SUBSCRIPTION_ID" \
    --output none 2>/dev/null || echo -e "${YELLOW}  Log Analytics Reader role may already exist${NC}"
echo -e "${GREEN}✓ Log Analytics Reader role assigned${NC}"

# Monitoring Reader (for Activity Logs)
az role assignment create \
    --assignee "$CLIENT_ID" \
    --role "Monitoring Reader" \
    --scope "/subscriptions/$SUBSCRIPTION_ID" \
    --output none 2>/dev/null || echo -e "${YELLOW}  Monitoring Reader role may already exist${NC}"
echo -e "${GREEN}✓ Monitoring Reader role assigned${NC}"

echo ""
echo -e "${GREEN}╔════════════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║              Service Principal Created Successfully!           ║${NC}"
echo -e "${GREEN}╚════════════════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "${YELLOW}⚠️  IMPORTANT: Save these credentials securely!${NC}"
echo -e "${YELLOW}   The client secret will NOT be shown again.${NC}"
echo ""
echo "═══════════════════════════════════════════════════════════════════"
echo ""
echo -e "${BLUE}Credentials for EVO Platform:${NC}"
echo ""
echo -e "  Tenant ID:        ${GREEN}$TENANT_ID${NC}"
echo -e "  Client ID:        ${GREEN}$CLIENT_ID${NC}"
echo -e "  Client Secret:    ${GREEN}$CLIENT_SECRET${NC}"
echo -e "  Subscription ID:  ${GREEN}$SUBSCRIPTION_ID${NC}"
echo ""
echo "═══════════════════════════════════════════════════════════════════"
echo ""
echo -e "${BLUE}Assigned Roles:${NC}"
echo "  • Reader - Read access to all resources"
echo "  • Security Reader - Read security configurations"
echo "  • Cost Management Reader - Read cost and billing data"
echo "  • Log Analytics Reader - Read log analytics data"
echo "  • Monitoring Reader - Read activity logs and metrics"
echo ""
echo -e "${BLUE}Next Steps:${NC}"
echo "  1. Go to EVO Platform → Settings → Cloud Credentials"
echo "  2. Click 'Add Azure Subscription'"
echo "  3. Enter the credentials shown above"
echo "  4. Click 'Validate & Save'"
echo ""

# Save credentials to file (optional)
CREDS_FILE="evo-azure-credentials-$(date +%Y%m%d-%H%M%S).json"
cat > "$CREDS_FILE" << EOF
{
  "tenantId": "$TENANT_ID",
  "clientId": "$CLIENT_ID",
  "clientSecret": "$CLIENT_SECRET",
  "subscriptionId": "$SUBSCRIPTION_ID",
  "servicePrincipalName": "$SP_NAME",
  "createdAt": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "expiresAt": "$(date -u -v+2y +%Y-%m-%dT%H:%M:%SZ 2>/dev/null || date -u -d '+2 years' +%Y-%m-%dT%H:%M:%SZ)"
}
EOF

echo -e "${GREEN}✓ Credentials saved to: $CREDS_FILE${NC}"
echo -e "${RED}⚠️  Delete this file after copying credentials to EVO Platform!${NC}"
echo ""
