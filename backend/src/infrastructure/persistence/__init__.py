"""Persistence layer - Event store and repositories."""

from .event_store.dynamodb_event_store import DynamoDBEventStore

__all__ = ["DynamoDBEventStore"]
