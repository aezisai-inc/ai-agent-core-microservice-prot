"""Tests for SessionMemoryService."""
import pytest
from unittest.mock import AsyncMock, MagicMock

from src.infrastructure.agentcore.session_memory import (
    Message,
    SessionContext,
    SessionMemoryService,
)
from src.infrastructure.agentcore.memory_config import MemoryConfig


class TestMessage:
    """Message dataclass tests."""

    def test_message_creation(self):
        """Test message creation with defaults."""
        msg = Message(role="user", content="Hello")
        assert msg.role == "user"
        assert msg.content == "Hello"
        assert msg.timestamp is not None
        assert msg.metadata == {}

    def test_message_with_metadata(self):
        """Test message with custom metadata."""
        msg = Message(
            role="assistant",
            content="Hi there",
            metadata={"model": "claude-3"}
        )
        assert msg.metadata["model"] == "claude-3"


class TestSessionContext:
    """SessionContext dataclass tests."""

    def test_session_context_creation(self):
        """Test session context creation."""
        ctx = SessionContext(session_id="sess-1", user_id="user-1")
        assert ctx.session_id == "sess-1"
        assert ctx.user_id == "user-1"
        assert ctx.messages == []
        assert ctx.message_count == 0

    def test_add_message(self):
        """Test adding messages to session."""
        ctx = SessionContext(session_id="sess-1", user_id="user-1")
        ctx.add_message("user", "Hello")
        ctx.add_message("assistant", "Hi there")
        
        assert ctx.message_count == 2
        assert ctx.messages[0].role == "user"
        assert ctx.messages[1].role == "assistant"

    def test_get_recent_messages(self):
        """Test getting recent messages."""
        ctx = SessionContext(session_id="sess-1", user_id="user-1")
        for i in range(15):
            ctx.add_message("user", f"Message {i}")
        
        recent = ctx.get_recent_messages(5)
        assert len(recent) == 5
        assert recent[0].content == "Message 10"
        assert recent[4].content == "Message 14"

    def test_to_prompt_context(self):
        """Test converting to prompt context."""
        ctx = SessionContext(session_id="sess-1", user_id="user-1")
        ctx.add_message("user", "What is Python?")
        ctx.add_message("assistant", "Python is a programming language.")
        
        prompt = ctx.to_prompt_context()
        assert "会話履歴" in prompt
        assert "ユーザー" in prompt
        assert "アシスタント" in prompt
        assert "Python" in prompt

    def test_to_prompt_context_empty(self):
        """Test prompt context for empty session."""
        ctx = SessionContext(session_id="sess-1", user_id="user-1")
        prompt = ctx.to_prompt_context()
        assert prompt == ""


class TestSessionMemoryService:
    """SessionMemoryService tests."""

    @pytest.fixture
    def mock_memory_client(self):
        """Create mock memory client."""
        client = MagicMock()
        client.retrieve_memories = AsyncMock(return_value=[])
        client.create_event = AsyncMock()
        return client

    @pytest.fixture
    def config(self):
        """Create test config."""
        return MemoryConfig(
            memory_store_id="test-store",
            enable_memory_cache=True,
            max_session_messages=10
        )

    @pytest.fixture
    def service(self, mock_memory_client, config):
        """Create service instance."""
        return SessionMemoryService(
            memory_client=mock_memory_client,
            config=config
        )

    @pytest.mark.asyncio
    async def test_get_session_new(self, service):
        """Test getting a new session."""
        session = await service.get_session("sess-1", "user-1")
        assert session.session_id == "sess-1"
        assert session.user_id == "user-1"
        assert session.message_count == 0

    @pytest.mark.asyncio
    async def test_get_session_cached(self, service, mock_memory_client):
        """Test getting session from cache."""
        # First call
        await service.get_session("sess-1", "user-1")
        # Second call should use cache
        await service.get_session("sess-1", "user-1")
        
        # Memory client should only be called once
        assert mock_memory_client.retrieve_memories.call_count == 1

    @pytest.mark.asyncio
    async def test_get_session_with_messages(self, service, mock_memory_client):
        """Test getting session with existing messages."""
        mock_memory_client.retrieve_memories.return_value = [
            {"role": "user", "content": "Hello", "timestamp": "2024-01-01T00:00:00"},
            {"role": "assistant", "content": "Hi", "timestamp": "2024-01-01T00:00:01"},
        ]
        
        session = await service.get_session("sess-1", "user-1")
        assert session.message_count == 2
        assert session.messages[0].content == "Hello"

    @pytest.mark.asyncio
    async def test_save_message(self, service, mock_memory_client):
        """Test saving a message."""
        await service.save_message(
            session_id="sess-1",
            user_id="user-1",
            role="user",
            content="Test message"
        )
        
        mock_memory_client.create_event.assert_called_once()

    @pytest.mark.asyncio
    async def test_save_turn(self, service, mock_memory_client):
        """Test saving a conversation turn."""
        await service.save_turn(
            session_id="sess-1",
            user_id="user-1",
            user_message="What is AI?",
            assistant_response="AI is artificial intelligence.",
            tool_calls=[{"name": "search", "result": "Found info"}]
        )
        
        mock_memory_client.create_event.assert_called_once()
        call_args = mock_memory_client.create_event.call_args
        messages = call_args.kwargs["messages"]
        assert len(messages) == 3  # user, assistant, tool

    @pytest.mark.asyncio
    async def test_save_turn_updates_cache(self, service, mock_memory_client):
        """Test that save_turn updates cached session."""
        # Load session first
        await service.get_session("sess-1", "user-1")
        
        # Save a turn
        await service.save_turn(
            session_id="sess-1",
            user_id="user-1",
            user_message="Hello",
            assistant_response="Hi"
        )
        
        # Check cache was updated
        session = await service.get_session("sess-1", "user-1")
        assert session.message_count == 2

    @pytest.mark.asyncio
    async def test_clear_session(self, service):
        """Test clearing a session."""
        # Load session
        await service.get_session("sess-1", "user-1")
        
        # Clear it
        await service.clear_session("sess-1", "user-1")
        
        # Verify cache is cleared
        assert "user-1:sess-1" not in service._cache

    def test_invalidate_cache_specific(self, service):
        """Test invalidating specific session cache."""
        service._cache["user-1:sess-1"] = SessionContext("sess-1", "user-1")
        service._cache["user-1:sess-2"] = SessionContext("sess-2", "user-1")
        
        service.invalidate_cache("sess-1", "user-1")
        
        assert "user-1:sess-1" not in service._cache
        assert "user-1:sess-2" in service._cache

    def test_invalidate_cache_all(self, service):
        """Test invalidating all cache."""
        service._cache["user-1:sess-1"] = SessionContext("sess-1", "user-1")
        service._cache["user-1:sess-2"] = SessionContext("sess-2", "user-1")
        
        service.invalidate_cache()
        
        assert len(service._cache) == 0

    def test_build_context_prompt(self, service):
        """Test building context prompt."""
        ctx = SessionContext(session_id="sess-1", user_id="user-1")
        ctx.add_message("user", "Hello")
        ctx.add_message("assistant", "Hi there")
        
        prompt = service.build_context_prompt(ctx)
        assert "会話履歴" in prompt
        assert "Hello" in prompt
        assert "Hi there" in prompt
