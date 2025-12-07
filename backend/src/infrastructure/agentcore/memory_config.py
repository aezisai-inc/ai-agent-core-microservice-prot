"""AgentCore Memory configuration settings."""

from pydantic_settings import BaseSettings


class MemoryConfig(BaseSettings):
    """Configuration for AgentCore Memory services.
    
    Settings for episodic memory, reflections, and memory retrieval.
    All settings can be overridden via environment variables with
    the AGENTCORE_MEMORY_ prefix.
    """

    # Memory Store ID (required)
    memory_store_id: str = ""
    
    # AWS Region
    region: str = "ap-northeast-1"

    # Episodic Memory Settings
    max_episodes_per_query: int = 3
    episode_context_max_chars: int = 2000
    episode_namespace_prefix: str = "/episodes"
    
    # Reflection Settings
    max_reflections_per_query: int = 2
    reflection_context_max_chars: int = 1000
    reflection_namespace_prefix: str = "/reflections"
    
    # Semantic Memory Settings
    semantic_namespace_prefix: str = "/facts"
    max_facts_per_query: int = 5
    
    # Multi-tenant Settings
    enable_tenant_isolation: bool = True
    tenant_namespace_prefix: str = "/tenant"
    
    # Performance Settings
    enable_memory_cache: bool = True
    cache_ttl_seconds: int = 300
    
    # Session Settings
    session_timeout_minutes: int = 30
    max_messages_per_session: int = 100

    class Config:
        env_prefix = "AGENTCORE_MEMORY_"
        env_file = ".env"
