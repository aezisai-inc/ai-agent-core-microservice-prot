"""Base Entity class for all domain entities."""

from abc import ABC
from datetime import datetime
from typing import Any, Generic, TypeVar

from pydantic import BaseModel, ConfigDict, PrivateAttr

from .domain_event import DomainEvent

IdType = TypeVar("IdType")


class Entity(BaseModel, ABC, Generic[IdType]):
    """Base class for all domain entities.

    Entities have identity and a lifecycle. They are mutable
    and are distinguished by their identity rather than attributes.
    """

    model_config = ConfigDict(
        frozen=False,
        arbitrary_types_allowed=True,
    )

    id: Any  # Will be overridden by subclasses
    created_at: datetime
    updated_at: datetime

    _domain_events: list[DomainEvent] = PrivateAttr(default_factory=list)

    def __eq__(self, other: object) -> bool:
        if not isinstance(other, Entity):
            return False
        return self.id == other.id

    def __hash__(self) -> int:
        return hash(str(self.id))

    def add_domain_event(self, event: DomainEvent) -> None:
        """Add a domain event to be published."""
        self._domain_events.append(event)

    def clear_domain_events(self) -> list[DomainEvent]:
        """Clear and return all domain events."""
        events = self._domain_events.copy()
        self._domain_events = []
        return events


class AggregateRoot(Entity[IdType], Generic[IdType]):
    """Base class for aggregate roots.

    Aggregate roots are the entry points to aggregates and ensure
    consistency boundaries within the domain.
    """

    version: int = 0

    def increment_version(self) -> None:
        """Increment the aggregate version for optimistic concurrency."""
        self.version += 1
