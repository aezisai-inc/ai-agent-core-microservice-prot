# Agentic RAG Backend

Python backend for Agentic RAG with Clean Architecture, CQRS, and Event Sourcing.

## Prerequisites

- Python 3.11+
- [uv](https://github.com/astral-sh/uv) - Fast Python package installer and resolver

### Install uv

```bash
# macOS / Linux
curl -LsSf https://astral.sh/uv/install.sh | sh

# Or with Homebrew
brew install uv

# Or with pip
pip install uv
```

## Setup

```bash
# Create virtual environment and install dependencies
uv sync

# Or install with dev dependencies
uv sync --all-extras
```

## Development

```bash
# Run tests
uv run pytest

# Run tests with coverage
uv run pytest --cov

# Lint
uv run ruff check src tests

# Format
uv run ruff format src tests

# Type check
uv run mypy src

# Run all checks
uv run ruff check src tests && uv run ruff format --check src tests && uv run mypy src && uv run pytest
```

## Project Structure

```
backend/
├── src/
│   ├── domain/           # Domain Layer (Entities, Value Objects, Events)
│   ├── application/      # Application Layer (Commands, Queries - CQRS)
│   ├── infrastructure/   # Infrastructure Layer (Repositories, External Services)
│   └── presentation/     # Presentation Layer (Lambda Handlers, API)
├── tests/                # Unit and Integration Tests
├── pyproject.toml        # Project configuration
└── uv.lock               # Lock file (generated)
```

## Architecture

### Clean Architecture Layers

```
┌─────────────────────────────────────────────┐
│              Presentation                    │
│   Lambda Handlers | API Controllers          │
├─────────────────────────────────────────────┤
│              Application                     │
│   Commands | Queries | Event Handlers        │
├─────────────────────────────────────────────┤
│                Domain                        │
│   Entities | Value Objects | Domain Events   │
├─────────────────────────────────────────────┤
│             Infrastructure                   │
│   Repositories | Event Store | AWS Services  │
└─────────────────────────────────────────────┘
```

### CQRS Pattern

- **Commands**: Write operations (SubmitQuestion, UploadDocument)
- **Queries**: Read operations (GetConversation, SearchDocuments)

### Event Sourcing

- Domain events stored in DynamoDB
- Aggregate state reconstructed from events
- Projections for read models

## Environment Variables

```bash
APP_AWS_REGION=ap-northeast-1
APP_EVENT_STORE_TABLE=agentic-rag-events
APP_READ_MODEL_TABLE=agentic-rag-read-models
APP_KNOWLEDGE_BASE_ID=<your-knowledge-base-id>
APP_DEFAULT_MODEL_ID=anthropic.claude-3-sonnet-20240229-v1:0
```

## Testing

```bash
# Run all tests
uv run pytest

# Run specific test file
uv run pytest tests/domain/test_agent.py

# Run with verbose output
uv run pytest -v

# Run with coverage report
uv run pytest --cov --cov-report=html
```

