#!/bin/bash
# ====================================
# Amplify + CodeCommit Deployment Script
# ====================================
# GitHub OAuth 不要、AWS CLI のみで完結

set -e

REGION="ap-northeast-1"
ENVIRONMENT="${ENVIRONMENT:-development}"
APP_NAME="agentic-rag-frontend-${ENVIRONMENT}"
REPO_NAME="agentic-rag-frontend-${ENVIRONMENT}"
BRANCH_NAME="develop"
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)

echo "======================================"
echo "Amplify + CodeCommit Deployment"
echo "======================================"
echo "Region: ${REGION}"
echo "Environment: ${ENVIRONMENT}"
echo "Account: ${ACCOUNT_ID}"
echo ""

# ----------------------------------------
# Step 1: CodeCommit リポジトリ作成
# ----------------------------------------
echo "📦 Step 1: Creating CodeCommit repository..."

REPO_EXISTS=$(aws codecommit get-repository --repository-name ${REPO_NAME} --region ${REGION} 2>/dev/null && echo "yes" || echo "no")

if [ "$REPO_EXISTS" = "no" ]; then
    aws codecommit create-repository \
        --repository-name ${REPO_NAME} \
        --repository-description "Agentic RAG Frontend - ${ENVIRONMENT}" \
        --region ${REGION}
    echo "✅ Repository created: ${REPO_NAME}"
else
    echo "✅ Repository already exists: ${REPO_NAME}"
fi

CODECOMMIT_URL="https://git-codecommit.${REGION}.amazonaws.com/v1/repos/${REPO_NAME}"
echo "   URL: ${CODECOMMIT_URL}"

# ----------------------------------------
# Step 2: CodeCommit へ Push
# ----------------------------------------
echo ""
echo "📤 Step 2: Pushing to CodeCommit..."

# credential helper 設定確認
git config --global credential.helper '!aws codecommit credential-helper $@'
git config --global credential.UseHttpPath true

# リモート追加/更新
if git remote get-url codecommit 2>/dev/null; then
    git remote set-url codecommit ${CODECOMMIT_URL}
else
    git remote add codecommit ${CODECOMMIT_URL}
fi

# Push
git push codecommit ${BRANCH_NAME} --force
echo "✅ Pushed to CodeCommit"

# ----------------------------------------
# Step 3: Amplify サービスロール作成
# ----------------------------------------
echo ""
echo "🔐 Step 3: Creating Amplify service role..."

ROLE_NAME="AmplifyServiceRole-${ENVIRONMENT}"

# ロールが存在するか確認
ROLE_EXISTS=$(aws iam get-role --role-name ${ROLE_NAME} 2>/dev/null && echo "yes" || echo "no")

if [ "$ROLE_EXISTS" = "no" ]; then
    # Trust policy
    cat > /tmp/amplify-trust-policy.json << 'EOF'
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "Service": "amplify.amazonaws.com"
      },
      "Action": "sts:AssumeRole"
    }
  ]
}
EOF

    aws iam create-role \
        --role-name ${ROLE_NAME} \
        --assume-role-policy-document file:///tmp/amplify-trust-policy.json

    # Attach policies
    aws iam attach-role-policy \
        --role-name ${ROLE_NAME} \
        --policy-arn arn:aws:iam::aws:policy/AdministratorAccess-Amplify

    aws iam attach-role-policy \
        --role-name ${ROLE_NAME} \
        --policy-arn arn:aws:iam::aws:policy/AWSCodeCommitReadOnly

    echo "✅ Service role created: ${ROLE_NAME}"
    
    # ロールが使用可能になるまで待機
    echo "   Waiting for role propagation..."
    sleep 10
else
    echo "✅ Service role already exists: ${ROLE_NAME}"
fi

ROLE_ARN="arn:aws:iam::${ACCOUNT_ID}:role/${ROLE_NAME}"

# ----------------------------------------
# Step 4: Amplify アプリ作成
# ----------------------------------------
echo ""
echo "🚀 Step 4: Creating Amplify app..."

APP_ID=$(aws amplify list-apps --query "apps[?name=='${APP_NAME}'].appId" --output text --region ${REGION} 2>/dev/null || echo "")

