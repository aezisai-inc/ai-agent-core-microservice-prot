# AgentCore + S3 Vectors デプロイメントレポート

**リージョン**: ap-northeast-1 (東京)
**環境**: development

## ✅ デプロイ完了コンポーネント

### 1. S3 Vectors (Knowledge Base ベクトルストア)

| リソース | 値 |
|---------|-----|
| Vector Bucket | `agentcore-kb-vectors-${ENVIRONMENT}` |
| Vector Bucket ARN | `arn:aws:s3vectors:${REGION}:${ACCOUNT_ID}:bucket/agentcore-kb-vectors-${ENVIRONMENT}` |
| Vector Index | `agentcore-kb-index` |
| Vector Index ARN | `arn:aws:s3vectors:${REGION}:${ACCOUNT_ID}:bucket/.../index/agentcore-kb-index` |
| Dimension | 1024 (Titan Embed Text v2) |
| Distance Metric | cosine |

**コスト**: OpenSearch Serverless の **1/10 以下** ($5-20/月 vs $700+/月)

### 2. Bedrock Knowledge Base

| リソース | 値 |
|---------|-----|
| Knowledge Base ID | SSMパラメータ参照 |
| Knowledge Base ARN | `arn:aws:bedrock:${REGION}:${ACCOUNT_ID}:knowledge-base/${KB_ID}` |
| Status | `ACTIVE` |
| Storage Type | S3_VECTORS |
| Embedding Model | amazon.titan-embed-text-v2:0 |

### 3. Data Source

| リソース | 値 |
|---------|-----|
| Data Source ID | SSMパラメータ参照 |
| Source Bucket | `agentcore-documents-${ACCOUNT_ID}-${ENVIRONMENT}` |
| Inclusion Prefix | `documents/` |
| Chunking Strategy | FIXED_SIZE (512 tokens, 20% overlap) |

### 4. AgentCore Runtime

| リソース | 値 |
|---------|-----|
| Runtime Name | `agentcoreRuntime${Environment}` |
| Runtime ARN | SSMパラメータ参照 |
| Region | ap-northeast-1 |
| ECR Repository | `agentic-rag-agent-${ENVIRONMENT}` |

### 5. AgentCore Memory

| リソース | 値 |
|---------|-----|
| Memory Store ID | SSMパラメータ参照 |
| Strategies | Short-term, Episodic, Semantic |

### 6. CDK管理リソース

| リソース | 値 |
|---------|-----|
| Events Table | `agentic-rag-events-${ENVIRONMENT}` |
| Read Models Table | `agentic-rag-read-models-${ENVIRONMENT}` |
| Documents Bucket | `agentcore-documents-${ACCOUNT_ID}-${ENVIRONMENT}` |
| User Pool ID | Cognito (CDKで自動生成) |

## SSM パラメータ一覧

```
/agentcore/${ENVIRONMENT}/knowledge-base-id
/agentcore/${ENVIRONMENT}/knowledge-base-arn
/agentcore/${ENVIRONMENT}/data-source-id
/agentcore/${ENVIRONMENT}/vector-bucket
/agentcore/${ENVIRONMENT}/agentcore-region
/agentcore/${ENVIRONMENT}/agent-endpoint-id
/agentcore/${ENVIRONMENT}/memory-store-id
```

## アーキテクチャ図

```
┌──────────────────────────────────────────────────────────────────────┐
│                         ap-northeast-1                                │
├──────────────────────────────────────────────────────────────────────┤
│                                                                       │
│  ┌─────────────────┐     ┌─────────────────────────────────────────┐ │
│  │  Amplify Gen2   │     │         AgentCore Runtime               │ │
│  │  (Frontend)     │────▶│  - Strands Agents                       │ │
│  │  + Cognito Auth │     │  - Clean Architecture                   │ │
│  └─────────────────┘     │  - Streaming Response                   │ │
│                          └──────────────────┬──────────────────────┘ │
│                                             │                         │
│           ┌─────────────────────────────────┼─────────────────────┐   │
│           ▼                                 ▼                     ▼   │
│  ┌─────────────────┐      ┌─────────────────────┐    ┌──────────────┐│
│  │ AgentCore       │      │  Bedrock KB         │    │ AgentCore    ││
│  │ Memory          │      │  + S3 Vectors       │    │ Observability││
│  │                 │      │                     │    │              ││
│  │ - Short-term    │      │  Storage: S3_VECTORS│    │ - CloudWatch ││
│  │ - Episodic      │      │  Cost: ~$10/月      │    │ - X-Ray      ││
│  │ - Semantic      │      │                     │    │              ││
│  └─────────────────┘      └─────────────────────┘    └──────────────┘│
│                                    │                                  │
│                                    ▼                                  │
│                          ┌─────────────────────┐                      │
│                          │  S3 Documents       │                      │
│                          │  (Data Source)      │                      │
│                          └─────────────────────┘                      │
│                                                                       │
└──────────────────────────────────────────────────────────────────────┘
```

