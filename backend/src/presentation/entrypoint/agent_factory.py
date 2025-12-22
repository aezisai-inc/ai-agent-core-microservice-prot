"""Strands Agent Factory.

Creates and configures Strands Agent instances for use with
AgentCore Runtime. Handles dependency injection and tool registration.
"""

from dataclasses import dataclass, field
from typing import Any, Callable

import structlog

from src.presentation.entrypoint.prompts import SYSTEM_PROMPT
from src.presentation.tools.knowledge_tool import create_knowledge_tool

logger = structlog.get_logger()


@dataclass
class AgentConfig:
    """Configuration for Strands Agent.
    
    Attributes:
        model_id: Bedrock model ID to use
        system_prompt: System prompt for the agent
        max_iterations: Maximum tool call iterations
        temperature: Model temperature (0-1)
        max_tokens: Maximum tokens in response
        tools: List of tool functions
    """
    
    model_id: str = "us.amazon.nova-pro-v1:0"
    system_prompt: str = SYSTEM_PROMPT
    max_iterations: int = 10
    temperature: float = 0.7
    max_tokens: int = 4096
    tools: list[Callable[..., Any]] = field(default_factory=list)


class AgentFactory:
    """Factory for creating Strands Agent instances.
    
    This factory handles:
    - Tool creation with dependency injection
    - Agent configuration
    - Memory service integration
    
    Example:
        ```python
        from src.infrastructure.config import get_container
        
        container = get_container()
        factory = AgentFactory(container)
        agent = factory.create_agent()
        ```
    """
    
    def __init__(self, container: Any):
        """Initialize the agent factory.
        
        Args:
            container: DI container with service dependencies
        """
        self._container = container
        self._tools: list[Callable[..., Any]] = []
    
    def create_agent(
        self,
        config: AgentConfig | None = None,
        tenant_id: str | None = None,
    ) -> "StrandsAgentWrapper":
        """Create a configured Strands Agent.
        
        Args:
            config: Agent configuration (uses defaults if None)
            tenant_id: Tenant ID for multi-tenant tool isolation
        
        Returns:
            Configured StrandsAgentWrapper instance
        """
        config = config or AgentConfig()
        
        # Create tools with dependencies
        tools = self._create_tools(tenant_id)
        
        # Get S3Vector client for RAG
        s3vector_client = None
        try:
            s3vector_client = self._container.s3vector_client
        except Exception as e:
            logger.warning(
                "s3vector_client_not_available",
                error=str(e),
                message="RAG retrieval will be disabled"
            )
        
        logger.info(
            "creating_strands_agent",
            model_id=config.model_id,
            tool_count=len(tools),
            tenant_id=tenant_id,
            rag_enabled=s3vector_client is not None,
        )
        
        return StrandsAgentWrapper(
            config=config,
            tools=tools,
            episodic_service=self._container.episodic_memory_service,
            reflection_service=self._container.reflection_service,
            s3vector_client=s3vector_client,
        )
    
    def _create_tools(self, tenant_id: str | None = None) -> list[Callable[..., Any]]:
        """Create tool functions with injected dependencies.
        
        Args:
            tenant_id: Tenant ID for tool isolation
        
        Returns:
            List of tool functions
        """
        tools: list[Callable[..., Any]] = []
        
        # Knowledge base search tool (S3 Vectors)
        try:
            tools.append(create_knowledge_tool(
                vector_client=self._container.s3vector_client,
                tenant_id=tenant_id,
            ))
            logger.info("knowledge_tool_registered", tenant_id=tenant_id)
        except Exception as e:
            logger.warning(
                "knowledge_tool_registration_failed",
                error=str(e),
                message="Knowledge Base tool disabled - check S3Vector client configuration"
            )
        
        return tools


