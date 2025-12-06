"""Prompt value object."""

from enum import Enum

from pydantic import field_validator

from ...shared import ValueObject


class MessageRole(str, Enum):
    """Role of the message sender."""

    USER = "user"
    ASSISTANT = "assistant"
    SYSTEM = "system"


class Prompt(ValueObject):
    """Value object representing a prompt to the AI agent."""

    content: str
    role: MessageRole = MessageRole.USER

    @field_validator("content")
    @classmethod
    def validate_content(cls, v: str) -> str:
        """Validate that the content is not empty."""
        if not v or not v.strip():
            raise ValueError("Prompt content cannot be empty")
        return v.strip()

    @property
    def token_estimate(self) -> int:
        """Rough estimate of token count (4 chars ≈ 1 token)."""
        return len(self.content) // 4

    def __str__(self) -> str:
        return f"[{self.role.value}] {self.content[:50]}..."
