"""Submit Question Command and Handler."""

from dataclasses import dataclass
from datetime import datetime
from typing import Protocol

from ...domain.agent import AgentId, AgentRepository, Prompt, Response
from ...domain.agent.entities import AgentSession
from ...domain.agent.repositories import SessionRepository


class VectorSearchService(Protocol):
    """Protocol for vector search service."""

    async def search(self, query: str, tenant_id: str, top_k: int = 5) -> list[dict]:
        """Search for relevant documents."""
        ...


class LLMService(Protocol):
    """Protocol for LLM service."""

    async def generate(
        self,
        prompt: str,
        system_prompt: str,
        context: str | None = None,
        model_id: str = "",
        temperature: float = 0.7,
        max_tokens: int = 4096,
    ) -> tuple[str, int]:
        """Generate a response. Returns (content, tokens_used)."""
        ...


class EventStore(Protocol):
    """Protocol for event store."""

    async def append(self, event: object) -> None:
        """Append an event to the store."""
        ...


@dataclass(frozen=True)
class SubmitQuestionCommand:
    """Command to submit a question to an agent."""

    session_id: str
    agent_id: str
    user_id: str
    tenant_id: str
    question: str


@dataclass
class SubmitQuestionResult:
    """Result of submitting a question."""

    response_content: str
    tokens_used: int
    latency_ms: int
    sources: list[dict]


class SubmitQuestionHandler:
    """Handler for SubmitQuestionCommand.

    Orchestrates the RAG flow:
    1. Load agent and session
    2. Search knowledge base
    3. Generate response with context
    4. Record events
    """

    def __init__(
        self,
        agent_repository: AgentRepository,
        session_repository: SessionRepository,
        vector_search: VectorSearchService,
        llm_service: LLMService,
        event_store: EventStore,
    ):
        self._agent_repo = agent_repository
        self._session_repo = session_repository
        self._vector_search = vector_search
        self._llm_service = llm_service
        self._event_store = event_store

    async def handle(self, command: SubmitQuestionCommand) -> SubmitQuestionResult:
        """Handle the submit question command."""
        start_time = datetime.utcnow()

        # 1. Load agent
        agent = await self._agent_repo.get_by_id(AgentId(value=command.agent_id))
        if agent is None:
            raise ValueError(f"Agent not found: {command.agent_id}")

        if not agent.is_active:
            raise ValueError(f"Agent is not active: {command.agent_id}")

        # 2. Load or create session
        session = await self._session_repo.get_by_id(command.session_id)
        if session is None:
            session = AgentSession.create(
                agent_id=agent.id,
                user_id=command.user_id,
                tenant_id=command.tenant_id,
            )

        # 3. Search knowledge base
        search_results = await self._vector_search.search(
            query=command.question,
            tenant_id=command.tenant_id,
            top_k=agent.config.rag_config.top_k,
        )

        # 4. Build context from search results
        context = self._build_context(search_results)

        # 5. Create prompt
        prompt = Prompt(content=command.question)

        # 6. Record invocation
        agent.invoke(prompt, str(session.id), context)

        # 7. Generate response
        response_content, tokens_used = await self._llm_service.generate(
            prompt=command.question,
            system_prompt=agent.config.system_prompt,
            context=context,
            model_id=agent.config.model_params.model_id,
            temperature=agent.config.model_params.temperature,
            max_tokens=agent.config.model_params.max_tokens,
        )

        # 8. Calculate latency
        end_time = datetime.utcnow()
        latency_ms = int((end_time - start_time).total_seconds() * 1000)

        # 9. Create response value object
        response = Response(
            content=response_content,
            tokens_used=tokens_used,
            model=agent.config.model_params.model_id,
            latency_ms=latency_ms,
            sources=[],  # Simplified
        )

        # 10. Record response
        agent.record_response(str(session.id), response)
        session.record_interaction(tokens_used)

        # 11. Persist events
        for event in agent.clear_domain_events():
            await self._event_store.append(event)

        for event in session.clear_domain_events():
            await self._event_store.append(event)

        # 12. Save aggregates
        await self._agent_repo.save(agent)
        await self._session_repo.save(session)

        return SubmitQuestionResult(
            response_content=response_content,
            tokens_used=tokens_used,
            latency_ms=latency_ms,
            sources=search_results,
        )

    def _build_context(self, search_results: list[dict]) -> str | None:
        """Build context string from search results."""
        if not search_results:
            return None

        context_parts = []
        for i, result in enumerate(search_results, 1):
            content = result.get("content", "")
            source = result.get("source", "Unknown")
            context_parts.append(f"[Source {i}: {source}]\n{content}")

        return "\n\n---\n\n".join(context_parts)
