"""Agent entity - Aggregate Root."""

from datetime import datetime

from pydantic import Field

from ...shared import AggregateRoot
from ..events.agent_events import AgentInvoked, ResponseGenerated
from ..value_objects import AgentId, ModelParameters, Prompt, Response


class RagConfig(AggregateRoot):
    """Configuration for RAG retrieval."""

    id: str = "rag-config"
    top_k: int = 5
    similarity_threshold: float = 0.7
    rerank_enabled: bool = True
    max_context_tokens: int = 4000
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)


class AgentConfig(AggregateRoot):
    """Agent configuration."""

    id: str = "agent-config"
    system_prompt: str
    model_params: ModelParameters
    rag_config: RagConfig
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)


class Agent(AggregateRoot[AgentId]):
    """Agent entity - Aggregate Root.

    Represents an AI agent that can process prompts and generate responses.
    """

    id: AgentId
    name: str
    description: str = ""
    config: AgentConfig
    is_active: bool = True
    tenant_id: str

    def invoke(
        self,
        prompt: Prompt,
        session_id: str,
        context: str | None = None,
    ) -> None:
        """Record an invocation event.

        The actual LLM invocation is handled by the infrastructure layer.
        This method records the domain event.
        """
        self.add_domain_event(
            AgentInvoked(
                aggregate_id=str(self.id),
                aggregate_type="Agent",
                version=self.version + 1,
                agent_id=str(self.id),
                session_id=session_id,
                prompt_content=prompt.content,
                prompt_role=prompt.role.value,
                has_context=context is not None,
            )
        )
        self.increment_version()

    def record_response(
        self,
        session_id: str,
        response: Response,
    ) -> None:
        """Record a response generation event."""
        self.add_domain_event(
            ResponseGenerated(
                aggregate_id=str(self.id),
                aggregate_type="Agent",
                version=self.version + 1,
                agent_id=str(self.id),
                session_id=session_id,
                response_content=response.content,
                tokens_used=response.tokens_used,
                model=response.model,
                latency_ms=response.latency_ms,
                source_count=response.source_count,
            )
        )
        self.increment_version()

    def update_config(self, new_config: AgentConfig) -> None:
        """Update the agent configuration."""
        self.config = new_config
        self.updated_at = datetime.utcnow()

    def deactivate(self) -> None:
        """Deactivate the agent."""
        self.is_active = False
        self.updated_at = datetime.utcnow()

    def activate(self) -> None:
        """Activate the agent."""
        self.is_active = True
        self.updated_at = datetime.utcnow()

    @classmethod
    def create(
        cls,
        name: str,
        tenant_id: str,
        system_prompt: str,
        description: str = "",
        model_params: ModelParameters | None = None,
    ) -> "Agent":
        """Factory method to create a new Agent."""
        now = datetime.utcnow()

        if model_params is None:
            model_params = ModelParameters.default_claude()

        config = AgentConfig(
            system_prompt=system_prompt,
            model_params=model_params,
            rag_config=RagConfig(),
        )

        return cls(
            id=AgentId.generate(),
            name=name,
            description=description,
            config=config,
            tenant_id=tenant_id,
            created_at=now,
            updated_at=now,
        )
