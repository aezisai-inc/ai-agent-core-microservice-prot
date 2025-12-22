"""Tests for AgentCore Memory Client."""

import pytest
from unittest.mock import MagicMock, patch, AsyncMock

from src.infrastructure.agentcore.memory_config import MemoryConfig
from src.infrastructure.agentcore.memory_client import (
    AgentCoreMemoryClient,
    MemoryRecord,
    MemoryStrategy,
)


@pytest.fixture
def memory_config() -> MemoryConfig:
    """Create a test memory configuration."""
    return MemoryConfig(
        memory_store_id="test-memory-store",
        region="us-east-1",
    )


class TestMemoryStrategy:
    """Tests for MemoryStrategy enum."""

    def test_strategy_values(self) -> None:
        """Test MemoryStrategy enum values."""
        assert MemoryStrategy.SHORT_TERM.value == "short_term"
        assert MemoryStrategy.SEMANTIC.value == "semantic"
        assert MemoryStrategy.EPISODIC.value == "episodic"


class TestMemoryRecord:
    """Tests for MemoryRecord dataclass."""

    def test_memory_record_creation(self) -> None:
        """Test creating a MemoryRecord."""
        record = MemoryRecord(
            id="rec-123",
            namespace="/test/namespace",
            content={"key": "value"},
            score=0.95,
            timestamp="2024-01-01T00:00:00Z",
        )

        assert record.id == "rec-123"
        assert record.namespace == "/test/namespace"
        assert record.content["key"] == "value"
        assert record.score == 0.95

    def test_memory_record_defaults(self) -> None:
        """Test MemoryRecord default values."""
        record = MemoryRecord(
            id="rec-123",
            namespace="/test",
            content={},
        )

        assert record.score == 0.0
        assert record.timestamp == ""


