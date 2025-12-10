# アーキテクチャ改善提案書（改訂版）

## 既存構成を活かした CopilotKit / AG-UI Protocol 導入経路

**作成日**: 2025-12-09  
**参照記事**: [StrandsAgents × AG-UI × CopilotKit × Amplify構成](https://qiita.com/Takenoko4594/items/89de5263257dd646b09a)

---

## 1. 基本方針

### 1.1 既存構成のメリット（維持すべき強み）

| 強み | 詳細 | 維持理由 |
|-----|------|---------|
| **Clean Architecture** | Domain/Application/Infrastructure/Presentation の明確な分離 | テスタビリティ、拡張性の基盤 |
| **AgentCore Memory** | Episodic Memory, Reflections による体験学習 | 競合優位性、re:Invent 2025 の新機能 |
| **Strands Agents** | Python での柔軟なエージェント実装 | Tool 定義、DI 連携の成熟度 |
| **CQRS + Event Sourcing** | DynamoDB Event Store による監査証跡 | コンプライアンス、デバッグ性 |
| **FSD (Feature-Sliced Design)** | フロントエンドの責務分離 | スケーラブルなコード構成 |
| **AWS SDK 直接呼出** | 低レイテンシ、AgentCore 機能のフル活用 | パフォーマンス要件 |

### 1.2 導入アプローチ：「置き換え」ではなく「追加」

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        導入アプローチの考え方                                │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│   ❌ 置き換え（Qiita記事そのまま）                                           │
│   ┌─────────────┐                                                          │
│   │ 既存構成    │ ──────────────────► 削除                                 │
│   └─────────────┘                                                          │
│   ┌─────────────┐                                                          │
│   │ Qiita構成   │ ──────────────────► 新規導入                              │
│   └─────────────┘                                                          │
│                                                                             │
│   ✅ 追加（本提案）                                                         │
│   ┌─────────────┐                                                          │
│   │ 既存構成    │ ──────────────────► 維持（コア機能）                      │
│   └─────────────┘                                                          │
│         │                                                                   │
│         ▼                                                                   │
│   ┌─────────────┐                                                          │
│   │ AG-UI      │ ──────────────────► 追加（プロトコル層）                   │
│   │ Adapter    │                                                           │
│   └─────────────┘                                                          │
│         │                                                                   │
│         ▼                                                                   │
│   ┌─────────────┐                                                          │
│   │ CopilotKit │ ──────────────────► 追加（UIオプション）                   │
│   │ Frontend   │                                                           │
│   └─────────────┘                                                          │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. 統合アーキテクチャ

### 2.1 目標構成図

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                    統合アーキテクチャ（既存 + AG-UI + CopilotKit）              │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                 │
│  ┌─────────────────────────────────────────────────────────────────────────┐   │
│  │                         Frontend Layer                                   │   │
│  │                                                                          │   │
│  │  ┌─────────────────────┐     ┌─────────────────────┐                    │   │
│  │  │  既存 Chat UI       │     │  CopilotKit Chat    │   ← 新規追加       │   │
│  │  │  (FSD構成)          │     │  (オプション)        │                    │   │
│  │  │                     │     │                     │                    │   │
│  │  │  - chat-container   │     │  - <CopilotChat>    │                    │   │
│  │  │  - use-chat-stream  │     │  - useCopilotChat() │                    │   │
│  │  │  - agentcore-client │     │                     │                    │   │
│  │  └──────────┬──────────┘     └──────────┬──────────┘                    │   │
│  │             │                           │                                │   │
│  │             │ AWS SDK                   │ AG-UI Protocol                 │   │
│  │             │ 直接呼出                  │ (HTTP/SSE)                     │   │
│  │             │                           │                                │   │
│  └─────────────┼───────────────────────────┼────────────────────────────────┘   │
│                │                           │                                    │
│                │                           ▼                                    │
│                │              ┌─────────────────────────┐                       │
│                │              │  AG-UI Adapter Layer    │  ← 新規追加           │
│                │              │  (Lambda or Runtime)    │                       │
│                │              │                         │                       │
│                │              │  - CopilotKit Runtime   │                       │
│                │              │  - AG-UI HttpAgent      │                       │
│                │              │  - Protocol Translation │                       │
│                │              └───────────┬─────────────┘                       │
│                │                          │                                     │
│                ▼                          ▼                                     │
│  ┌─────────────────────────────────────────────────────────────────────────┐   │
│  │                    AgentCore Runtime（既存・変更なし）                    │   │
│  │                                                                          │   │
│  │  ┌──────────────────────────────────────────────────────────────────┐   │   │
│  │  │  Presentation Layer                                               │   │   │
│  │  │  - agent.py (@app.entrypoint)                                    │   │   │
│  │  │  - agent_factory.py (StrandsAgentWrapper)                        │   │   │
│  │  │  - AG-UI Entrypoint (新規追加)  ← 既存と並列                      │   │   │
│  │  └──────────────────────────────────────────────────────────────────┘   │   │
│  │                              │                                           │   │
│  │  ┌──────────────────────────────────────────────────────────────────┐   │   │
│  │  │  Application Layer（既存・変更なし）                              │   │   │
│  │  │  - submit_question_with_memory.py                                │   │   │
│  │  │  - pattern_applicator.py                                         │   │   │
│  │  └──────────────────────────────────────────────────────────────────┘   │   │
│  │                              │                                           │   │
│  │  ┌──────────────────────────────────────────────────────────────────┐   │   │
│  │  │  Infrastructure Layer（既存・変更なし）                           │   │   │
│  │  │  - AgentCore Memory (Episodic, Semantic, Reflections)            │   │   │
│  │  │  - S3Vector Client (Knowledge Base)                              │   │   │
│  │  │  - DynamoDB Event Store                                          │   │   │
│  │  └──────────────────────────────────────────────────────────────────┘   │   │
│  │                                                                          │   │
│  └──────────────────────────────────────────────────────────────────────────┘   │
│                                                                                 │
└─────────────────────────────────────────────────────────────────────────────────┘

  凡例:
  ────── 既存（変更なし）
  ══════ 新規追加
```

### 2.2 通信フロー比較

| ルート | 用途 | 特徴 |
|-------|------|------|
| **Route A: 既存ルート** | 高パフォーマンス要件、フル機能利用 | AWS SDK 直接、Memory/Tools フル活用 |
| **Route B: AG-UI ルート** | CopilotKit 連携、標準UI利用 | プロトコル標準化、他クライアント対応 |

```
Route A (既存):
  Browser → AWS SDK → AgentCore Runtime → Memory/Tools

Route B (AG-UI):
  Browser → CopilotKit → AG-UI Adapter → AgentCore Runtime → Memory/Tools
```

---

## 3. 導入ステップ

### 3.1 Step 1: AG-UI Adapter の追加（バックエンド）

**目的**: 既存の `StrandsAgentWrapper` を AG-UI Protocol 経由で呼び出せるようにする

**変更ファイル**:
- `backend/src/presentation/entrypoint/ag_ui_adapter.py` (新規)
- `backend/agent.py` (既存エントリポイントと並列で AG-UI エントリポイント追加)

**実装イメージ**:

```python
# backend/src/presentation/entrypoint/ag_ui_adapter.py
"""AG-UI Protocol Adapter.

Wraps existing StrandsAgentWrapper to provide AG-UI compatible interface.
Maintains all existing functionality (Memory, RAG, Tools) while exposing
a standardized protocol endpoint.
"""

from typing import AsyncGenerator, Any
import structlog
from ag_ui_strands import StrandsAgent, RunAgentInput  # AG-UI Adapter パッケージ

from src.presentation.entrypoint.agent_factory import AgentFactory, AgentConfig
from src.infrastructure.config.di_container import get_container

logger = structlog.get_logger()


class AgUiAgentAdapter:
    """AG-UI Protocol adapter for existing agent infrastructure.
    
    This adapter:
    - Wraps StrandsAgentWrapper (既存のエージェント)
    - Translates AG-UI protocol messages to internal format
    - Preserves all existing capabilities (Memory, RAG, Reflections)
    - Adds AG-UI event emission for CopilotKit compatibility
    """
    
    def __init__(self, container: Any = None):
        self._container = container or get_container()
        self._factory = AgentFactory(self._container)
    
    async def handle_ag_ui_request(
        self,
        input_data: RunAgentInput,
        tenant_id: str | None = None,
    ) -> AsyncGenerator[dict[str, Any], None]:
        """Handle AG-UI protocol request.
        
        Args:
            input_data: AG-UI RunAgentInput containing messages, thread_id, etc.
            tenant_id: Optional tenant ID for multi-tenancy
        
        Yields:
            AG-UI protocol events (TextMessageStart, TextMessageContent, etc.)
        """
        # 1. Extract context from AG-UI input
        messages = input_data.messages
        thread_id = input_data.thread_id  # maps to session_id
        
        # Get latest user message
        user_message = next(
            (m.content for m in reversed(messages) if m.role == "user"),
            ""
        )
        
        # 2. Create agent using existing factory (preserves all DI)
        agent = self._factory.create_agent(
            config=AgentConfig(),
            tenant_id=tenant_id,
        )
        
        logger.info(
            "ag_ui_request_started",
            thread_id=thread_id,
            message_preview=user_message[:50],
            tenant_id=tenant_id,
        )
        
        # 3. Emit AG-UI TextMessageStart event
        yield {
            "type": "TEXT_MESSAGE_START",
            "messageId": f"msg-{thread_id}",
        }
        
        # 4. Stream response using existing agent.stream()
        # This preserves: RAG retrieval, Episodic Memory, Reflections
        async for chunk in agent.stream(
            prompt=user_message,
            session_id=thread_id,
            user_id=input_data.run_id or "anonymous",
            tenant_id=tenant_id,
        ):
            # 5. Emit AG-UI TextMessageContent events
            yield {
                "type": "TEXT_MESSAGE_CONTENT",
                "messageId": f"msg-{thread_id}",
                "delta": chunk,
            }
        
        # 6. Emit AG-UI TextMessageEnd event
        yield {
            "type": "TEXT_MESSAGE_END",
            "messageId": f"msg-{thread_id}",
        }
        
        # 7. Emit run finished event
        yield {
            "type": "RUN_FINISHED",
            "threadId": thread_id,
        }
        
        logger.info(
            "ag_ui_request_completed",
            thread_id=thread_id,
            tenant_id=tenant_id,
        )


# Factory function for easy instantiation
def create_ag_ui_adapter(container: Any = None) -> AgUiAgentAdapter:
    """Create AG-UI adapter with injected dependencies."""
    return AgUiAgentAdapter(container)
```

**agent.py への追加**:

```python
# backend/agent.py に追加

from src.presentation.entrypoint.ag_ui_adapter import create_ag_ui_adapter

# ... 既存コードは維持 ...

# AG-UI Protocol エントリポイント（新規追加）
ag_ui_adapter = create_ag_ui_adapter()

@app.entrypoint(name="ag_ui_invoke")  # 別名でエントリポイント追加
async def ag_ui_invoke(payload: dict[str, Any]):
    """AG-UI Protocol compatible entrypoint.
    
    This endpoint can be called by CopilotKit Runtime.
    Internally uses the same agent infrastructure as the main endpoint.
    """
    from ag_ui_strands import RunAgentInput
    
    input_data = RunAgentInput(**payload)
    tenant_id = payload.get("tenant_id")
    
    async for event in ag_ui_adapter.handle_ag_ui_request(input_data, tenant_id):
        yield event
```

### 3.2 Step 2: CopilotKit Runtime の追加（フロントエンド）

**目的**: CopilotKit を**オプションのUI**として追加（既存UIと共存）

**変更ファイル**:
- `frontend/src/features/chat/ui/copilot-chat-container.tsx` (新規)
- `frontend/src/app/copilot/page.tsx` (新規ルート)
- `frontend/package.json` (依存追加)

**実装イメージ**:

```tsx
// frontend/src/features/chat/ui/copilot-chat-container.tsx
"use client";

/**
 * CopilotKit Chat Container
 * 
 * AG-UI Protocol 経由で AgentCore Runtime に接続する
 * CopilotKit ベースのチャット UI。
 * 
 * 既存の ChatContainer と共存し、以下の利点を提供:
 * - 標準化された AI チャット UI コンポーネント
 * - Markdown/コードブロック の標準レンダリング
 * - CopilotKit エコシステム（Actions, State sync）との連携
 */

import { CopilotChat } from "@copilotkit/react-ui";
import { CopilotKit } from "@copilotkit/react-core";
import { useAuth } from "../hooks/use-auth";
import { AuthModal } from "@/features/auth";
import { useState } from "react";
import "@copilotkit/react-ui/styles.css";

interface CopilotChatContainerProps {
  className?: string;
}

export function CopilotChatContainer({ className }: CopilotChatContainerProps) {
  const { user, isAuthenticated, isLoading } = useAuth();
  const [showAuthModal, setShowAuthModal] = useState(false);

  if (isLoading) {
    return <div className="flex items-center justify-center h-full">認証中...</div>;
  }

  if (!isAuthenticated) {
    return (
      <div className="flex flex-col items-center justify-center h-full">
        <AuthModal isOpen={showAuthModal} onClose={() => setShowAuthModal(false)} />
        <p className="mb-4">サインインが必要です</p>
        <button onClick={() => setShowAuthModal(true)}>サインイン</button>
      </div>
    );
  }

  // CopilotKit Runtime URL（AG-UI Adapter への接続）
  const runtimeUrl = process.env.NEXT_PUBLIC_COPILOTKIT_RUNTIME_URL 
    || "/api/copilot";

  return (
    <div className={className}>
      <CopilotKit 
        runtimeUrl={runtimeUrl}
        // カスタムヘッダーで認証情報を渡す
        headers={{
          "X-User-Id": user?.userId || "",
          "X-Tenant-Id": user?.tenantId || "",
        }}
      >
        <CopilotChat
          labels={{
            title: "AI アシスタント",
            initial: "何かお手伝いできますか？",
            placeholder: "メッセージを入力...",
          }}
          // 既存UIと同じスタイリングを適用
          className="h-full"
        />
      </CopilotKit>
    </div>
  );
}
```

**新規ルート追加**:

```tsx
// frontend/src/app/copilot/page.tsx
import { CopilotChatContainer } from "@/features/chat/ui/copilot-chat-container";

export default function CopilotPage() {
  return (
    <div className="h-screen">
      <CopilotChatContainer className="h-full" />
    </div>
  );
}
```

### 3.3 Step 3: CopilotKit Runtime Lambda（中間層）

**目的**: CopilotKit からの HTTP リクエストを AG-UI Adapter に中継

**方法A: Amplify Functions（Qiita記事方式）**

```typescript
// frontend/amplify/functions/copilotkit/handler.ts
import { Hono } from "hono";
import { handle } from "hono/aws-lambda";
import {
  CopilotRuntime,
  copilotRuntimeNextJSAppRouterEndpoint,
} from "@copilotkit/runtime";
import { HttpAgent } from "@ag-ui/client";

const app = new Hono();

// AgentCore Runtime の AG-UI エンドポイント
const AGENTCORE_AG_UI_ENDPOINT = process.env.AGENTCORE_AG_UI_ENDPOINT;

app.post("/api/copilot", async (c) => {
  const body = await c.req.json();
  
  // AG-UI HttpAgent で AgentCore に接続
  const agent = new HttpAgent({
    url: AGENTCORE_AG_UI_ENDPOINT,
    // 認証トークンを転送
    headers: {
      Authorization: c.req.header("Authorization") || "",
    },
  });

  const runtime = new CopilotRuntime({
    agents: {
      "agentic-rag": agent,
    },
  });

  // CopilotKit のリクエストを処理
  const response = await runtime.process(body);
  return c.json(response);
});

export const handler = handle(app);
```

**方法B: Next.js API Route（シンプル）**

```typescript
// frontend/src/app/api/copilot/route.ts
import { NextRequest, NextResponse } from "next/server";
import {
  CopilotRuntime,
  copilotRuntimeNextJSAppRouterEndpoint,
} from "@copilotkit/runtime";
import { HttpAgent } from "@ag-ui/client";

const AGENTCORE_AG_UI_ENDPOINT = process.env.AGENTCORE_AG_UI_ENDPOINT;

export async function POST(req: NextRequest) {
  const agent = new HttpAgent({
    url: AGENTCORE_AG_UI_ENDPOINT!,
  });

  const { handleRequest } = copilotRuntimeNextJSAppRouterEndpoint({
    runtime: new CopilotRuntime({
      agents: { "agentic-rag": agent },
    }),
    endpoint: "/api/copilot",
  });

  return handleRequest(req);
}
```

---

## 4. 既存機能との統合ポイント

### 4.1 AgentCore Memory の維持

```python
# AG-UI Adapter 内での Memory 利用（既存のまま）

async def handle_ag_ui_request(self, input_data, tenant_id):
    # 既存の AgentFactory 経由で Agent 作成
    # → EpisodicMemoryService, ReflectionService が自動注入
    agent = self._factory.create_agent(tenant_id=tenant_id)
    
    # agent.stream() 内で以下が自動実行される:
    # 1. RAG: S3Vector からドキュメント取得
    # 2. Episodic Memory: 類似エピソード取得
    # 3. Reflections: パターン・洞察の適用
    # 4. 対話保存: episode detection 用
    
    async for chunk in agent.stream(...):
        yield {"type": "TEXT_MESSAGE_CONTENT", "delta": chunk}
```

### 4.2 Tools の維持

```python
# AgentFactory._create_tools() は変更不要

def _create_tools(self, tenant_id):
    tools = []
    # Knowledge Base Tool (S3 Vector)
    tools.append(create_knowledge_tool(
        vector_client=self._container.s3vector_client,
        tenant_id=tenant_id,
    ))
    # 他の Tool も同様に追加可能
    return tools
```

### 4.3 認証フローの統合

```
既存ルート:
  Browser → Cognito JWT → AWS SDK (Identity Pool) → AgentCore Runtime

AG-UI ルート:
  Browser → Cognito JWT → CopilotKit Runtime → AG-UI Adapter → AgentCore Runtime
                              ↓
                         JWT を転送して
                         tenant_id/user_id を抽出
```

---

## 5. ディレクトリ構成（変更後）

```
backend/
├── agent.py                              # 既存 + ag_ui_invoke 追加
├── src/
│   ├── application/                      # 変更なし
│   ├── domain/                           # 変更なし
│   ├── infrastructure/
│   │   ├── agentcore/                    # 変更なし (Memory, etc.)
│   │   └── ...
│   └── presentation/
│       ├── entrypoint/
│       │   ├── agent_factory.py          # 変更なし
│       │   ├── prompts.py                # 変更なし
│       │   └── ag_ui_adapter.py          # 【新規】AG-UI Adapter
│       ├── lambda_handlers/              # 変更なし
│       └── tools/                        # 変更なし

frontend/
├── src/
│   ├── app/
│   │   ├── page.tsx                      # 既存 UI（変更なし）
│   │   ├── copilot/
│   │   │   └── page.tsx                  # 【新規】CopilotKit ルート
│   │   └── api/
│   │       └── copilot/
│   │           └── route.ts              # 【新規】CopilotKit Runtime
│   ├── features/
│   │   ├── chat/
│   │   │   ├── api/
│   │   │   │   └── agentcore-client.ts   # 既存（変更なし）
│   │   │   ├── hooks/
│   │   │   │   └── use-chat-stream.ts    # 既存（変更なし）
│   │   │   └── ui/
│   │   │       ├── chat-container.tsx    # 既存（変更なし）
│   │   │       └── copilot-chat-container.tsx  # 【新規】
│   │   └── auth/                         # 変更なし
│   └── shared/                           # 変更なし
└── package.json                          # CopilotKit 依存追加
```

---

## 6. 実装ロードマップ

### Phase 1: AG-UI Adapter 実装（3-4日）

| タスク | 工数 | 備考 |
|-------|-----|------|
| `ag_ui_adapter.py` 作成 | 1日 | 既存 Agent をラップ |
| `agent.py` に `ag_ui_invoke` 追加 | 0.5日 | 既存エントリポイントと並列 |
| 単体テスト | 1日 | AG-UI イベント形式確認 |
| AgentCore Runtime デプロイ | 0.5日 | 既存パイプライン利用 |

### Phase 2: CopilotKit フロントエンド（2-3日）

| タスク | 工数 | 備考 |
|-------|-----|------|
| パッケージ追加 | 0.5日 | `@copilotkit/*`, `@ag-ui/client` |
| `copilot-chat-container.tsx` | 1日 | CopilotKit UI 統合 |
| `/copilot` ルート追加 | 0.5日 | 新規ページ |
| `/api/copilot` Route 追加 | 1日 | CopilotKit Runtime |

### Phase 3: 統合テスト・調整（2-3日）

| タスク | 工数 | 備考 |
|-------|-----|------|
| E2E テスト | 1日 | 既存 UI / CopilotKit 両方 |
| Memory 機能確認 | 1日 | Episodic/Reflections が動作するか |
| パフォーマンス比較 | 0.5日 | 既存ルート vs AG-UI ルート |

### 合計工数: 7-10日

---

## 7. メリット・デメリット

### 7.1 このアプローチのメリット

| メリット | 詳細 |
|---------|------|
| **既存資産の完全維持** | Clean Architecture, Memory, Tools すべて継続利用 |
| **段階的導入** | リスク最小で新技術を試験可能 |
| **選択肢の提供** | 既存 UI と CopilotKit UI を用途で使い分け |
| **将来の拡張性** | AG-UI 対応で他クライアント（VS Code 拡張等）への展開容易 |
| **ロールバック容易** | 問題発生時は AG-UI ルートを無効化するだけ |

### 7.2 デメリット・リスク

| デメリット | 対策 |
|-----------|------|
| 2系統のUI保守 | ドキュメント化、Feature Flag での切替 |
| AG-UI パッケージの成熟度 | 本番前に十分なテスト、フォールバック用意 |
| レイテンシ増加（AG-UI経由） | パフォーマンス要件高い場合は既存ルート推奨 |

---

## 8. 登壇テーマへの活用

本アプローチは以下のテーマで登壇可能：

### サーバーレスアーキテクチャ関連
- 「AgentCore Runtime の複数エントリポイント設計: AWS SDK 直接 vs AG-UI Protocol」
- 「既存 Clean Architecture を維持しながらの新プロトコル導入事例」

### エージェンティック AI プラットフォーム関連
- 「AgentCore Memory (Episodic/Reflections) と AG-UI Protocol の統合」
- 「Strands Agents + AG-UI: Python エージェントの標準プロトコル対応」

### Developer Productivity 関連
- 「CopilotKit によるフロントエンド AI 開発の効率化: 既存実装との共存パターン」
- 「段階的 AI 技術導入: リスクを最小化する追加型アーキテクチャ」

---

## 9. まとめ

| 観点 | 結論 |
|-----|------|
| **アプローチ** | 置き換えではなく追加（既存 + AG-UI + CopilotKit） |
| **既存の維持** | Clean Architecture, AgentCore Memory, Tools すべて維持 |
| **新規追加** | AG-UI Adapter, CopilotKit UI を別ルートとして追加 |
| **工数** | 7-10日（Phase 1-3） |
| **リスク** | 低（既存機能への影響なし、ロールバック容易） |

**次のアクション**:
1. Phase 1 の `ag_ui_adapter.py` 実装から開始
2. 単体テストで AG-UI イベント形式を確認
3. Phase 2 で CopilotKit フロントエンドを追加

---

**ご質問・フィードバックがあればお知らせください。**
