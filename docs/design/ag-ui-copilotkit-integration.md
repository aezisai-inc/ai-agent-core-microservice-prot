# AG-UI / CopilotKit 統合設計書

## 1. 概要

### 1.1 目的

既存のAgentic RAGアーキテクチャを維持しながら、AG-UI Protocol と CopilotKit を**追加オプション**として導入する。

### 1.2 設計原則

1. **既存コード変更なし**: 既存ファイルは一切変更しない
2. **完全分離**: CopilotKit は `/copilot` ルート配下に隔離
3. **認証共有**: 既存の `useAuth()` フックを再利用
4. **ロールバック容易**: 追加ファイルを削除するだけで元に戻せる

### 1.3 対象バージョン

- Base: PR #51 (feat/copilotkit-ag-ui-integration)
- Next.js: 15.5.7 (**Static Export モード: `output: export`**)
- React: 19.0.0
- strands-agents: >=0.1.0
- bedrock-agentcore: >=0.1.0

### 1.4 重要な制約: Static Export モード

本プロジェクトは **Next.js の Static Export (`output: export`)** を使用しているため、
以下の制約があります：

- ❌ **API Routes 使用不可**: `/api/*` ルートは使用できない
- ❌ `export const dynamic = "force-dynamic"` は使用不可
- ✅ **外部エンドポイント直接接続**: CopilotKit は外部の AG-UI エンドポイントに直接接続

**対応方針**:
- CopilotKit の `runtimeUrl` は環境変数 `NEXT_PUBLIC_COPILOTKIT_RUNTIME_URL` で外部エンドポイントを指定
- 環境変数未設定時は設定案内画面を表示（モック応答は使用しない）

---

## 2. アーキテクチャ

### 2.1 全体構成図

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                              Frontend (Next.js 15)                              │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                 │
│  Route: /                              Route: /copilot                          │
│  ┌─────────────────────────┐           ┌─────────────────────────┐              │
│  │     既存UI (変更なし)    │           │    CopilotKit UI        │              │
│  │                         │           │                         │              │
│  │  - ChatContainer        │           │  - CopilotChat          │              │
│  │  - use-chat-stream      │           │  - CopilotKit Provider  │              │
│  │  - agentcore-client     │           │                         │              │
│  └───────────┬─────────────┘           └───────────┬─────────────┘              │
│              │                                     │                            │
│              │ AWS SDK 直接                        │ HTTP POST (直接)           │
│              │                                     │                            │
│              │                                     │ ※ Static Export のため     │
│              │                                     │   API Route は使用不可     │
│              │                                     │                            │
└──────────────┼─────────────────────────────────────┼────────────────────────────┘
               │                                     │
               │                                     │ AG-UI Protocol (直接接続)
               ▼                                     ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│                           AgentCore Runtime (ECR)                               │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                 │
│  Entrypoint: invoke (既存)             Entrypoint: ag_ui_invoke (新規)          │
│  ┌─────────────────────────┐           ┌─────────────────────────┐              │
│  │     agent.py            │           │   ag_ui_entrypoint.py   │              │
│  │     (変更なし)           │           │   (新規追加)             │              │
│  │                         │           │                         │              │
│  │  @app.entrypoint        │           │  AG-UI Adapter          │              │
│  │  def invoke(payload)    │           │  - StrandsAgent wrapper │              │
│  └───────────┬─────────────┘           └───────────┬─────────────┘              │
│              │                                     │                            │
│              └─────────────────┬───────────────────┘                            │
│                                │                                                │
│                                ▼                                                │
│                    ┌─────────────────────────┐                                  │
│                    │   Strands Agent         │                                  │
│                    │   (共通)                 │                                  │
│                    └─────────────────────────┘                                  │
│                                                                                 │
└─────────────────────────────────────────────────────────────────────────────────┘
```

### 2.2 通信フロー

#### Route A: 既存ルート（変更なし）

```
Browser → ChatContainer → useAuth() → AgentCoreClient → AWS SDK
                                                            ↓
                                      AgentCore Runtime (invoke) → Strands Agent
```

#### Route B: CopilotKit ルート（新規）

```
Browser → /copilot → CopilotChat → 外部 AG-UI エンドポイント (直接接続)
                                        ↓
                              NEXT_PUBLIC_COPILOTKIT_RUNTIME_URL
                                        ↓
                    AgentCore Runtime (ag_ui_invoke) → Strands Agent
