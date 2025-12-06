"""Response value object."""

from pydantic import Field, field_validator

from ...shared import ValueObject


class Source(ValueObject):
    """Value object representing a source document used in the response."""

    chunk_id: str
    document_id: str
    content: str
    score: float
    metadata: dict[str, str] = Field(default_factory=dict)


class Response(ValueObject):
    """Value object representing a response from the AI agent."""

    content: str
    tokens_used: int
    model: str
    latency_ms: int
    sources: list[Source] = Field(default_factory=list)

    @field_validator("tokens_used")
    @classmethod
    def validate_tokens(cls, v: int) -> int:
        """Validate that tokens_used is positive."""
        if v < 0:
            raise ValueError("tokens_used cannot be negative")
        return v

    @field_validator("latency_ms")
    @classmethod
    def validate_latency(cls, v: int) -> int:
        """Validate that latency_ms is positive."""
        if v < 0:
            raise ValueError("latency_ms cannot be negative")
        return v

    @property
    def has_sources(self) -> bool:
        """Check if the response has source documents."""
        return len(self.sources) > 0

    @property
    def source_count(self) -> int:
        """Get the number of sources."""
        return len(self.sources)
