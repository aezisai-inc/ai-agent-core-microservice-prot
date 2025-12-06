"""DynamoDB Event Store implementation."""

from typing import Any

import boto3
import structlog
from boto3.dynamodb.conditions import Key

from ....domain.shared import DomainEvent

logger = structlog.get_logger()


class DynamoDBEventStore:
    """Event Store implementation using DynamoDB.

    Stores domain events for event sourcing. Events are stored
    with the aggregate ID as the partition key and version as
    the sort key for efficient retrieval.
    """

    def __init__(
        self,
        table_name: str,
        region_name: str = "ap-northeast-1",
    ):
        self._dynamodb = boto3.resource("dynamodb", region_name=region_name)
        self._table = self._dynamodb.Table(table_name)
        self._table_name = table_name

    async def append(self, event: DomainEvent) -> None:
        """Append an event to the store.

        Uses optimistic concurrency control via conditional writes.
        """
        item = {
            "pk": f"{event.aggregate_type}#{event.aggregate_id}",
            "sk": f"v{event.version:010d}",
            "event_id": event.event_id,
            "event_type": event.event_type,
            "aggregate_id": event.aggregate_id,
            "aggregate_type": event.aggregate_type,
            "version": event.version,
            "timestamp": event.timestamp.isoformat(),
            "data": event.model_dump(),
            "metadata": event.metadata,
        }

        try:
            # Conditional write to prevent duplicate versions
            self._table.put_item(
                Item=item,
                ConditionExpression="attribute_not_exists(pk) AND attribute_not_exists(sk)",
            )

            logger.info(
                "event_stored",
                event_type=event.event_type,
                aggregate_id=event.aggregate_id,
                version=event.version,
            )

        except self._dynamodb.meta.client.exceptions.ConditionalCheckFailedException:
            logger.error(
                "event_store_conflict",
                event_type=event.event_type,
                aggregate_id=event.aggregate_id,
                version=event.version,
            )
            raise ConcurrencyError(
                f"Event version {event.version} already exists for {event.aggregate_id}"
            ) from None

    async def get_events(
        self,
        aggregate_id: str,
        aggregate_type: str,
        from_version: int = 0,
    ) -> list[dict[str, Any]]:
        """Get events for an aggregate from a specific version.

        Returns events in order of version.
        """
        pk = f"{aggregate_type}#{aggregate_id}"
        sk_start = f"v{from_version:010d}"

        response = self._table.query(
            KeyConditionExpression=Key("pk").eq(pk) & Key("sk").gte(sk_start),
            ScanIndexForward=True,  # Ascending order by version
        )

        events = []
        for item in response.get("Items", []):
            events.append(item.get("data", {}))

        return events

    async def get_all_events(
        self,
        aggregate_id: str,
        aggregate_type: str,
    ) -> list[dict[str, Any]]:
        """Get all events for an aggregate."""
        return await self.get_events(aggregate_id, aggregate_type, from_version=0)

    async def get_latest_version(
        self,
        aggregate_id: str,
        aggregate_type: str,
    ) -> int:
        """Get the latest version number for an aggregate."""
        pk = f"{aggregate_type}#{aggregate_id}"

        response = self._table.query(
            KeyConditionExpression=Key("pk").eq(pk),
            ScanIndexForward=False,  # Descending order
            Limit=1,
        )

        items = response.get("Items", [])
        if not items:
            return 0

        return items[0].get("version", 0)


class ConcurrencyError(Exception):
    """Raised when there's a concurrency conflict in event storage."""

    pass
