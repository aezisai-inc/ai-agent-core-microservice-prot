"""Agent Session entity."""

from datetime import datetime
from enum import Enum
from typing import Annotated
from uuid import uuid4

from ...shared import AggregateRoot
from ..events.agent_events import SessionEnded, SessionStarted
from ..value_objects import AgentId


class SessionStatus(str, Enum):
    """Status of an agent session."""

    ACTIVE = "active"
    ENDED = "ended"
    EXPIRED = "expired"


def _generate_session_id() -> str:
    """Generate a new unique SessionId."""
    return f"session-{uuid4().hex[:12]}"


# Use Annotated type alias for SessionId
SessionId = Annotated[str, "SessionId"]


class AgentSession(AggregateRoot[str]):
    """Agent Session entity - Aggregate Root.

    Represents a conversation session between a user and an agent.
    """

    id: SessionId
    agent_id: AgentId
    user_id: str
    tenant_id: str
    status: SessionStatus = SessionStatus.ACTIVE
    message_count: int = 0
    total_tokens: int = 0
    ended_at: datetime | None = None

    def start(self) -> None:
        """Start the session and emit event."""
        self.add_domain_event(
            SessionStarted(
                aggregate_id=str(self.id),
                aggregate_type="AgentSession",
                version=self.version + 1,
                session_id=str(self.id),
                agent_id=str(self.agent_id),
                user_id=self.user_id,
                tenant_id=self.tenant_id,
            )
        )
        self.increment_version()

    def end(self, reason: str = "user_ended") -> None:
        """End the session."""
        if self.status != SessionStatus.ACTIVE:
            raise ValueError("Session is not active")

        self.status = SessionStatus.ENDED
        self.ended_at = datetime.utcnow()
        self.updated_at = datetime.utcnow()

        self.add_domain_event(
            SessionEnded(
                aggregate_id=str(self.id),
                aggregate_type="AgentSession",
                version=self.version + 1,
                session_id=str(self.id),
                reason=reason,
                message_count=self.message_count,
                total_tokens=self.total_tokens,
            )
        )
        self.increment_version()

    def expire(self) -> None:
        """Mark the session as expired."""
        if self.status != SessionStatus.ACTIVE:
            return

        self.status = SessionStatus.EXPIRED
        self.ended_at = datetime.utcnow()
        self.updated_at = datetime.utcnow()

        self.add_domain_event(
            SessionEnded(
                aggregate_id=str(self.id),
                aggregate_type="AgentSession",
                version=self.version + 1,
                session_id=str(self.id),
                reason="expired",
                message_count=self.message_count,
                total_tokens=self.total_tokens,
            )
        )
        self.increment_version()

    def record_interaction(self, tokens_used: int) -> None:
        """Record an interaction in the session."""
        self.message_count += 1
        self.total_tokens += tokens_used
        self.updated_at = datetime.utcnow()

    @property
    def is_active(self) -> bool:
        """Check if the session is active."""
        return self.status == SessionStatus.ACTIVE

    @classmethod
    def create(
        cls,
        agent_id: AgentId,
        user_id: str,
        tenant_id: str,
    ) -> "AgentSession":
        """Factory method to create a new AgentSession."""
        now = datetime.utcnow()
        session = cls(
            id=_generate_session_id(),
            agent_id=agent_id,
            user_id=user_id,
            tenant_id=tenant_id,
            created_at=now,
            updated_at=now,
        )
        session.start()
        return session
