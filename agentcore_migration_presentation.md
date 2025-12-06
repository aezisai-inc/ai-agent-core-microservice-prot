# 既存ECS構成からAgentCore + S3VectorでAIエージェントを分離、コストとパフォーマンスが向上した話

## 🎯 登壇概要（10分版）

**タイトル**: ECSからAgentCoreへ：コスト50%削減とレスポンス3倍高速化の実践

**対象聴衆**: AWSでAIエージェントを運用中/検討中の開発者・アーキテクト

---

## 📊 10分構成

### 1. Before: 既存ECS構成の課題（2分）

#### アーキテクチャ図
```
┌─────────────────────────────────────┐
│  既存構成（Before）                    │
├─────────────────────────────────────┤
│ ALB → ECS Fargate                    │
│   ├─ RAGアプリコンテナ               │
│   ├─ Vector DB（OpenSearch）         │
│   ├─ セッション管理（Redis）          │
│   └─ LLM呼び出し（Bedrock SDK）      │
└─────────────────────────────────────┘
```

#### 3大課題
| 課題 | 具体例 |
|------|--------|
| **💰 コスト高** | ECS常時稼働 + OpenSearch最低料金 = 月額$XXX |
| **⚡ 遅延** | コールドスタート3-5秒、平均レスポンス2.3秒 |
| **🔧 運用負荷** | インフラ管理、複数コンポーネントの監視 |

---

### 2. After: 新アーキテクチャ（3分）

#### アーキテクチャ図
```
┌─────────────────────────────────────────────┐
│  移行後構成（After）                           │
├─────────────────────────────────────────────┤
│ API Gateway → Lambda (Thin Layer)           │
│   ↓                                          │
│ Bedrock AgentCore                            │
│   ├─ Memory（会話履歴）                      │
│   ├─ Identity（認証・RBAC）                  │
│   ├─ Gateway Interceptors（ログ・制御）      │
│   └─ S3Vector（ベクトルストア）              │
│                                              │
│ CloudWatch Logs → BigQuery（分析）           │
└─────────────────────────────────────────────┘
```

#### 主要コンポーネント

**🎯 AgentCore**
- マネージドなエージェント実行環境
- 自動スケーリング、組み込みオブザーバビリティ

**🗄️ S3Vector**
- S3ベースのサーバーレスベクトルストア
- 従量課金、Knowledge Basesとネイティブ統合

**🔐 AgentCore Identity**
- Cognitoとの統合でマルチテナント対応

**📊 Gateway Interceptors**
- リクエスト/レスポンス加工、ログ集約、レート制限

#### 実装例（コアコード）
```python
# Lambda Thin Layer
from bedrock_agentcore import AgentCore, Memory, S3Vector

def handler(event, context):
    agent = AgentCore(
        agent_id="my-agent",
        memory=Memory(session_id=event['session_id']),
        vector_store=S3Vector(bucket="knowledge-base")
    )
    
    response = agent.invoke(
        prompt=event['message'],
        user_id=event['user_id']
    )
    
    return response
```

---

### 3. 成果: 定量評価（3分）

#### コスト削減
| コンポーネント | Before | After | 削減率 |
|----------------|--------|-------|--------|
| コンピュート（ECS→Lambda） | $XXX | $XX | **-85%** |
| Vector DB（OpenSearch→S3） | $XXX | $XX | **-70%** |
| セッション管理（Redis→Memory） | $XX | $0* | **-100%** |
| **合計** | **$XXX** | **$XXX** | **-52%** |

*AgentCore料金に含まれる

#### パフォーマンス改善
| メトリクス | Before | After | 改善率 |
|-----------|--------|-------|--------|
| 平均レスポンス | 2.3秒 | 0.8秒 | **3.8倍** |
| P95レスポンス | 4.8秒 | 1.5秒 | 3.2倍 |
| コールドスタート | 3-5秒 | <0.5秒 | **6-10倍** |

#### 運用面の副次効果
- ✅ デプロイ時間: 15分 → 3分
- ✅ モニタリング工数: -60%
- ✅ インシデント件数: -40%

---

### 4. 発展設計: マルチエージェント化（1.5分）

