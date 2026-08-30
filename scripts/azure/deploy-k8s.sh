#!/usr/bin/env bash
# ==============================================================================
# One-Command Kubernetes Deployment Script for LinkedIn AI Pipeline
# ==============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

echo "=========================================================="
echo "☸️ Deploying LinkedIn AI Pipeline to Kubernetes Cluster"
echo "Project Directory: $PROJECT_ROOT"
echo "=========================================================="

cd "$PROJECT_ROOT"

# Check kubectl
if ! command -v kubectl &> /dev/null; then
    echo "❌ Error: kubectl is not installed or not in PATH."
    exit 1
fi

# 1. Check if secrets are configured
if grep -q "gsk_your_groq_api_key_here" k8s/secret-template.yaml; then
    echo "⚠️ WARNING: k8s/secret-template.yaml contains placeholder API keys."
    echo "Please update k8s/secret-template.yaml with your real GROQ_API_KEY / TELEGRAM_BOT_TOKEN before going live."
    echo "Press Enter to proceed anyway, or Ctrl+C to abort and edit now..."
    read -r
fi

# 2. Apply Kustomize manifests
echo "📦 Applying Kubernetes manifests from k8s/ directory..."
kubectl apply -k k8s/

# 3. Wait for database deployments to be ready
echo "⏳ Waiting for Mongo and Redis to become ready..."
kubectl rollout status deployment/mongo -n linkedin-pipeline --timeout=120s
kubectl rollout status deployment/redis -n linkedin-pipeline --timeout=120s

# 4. Wait for core services
echo "⏳ Waiting for OpenClaw and Web Dashboard..."
kubectl rollout status deployment/openclaw -n linkedin-pipeline --timeout=180s
kubectl rollout status deployment/web-dashboard -n linkedin-pipeline --timeout=180s
kubectl rollout status deployment/telegram-bot -n linkedin-pipeline --timeout=180s

echo ""
echo "=========================================================="
echo "🎉 LinkedIn AI Pipeline successfully deployed!"
echo "=========================================================="
echo ""
echo "📊 Current Pod Status in namespace 'linkedin-pipeline':"
kubectl get pods -n linkedin-pipeline -o wide
echo ""
echo "🌐 Ingress Routing:"
kubectl get ingress -n linkedin-pipeline
echo ""
echo "⚡ KEDA Autoscalers:"
kubectl get scaledobjects -n linkedin-pipeline
echo "=========================================================="
