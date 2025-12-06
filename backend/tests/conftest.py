"""Pytest configuration and fixtures."""

from datetime import datetime
from unittest.mock import AsyncMock

import pytest

from src.domain.agent import Agent, AgentId, ModelParameters, Prompt
from src.domain.agent.entities import AgentConfig, RagConfig


@pytest.fixture
def mock_agent_id() -> AgentId:
    """Create a mock AgentId."""
    return AgentId(value="agent-test123")


@pytest.fixture
def mock_model_params() -> ModelParameters:
    """Create mock model parameters."""
    return ModelParameters(
        model_id="anthropic.claude-3-sonnet-20240229-v1:0",
        temperature=0.7,
        max_tokens=4096,
        top_p=0.9,
    )


@pytest.fixture
def mock_rag_config() -> RagConfig:
    """Create mock RAG config."""
    return RagConfig(
        id="rag-config",
        top_k=5,
        similarity_threshold=0.7,
        rerank_enabled=True,
        max_context_tokens=4000,
        created_at=datetime.utcnow(),
        updated_at=datetime.utcnow(),
    )


@pytest.fixture
def mock_agent_config(
    mock_model_params: ModelParameters, mock_rag_config: RagConfig
) -> AgentConfig:
    """Create mock agent config."""
    return AgentConfig(
        id="agent-config",
        system_prompt="You are a helpful AI assistant.",
        model_params=mock_model_params,
        rag_config=mock_rag_config,
        created_at=datetime.utcnow(),
        updated_at=datetime.utcnow(),
    )


@pytest.fixture
def mock_agent(mock_agent_id: AgentId, mock_agent_config: AgentConfig) -> Agent:
    """Create a mock Agent."""
    return Agent(
        id=mock_agent_id,
        name="Test Agent",
        description="A test agent",
        config=mock_agent_config,
        is_active=True,
        tenant_id="tenant-test",
        created_at=datetime.utcnow(),
        updated_at=datetime.utcnow(),
    )


@pytest.fixture
def mock_prompt() -> Prompt:
    """Create a mock Prompt."""
    return Prompt(content="What is the weather today?")


@pytest.fixture
def mock_vector_search() -> AsyncMock:
    """Create a mock vector search service."""
    mock = AsyncMock()
    mock.search.return_value = [
        {
            "content": "The weather today is sunny with a high of 75°F.",
            "score": 0.85,
            "source": "s3://documents/weather.pdf",
            "chunk_id": "chunk-001",
            "document_id": "doc-001",
        }
    ]
    return mock


@pytest.fixture
def mock_llm_service() -> AsyncMock:
    """Create a mock LLM service."""
    mock = AsyncMock()
    mock.generate.return_value = (
        "Based on the available information, the weather today is sunny with a high of 75°F.",
        150,
    )
    return mock


@pytest.fixture
def mock_event_store() -> AsyncMock:
    """Create a mock event store."""
    mock = AsyncMock()
    mock.append.return_value = None
    mock.get_events.return_value = []
    return mock