#### 次のステップ: Strands Agents統合
```
┌──────────────────────────────────────────────┐
│  次世代構成（Future）                           │
├──────────────────────────────────────────────┤
│ API Gateway → EventBridge                     │
│   ↓                                           │
│ Strands Agent Orchestrator                    │
│   ├─ Researcher Agent (AgentCore)            │
│   ├─ Analyst Agent (AgentCore)               │
│   └─ Writer Agent (AgentCore)                │
│                                               │
│ Shared S3Vector + Memory Pool                │
└──────────────────────────────────────────────┘
```

**実現できること**
- 🎯 タスク分割型: 複雑なタスクを専門Agentに委譲
- 🎯 パイプライン型: Agent間で段階的に精緻化
- 🎯 並列処理: Step Functions統合で高速化

---

### 5. まとめ: ベストプラクティス（0.5分）

#### 移行における教訓
| ✅ DO | ❌ DON'T |
|-------|----------|
| 段階的移行（カナリア） | 一度にすべて移行 |
| 詳細なベンチマーク測定 | コスト試算の甘さ |
| ロールバック戦略準備 | 既存システムの即座削除 |

#### 3つのポイント
1. **小さく始める**: PoC → パイロット → 本番
2. **データ駆動**: メトリクスで判断
3. **段階的移行**: リスク最小化

---

## 🎤 デモシナリオ（時間があれば）

### デモ1: レスポンスタイム比較（1分）
- 同じリクエストを新旧環境に送信
- Grafanaダッシュボードでリアルタイム表示

### デモ2: BigQueryログ分析（1分）
- Gateway Interceptorsから集約されたログ
- コスト・パフォーマンス分析ダッシュボード

---

## 📚 補足資料

### 移行プロセス（概要）
1. **Phase 1**: 並行稼働環境構築（2週間）
   - S3Vectorセットアップ
   - AgentCore構成
   - Lambda実装

2. **Phase 2**: カナリアリリース（2週間）
   - 10% → 50% → 100%段階移行
   - リアルタイム監視

3. **Phase 3**: 旧環境廃止（1週間）
   - コスト削減確認

### 技術的工夫ポイント
```python
# Gateway Interceptor for BigQuery Logging
def interceptor_handler(event, context):
    log_entry = {
        'timestamp': datetime.now().isoformat(),
        'user_id': event['request']['user_id'],
        'agent_id': event['request']['agent_id'],
        'tokens': event['request']['token_count'],
        'cost': calculate_cost(event['request'])
    }
    
    bigquery_client.insert_rows_json(table_id, [log_entry])
    return {'continue': True}
```

---

## 🎯 聴衆への提供価値

| 聴衆層 | 得られる価値 |
|--------|-------------|
| **意思決定者** | 投資対効果の実証データ |
| **アーキテクト** | 移行戦略と設計パターン |
| **開発者** | 実装コード例 |
| **運用担当** | 運用負荷軽減の実例 |

---

## 📊 スライド構成案（10分版）

1. **タイトル**（10秒）
2. **Before構成と課題**（2分）
3. **After構成の解説**（3分）
4. **成果の定量評価**（3分）
5. **発展設計**（1分）
6. **まとめ**（30秒）

---

## 🔗 参考リンク

- [Bedrock AgentCore Documentation](https://docs.aws.amazon.com/bedrock/)
- [S3Vector GA Announcement](https://aws.amazon.com/)
- [Strands Agents + AgentCore Integration](https://strandsagents.com/)
- [BigQuery Agent Analytics](https://cloud.google.com/blog/products/data-analytics/introducing-bigquery-agent-analytics/)

---

## 📝 想定Q&A

**Q1: データ移行にかかった時間は？**
A: 約XXGBで2日間（スクリプト実行時間）

**Q2: ベンダーロックインのリスクは？**
A: Lambda層で抽象化、インターフェース統一で他サービスへの移行も可能

**Q3: S3Vectorのパフォーマンスは？**
A: OpenSearchと遜色なし、キャッシュ戦略で更に高速化

**Q4: 総工数は？**
A: 約XXX人日（設計・実装・テスト・移行含む）

**Q5: 既存アプリの改修規模は？**
A: Lambda Thin Layer化でアプリ側は最小限の改修のみ

---

## ✨ このセッションの価値

```
✅ 実証された成果（コスト-52%、3.8倍高速化）
✅ 再現可能な移行プロセス
✅ 発展性のある設計
✅ リアルな課題と解決策
✅ 最新技術の実践的活用
```

---

**作成日**: 2025-12-05
**バージョン**: 1.0
**想定登壇時間**: 10分
**対象イベント**: AWS系技術カンファレンス、AIエージェント勉強会
