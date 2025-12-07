# Agentic RAG with AgentCore + S3Vector

> ECSからAgentCoreへ：コスト50%削減とレスポンス3倍高速化の実践

## 📁 プロジェクト構造

```
登壇-AgentCore-S3Vector-StrandsAgents/
├── 00-requirements/           # RDRA要件定義
│   └── rdra/
│       ├── 01-business-context.md
│       ├── 02-requirements.md
│       └── 03-use-cases.md
│
├── 01-domain-design/          # DDD + イベントストーミング
│   ├── ddd/
│   │   ├── 01-bounded-contexts.md
│   │   └── 02-domain-models.md
│   └── event-storming/
│       └── 01-event-storming.md
│
├── 02-architecture/           # クリーンアーキテクチャ + CQRS + ES
│   ├── 01-clean-architecture.md
│   ├── 02-system-architecture.md
│   └── adr/
│       ├── 001-use-agentcore.md      # AgentCore採用ADR
│       ├── 002-use-amplify-gen2.md   # Amplify Gen2採用ADR
│       └── 003-use-strands-agents.md # Strands Agents採用ADR
│
├── backend/                   # Python Backend (AgentCore Runtime)
│   ├── src/
│   │   ├── domain/           # ドメイン層
│   │   ├── application/      # アプリケーション層 (CQRS)
│   │   ├── infrastructure/   # インフラストラクチャ層
│   │   └── presentation/     # プレゼンテーション層
│   ├── agent.py              # AgentCore エントリーポイント
│   └── tests/                # TDD テスト
│
├── frontend/                  # Next.js Frontend (Amplify Gen2)
│   ├── amplify/              # Amplify Gen2 設定
│   │   ├── auth/
│   │   │   └── resource.ts   # Cognito設定
│   │   └── backend.ts        # バックエンド統合
│   └── src/
│       ├── app/              # Next.js App Router
│       ├── features/         # FSD features
│       │   └── chat/         # チャット機能（Streaming対応）
│       ├── entities/         # FSD entities
│       ├── widgets/          # FSD widgets
│       └── shared/           # FSD shared (Atomic Design)
│
├── infrastructure/           # AWS CDK (Lambda Tools, DynamoDB等)
│   ├── bin/
│   └── lib/
│
└── .codepipeline/            # AWS CodePipeline 設定
    └── buildspec.yml
```

## 🎯 設計プロセス

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

## 🏗️ システムアーキテクチャ

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              AWS Cloud                                       │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │                    Frontend (Amplify Gen2)                             │  │
│  │  Next.js 15 → Static Export → CloudFront CDN                          │  │
│  │  - Cognito認証                                                         │  │
│  │  - SSE/WebSocket Streaming対応                                         │  │
│  └───────────────────────────────────────────────────────────────────────┘  │
│                                    │                                        │
│                                    │ 直接接続（SSE/WebSocket）               │
│                                    ▼                                        │
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │                    AgentCore Runtime (ECR)                             │  │
│  │  Python Agent (Strands Agents + Clean Architecture)                   │  │
│  │  - セッション分離（microVM）                                           │  │
│  │  - 双方向ストリーミング                                                │  │
│  │  - 最大8時間実行                                                       │  │
│  └───────────────────────────────────────────────────────────────────────┘  │
│                                    │                                        │
│          ┌─────────────────────────┼─────────────────────────┐              │
│          ▼                         ▼                         ▼              │
│  ┌───────────────┐      ┌───────────────────┐      ┌───────────────────┐   │
│  │AgentCore      │      │ AgentCore Memory  │      │ AgentCore         │   │
│  │Identity       │      │ - Short-term      │      │ Observability     │   │
│  │- Cognito連携  │      │ - Episodic (NEW)  │      │ - CloudWatch      │   │
│  │- Token Vault  │      │ - Semantic        │      │ - X-Ray           │   │
│  │               │      │ - Reflections     │      │                   │   │
│  └───────────────┘      └───────────────────┘      └───────────────────┘   │
│                                    │                                        │
│                                    ▼                                        │
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │                         Tool Layer                                     │  │
│  │  Lambda Functions | S3 Vector (Knowledge Base) | DynamoDB (Events)    │  │
│  └───────────────────────────────────────────────────────────────────────┘  │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Backend (AgentCore Runtime + Strands Agents)

```
┌─────────────────────────────────────────────────────────────┐
│                    Presentation Layer                        │
│  AgentCore Entrypoint | Strands @tool | Streaming Handlers  │
├─────────────────────────────────────────────────────────────┤
│                    Application Layer                         │
│  Commands | Queries | Event Handlers (CQRS)                 │
├─────────────────────────────────────────────────────────────┤
│                      Domain Layer                            │
│  Entities | Value Objects | Domain Services | Domain Events │
├─────────────────────────────────────────────────────────────┤
│                   Infrastructure Layer                       │
│  AgentCore Memory | S3Vector | Event Store | External APIs  │
└─────────────────────────────────────────────────────────────┘
```

### Frontend (Amplify Gen2)

```
┌─────────────────────────────────────────────────────────────┐
│                          App                                 │
├─────────────────────────────────────────────────────────────┤
│                        Widgets                               │
├─────────────────────────────────────────────────────────────┤
│                  Features (SSE Streaming)                    │
├─────────────────────────────────────────────────────────────┤
│                        Entities                              │
├─────────────────────────────────────────────────────────────┤
│                    Shared (Atomic Design)                    │
│  Atoms | Molecules | Organisms | Templates                  │
└─────────────────────────────────────────────────────────────┘
```

## 🚀 セットアップ

### 前提条件