class StrandsAgentWrapper:
    """Wrapper around Strands Agent with memory integration.
    
    This wrapper provides:
    - RAG (Knowledge Base) context injection
    - Episodic memory context injection
    - Reflection-based guidance
    - Streaming response handling
    - Interaction logging for episode detection
    
    Note: In production, this would wrap the actual strands.Agent class.
    This implementation provides the interface for AgentCore Runtime.
    """
    
    def __init__(
        self,
        config: AgentConfig,
        tools: list[Callable[..., Any]],
        episodic_service: Any,
        reflection_service: Any,
        s3vector_client: Any = None,
    ):
        """Initialize the agent wrapper.
        
        Args:
            config: Agent configuration
            tools: List of tool functions
            episodic_service: EpisodicMemoryService instance
            reflection_service: ReflectionService instance
            s3vector_client: S3VectorClient for RAG retrieval
        """
        self._config = config
        self._tools = tools
        self._episodic_service = episodic_service
        self._reflection_service = reflection_service
        self._s3vector_client = s3vector_client
        
        # In production, initialize actual Strands Agent:
        # from strands import Agent
        # self._agent = Agent(
        #     model=config.model_id,
        #     system_prompt=config.system_prompt,
        #     tools=tools,
        #     max_iterations=config.max_iterations,
        #     temperature=config.temperature,
        # )
    
    async def invoke(
        self,
        prompt: str,
        session_id: str,
        user_id: str,
        tenant_id: str | None = None,
    ) -> dict[str, Any]:
        """Invoke the agent with a prompt.
        
        Args:
            prompt: User's input prompt
            session_id: Session identifier
            user_id: User identifier
            tenant_id: Optional tenant identifier
        
        Returns:
            Response dictionary with content and metadata
        """
        # 1. RAG: Retrieve relevant documents from Knowledge Base
        rag_context = ""
        rag_chunks = []
        if self._s3vector_client:
            try:
                rag_results = await self._s3vector_client.search(
                    query=prompt,
                    tenant_id=tenant_id or "default",
                    top_k=5,
                )
                rag_chunks = rag_results
                if rag_results:
                    rag_context = self._build_rag_context(rag_results)
                    logger.info(
                        "rag_context_retrieved",
                        chunk_count=len(rag_results),
                        session_id=session_id,
                    )
            except Exception as e:
                logger.warning("rag_retrieval_failed", error=str(e))
        
        # 2. Retrieve episodic context
        episodes = await self._episodic_service.retrieve_similar_episodes(
            user_id=user_id,
            query=prompt,
            tenant_id=tenant_id,
        )
        episodic_context = self._episodic_service.build_episode_context(episodes)
        
        # 3. Retrieve reflection context
        reflections = await self._reflection_service.retrieve_relevant_reflections(
            user_id=user_id,
            use_case=prompt,
            tenant_id=tenant_id,
        )
        reflection_context = self._reflection_service.build_reflection_prompt(reflections)
        
        # 4. Build enriched system prompt with RAG context
        from src.presentation.entrypoint.prompts import build_system_prompt
        enriched_prompt = build_system_prompt(
            session_id=session_id,
            user_id=user_id,
            tenant_id=tenant_id or "",
            episodic_context=episodic_context,
            reflection_context=reflection_context,
            rag_context=rag_context,
            base_prompt=self._config.system_prompt,
        )
        
        # 5. Invoke agent (placeholder - would use actual Strands Agent)
        # response = await self._agent.ainvoke(prompt)
        response_content = f"[Agent Response to: {prompt[:50]}...]"
        if rag_context:
            response_content += f"\n\n[RAG Context: {len(rag_chunks)} chunks retrieved]"
        tool_calls: list[dict[str, Any]] = []
        
        # 6. Save interaction for episode detection
        await self._episodic_service.save_interaction(
            session_id=session_id,
            user_id=user_id,
            user_message=prompt,
            assistant_response=response_content,
            tool_calls=tool_calls,
            tenant_id=tenant_id,
        )
        
        logger.info(
            "agent_invocation_complete",
            session_id=session_id,
            user_id=user_id,
            episodes_used=len(episodes),
            reflections_used=len(reflections),
            rag_chunks_used=len(rag_chunks),
        )
        
        return {
            "content": response_content,
            "tool_calls": tool_calls,
            "episodes_used": len(episodes),
            "reflections_used": len(reflections),
            "rag_chunks_used": len(rag_chunks),
        }
    
    def _build_rag_context(self, chunks: list[dict[str, Any]]) -> str:
        """Build RAG context from retrieved chunks.
        
        Args:
            chunks: List of retrieved document chunks
        
        Returns:
            Formatted context string for the prompt
        """
        if not chunks:
            return ""
        
        context_parts = ["## 関連ドキュメント (Knowledge Base):\n"]
        for i, chunk in enumerate(chunks[:5], 1):
            content = chunk.get("content", "")[:500]
            source = chunk.get("source", "Unknown")
            score = chunk.get("score", 0.0)
            context_parts.append(f"### Document {i} (Score: {score:.2f})")
            context_parts.append(f"Source: {source}")
            context_parts.append(f"{content}\n")
        
        return "\n".join(context_parts)
    
    async def stream(
        self,
        prompt: str,
        session_id: str,
        user_id: str,
        tenant_id: str | None = None,
    ):
        """Stream agent response.
        
        Yields response chunks as they are generated.
        
        Args:
            prompt: User's input prompt
            session_id: Session identifier
            user_id: User identifier
            tenant_id: Optional tenant identifier
        
        Yields:
            Response chunks (strings)
        """
        # 1. RAG: Retrieve relevant documents from Knowledge Base
        rag_context = ""
        rag_chunk_count = 0
        if self._s3vector_client:
            try:
                rag_results = await self._s3vector_client.search(
                    query=prompt,
                    tenant_id=tenant_id or "default",
                    top_k=5,
                )
                rag_chunk_count = len(rag_results)
                if rag_results:
                    rag_context = self._build_rag_context(rag_results)
                    logger.info(
                        "rag_context_retrieved_for_stream",
                        chunk_count=rag_chunk_count,
                        session_id=session_id,
                    )
            except Exception as e:
                logger.warning("rag_retrieval_failed_stream", error=str(e))
        
        # 2. Retrieve episodic context
        episodes = await self._episodic_service.retrieve_similar_episodes(
            user_id=user_id,
            query=prompt,
            tenant_id=tenant_id,
        )
        
        # 3. Retrieve reflection context
        reflections = await self._reflection_service.retrieve_relevant_reflections(
            user_id=user_id,
            use_case=prompt,
            tenant_id=tenant_id,
        )
        
        # 4. Stream response (placeholder)
        # In production: async for chunk in self._agent.stream_async(prompt):
        full_response = ""
        chunks = [
            "お問い合わせ",
            "ありがとう",
            "ございます。",
            "\n\n",
        ]
        
        # Add RAG-based response if context available
        if rag_context:
            chunks.extend([
                f"Knowledge Baseから",
                f"{rag_chunk_count}件の",
                "関連ドキュメントを",
                "参照して",
                "お答えします。",
                "\n\n",
            ])
        
        chunks.extend([
            f"ご質問「{prompt[:30]}...」",
            "について",
            "お答えします。",
        ])
        
        for chunk in chunks:
            full_response += chunk
            yield chunk
        
        # 5. Save interaction after streaming completes
        await self._episodic_service.save_interaction(
            session_id=session_id,
            user_id=user_id,
            user_message=prompt,
            assistant_response=full_response,
            tool_calls=[],
            tenant_id=tenant_id,
        )
        
        logger.info(
            "agent_streaming_complete",
            session_id=session_id,
            user_id=user_id,
            response_length=len(full_response),
            rag_chunks_used=rag_chunk_count,
            episodes_used=len(episodes),
            reflections_used=len(reflections),
        )


def create_agent(
    container: Any,
    config: AgentConfig | None = None,
    tenant_id: str | None = None,
) -> StrandsAgentWrapper:
    """Convenience function to create an agent.
    
    Args:
        container: DI container
        config: Optional agent configuration
        tenant_id: Optional tenant ID
    
    Returns:
        Configured StrandsAgentWrapper
    """
    factory = AgentFactory(container)
    return factory.create_agent(config=config, tenant_id=tenant_id)
