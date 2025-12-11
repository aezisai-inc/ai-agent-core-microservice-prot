#!/bin/bash
#
# AgentCore Runtime 再デプロイスクリプト
#
# ⚠️  DEPRECATED: このスクリプトは非推奨です。
#     CDK による CI/CD パイプラインを使用してください。
#
#     代替方法:
#       1. GitHub Actions による自動デプロイ (推奨)
#       2. 手動: cd infrastructure && npx cdk deploy AgenticRag-AgentCore-*
#
#     詳細: docs/architecture/iac-custom-resource-design.md
#
# このスクリプトは以下を実行します:
# 1. Docker イメージをビルド
# 2. ECR にプッシュ
# 3. AgentCore Runtime を更新 (heredoc Python - 非推奨)
#
# 使用方法:
#   ./scripts/redeploy-agentcore.sh
#

set -e

# Deprecation warning
echo ""
echo "========================================================================"
echo "⚠️  DEPRECATED: This script is deprecated."
echo "   Use CDK-based deployment instead:"
echo ""
echo "   Option 1: Push to develop branch (GitHub Actions auto-deploy)"
echo "   Option 2: cd infrastructure && npx cdk deploy AgenticRag-AgentCore-*"
echo ""
echo "   See: docs/architecture/iac-custom-resource-design.md"
echo "========================================================================"
echo ""
read -p "Continue anyway? (y/N): " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "Aborted."
    exit 1
fi

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

# Get Knowledge Base ID from SSM
KB_ID=$(aws ssm get-parameter \
  --name "/agentcore/${ENVIRONMENT}/knowledge-base-id" \
  --query Parameter.Value \
  --output text \
  --region ${REGION} 2>/dev/null || echo "NOT_CONFIGURED")

if [ "$KB_ID" = "NOT_CONFIGURED" ]; then
  echo "⚠️  Knowledge Base ID が SSM に設定されていません"
  echo ""
  echo "設定方法:"
  echo "  aws ssm put-parameter \\"
  echo "    --name \"/agentcore/${ENVIRONMENT}/knowledge-base-id\" \\"
  echo "    --value \"YOUR_KNOWLEDGE_BASE_ID\" \\"
  echo "    --type String"
  echo ""
  echo "詳細: docs/deployment/ssm-parameters.md を参照"
else
  echo "Knowledge Base ID: ${KB_ID}"
  echo "RAG 機能が有効になりました。"
  echo ""
  echo "テスト方法:"
  echo "  チャットで「製品の価格プランは？」などを質問してください。"
fi
echo "=============================================="

