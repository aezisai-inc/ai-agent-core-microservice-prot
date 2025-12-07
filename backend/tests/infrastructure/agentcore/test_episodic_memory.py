"""Tests for Episodic Memory Service."""

import pytest
from unittest.mock import AsyncMock, MagicMock, patch

from src.infrastructure.agentcore.memory_config import MemoryConfig
from src.infrastructure.agentcore.memory_client import (
    AgentCoreMemoryClient,
    MemoryRecord,
)
from src.infrastructure.agentcore.episodic_memory import (
    Episode,
    EpisodicMemoryService,
)


@pytest.fixture
def memory_config() -> MemoryConfig:
    """Create a test memory configuration."""
    return MemoryConfig(
        memory_store_id="test-memory-store",
        region="us-east-1",
        max_episodes_per_query=3,
        episode_context_max_chars=2000,
        enable_tenant_isolation=True,
    )


@pytest.fixture
def mock_memory_client(memory_config: MemoryConfig) -> MagicMock:
    """Create a mock memory client."""
    client = MagicMock(spec=AgentCoreMemoryClient)
    client._config = memory_config
    return client


@pytest.fixture
def episodic_service(
    mock_memory_client: MagicMock,
    memory_config: MemoryConfig,
) -> EpisodicMemoryService:
    """Create an episodic memory service with mocked client."""
    return EpisodicMemoryService(
        memory_client=mock_memory_client,
        config=memory_config,
    )


