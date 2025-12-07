"""Tests for Agent Factory."""

import pytest
from unittest.mock import AsyncMock, MagicMock

from src.presentation.entrypoint.agent_factory import (
    AgentConfig,
    AgentFactory,
    StrandsAgentWrapper,
    create_agent,
)
from src.infrastructure.agentcore.episodic_memory import Episode
from src.infrastructure.agentcore.reflection_service import Reflection


@pytest.fixture
def mock_episodic_service() -> MagicMock:
    """Create mock episodic memory service."""
    service = MagicMock()
    service.retrieve_similar_episodes = AsyncMock(return_value=[
        Episode(
            id="ep-1",
            situation="User asked about returns",
            intent="Return product",
            assessment="SUCCESS",
            justification="Clear instructions provided",
            reflection="Return queries are common",
        ),
    ])
    service.build_episode_context = MagicMock(
        return_value="## Past Experiences:\n- Return queries handled well"
    )
    service.save_interaction = AsyncMock()
    return service


@pytest.fixture
def mock_reflection_service() -> MagicMock:
    """Create mock reflection service."""
    service = MagicMock()
    service.retrieve_relevant_reflections = AsyncMock(return_value=[
        Reflection(
            id="ref-1",
            use_case="Product returns",
            insight="Clear steps improve satisfaction",
            success_patterns=["Numbered steps"],
            failure_patterns=[],
            best_practices=["Verify order first"],
        ),
    ])
    service.build_reflection_prompt = MagicMock(
        return_value="## Insights:\n- Clear steps work well"
    )
    return service


@pytest.fixture
def mock_container(
    mock_episodic_service: MagicMock,
    mock_reflection_service: MagicMock,
) -> MagicMock:
    """Create mock DI container."""
    container = MagicMock()
    container.episodic_memory_service = mock_episodic_service
    container.reflection_service = mock_reflection_service
    return container


class TestAgentConfig:
    """Tests for AgentConfig."""

    def test_default_values(self) -> None:
        """Test default configuration values."""
        config = AgentConfig()
        
        assert config.model_id == "us.amazon.nova-pro-v1:0"
        assert config.max_iterations == 10
        assert config.temperature == 0.7
        assert config.max_tokens == 4096
        assert config.tools == []

    def test_custom_values(self) -> None:
        """Test custom configuration values."""
        config = AgentConfig(
            model_id="anthropic.claude-3-sonnet",
            max_iterations=5,
            temperature=0.5,
        )
        
        assert config.model_id == "anthropic.claude-3-sonnet"
        assert config.max_iterations == 5
        assert config.temperature == 0.5


class TestAgentFactory:
    """Tests for AgentFactory."""

    def test_create_agent(self, mock_container: MagicMock) -> None:
        """Test creating an agent."""
        factory = AgentFactory(mock_container)
        agent = factory.create_agent()
        
        assert isinstance(agent, StrandsAgentWrapper)

    def test_create_agent_with_config(self, mock_container: MagicMock) -> None:
        """Test creating an agent with custom config."""
        factory = AgentFactory(mock_container)
        config = AgentConfig(model_id="custom-model")
        
        agent = factory.create_agent(config=config)
        
        assert agent._config.model_id == "custom-model"

    def test_create_agent_with_tenant(self, mock_container: MagicMock) -> None:
        """Test creating an agent with tenant ID."""
        factory = AgentFactory(mock_container)
        agent = factory.create_agent(tenant_id="tenant-123")
        
        assert isinstance(agent, StrandsAgentWrapper)


class TestStrandsAgentWrapper:
    """Tests for StrandsAgentWrapper."""

    @pytest.fixture
    def agent_wrapper(
        self,
        mock_episodic_service: MagicMock,
        mock_reflection_service: MagicMock,
    ) -> StrandsAgentWrapper:
        """Create agent wrapper for testing."""
        return StrandsAgentWrapper(
            config=AgentConfig(),
            tools=[],
            episodic_service=mock_episodic_service,
            reflection_service=mock_reflection_service,
        )

    async def test_invoke_retrieves_context(
        self,
        agent_wrapper: StrandsAgentWrapper,
        mock_episodic_service: MagicMock,
        mock_reflection_service: MagicMock,
    ) -> None:
        """Test that invoke retrieves episodic and reflection context."""
        result = await agent_wrapper.invoke(
            prompt="How do I return a product?",
            session_id="sess-123",
            user_id="user-456",
            tenant_id="tenant-789",
        )
        
        # Verify episodic service was called
        mock_episodic_service.retrieve_similar_episodes.assert_called_once_with(
            user_id="user-456",
            query="How do I return a product?",
            tenant_id="tenant-789",
        )
        
        # Verify reflection service was called
        mock_reflection_service.retrieve_relevant_reflections.assert_called_once_with(
            user_id="user-456",
            use_case="How do I return a product?",
            tenant_id="tenant-789",
        )
        
        # Verify result includes context usage info
        assert "episodes_used" in result
        assert "reflections_used" in result

    async def test_invoke_saves_interaction(
        self,
        agent_wrapper: StrandsAgentWrapper,
        mock_episodic_service: MagicMock,
    ) -> None:
        """Test that invoke saves interaction for episode detection."""
        await agent_wrapper.invoke(
            prompt="Test question",
            session_id="sess-123",
            user_id="user-456",
        )
        
        mock_episodic_service.save_interaction.assert_called_once()
        call_args = mock_episodic_service.save_interaction.call_args
        
        assert call_args.kwargs["session_id"] == "sess-123"
        assert call_args.kwargs["user_id"] == "user-456"
        assert call_args.kwargs["user_message"] == "Test question"

    async def test_stream_yields_chunks(
        self,
        agent_wrapper: StrandsAgentWrapper,
    ) -> None:
        """Test that stream yields response chunks."""
        chunks = []
        async for chunk in agent_wrapper.stream(
            prompt="Test question",
            session_id="sess-123",
            user_id="user-456",
        ):
            chunks.append(chunk)
        
        assert len(chunks) > 0
        assert all(isinstance(c, str) for c in chunks)

    async def test_stream_saves_interaction(
        self,
        agent_wrapper: StrandsAgentWrapper,
        mock_episodic_service: MagicMock,
    ) -> None:
        """Test that stream saves interaction after completion."""
        chunks = []
        async for chunk in agent_wrapper.stream(
            prompt="Test question",
            session_id="sess-123",
            user_id="user-456",
        ):
            chunks.append(chunk)
        
        # Interaction should be saved after streaming completes
        mock_episodic_service.save_interaction.assert_called_once()


class TestCreateAgentFunction:
    """Tests for create_agent convenience function."""

    def test_create_agent(self, mock_container: MagicMock) -> None:
        """Test creating agent via convenience function."""
        agent = create_agent(mock_container)
        
        assert isinstance(agent, StrandsAgentWrapper)

    def test_create_agent_with_options(self, mock_container: MagicMock) -> None:
        """Test creating agent with options."""
        config = AgentConfig(temperature=0.5)
        agent = create_agent(
            container=mock_container,
            config=config,
            tenant_id="tenant-123",
        )
        
        assert isinstance(agent, StrandsAgentWrapper)
        assert agent._config.temperature == 0.5
