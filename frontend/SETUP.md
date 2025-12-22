# Frontend Setup Guide

## 環境変数

### 必須環境変数

| 変数名 | 説明 | 取得方法 |
|--------|------|----------|
| `NEXT_PUBLIC_AWS_REGION` | AWS リージョン | `ap-northeast-1` |
| `NEXT_PUBLIC_AGENTCORE_ENDPOINT` | AgentCore エンドポイント URL | SSM: `/agentcore/${ENV}/agent-endpoint-url` |
| `NEXT_PUBLIC_COGNITO_USER_POOL_ID` | Cognito User Pool ID | CDK 出力 |
| `NEXT_PUBLIC_COGNITO_CLIENT_ID` | Cognito Client ID | CDK 出力 |
| `NEXT_PUBLIC_COGNITO_IDENTITY_POOL_ID` | Cognito Identity Pool ID | CDK 出力 |

### ローカル開発

```bash
# .env.local を作成
cat > .env.local << 'EOF'
NEXT_PUBLIC_AWS_REGION=ap-northeast-1
NEXT_PUBLIC_AGENTCORE_ENDPOINT=<AgentCore Endpoint URL>
NEXT_PUBLIC_COGNITO_USER_POOL_ID=<User Pool ID>
NEXT_PUBLIC_COGNITO_CLIENT_ID=<Client ID>
NEXT_PUBLIC_COGNITO_IDENTITY_POOL_ID=<Identity Pool ID>
EOF

# 開発サーバー起動
npm run dev
```

## AWS Amplify デプロイ

### 1. Amplify アプリ作成

```bash
# AWS CLI でアプリ作成
aws amplify create-app \
  --name agentic-rag-frontend \
  --repository https://github.com/aezisai-inc/ai-agent-core-microservice-prot \
  --platform WEB_COMPUTE \
  --region ap-northeast-1

# ブランチ接続
aws amplify create-branch \
  --app-id <APP_ID> \
  --branch-name develop \
  --stage DEVELOPMENT
```

### 2. 環境変数設定

Amplify コンソールまたは CLI で以下を設定:

```bash
aws amplify update-app \
  --app-id <APP_ID> \
  --environment-variables \
    NEXT_PUBLIC_AWS_REGION=ap-northeast-1,\
    NEXT_PUBLIC_AGENTCORE_ENDPOINT=<endpoint>,\
    NEXT_PUBLIC_COGNITO_USER_POOL_ID=<pool_id>,\
    NEXT_PUBLIC_COGNITO_CLIENT_ID=<client_id>,\
    NEXT_PUBLIC_COGNITO_IDENTITY_POOL_ID=<identity_pool_id>
```

### 3. ビルド開始

```bash
aws amplify start-job \
  --app-id <APP_ID> \
  --branch-name develop \
  --job-type RELEASE
```

## ディレクトリ構成

```
frontend/
├── src/
│   ├── app/              # Next.js App Router
│   ├── entities/         # FSD: エンティティ層
│   ├── features/         # FSD: 機能層
│   ├── shared/           # FSD: 共有層
│   └── widgets/          # FSD: ウィジェット層
├── amplify.yml           # Amplify ビルド設定
└── package.json
```

## テスト

```bash
# ユニットテスト
npm run test

# カバレッジ
npm run test:coverage

# Storybook
npm run storybook
```











