# AgentCore Deployment Report

## デプロイ完了日時
2025-12-07 15:45 JST

## 環境
- **Environment**: development
- **AgentCore Region**: us-east-1
- **Infrastructure Region**: ap-northeast-1
- **Account ID**: 226484346947

---

## ✅ デプロイ済みリソース

### 1. インフラストラクチャ (CDK)

| リソース | 名前/ID | リージョン | ステータス |
|---------|---------|-----------|----------|
| DynamoDB (Events) | agentic-rag-events-development | ap-northeast-1 | ✅ ACTIVE |
| DynamoDB (ReadModels) | agentic-rag-read-models-development | ap-northeast-1 | ✅ ACTIVE |
| S3 (Documents) | agentcore-documents-226484346947-development | ap-northeast-1 | ✅ ACTIVE |
| S3 (Vectors) | agentcore-vectors-226484346947-development | ap-northeast-1 | ✅ ACTIVE |
| KMS Key | agentcore-development-key | ap-northeast-1 | ✅ ACTIVE |
| Cognito User Pool | agentic-rag-users-development | ap-northeast-1 | ✅ ACTIVE |
| ECR Repository | agentic-rag-agent-development | ap-northeast-1 | ✅ ACTIVE |
| ECR Repository | agentic-rag-agent-development | us-east-1 | ✅ ACTIVE |
| IAM Role | agentcore-runtime-role-development | global | ✅ ACTIVE |
| CodeBuild Project | agentic-rag-build-development | ap-northeast-1 | ✅ ACTIVE |

### 2. AgentCore Components (us-east-1)

| コンポーネント | ID/ARN | ステータス |
|--------------|--------|----------|
| **Memory Store** | agenticRagMemoryDevelopment-VIXDrsGejQ | ✅ ACTIVE |
| **Agent Runtime** | agentcoreRuntimeDevelopment-XyDhtY5Hdx | ✅ READY |
| **Runtime Endpoint** | agentcoreEndpointDevelopment | ✅ READY |
| **Default Endpoint** | DEFAULT | ✅ READY |

### 3. SSM Parameters

```
/agentcore/development/
├── agent-endpoint-arn    = arn:aws:bedrock-agentcore:us-east-1:226484346947:runtime/agentcoreRuntimeDevelopment-XyDhtY5Hdx/runtime-endpoint/agentcoreEndpointDevelopment
├── agent-endpoint-id     = agentcoreEndpointDevelopment
├── agent-runtime-id      = agentcoreRuntimeDevelopment-XyDhtY5Hdx
├── bedrock-model-id      = us.amazon.nova-pro-v1:0
├── ecr-repository-uri    = 226484346947.dkr.ecr.ap-northeast-1.amazonaws.com/agentic-rag-agent-development
├── ecr-repository-uri-useast1 = 226484346947.dkr.ecr.us-east-1.amazonaws.com/agentic-rag-agent-development
├── environment           = development
└── memory-store-id       = agenticRagMemoryDevelopment-VIXDrsGejQ
```

---

## ⏳ 未完了・オプション

| コンポーネント | 理由 | 優先度 |
|--------------|------|--------|
| Gateway | roleArn, authorizerType が必要 | 低 (オプション) |
| Knowledge Base (S3 Vector) | 追加設定が必要 | 中 |
| Amplify Frontend | フロントエンドデプロイ待ち | 後続タスク |

---

## アーキテクチャ概要

```
┌─────────────────────────────────────────────────────────────────────┐
│                          AWS Cloud                                   │
├─────────────────────────────────────────────────────────────────────┤
│  ap-northeast-1                      │  us-east-1                    │
│  ┌─────────────────────────────┐    │  ┌─────────────────────────┐ │
│  │  ECR Repository             │────┼──│  ECR Repository          │ │
│  │  (agentic-rag-agent-dev)    │    │  │  (agentic-rag-agent-dev) │ │
│  └─────────────────────────────┘    │  └───────────┬─────────────┘ │
│                                      │              │                │
│  ┌─────────────────────────────┐    │  ┌───────────▼─────────────┐ │
│  │  CodeBuild (ARM64)          │    │  │  AgentCore Runtime      │ │
│  │  - Docker build & push      │────┼──│  (agentcoreRuntime...)  │ │
│  └─────────────────────────────┘    │  └───────────┬─────────────┘ │
│                                      │              │                │
│  ┌─────────────────────────────┐    │  ┌───────────▼─────────────┐ │
│  │  DynamoDB                   │    │  │  Runtime Endpoint       │ │
│  │  - Events (Event Sourcing)  │    │  │  (agentcoreEndpoint...) │ │
│  │  - ReadModels (CQRS)        │    │  └───────────┬─────────────┘ │
│  └─────────────────────────────┘    │              │                │
│                                      │  ┌───────────▼─────────────┐ │
│  ┌─────────────────────────────┐    │  │  Memory Store           │ │
│  │  S3 Buckets                 │    │  │  (agenticRagMemory...)  │ │
│  │  - Documents                │    │  └─────────────────────────┘ │
│  │  - Vectors (Knowledge Base) │    │                               │
│  └─────────────────────────────┘    │                               │
│                                      │                               │
│  ┌─────────────────────────────┐    │                               │
│  │  Cognito User Pool          │    │                               │
│  │  - Authentication           │    │                               │
│  └─────────────────────────────┘    │                               │
└─────────────────────────────────────────────────────────────────────┘
```

---

## CI/CD パイプライン

### ビルドプロセス

1. **CodeBuild** (ARM64環境)
   - Git clone from GitHub
   - Docker build (uv + Python 3.11)
   - Push to ECR (ap-northeast-1 & us-east-1)

2. **デプロイスクリプト**
   - `scripts/deploy-agentcore-full.py`
   - Agent Runtime 作成
   - Endpoint 作成
   - SSM パラメータ更新

### トリガー

現在は手動実行。今後 CodePipeline による自動化を検討。

---

## 次のステップ

1. **フロントエンド (Amplify/Next.js)**
   - Cognito 認証統合
   - AgentCore Endpoint への接続

2. **Knowledge Base 設定**
   - S3 Vector 設定
   - OpenSearch Serverless (オプション)

3. **Gateway 設定** (オプション)
   - MCP プロトコル対応
   - 認証設定

4. **監視・ロギング**
   - CloudWatch Logs 設定
   - X-Ray トレーシング

---

## トラブルシューティングログ

### 解決済み問題

1. **pip dependency resolution error**
   - 解決: Dockerfile で `uv` を使用するように変更

2. **README.md not found**
   - 解決: Dockerfile で `uv sync` 前に必要なファイルをコピー

3. **ECR region mismatch**
   - 解決: us-east-1 にも ECR リポジトリを作成し、両方にプッシュ

4. **Architecture incompatible (arm64 required)**
   - 解決: CodeBuild を ARM_CONTAINER に変更

5. **IAM role trust policy**
   - 解決: `bedrock-agentcore.amazonaws.com` を追加

6. **ECR permissions for us-east-1**
   - 解決: IAM インラインポリシーで両リージョンの ECR 権限を追加
