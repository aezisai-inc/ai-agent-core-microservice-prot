"""Episodic Memory Service.

Service for managing and utilizing episodic memory in AgentCore.
Episodic memory captures meaningful interactions as "episodes" that
can be retrieved to inform future agent decisions.

Reference: https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/episodic-memory-strategy.html
"""

from dataclasses import dataclass, field
from typing import Any

import structlog

from src.infrastructure.agentcore.memory_client import (
    AgentCoreMemoryClient,
    MemoryRecord,
)
from src.infrastructure.agentcore.memory_config import MemoryConfig

logger = structlog.get_logger()


@dataclass
class Episode:
    """Represents an episodic memory record.
    
    Episodes capture meaningful slices of user interactions, including:
    - What happened (situation)
    - What the user intended (intent)
    - The outcome (assessment)
    - Why the outcome occurred (justification)
    - Learnings from the episode (reflection)
    
    Attributes:
        id: Unique episode identifier
        situation: Description of what happened
        intent: What the user was trying to accomplish
        assessment: Outcome evaluation (SUCCESS, FAILURE, PARTIAL)
        justification: Explanation of why the outcome occurred
        reflection: Episode-level insights and learnings
        tools_used: List of tools invoked during the episode
        timestamp: When the episode was recorded
        raw_data: Original data from AgentCore Memory
    """
    
    id: str
    situation: str
    intent: str
    assessment: str
    justification: str
    reflection: str
    tools_used: list[str] = field(default_factory=list)
    timestamp: str = ""
    raw_data: dict[str, Any] = field(default_factory=dict)


