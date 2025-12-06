"""Agent domain events."""

from ...shared import DomainEvent


class AgentInvoked(DomainEvent):
    """Event emitted when an agent is invoked with a prompt."""

    agent_id: str
    session_id: str
    prompt_content: str
    prompt_role: str
    has_context: bool


class ResponseGenerated(DomainEvent):
    """Event emitted when the agent generates a response."""

    agent_id: str
    session_id: str
    response_content: str
    tokens_used: int
    model: str
    latency_ms: int
    source_count: int


class SessionStarted(DomainEvent):
    """Event emitted when a new session is started."""

    session_id: str
    agent_id: str
    user_id: str
    tenant_id: str


class SessionEnded(DomainEvent):
    """Event emitted when a session is ended."""

    session_id: str
    reason: str
    message_count: int
    total_tokens: int
