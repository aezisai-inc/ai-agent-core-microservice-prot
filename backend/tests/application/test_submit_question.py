"""Tests for SubmitQuestionCommand handler."""

from unittest.mock import AsyncMock

import pytest

from src.application.commands import SubmitQuestionCommand, SubmitQuestionHandler
from src.domain.agent import Agent


class TestSubmitQuestionHandler:
    """Tests for SubmitQuestionHandler."""

    @pytest.fixture
    def mock_agent_repository(self, mock_agent: Agent) -> AsyncMock:
        """Create a mock agent repository."""
        repo = AsyncMock()
        repo.get_by_id.return_value = mock_agent
        repo.save.return_value = None
        return repo

    @pytest.fixture
    def mock_session_repository(self) -> AsyncMock:
        """Create a mock session repository."""
        repo = AsyncMock()
        repo.get_by_id.return_value = None  # No existing session
        repo.save.return_value = None
        return repo

    @pytest.fixture
    def handler(
        self,
        mock_agent_repository: AsyncMock,
        mock_session_repository: AsyncMock,
        mock_vector_search: AsyncMock,
        mock_llm_service: AsyncMock,
        mock_event_store: AsyncMock,
    ) -> SubmitQuestionHandler:
        """Create handler with mocked dependencies."""
        return SubmitQuestionHandler(
            agent_repository=mock_agent_repository,
            session_repository=mock_session_repository,
            vector_search=mock_vector_search,
            llm_service=mock_llm_service,
            event_store=mock_event_store,
        )

    @pytest.mark.asyncio
    async def test_submit_question_success(
        self,
        handler: SubmitQuestionHandler,
        mock_agent: Agent,
        mock_vector_search: AsyncMock,
        mock_llm_service: AsyncMock,
    ):
        """Test successful question submission."""
        command = SubmitQuestionCommand(
            session_id="session-123",
            agent_id=str(mock_agent.id),
            user_id="user-123",
            tenant_id="tenant-123",
            question="What is the weather?",
        )

        result = await handler.handle(command)

        assert result.response_content is not None
        assert result.tokens_used == 150
        assert result.latency_ms >= 0  # Can be 0 if very fast
        mock_vector_search.search.assert_called_once()
        mock_llm_service.generate.assert_called_once()

    @pytest.mark.asyncio
    async def test_submit_question_agent_not_found(
        self,
        handler: SubmitQuestionHandler,
        mock_agent_repository: AsyncMock,
    ):
        """Test error when agent not found."""
        mock_agent_repository.get_by_id.return_value = None

        command = SubmitQuestionCommand(
            session_id="session-123",
            agent_id="nonexistent-agent",
            user_id="user-123",
            tenant_id="tenant-123",
            question="What is the weather?",
        )

        with pytest.raises(ValueError, match="Agent not found"):
            await handler.handle(command)

    @pytest.mark.asyncio
    async def test_submit_question_agent_inactive(
        self,
        handler: SubmitQuestionHandler,
        mock_agent: Agent,
        mock_agent_repository: AsyncMock,
    ):
        """Test error when agent is inactive."""
        mock_agent.deactivate()

        command = SubmitQuestionCommand(
            session_id="session-123",
            agent_id=str(mock_agent.id),
            user_id="user-123",
            tenant_id="tenant-123",
            question="What is the weather?",
        )

        with pytest.raises(ValueError, match="Agent is not active"):
            await handler.handle(command)

    @pytest.mark.asyncio
    async def test_submit_question_builds_context(
        self,
        handler: SubmitQuestionHandler,
        mock_agent: Agent,
        mock_vector_search: AsyncMock,
        mock_llm_service: AsyncMock,
    ):
        """Test that context is built from search results."""
        command = SubmitQuestionCommand(
            session_id="session-123",
            agent_id=str(mock_agent.id),
            user_id="user-123",
            tenant_id="tenant-123",
            question="What is the weather?",
        )

        await handler.handle(command)

        # Verify LLM was called with context
        call_args = mock_llm_service.generate.call_args
        assert call_args.kwargs.get("context") is not None
