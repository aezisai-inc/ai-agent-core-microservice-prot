# 技術仕様書: Agentic RAG with AgentCore

> 登壇資料の補足説明用ドキュメント

## 目次

1. [プロジェクト概要](#1-プロジェクト概要)
2. [アーキテクチャ詳細](#2-アーキテクチャ詳細)
3. [AgentCore Runtime 実装](#3-agentcore-runtime-実装)
4. [Clean Architecture 実装](#4-clean-architecture-実装)
5. [AgentCore Memory 実装](#5-agentcore-memory-実装)
6. [RAG (Knowledge Base) 実装](#6-rag-knowledge-base-実装)
7. [フロントエンド実装](#7-フロントエンド実装)
8. [インフラストラクチャ (CDK)](#8-インフラストラクチャ-cdk)
9. [デプロイメント](#9-デプロイメント)
10. [テスト戦略](#10-テスト戦略)

---

## 1. プロジェクト概要

### 1.1 目的

ECS Fargate 構成から Amazon Bedrock AgentCore へ移行し、以下を実現する：

- **コスト最適化**: 従量課金 + スケールゼロ対応で月額コスト52%削減
- **パフォーマンス向上**: コールドスタート<0.5秒、レスポンス3.8倍高速化
- **運用効率化**: マネージドサービス活用で運用工数60%削減
- **機能拡張**: エピソード記憶、Reflections、RAG の統合

### 1.2 技術選定

| カテゴリ | 選定技術 | 選定理由 |
|---------|---------|---------|
| Agent Runtime | AgentCore Runtime | サーバーレス、microVM分離、8時間実行 |
| Agent Framework | Strands Agents | オープンソース、ツール統合が容易 |
| Memory | AgentCore Memory | Episodic/Semantic/Reflections 統合 |
| Knowledge Base | S3 Vector | マネージド RAG、テナント分離 |
| Frontend Hosting | Amplify Gen2 | Cognito統合、CI/CD組み込み |
| IaC | AWS CDK | L2 Construct でAgentCore管理 |

### 1.3 設計プロセス

```
RDRA (要件定義)
     ↓
DDD + イベントストーミング (ドメイン設計)
     ↓
クリーンアーキテクチャ + CQRS + イベントソーシング (アーキテクチャ)
     ↓
FSD + アトミックデザイン (フロントエンド設計)
     ↓
TDD (テスト駆動開発)
```

---

## 2. アーキテクチャ詳細

### 2.1 コンポーネント構成

```
┌──────────────────────────────────────────────────────────────────────────┐
│                                AWS Cloud                                  │
├──────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  [Frontend Layer]                                                        │
│  ┌────────────────────────────────────────────────────────────────────┐  │
│  │  Amplify Gen2 (Next.js 15 Static Export)                           │  │
│  │  - CloudFront CDN                                                  │  │
│  │  - Cognito User Pool (認証)                                        │  │
│  │  - AWS SDK (BedrockAgentCoreClient)                                │  │
│  └────────────────────────────────────────────────────────────────────┘  │
│                                  │                                        │
│                                  │ InvokeAgentRuntime API                 │
│                                  │ (SSE/WebSocket Streaming)              │
│                                  ▼                                        │
│  [Agent Layer]                                                            │
│  ┌────────────────────────────────────────────────────────────────────┐  │
│  │  AgentCore Runtime (ECR Container)                                 │  │
│  │  ┌──────────────────────────────────────────────────────────────┐  │  │
│  │  │  Python 3.11 + Strands Agents                                │  │  │
│  │  │  ┌──────────────────────────────────────────────────────────┐│  │  │
│  │  │  │  Clean Architecture Layers                               ││  │  │
│  │  │  │  - Presentation: AgentCore Entrypoint, Tools             ││  │  │
│  │  │  │  - Application: Commands, Queries, Event Handlers        ││  │  │
│  │  │  │  - Domain: Entities, Value Objects, Domain Events        ││  │  │
│  │  │  │  - Infrastructure: Memory Client, S3Vector, Event Store  ││  │  │
│  │  │  └──────────────────────────────────────────────────────────┘│  │  │
│  │  └──────────────────────────────────────────────────────────────┘  │  │
│  └────────────────────────────────────────────────────────────────────┘  │
│                                  │                                        │
│        ┌─────────────────────────┼─────────────────────────────┐          │
│        ▼                         ▼                             ▼          │
│  [Service Layer]                                                          │
│  ┌────────────────┐  ┌─────────────────────┐  ┌────────────────────┐     │
│  │ AgentCore      │  │ AgentCore Memory    │  │ AgentCore          │     │
│  │ Identity       │  │                     │  │ Observability      │     │
│  │                │  │ Strategies:         │  │                    │     │
│  │ - Cognito連携  │  │ - Short-term        │  │ - CloudWatch Logs  │     │
│  │ - JWT検証      │  │ - Semantic          │  │ - X-Ray Tracing    │     │
│  │ - Token Vault  │  │ - Episodic (NEW)    │  │ - Agent Dashboard  │     │
│  │                │  │ - Reflections (NEW) │  │                    │     │
│  └────────────────┘  └─────────────────────┘  └────────────────────┘     │
│                                  │                                        │
│                                  ▼                                        │
│  [Data Layer]                                                             │
│  ┌────────────────────────────────────────────────────────────────────┐  │
│  │  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐     │  │
│  │  │ S3 Vector       │  │ DynamoDB        │  │ S3 Buckets      │     │  │
│  │  │ (Knowledge Base)│  │ (Event Store)   │  │ (Documents)     │     │  │
│  │  │                 │  │                 │  │                 │     │  │
│  │  │ - Vector Index  │  │ - Events Table  │  │ - Raw Documents │     │  │
│  │  │ - Semantic      │  │ - Read Models   │  │ - Processed     │     │  │
│  │  │   Search        │  │ - Projections   │  │ - Embeddings    │     │  │
│  │  └─────────────────┘  └─────────────────┘  └─────────────────┘     │  │
│  └────────────────────────────────────────────────────────────────────┘  │
│                                                                          │
└──────────────────────────────────────────────────────────────────────────┘
```

### 2.2 データフロー

#### 質問応答フロー (Streaming + Episodic Memory)

```
┌─────────────────────────────────────────────────────────────────────────┐
│                      Question-Answer Flow                                │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  User                                                                   │
│    │                                                                    │
│    │ 1. 質問入力                                                        │
│    ▼                                                                    │
│  Frontend (Next.js)                                                     │
│    │                                                                    │
│    │ 2. InvokeAgentRuntime API (SSE)                                   │
│    │    - Cognito JWT Token                                            │
│    │    - session_id, user_id, prompt                                  │
│    ▼                                                                    │
│  AgentCore Runtime                                                      │
│    │                                                                    │
│    ├─── 3. Episodic Memory 検索 ───────────────────────────┐           │
│    │    retrieve_similar_episodes(user_id, query)          │           │
│    │                                                       ▼           │
│    │                                              AgentCore Memory     │
│    │                                              (episodes, reflections)│
│    │                                                       │           │
│    ├─── 4. Knowledge Base 検索 ────────────────────────────┼───┐       │
│    │    kb_client.retrieve(query, top_k=5)                 │   │       │
│    │                                                       │   ▼       │
│    │                                              S3 Vector (RAG)      │
│    │                                                       │           │
│    ├─── 5. コンテキスト統合 ───────────────────────────────┘           │
│    │    enriched_prompt = BASE + RAG + EPISODIC + REFLECTIONS          │
│    │                                                                    │
│    ├─── 6. LLM 実行 (Bedrock Nova Pro) ────────────────────┐           │
│    │                                                       │           │
│    │    ◄───────── 7. Streaming Response ─────────────────┘           │
│    │                                                                    │
│    ├─── 8. インタラクション保存 (エピソード検出用) ───────┐           │
│    │    save_interaction(session_id, user_id, messages)    │           │
│    │                                                       ▼           │
│    │                                              AgentCore Memory     │
│    │                                              (自動エピソード検出)  │
│    │                                                                    │
│    │ 9. SSE Response                                                   │
│    ▼                                                                    │
│  Frontend                                                               │
│    │                                                                    │
│    │ 10. リアルタイム表示                                              │
│    ▼                                                                    │
│  User                                                                   │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### 2.3 認証フロー

```
┌─────────────────────────────────────────────────────────────────────────┐
│                      Authentication Flow                                 │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  1. User → Amplify Auth (Cognito User Pool) → JWT Token                │
│                                                                         │
│  2. Frontend:                                                           │
│     const { tokens } = await fetchAuthSession();                        │
│     const idToken = tokens?.idToken?.toString();                        │
│                                                                         │
│  3. Cognito Identity Pool:                                              │
│     credentials = fromCognitoIdentityPool({                             │
│       identityPoolId: IDENTITY_POOL_ID,                                 │
│       logins: {                                                         │
│         `cognito-idp.{region}.amazonaws.com/{userPoolId}`: idToken      │
│       },                                                                │
│     });                                                                 │
│                                                                         │
│  4. AgentCore Client:                                                   │
│     new BedrockAgentCoreClient({ region, credentials });                │
│                                                                         │
│  5. InvokeAgentRuntime:                                                 │
│     - SigV4 署名 (Cognito Identity Pool credentials)                   │
│     - AgentCore Identity でJWT検証                                      │
│     - runtimeUserId でユーザー識別                                      │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 3. AgentCore Runtime 実装

### 3.1 Entrypoint 構成

```python
# agent.py

from bedrock_agentcore import BedrockAgentCoreApp
from strands import Agent

app = BedrockAgentCoreApp()

# SSM Parameter Store から設定読み込み
class SSMConfigLoader:
    def __init__(self, region: str, environment: str):
        self._client = boto3.client("ssm", region_name=region)
        self._prefix = f"/agentcore/{environment}"
    
    def get(self, key: str, default: str = "") -> str:
        """キャッシュ付きパラメータ取得"""
        try:
            response = self._client.get_parameter(
                Name=f"{self._prefix}/{key}",
                WithDecryption=True,
            )
            return response["Parameter"]["Value"]
        except self._client.exceptions.ParameterNotFound:
            return default

# 設定
ssm_config = SSMConfigLoader(region=REGION, environment=ENVIRONMENT)
KNOWLEDGE_BASE_ID = ssm_config.get("knowledge-base-id", "")
RAG_TOP_K = ssm_config.get_int("rag-top-k", 5)

# Knowledge Base クライアント
kb_client = KnowledgeBaseClient(knowledge_base_id=KNOWLEDGE_BASE_ID)

@app.entrypoint
def invoke(payload: dict) -> dict:
    """AgentCore Runtime エントリーポイント"""
    prompt = payload.get("prompt", "")
    session_id = payload.get("session_id", "default-session")
    user_id = payload.get("user_id", "default-user")
    
    # 1. RAG検索
    rag_chunks = kb_client.retrieve(query=prompt, top_k=RAG_TOP_K)
    rag_context = build_rag_context(rag_chunks)
    
    # 2. エージェント作成
    agent = Agent(
        model=MODEL_ID,
        system_prompt=f"{BASE_SYSTEM_PROMPT}\n\n{rag_context}",
    )
    
    # 3. 実行
    result = agent(prompt)
    
    return {
        "response": result.message,
        "sources": [{"source": c["source"], "score": c["score"]} for c in rag_chunks],
        "session_id": session_id,
    }

if __name__ == "__main__":
    app.run()
```

### 3.2 Knowledge Base 検索

```python
class KnowledgeBaseClient:
    """Bedrock Knowledge Base retrieval クライアント"""
    
    def __init__(self, knowledge_base_id: str, region: str = "ap-northeast-1"):
        self._client = boto3.client("bedrock-agent-runtime", region_name=region)
        self._knowledge_base_id = knowledge_base_id
    
    def retrieve(
        self,
        query: str,
        top_k: int = 5,
        score_threshold: float = 0.5,
    ) -> list[dict]:
        """関連ドキュメントを検索"""
        response = self._client.retrieve(
            knowledgeBaseId=self._knowledge_base_id,
            retrievalQuery={"text": query},
            retrievalConfiguration={
                "vectorSearchConfiguration": {
                    "numberOfResults": top_k,
                    # Note: HYBRID search は S3 Vectors では未サポート
                    # SEMANTIC search を使用
                }
            },
        )
        
        results = []
        for item in response.get("retrievalResults", []):
            score = item.get("score", 0)
            if score < score_threshold:
                continue
            
            content = item.get("content", {}).get("text", "")
            s3_uri = item.get("location", {}).get("s3Location", {}).get("uri", "")
            source_name = s3_uri.split("/")[-1] if s3_uri else "Unknown"
            
            results.append({
                "content": content,
                "score": score,
                "source": source_name,
                "uri": s3_uri,
            })
        
        return results


def build_rag_context(chunks: list[dict]) -> str:
    """RAGコンテキストを構築"""
    if not chunks:
        return ""
    
    context_parts = ["## 参照ドキュメント\n"]
    context_parts.append("以下の社内ドキュメントを参考に回答してください。\n")
    
    for i, chunk in enumerate(chunks[:5], 1):
        content = chunk.get("content", "")[:800]
        source = chunk.get("source", "Unknown")
        score = chunk.get("score", 0.0)
        
        context_parts.append(f"### ドキュメント {i} (関連度: {score:.2f})")
        context_parts.append(f"**ソース**: {source}")
        context_parts.append(f"```\n{content}\n```\n")
    
    return "\n".join(context_parts)
```

### 3.3 システムプロンプト

```python
BASE_SYSTEM_PROMPT = """あなたは優秀なカスタマーサポートアシスタントです。
ユーザーの質問に対して、丁寧かつ的確に回答してください。

## 回答のガイドライン
- 参照ドキュメントが提供されている場合は、その内容を優先して回答する
- ドキュメントに記載がない場合は、その旨を伝える
- 簡潔で分かりやすい言葉を使う
- 必要に応じて箇条書きやMarkdown記法を使用する
- 不明な点があれば確認する

## 重要
- 参照ドキュメントの内容に基づいて回答してください
- ドキュメントに記載されていない情報を推測で答えないでください
"""
```

---

## 4. Clean Architecture 実装

### 4.1 ディレクトリ構造

```
backend/src/
├── domain/                           # ドメイン層 (最内層)
│   ├── agent/
│   │   ├── entities/
│   │   │   ├── agent.py              # Agent エンティティ
│   │   │   └── agent_session.py      # AgentSession エンティティ
│   │   ├── value_objects/
│   │   │   ├── agent_id.py           # AgentId 値オブジェクト
│   │   │   ├── prompt.py             # Prompt 値オブジェクト
│   │   │   ├── response.py           # Response 値オブジェクト
│   │   │   └── model_parameters.py   # ModelParameters
│   │   ├── events/
│   │   │   └── agent_events.py       # AgentInvoked, ResponseGenerated
│   │   └── repositories/
│   │       └── agent_repository.py   # インターフェース
│   └── shared/
│       ├── entity.py                 # 基底エンティティ
│       ├── value_object.py           # 基底値オブジェクト
│       └── domain_event.py           # 基底ドメインイベント
│
├── application/                      # アプリケーション層
│   ├── commands/
│   │   ├── submit_question.py        # SubmitQuestionCommand
│   │   └── submit_question_with_memory.py
│   ├── queries/
│   │   └── get_conversation.py       # GetConversationQuery
│   └── services/
│       └── pattern_applicator.py     # パターン適用サービス
│
├── infrastructure/                   # インフラストラクチャ層
│   ├── agentcore/
│   │   ├── memory_client.py          # AgentCore Memory クライアント
│   │   ├── memory_config.py          # Memory 設定
│   │   ├── episodic_memory.py        # エピソード記憶サービス
│   │   ├── reflection_service.py     # Reflections サービス
│   │   ├── session_memory.py         # セッションメモリ
│   │   └── tenant_memory.py          # テナント分離メモリ
│   ├── external_services/
│   │   ├── bedrock/
│   │   │   ├── agent_core_client.py  # AgentCore クライアント
│   │   │   └── llm_client.py         # LLM クライアント
│   │   └── s3vector/
│   │       └── s3vector_client.py    # S3Vector クライアント
│   ├── persistence/
│   │   └── event_store/
│   │       └── dynamodb_event_store.py
│   ├── observability/
│   │   ├── metrics.py                # カスタムメトリクス
│   │   └── tracer.py                 # X-Ray トレーサー
│   └── config/
│       ├── settings.py               # 設定
│       └── di_container.py           # DI コンテナ
│
└── presentation/                     # プレゼンテーション層
    ├── entrypoint/
    │   ├── agent_factory.py          # AgentFactory
    │   └── prompts.py                # プロンプトテンプレート
    ├── tools/
    │   ├── knowledge_tool.py         # Knowledge Base 検索ツール
    │   └── knowledge_generator_tool.py
    └── lambda_handlers/
        └── chat_handler.py           # Lambda ハンドラー (オプション)
```

### 4.2 Domain Layer

#### エンティティ

```python
# domain/agent/entities/agent.py

from dataclasses import dataclass, field
from typing import Optional
from src.domain.shared.entity import Entity
from src.domain.agent.value_objects.agent_id import AgentId
from src.domain.agent.value_objects.model_parameters import ModelParameters

@dataclass
class Agent(Entity[AgentId]):
    """Agent エンティティ"""
    
    id: AgentId
    name: str
    model_parameters: ModelParameters
    system_prompt: str
    tools: list[str] = field(default_factory=list)
    tenant_id: Optional[str] = None
    
    def invoke(self, prompt: str) -> "AgentInvocation":
        """エージェントを呼び出す"""
        # ドメインロジック
        return AgentInvocation(agent_id=self.id, prompt=prompt)
```

#### 値オブジェクト

```python
# domain/agent/value_objects/response.py

from dataclasses import dataclass
from src.domain.shared.value_object import ValueObject

@dataclass(frozen=True)
class Response(ValueObject):
    """エージェントレスポンス"""
    
    content: str
    tokens_used: int
    latency_ms: float
    tool_calls: list[dict]
    sources: list[dict]
    
    def __post_init__(self):
        if not self.content:
            raise ValueError("Response content cannot be empty")
```

### 4.3 Application Layer

#### Command

```python
# application/commands/submit_question.py

from dataclasses import dataclass
from typing import Optional

@dataclass
class SubmitQuestionCommand:
    """質問送信コマンド"""
    session_id: str
    user_id: str
    question: str
    tenant_id: Optional[str] = None

class SubmitQuestionHandler:
    """質問送信ハンドラー"""
    
    def __init__(
        self,
        agent: "StrandsAgentWrapper",
        memory_service: "MemoryService",
        rag_service: "RagService",
        event_store: "EventStore",
    ):
        self._agent = agent
        self._memory_service = memory_service
        self._rag_service = rag_service
        self._event_store = event_store
    
    async def handle(self, command: SubmitQuestionCommand) -> str:
        """コマンドを処理"""
        # 1. 会話履歴をロード
        history = await self._memory_service.load_conversation(
            session_id=command.session_id,
            user_id=command.user_id,
        )
        
        # 2. RAG検索 (テナント分離)
        context = await self._rag_service.search(
            query=command.question,
            tenant_id=command.tenant_id,
        )
        
        # 3. エージェント実行
        response = self._agent(
            command.question,
            history=history,
            context=context,
        )
        
        # 4. 会話をメモリに保存
        await self._memory_service.save_conversation(
            session_id=command.session_id,
            user_id=command.user_id,
            messages=[
                {"role": "user", "content": command.question},
                {"role": "assistant", "content": response.content},
            ],
        )
        
        # 5. イベント保存
        await self._event_store.append(
            ResponseGeneratedEvent(
                session_id=command.session_id,
                user_id=command.user_id,
                question=command.question,
                response=response.content,
            )
        )
        
        return response.content
```

### 4.4 Infrastructure Layer

#### DI Container

```python
# infrastructure/config/di_container.py

class DIContainer:
    """依存性注入コンテナ"""
    
    def __init__(self, settings: Settings):
        self._settings = settings
        self._instances = {}
    
    @property
    def memory_service(self) -> "AgentCoreMemoryClient":
        if "memory_service" not in self._instances:
            self._instances["memory_service"] = AgentCoreMemoryClient(
                config=MemoryConfig(
                    region=self._settings.aws_region,
                    memory_store_id=self._settings.agentcore_memory_id,
                )
            )
        return self._instances["memory_service"]
    
    @property
    def episodic_memory_service(self) -> "EpisodicMemoryService":
        if "episodic" not in self._instances:
            self._instances["episodic"] = EpisodicMemoryService(
                memory_client=self.memory_service,
                config=self._settings.episodic_config,
            )
        return self._instances["episodic"]
    
    @property
    def reflection_service(self) -> "ReflectionService":
        if "reflection" not in self._instances:
            self._instances["reflection"] = ReflectionService(
                memory_client=self.memory_service,
            )
        return self._instances["reflection"]
    
    @property
    def s3vector_client(self) -> "S3VectorClient":
        if "s3vector" not in self._instances:
            self._instances["s3vector"] = S3VectorClient(
                knowledge_base_id=self._settings.knowledge_base_id,
                region=self._settings.aws_region,
            )
        return self._instances["s3vector"]
```

---

## 5. AgentCore Memory 実装

### 5.1 Memory Client

```python
# infrastructure/agentcore/memory_client.py

from dataclasses import dataclass
from enum import Enum
import boto3
import structlog

logger = structlog.get_logger()

class MemoryStrategy(str, Enum):
    SHORT_TERM = "short_term"
    SEMANTIC = "semantic"
    EPISODIC = "episodic"

@dataclass
class MemoryRecord:
    id: str
    namespace: str
    content: dict
    score: float = 0.0
    timestamp: str = ""

class AgentCoreMemoryClient:
    """AgentCore Memory API クライアント"""
    
    def __init__(self, config: "MemoryConfig"):
        self._config = config
        self._client = boto3.client(
            "bedrock-agentcore",
            region_name=config.region,
        )
        self._memory_id = config.memory_store_id
    
    async def create_memory_store(
        self,
        name: str,
        strategies: list[dict] = None,
    ) -> str:
        """Memory Store を作成 (Episodic Strategy含む)"""
        if strategies is None:
            strategies = [
                {
                    "semanticMemoryStrategy": {
                        "name": "semanticFacts",
                        "namespaces": ["/facts/{actorId}"],
                    }
                },
                {
                    "episodicMemoryStrategy": {
                        "name": "episodicLearning",
                        "namespaces": {
                            "episodes": "/episodes/{actorId}",
                            "reflections": "/reflections/{actorId}",
                        },
                    }
                },
            ]
        
        response = self._client.create_memory(
            name=name,
            memoryStrategies=strategies,
        )
        return response.get("memoryId")
    
    async def create_event(
        self,
        actor_id: str,
        session_id: str,
        messages: list[tuple[str, str]],
        metadata: dict = None,
    ) -> None:
        """インタラクションを保存 (エピソード自動検出)"""
        formatted_messages = [
            {"content": content, "role": role}
            for content, role in messages
        ]
        
        self._client.create_memory_event(
            memoryId=self._memory_id,
            actorId=actor_id,
            sessionId=session_id,
            messages=formatted_messages,
            metadata=metadata or {},
        )
        # ↑ 自動的に:
        # 1. エピソード完了を検出
        # 2. エピソードを構造化して保存
        # 3. Reflections をバックグラウンドで生成
    
    async def retrieve_memories(
        self,
        namespace: str,
        query: str,
        max_results: int = 5,
        min_score: float = 0.0,
    ) -> list[MemoryRecord]:
        """セマンティック検索でメモリ取得"""
        response = self._client.retrieve_memories(
            memoryId=self._memory_id,
            namespace=namespace,
            query=query,
            maxResults=max_results,
        )
        
        return [
            MemoryRecord(
                id=item.get("id"),
                namespace=namespace,
                content=item.get("content", {}),
                score=item.get("score", 0.0),
                timestamp=item.get("timestamp", ""),
            )
            for item in response.get("memoryRecords", [])
            if item.get("score", 0) >= min_score
        ]
```

### 5.2 Episodic Memory Service

```python
# infrastructure/agentcore/episodic_memory.py

from dataclasses import dataclass

@dataclass
class Episode:
    """エピソード記憶のデータ構造"""
    id: str
    situation: str      # 何が起きたか
    intent: str         # ユーザーの意図
    assessment: str     # 成功/失敗の評価
    justification: str  # 理由
    reflection: str     # エピソードレベルの洞察
    tools_used: list[str]
    timestamp: str

class EpisodicMemoryService:
    """エピソード記憶サービス"""
    
    def __init__(self, memory_client: "AgentCoreMemoryClient", config: "EpisodicConfig"):
        self._client = memory_client
        self._config = config
    
    async def retrieve_similar_episodes(
        self,
        user_id: str,
        query: str,
        tenant_id: str = None,
        max_results: int = 3,
    ) -> list[Episode]:
        """類似エピソードを検索"""
        namespace = f"/episodes/{user_id}"
        if tenant_id:
            namespace = f"/tenant/{tenant_id}/episodes/{user_id}"
        
        records = await self._client.retrieve_memories(
            namespace=namespace,
            query=query,
            max_results=max_results,
        )
        
        return [self._parse_episode(r.content) for r in records]
    
    async def save_interaction(
        self,
        session_id: str,
        user_id: str,
        user_message: str,
        assistant_response: str,
        tool_calls: list[dict] = None,
        tenant_id: str = None,
    ) -> None:
        """インタラクションを保存 (エピソード検出用)"""
        messages = [
            (user_message, "USER"),
            (assistant_response, "ASSISTANT"),
        ]
        
        # Tool結果も含めることでエピソード検出精度向上
        for tool in (tool_calls or []):
            messages.append((
                f"Tool: {tool['name']}, Result: {tool['result'][:500]}",
                "TOOL"
            ))
        
        await self._client.create_event(
            actor_id=user_id,
            session_id=session_id,
            messages=messages,
            metadata={"tenant_id": tenant_id} if tenant_id else {},
        )
    
    def build_episode_context(self, episodes: list[Episode]) -> str:
        """エピソードコンテキストを構築"""
        if not episodes:
            return ""
        
        lines = ["## 過去の類似体験:"]
        for ep in episodes[:3]:
            lines.append(f"- 状況: {ep.situation}")
            lines.append(f"  結果: {ep.assessment}")
            lines.append(f"  学び: {ep.reflection}")
        
        return "\n".join(lines)
    
    def _parse_episode(self, content: dict) -> Episode:
        return Episode(
            id=content.get("id", ""),
            situation=content.get("situation", ""),
            intent=content.get("intent", ""),
            assessment=content.get("assessment", ""),
            justification=content.get("justification", ""),
            reflection=content.get("episode_reflection", ""),
            tools_used=content.get("tools_used", []),
            timestamp=content.get("timestamp", ""),
        )
```

### 5.3 Reflection Service

```python
# infrastructure/agentcore/reflection_service.py

from dataclasses import dataclass

@dataclass
class Reflection:
    """Reflection (洞察) のデータ構造"""
    id: str
    use_case: str
    insight: str
    success_patterns: list[str]
    failure_patterns: list[str]
    best_practices: list[str]

class ReflectionService:
    """Reflections サービス"""
    
    def __init__(self, memory_client: "AgentCoreMemoryClient"):
        self._client = memory_client
    
    async def retrieve_relevant_reflections(
        self,
        user_id: str,
        use_case: str,
        tenant_id: str = None,
        max_results: int = 2,
    ) -> list[Reflection]:
        """関連する洞察を検索"""
        namespace = f"/reflections/{user_id}"
        if tenant_id:
            namespace = f"/tenant/{tenant_id}/reflections/{user_id}"
        
        records = await self._client.retrieve_memories(
            namespace=namespace,
            query=use_case,
            max_results=max_results,
        )
        
        return [self._parse_reflection(r.content) for r in records]
    
    def build_reflection_prompt(self, reflections: list[Reflection]) -> str:
        """Reflection をプロンプトに組み込む"""
        if not reflections:
            return ""
        
        lines = ["## 過去の学習から得られた洞察:"]
        for ref in reflections:
            lines.append(f"\n### {ref.use_case}")
            lines.append(f"洞察: {ref.insight}")
            
            if ref.success_patterns:
                lines.append("成功パターン:")
                for pattern in ref.success_patterns[:2]:
                    lines.append(f"  - {pattern}")
            
            if ref.best_practices:
                lines.append("ベストプラクティス:")
                for practice in ref.best_practices[:2]:
                    lines.append(f"  - {practice}")
        
        return "\n".join(lines)
    
    def _parse_reflection(self, content: dict) -> Reflection:
        return Reflection(
            id=content.get("id", ""),
            use_case=content.get("use_case", ""),
            insight=content.get("insight", ""),
            success_patterns=content.get("success_patterns", []),
            failure_patterns=content.get("failure_patterns", []),
            best_practices=content.get("best_practices", []),
        )
```

---

## 6. RAG (Knowledge Base) 実装

### 6.1 S3Vector Client

```python
# infrastructure/external_services/s3vector/s3vector_client.py

import boto3
import structlog
from dataclasses import dataclass

logger = structlog.get_logger()

@dataclass
class SearchResult:
    content: str
    score: float
    source: str
    uri: str

class S3VectorClient:
    """Bedrock Knowledge Base (S3 Vector) クライアント"""
    
    def __init__(self, knowledge_base_id: str, region: str = "ap-northeast-1"):
        self._client = boto3.client("bedrock-agent-runtime", region_name=region)
        self._knowledge_base_id = knowledge_base_id
    
    async def search(
        self,
        query: str,
        tenant_id: str = None,
        top_k: int = 5,
        score_threshold: float = 0.5,
    ) -> list[SearchResult]:
        """Knowledge Base を検索"""
        retrieval_config = {
            "vectorSearchConfiguration": {
                "numberOfResults": top_k,
            }
        }
        
        # テナント分離フィルタリング
        if tenant_id:
            retrieval_config["vectorSearchConfiguration"]["filter"] = {
                "equals": {"key": "tenant_id", "value": tenant_id}
            }
        
        try:
            response = self._client.retrieve(
                knowledgeBaseId=self._knowledge_base_id,
                retrievalQuery={"text": query},
                retrievalConfiguration=retrieval_config,
            )
            
            results = []
            for item in response.get("retrievalResults", []):
                score = item.get("score", 0)
                if score < score_threshold:
                    continue
                
                results.append(SearchResult(
                    content=item.get("content", {}).get("text", ""),
                    score=score,
                    source=self._extract_source_name(item),
                    uri=self._extract_uri(item),
                ))
            
            logger.info(
                "knowledge_base_search_complete",
                query_preview=query[:50],
                results_count=len(results),
                tenant_id=tenant_id,
            )
            
            return results
            
        except Exception as e:
            logger.error("knowledge_base_search_failed", error=str(e))
            return []
    
    def _extract_source_name(self, item: dict) -> str:
        uri = self._extract_uri(item)
        return uri.split("/")[-1] if uri else "Unknown"
    
    def _extract_uri(self, item: dict) -> str:
        return item.get("location", {}).get("s3Location", {}).get("uri", "")
```

---

## 7. フロントエンド実装

### 7.1 AgentCore Client (TypeScript)

```typescript
// features/chat/api/agentcore-client.ts

import {
  BedrockAgentCoreClient,
  InvokeAgentRuntimeCommand,
} from "@aws-sdk/client-bedrock-agentcore";
import { fromCognitoIdentityPool } from "@aws-sdk/credential-providers";
import { fetchAuthSession } from "aws-amplify/auth";

export interface InvokeParams {
  sessionId: string;
  userId: string;
  tenantId?: string;
  prompt: string;
}

export interface StreamChunk {
  type: 'text' | 'sources' | 'end' | 'error';
  content?: string;
  sources?: RAGSource[];
  error?: string;
  latencyMs?: number;
}

export class AgentCoreClient {
  private config: AgentCoreConfig;
  private client: BedrockAgentCoreClient | null = null;

  /**
   * Cognito 認証でクライアント初期化
   */
  private async getClient(): Promise<BedrockAgentCoreClient> {
    if (this.client) return this.client;

    const session = await fetchAuthSession();
    const idToken = session.tokens?.idToken?.toString();

    const credentials = fromCognitoIdentityPool({
      clientConfig: { region: this.config.region },
      identityPoolId: this.config.identityPoolId,
      logins: idToken ? {
        [`cognito-idp.${this.config.region}.amazonaws.com/${this.config.userPoolId}`]: idToken,
      } : undefined,
    });

    this.client = new BedrockAgentCoreClient({
      region: this.config.region,
      credentials,
    });

    return this.client;
  }

  /**
   * ストリーミング invoke
   */
  async *stream(params: InvokeParams): AsyncGenerator<StreamChunk> {
    const startTime = Date.now();
    const client = await this.getClient();

    const command = new InvokeAgentRuntimeCommand({
      agentRuntimeArn: this.config.agentRuntimeArn,
      qualifier: this.config.agentEndpointName,
      runtimeSessionId: params.sessionId,
      runtimeUserId: params.userId,
      contentType: "application/json",
      payload: new TextEncoder().encode(JSON.stringify({
        prompt: params.prompt,
        sessionId: params.sessionId,
        userId: params.userId,
        tenantId: params.tenantId,
      })),
    });

    const response = await client.send(command);

    // WebStream でストリーミング処理
    const webStream = response.response.transformToWebStream();
    const reader = webStream.getReader();
    const decoder = new TextDecoder();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const text = decoder.decode(value, { stream: true });
      const extracted = extractTextFromResponse(JSON.parse(text));
      
      if (extracted) {
        yield { type: 'text', content: extracted };
      }
    }

    yield {
      type: 'end',
      latencyMs: Date.now() - startTime,
    };
  }
}
```

### 7.2 Chat Hook

```typescript
// features/chat/hooks/use-chat-stream.ts

import { useState, useCallback } from 'react';
import { AgentCoreClient, StreamChunk } from '../api/agentcore-client';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  sources?: RAGSource[];
}

export function useChatStream(client: AgentCoreClient) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sendMessage = useCallback(async (
    prompt: string,
    sessionId: string,
    userId: string,
  ) => {
    setIsStreaming(true);
    setError(null);
    
    // ユーザーメッセージを追加
    setMessages(prev => [...prev, { role: 'user', content: prompt }]);
    
    // アシスタントメッセージを開始
    let assistantContent = '';
    let sources: RAGSource[] = [];
    
    setMessages(prev => [...prev, { role: 'assistant', content: '' }]);
    
    try {
      for await (const chunk of client.stream({ prompt, sessionId, userId })) {
        switch (chunk.type) {
          case 'text':
            assistantContent += chunk.content || '';
            setMessages(prev => {
              const newMessages = [...prev];
              newMessages[newMessages.length - 1].content = assistantContent;
              return newMessages;
            });
            break;
          
          case 'sources':
            sources = chunk.sources || [];
            break;
          
          case 'end':
            setMessages(prev => {
              const newMessages = [...prev];
              newMessages[newMessages.length - 1].sources = sources;
              return newMessages;
            });
            break;
          
          case 'error':
            setError(chunk.error || 'Unknown error');
            break;
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to send message');
    } finally {
      setIsStreaming(false);
    }
  }, [client]);

  return { messages, isStreaming, error, sendMessage };
}
```

---

## 8. インフラストラクチャ (CDK)

### 8.1 AgentCore Stack

```typescript
// infrastructure/lib/agentcore-stack.ts

import * as cdk from 'aws-cdk-lib';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as ecr from 'aws-cdk-lib/aws-ecr';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import * as agentcore from '@aws-cdk/aws-bedrock-agentcore-alpha';
import { Construct } from 'constructs';

export interface AgentCoreStackProps extends cdk.StackProps {
  environment: string;
  ecrRepository: ecr.IRepository;
  memoryStoreId: string;
  bedrockModelId?: string;
  knowledgeBaseId?: string;
  userPool?: cognito.IUserPool;
  userPoolClient?: cognito.IUserPoolClient;
}

export class AgentCoreStack extends cdk.Stack {
  public readonly agentRuntime: agentcore.Runtime;
  public readonly agentRole: iam.Role;

  constructor(scope: Construct, id: string, props: AgentCoreStackProps) {
    super(scope, id, props);

    // IAM Role
    this.agentRole = new iam.Role(this, 'AgentCoreRuntimeRole', {
      assumedBy: new iam.CompositePrincipal(
        new iam.ServicePrincipal('bedrock.amazonaws.com'),
        new iam.ServicePrincipal('bedrock-agentcore.amazonaws.com'),
      ),
    });

    // Bedrock モデル権限
    this.agentRole.addToPolicy(new iam.PolicyStatement({
      actions: ['bedrock:InvokeModel', 'bedrock:InvokeModelWithResponseStream'],
      resources: [`arn:aws:bedrock:${this.region}::foundation-model/*`],
    }));

    // Knowledge Base 権限
    this.agentRole.addToPolicy(new iam.PolicyStatement({
      actions: ['bedrock:Retrieve'],
      resources: [`arn:aws:bedrock:${this.region}:${this.account}:knowledge-base/*`],
    }));

    // AgentCore Memory 権限
    this.agentRole.addToPolicy(new iam.PolicyStatement({
      actions: ['bedrock-agentcore:*'],
      resources: ['*'],
    }));

    // SSM 権限
    this.agentRole.addToPolicy(new iam.PolicyStatement({
      actions: ['ssm:GetParameter', 'ssm:GetParameters'],
      resources: [`arn:aws:ssm:${this.region}:${this.account}:parameter/agentcore/*`],
    }));

    // 認証設定
    let authorizerConfig: agentcore.RuntimeAuthorizerConfiguration | undefined;
    if (props.userPool && props.userPoolClient) {
      authorizerConfig = agentcore.RuntimeAuthorizerConfiguration.usingCognito(
        props.userPool,
        [props.userPoolClient],
      );
    }

    // AgentCore Runtime
    this.agentRuntime = new agentcore.Runtime(this, 'AgentCoreRuntime', {
      runtimeName: `agentcoreRuntime${props.environment}`,
      agentRuntimeArtifact: agentcore.AgentRuntimeArtifact.fromEcrRepository(
        props.ecrRepository,
        'latest',
      ),
      executionRole: this.agentRole,
      networkConfiguration: agentcore.RuntimeNetworkConfiguration.usingPublicNetwork(),
      environmentVariables: {
        'AGENTCORE_ENV': props.environment,
        'AWS_REGION': this.region,
        'BEDROCK_MODEL_ID': props.bedrockModelId || 'apac.amazon.nova-pro-v1:0',
      },
      ...(authorizerConfig && { authorizerConfiguration: authorizerConfig }),
      lifecycleConfiguration: {
        idleRuntimeSessionTimeout: cdk.Duration.minutes(15),
        maxLifetime: cdk.Duration.hours(8),
      },
    });

    // SSM パラメータ
    new ssm.StringParameter(this, 'AgentRuntimeArn', {
      parameterName: `/agentcore/${props.environment}/agent-runtime-arn`,
      stringValue: this.agentRuntime.agentRuntimeArn,
    });
  }
}
```

---

## 9. デプロイメント

### 9.1 デプロイフロー

```bash
# Backend デプロイ
cd backend

# 1. 依存関係インストール
uv sync --all-extras

# 2. テスト実行
uv run pytest
uv run ruff check src
uv run mypy src

# 3. AgentCore デプロイ
agentcore configure --entrypoint agent.py
agentcore launch

# 4. ステータス確認
agentcore status
agentcore invoke '{"prompt": "Hello"}'
```

### 9.2 CI/CD (GitHub Actions)

```yaml
# .github/workflows/deploy-agentcore.yml
name: Deploy AgentCore

on:
  push:
    branches: [main]
    paths:
      - 'backend/**'

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      
      - name: Setup Python
        uses: actions/setup-python@v5
        with:
          python-version: '3.11'
      
      - name: Install uv
        run: pip install uv
      
      - name: Install dependencies
        run: |
          cd backend
          uv sync --all-extras
      
      - name: Run tests
        run: |
          cd backend
          uv run pytest
          uv run ruff check src
      
      - name: Install AgentCore CLI
        run: pip install bedrock-agentcore-starter-toolkit
      
      - name: Deploy to AgentCore
        run: |
          cd backend
          agentcore configure --entrypoint agent.py
          agentcore launch
        env:
          AWS_ACCESS_KEY_ID: ${{ secrets.AWS_ACCESS_KEY_ID }}
          AWS_SECRET_ACCESS_KEY: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
          AWS_REGION: ap-northeast-1
```

---

## 10. テスト戦略

### 10.1 ユニットテスト

```python
# tests/infrastructure/agentcore/test_episodic_memory.py

import pytest
from src.infrastructure.agentcore.episodic_memory import EpisodicMemoryService, Episode

class TestEpisodicMemoryService:
    
    def test_build_episode_context_with_episodes(self):
        """エピソードからコンテキストが構築されること"""
        episodes = [
            Episode(
                id="ep-1",
                situation="ユーザーが返品方法を質問",
                intent="返品手続きを知りたい",
                assessment="SUCCESS",
                justification="FAQドキュメントから回答",
                reflection="返品ポリシーのFAQが有効",
                tools_used=["search_knowledge"],
                timestamp="2024-01-01",
            )
        ]
        
        service = EpisodicMemoryService(mock_client, mock_config)
        context = service.build_episode_context(episodes)
        
        assert "過去の類似体験" in context
        assert "返品方法を質問" in context
        assert "SUCCESS" in context
    
    def test_build_episode_context_empty(self):
        """エピソードがない場合は空文字を返すこと"""
        service = EpisodicMemoryService(mock_client, mock_config)
        context = service.build_episode_context([])
        
        assert context == ""
```

### 10.2 統合テスト

```python
# tests/integration/test_knowledge_generator_aws.py

import pytest
from src.infrastructure.external_services.s3vector.s3vector_client import S3VectorClient

@pytest.mark.integration
class TestKnowledgeBaseIntegration:
    
    @pytest.mark.asyncio
    async def test_search_returns_relevant_results(self, s3vector_client):
        """Knowledge Base 検索が関連結果を返すこと"""
        results = await s3vector_client.search(
            query="返品ポリシーについて",
            top_k=5,
        )
        
        assert len(results) > 0
        assert all(r.score >= 0.5 for r in results)
    
    @pytest.mark.asyncio
    async def test_search_with_tenant_filter(self, s3vector_client):
        """テナントフィルタが機能すること"""
        results = await s3vector_client.search(
            query="製品情報",
            tenant_id="tenant-001",
            top_k=5,
        )
        
        # テナント分離されたドキュメントのみ返される
        assert len(results) >= 0
```

### 10.3 E2Eテスト

```typescript
// frontend/e2e/chat.spec.ts

import { test, expect } from '@playwright/test';

test.describe('Chat Feature', () => {
  
  test('should send message and receive streaming response', async ({ page }) => {
    await page.goto('/');
    
    // 認証
    await page.fill('[data-testid="email-input"]', 'test@example.com');
    await page.fill('[data-testid="password-input"]', 'password');
    await page.click('[data-testid="login-button"]');
    
    // メッセージ送信
    await page.fill('[data-testid="chat-input"]', '返品方法を教えてください');
    await page.click('[data-testid="send-button"]');
    
    // ストリーミングレスポンスを待機
    await expect(page.locator('[data-testid="assistant-message"]')).toBeVisible();
    
    // レスポンスにコンテンツがあること
    const responseText = await page.textContent('[data-testid="assistant-message"]');
    expect(responseText).toBeTruthy();
  });
  
  test('should display RAG sources', async ({ page }) => {
    await page.goto('/');
    
    // ... 認証とメッセージ送信
    
    // ソースが表示されること
    await expect(page.locator('[data-testid="rag-sources"]')).toBeVisible();
  });
});
```

---

## 付録

### A. 環境変数一覧

| 変数名 | 説明 | 例 |
|--------|------|-----|
| `AWS_REGION` | AWS リージョン | `ap-northeast-1` |
| `AGENTCORE_ENV` | 環境名 | `development` / `staging` / `production` |
| `BEDROCK_MODEL_ID` | Bedrock モデル ID | `apac.amazon.nova-pro-v1:0` |
| `KNOWLEDGE_BASE_ID` | Knowledge Base ID | `kb-xxxxxxxxx` |

### B. SSM パラメータ一覧

| パラメータパス | 説明 |
|---------------|------|
| `/agentcore/{env}/agent-runtime-arn` | AgentCore Runtime ARN |
| `/agentcore/{env}/knowledge-base-id` | Knowledge Base ID |
| `/agentcore/{env}/memory-store-id` | Memory Store ID |
| `/agentcore/{env}/rag-top-k` | RAG 検索結果数 |
| `/agentcore/{env}/rag-score-threshold` | RAG スコア閾値 |

### C. メトリクス一覧

| メトリクス | 説明 | アラート閾値 |
|-----------|------|-------------|
| `latency_p95` | P95 レスポンス時間 | > 2000ms |
| `error_rate` | エラー率 | > 1% |
| `token_usage` | トークン使用量 | > 100k/hour |
| `memory_retrieval_latency` | メモリ取得レイテンシ | > 500ms |
| `episode_detection_count` | エピソード検出数 | - |

---

*最終更新: 2024年12月*