```

> **Note**: Static Export モードのため、Next.js API Routes は使用できません。
> CopilotKit は環境変数で指定された外部エンドポイントに直接 HTTP リクエストを送信します。

---

## 3. ディレクトリ構成

### 3.1 追加ファイル一覧

```
backend/
├── agent.py                          # 既存（変更なし）
├── ag_ui_entrypoint.py               # 【新規】AG-UI エントリポイント
└── pyproject.toml                    # ag-ui-strands 依存追加

frontend/
├── src/
│   ├── app/
│   │   ├── layout.tsx                # 既存（変更なし）
│   │   ├── page.tsx                  # 既存（変更なし）
│   │   ├── providers.tsx             # 既存（変更なし）
│   │   │
│   │   └── copilot/                  # 【新規】CopilotKit ルート
│   │       ├── layout.tsx            # CopilotKit Provider (外部エンドポイント接続)
│   │       └── page.tsx              # CopilotChat UI
│   │
│   │   # ❌ api/ ディレクトリは使用不可 (Static Export モード)
│   │
│   ├── shared/
│   │   └── lib/
│   │       └── config.ts             # 【変更】CopilotKit Runtime URL 設定追加
│   │
│   └── features/
│       └── chat/
│           ├── api/
│           │   └── agentcore-client.ts   # 既存（変更なし）
│           ├── hooks/
│           │   ├── use-auth.ts           # 既存（変更なし）
│           │   └── use-chat-stream.ts    # 既存（変更なし）
│           └── ui/
│               └── chat-container.tsx    # 既存（変更なし）
│
└── package.json                      # CopilotKit 依存追加
```

### 3.2 変更の影響範囲

| ファイル | 変更内容 |
|---------|---------|
| `backend/pyproject.toml` | `ag-ui-strands` 依存追加（既存依存に影響なし） |
| `frontend/package.json` | `@copilotkit/*` 依存追加（既存依存に影響なし） |
| `frontend/src/shared/lib/config.ts` | `getCopilotKitRuntimeUrl()` 関数追加 |

---

## 4. Backend 設計

### 4.1 ag_ui_entrypoint.py

```python
"""AG-UI Protocol Entrypoint for AgentCore Runtime.

This module provides an AG-UI compatible endpoint that can be called
by CopilotKit Runtime. It wraps the existing Strands Agent without
modifying the original agent.py.

Note:
    - This is a separate entrypoint from the existing invoke()
    - Both entrypoints share the same Strands Agent instance
    - No changes to existing code required
"""

import json
import os
from typing import Any, AsyncGenerator

import structlog
from strands import Agent

logger = structlog.get_logger()

# ============================================================================
# Agent Setup (既存と同じ設定を共有)
# ============================================================================

MODEL_ID = os.environ.get("BEDROCK_MODEL_ID", "apac.amazon.nova-pro-v1:0")

SYSTEM_PROMPT = """あなたは優秀なカスタマーサポートアシスタントです。
ユーザーの質問に対して、丁寧かつ的確に回答してください。

## 回答のガイドライン
- 簡潔で分かりやすい言葉を使う
- 必要に応じて箇条書きを使用する
- 不明な点があれば確認する
"""

# Strands Agent (既存 agent.py と同じ設定)
agent = Agent(
    model=MODEL_ID,
    system_prompt=SYSTEM_PROMPT,
)

logger.info("ag_ui_agent_initialized", model_id=MODEL_ID)


# ============================================================================
# AG-UI Protocol Handler
# ============================================================================

class AgUiProtocolHandler:
    """AG-UI Protocol message handler.
    
    Translates between AG-UI protocol format and Strands Agent.
    
    AG-UI Event Types:
        - TEXT_MESSAGE_START: Start of assistant message
        - TEXT_MESSAGE_CONTENT: Streaming text content
        - TEXT_MESSAGE_END: End of assistant message
        - RUN_STARTED: Agent run started
        - RUN_FINISHED: Agent run completed
        - RUN_ERROR: Error occurred
    """
    
    def __init__(self, strands_agent: Agent):
        self._agent = strands_agent
    
    async def handle_request(
        self,
        messages: list[dict[str, Any]],
        thread_id: str,
        run_id: str | None = None,
    ) -> AsyncGenerator[dict[str, Any], None]:
        """Handle AG-UI protocol request.
        
        Args:
            messages: List of messages in AG-UI format
                [{"role": "user", "content": "..."}]
            thread_id: Thread/session identifier
            run_id: Optional run identifier
        
        Yields:
            AG-UI protocol events
        """
        # Extract latest user message
        user_message = ""
        for msg in reversed(messages):
            if msg.get("role") == "user":
                content = msg.get("content", "")
                if isinstance(content, str):
                    user_message = content
                elif isinstance(content, list):
                    # Handle content array format
                    user_message = " ".join(
                        item.get("text", "") 
                        for item in content 
                        if isinstance(item, dict)
                    )
                break
        
        if not user_message:
            yield {
                "type": "RUN_ERROR",
                "error": "No user message found",
            }
            return
        
        message_id = f"msg-{thread_id}-{run_id or 'default'}"
        
        logger.info(
            "ag_ui_request_started",
            thread_id=thread_id,
            run_id=run_id,
            message_preview=user_message[:50],
        )
        
        # Emit RUN_STARTED
        yield {
            "type": "RUN_STARTED",
            "threadId": thread_id,
            "runId": run_id,
        }
        
        # Emit TEXT_MESSAGE_START
        yield {
            "type": "TEXT_MESSAGE_START",
            "messageId": message_id,
            "role": "assistant",
        }
        
        try:
            # Invoke Strands Agent
            result = self._agent(user_message)
            
            # Extract response text
            response_text = ""
            if hasattr(result, 'message'):
                response_text = result.message
            elif hasattr(result, 'content'):
                response_text = str(result.content)
            else:
                response_text = str(result)
            
            # Emit TEXT_MESSAGE_CONTENT (single chunk for non-streaming)
            yield {
                "type": "TEXT_MESSAGE_CONTENT",
                "messageId": message_id,
                "delta": response_text,
            }
            
            # Emit TEXT_MESSAGE_END
            yield {
                "type": "TEXT_MESSAGE_END",
                "messageId": message_id,
            }
            
            # Emit RUN_FINISHED
            yield {
                "type": "RUN_FINISHED",
                "threadId": thread_id,
                "runId": run_id,
            }
            
            logger.info(
                "ag_ui_request_completed",
                thread_id=thread_id,
                response_length=len(response_text),
            )
            
        except Exception as e:
            logger.error(
                "ag_ui_request_error",
                thread_id=thread_id,
                error=str(e),
            )
            yield {
                "type": "RUN_ERROR",
                "error": str(e),
            }


# Global handler instance
ag_ui_handler = AgUiProtocolHandler(agent)


# ============================================================================
# HTTP Endpoint (FastAPI style for local testing)
# ============================================================================

async def handle_ag_ui_http(request_body: dict[str, Any]) -> AsyncGenerator[str, None]:
    """HTTP endpoint handler for AG-UI requests.
    
    Args:
        request_body: AG-UI request body containing:
            - messages: List of conversation messages
            - threadId: Thread identifier
            - runId: Optional run identifier
    
    Yields:
        Server-Sent Events (SSE) formatted strings
    """
    messages = request_body.get("messages", [])
    thread_id = request_body.get("threadId", "default-thread")
    run_id = request_body.get("runId")
    
    async for event in ag_ui_handler.handle_request(messages, thread_id, run_id):
        # Format as SSE
        yield f"data: {json.dumps(event)}\n\n"
```

### 4.2 依存関係追加

```toml
# backend/pyproject.toml に追加
[project.optional-dependencies]
ag-ui = [
    "ag-ui-strands>=0.1.0",  # AG-UI Protocol adapter
]
```

---

## 5. Frontend 設計

### 5.1 /copilot/layout.tsx

> **重要**: Static Export モードのため、`/api/copilot` API Route は使用できません。
> 代わりに、環境変数 `NEXT_PUBLIC_COPILOTKIT_RUNTIME_URL` で外部エンドポイントを指定します。

```tsx
/**
 * CopilotKit Layout
 *
 * CopilotKit Provider を /copilot 配下のみに適用。
 * 既存の Provider（Amplify, React Query）とは独立。
 *
 * 重要: Static Export モードでは API Routes が使用できないため、
 * CopilotKit は環境変数で指定された外部エンドポイントに直接接続する。
 */