- Python 3.11+
- Node.js 20+
- [uv](https://github.com/astral-sh/uv) (Python package manager)
- AWS CLI configured
- AWS CDK 2.x
- AgentCore CLI (`pip install bedrock-agentcore-starter-toolkit`)

### Backend (AgentCore Runtime)

```bash
cd backend

# 依存関係インストール
uv sync --all-extras

# ローカルテスト
agentcore configure --entrypoint agent.py
agentcore launch --local
agentcore invoke --local '{"prompt": "Hello"}'

# クラウドデプロイ
agentcore launch
agentcore status
agentcore invoke '{"prompt": "Hello"}'
```

### Frontend (Amplify Gen2)

```bash
cd frontend

# 依存関係インストール
npm install

# ローカル開発
npm run dev

# Amplify設定
npx ampx sandbox  # ローカルバックエンド起動

# ビルド
npm run build
```

### Infrastructure (CDK)

```bash
cd infrastructure
npm install
npm run synth
npm run deploy
```

## 📊 技術スタック

### Backend
- Python 3.11
- **Strands Agents** (Agent Framework)
- **bedrock-agentcore-sdk-python** (AgentCore SDK)
- Pydantic 2.x (Validation & Settings)
- Structlog (Structured Logging)
- Boto3 / Aioboto3 (AWS SDK)
- Pytest (Testing)

### Frontend
- Next.js 15
- React 19
- TypeScript 5.6
- **AWS Amplify Gen2** (Hosting + Auth)
- TanStack Query
- Zustand (State Management)
- Tailwind CSS
- Framer Motion (Animations)

### AWS Services
| サービス | 用途 |
|---------|------|
| **AgentCore Runtime** | エージェント実行環境 (ECR) |
| **AgentCore Memory** | 会話履歴・エピソード記憶・Reflections |
| **AgentCore Identity** | 認証・Token Vault |
| **AgentCore Observability** | CloudWatch/X-Ray統合 |
| **Amplify Gen2** | フロントエンドホスティング |
| **Cognito** | ユーザー認証 |
| **S3 Vector** | Knowledge Base |
| **DynamoDB** | Event Store |
| **Lambda** | Tool Functions |
| **CodePipeline** | CI/CD |

## 🔐 主要機能

- **Agentic RAG**: 質問に対して関連ドキュメントを検索し、コンテキストを付与して回答
- **ストリーミング応答**: SSE/WebSocket によるリアルタイムレスポンス
- **エピソード記憶** (NEW): 過去の体験から学習し、類似状況での意思決定を改善
- **Reflections** (NEW): 複数のエピソードからパターン・ベストプラクティスを抽出
- **マルチテナント**: Cognito + AgentCore Identity によるテナント分離
- **イベントソーシング**: DynamoDB による Event Store
- **CQRS**: コマンドとクエリの分離

## 📈 期待される成果

| メトリクス | Before (ECS) | After (AgentCore) | 改善率 |
|-----------|--------------|-------------------|--------|
| 月額コスト | $XXX | $XXX | **-52%** |
| 平均レスポンス | 2.3秒 | 0.8秒 | **3.8倍** |
| コールドスタート | 3-5秒 | <0.5秒 | **6-10倍** |
| 運用工数 | 100% | 40% | **-60%** |

## 📝 開発ガイド

### コマンド

```bash
# Backend (AgentCore)
cd backend
uv sync --all-extras              # Install dependencies
uv run pytest                     # Run tests
uv run pytest --cov               # Run tests with coverage
uv run ruff check src tests       # Lint
uv run ruff format src tests      # Format
uv run mypy src                   # Type check
agentcore launch --local          # Local agent test
agentcore launch                  # Deploy to AgentCore Runtime

# Frontend (Amplify Gen2)
cd frontend
npm run dev                       # Development server
npm run build                     # Production build (Static Export)
npm run test                      # Run tests
npm run lint                      # Lint
npx ampx sandbox                  # Local Amplify backend

# Infrastructure (CDK)
cd infrastructure
npm run synth                     # Synthesize CDK
npm run deploy                    # Deploy
npm run diff                      # Show changes
```

### コーディング規約

- **Python**: Black, Ruff, MyPy
- **TypeScript**: ESLint, Prettier
- **Git**: Conventional Commits

## 📐 ADR (Architecture Decision Records)

| ADR | タイトル | ステータス |
|-----|---------|-----------|
| [ADR-001](./02-architecture/adr/001-use-agentcore.md) | AgentCore採用 | Accepted |
| [ADR-002](./02-architecture/adr/002-use-amplify-gen2.md) | Amplify Gen2採用 | Accepted |
| [ADR-003](./02-architecture/adr/003-use-strands-agents.md) | Strands Agents採用 | Accepted |

## 📚 参考資料

- [Amazon Bedrock AgentCore Documentation](https://docs.aws.amazon.com/bedrock-agentcore/)
- [AgentCore SDK (Python)](https://github.com/aws/bedrock-agentcore-sdk-python)
- [AgentCore Samples](https://github.com/awslabs/amazon-bedrock-agentcore-samples/)
- [AgentCore Memory - Episodic Strategy](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/episodic-memory-strategy.html)
- [Strands Agents](https://strandsagents.com/)
- [AWS Amplify Gen2](https://docs.amplify.aws/gen2/)
- [S3Vector (Knowledge Bases)](https://docs.aws.amazon.com/bedrock/latest/userguide/knowledge-base.html)
- [Feature-Sliced Design](https://feature-sliced.design/)
- [Atomic Design](https://atomicdesign.bradfrost.com/)

## 📄 ライセンス

MIT License
