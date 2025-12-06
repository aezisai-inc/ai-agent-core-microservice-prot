# ADR-001: Amazon Bedrock AgentCoreの採用

## ステータス

Accepted

## コンテキスト

既存のECS Fargate構成でAIエージェントを運用しているが、以下の課題がある：

1. **コスト**: 常時稼働によるコスト高（月額$XXX）
2. **パフォーマンス**: コールドスタート3-5秒、平均レスポンス2.3秒
3. **運用負荷**: 複数コンポーネント（ECS, OpenSearch, Redis）の管理

## 決定

Amazon Bedrock AgentCoreをエージェント実行環境として採用する。

## 理由

### 採用理由

1. **マネージド環境**
   - インフラ管理不要
   - 自動スケーリング
   - 組み込みオブザーバビリティ

2. **組み込み機能**
   - Memory（会話履歴管理）
   - Identity（認証・認可）
   - Gateway Interceptors（ログ・制御）

3. **コスト最適化**
   - 従量課金
   - セッション管理込み
   - スケールゼロ対応

4. **S3Vectorとの統合**
   - ネイティブ統合
   - Knowledge Basesとシームレス連携

### 代替案

| 代替案 | 評価 | 却下理由 |
|-------|------|---------|
| ECS継続 | △ | コスト・運用負荷が高い |
| LangChain on Lambda | △ | Memory管理の実装が必要 |
| OpenAI Assistants | × | AWSエコシステムとの統合困難 |

## 影響

### ポジティブ

- コスト52%削減（見込み）
- レスポンス3.8倍高速化
- 運用工数60%削減

### ネガティブ

- AWS依存度の増加
- 移行コスト（約XXX人日）
- 学習コスト

### リスク軽減策

1. Lambda層での抽象化によりベンダーロックイン緩和
2. 段階的移行（カナリアリリース）
3. ロールバック戦略の準備

## 参照

- [Bedrock AgentCore Documentation](https://docs.aws.amazon.com/bedrock/)
- [S3Vector GA Announcement](https://aws.amazon.com/)

