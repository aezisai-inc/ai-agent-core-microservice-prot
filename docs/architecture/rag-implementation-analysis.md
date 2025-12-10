# RAG 実装分析レポート

## 概要

このドキュメントは、現状のAgentCore RAG実装経路と、理想的な実装経路を分析・比較したものです。

---

## 問題サマリー

| 項目 | 現状 | 理想 |
|------|------|------|
| Knowledge Base 検索 | ❌ 未使用 | ✅ S3Vector から検索 |
| RAG コンテキスト注入 | ❌ なし | ✅ プロンプトに埋め込み |
| `docs/sample/` 参照 | ❌ 不可能 | ✅ 可能 |
| 使用中のエントリポイント | `agent.py` | `agent_factory.py` |

---

## 現状のシーケンス図 (AS-IS)

```mermaid
sequenceDiagram
    autonumber
    participant User as ユーザー (Frontend)
    participant AgentCore as AgentCore Runtime
    participant Agent as agent.py
    participant Strands as Strands Agent
    participant Bedrock as Amazon Bedrock<br/>(Nova Pro)
    
    User->>AgentCore: invoke_agent_runtime<br/>(prompt, sessionId)
    AgentCore->>Agent: invoke(payload)
    
    Note over Agent: ❌ RAG検索なし
    Note over Agent: ❌ Knowledge Base未使用
    
    Agent->>Strands: agent(prompt)
    Strands->>Bedrock: InvokeModel<br/>(Nova Pro)
    Bedrock-->>Strands: 生成テキスト
    Strands-->>Agent: result.message
    Agent-->>AgentCore: {"response": "...", "session_id": "..."}
    AgentCore-->>User: レスポンス
    
    Note over User: ⚠️ 一般的な回答のみ<br/>ドキュメント参照なし
```

### 現状のコード (`agent.py`)

```python
# ❌ 問題: RAG統合なし
agent = Agent(
    model=MODEL_ID,
    system_prompt=SYSTEM_PROMPT,  # 固定プロンプトのみ
)

@app.entrypoint
def invoke(payload):
    prompt = payload.get("prompt", "")
    result = agent(prompt)  # 直接呼び出し、RAGなし
    return {"response": result.message}
```

---

## 現状のアクティビティ図 (AS-IS)

```mermaid
flowchart TD
    subgraph Frontend
        A[ユーザーが質問入力]
    end
    
    subgraph AgentCore Runtime
        B[invoke_agent_runtime]
        C[agent.py: invoke]
    end
    
    subgraph "Strands Agent (現状)"
        D[Agent初期化<br/>model + system_prompt のみ]
        E[agent prompt を直接実行]
    end
    
    subgraph Amazon Bedrock
        F[Nova Pro モデル呼び出し]
        G[一般的な応答生成]
    end
    
    subgraph "❌ 未使用コンポーネント"
        X1[S3VectorClient]
        X2[Knowledge Base]
        X3[RAG Context Builder]
        X4[docs/sample/*.md]
    end
    
    A --> B
    B --> C
    C --> D
    D --> E
    E --> F
    F --> G
    G --> |一般的な回答| A
    
    X1 -.->|未接続| E
    X2 -.->|未接続| X1
    X4 -.->|インジェスト済みだが<br/>検索されない| X2
    
    style X1 fill:#ffcccc,stroke:#ff0000
    style X2 fill:#ffcccc,stroke:#ff0000
    style X3 fill:#ffcccc,stroke:#ff0000
    style X4 fill:#ffcccc,stroke:#ff0000
```

---

## 理想的なシーケンス図 (TO-BE)

```mermaid
sequenceDiagram
    autonumber
    participant User as ユーザー (Frontend)
    participant AgentCore as AgentCore Runtime
    participant Agent as agent.py (修正版)
    participant Factory as AgentFactory
    participant Wrapper as StrandsAgentWrapper
    participant S3Vector as S3VectorClient
    participant KB as Knowledge Base<br/>(Bedrock)
    participant Bedrock as Amazon Bedrock<br/>(Nova Pro)
    
    User->>AgentCore: invoke_agent_runtime<br/>(prompt, sessionId)
    AgentCore->>Agent: invoke(payload)
    
    rect rgb(200, 255, 200)
        Note over Agent,Factory: ✅ RAG 統合フロー
        Agent->>Factory: create_agent(tenant_id)
        Factory->>Wrapper: StrandsAgentWrapper 生成
    end
    
    Agent->>Wrapper: invoke(prompt, session_id, user_id)
    
    rect rgb(200, 220, 255)
        Note over Wrapper,KB: ✅ RAG 検索フェーズ
        Wrapper->>S3Vector: search(prompt, tenant_id)
        S3Vector->>KB: retrieve(query)
        KB-->>S3Vector: 関連チャンク (docs/sample/*.md)
        S3Vector-->>Wrapper: RAG結果 [content, score, source]
    end
    
    rect rgb(255, 255, 200)
        Note over Wrapper: コンテキスト構築
        Wrapper->>Wrapper: _build_rag_context(chunks)
        Wrapper->>Wrapper: build_system_prompt<br/>(base + rag_context)
    end
    
    Wrapper->>Bedrock: InvokeModel<br/>(enriched_prompt)
    Bedrock-->>Wrapper: 生成テキスト
    
    Wrapper-->>Agent: {"content": "...", "rag_chunks_used": N}
    Agent-->>AgentCore: {"response": "...", "sources": [...]}
    AgentCore-->>User: ドキュメント参照付き回答
    
    Note over User: ✅ docs/sample/ の内容を参照した回答
```

