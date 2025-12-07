# AgentCore + S3 Vectors デプロイメントレポート

**デプロイ日時**: 2025-12-07
**リージョン**: ap-northeast-1 (東京)
**環境**: development

## ✅ デプロイ完了コンポーネント

### 1. S3 Vectors (Knowledge Base ベクトルストア)

| リソース | 値 |
|---------|-----|
| Vector Bucket | `agentcore-kb-vectors-development` |
| Vector Bucket ARN | `arn:aws:s3vectors:ap-northeast-1:226484346947:bucket/agentcore-kb-vectors-development` |
| Vector Index | `agentcore-kb-index` |
| Vector Index ARN | `arn:aws:s3vectors:ap-northeast-1:226484346947:bucket/agentcore-kb-vectors-development/index/agentcore-kb-index` |
| Dimension | 1024 (Titan Embed Text v2) |
| Distance Metric | cosine |

**コスト**: OpenSearch Serverless の **1/10 以下** ($5-20/月 vs $700+/月)

### 2. Bedrock Knowledge Base

| リソース | 値 |
|---------|-----|
| Knowledge Base ID | `KCOEXQD1NV` |
| Knowledge Base ARN | `arn:aws:bedrock:ap-northeast-1:226484346947:knowledge-base/KCOEXQD1NV` |
| Status | `ACTIVE` |
| Storage Type | S3_VECTORS |
| Embedding Model | amazon.titan-embed-text-v2:0 |

### 3. Data Source

| リソース | 値 |
|---------|-----|
| Data Source ID | `R1BW5OB1WP` |
| Source Bucket | `agentcore-documents-226484346947-development` |
| Inclusion Prefix | `documents/` |
| Chunking Strategy | FIXED_SIZE (512 tokens, 20% overlap) |

### 4. AgentCore Runtime

| リソース | 値 |
|---------|-----|
| Runtime Name | `agentcoreRuntimeDevelopment` |
| Runtime ARN | (SSMパラメータ参照) |
| Region | ap-northeast-1 |
| ECR Repository | `agentic-rag-agent-development` |

### 5. AgentCore Memory

| リソース | 値 |
|---------|-----|
| Memory Store ID | `mem_01jensb3j9e3q1hpws0b0gd15r` |
| Strategies | Short-term, Episodic, Semantic |

### 6. CDK管理リソース

| リソース | 値 |
|---------|-----|
| Events Table | `agentic-rag-events-development` |
| Read Models Table | `agentic-rag-read-models-development` |
| Documents Bucket | `agentcore-documents-226484346947-development` |
| User Pool ID | (Cognito) |

## SSM パラメータ一覧

```
/agentcore/development/knowledge-base-id: KCOEXQD1NV
/agentcore/development/knowledge-base-arn: arn:aws:bedrock:ap-northeast-1:...
/agentcore/development/data-source-id: R1BW5OB1WP
/agentcore/development/vector-bucket: agentcore-kb-vectors-development
/agentcore/development/agentcore-region: ap-northeast-1
/agentcore/development/agent-endpoint-id-tokyo: agentcoreEndpointDevelopment
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
│  │ - Short-term    │      │  ID: KCOEXQD1NV     │    │ - CloudWatch ││
│  │ - Episodic      │      │  Storage: S3_VECTORS│    │ - X-Ray      ││
│  │ - Semantic      │      │  Cost: ~$10/月      │    │              ││
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

## 次のステップ

1. ✅ ~~Knowledge Base (S3 Vectors) 作成~~
2. ⬜ Documents バケットにサンプルドキュメントをアップロード
3. ⬜ Knowledge Base インジェスト実行
4. ⬜ Agent Runtime と Knowledge Base 連携テスト
5. ⬜ Frontend RAG UI 実装
6. ⬜ Amplify デプロイ

## ドキュメントアップロード & インジェスト方法

```bash
# 1. ドキュメントをS3にアップロード
aws s3 cp ./docs/ s3://agentcore-documents-226484346947-development/documents/ --recursive

# 2. Knowledge Base インジェスト開始
aws bedrock-agent start-ingestion-job \
  --knowledge-base-id KCOEXQD1NV \
  --data-source-id R1BW5OB1WP
```

## 検索テスト方法

```python
import boto3

client = boto3.client('bedrock-agent-runtime', region_name='ap-northeast-1')

response = client.retrieve(
    knowledgeBaseId='KCOEXQD1NV',
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