"use client";

import { CopilotKit } from "@copilotkit/react-core";
import { useAuth } from "@/features/chat/hooks/use-auth";
import { getCopilotKitRuntimeUrl, isCopilotKitConfigValid } from "@/shared/lib/config";
import { useEffect, useState, type ReactNode } from "react";

export default function CopilotLayout({ children }: { children: ReactNode }) {
  const { getIdToken, isAuthenticated, isLoading } = useAuth();
  const [authHeaders, setAuthHeaders] = useState<Record<string, string>>({});
  const runtimeUrl = getCopilotKitRuntimeUrl();

  // Cognito JWT を取得して CopilotKit に渡す
  useEffect(() => {
    if (isAuthenticated) {
      getIdToken().then((token) => {
        if (token) {
          setAuthHeaders({
            Authorization: `Bearer ${token}`,
          });
        }
      });
    }
  }, [isAuthenticated, getIdToken]);

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-surface-950">
        <div className="text-surface-400">認証確認中...</div>
      </div>
    );
  }

  // CopilotKit Runtime URL が未設定の場合
  if (!isCopilotKitConfigValid() || !runtimeUrl) {
    return (
      <div className="flex h-screen items-center justify-center bg-surface-950">
        <div className="max-w-md text-center p-6 bg-surface-900 rounded-lg border border-surface-700">
          <h2 className="text-lg font-semibold text-surface-100 mb-3">
            CopilotKit 未設定
          </h2>
          <p className="text-surface-400 text-sm mb-4">
            環境変数 <code className="px-1 py-0.5 bg-surface-800 rounded text-amber-400">
              NEXT_PUBLIC_COPILOTKIT_RUNTIME_URL
            </code> を設定してください。
          </p>
          <a href="/" className="text-accent-400 hover:text-accent-300 text-sm">
            ← 既存のチャット UI に戻る
          </a>
        </div>
      </div>
    );
  }

  return (
    <CopilotKit runtimeUrl={runtimeUrl} headers={authHeaders}>
      {children}
    </CopilotKit>
  );
}
```

### 5.2 /copilot/page.tsx

```tsx
/**
 * CopilotKit Chat Page
 * 
 * CopilotKit の標準 UI コンポーネントを使用したチャット画面。
 * 既存の / ルートとは完全に独立。
 */
