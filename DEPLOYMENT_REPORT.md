# デプロイレポート

**日時**: 2024-12-07 12:44 JST  
**リージョン**: ap-northeast-1  
**環境**: development  
**AWS Account**: 226484346947

---

## デプロイ結果サマリー

| Stack | Status | 備考 |
|-------|--------|------|
| ✅ AgenticRag-development | 成功 | DynamoDB, S3, KMS |
| ✅ AgenticRag-ECR-development | 成功 | ECR Repository |
| ⚠️ AgenticRag-Memory-development | CDK失敗→CLI成功 | boto3で直接作成 |
| ✅ AgenticRag-AgentCore-development | 成功 | IAM, SSM |

### AgentCore Memory Store (手動作成)

| 項目 | 値 |
|-----|-----|
| Memory ID | `agenticRagMemoryDevelopment-VIXDrsGejQ` |
| ARN | `arn:aws:bedrock-agentcore:us-east-1:226484346947:memory/agenticRagMemoryDevelopment-VIXDrsGejQ` |
| Region | `us-east-1` |
| Event Expiry | 30日 |
| SSM Parameter | `/agentcore/development/memory-store-id` |

---

## ✅ 成功したスタック

### 1. AgenticRag-development (メインスタック)

| リソース | ARN / 名前 |
|---------|-----------|
| Documents Bucket | `agentcore-documents-226484346947-development` |
| Vector Bucket | `agentcore-vectors-226484346947-development` |
| Events Table | `agentic-rag-events-development` |
| Read Models Table | `agentic-rag-read-models-development` |
| Encryption Key | `arn:aws:kms:ap-northeast-1:226484346947:key/5daebe7a-5bb6-4dfe-b2e7-871bcce7c162` |

### 2. AgenticRag-ECR-development

| リソース | 値 |
|---------|-----|
| Repository URI | `226484346947.dkr.ecr.ap-northeast-1.amazonaws.com/agentic-rag-agent-development` |
| Repository ARN | `arn:aws:ecr:ap-northeast-1:226484346947:repository/agentic-rag-agent-development` |

### 3. AgenticRag-AgentCore-development

| リソース | 値 |
|---------|-----|
| Runtime Role ARN | `arn:aws:iam::226484346947:role/agentcore-runtime-role-development` |
| Config Parameter Path | `/agentcore/development/` |

---

## ⚠️ CDK失敗 → CLI で解決

### AgenticRag-Memory-development

**CDK エラー**:
```
CustomResource attribute error: Vendor response doesn't contain MemoryStoreId attribute
```

**原因**:
- CDK Custom Resource の実装が API レスポンス形式と不一致
- サービス自体は **正常に動作**

**解決策**: boto3 で直接作成

```python
import boto3

client = boto3.client('bedrock-agentcore-control', region_name='us-east-1')

response = client.create_memory(
    name='agenticRagMemoryDevelopment',
    description='Memory store for Agentic RAG development environment',
    eventExpiryDuration=30,  # 日数
)
# => Memory ID: agenticRagMemoryDevelopment-VIXDrsGejQ
```

**SSM パラメータ登録**:
```bash
aws ssm put-parameter \
  --name "/agentcore/development/memory-store-id" \
  --value "agenticRagMemoryDevelopment-VIXDrsGejQ" \
  --type String \
  --region ap-northeast-1
```

**結論**: CDK の Custom Resource に問題があるだけで、AgentCore Memory 自体は利用可能

---

## 🔄 未デプロイのコンポーネント

### 1. Amplify Gen2

**状態**: 設定ファイルは存在するが未デプロイ

**ファイル**:
- `amplify/backend.ts` - バックエンド定義
- `amplify/auth/resource.ts` - Cognito 認証設定

**デプロイ方法**:
```bash
cd frontend
npx ampx sandbox  # 開発環境
# または
npx ampx deploy   # 本番デプロイ
```

**依存関係**:
- Lambda トリガー関数が未実装 (`functions/auth/*`)
- これらを実装後にデプロイ必要

### 2. Secrets Manager

**状態**: CDK スタックに未実装

**必要なシークレット**:
- `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` (OAuth 用、オプション)
- `SSO_CLIENT_ID` / `SSO_CLIENT_SECRET` (Enterprise SSO 用、オプション)
- Bedrock API キー（不要 - IAM ロールで認証）

**実装案**:
```typescript
// infrastructure/lib/secrets-stack.ts
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';

const apiSecret = new secretsmanager.Secret(this, 'ApiSecret', {
  secretName: `/agentcore/${environment}/api-keys`,
  generateSecretString: {
    secretStringTemplate: JSON.stringify({ placeholder: true }),
    generateStringKey: 'api-key',
  },
});
```

---

## 📋 次のステップ

### 即時対応
1. [ ] AWS 認証情報のローテーション（チャットに露出したため）
2. [ ] Amplify Lambda トリガー関数の実装
3. [ ] Amplify デプロイ

### 中期対応
1. [ ] AgentCore Memory GA 後に Memory Stack を有効化
2. [ ] Secrets Manager Stack の追加（OAuth 使用時）
3. [ ] CI/CD Pipeline の設定（GitHub Connection ARN 取得後）

### 本番デプロイ前
1. [ ] `ENVIRONMENT=prod` でのデプロイテスト
2. [ ] WAF / CloudFront の追加
3. [ ] バックアップ / DR 設定

---

## 📝 ECR ライフサイクルルール修正

**問題**: `TagStatus.ANY` のルール優先度エラー
```
UnscopedValidationError: TagStatus.Any rule must have highest priority, has 2 which is smaller than 3
```

**修正** (`infrastructure/lib/ecr-stack.ts`):
```typescript
// TagStatus.ANY は常に最大の優先度にする
this.agentRepository.addLifecycleRule({
  description: 'Keep limited number of images',
  rulePriority: 100,  // 2 → 100 に変更
  tagStatus: ecr.TagStatus.ANY,
  maxImageCount: 10,
});
```

---

## 🔗 参考リンク

- [AWS Bedrock AgentCore Documentation](https://docs.aws.amazon.com/bedrock/latest/userguide/agents.html)
- [Amplify Gen2 Documentation](https://docs.amplify.aws/gen2/)
- [CDK ECR Lifecycle Rules](https://docs.aws.amazon.com/cdk/api/v2/docs/aws-cdk-lib.aws_ecr.LifecycleRule.html)

