"""Agent ID value object."""

from uuid import uuid4

from pydantic import field_validator

from ...shared import ValueObject


class AgentId(ValueObject):
    """Value object representing an Agent identifier."""

    value: str

    @field_validator("value")
    @classmethod
    def validate_value(cls, v: str) -> str:
        """Validate that the value is not empty."""
        if not v or not v.strip():
            raise ValueError("AgentId cannot be empty")
        return v.strip()

    @classmethod
    def generate(cls) -> "AgentId":
        """Generate a new unique AgentId."""
        return cls(value=f"agent-{uuid4().hex[:12]}")

    def __str__(self) -> str:
        return self.value