class TestEpisodicMemoryService:
    """Tests for EpisodicMemoryService."""

    async def test_save_interaction_creates_event(
        self,
        episodic_service: EpisodicMemoryService,
        mock_memory_client: MagicMock,
    ) -> None:
        """Test that save_interaction creates a memory event."""
        mock_memory_client.create_event = AsyncMock()

        await episodic_service.save_interaction(
            session_id="sess-123",
            user_id="user-456",
            user_message="How do I reset my password?",
            assistant_response="To reset your password, go to settings...",
            tool_calls=[
                {"name": "search_knowledge", "result": "Found 3 documents"}
            ],
            tenant_id="tenant-789",
        )

        mock_memory_client.create_event.assert_called_once()
        call_args = mock_memory_client.create_event.call_args

        assert call_args.kwargs["actor_id"] == "user-456"
        assert call_args.kwargs["session_id"] == "sess-123"
        assert len(call_args.kwargs["messages"]) == 3  # USER, ASSISTANT, TOOL
        assert call_args.kwargs["metadata"]["tenant_id"] == "tenant-789"

    async def test_save_interaction_without_tools(
        self,
        episodic_service: EpisodicMemoryService,
        mock_memory_client: MagicMock,
    ) -> None:
        """Test save_interaction without tool calls."""
        mock_memory_client.create_event = AsyncMock()

        await episodic_service.save_interaction(
            session_id="sess-123",
            user_id="user-456",
            user_message="Hello",
            assistant_response="Hi there!",
        )

        call_args = mock_memory_client.create_event.call_args
        assert len(call_args.kwargs["messages"]) == 2  # USER, ASSISTANT only

    async def test_retrieve_similar_episodes(
        self,
        episodic_service: EpisodicMemoryService,
        mock_memory_client: MagicMock,
    ) -> None:
        """Test retrieving similar episodes."""
        mock_records = [
            MemoryRecord(
                id="ep-1",
                namespace="/episodes/user-456",
                content={
                    "situation": "User asked about password reset",
                    "intent": "Reset account password",
                    "assessment": "SUCCESS",
                    "justification": "Clear instructions provided",
                    "episode_reflection": "Password reset queries are common",
                    "tools_used": ["search_knowledge"],
                },
                score=0.95,
                timestamp="2024-01-01T00:00:00Z",
            ),
            MemoryRecord(
                id="ep-2",
                namespace="/episodes/user-456",
                content={
                    "situation": "User asked about account security",
                    "intent": "Improve account security",
                    "assessment": "SUCCESS",
                    "justification": "Security tips provided",
                    "episode_reflection": "Security concerns are related to passwords",
                    "tools_used": ["search_knowledge", "get_user_settings"],
                },
                score=0.85,
                timestamp="2024-01-02T00:00:00Z",
            ),
        ]
        mock_memory_client.retrieve_memories = AsyncMock(return_value=mock_records)

        episodes = await episodic_service.retrieve_similar_episodes(
            user_id="user-456",
            query="How do I reset my password?",
            tenant_id="tenant-789",
        )

        assert len(episodes) == 2
        assert episodes[0].id == "ep-1"
        assert episodes[0].situation == "User asked about password reset"
        assert episodes[0].assessment == "SUCCESS"
        assert "search_knowledge" in episodes[0].tools_used

    async def test_retrieve_episodes_with_tenant_isolation(
        self,
        episodic_service: EpisodicMemoryService,
        mock_memory_client: MagicMock,
    ) -> None:
        """Test that tenant isolation is applied to namespace."""
        mock_memory_client.retrieve_memories = AsyncMock(return_value=[])

        await episodic_service.retrieve_similar_episodes(
            user_id="user-456",
            query="test query",
            tenant_id="tenant-789",
        )

        call_args = mock_memory_client.retrieve_memories.call_args
        namespace = call_args.kwargs["namespace"]

        assert "/tenant/tenant-789" in namespace
        assert "/episodes/user-456" in namespace

    def test_build_episode_context(
        self,
        episodic_service: EpisodicMemoryService,
    ) -> None:
        """Test building context string from episodes."""
        episodes = [
            Episode(
                id="ep-1",
                situation="User asked about password reset",
                intent="Reset password",
                assessment="SUCCESS",
                justification="Clear instructions",
                reflection="Password resets are common",
                tools_used=["search_knowledge"],
            ),
            Episode(
                id="ep-2",
                situation="User asked about login issues",
                intent="Troubleshoot login",
                assessment="PARTIAL",
                justification="Needed more info",
                reflection="Login issues vary widely",
                tools_used=[],
            ),
        ]

        context = episodic_service.build_episode_context(episodes)

        assert "## Past Similar Experiences:" in context
        assert "User asked about password reset" in context
        assert "Reset password" in context
        assert "SUCCESS" in context
        assert "search_knowledge" in context
        assert "Experience 1" in context
        assert "Experience 2" in context

    def test_build_episode_context_empty(
        self,
        episodic_service: EpisodicMemoryService,
    ) -> None:
        """Test building context with no episodes returns empty string."""
        context = episodic_service.build_episode_context([])
        assert context == ""

    def test_build_episode_context_truncation(
        self,
        episodic_service: EpisodicMemoryService,
    ) -> None:
        """Test that context is truncated when too long."""
        # Create episode with very long content
        long_episode = Episode(
            id="ep-1",
            situation="A" * 3000,  # Very long situation
            intent="Test",
            assessment="SUCCESS",
            justification="Test",
            reflection="Test",
        )

        # Use small max_chars
        context = episodic_service.build_episode_context(
            [long_episode],
            max_chars=500,
        )

        assert len(context) <= 500
        assert context.endswith("...")


class TestEpisodeDataclass:
    """Tests for Episode dataclass."""

    def test_episode_creation(self) -> None:
        """Test creating an Episode."""
        episode = Episode(
            id="ep-123",
            situation="Test situation",
            intent="Test intent",
            assessment="SUCCESS",
            justification="Test justification",
            reflection="Test reflection",
            tools_used=["tool1", "tool2"],
            timestamp="2024-01-01T00:00:00Z",
        )

        assert episode.id == "ep-123"
        assert episode.situation == "Test situation"
        assert episode.assessment == "SUCCESS"
        assert len(episode.tools_used) == 2

    def test_episode_default_values(self) -> None:
        """Test Episode default values."""
        episode = Episode(
            id="ep-123",
            situation="Test",
            intent="Test",
            assessment="TEST",
            justification="Test",
            reflection="Test",
        )

        assert episode.tools_used == []
        assert episode.timestamp == ""
        assert episode.raw_data == {}
