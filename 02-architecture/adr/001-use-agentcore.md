# ADR-001: Amazon Bedrock AgentCore の採用

## ステータス

Accepted (Updated: 2024-12)

## コンテキスト

既存のECS Fargate構成でAIエージェントを運用しているが、以下の課題がある：

1. **コスト**: 常時稼働によるコスト高（月額$XXX）
2. **パフォーマンス**: コールドスタート3-5秒、平均レスポンス2.3秒
3. **運用負荷**: 複数コンポーネント（ECS, OpenSearch, Redis）の管理
4. **インフラ管理**: セッション管理、メモリ管理、認証の自前実装が必要

## 決定

Amazon Bedrock AgentCore をエージェント実行環境として採用する。

### 採用するAgentCoreサービス

| サービス | 用途 |
|---------|------|
| **AgentCore Runtime** | エージェント実行環境（ECR + サーバーレス） |
| **AgentCore Gateway** | MCP Interface、Lambda→Tool変換、API管理 |
| **AgentCore Memory** | 短期・長期・セマンティックメモリ管理 |
| **AgentCore Identity** | 認証・認可、Token Vault |
| **AgentCore Observability** | CloudWatch/X-Ray連携、Agent Dashboard |
| **AgentCore Code Interpreter** | Python/JS実行環境（必要時） |
| **AgentCore Browser** | Web自動化（必要時） |

## アーキテクチャ

```
┌─────────────────────────────────────────────────────────────────┐
│                    AgentCore Architecture                        │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│   Frontend (Amplify Gen2)                                       │
│         │                                                       │
│         ▼                                                       │
│   AgentCore Gateway ──────────────────────────────────────┐     │
│         │                                                 │     │
│         │ MCP Protocol                                    │     │
│         ▼                                                 │     │
│   AgentCore Runtime (ECR)                                 │     │
│   ┌─────────────────────────────────────────────────┐     │     │
│   │  Python Agent (Strands Agents)                  │     │     │
│   │  - bedrock-agentcore-sdk-python                 │     │     │
│   │  - Clean Architecture                           │     │     │
│   └─────────────────────────────────────────────────┘     │     │
│         │                                                 │     │
│         ├──────────────────────┬──────────────────────────┤     │
│         ▼                      ▼                          ▼     │
│   AgentCore Memory      AgentCore Identity      Lambda Tools    │
│   - Short-term          - Cognito連携           - CRM Tool      │
│   - Long-term           - Token Vault           - Order Tool    │
│   - Semantic            - Workload Identity     - S3Vector      │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

## 理由

### 採用理由

1. **マネージド実行環境 (AgentCore Runtime)**
   - ECRイメージをデプロイするだけでサーバーレス実行
   - セッション分離による安全な実行環境
   - 自動スケーリング（スケールゼロ対応）
   - Long-running agents対応

2. **統一API層 (AgentCore Gateway)**
   - Lambda Functions を自動的にMCP Tool化
   - OpenAPI/Smithyからの自動Tool生成
   - セマンティックTool Discovery
   - レート制限・スロットリング組み込み

3. **組み込みメモリ管理 (AgentCore Memory)**
   - 短期メモリ（セッション内会話履歴）
   - 長期メモリ（ユーザー別の永続情報）
   - セマンティックメモリ（事実の抽出・検索）
   - Redis/DynamoDB管理が不要に

4. **エンタープライズ認証 (AgentCore Identity)**
   - Cognito/Okta/Entra ID統合
   - Workload Identity（エージェント専用ID）
   - Token Vault（安全なトークン管理）
   - OAuth2プロバイダー統合（Slack, GitHub等）

5. **可観測性 (AgentCore Observability)**
   - OpenTelemetry標準サポート
   - CloudWatch/X-Ray自動連携
   - Agent実行のステップごとの可視化
   - 組み込みダッシュボード

6. **S3Vectorとのネイティブ統合**
   - Knowledge Basesとシームレス連携
   - テナント分離フィルタリング

### 代替案

| 代替案 | 評価 | 却下理由 |
|-------|------|---------|
| ECS継続 | △ | コスト・運用負荷が高い、メモリ管理の自前実装 |
| Lambda + API Gateway | △ | セッション管理・メモリの実装が必要、15分タイムアウト |
| LangChain on Lambda | △ | Memory管理の実装が必要、フレームワーク依存 |
| OpenAI Assistants | × | AWSエコシステムとの統合困難、データ所在の懸念 |

## デプロイメントフロー

```bash
# 1. ECRリポジトリ作成（初回のみ）
agentcore configure --entrypoint agent.py

# 2. ローカルテスト
agentcore launch --local
agentcore invoke --local '{"prompt": "Hello"}'

# 3. クラウドデプロイ
agentcore launch

# 4. エンドポイント確認・呼び出し
agentcore status
agentcore invoke '{"prompt": "Hello"}'
```

## 影響

### ポジティブ

- **コスト52%削減**（見込み）
  - 従量課金モデル
  - スケールゼロ対応
  - インフラ管理コスト削減

- **レスポンス3.8倍高速化**
  - コールドスタート < 0.5秒
  - 平均レスポンス 0.8秒

- **運用工数60%削減**
  - メモリ管理の自動化
  - 認証基盤の統合
  - 可観測性の組み込み

- **開発効率向上**
  - 任意のフレームワーク利用可能（Strands, LangGraph等）
  - MCP標準プロトコル対応
  - ローカル開発→クラウドデプロイのシームレス移行

### ネガティブ

- AWS依存度の増加
- 移行コスト（約XXX人日）
- 学習コスト
- AgentCoreはPreview段階（2025年9月まで無料）

### リスク軽減策

1. **ベンダーロックイン緩和**
   - クリーンアーキテクチャによるインフラ層の抽象化
   - Strands Agentsフレームワーク採用（オープンソース）
   - MCP標準プロトコル準拠

2. **段階的移行**
   - カナリアリリースによる段階移行
   - 既存ECS環境との並行稼働期間設定

3. **ロールバック戦略**
   - ECS環境の維持（移行完了まで）
   - IaCによる迅速な環境再構築

## 参照

- [Amazon Bedrock AgentCore Documentation](https://docs.aws.amazon.com/bedrock-agentcore/)
- [AgentCore SDK (Python)](https://github.com/aws/bedrock-agentcore-sdk-python)
- [AgentCore Samples](https://github.com/awslabs/amazon-bedrock-agentcore-samples/)
- [Strands Agents](https://strandsagents.com/)
- [S3Vector (Knowledge Bases)](https://docs.aws.amazon.com/bedrock/latest/userguide/knowledge-base.html)
