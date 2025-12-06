"""Chat Lambda Handler."""

import json
import os
from typing import Any

from aws_lambda_powertools import Logger, Tracer
from aws_lambda_powertools.event_handler import APIGatewayRestResolver
from aws_lambda_powertools.logging import correlation_paths
from aws_lambda_powertools.utilities.typing import LambdaContext

from ...application.commands import SubmitQuestionCommand, SubmitQuestionHandler
from ...infrastructure.external_services import BedrockLLMClient, S3VectorClient
from ...infrastructure.persistence import DynamoDBEventStore

# Initialize Powertools
logger = Logger()
tracer = Tracer()
app = APIGatewayRestResolver()

# Environment variables
KNOWLEDGE_BASE_ID = os.environ.get("KNOWLEDGE_BASE_ID", "")
EVENT_STORE_TABLE = os.environ.get("EVENT_STORE_TABLE", "agentic-rag-events")
REGION = os.environ.get("AWS_REGION", "ap-northeast-1")


class InMemoryAgentRepository:
    """Temporary in-memory repository for demo purposes."""

    _agents: dict = {}

    async def save(self, agent: Any) -> None:
        self._agents[str(agent.id)] = agent

    async def get_by_id(self, agent_id: Any) -> Any:
        return self._agents.get(str(agent_id))

    async def get_by_tenant(self, tenant_id: str) -> list:
        return [a for a in self._agents.values() if a.tenant_id == tenant_id]

    async def delete(self, agent_id: Any) -> None:
        self._agents.pop(str(agent_id), None)


class InMemorySessionRepository:
    """Temporary in-memory repository for demo purposes."""

    _sessions: dict = {}

    async def save(self, session: Any) -> None:
        self._sessions[str(session.id)] = session

    async def get_by_id(self, session_id: str) -> Any:
        return self._sessions.get(session_id)

    async def get_active_by_user(self, user_id: str, agent_id: Any) -> Any:
        for session in self._sessions.values():
            if session.user_id == user_id and str(session.agent_id) == str(agent_id):
                if session.is_active:
                    return session
        return None

    async def get_by_user(self, user_id: str) -> list:
        return [s for s in self._sessions.values() if s.user_id == user_id]


@app.post("/api/v1/chat")
@tracer.capture_method
def chat():
    """Handle chat requests."""
    body = app.current_event.json_body

    # Extract request data
    question = body.get("question", "")
    session_id = body.get("session_id", "")
    agent_id = body.get("agent_id", "")

    # Extract user info from Cognito claims
    claims = app.current_event.request_context.authorizer or {}
    user_id = claims.get("sub", "anonymous")
    tenant_id = claims.get("custom:tenant_id", "default")

    if not question:
        return {
            "statusCode": 400,
            "body": json.dumps({"error": "Question is required"}),
        }

    # Create command
    command = SubmitQuestionCommand(
        session_id=session_id,
        agent_id=agent_id,
        user_id=user_id,
        tenant_id=tenant_id,
        question=question,
    )

    # Initialize dependencies
    vector_search = S3VectorClient(
        knowledge_base_id=KNOWLEDGE_BASE_ID,
        region_name=REGION,
    )
    llm_service = BedrockLLMClient(region_name=REGION)
    event_store = DynamoDBEventStore(
        table_name=EVENT_STORE_TABLE,
        region_name=REGION,
    )

    # This is simplified - in production, use proper DI
    handler = SubmitQuestionHandler(
        agent_repository=InMemoryAgentRepository(),
        session_repository=InMemorySessionRepository(),
        vector_search=vector_search,
        llm_service=llm_service,
        event_store=event_store,
    )

    # Note: This is a sync endpoint for simplicity
    # In production, use async Lambda or API Gateway WebSocket for streaming
    import asyncio

    result = asyncio.get_event_loop().run_until_complete(handler.handle(command))

    return {
        "statusCode": 200,
        "body": json.dumps(
            {
                "response": result.response_content,
                "tokens_used": result.tokens_used,
                "latency_ms": result.latency_ms,
                "sources": result.sources,
            }
        ),
    }


@app.get("/api/v1/health")
def health():
    """Health check endpoint."""
    return {
        "statusCode": 200,
        "body": json.dumps({"status": "healthy"}),
    }


@logger.inject_lambda_context(correlation_id_path=correlation_paths.API_GATEWAY_REST)
@tracer.capture_lambda_handler
def handler(event: dict, context: LambdaContext) -> dict:
    """Lambda handler entry point."""
    return app.resolve(event, context)
