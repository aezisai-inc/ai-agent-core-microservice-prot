"""Base Value Object class for all domain value objects."""

from abc import ABC

from pydantic import BaseModel, ConfigDict


class ValueObject(BaseModel, ABC):
    """Base class for all domain value objects.

    Value objects are immutable and are distinguished by their attributes
    rather than identity. They encapsulate validation and domain logic.
    """

    model_config = ConfigDict(frozen=True)

    def __eq__(self, other: object) -> bool:
        if not isinstance(other, ValueObject):
            return False
        return self.model_dump() == other.model_dump()

    def __hash__(self) -> int:
        return hash(tuple(sorted(self.model_dump().items())))
