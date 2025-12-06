"""Model Parameters value object."""

from pydantic import field_validator

from ...shared import ValueObject


class ModelParameters(ValueObject):
    """Value object representing LLM model parameters."""

    model_id: str
    temperature: float = 0.7
    max_tokens: int = 4096
    top_p: float = 0.9

    @field_validator("temperature")
    @classmethod
    def validate_temperature(cls, v: float) -> float:
        """Validate temperature is between 0 and 1."""
        if not 0 <= v <= 1:
            raise ValueError("Temperature must be between 0 and 1")
        return v

    @field_validator("max_tokens")
    @classmethod
    def validate_max_tokens(cls, v: int) -> int:
        """Validate max_tokens is positive and reasonable."""
        if v <= 0:
            raise ValueError("max_tokens must be positive")
        if v > 100000:
            raise ValueError("max_tokens cannot exceed 100000")
        return v

    @field_validator("top_p")
    @classmethod
    def validate_top_p(cls, v: float) -> float:
        """Validate top_p is between 0 and 1."""
        if not 0 <= v <= 1:
            raise ValueError("top_p must be between 0 and 1")
        return v

    @classmethod
    def default_claude(cls) -> "ModelParameters":
        """Create default parameters for Claude model."""
        return cls(
            model_id="anthropic.claude-3-sonnet-20240229-v1:0",
            temperature=0.7,
            max_tokens=4096,
            top_p=0.9,
        )