---

## 理想的なアクティビティ図 (TO-BE)

```mermaid
flowchart TD
    subgraph Frontend
        A[ユーザーが質問入力]
        Z[ドキュメント参照付き回答を表示]
    end
    
    subgraph AgentCore Runtime
        B[invoke_agent_runtime]
        C[agent.py: invoke]
    end
    
    subgraph "Agent Factory"
        D[AgentFactory.create_agent]
        E[StrandsAgentWrapper 生成]
    end
    
    subgraph "RAG Pipeline ✅"
        F[S3VectorClient.search]
        G[Knowledge Base 検索]
        H[関連チャンク取得<br/>docs/sample/*.md]
        I[_build_rag_context]
    end
    
    subgraph "Prompt Engineering"
        J[build_system_prompt]
        K[base_prompt + rag_context<br/>+ episodic_context]
    end
    
    subgraph Amazon Bedrock
        L[Nova Pro モデル呼び出し<br/>enriched_prompt]
        M[ドキュメント参照した<br/>回答生成]
    end
    
    A --> B
    B --> C
    C --> D
    D --> E
    E --> F
    F --> G
    G --> H
    H --> I
    I --> J
    J --> K
    K --> L
    L --> M
    M --> Z
    
    style F fill:#ccffcc,stroke:#00aa00
    style G fill:#ccffcc,stroke:#00aa00
    style H fill:#ccffcc,stroke:#00aa00
    style I fill:#ccffcc,stroke:#00aa00
```

---

## ファイル構成と役割

```
backend/
├── agent.py                          # ❌ 現在のエントリポイント (RAGなし)
│
├── src/
│   ├── presentation/
│   │   ├── entrypoint/
│   │   │   ├── agent_factory.py      # ✅ RAG統合済み (未使用)
│   │   │   └── prompts.py            # ✅ build_system_prompt
│   │   │
│   │   └── tools/
│   │       └── knowledge_tool.py     # ✅ KB検索ツール (未使用)
│   │
│   └── infrastructure/
│       └── external_services/
│           └── s3vector/
│               └── s3vector_client.py # ✅ S3Vector クライアント (未使用)

docs/sample/
├── api-reference.md                   # サンプルドキュメント
├── faq.md                             # サンプルドキュメント
└── product-guide.md                   # サンプルドキュメント
```

---

## 修正方針

### Option 1: `agent.py` を修正して既存インフラを使用

```python
# agent.py (修正案)
from src.presentation.entrypoint.agent_factory import create_agent, AgentConfig
from src.infrastructure.config.di_container import get_container

# DI コンテナ取得
container = get_container()

# RAG対応エージェント作成
agent_wrapper = create_agent(
    container=container,
    config=AgentConfig(model_id=MODEL_ID),
    tenant_id="default",
)

@app.entrypoint
async def invoke(payload: dict[str, Any]) -> dict[str, Any]:
    prompt = payload.get("prompt", "")
    session_id = payload.get("session_id", "default-session")
    user_id = payload.get("user_id", "default-user")
    
    # RAG統合版の呼び出し
    result = await agent_wrapper.invoke(
        prompt=prompt,
        session_id=session_id,
        user_id=user_id,
    )
    
    return {
        "response": result["content"],
        "sources": result.get("rag_chunks_used", 0),
        "session_id": session_id,
    }
```

### Option 2: Strands Agent に直接 RAG Tool を追加

```python
from strands import Agent, tool
from src.presentation.tools.knowledge_tool import create_knowledge_tool

# RAG ツールを作成
search_kb = create_knowledge_tool(
    vector_client=s3vector_client,
    tenant_id="default",
)

# ツール付きエージェント
agent = Agent(
    model=MODEL_ID,
    system_prompt=SYSTEM_PROMPT,
    tools=[tool(search_kb)],  # RAG検索ツールを追加
)
```

---

## 必要なアクション

1. **Knowledge Base の確認**
   - `docs/sample/` がインジェスト済みか確認
   - Knowledge Base ID の取得

2. **環境変数の設定**
   - `KNOWLEDGE_BASE_ID` を AgentCore Runtime に設定

3. **`agent.py` の修正**
   - RAG 統合コードを追加

4. **デプロイ**
   - 修正版を AgentCore Runtime にデプロイ

---

## 関連リソース

- [Bedrock Knowledge Bases](https://docs.aws.amazon.com/bedrock/latest/userguide/knowledge-base.html)
- [AgentCore Runtime](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/)
- [Strands Agents](https://strandsagents.com/docs/)

