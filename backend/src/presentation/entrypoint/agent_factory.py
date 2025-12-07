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
        
        logger.info(
            "creating_strands_agent",
            model_id=config.model_id,
            tool_count=len(tools),
            tenant_id=tenant_id,
        )
        
        return StrandsAgentWrapper(
            config=config,
            tools=tools,
            episodic_service=self._container.episodic_memory_service,
            reflection_service=self._container.reflection_service,
        )
    
    def _create_tools(self, tenant_id: str | None = None) -> list[Callable[..., Any]]:
        """Create tool functions with injected dependencies.
        
        Args:
            tenant_id: Tenant ID for tool isolation
        
        Returns:
            List of tool functions
        """
        tools: list[Callable[..., Any]] = []
        
        # Knowledge base search tool
        # Note: vector_client would come from container in real implementation
        # tools.append(create_knowledge_tool(
        #     vector_client=self._container.vector_client,
        #     tenant_id=tenant_id,
        # ))
        
        return tools


class StrandsAgentWrapper:
    """Wrapper around Strands Agent with memory integration.
    
    This wrapper provides:
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
    ):
        """Initialize the agent wrapper.
        
        Args:
            config: Agent configuration
            tools: List of tool functions
            episodic_service: EpisodicMemoryService instance
            reflection_service: ReflectionService instance
        """
        self._config = config
        self._tools = tools
        self._episodic_service = episodic_service
        self._reflection_service = reflection_service
        
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
        # 1. Retrieve episodic context
        episodes = await self._episodic_service.retrieve_similar_episodes(
            user_id=user_id,
            query=prompt,
            tenant_id=tenant_id,
        )
        episodic_context = self._episodic_service.build_episode_context(episodes)
        
        # 2. Retrieve reflection context
        reflections = await self._reflection_service.retrieve_relevant_reflections(
            user_id=user_id,
            use_case=prompt,
            tenant_id=tenant_id,
        )
        reflection_context = self._reflection_service.build_reflection_prompt(reflections)
        
        # 3. Build enriched system prompt
        from src.presentation.entrypoint.prompts import build_system_prompt
        enriched_prompt = build_system_prompt(
            session_id=session_id,
            user_id=user_id,
            tenant_id=tenant_id or "",
            episodic_context=episodic_context,
            reflection_context=reflection_context,
            base_prompt=self._config.system_prompt,
        )
        
        # 4. Invoke agent (placeholder - would use actual Strands Agent)
        # response = await self._agent.ainvoke(prompt)
        response_content = f"[Agent Response to: {prompt[:50]}...]"
        tool_calls: list[dict[str, Any]] = []
        
        # 5. Save interaction for episode detection
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
        )
        
        return {
            "content": response_content,
            "tool_calls": tool_calls,
            "episodes_used": len(episodes),
            "reflections_used": len(reflections),
        }
    
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
        # 1. Retrieve context (same as invoke)
        episodes = await self._episodic_service.retrieve_similar_episodes(
            user_id=user_id,
            query=prompt,
            tenant_id=tenant_id,
        )
        
        reflections = await self._reflection_service.retrieve_relevant_reflections(
            user_id=user_id,
            use_case=prompt,
            tenant_id=tenant_id,
        )
        
        # 2. Stream response (placeholder)
        # In production: async for chunk in self._agent.stream_async(prompt):
        full_response = ""
        chunks = [
            "お問い合わせ",
            "ありがとう",
            "ございます。",
            "\n\n",
            f"ご質問「{prompt[:30]}...」",
            "について",
            "お答えします。",
        ]
        
        for chunk in chunks:
            full_response += chunk
            yield chunk
        
        # 3. Save interaction after streaming completes
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
