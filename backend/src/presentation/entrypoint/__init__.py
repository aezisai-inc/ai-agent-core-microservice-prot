"""AgentCore Runtime entrypoint module.

This module provides the entry point for the Strands Agent
running on AgentCore Runtime.
"""

from src.presentation.entrypoint.agent_factory import (
    create_agent,
    AgentConfig,
)
from src.presentation.entrypoint.prompts import (
    SYSTEM_PROMPT,
    build_system_prompt,
)

__all__ = [
    "create_agent",
    "AgentConfig",
    "SYSTEM_PROMPT",
    "build_system_prompt",
]