## コスト見積もり (月額)

| コンポーネント | Before (OpenSearch) | After (S3 Vectors) |
|--------------|--------------------|--------------------|
| Vector Store | $700+ | **$5-20** |
| AgentCore Runtime | - | $10-30 |
| Memory Store | - | $5-10 |
| Bedrock Inference | $50-100 | $50-100 |
| **合計** | **$800+** | **$70-160** |

**削減率: 80%以上**

## ✅ RAG パイプライン動作確認済み

### テスト結果
```
Query: パスワードを忘れた場合
→ Score: 0.7291 | Source: faq.md ✅

Query: 料金プランについて  
→ Score: 0.6002 | Source: product-guide.md ✅

Query: APIの認証方法は？
→ Score: 0.7170 | Source: api-reference.md ✅
```

### S3 Vectors 設定上の注意点

S3 Vectors には **filterable metadata の 2048 byte 制限** があります。
Bedrock Knowledge Base と連携する場合、以下のメタデータキーを
`nonFilterableMetadataKeys` に設定する必要があります:

```python
metadataConfiguration={
    'nonFilterableMetadataKeys': [
        'AMAZON_BEDROCK_TEXT_CHUNK',
        'AMAZON_BEDROCK_METADATA',
        'x-amz-bedrock-kb-source-uri',
        'x-amz-bedrock-kb-data-source-id',
        'x-amz-bedrock-kb-chunk-id',
    ]
}
```

## 次のステップ

1. ✅ ~~Knowledge Base (S3 Vectors) 作成~~
2. ✅ ~~Documents バケットにサンプルドキュメントをアップロード~~
3. ✅ ~~Knowledge Base インジェスト実行~~
4. ✅ ~~Agent Runtime と Knowledge Base 連携~~
5. ✅ ~~RAG 検索テスト~~
6. ⬜ Frontend RAG UI 実装
7. ⬜ Amplify デプロイ

## ドキュメントアップロード & インジェスト方法

```bash
# 環境変数を設定
export ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
export ENVIRONMENT=development
export KB_ID=$(aws ssm get-parameter --name /agentcore/${ENVIRONMENT}/knowledge-base-id --query Parameter.Value --output text)
export DS_ID=$(aws ssm get-parameter --name /agentcore/${ENVIRONMENT}/data-source-id --query Parameter.Value --output text)

# 1. ドキュメントをS3にアップロード
aws s3 cp ./docs/ s3://agentcore-documents-${ACCOUNT_ID}-${ENVIRONMENT}/documents/ --recursive

# 2. Knowledge Base インジェスト開始
aws bedrock-agent start-ingestion-job \
  --knowledge-base-id ${KB_ID} \
  --data-source-id ${DS_ID}
```

## 検索テスト方法

```python
import boto3
import os

# SSMから設定を取得
ssm = boto3.client('ssm')
environment = os.getenv('ENVIRONMENT', 'development')

kb_id = ssm.get_parameter(
    Name=f'/agentcore/{environment}/knowledge-base-id'
)['Parameter']['Value']

# 検索実行
client = boto3.client('bedrock-agent-runtime', region_name='ap-northeast-1')

response = client.retrieve(
    knowledgeBaseId=kb_id,
    retrievalQuery={'text': 'テスト検索クエリ'},
    retrievalConfiguration={
        'vectorSearchConfiguration': {
            'numberOfResults': 5
        }
    }
)

for result in response['retrievalResults']:
    print(f"Score: {result['score']}")
    print(f"Content: {result['content']['text'][:200]}...")
    print()
```

## 環境変数テンプレート (.env.example)

```bash
# AWS Settings
APP_AWS_REGION=ap-northeast-1
APP_ENVIRONMENT=development

# Bedrock Knowledge Base (取得方法: aws ssm get-parameter)
APP_KNOWLEDGE_BASE_ID=<SSMから取得>
APP_DATA_SOURCE_ID=<SSMから取得>

# AgentCore
APP_AGENT_RUNTIME_NAME=agentcoreRuntime<Environment>
APP_AGENT_ENDPOINT_ID=<SSMから取得>
APP_MEMORY_STORE_ID=<SSMから取得>

# Model
APP_DEFAULT_MODEL_ID=us.amazon.nova-pro-v1:0
```
