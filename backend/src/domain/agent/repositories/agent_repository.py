"""Agent repository interface."""

from abc import ABC, abstractmethod

from ..entities import Agent, AgentSession
from ..value_objects import AgentId


class AgentRepository(ABC):
    """Repository interface for Agent aggregate.

    This interface defines the contract for persisting and retrieving
    Agent aggregates. The implementation is in the infrastructure layer.
    """

    @abstractmethod
    async def save(self, agent: Agent) -> None:
        """Save an agent aggregate."""
        pass

    @abstractmethod
    async def get_by_id(self, agent_id: AgentId) -> Agent | None:
        """Get an agent by its ID."""
        pass

    @abstractmethod
    async def get_by_tenant(self, tenant_id: str) -> list[Agent]:
        """Get all agents for a tenant."""
        pass

    @abstractmethod
    async def delete(self, agent_id: AgentId) -> None:
        """Delete an agent."""
        pass


class SessionRepository(ABC):
    """Repository interface for AgentSession aggregate."""

    @abstractmethod
    async def save(self, session: AgentSession) -> None:
        """Save a session aggregate."""
        pass

    @abstractmethod
    async def get_by_id(self, session_id: str) -> AgentSession | None:
        """Get a session by its ID."""
        pass

    @abstractmethod
    async def get_active_by_user(self, user_id: str, agent_id: AgentId) -> AgentSession | None:
        """Get active session for a user and agent."""
        pass

    @abstractmethod
    async def get_by_user(self, user_id: str) -> list[AgentSession]:
        """Get all sessions for a user."""
        pass
