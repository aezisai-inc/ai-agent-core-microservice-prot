# ADR-003: Strands Agents フレームワークの採用

## ステータス

Accepted (2024-12)

## コンテキスト

AgentCore Runtime 上で動作する AI エージェントの実装フレームワークを選定する必要がある。
フレームワークは以下の要件を満たす必要がある：

1. AgentCore Runtime との統合が容易
2. Tool定義がシンプル
3. ストリーミングレスポンス対応
4. Bedrock モデルとの統合
5. クリーンアーキテクチャとの親和性

## 決定

**Strands Agents** を AI エージェントフレームワークとして採用する。

## 理由

### Strands Agents を選択した理由

1. **AgentCore SDK とのネイティブ統合**
   - `bedrock-agentcore-sdk-python` との統合が設計時点で考慮されている
   - `@app.entrypoint` との組み合わせがシームレス

2. **シンプルな Tool 定義**
   - `@tool` デコレータによる宣言的な定義
   - Docstring からの自動スキーマ生成
   - 型ヒントによる入出力の型安全性

3. **ストリーミングのネイティブサポート**
   - `agent.stream_async()` でトークンごとのストリーミング
   - AgentCore Runtime の SSE/WebSocket と統合

4. **軽量で柔軟**
   - 最小限の依存関係
   - クリーンアーキテクチャのレイヤー構造と調和

### 代替案

| フレームワーク | 評価 | 却下理由 |
|--------------|------|---------|
| LangChain/LangGraph | ○ | 依存関係が重い、抽象化が複雑 |
| CrewAI | ○ | マルチエージェント特化、単一エージェントには過剰 |
| 自作フレームワーク | △ | 開発コスト高、メンテナンス負荷 |
| Bedrock Agents (マネージド) | △ | カスタマイズ性が低い |

## アーキテクチャ

### Strands Agents + AgentCore Runtime 構成

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    AgentCore Runtime (ECR Container)                         │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│   ┌─────────────────────────────────────────────────────────────────────┐   │
│   │                     agent.py (Entrypoint)                            │   │
│   │                                                                      │   │
│   │   from bedrock_agentcore import BedrockAgentCoreApp                 │   │
│   │   from strands import Agent, tool                                    │   │
│   │                                                                      │   │
│   │   app = BedrockAgentCoreApp()                                       │   │
│   │   agent = Agent(model="us.amazon.nova-pro-v1:0", tools=[...])       │   │
│   │                                                                      │   │
│   │   @app.entrypoint                                                   │   │
│   │   async def invoke(payload):                                        │   │
│   │       async for chunk in agent.stream_async(payload["prompt"]):     │   │
│   │           yield chunk                                               │   │
│   └─────────────────────────────────────────────────────────────────────┘   │
│                                         │                                   │
│                                         ▼                                   │
│   ┌─────────────────────────────────────────────────────────────────────┐   │
│   │                        Strands Agent                                 │   │
│   │                                                                      │   │
│   │   ┌─────────────┐  ┌─────────────┐  ┌─────────────┐                │   │
│   │   │   Tools     │  │   Memory    │  │   Model     │                │   │
│   │   │             │  │             │  │             │                │   │
│   │   │  @tool      │  │  AgentCore  │  │  Bedrock    │                │   │
│   │   │  decorator  │  │  Memory     │  │  Nova/      │                │   │
│   │   │             │  │  Client     │  │  Claude     │                │   │
│   │   └─────────────┘  └─────────────┘  └─────────────┘                │   │
│   └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

## 実装ガイド

### プロジェクト構成

```
backend/
├── agent.py                       # AgentCore エントリーポイント
├── src/
│   ├── domain/                    # ドメイン層（フレームワーク非依存）
│   ├── application/               # アプリケーション層（フレームワーク非依存）
│   ├── infrastructure/
│   │   └── agentcore/
│   │       └── memory_client.py   # AgentCore Memory 実装
│   └── presentation/
│       ├── entrypoint/
│       │   └── agent_factory.py   # Strands Agent 作成
│       └── tools/
│           ├── customer_tool.py   # @tool 定義
│           ├── order_tool.py
│           └── knowledge_tool.py
├── pyproject.toml
├── requirements.txt
└── Dockerfile
```

### Agent Factory 実装

