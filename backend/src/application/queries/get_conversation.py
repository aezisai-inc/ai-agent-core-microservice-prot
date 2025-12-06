"""Get Conversation Query and Handler."""

from dataclasses import dataclass
from datetime import datetime
from typing import Protocol


@dataclass
class MessageDTO:
    """Data transfer object for a message."""

    id: str
    role: str
    content: str
    timestamp: datetime
    tokens_used: int | None = None


@dataclass
class ConversationDTO:
    """Data transfer object for a conversation."""

    session_id: str
    agent_id: str
    user_id: str
    messages: list[MessageDTO]
    created_at: datetime
    updated_at: datetime
    total_tokens: int
    message_count: int


class ConversationReadModel(Protocol):
    """Protocol for conversation read model."""

    async def get_conversation(self, session_id: str) -> ConversationDTO | None:
        """Get a conversation by session ID."""
        ...

    async def get_conversations_by_user(
        self, user_id: str, limit: int = 10
    ) -> list[ConversationDTO]:
        """Get conversations for a user."""
        ...


@dataclass(frozen=True)
class GetConversationQuery:
    """Query to get a conversation."""

    session_id: str
    user_id: str


class GetConversationHandler:
    """Handler for GetConversationQuery.

    Queries the read model to get conversation data.
    This is the read side of CQRS - optimized for queries.
    """

    def __init__(self, read_model: ConversationReadModel):
        self._read_model = read_model

    async def handle(self, query: GetConversationQuery) -> ConversationDTO | None:
        """Handle the get conversation query."""
        conversation = await self._read_model.get_conversation(query.session_id)

        # Verify user has access to this conversation
        if conversation and conversation.user_id != query.user_id:
            return None

        return conversation


@dataclass(frozen=True)
class ListConversationsQuery:
    """Query to list conversations for a user."""

    user_id: str
    limit: int = 10


class ListConversationsHandler:
    """Handler for ListConversationsQuery."""

    def __init__(self, read_model: ConversationReadModel):
        self._read_model = read_model

    async def handle(self, query: ListConversationsQuery) -> list[ConversationDTO]:
        """Handle the list conversations query."""
        return await self._read_model.get_conversations_by_user(
            query.user_id,
            limit=query.limit,
        )
