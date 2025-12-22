#!/bin/bash
# ====================================
# Amplify Frontend Deployment Script
# ====================================

set -e

REGION="ap-northeast-1"
ENVIRONMENT="${ENVIRONMENT:-development}"
APP_NAME="agentic-rag-frontend-${ENVIRONMENT}"
BRANCH_NAME="develop"
REPOSITORY="https://github.com/aezisai-inc/ai-agent-core-microservice-prot"

# SSMパラメータから設定を取得
echo "📦 Loading configuration from SSM..."
AGENTCORE_ENDPOINT=$(aws ssm get-parameter --name "/agentcore/${ENVIRONMENT}/agent-endpoint-url" --query "Parameter.Value" --output text 2>/dev/null || echo "")
USER_POOL_ID=$(aws ssm get-parameter --name "/agentcore/${ENVIRONMENT}/cognito-user-pool-id" --query "Parameter.Value" --output text 2>/dev/null || echo "")
CLIENT_ID=$(aws ssm get-parameter --name "/agentcore/${ENVIRONMENT}/cognito-client-id" --query "Parameter.Value" --output text 2>/dev/null || echo "")
IDENTITY_POOL_ID=$(aws ssm get-parameter --name "/agentcore/${ENVIRONMENT}/cognito-identity-pool-id" --query "Parameter.Value" --output text 2>/dev/null || echo "")

# 既存のアプリをチェック
echo "🔍 Checking for existing Amplify app..."
APP_ID=$(aws amplify list-apps --query "apps[?name=='${APP_NAME}'].appId" --output text --region ${REGION} 2>/dev/null || echo "")

if [ -z "$APP_ID" ]; then
    echo "🆕 Creating new Amplify app: ${APP_NAME}"
    
    # OAuthトークンの確認
    if [ -z "$GITHUB_TOKEN" ]; then
        echo "⚠️  GITHUB_TOKEN environment variable not set."
        echo "   Please create a GitHub Personal Access Token and set it:"
        echo "   export GITHUB_TOKEN=<your_token>"
        echo ""
        echo "   Or create the app manually via AWS Console."
        exit 1
    fi
    
    APP_ID=$(aws amplify create-app \
        --name "${APP_NAME}" \
        --repository "${REPOSITORY}" \
        --oauth-token "${GITHUB_TOKEN}" \
        --platform WEB_COMPUTE \
        --region ${REGION} \
        --query "app.appId" \
        --output text)
    
    echo "✅ App created: ${APP_ID}"
    
    # ブランチ作成
    echo "🔗 Creating branch: ${BRANCH_NAME}"
    aws amplify create-branch \
        --app-id "${APP_ID}" \
        --branch-name "${BRANCH_NAME}" \
        --stage DEVELOPMENT \
        --region ${REGION}
else
    echo "✅ Found existing app: ${APP_ID}"
fi

# 環境変数設定
echo "🔧 Configuring environment variables..."
ENV_VARS="NEXT_PUBLIC_AWS_REGION=${REGION}"

if [ -n "$AGENTCORE_ENDPOINT" ]; then
    ENV_VARS="${ENV_VARS},NEXT_PUBLIC_AGENTCORE_ENDPOINT=${AGENTCORE_ENDPOINT}"
fi
if [ -n "$USER_POOL_ID" ]; then
    ENV_VARS="${ENV_VARS},NEXT_PUBLIC_COGNITO_USER_POOL_ID=${USER_POOL_ID}"
    ENV_VARS="${ENV_VARS},NEXT_PUBLIC_USER_POOL_ID=${USER_POOL_ID}"
fi
if [ -n "$CLIENT_ID" ]; then
    ENV_VARS="${ENV_VARS},NEXT_PUBLIC_COGNITO_CLIENT_ID=${CLIENT_ID}"
    ENV_VARS="${ENV_VARS},NEXT_PUBLIC_USER_POOL_CLIENT_ID=${CLIENT_ID}"
fi
if [ -n "$IDENTITY_POOL_ID" ]; then
    ENV_VARS="${ENV_VARS},NEXT_PUBLIC_COGNITO_IDENTITY_POOL_ID=${IDENTITY_POOL_ID}"
    ENV_VARS="${ENV_VARS},NEXT_PUBLIC_IDENTITY_POOL_ID=${IDENTITY_POOL_ID}"
fi

aws amplify update-app \
    --app-id "${APP_ID}" \
    --environment-variables "${ENV_VARS}" \
    --region ${REGION}

echo "✅ Environment variables configured"

# ビルド開始
echo "🚀 Starting deployment..."
JOB_ID=$(aws amplify start-job \
    --app-id "${APP_ID}" \
    --branch-name "${BRANCH_NAME}" \
    --job-type RELEASE \
    --region ${REGION} \
    --query "jobSummary.jobId" \
    --output text)

echo "📋 Job started: ${JOB_ID}"
echo ""
echo "=== Deployment Info ==="
echo "App ID:     ${APP_ID}"
echo "Branch:     ${BRANCH_NAME}"
echo "Job ID:     ${JOB_ID}"
echo "Region:     ${REGION}"
echo ""
echo "🔗 Console URL:"
echo "   https://${REGION}.console.aws.amazon.com/amplify/apps/${APP_ID}/branches/${BRANCH_NAME}"
echo ""
echo "📊 Check status:"
echo "   aws amplify get-job --app-id ${APP_ID} --branch-name ${BRANCH_NAME} --job-id ${JOB_ID} --region ${REGION}"