```python
# src/presentation/entrypoint/agent_factory.py
from strands import Agent
from src.presentation.tools.customer_tool import get_customer_info
from src.presentation.tools.order_tool import search_orders
from src.presentation.tools.knowledge_tool import search_knowledge_base
from src.infrastructure.config.di_container import DIContainer

SYSTEM_PROMPT = """
あなたは優秀なカスタマーサポートアシスタントです。

利用可能なツール:
- get_customer_info: メールアドレスから顧客情報を取得
- search_orders: 顧客IDから注文履歴を検索
- search_knowledge_base: ナレッジベースから関連情報を検索

回答のガイドライン:
1. 必要な情報をツールで取得してから回答する
2. 丁寧で分かりやすい日本語で回答する
3. 不明点があれば確認する
4. 個人情報の取り扱いに注意する
"""

def create_agent(container: DIContainer) -> Agent:
    """
    Strands Agent を作成する
    
    Args:
        container: DIコンテナ（依存性注入用）
    
    Returns:
        設定済みの Strands Agent インスタンス
    """
    # ツール関数に依存性を注入
    tools = create_tools(container)
    
    agent = Agent(
        model="us.amazon.nova-pro-v1:0",  # または Claude
        system_prompt=SYSTEM_PROMPT,
        tools=tools,
        # 追加設定
        max_iterations=10,  # Tool呼び出しの最大回数
        temperature=0.7,
    )
    
    return agent

def create_tools(container: DIContainer) -> list:
    """ツール関数を作成（DIコンテナから依存性を注入）"""
    
    # クロージャでcontainerをキャプチャ
    @tool
    def get_customer_info(email: str) -> str:
        """
        顧客情報をメールアドレスから取得する
        
        Args:
            email: 顧客のメールアドレス
        
        Returns:
            顧客情報のJSON文字列
        """
        handler = container.get_customer_handler
        result = handler.handle(GetCustomerQuery(email=email))
        return result.to_json()
    
    @tool
    def search_orders(customer_id: str) -> str:
        """
        顧客の注文履歴を検索する
        
        Args:
            customer_id: 顧客ID
        
        Returns:
            注文情報のJSON文字列
        """
        handler = container.search_orders_handler
        result = handler.handle(SearchOrdersQuery(customer_id=customer_id))
        return result.to_json()
    
    @tool
    def search_knowledge_base(query: str) -> str:
        """
        ナレッジベースを検索する
        
        Args:
            query: 検索クエリ
        
        Returns:
            関連するドキュメントチャンクのJSON文字列
        """
        handler = container.search_knowledge_handler
        result = handler.handle(SearchKnowledgeQuery(query=query))
        return result.to_json()
    
    return [get_customer_info, search_orders, search_knowledge_base]
```

### AgentCore Entrypoint 実装

```python
# agent.py
from bedrock_agentcore import BedrockAgentCoreApp
from src.presentation.entrypoint.agent_factory import create_agent
from src.infrastructure.config.di_container import DIContainer
from src.infrastructure.config.settings import Settings

# 初期化
app = BedrockAgentCoreApp()
settings = Settings()
container = DIContainer(settings)
agent = create_agent(container)

@app.entrypoint
async def invoke(payload: dict):
    """
    AgentCore Runtime エントリーポイント
    
    SSE ストリーミングレスポンスを返す
    """
    prompt = payload.get("prompt", "")
    session_id = payload.get("session_id", "")
    user_id = payload.get("user_id", "")
    
    # エピソード記憶から過去の類似体験を取得
    memory_service = container.memory_service
    episodes = await memory_service.retrieve_relevant_episodes(
        user_id=user_id,
        query=prompt
    )
    
    # 会話履歴を取得
    history = await memory_service.load_conversation(
        session_id=session_id,
        user_id=user_id
    )
    
    # コンテキストを構築
    context = build_context(episodes, history)
    
    # ストリーミングレスポンス
    full_response = ""
    tool_results = []
    
    async for event in agent.stream_async(prompt, context=context):
        if hasattr(event, 'content'):
            full_response += event.content
            yield event.content
        elif hasattr(event, 'tool_call'):
            tool_results.append(event.tool_call)
    
    # インタラクションを保存（エピソード自動検出）
    await memory_service.save_interaction(
        session_id=session_id,
        user_id=user_id,
        messages=[
            {"role": "user", "content": prompt},
            {"role": "assistant", "content": full_response}
        ],
        tool_results=tool_results
    )

def build_context(episodes: list, history: list) -> str:
    """エピソードと履歴からコンテキストを構築"""
    parts = []
    
    if episodes:
        parts.append("## 過去の類似体験:")
        for ep in episodes[:3]:
            parts.append(f"- {ep.get('situation', '')}")
            parts.append(f"  結果: {ep.get('assessment', '')}")
    
    if history:
        parts.append("\n## 直近の会話:")
        for msg in history[-5:]:
            parts.append(f"- {msg['role']}: {msg['content'][:100]}...")
    
    return "\n".join(parts)

if __name__ == "__main__":
    app.run()
```

### Tool 実装パターン

