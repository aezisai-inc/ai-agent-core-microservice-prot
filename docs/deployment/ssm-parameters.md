# SSM Parameter Store 設定ガイド

## 概要

AgentCore Runtime の設定は、AWS Systems Manager (SSM) Parameter Store から実行時に読み込まれます。
これにより、機密情報をコードに含めることなく、環境ごとに異なる設定を安全に管理できます。

## パラメータ命名規則

```
/agentcore/{environment}/{parameter-name}
```

- `{environment}`: 環境名（`development`, `staging`, `production`）
- `{parameter-name}`: パラメータ名（ケバブケース）

## 必須パラメータ

| パラメータ | 説明 | 例 |
|-----------|------|-----|
| `/agentcore/{env}/knowledge-base-id` | Bedrock Knowledge Base ID | `KCOEXQD1NV` |

## オプションパラメータ

| パラメータ | 説明 | デフォルト値 |
|-----------|------|-------------|
| `/agentcore/{env}/rag-top-k` | RAG検索結果の取得件数 | `5` |
| `/agentcore/{env}/rag-score-threshold` | RAG検索の最小スコア閾値 | `0.5` |

## パラメータ作成方法

### AWS CLI

```bash
# 環境変数
ENVIRONMENT="development"
KNOWLEDGE_BASE_ID="KCOEXQD1NV"

# Knowledge Base ID を設定
aws ssm put-parameter \
  --name "/agentcore/${ENVIRONMENT}/knowledge-base-id" \
  --value "${KNOWLEDGE_BASE_ID}" \
  --type "String" \
  --overwrite

# RAG 設定を設定（オプション）
aws ssm put-parameter \
  --name "/agentcore/${ENVIRONMENT}/rag-top-k" \
  --value "5" \
  --type "String" \
  --overwrite

aws ssm put-parameter \
  --name "/agentcore/${ENVIRONMENT}/rag-score-threshold" \
  --value "0.5" \
  --type "String" \
  --overwrite
```

### AWS CDK

```typescript
import * as ssm from 'aws-cdk-lib/aws-ssm';

// Knowledge Base ID パラメータ
new ssm.StringParameter(this, 'KnowledgeBaseIdParam', {
  parameterName: `/agentcore/${environment}/knowledge-base-id`,
  stringValue: knowledgeBaseId,
  description: 'Bedrock Knowledge Base ID for RAG retrieval',
});

// RAG 設定パラメータ
new ssm.StringParameter(this, 'RagTopKParam', {
  parameterName: `/agentcore/${environment}/rag-top-k`,
  stringValue: '5',
  description: 'Number of RAG results to retrieve',
});

new ssm.StringParameter(this, 'RagScoreThresholdParam', {
  parameterName: `/agentcore/${environment}/rag-score-threshold`,
  stringValue: '0.5',
  description: 'Minimum similarity score for RAG results',
});
```

## IAM 権限

AgentCore Runtime の IAM ロールに以下の権限が必要です：

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "ssm:GetParameter",
        "ssm:GetParameters"
      ],
      "Resource": [
        "arn:aws:ssm:*:*:parameter/agentcore/*"
      ]
    }
  ]
}
```

## 環境変数によるオーバーライド

Dockerfile で `AGENTCORE_ENV` 環境変数を設定することで、読み込む環境を指定できます：

```dockerfile
# Dockerfile
ENV AGENTCORE_ENV=production
```

または、AgentCore Runtime のデプロイ時に環境変数を設定：

```bash
# 環境変数で環境を指定
export AGENTCORE_ENV=staging
```

## トラブルシューティング

### パラメータが見つからない場合

ログに以下のような警告が表示されます：

```
ssm_parameter_not_found parameter=/agentcore/development/knowledge-base-id using_default=
```

**対処法**: 上記の「パラメータ作成方法」に従ってパラメータを作成してください。

### 権限エラーの場合

ログに以下のようなエラーが表示されます：

```
ssm_parameter_error parameter=/agentcore/development/knowledge-base-id error=AccessDeniedException
```

**対処法**: AgentCore Runtime の IAM ロールに SSM パラメータへのアクセス権限を追加してください。

## セキュリティ考慮事項

1. **機密情報は SecureString を使用**
   - API キーなどの機密情報は `--type SecureString` で作成
   - SSMConfigLoader は `WithDecryption=True` で対応済み

2. **最小権限の原則**
   - IAM ポリシーで `/agentcore/{env}/*` のみにアクセスを制限

3. **監査ログ**
   - CloudTrail でパラメータアクセスを監査可能
