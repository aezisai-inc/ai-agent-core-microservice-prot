#!/bin/bash
#
# AgentCore Runtime 再デプロイスクリプト
#
# このスクリプトは以下を実行します:
# 1. Docker イメージをビルド
# 2. ECR にプッシュ
# 3. AgentCore Runtime を更新
#
# 使用方法:
#   ./scripts/redeploy-agentcore.sh
#

set -e

# Configuration
ENVIRONMENT="${ENVIRONMENT:-development}"
REGION="${AWS_REGION:-ap-northeast-1}"
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)

echo "=============================================="
echo "  AgentCore Runtime 再デプロイ"
echo "=============================================="
echo "  Environment: ${ENVIRONMENT}"
echo "  Region: ${REGION}"
echo "  Account: ${ACCOUNT_ID}"
echo "=============================================="

# ECR Repository
ECR_REPO="agentic-rag-agent-${ENVIRONMENT}"
ECR_URI="${ACCOUNT_ID}.dkr.ecr.${REGION}.amazonaws.com/${ECR_REPO}"

# Get Runtime ID from SSM
RUNTIME_ID=$(aws ssm get-parameter \
  --name "/agentcore/${ENVIRONMENT}/agent-runtime-id" \
  --query Parameter.Value \
  --output text \
  --region ${REGION} 2>/dev/null || echo "")

if [ -z "$RUNTIME_ID" ]; then
  echo "❌ Agent Runtime ID not found in SSM"
  echo "   Please run the initial deployment first"
  exit 1
fi

echo ""
echo "📦 ECR Repository: ${ECR_URI}"
echo "🚀 Runtime ID: ${RUNTIME_ID}"
echo ""

# Step 1: Login to ECR
echo "🔐 Step 1: ECR ログイン..."
aws ecr get-login-password --region ${REGION} | \
  docker login --username AWS --password-stdin ${ACCOUNT_ID}.dkr.ecr.${REGION}.amazonaws.com

# Step 2: Build Docker image
echo ""
echo "🔨 Step 2: Docker イメージビルド..."
cd "$(dirname "$0")/../backend"
docker build -t ${ECR_REPO}:latest .

# Step 3: Tag and push to ECR
echo ""
echo "📤 Step 3: ECR へプッシュ..."
docker tag ${ECR_REPO}:latest ${ECR_URI}:latest
docker push ${ECR_URI}:latest

# Step 4: Update AgentCore Runtime
echo ""
echo "🔄 Step 4: AgentCore Runtime 更新..."

# Get current configuration
ROLE_ARN=$(aws bedrock-agentcore-control get-agent-runtime \
  --agent-runtime-id ${RUNTIME_ID} \
  --region ${REGION} \
  --query 'agentRuntime.roleArn' \
  --output text 2>/dev/null || echo "")

if [ -z "$ROLE_ARN" ]; then
  ROLE_ARN="arn:aws:iam::${ACCOUNT_ID}:role/agentcore-runtime-role-${ENVIRONMENT}"
fi

# Update runtime with new image
python3 << EOF
import boto3
import time

client = boto3.client('bedrock-agentcore-control', region_name='${REGION}')

print("  Updating Agent Runtime...")
response = client.update_agent_runtime(
    agentRuntimeId='${RUNTIME_ID}',
    agentRuntimeArtifact={
        'containerConfiguration': {
            'containerUri': '${ECR_URI}:latest'
        }
    },
    networkConfiguration={'networkMode': 'PUBLIC'},
    roleArn='${ROLE_ARN}'
)

print(f"  Update initiated, waiting for ACTIVE status...")

# Wait for runtime to become active
for i in range(30):
    status_response = client.get_agent_runtime(agentRuntimeId='${RUNTIME_ID}')
    status = status_response['agentRuntime'].get('status', 'UNKNOWN')
    print(f"    Status: {status}")
    if status == 'ACTIVE':
        print("  ✅ Agent Runtime is ACTIVE")
        break
    elif status in ['FAILED', 'DELETE_FAILED']:
        print(f"  ❌ Update failed: {status}")
        exit(1)
    time.sleep(10)
else:
    print("  ⚠️  Timeout waiting for ACTIVE status")
    exit(1)
EOF

echo ""
echo "=============================================="
echo "  ✅ 再デプロイ完了!"
echo "=============================================="
echo ""
echo "Knowledge Base ID: KCOEXQD1NV"
echo "RAG 機能が有効になりました。"
echo ""
echo "テスト方法:"
echo "  チャットで「製品の価格プランは？」などを質問してください。"
echo "=============================================="

