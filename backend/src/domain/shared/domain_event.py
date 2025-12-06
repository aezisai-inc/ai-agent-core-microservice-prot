"""Base Domain Event class for all domain events."""

from abc import ABC
from datetime import datetime
from typing import Any
from uuid import uuid4

from pydantic import BaseModel, ConfigDict, Field


class DomainEvent(BaseModel, ABC):
    """Base class for all domain events.

    Domain events represent something that happened in the domain.
    They are immutable and capture the state at the time of the event.
    """

    model_config = ConfigDict(frozen=True)

    event_id: str = Field(default_factory=lambda: str(uuid4()))
    event_type: str = ""
    timestamp: datetime = Field(default_factory=datetime.utcnow)
    aggregate_id: str = ""
    aggregate_type: str = ""
    version: int = 0
    metadata: dict[str, Any] = Field(default_factory=dict)

    def model_post_init(self, __context: Any) -> None:
        """Set event_type after initialization."""
        object.__setattr__(self, "event_type", self.__class__.__name__)

    def to_dict(self) -> dict[str, Any]:
        """Convert event to dictionary for serialization."""
        return self.model_dump()

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> "DomainEvent":
        """Create event from dictionary."""
        return cls(**data)