class TestAgentCoreMemoryClient:
    """Tests for AgentCoreMemoryClient."""

    @patch("src.infrastructure.agentcore.memory_client.boto3.client")
    def test_client_initialization(
        self,
        mock_boto_client: MagicMock,
        memory_config: MemoryConfig,
    ) -> None:
        """Test client initialization."""
        client = AgentCoreMemoryClient(config=memory_config)

        mock_boto_client.assert_called_once_with(
            "bedrock-agentcore",
            region_name="us-east-1",
        )
        assert client.memory_id == "test-memory-store"

    @patch("src.infrastructure.agentcore.memory_client.boto3.client")
    def test_memory_id_property(
        self,
        mock_boto_client: MagicMock,
        memory_config: MemoryConfig,
    ) -> None:
        """Test memory_id property getter and setter."""
        client = AgentCoreMemoryClient(config=memory_config)

        assert client.memory_id == "test-memory-store"

        client.memory_id = "new-memory-store"
        assert client.memory_id == "new-memory-store"

    @patch("src.infrastructure.agentcore.memory_client.boto3.client")
    async def test_create_memory_store(
        self,
        mock_boto_client: MagicMock,
        memory_config: MemoryConfig,
    ) -> None:
        """Test creating a memory store."""
        mock_client_instance = MagicMock()
        mock_client_instance.create_memory.return_value = {
            "memoryId": "new-memory-123"
        }
        mock_boto_client.return_value = mock_client_instance

        client = AgentCoreMemoryClient(config=memory_config)
        memory_id = await client.create_memory_store(
            name="test-store",
            description="Test description",
        )

        assert memory_id == "new-memory-123"
        assert client.memory_id == "new-memory-123"
        mock_client_instance.create_memory.assert_called_once()

    @patch("src.infrastructure.agentcore.memory_client.boto3.client")
    async def test_create_event(
        self,
        mock_boto_client: MagicMock,
        memory_config: MemoryConfig,
    ) -> None:
        """Test creating a memory event."""
        mock_client_instance = MagicMock()
        mock_boto_client.return_value = mock_client_instance

        client = AgentCoreMemoryClient(config=memory_config)
        await client.create_event(
            actor_id="user-123",
            session_id="sess-456",
            messages=[
                ("Hello", "USER"),
                ("Hi there!", "ASSISTANT"),
            ],
        )

        mock_client_instance.create_memory_event.assert_called_once()
        call_args = mock_client_instance.create_memory_event.call_args

        assert call_args.kwargs["memoryId"] == "test-memory-store"
        assert call_args.kwargs["actorId"] == "user-123"
        assert call_args.kwargs["sessionId"] == "sess-456"
        assert len(call_args.kwargs["messages"]) == 2

    @patch("src.infrastructure.agentcore.memory_client.boto3.client")
    async def test_retrieve_memories(
        self,
        mock_boto_client: MagicMock,
        memory_config: MemoryConfig,
    ) -> None:
        """Test retrieving memories."""
        mock_client_instance = MagicMock()
        mock_client_instance.retrieve_memories.return_value = {
            "memoryRecords": [
                {
                    "id": "rec-1",
                    "content": {"key": "value"},
                    "score": 0.95,
                    "timestamp": "2024-01-01T00:00:00Z",
                },
                {
                    "id": "rec-2",
                    "content": {"key": "value2"},
                    "score": 0.80,
                    "timestamp": "2024-01-02T00:00:00Z",
                },
            ]
        }
        mock_boto_client.return_value = mock_client_instance

        client = AgentCoreMemoryClient(config=memory_config)
        records = await client.retrieve_memories(
            namespace="/test/namespace",
            query="test query",
            max_results=5,
        )

        assert len(records) == 2
        assert records[0].id == "rec-1"
        assert records[0].score == 0.95
        assert records[1].id == "rec-2"

    @patch("src.infrastructure.agentcore.memory_client.boto3.client")
    async def test_retrieve_memories_with_min_score(
        self,
        mock_boto_client: MagicMock,
        memory_config: MemoryConfig,
    ) -> None:
        """Test that min_score filters out low-score records."""
        mock_client_instance = MagicMock()
        mock_client_instance.retrieve_memories.return_value = {
            "memoryRecords": [
                {"id": "rec-1", "content": {}, "score": 0.95},
                {"id": "rec-2", "content": {}, "score": 0.30},  # Below threshold
            ]
        }
        mock_boto_client.return_value = mock_client_instance

        client = AgentCoreMemoryClient(config=memory_config)
        records = await client.retrieve_memories(
            namespace="/test",
            query="test",
            min_score=0.5,
        )

        assert len(records) == 1
        assert records[0].id == "rec-1"

    @patch("src.infrastructure.agentcore.memory_client.boto3.client")
    async def test_retrieve_memories_handles_error(
        self,
        mock_boto_client: MagicMock,
        memory_config: MemoryConfig,
    ) -> None:
        """Test that retrieve_memories handles errors gracefully."""
        mock_client_instance = MagicMock()
        mock_client_instance.retrieve_memories.side_effect = Exception("API Error")
        mock_boto_client.return_value = mock_client_instance

        client = AgentCoreMemoryClient(config=memory_config)
        records = await client.retrieve_memories(
            namespace="/test",
            query="test",
        )

        assert records == []

    @patch("src.infrastructure.agentcore.memory_client.boto3.client")
    async def test_get_session_messages(
        self,
        mock_boto_client: MagicMock,
        memory_config: MemoryConfig,
    ) -> None:
        """Test getting session messages."""
        mock_client_instance = MagicMock()
        mock_client_instance.get_session_messages.return_value = {
            "messages": [
                {"role": "USER", "content": "Hello"},
                {"role": "ASSISTANT", "content": "Hi!"},
            ]
        }
        mock_boto_client.return_value = mock_client_instance

        client = AgentCoreMemoryClient(config=memory_config)
        messages = await client.get_session_messages(
            actor_id="user-123",
            session_id="sess-456",
        )

        assert len(messages) == 2
        assert messages[0]["role"] == "USER"

    @patch("src.infrastructure.agentcore.memory_client.boto3.client")
    async def test_delete_session(
        self,
        mock_boto_client: MagicMock,
        memory_config: MemoryConfig,
    ) -> None:
        """Test deleting a session."""
        mock_client_instance = MagicMock()
        mock_boto_client.return_value = mock_client_instance

        client = AgentCoreMemoryClient(config=memory_config)
        result = await client.delete_session(
            actor_id="user-123",
            session_id="sess-456",
        )

        assert result is True
        mock_client_instance.delete_session.assert_called_once()

    @patch("src.infrastructure.agentcore.memory_client.boto3.client")
    async def test_health_check_success(
        self,
        mock_boto_client: MagicMock,
        memory_config: MemoryConfig,
    ) -> None:
        """Test health check when service is healthy."""
        mock_client_instance = MagicMock()
        mock_client_instance.get_memory.return_value = {"memoryId": "test"}
        mock_boto_client.return_value = mock_client_instance

        client = AgentCoreMemoryClient(config=memory_config)
        result = await client.health_check()

        assert result is True

    @patch("src.infrastructure.agentcore.memory_client.boto3.client")
    async def test_health_check_failure(
        self,
        mock_boto_client: MagicMock,
        memory_config: MemoryConfig,
    ) -> None:
        """Test health check when service is unhealthy."""
        mock_client_instance = MagicMock()
        mock_client_instance.get_memory.side_effect = Exception("Service unavailable")
        mock_boto_client.return_value = mock_client_instance

        client = AgentCoreMemoryClient(config=memory_config)
        result = await client.health_check()

        assert result is False
