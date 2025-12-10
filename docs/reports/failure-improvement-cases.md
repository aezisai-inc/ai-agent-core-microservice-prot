# 失敗・改善事例集

**プロジェクト**: AgentCore RAG 実装  
**期間**: 2025年12月10日  
**ステータス**: ✅ 全件解決済み

---

## 目次

1. [Case #1: HYBRID 検索タイプの非サポート](#case-1-hybrid-検索タイプの非サポート)
2. [Case #2: IAM 権限不足 (bedrock:Retrieve)](#case-2-iam-権限不足-bedrockretrieve)
3. [Case #3: GitHub Actions OIDC 認証の失敗](#case-3-github-actions-oidc-認証の失敗)
4. [Case #4: boto3 バージョン不足](#case-4-boto3-バージョン不足)
5. [Case #5: Shell 変数の Python Heredoc 展開問題](#case-5-shell-変数の-python-heredoc-展開問題)
6. [Case #6: IAM ポリシー伝播の遅延](#case-6-iam-ポリシー伝播の遅延)
7. [Case #7: CodeBuild 手動トリガーの必要性](#case-7-codebuild-手動トリガーの必要性)

---

## Case #1: HYBRID 検索タイプの非サポート

### 概要

| 項目 | 内容 |
|------|------|
| **発生日時** | 2025-12-10 11:00 |
| **影響範囲** | RAG 機能全体 |
| **深刻度** | 🔴 Critical |
| **解決時間** | 約30分 |

### 症状

- チャットで質問しても、ドキュメントの内容が回答に反映されない
- AI が一般的な（間違った）回答を生成

```
期待: スターター ¥10,000
実際: ベーシック ¥1,000 ← 間違い
```

### 原因

`agent.py` で Knowledge Base 検索時に `overrideSearchType: "HYBRID"` を指定していたが、S3 Vectors ベースの Knowledge Base では HYBRID 検索がサポートされていなかった。

```python
# ❌ 問題のコード
retrievalConfiguration={
    "vectorSearchConfiguration": {
        "numberOfResults": top_k,
        "overrideSearchType": "HYBRID",  # S3 Vectors 非サポート
    }
}
```

### エラーメッセージ

```
ValidationException: HYBRID search type is not supported for search 
operation on index KCOEXQD1NV. Retry your request with a different 
search type.
```

### なぜ発見が遅れたか

- `try/except` でエラーをキャッチし、空のリスト `[]` を返していた
- ログ出力が不十分で、エラーが静かに握りつぶされていた
- RAG が効いていないことに気づくまで時間がかかった

### 解決策

```python
# ✅ 修正後
retrievalConfiguration={
    "vectorSearchConfiguration": {
        "numberOfResults": top_k,
        # Note: HYBRID search is not supported by S3 Vectors
        # Use default SEMANTIC search instead
    }
}
```

### 教訓

1. **新しい AWS サービスの制限事項を確認する**
   - S3 Vectors は Preview 版で機能制限がある
   - ドキュメントで対応機能を確認する

2. **エラーハンドリングで静かに失敗しない**
   - 空の結果を返す前にログを出力
   - 可能であればエラーを上位に伝播

3. **検索タイプの選択**
   | 検索タイプ | S3 Vectors | OpenSearch |
   |-----------|-----------|------------|
   | SEMANTIC  | ✅ | ✅ |
   | HYBRID    | ❌ | ✅ |

### 関連 PR

- [#57: fix(backend): HYBRID検索を削除](https://github.com/aezisai-inc/ai-agent-core-microservice-prot/pull/57)

---

## Case #2: IAM 権限不足 (bedrock:Retrieve)

### 概要

| 項目 | 内容 |
|------|------|
| **発生日時** | 2025-12-10 15:00 |
| **影響範囲** | RAG 機能全体 |
| **深刻度** | 🔴 Critical |
| **解決時間** | 約30分 |

### 症状

- HYBRID 検索問題を修正後も、RAG が動作しない
- レスポンスに `sources` フィールドがない

### 原因

AgentCore Runtime の IAM Role (`agentcore-runtime-role-development`) に Knowledge Base 検索権限がなかった。

```bash
# 権限シミュレーション結果
aws iam simulate-principal-policy \
  --action-names bedrock:Retrieve \
  --resource-arns '*'

# 結果: implicitDeny ❌
```

### なぜ発見が遅れたか

- ローカルでは自分の IAM ユーザー（AdministratorAccess）で検索が成功
- AgentCore Runtime が別の IAM Role を使用していることを見落とし
- CloudWatch ログが設定されておらず、コンテナ内のエラーが見えなかった

### 解決策

```bash
aws iam put-role-policy \
  --role-name agentcore-runtime-role-development \
  --policy-name BedrockKnowledgeBaseAccess \
  --policy-document '{
    "Version": "2012-10-17",
    "Statement": [{
      "Effect": "Allow",
      "Action": ["bedrock:Retrieve", "bedrock:RetrieveAndGenerate"],
      "Resource": ["arn:aws:bedrock:ap-northeast-1:226484346947:knowledge-base/*"]
    }]
  }'
```

### 教訓

1. **IAM 権限はリソースごとに確認する**
   - ローカル開発と本番で使用する IAM が異なる
   - `simulate-principal-policy` で事前確認

2. **新しい AWS サービスの IAM アクション名を確認**
   - `bedrock:Retrieve` は `bedrock:*` とは別
   - `bedrock-agentcore:*` も別のサービスプレフィックス

3. **コンテナにログ出力を設定する**
   - CloudWatch Logs への出力設定
   - structlog 等での構造化ログ

### 関連 PR

- (IAM 変更は AWS Console/CLI で実施)

---

## Case #3: GitHub Actions OIDC 認証の失敗

### 概要

| 項目 | 内容 |
|------|------|
| **発生日時** | 2025-12-10 14:00 |
| **影響範囲** | CI/CD パイプライン |
| **深刻度** | 🟡 Medium |
| **解決時間** | 約1時間 |

### 症状

GitHub Actions で AWS 認証エラー:

```
Error: Credentials could not be loaded, please check your action inputs
```

### 原因

1. GitHub OIDC Provider が AWS に未設定
2. IAM Role の Trust Policy が未設定

### 解決策

```bash
# 1. OIDC Provider 作成
aws iam create-open-id-connect-provider \
  --url "https://token.actions.githubusercontent.com" \
  --client-id-list "sts.amazonaws.com" \
  --thumbprint-list "6938fd4d98bab03faadb97b34396831e3780aea1"

# 2. IAM Role 作成 + Trust Policy
aws iam create-role \
  --role-name github-actions-agentcore-deploy \
  --assume-role-policy-document '{
    "Version": "2012-10-17",
    "Statement": [{
      "Effect": "Allow",
      "Principal": {
        "Federated": "arn:aws:iam::226484346947:oidc-provider/token.actions.githubusercontent.com"
      },
      "Action": "sts:AssumeRoleWithWebIdentity",
      "Condition": {
        "StringEquals": {
          "token.actions.githubusercontent.com:aud": "sts.amazonaws.com"
        },
        "StringLike": {
          "token.actions.githubusercontent.com:sub": "repo:aezisai-inc/ai-agent-core-microservice-prot:*"
        }
      }
    }]
  }'
```

### 最終的な解決

OIDC では `bedrock-agentcore:*` API で AccessDeniedException が発生し続けたため、**Access Key 方式に切り替え**。

```yaml
# .github/workflows/deploy-agentcore.yml
- name: Configure AWS credentials
  uses: aws-actions/configure-aws-credentials@v4
  with:
    aws-access-key-id: ${{ secrets.AWS_ACCESS_KEY_ID }}
    aws-secret-access-key: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
    aws-region: ap-northeast-1
```

### 教訓

1. **新しい AWS サービスでは OIDC が不安定な場合がある**
   - bedrock-agentcore は比較的新しいサービス
   - OIDC 経由の AssumeRole で権限が正しく評価されない可能性

2. **Access Key は次善の策として有効**
   - セキュリティ的には OIDC が推奨
   - 動作確認後に OIDC へ移行を検討

3. **GitHub Secrets の設定**
   - `AWS_ACCESS_KEY_ID`
   - `AWS_SECRET_ACCESS_KEY`

### 関連 PR

- [#58: ci: develop マージ時に AgentCore 自動デプロイ](https://github.com/aezisai-inc/ai-agent-core-microservice-prot/pull/58)

---

## Case #4: boto3 バージョン不足

### 概要

| 項目 | 内容 |
|------|------|
| **発生日時** | 2025-12-10 14:30 |
| **影響範囲** | CI/CD パイプライン |
| **深刻度** | 🟡 Medium |
| **解決時間** | 約15分 |

### 症状

GitHub Actions で boto3 エラー:

```
botocore.exceptions.UnknownServiceError: Unknown service: 'bedrock-agentcore-control'
```

### 原因

GitHub Actions Runner のデフォルト boto3 バージョンが古く、`bedrock-agentcore-control` サービスが含まれていなかった。

### 解決策

```yaml
# Python セットアップを追加
- name: Setup Python
  uses: actions/setup-python@v5
  with:
    python-version: '3.11'

- name: Update AgentCore Runtime
  run: |
    # 最新の boto3 をインストール
    pip install -q "boto3>=1.35.0"
    
    python3 << 'EOF'
    import boto3
    client = boto3.client('bedrock-agentcore-control', region_name='ap-northeast-1')
    # ...
    EOF
```

### 教訓

1. **新しい AWS サービスは最新の SDK が必要**
   - GitHub Actions のデフォルト環境は古い場合がある
   - 明示的にバージョンを指定してインストール

2. **AWS CLI vs boto3**
   - AWS CLI も `bedrock-agentcore-control` 未サポートの場合がある
   - boto3 の方が新しいサービスに早く対応

### 関連 PR

- [#59: fix(ci): install latest boto3](https://github.com/aezisai-inc/ai-agent-core-microservice-prot/pull/59)

---

## Case #5: Shell 変数の Python Heredoc 展開問題

### 概要

| 項目 | 内容 |
|------|------|
| **発生日時** | 2025-12-10 15:00 |
| **影響範囲** | CI/CD パイプライン |
| **深刻度** | 🟢 Low |
| **解決時間** | 約10分 |

### 症状

Python スクリプト内で Shell 変数が展開されない:

```python
# 期待
containerUri: '226484346947.dkr.ecr.ap-northeast-1.amazonaws.com/...'

# 実際
containerUri: '${ECR_URI}'  # 文字列リテラル
```

### 原因

Heredoc の種類による変数展開の違い:

```bash
# << EOF (変数展開あり) - 問題なし
# << 'EOF' (変数展開なし) - 問題あり

python3 << EOF
print("${SHELL_VAR}")  # 展開される
EOF

python3 << 'EOF'
print("${SHELL_VAR}")  # 展開されない（文字列リテラル）
EOF
```

### 解決策

環境変数を export して、Python 内で `os.environ` を使用:

```bash
export ECR_URI="${ACCOUNT_ID}.dkr.ecr.${REGION}.amazonaws.com/..."
export ROLE_ARN="arn:aws:iam::${ACCOUNT_ID}:role/..."

python3 << 'EOF'
import os
ecr_uri = os.environ['ECR_URI']
role_arn = os.environ['ROLE_ARN']
# ...
EOF
```

### 教訓

1. **Heredoc の引用符に注意**
   - `<< EOF`: 変数展開あり
   - `<< 'EOF'`: 変数展開なし（推奨）

2. **環境変数経由でデータを渡す**
   - Shell と Python 間のデータ受け渡しは環境変数が安全
   - `os.environ` で取得

### 関連 PR

- [#60: fix(ci): properly pass shell variables to Python heredoc](https://github.com/aezisai-inc/ai-agent-core-microservice-prot/pull/60)

---

## Case #6: IAM ポリシー伝播の遅延

### 概要

| 項目 | 内容 |
|------|------|
| **発生日時** | 2025-12-10 14:45 |
| **影響範囲** | CI/CD パイプライン |
| **深刻度** | 🟢 Low |
| **解決時間** | 約5分（待機） |

### 症状

IAM ポリシーを追加した直後に API 呼び出しすると AccessDeniedException:

```
AccessDeniedException: User is not authorized to perform: 
bedrock-agentcore:UpdateAgentRuntime
```

ポリシーシミュレーションでは `allowed` なのに、実際の API では失敗。

### 原因

IAM ポリシーの変更は **即座に反映されない**。AWS 内部でのポリシー伝播に時間がかかる。

### 解決策

```bash
# ポリシー追加後、少し待機
echo "Waiting for IAM policy propagation..."
sleep 30

# 再実行
python3 << 'EOF'
# API 呼び出し
EOF
```

### 教訓

1. **IAM 変更は即座に反映されない**
   - 通常数秒〜数分で伝播
   - 最大で数分かかる場合がある

2. **CI/CD では待機時間を設ける**
   - IAM 変更後は適切な待機を入れる
   - リトライロジックを実装

3. **ポリシーシミュレーションは即座に反映**
   - `simulate-principal-policy` は即座に最新ポリシーを評価
   - 実際の API 呼び出しとは異なる

---

## Case #7: CodeBuild 手動トリガーの必要性

### 概要

| 項目 | 内容 |
|------|------|
| **発生日時** | 2025-12-10 11:30 |
| **影響範囲** | デプロイフロー |
| **深刻度** | 🟢 Low |
| **解決時間** | 継続的改善 |

### 症状

- develop ブランチにマージしても AgentCore が更新されない
- 手動で CodeBuild を実行する必要がある

### 原因

CodeBuild プロジェクトが `NO_SOURCE` タイプで設定されており、GitHub Webhook が未設定だった。

### 解決策

GitHub Actions で自動化:

```yaml
# .github/workflows/deploy-agentcore.yml
name: Deploy AgentCore Runtime

on:
  push:
    branches: [develop]
    paths: ['backend/**']

jobs:
  deploy:
    steps:
      - name: Start CodeBuild
        run: |
          aws codebuild start-build \
            --project-name agentic-rag-build-development
      
      - name: Wait for CodeBuild
        run: |
          # ビルド完了を待機
      
      - name: Update AgentCore Runtime
        run: |
          # AgentCore を更新
```

### 教訓

1. **CI/CD は早期に自動化する**
   - 手動デプロイはミスの原因
   - マージ → デプロイを自動化

2. **GitHub Actions と CodeBuild の連携**
   - GitHub Webhook が使えない場合は Actions からトリガー
   - `aws codebuild start-build` で開始

3. **paths フィルターで不要な実行を防ぐ**
   - `backend/**` の変更時のみトリガー
   - ドキュメント変更では実行しない

### 関連 PR

- [#58-60: CI/CD パイプライン実装](https://github.com/aezisai-inc/ai-agent-core-microservice-prot/pull/58)

---

## 全体のタイムライン

```
11:00  問題報告: RAG が効いていない
  │
11:30  調査開始
  │    └─ Knowledge Base 検索は正常
  │
12:00  Case #1 発見: HYBRID 検索エラー
  │    └─ PR #57 作成・マージ
  │
12:30  CodeBuild 実行（手動）
  │
13:00  まだ RAG が動かない → 調査続行
  │
14:00  CI/CD パイプライン実装開始
  │    └─ Case #3: OIDC 認証問題
  │    └─ Case #4: boto3 バージョン
  │    └─ Case #5: Heredoc 展開問題
  │    └─ Case #6: IAM 伝播遅延
  │
15:00  Case #2 発見: IAM 権限不足
  │    └─ bedrock:Retrieve 権限追加
  │
15:30  AgentCore Runtime 再起動
  │
15:35  ✅ RAG 動作確認！
```

---

## まとめ

### 発生した問題の分類

| カテゴリ | 件数 | 事例 |
|---------|-----|------|
| AWS サービス制限 | 1 | HYBRID 検索非サポート |
| IAM 権限 | 2 | bedrock:Retrieve, OIDC |
| SDK/ツールバージョン | 1 | boto3 |
| スクリプトの問題 | 1 | Heredoc 展開 |
| AWS 動作仕様 | 1 | IAM 伝播遅延 |
| プロセスの問題 | 1 | 手動デプロイ |

### 主な教訓

1. **新しい AWS サービスは制限事項を確認**
2. **IAM 権限は simulate-principal-policy で事前確認**
3. **エラーハンドリングで静かに失敗しない**
4. **CI/CD は早期に自動化**
5. **ローカルと本番の IAM の違いに注意**

### 今後の改善案

1. **Infrastructure as Code**
   - IAM 権限を CDK/Terraform で管理
   - 権限漏れを防止

2. **ログ出力の強化**
   - CloudWatch Logs への出力
   - 構造化ログ

3. **監視・アラート**
   - RAG 検索成功率の監視
   - エラー時のアラート

4. **ドキュメント整備**
   - トラブルシューティングガイド
   - 権限チェックリスト