class EpisodicMemoryService:
    """Service for managing episodic memory.
    
    Provides high-level operations for:
    - Saving interactions that may form episodes
    - Retrieving similar past episodes
    - Building context from episodes for agent prompts
    
    Example usage:
        ```python
        service = EpisodicMemoryService(memory_client, config)
        
        # Save an interaction
        await service.save_interaction(
            session_id="sess-123",
            user_id="user-456",
            user_message="How do I reset my password?",
            assistant_response="To reset your password...",
            tool_calls=[{"name": "search_knowledge", "result": "..."}]
        )
        
        # Retrieve similar episodes
        episodes = await service.retrieve_similar_episodes(
            user_id="user-456",
            query="password reset help"
        )
        ```
    """

    def __init__(
        self,
        memory_client: AgentCoreMemoryClient,
        config: MemoryConfig | None = None,
    ):
        """Initialize the episodic memory service.
        
        Args:
            memory_client: The low-level memory client
            config: Memory configuration (uses defaults if not provided)
        """
        self._client = memory_client
        self._config = config or MemoryConfig()

    def _build_namespace(self, user_id: str, tenant_id: str | None = None) -> str:
        """Build the namespace for episode storage.
        
        Args:
            user_id: The user identifier
            tenant_id: Optional tenant identifier for multi-tenant isolation
        
        Returns:
            The namespace string (e.g., "/tenant/t123/episodes/u456")
        """
        prefix = self._config.episode_namespace_prefix
        
        if tenant_id and self._config.enable_tenant_isolation:
            return f"{self._config.tenant_namespace_prefix}/{tenant_id}{prefix}/{user_id}"
        
        return f"{prefix}/{user_id}"

    async def save_interaction(
        self,
        session_id: str,
        user_id: str,
        user_message: str,
        assistant_response: str,
        tool_calls: list[dict[str, Any]] | None = None,
        tenant_id: str | None = None,
        metadata: dict[str, Any] | None = None,
    ) -> None:
        """Save an interaction for episode detection.
        
        AgentCore Memory automatically detects episode completion and
        structures episodes when appropriate.
        
        Args:
            session_id: The session identifier
            user_id: The user identifier
            user_message: The user's message
            assistant_response: The assistant's response
            tool_calls: Optional list of tool call results
            tenant_id: Optional tenant ID for multi-tenant scenarios
            metadata: Optional additional metadata
        """
        messages: list[tuple[str, str]] = [
            (user_message, "USER"),
            (assistant_response, "ASSISTANT"),
        ]
        
        # Include tool results for better episode detection
        if tool_calls:
            for tool in tool_calls:
                tool_content = (
                    f"Tool: {tool.get('name', 'unknown')}, "
                    f"Result: {str(tool.get('result', ''))[:500]}"
                )
                messages.append((tool_content, "TOOL"))
        
        # Build metadata with tenant context
        event_metadata = metadata or {}
        if tenant_id:
            event_metadata["tenant_id"] = tenant_id
        
        await self._client.create_event(
            actor_id=user_id,
            session_id=session_id,
            messages=messages,
            metadata=event_metadata,
        )
        
        logger.info(
            "interaction_saved_for_episode_detection",
            session_id=session_id,
            user_id=user_id,
            tool_count=len(tool_calls) if tool_calls else 0,
        )

    async def retrieve_similar_episodes(
        self,
        user_id: str,
        query: str,
        max_results: int | None = None,
        tenant_id: str | None = None,
        min_score: float = 0.5,
    ) -> list[Episode]:
        """Retrieve episodes similar to the given query.
        
        Uses semantic search to find past episodes that are relevant
        to the current user query. Episodes are indexed by intent.
        
        Args:
            user_id: The user identifier
            query: The search query (typically the user's current question)
            max_results: Maximum episodes to return (default from config)
            tenant_id: Optional tenant ID for multi-tenant scenarios
            min_score: Minimum relevance score (0-1)
        
        Returns:
            List of relevant Episode objects, sorted by relevance
        """
        max_results = max_results or self._config.max_episodes_per_query
        namespace = self._build_namespace(user_id, tenant_id)
        
        records = await self._client.retrieve_memories(
            namespace=namespace,
            query=query,
            max_results=max_results,
            min_score=min_score,
        )
        
        episodes = [self._parse_episode(record) for record in records]
        
        logger.info(
            "similar_episodes_retrieved",
            user_id=user_id,
            query_preview=query[:50],
            episode_count=len(episodes),
        )
        
        return episodes

    def _parse_episode(self, record: MemoryRecord) -> Episode:
        """Parse a MemoryRecord into an Episode object.
        
        Args:
            record: The raw memory record from AgentCore
        
        Returns:
            Parsed Episode object
        """
        content = record.content
        
        return Episode(
            id=record.id,
            situation=content.get("situation", ""),
            intent=content.get("intent", ""),
            assessment=content.get("assessment", ""),
            justification=content.get("justification", ""),
            reflection=content.get("episode_reflection", content.get("reflection", "")),
            tools_used=content.get("tools_used", []),
            timestamp=record.timestamp,
            raw_data=content,
        )

    def build_episode_context(
        self,
        episodes: list[Episode],
        max_chars: int | None = None,
    ) -> str:
        """Build a context string from episodes for prompt injection.
        
        Creates a formatted string that can be included in the agent's
        system prompt or context to inform its responses.
        
        Args:
            episodes: List of episodes to include
            max_chars: Maximum characters in output (default from config)
        
        Returns:
            Formatted context string
        """
        if not episodes:
            return ""
        
        max_chars = max_chars or self._config.episode_context_max_chars
        lines: list[str] = ["## Past Similar Experiences:"]
        
        for i, ep in enumerate(episodes, 1):
            episode_text = [
                f"\n### Experience {i}:",
                f"- Situation: {ep.situation}",
                f"- Intent: {ep.intent}",
                f"- Outcome: {ep.assessment}",
            ]
            
            if ep.reflection:
                episode_text.append(f"- Learning: {ep.reflection}")
            
            if ep.tools_used:
                episode_text.append(f"- Tools used: {', '.join(ep.tools_used)}")
            
            lines.extend(episode_text)
        
        context = "\n".join(lines)
        
        # Truncate if too long
        if len(context) > max_chars:
            context = context[:max_chars - 3] + "..."
        
        return context

    async def get_episode_stats(
        self,
        user_id: str,
        tenant_id: str | None = None,
    ) -> dict[str, Any]:
        """Get statistics about a user's episodes.
        
        Args:
            user_id: The user identifier
            tenant_id: Optional tenant ID
        
        Returns:
            Dictionary with episode statistics
        """
        namespace = self._build_namespace(user_id, tenant_id)
        
        # Retrieve a sample to count
        records = await self._client.retrieve_memories(
            namespace=namespace,
            query="*",  # Broad query
            max_results=100,
        )
        
        episodes = [self._parse_episode(r) for r in records]
        
        success_count = sum(1 for e in episodes if e.assessment == "SUCCESS")
        failure_count = sum(1 for e in episodes if e.assessment == "FAILURE")
        partial_count = sum(1 for e in episodes if e.assessment == "PARTIAL")
        
        all_tools = []
        for ep in episodes:
            all_tools.extend(ep.tools_used)
        
        return {
            "total_episodes": len(episodes),
            "success_count": success_count,
            "failure_count": failure_count,
            "partial_count": partial_count,
            "success_rate": success_count / len(episodes) if episodes else 0,
            "most_used_tools": self._get_top_items(all_tools, 5),
        }

    @staticmethod
    def _get_top_items(items: list[str], n: int) -> list[tuple[str, int]]:
        """Get the top N most frequent items."""
        from collections import Counter
        return Counter(items).most_common(n)