```python
# src/presentation/tools/knowledge_tool.py
from strands import tool
from typing import Optional

@tool
def search_knowledge_base(
    query: str,
    tenant_id: Optional[str] = None,
    max_results: int = 5
) -> str:
    """
    ナレッジベースを検索して関連ドキュメントを取得する
    
    このツールは製品情報、FAQ、マニュアルなどの
    社内ドキュメントを検索します。
    
    Args:
        query: 検索クエリ（自然言語）
        tenant_id: テナントID（マルチテナント分離用、省略可）
        max_results: 最大取得件数（デフォルト5）
    
    Returns:
        関連するドキュメントチャンクのJSON文字列
        
        フォーマット:
        {
            "chunks": [
                {
                    "content": "ドキュメント内容...",
                    "source": "ファイル名",
                    "score": 0.95
                }
            ],
            "total": 5
        }
    
    Example:
        >>> search_knowledge_base("スマートフォンの充電器の仕様")
        '{"chunks": [{"content": "充電器の仕様: 入力100-240V...", ...}]}'
    """
    # 実際の実装では DIコンテナ経由で UseCase を呼び出す
    from src.infrastructure.config.di_container import get_container
    
    container = get_container()
    handler = container.search_knowledge_handler
    result = handler.handle(
        SearchKnowledgeQuery(
            query=query,
            tenant_id=tenant_id,
            max_results=max_results
        )
    )
    return result.to_json()
```

### Dockerfile

```dockerfile
# backend/Dockerfile
FROM python:3.11-slim

WORKDIR /app

# システム依存関係
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

# Python 依存関係
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# アプリケーションコード
COPY src/ ./src/
COPY agent.py .

# AgentCore Runtime 用エントリーポイント
CMD ["python", "agent.py"]
```

### requirements.txt

```
# Agent Framework
strands-agents>=0.1.0
strands-agents-tools>=0.1.0

# AgentCore SDK
bedrock-agentcore>=0.1.0
bedrock-agentcore-starter-toolkit>=0.1.0

# AWS SDK
boto3>=1.34.0
aioboto3>=12.0.0

# Validation & Settings
pydantic>=2.5.0
pydantic-settings>=2.1.0

# Logging
structlog>=23.2.0

# Testing
pytest>=7.4.0
pytest-asyncio>=0.21.0
pytest-cov>=4.1.0

# Linting & Formatting
ruff>=0.1.0
mypy>=1.7.0
```

## テスト戦略

### Tool のユニットテスト

```python
# tests/presentation/tools/test_knowledge_tool.py
import pytest
from unittest.mock import Mock, AsyncMock
from src.presentation.tools.knowledge_tool import search_knowledge_base

class TestSearchKnowledgeTool:
    @pytest.fixture
    def mock_container(self):
        container = Mock()
        container.search_knowledge_handler.handle.return_value = Mock(
            to_json=lambda: '{"chunks": [{"content": "test", "score": 0.9}]}'
        )
        return container
    
    def test_search_knowledge_base_returns_json(self, mock_container, monkeypatch):
        monkeypatch.setattr(
            "src.presentation.tools.knowledge_tool.get_container",
            lambda: mock_container
        )
        
        result = search_knowledge_base("test query")
        
        assert "chunks" in result
        assert mock_container.search_knowledge_handler.handle.called
```

### Agent の統合テスト

```python
# tests/integration/test_agent.py
import pytest
from strands import Agent
from src.presentation.entrypoint.agent_factory import create_agent

class TestAgentIntegration:
    @pytest.fixture
    def agent(self, mock_container):
        return create_agent(mock_container)
    
    @pytest.mark.asyncio
    async def test_agent_responds_to_prompt(self, agent):
        response = await agent.ainvoke("こんにちは")
        assert response is not None
        assert len(response.content) > 0
    
    @pytest.mark.asyncio
    async def test_agent_uses_tools_when_needed(self, agent):
        response = await agent.ainvoke(
            "顧客 test@example.com の注文履歴を教えて"
        )
        # Tool呼び出しが行われたことを確認
        assert any(
            call.tool_name == "get_customer_info"
            for call in response.tool_calls
        )
```

## 影響

### ポジティブ

- **開発効率向上**: `@tool` デコレータによる簡潔なTool定義
- **保守性向上**: クリーンアーキテクチャとの分離が明確
- **テスト容易性**: Tool関数の単体テストが容易
- **AgentCore統合**: 公式SDKとのシームレスな統合

### ネガティブ

- Strands Agents の学習コスト
- フレームワークへの依存（ただし置換は容易）
- 比較的新しいフレームワーク（ドキュメントが限定的）

### リスク軽減策

1. **抽象化レイヤー**: ドメイン層・アプリケーション層はフレームワーク非依存
2. **アダプターパターン**: Tool定義を Presentation 層に閉じ込め
3. **代替フレームワーク**: LangGraph 等への移行パスを確保

## 参照

- [Strands Agents Documentation](https://strandsagents.com/)
- [Strands Agents GitHub](https://github.com/strands-agents/strands-agents)
- [AgentCore + Strands Samples](https://github.com/awslabs/amazon-bedrock-agentcore-samples/)
- [AgentCore SDK Python](https://github.com/aws/bedrock-agentcore-sdk-python)
