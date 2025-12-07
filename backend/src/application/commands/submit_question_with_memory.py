"""Submit Question Command with Episodic Memory Integration.

This module extends the basic SubmitQuestionHandler to leverage
AgentCore Memory's episodic memory for context-aware responses.
"""

from dataclasses import dataclass
from datetime import datetime
from typing import Protocol, Any

from src.domain.agent import AgentId, AgentRepository, Prompt, Response
from src.domain.agent.entities import AgentSession
from src.domain.agent.repositories import SessionRepository
from src.infrastructure.agentcore.episodic_memory import (
    EpisodicMemoryService,
    Episode,
)
from src.infrastructure.agentcore.reflection_service import (
    ReflectionService,
    Reflection,
)


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
    """Command to submit a question to an agent with memory context."""

    session_id: str
    agent_id: str
    user_id: str
    tenant_id: str
    question: str
    enable_episodic_memory: bool = True
    enable_reflections: bool = True


@dataclass
class SubmitQuestionResult:
    """Result of submitting a question."""

    response_content: str
    tokens_used: int
    latency_ms: int
    sources: list[dict]
    episodes_used: int = 0
    reflections_used: int = 0


class SubmitQuestionWithMemoryHandler:
    """Handler for SubmitQuestionCommand with episodic memory integration.

    Orchestrates the RAG flow with episodic memory:
    1. Load agent and session
    2. Retrieve relevant episodes from past interactions
    3. Retrieve relevant reflections (insights)
    4. Search knowledge base (RAG)
    5. Build enriched context (RAG + Episodes + Reflections)
    6. Generate response with context
    7. Save interaction for future episode detection
    8. Record events
    """

    def __init__(
        self,
        agent_repository: AgentRepository,
        session_repository: SessionRepository,
        vector_search: VectorSearchService,
        llm_service: LLMService,
        event_store: EventStore,
        episodic_memory_service: EpisodicMemoryService,
        reflection_service: ReflectionService,
    ):
        self._agent_repo = agent_repository
        self._session_repo = session_repository
        self._vector_search = vector_search
        self._llm_service = llm_service
        self._event_store = event_store
        self._episodic_service = episodic_memory_service
        self._reflection_service = reflection_service

    async def handle(self, command: SubmitQuestionCommand) -> SubmitQuestionResult:
        """Handle the submit question command with episodic memory."""
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

        # 3. Retrieve episodic memory context
        episodes: list[Episode] = []
        if command.enable_episodic_memory:
            episodes = await self._episodic_service.retrieve_similar_episodes(
                user_id=command.user_id,
                query=command.question,
                tenant_id=command.tenant_id,
            )

        # 4. Retrieve reflections
        reflections: list[Reflection] = []
        if command.enable_reflections:
            reflections = await self._reflection_service.retrieve_relevant_reflections(
                user_id=command.user_id,
                use_case=command.question,
                tenant_id=command.tenant_id,
            )

        # 5. Search knowledge base (RAG)
        search_results = await self._vector_search.search(
            query=command.question,
            tenant_id=command.tenant_id,
            top_k=agent.config.rag_config.top_k,
        )

        # 6. Build enriched context
        context = self._build_enriched_context(
            search_results=search_results,
            episodes=episodes,
            reflections=reflections,
        )

        # 7. Create prompt
        prompt = Prompt(content=command.question)

        # 8. Record invocation
        agent.invoke(prompt, str(session.id), context)

        # 9. Generate response with enriched context
        response_content, tokens_used = await self._llm_service.generate(
            prompt=command.question,
            system_prompt=agent.config.system_prompt,
            context=context,
            model_id=agent.config.model_params.model_id,
            temperature=agent.config.model_params.temperature,
            max_tokens=agent.config.model_params.max_tokens,
        )

        # 10. Calculate latency
        end_time = datetime.utcnow()
        latency_ms = int((end_time - start_time).total_seconds() * 1000)

        # 11. Save interaction for future episode detection
        await self._episodic_service.save_interaction(
            session_id=command.session_id,
            user_id=command.user_id,
            user_message=command.question,
            assistant_response=response_content,
            tool_calls=self._extract_tool_calls(search_results),
            tenant_id=command.tenant_id,
        )

        # 12. Create response value object
        response = Response(
            content=response_content,
            tokens_used=tokens_used,
            model=agent.config.model_params.model_id,
            latency_ms=latency_ms,
            sources=[],
        )

        # 13. Record response
        agent.record_response(str(session.id), response)
        session.record_interaction(tokens_used)

        # 14. Persist events
        for event in agent.clear_domain_events():
            await self._event_store.append(event)

        for event in session.clear_domain_events():
            await self._event_store.append(event)

        # 15. Save aggregates
        await self._agent_repo.save(agent)
        await self._session_repo.save(session)

        return SubmitQuestionResult(
            response_content=response_content,
            tokens_used=tokens_used,
            latency_ms=latency_ms,
            sources=search_results,
            episodes_used=len(episodes),
            reflections_used=len(reflections),
        )

    def _build_enriched_context(
        self,
        search_results: list[dict],
        episodes: list[Episode],
        reflections: list[Reflection],
    ) -> str | None:
        """Build enriched context from RAG results, episodes, and reflections."""
        context_parts: list[str] = []

        # Add reflection insights first (highest priority)
        if reflections:
            reflection_context = self._reflection_service.build_reflection_prompt(reflections)
            if reflection_context:
                context_parts.append(reflection_context)

        # Add episodic context
        if episodes:
            episode_context = self._episodic_service.build_episode_context(episodes)
            if episode_context:
                context_parts.append(episode_context)

        # Add RAG context
        if search_results:
            rag_context = self._build_rag_context(search_results)
            if rag_context:
                context_parts.append(rag_context)

        if not context_parts:
            return None

        return "\n\n---\n\n".join(context_parts)

    def _build_rag_context(self, search_results: list[dict]) -> str | None:
        """Build context string from RAG search results."""
        if not search_results:
            return None

        parts = ["## Relevant Knowledge Base Information:"]
        for i, result in enumerate(search_results, 1):
            content = result.get("content", "")
            source = result.get("source", "Unknown")
            parts.append(f"\n### Source {i}: {source}\n{content}")

        return "\n".join(parts)

    def _extract_tool_calls(self, search_results: list[dict]) -> list[dict[str, Any]]:
        """Extract tool call information for episode detection."""
        # RAG search is treated as a tool call for episode detection
        if not search_results:
            return []

        return [
            {
                "name": "search_knowledge_base",
                "result": f"Found {len(search_results)} relevant documents",
                "sources": [r.get("source", "") for r in search_results[:3]],
            }
        ]
