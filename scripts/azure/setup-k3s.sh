#!/usr/bin/env bash
# ==============================================================================
# K3s, Helm, KEDA & Environment Setup Script for Azure VM (Ubuntu 24.04)
# ==============================================================================

set -euo pipefail

echo "=========================================================="
echo "☸️ Setting up K3s, Helm 3, and KEDA on Azure VM"
echo "=========================================================="

# 1. Update system packages
echo "📦 Updating system packages..."
sudo apt-get update -y && sudo apt-get upgrade -y
sudo apt-get install -y curl git jq htop ufw

# 2. Install K3s (Lightweight Kubernetes)
echo "🚀 Installing K3s..."
curl -sfL https://get.k3s.io | sh -

# 3. Configure Kubeconfig Permissions
echo "🔑 Configuring Kubeconfig permissions..."
mkdir -p "$HOME/.kube"
sudo cp /etc/rancher/k3s/k3s.yaml "$HOME/.kube/config"
sudo chown -R "$(id -u):$(id -g)" "$HOME/.kube"
chmod 600 "$HOME/.kube/config"

export KUBECONFIG="$HOME/.kube/config"
echo 'export KUBECONFIG=$HOME/.kube/config' >> "$HOME/.bashrc"
echo 'alias k=kubectl' >> "$HOME/.bashrc"

# Wait for K3s node to become Ready
echo "⏳ Waiting for K3s node to be ready..."
until sudo k3s kubectl get nodes | grep -q "Ready"; do
    sleep 3
done
echo "✅ K3s node is Ready!"

# 4. Install Helm 3
echo "📦 Installing Helm 3..."
if ! command -v helm &> /dev/null; then
    curl https://raw.githubusercontent.com/helm/helm/main/scripts/get-helm-3 | bash
fi

# 5. Install KEDA (Kubernetes Event-driven Autoscaling)
echo "⚡ Installing KEDA Operator for BullMQ / Redis Autoscaling..."
helm repo add kedacore https://kedacore.github.io/charts
helm repo update
helm upgrade --install keda kedacore/keda \
    --namespace keda \
    --create-namespace \
    --set resources.operator.requests.cpu=20m \
    --set resources.operator.requests.memory=64Mi \
    --set resources.operator.limits.cpu=100m \
    --set resources.operator.limits.memory=128Mi \
    --set resources.metricServer.requests.cpu=20m \
    --set resources.metricServer.requests.memory=64Mi \
    --set resources.metricServer.limits.cpu=100m \
    --set resources.metricServer.limits.memory=128Mi

# 6. Clone or Update Application Repository
REPO_DIR="$HOME/linkedin_ai-agent_tool"
if [ ! -d "$REPO_DIR" ]; then
    echo "📥 Cloning project repository..."
    git clone https://github.com/maoroch/Autonomous_social_intelligence_engine.git "$REPO_DIR"
else
    echo "🔄 Pulling latest changes in repository..."
    cd "$REPO_DIR" && git pull origin main
fi

echo ""
echo "=========================================================="
echo "✅ K3s, Helm, and KEDA are successfully installed!"
echo ""
echo "👉 Next Steps:"
echo "   1. cd $REPO_DIR"
echo "   2. Edit k8s/secret-template.yaml with your real API keys: nano k8s/secret-template.yaml"
echo "   3. Run deployment script: bash scripts/azure/deploy-k8s.sh"
echo "=========================================================="