if [ -z "$APP_ID" ]; then
    APP_ID=$(aws amplify create-app \
        --name "${APP_NAME}" \
        --repository "${CODECOMMIT_URL}" \
        --platform WEB_COMPUTE \
        --iam-service-role-arn "${ROLE_ARN}" \
        --region ${REGION} \
        --query "app.appId" \
        --output text)
    
    echo "✅ App created: ${APP_ID}"
else
    echo "✅ App already exists: ${APP_ID}"
fi

# ----------------------------------------
# Step 5: ブランチ接続
# ----------------------------------------
echo ""
echo "🔗 Step 5: Connecting branch..."

BRANCH_EXISTS=$(aws amplify get-branch --app-id ${APP_ID} --branch-name ${BRANCH_NAME} --region ${REGION} 2>/dev/null && echo "yes" || echo "no")

if [ "$BRANCH_EXISTS" = "no" ]; then
    aws amplify create-branch \
        --app-id "${APP_ID}" \
        --branch-name "${BRANCH_NAME}" \
        --stage DEVELOPMENT \
        --enable-auto-build \
        --region ${REGION}
    echo "✅ Branch connected: ${BRANCH_NAME}"
else
    echo "✅ Branch already connected: ${BRANCH_NAME}"
fi

# ----------------------------------------
# Step 6: 環境変数設定
# ----------------------------------------
echo ""
echo "🔧 Step 6: Configuring environment variables..."

# SSMから設定を取得
AGENTCORE_ENDPOINT=$(aws ssm get-parameter --name "/agentcore/${ENVIRONMENT}/agent-endpoint-url" --query "Parameter.Value" --output text 2>/dev/null || echo "")
USER_POOL_ID=$(aws ssm get-parameter --name "/agentcore/${ENVIRONMENT}/cognito-user-pool-id" --query "Parameter.Value" --output text 2>/dev/null || echo "")
CLIENT_ID=$(aws ssm get-parameter --name "/agentcore/${ENVIRONMENT}/cognito-client-id" --query "Parameter.Value" --output text 2>/dev/null || echo "")
IDENTITY_POOL_ID=$(aws ssm get-parameter --name "/agentcore/${ENVIRONMENT}/cognito-identity-pool-id" --query "Parameter.Value" --output text 2>/dev/null || echo "")

# 環境変数を構築
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

# ----------------------------------------
# Step 7: ビルド開始
# ----------------------------------------
echo ""
echo "🏗️  Step 7: Starting build..."

JOB_ID=$(aws amplify start-job \
    --app-id "${APP_ID}" \
    --branch-name "${BRANCH_NAME}" \
    --job-type RELEASE \
    --region ${REGION} \
    --query "jobSummary.jobId" \
    --output text)

echo "✅ Build started: ${JOB_ID}"

# ----------------------------------------
# 結果出力
# ----------------------------------------
echo ""
echo "======================================"
echo "✅ Deployment Complete!"
echo "======================================"
echo ""
echo "App ID:        ${APP_ID}"
echo "Branch:        ${BRANCH_NAME}"
echo "Job ID:        ${JOB_ID}"
echo "Region:        ${REGION}"
echo ""
echo "🔗 Console URL:"
echo "   https://${REGION}.console.aws.amazon.com/amplify/apps/${APP_ID}"
echo ""
echo "🌐 App URL (after build completes):"
echo "   https://${BRANCH_NAME}.${APP_ID}.amplifyapp.com"
echo ""
echo "📊 Check build status:"
echo "   aws amplify get-job --app-id ${APP_ID} --branch-name ${BRANCH_NAME} --job-id ${JOB_ID} --region ${REGION}"
echo ""

# SSMにAmplify情報を保存
echo "💾 Saving Amplify info to SSM..."
aws ssm put-parameter \
    --name "/agentcore/${ENVIRONMENT}/amplify-app-id" \
    --value "${APP_ID}" \
    --type String \
    --overwrite \
    --region ${REGION} 2>/dev/null || true

aws ssm put-parameter \
    --name "/agentcore/${ENVIRONMENT}/amplify-app-url" \
    --value "https://${BRANCH_NAME}.${APP_ID}.amplifyapp.com" \
    --type String \
    --overwrite \
    --region ${REGION} 2>/dev/null || true

echo "✅ SSM parameters saved"