"use client";

import { CopilotChat } from "@copilotkit/react-ui";
import { useAuth } from "@/features/chat/hooks/use-auth";
import { AuthModal } from "@/features/auth";
import { useState } from "react";
import "@copilotkit/react-ui/styles.css";

export default function CopilotPage() {
  const { isAuthenticated, isLoading, user } = useAuth();
  const [showAuthModal, setShowAuthModal] = useState(false);

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-surface-950">
        <div className="text-surface-400">読み込み中...</div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="flex h-screen flex-col items-center justify-center bg-surface-950">
        <AuthModal
          isOpen={showAuthModal}
          onClose={() => setShowAuthModal(false)}
        />
        <div className="text-center">
          <h1 className="mb-4 text-2xl font-bold text-surface-100">
            CopilotKit Chat
          </h1>
          <p className="mb-6 text-surface-400">
            サインインしてチャットを開始してください
          </p>
          <button
            onClick={() => setShowAuthModal(true)}
            className="rounded-lg bg-primary-600 px-6 py-3 font-medium text-white hover:bg-primary-500"
          >
            サインイン
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen flex-col bg-surface-950">
      {/* Header */}
      <header className="border-b border-surface-800 px-4 py-3">
        <div className="flex items-center justify-between">
          <h1 className="text-lg font-semibold text-surface-100">
            CopilotKit Chat
          </h1>
          <div className="text-sm text-surface-400">
            {user?.email || user?.username}
          </div>
        </div>
      </header>

      {/* Chat Area */}
      <main className="flex-1 overflow-hidden">
        <CopilotChat
          labels={{
            title: "AI アシスタント",
            initial: "何かお手伝いできることはありますか？",
            placeholder: "メッセージを入力...",
          }}
          className="h-full"
        />
      </main>
    </div>
  );
}
```

### 5.3 API Route について

> ⚠️ **Static Export モードの制約**
>
> 本プロジェクトは `next.config.js` で `output: 'export'` を設定しているため、
> **Next.js API Routes (`/api/*`) は使用できません**。
>
> - `export const dynamic = "force-dynamic"` は Static Export と互換性がない
> - 代わりに、CopilotKit は環境変数で指定された外部エンドポイントに直接接続する
>
> **設定方法**:
> ```bash
> # .env.local または Amplify 環境変数
> NEXT_PUBLIC_COPILOTKIT_RUNTIME_URL=https://your-agentcore-endpoint/ag-ui
> ```

### 5.4 package.json 追加依存

```json
{
  "dependencies": {
    "@copilotkit/react-core": "^1.0.0",
    "@copilotkit/react-ui": "^1.0.0"
  }
}
```

---

## 6. 認証フロー

### 6.1 認証の流れ

```
1. ユーザーが /copilot にアクセス
2. CopilotLayout が useAuth() で認証状態を確認
3. 未認証の場合 → AuthModal を表示
4. 認証済みの場合 → getIdToken() で Cognito JWT を取得
5. JWT を CopilotKit の headers に設定
6. CopilotChat がメッセージ送信時に Authorization ヘッダー付きで外部エンドポイントに POST
   (NEXT_PUBLIC_COPILOTKIT_RUNTIME_URL で指定)
7. 外部エンドポイント (AgentCore Runtime) が JWT を検証して処理
```

### 6.2 既存認証との共有

```typescript
// 既存の useAuth() フックを再利用
import { useAuth } from "@/features/chat/hooks/use-auth";

// CopilotLayout で使用
const { getIdToken, isAuthenticated, isLoading, user } = useAuth();
```

---

## 7. 環境変数

### 7.1 新規追加（CopilotKit 用）

```bash
# .env.local または Amplify 環境変数に追加
#
# CopilotKit が直接接続する AG-UI Protocol エンドポイント
# (Static Export モードのため、クライアントサイドから直接アクセス可能な URL が必要)
NEXT_PUBLIC_COPILOTKIT_RUNTIME_URL=https://your-agentcore-endpoint/ag-ui
```

> **Note**: `NEXT_PUBLIC_` プレフィックスが必要です（クライアントサイドで使用するため）

### 7.2 既存（変更なし）

```bash
NEXT_PUBLIC_COGNITO_USER_POOL_ID=ap-northeast-1_xxx
NEXT_PUBLIC_COGNITO_CLIENT_ID=xxx
NEXT_PUBLIC_COGNITO_IDENTITY_POOL_ID=ap-northeast-1:xxx
NEXT_PUBLIC_AWS_REGION=ap-northeast-1
NEXT_PUBLIC_AGENT_RUNTIME_ARN=arn:aws:bedrock-agentcore:...
```

---

## 8. テスト計画

### 8.1 動作確認項目

| # | 項目 | 確認内容 |
|---|-----|---------|
| 1 | 既存 UI 影響なし | `/` ルートが正常動作 |
| 2 | CopilotKit UI 表示 | `/copilot` でチャット画面表示 |
| 3 | 認証連携 | `useAuth()` で認証状態取得 |
| 4 | モック応答 | API Route がモック応答返却 |
| 5 | AgentCore 連携 | AG-UI エンドポイント経由で応答 |

### 8.2 ロールバック手順

```bash
# CopilotKit 関連ファイルを削除するだけ
rm -rf frontend/src/app/copilot
rm backend/ag_ui_entrypoint.py

# 依存関係を戻す
cd frontend && npm uninstall @copilotkit/react-core @copilotkit/react-ui

# config.ts の CopilotKit 関連関数は残しても影響なし（使用されないため）
```

---

## 9. 実装スケジュール

| Phase | タスク | 工数 |
|-------|-------|-----|
| 1 | 本設計書作成 | 完了 |
| 2 | Frontend 依存追加 | 0.5h |
| 3 | /copilot ルート作成 | 1h |
| 4 | /api/copilot API Route 作成 | 1h |
| 5 | Backend AG-UI Adapter 作成 | 1h |
| 6 | 動作確認 | 1h |

**合計: 約4.5時間**

---

## 10. 将来の拡張

### 10.1 Phase 2（オプション）

- AgentCore Memory との統合
- CopilotKit Actions の追加
- ストリーミング対応強化

### 10.2 Phase 3（オプション）

- 既存 UI と CopilotKit UI の切り替え機能
- パフォーマンス比較ダッシュボード
