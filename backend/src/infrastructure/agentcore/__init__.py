"""AgentCore infrastructure components.

This package contains clients and services for interacting with
Amazon Bedrock AgentCore, including:
- Memory Client (Short-term, Episodic, Semantic)
- Episodic Memory Service
- Reflection Service
- Session Memory Service
- Tenant Memory Service (Multi-tenant support)
"""

from src.infrastructure.agentcore.memory_client import (
    AgentCoreMemoryClient,
    MemoryStrategy,
)
from src.infrastructure.agentcore.episodic_memory import (
    Episode,
    EpisodicMemoryService,
)
from src.infrastructure.agentcore.reflection_service import (
    Reflection,
    ReflectionService,
)
from src.infrastructure.agentcore.memory_config import MemoryConfig
from src.infrastructure.agentcore.session_memory import (
    Message,
    SessionContext,
    SessionMemoryService,
)
from src.infrastructure.agentcore.tenant_memory import (
    TenantConfig,
    TenantMemoryService,
)

__all__ = [
    "AgentCoreMemoryClient",
    "MemoryStrategy",
    "Episode",
    "EpisodicMemoryService",
    "Reflection",
    "ReflectionService",
    "MemoryConfig",
    "Message",
    "SessionContext",
    "SessionMemoryService",
    "TenantConfig",
    "TenantMemoryService",
]
