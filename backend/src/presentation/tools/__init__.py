"""Strands Agent tools module.

This module contains tool definitions for the Strands Agent.
Tools are defined using the @tool decorator and provide
specific capabilities to the agent.

Available Tools:
    - create_knowledge_tool: Search knowledge base (RAG retrieval)
    - create_knowledge_generator_tool: Generate knowledge docs from chat history
"""

from src.presentation.tools.knowledge_tool import (
    create_knowledge_tool,
    search_knowledge_base,
)
from src.presentation.tools.knowledge_generator_tool import (
    create_knowledge_generator_tool,
    generate_knowledge_document,
)

__all__ = [
    # Knowledge search (RAG)
    "create_knowledge_tool",
    "search_knowledge_base",
    # Knowledge generation
    "create_knowledge_generator_tool",
    "generate_knowledge_document",
]
