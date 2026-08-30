#!/usr/bin/env bash
# ==============================================================================
# Azure VM Provisioning Script for LinkedIn AI Pipeline (K3s Kubernetes)
# Target: Azure for Students ($100 Free Credit)
# Recommended VM Sizes:
#   - Standard_B1ms (1 vCPU, 2 GB RAM) ~ $12-14/mo (lasts 7-8 months on $100 grant)
#   - Standard_B2s  (2 vCPU, 4 GB RAM) ~ $25-28/mo (lasts 3.5-4 months on $100 grant)
# ==============================================================================

set -euo pipefail

# Configuration Defaults
RESOURCE_GROUP="${AZURE_RG:-rg-linkedin-pipeline}"
LOCATION="${AZURE_LOCATION:-eastus}"
VM_NAME="${AZURE_VM_NAME:-vm-linkedin-pipeline}"
VM_SIZE="${AZURE_VM_SIZE:-Standard_B2s}"
ADMIN_USERNAME="${AZURE_USER:-azureuser}"
SSH_KEY_PATH="${SSH_KEY_PATH:-$HOME/.ssh/id_rsa.pub}"

echo "=========================================================="
echo "🚀 Provisioning Azure VM for LinkedIn AI Pipeline"
echo "Resource Group: $RESOURCE_GROUP ($LOCATION)"
echo "VM Name:        $VM_NAME ($VM_SIZE)"
echo "Admin User:     $ADMIN_USERNAME"
echo "=========================================================="

# Check if Azure CLI is installed
if ! command -v az &> /dev/null; then
    echo "❌ Error: Azure CLI ('az') is not installed."
    echo "Install it via: brew install azure-cli (macOS) or https://aka.ms/installazurecliwindows"
    exit 1
fi

# Check Azure Login
echo "🔍 Checking Azure authentication..."
az account show --output none || {
    echo "🔑 Logging in to Azure..."
    az login
}

# 1. Create Resource Group
echo "📦 Creating Resource Group: $RESOURCE_GROUP in $LOCATION..."
az group create --name "$RESOURCE_GROUP" --location "$LOCATION" --output table

# 2. Create Virtual Machine
echo "💻 Creating Virtual Machine ($VM_SIZE, Ubuntu 24.04 LTS)..."
if [ -f "$SSH_KEY_PATH" ]; then
    az vm create \
        --resource-group "$RESOURCE_GROUP" \
        --name "$VM_NAME" \
        --image "Canonical:ubuntu-24_04-lts:server:latest" \
        --size "$VM_SIZE" \
        --admin-username "$ADMIN_USERNAME" \
        --ssh-key-values "$SSH_KEY_PATH" \
        --public-ip-sku Standard \
        --output table
else
    echo "⚠️ SSH public key not found at $SSH_KEY_PATH, generating new keys automatically..."
    az vm create \
        --resource-group "$RESOURCE_GROUP" \
        --name "$VM_NAME" \
        --image "Canonical:ubuntu-24_04-lts:server:latest" \
        --size "$VM_SIZE" \
        --admin-username "$ADMIN_USERNAME" \
        --generate-ssh-keys \
        --public-ip-sku Standard \
        --output table
fi

# 3. Configure Network Security Group (NSG) Inbound Rules
echo "🛡️ Configuring firewall rules (NSG)..."
NSG_NAME="${VM_NAME}NSG"

# Open HTTP (80)
az network nsg rule create \
    --resource-group "$RESOURCE_GROUP" \
    --nsg-name "$NSG_NAME" \
    --name Allow-HTTP-80 \
    --priority 1001 \
    --destination-port-ranges 80 \
    --protocol Tcp \
    --access Allow \
    --output none

# Open HTTPS (443)
az network nsg rule create \
    --resource-group "$RESOURCE_GROUP" \
    --nsg-name "$NSG_NAME" \
    --name Allow-HTTPS-443 \
    --priority 1002 \
    --destination-port-ranges 443 \
    --protocol Tcp \
    --access Allow \
    --output none

# Open Web Dashboard Direct (3000)
az network nsg rule create \
    --resource-group "$RESOURCE_GROUP" \
    --nsg-name "$NSG_NAME" \
    --name Allow-Dashboard-3000 \
    --priority 1003 \
    --destination-port-ranges 3000 \
    --protocol Tcp \
    --access Allow \
    --output none

# 4. Get Public IP
PUBLIC_IP=$(az vm show -d -g "$RESOURCE_GROUP" -n "$VM_NAME" --query publicIps -o tsv)

echo ""
echo "=========================================================="
echo "✅ Azure VM Provisioned Successfully!"
echo "Public IP: $PUBLIC_IP"
echo ""
echo "👉 Next Step: Connect via SSH and run K3s setup:"
echo "   ssh $ADMIN_USERNAME@$PUBLIC_IP"
echo "   curl -sSL https://raw.githubusercontent.com/maoroch/Autonomous_social_intelligence_engine/main/scripts/azure/setup-k3s.sh | bash"
echo "=========================================================="
