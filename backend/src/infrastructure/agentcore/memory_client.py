"""AgentCore Memory Client.

Low-level client for interacting with Amazon Bedrock AgentCore Memory API.
Supports Short-term, Semantic, and Episodic memory strategies.
"""

from dataclasses import dataclass
from enum import Enum
from typing import Any

import boto3
import structlog

from src.infrastructure.agentcore.memory_config import MemoryConfig

logger = structlog.get_logger()


class MemoryStrategy(str, Enum):
    """AgentCore Memory strategy types."""
    
    SHORT_TERM = "short_term"
    SEMANTIC = "semantic"
    EPISODIC = "episodic"


@dataclass
class MemoryRecord:
    """A record retrieved from AgentCore Memory."""
    
    id: str
    namespace: str
    content: dict[str, Any]
    score: float = 0.0
    timestamp: str = ""


class AgentCoreMemoryClient:
    """Low-level client for AgentCore Memory API.
    
    Provides methods for:
    - Creating and managing memory stores
    - Storing events/interactions
    - Retrieving memories (semantic search)
    - Managing sessions
    
    Reference: https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/memory.html
    """

    def __init__(self, config: MemoryConfig | None = None):
        """Initialize the memory client.
        
        Args:
            config: Memory configuration. If None, loads from environment.
        """
        self._config = config or MemoryConfig()
        self._client = boto3.client(
            "bedrock-agentcore",
            region_name=self._config.region,
        )
        self._memory_id = self._config.memory_store_id

    @property
    def memory_id(self) -> str:
        """Get the current memory store ID."""
        return self._memory_id
    
    @memory_id.setter
    def memory_id(self, value: str) -> None:
        """Set the memory store ID."""
        self._memory_id = value

    async def create_memory_store(
        self,
        name: str,
        description: str = "",
        strategies: list[dict[str, Any]] | None = None,
    ) -> str:
        """Create a new memory store with specified strategies.
        
        Args:
            name: Name for the memory store
            description: Optional description
            strategies: List of strategy configurations. Defaults to
                        semantic + episodic strategies.
        
        Returns:
            The created memory store ID
        """
        if strategies is None:
            strategies = [
                {
                    "semanticMemoryStrategy": {
                        "name": "semanticFacts",
                        "namespaces": [f"{self._config.semantic_namespace_prefix}/{{actorId}}"],
                    }
                },
                {
                    "episodicMemoryStrategy": {
                        "name": "episodicLearning",
                        "namespaces": {
                            "episodes": f"{self._config.episode_namespace_prefix}/{{actorId}}",
                            "reflections": f"{self._config.reflection_namespace_prefix}/{{actorId}}",
                        },
                    }
                },
            ]

        try:
            response = self._client.create_memory(
                name=name,
                description=description or f"Memory store for {name}",
                memoryStrategies=strategies,
            )
            
            memory_id = response.get("memoryId", "")
            self._memory_id = memory_id
            
            logger.info(
                "memory_store_created",
                memory_id=memory_id,
                name=name,
                strategies=[s.keys() for s in strategies],
            )
            
            return memory_id

        except Exception as e:
            logger.error("memory_store_creation_failed", error=str(e), name=name)
            raise

    async def create_event(
        self,
        actor_id: str,
        session_id: str,
        messages: list[tuple[str, str]],
        metadata: dict[str, Any] | None = None,
    ) -> None:
        """Store an interaction event for episode detection.
        
        This method saves messages to AgentCore Memory, which automatically:
        1. Detects episode completion
        2. Structures and saves episodes
        3. Generates Reflections in the background
        
        Args:
            actor_id: User/actor identifier
            session_id: Session identifier
            messages: List of (content, role) tuples where role is
                     "USER", "ASSISTANT", or "TOOL"
            metadata: Optional metadata to attach to the event
        """
        formatted_messages = [
            {"content": content, "role": role}
            for content, role in messages
        ]

        try:
            self._client.create_memory_event(
                memoryId=self._memory_id,
                actorId=actor_id,
                sessionId=session_id,
                messages=formatted_messages,
                metadata=metadata or {},
            )
            
            logger.info(
                "memory_event_created",
                memory_id=self._memory_id,
                actor_id=actor_id,
                session_id=session_id,
                message_count=len(messages),
            )

        except Exception as e:
            logger.error(
                "memory_event_creation_failed",
                error=str(e),
                actor_id=actor_id,
                session_id=session_id,
            )
            raise

    async def retrieve_memories(
        self,
        namespace: str,
        query: str,
        max_results: int = 5,
        min_score: float = 0.0,
    ) -> list[MemoryRecord]:
        """Retrieve memories using semantic search.
        
        Args:
            namespace: The namespace to search in (e.g., "/episodes/user123")
            query: The search query (semantic search)
            max_results: Maximum number of results to return
            min_score: Minimum relevance score threshold
        
        Returns:
            List of matching memory records
        """
        try:
            response = self._client.retrieve_memories(
                memoryId=self._memory_id,
                namespace=namespace,
                query=query,
                maxResults=max_results,
            )
            
            records = []
            for item in response.get("memoryRecords", []):
                score = item.get("score", 0.0)
                if score >= min_score:
                    records.append(
                        MemoryRecord(
                            id=item.get("id", ""),
                            namespace=namespace,
                            content=item.get("content", {}),
                            score=score,
                            timestamp=item.get("timestamp", ""),
                        )
                    )
            
            logger.info(
                "memories_retrieved",
                memory_id=self._memory_id,
                namespace=namespace,
                query_preview=query[:50],
                result_count=len(records),
            )
            
            return records

        except Exception as e:
            logger.error(
                "memory_retrieval_failed",
                error=str(e),
                namespace=namespace,
            )
            return []

    async def get_session_messages(
        self,
        actor_id: str,
        session_id: str,
        max_messages: int | None = None,
    ) -> list[dict[str, Any]]:
        """Get conversation history for a session.
        
        Args:
            actor_id: User/actor identifier
            session_id: Session identifier
            max_messages: Maximum messages to retrieve (default from config)
        
        Returns:
            List of message dictionaries with role and content
        """
        max_messages = max_messages or self._config.max_messages_per_session

        try:
            response = self._client.get_session_messages(
                memoryId=self._memory_id,
                actorId=actor_id,
                sessionId=session_id,
                maxMessages=max_messages,
            )
            
            return response.get("messages", [])

        except Exception as e:
            logger.error(
                "session_messages_retrieval_failed",
                error=str(e),
                actor_id=actor_id,
                session_id=session_id,
            )
            return []

    async def delete_session(
        self,
        actor_id: str,
        session_id: str,
    ) -> bool:
        """Delete a session and its short-term memory.
        
        Args:
            actor_id: User/actor identifier
            session_id: Session identifier
        
        Returns:
            True if deletion was successful
        """
        try:
            self._client.delete_session(
                memoryId=self._memory_id,
                actorId=actor_id,
                sessionId=session_id,
            )
            
            logger.info(
                "session_deleted",
                memory_id=self._memory_id,
                actor_id=actor_id,
                session_id=session_id,
            )
            
            return True

        except Exception as e:
            logger.error(
                "session_deletion_failed",
                error=str(e),
                actor_id=actor_id,
                session_id=session_id,
            )
            return False

    async def health_check(self) -> bool:
        """Check if the memory service is healthy.
        
        Returns:
            True if the service is accessible
        """
        try:
            self._client.get_memory(memoryId=self._memory_id)
            return True
        except Exception:
            return False
