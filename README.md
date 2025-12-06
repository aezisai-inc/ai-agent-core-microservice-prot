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
│       └── 001-use-agentcore.md
│
├── backend/                   # Python Backend (Clean Architecture)
│   ├── src/
│   │   ├── domain/           # ドメイン層
│   │   ├── application/      # アプリケーション層 (CQRS)
│   │   ├── infrastructure/   # インフラストラクチャ層
│   │   └── presentation/     # プレゼンテーション層
│   └── tests/                # TDD テスト
│
├── frontend/                  # Next.js Frontend (FSD + Atomic Design)
│   └── src/
│       ├── app/              # Next.js App Router
│       ├── entities/         # FSD entities
│       ├── features/         # FSD features
│       ├── widgets/          # FSD widgets
│       └── shared/           # FSD shared (Atomic Design)
│           └── ui/
│               ├── atoms/    # Atomic Design: Atoms
│               ├── molecules/ # Atomic Design: Molecules
│               └── organisms/ # Atomic Design: Organisms
│
├── infrastructure/           # AWS CDK
│   ├── bin/
│   └── lib/
│
└── .github/
    └── workflows/
        └── ci.yml           # CI/CD パイプライン
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

## 🏗️ アーキテクチャ

### Backend (Python)

```
┌─────────────────────────────────────────────────────────────┐
│                    Presentation Layer                        │
│  Lambda Handlers | API Controllers                          │
├─────────────────────────────────────────────────────────────┤
│                    Application Layer                         │
│  Commands | Queries | Event Handlers (CQRS)                 │
├─────────────────────────────────────────────────────────────┤
│                      Domain Layer                            │
│  Entities | Value Objects | Domain Services | Domain Events │
├─────────────────────────────────────────────────────────────┤
│                   Infrastructure Layer                       │
│  Repositories | Event Store | External Services             │
└─────────────────────────────────────────────────────────────┘
```

### Frontend (Next.js)

```
┌─────────────────────────────────────────────────────────────┐
│                          App                                 │
├─────────────────────────────────────────────────────────────┤
│                        Widgets                               │
├─────────────────────────────────────────────────────────────┤
│                        Features                              │
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

### Backend

```bash
cd backend
uv sync --all-extras
uv run pytest
```

### Frontend

```bash
cd frontend
npm install
npm run dev
```

### Infrastructure

```bash
cd infrastructure
npm install
npm run synth
npm run deploy
```

## 📊 技術スタック

### Backend
- Python 3.11
- Pydantic 2.x (Validation & Settings)
- AWS Lambda Powertools
- Structlog (Structured Logging)
- Boto3 / Aioboto3 (AWS SDK)
- Pytest (Testing)

### Frontend
- Next.js 15
- React 19
- TypeScript 5.6
- TanStack Query
- Zustand (State Management)
- Tailwind CSS
- Framer Motion (Animations)

### Infrastructure
- AWS CDK 2.x
- Amazon Bedrock AgentCore
- S3Vector (Knowledge Bases)
- DynamoDB (Event Store)
- API Gateway
- Lambda
- Cognito

## 🔐 主要機能

- **Agentic RAG**: 質問に対して関連ドキュメントを検索し、コンテキストを付与して回答
- **マルチテナント**: Cognito統合によるテナント分離
- **会話履歴**: AgentCore Memoryによるセッション管理
- **イベントソーシング**: DynamoDBによるイベント永続化
- **CQRS**: コマンドとクエリの分離
- **リアルタイム分析**: BigQuery連携によるログ分析

## 📈 期待される成果

| メトリクス | Before | After | 改善率 |
|-----------|--------|-------|--------|
| 月額コスト | $XXX | $XXX | **-52%** |
| 平均レスポンス | 2.3秒 | 0.8秒 | **3.8倍** |
| コールドスタート | 3-5秒 | <0.5秒 | **6-10倍** |
| 運用工数 | 100% | 40% | **-60%** |

## 📝 開発ガイド

### コマンド

```bash
# Backend (uv)
cd backend
uv sync --all-extras          # Install dependencies
uv run pytest                 # Run tests
uv run pytest --cov          # Run tests with coverage
uv run ruff check src tests  # Lint
uv run ruff format src tests # Format
uv run mypy src              # Type check

# Frontend
cd frontend
npm run dev              # Development server
npm run build            # Production build
npm run test             # Run tests
npm run lint             # Lint

# Infrastructure
cd infrastructure
npm run synth            # Synthesize CDK
npm run deploy           # Deploy
npm run diff             # Show changes
```

### コーディング規約

- **Python**: Black, Ruff, MyPy
- **TypeScript**: ESLint, Prettier
- **Git**: Conventional Commits

## 📚 参考資料

- [Bedrock AgentCore Documentation](https://docs.aws.amazon.com/bedrock/)
- [S3Vector GA Announcement](https://aws.amazon.com/)
- [Strands Agents + AgentCore Integration](https://strandsagents.com/)
- [Feature-Sliced Design](https://feature-sliced.design/)
- [Atomic Design](https://atomicdesign.bradfrost.com/)

## 📄 ライセンス

MIT License

