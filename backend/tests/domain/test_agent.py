"""Tests for Agent domain entity."""

import pytest

from src.domain.agent import Agent, AgentId, Prompt
from src.domain.agent.entities import AgentConfig
from src.domain.agent.events import AgentInvoked, ResponseGenerated
from src.domain.agent.value_objects import Response


class TestAgentId:
    """Tests for AgentId value object."""

    def test_create_valid_agent_id(self):
        """Test creating a valid AgentId."""
        agent_id = AgentId(value="agent-123")
        assert agent_id.value == "agent-123"

    def test_create_empty_agent_id_raises_error(self):
        """Test that empty AgentId raises ValueError."""
        with pytest.raises(ValueError, match="AgentId cannot be empty"):
            AgentId(value="")

    def test_create_whitespace_agent_id_raises_error(self):
        """Test that whitespace-only AgentId raises ValueError."""
        with pytest.raises(ValueError, match="AgentId cannot be empty"):
            AgentId(value="   ")

    def test_generate_unique_agent_id(self):
        """Test generating unique AgentIds."""
        id1 = AgentId.generate()
        id2 = AgentId.generate()
        assert id1.value != id2.value
        assert id1.value.startswith("agent-")

    def test_agent_id_str(self):
        """Test AgentId string representation."""
        agent_id = AgentId(value="agent-123")
        assert str(agent_id) == "agent-123"


class TestPrompt:
    """Tests for Prompt value object."""

    def test_create_valid_prompt(self):
        """Test creating a valid Prompt."""
        prompt = Prompt(content="Hello, world!")
        assert prompt.content == "Hello, world!"

    def test_create_empty_prompt_raises_error(self):
        """Test that empty Prompt raises ValueError."""
        with pytest.raises(ValueError, match="Prompt content cannot be empty"):
            Prompt(content="")

    def test_prompt_token_estimate(self):
        """Test prompt token estimation."""
        prompt = Prompt(content="This is a test message")  # 22 chars
        assert prompt.token_estimate == 5  # 22 // 4


class TestAgent:
    """Tests for Agent entity."""

    def test_create_agent(self, mock_agent_config: AgentConfig):
        """Test creating an Agent using factory method."""
        agent = Agent.create(
            name="Test Agent",
            tenant_id="tenant-123",
            system_prompt="You are helpful.",
            description="A test agent",
        )

        assert agent.name == "Test Agent"
        assert agent.tenant_id == "tenant-123"
        assert agent.is_active is True
        assert agent.version == 0

    def test_agent_invoke_records_event(self, mock_agent: Agent, mock_prompt: Prompt):
        """Test that invoking an agent records an AgentInvoked event."""
        initial_version = mock_agent.version

        mock_agent.invoke(mock_prompt, "session-123", context="Some context")

        events = mock_agent.clear_domain_events()
        assert len(events) == 1
        assert isinstance(events[0], AgentInvoked)
        assert events[0].agent_id == str(mock_agent.id)
        assert events[0].session_id == "session-123"
        assert mock_agent.version == initial_version + 1

    def test_agent_record_response_records_event(self, mock_agent: Agent):
        """Test that recording a response creates a ResponseGenerated event."""
        response = Response(
            content="This is the response",
            tokens_used=100,
            model="claude-3",
            latency_ms=500,
            sources=[],
        )

        mock_agent.record_response("session-123", response)

        events = mock_agent.clear_domain_events()
        assert len(events) == 1
        assert isinstance(events[0], ResponseGenerated)
        assert events[0].tokens_used == 100
        assert events[0].latency_ms == 500

    def test_agent_deactivate(self, mock_agent: Agent):
        """Test deactivating an agent."""
        assert mock_agent.is_active is True

        mock_agent.deactivate()

        assert mock_agent.is_active is False

    def test_agent_activate(self, mock_agent: Agent):
        """Test activating an agent."""
        mock_agent.deactivate()
        assert mock_agent.is_active is False

        mock_agent.activate()

        assert mock_agent.is_active is True
