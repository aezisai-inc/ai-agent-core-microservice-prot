"""AgentCore Runtime Entrypoint.

This is the main entry point for the Strands Agent running on
Amazon Bedrock AgentCore Runtime. It handles:
- Agent initialization
- Request routing
- Streaming responses
- Memory integration

Usage:
    # Local testing
    agentcore configure --entrypoint agent.py
    agentcore launch --local
    agentcore invoke --local '{"prompt": "Hello"}'
    
    # Cloud deployment
    agentcore launch
    agentcore invoke '{"prompt": "Hello"}'
"""

import json
from typing import Any, AsyncIterator

import structlog

# AgentCore SDK
from bedrock_agentcore import BedrockAgentCoreApp

from src.infrastructure.config import get_container
from src.presentation.entrypoint.agent_factory import create_agent, AgentConfig

logger = structlog.get_logger()


# ============================================================================
# Agent Initialization
# ============================================================================

# Create the AgentCore app
app = BedrockAgentCoreApp()

# Initialize DI container and agent (lazy loading)
_agent = None


def get_agent():
    """Get or create the agent instance (singleton pattern)."""
    global _agent
    if _agent is None:
        container = get_container()
        _agent = create_agent(
            container=container,
            config=AgentConfig(
                model_id="us.amazon.nova-pro-v1:0",
                max_iterations=10,
                temperature=0.7,
            ),
        )
        logger.info("agent_initialized")
    return _agent


# ============================================================================
# AgentCore Entrypoint
# ============================================================================

@app.entrypoint
async def invoke(payload: dict[str, Any]) -> AsyncIterator[str]:
    """AgentCore Runtime entrypoint.
    
    This function is called by AgentCore Runtime for each invocation.
    It handles:
    1. Parsing the input payload
    2. Retrieving episodic memory context
    3. Streaming the agent response
    4. Saving interactions for future episode detection
    
    Args:
        payload: Request payload with the following structure:
            {
                "prompt": "User's question",
                "session_id": "sess-123",
                "user_id": "user-456",
                "tenant_id": "tenant-789",  # optional
                "stream": true  # optional, default true
            }
    
    Yields:
        Response chunks as strings (SSE format)
    """
    # Extract parameters from payload
    prompt = payload.get("prompt", "")
    session_id = payload.get("session_id", "default-session")
    user_id = payload.get("user_id", "default-user")
    tenant_id = payload.get("tenant_id")
    stream = payload.get("stream", True)
    
    if not prompt:
        yield json.dumps({"error": "prompt is required"})
        return
    
    logger.info(
        "agentcore_invocation_started",
        session_id=session_id,
        user_id=user_id,
        tenant_id=tenant_id,
        prompt_preview=prompt[:50],
    )
    
    try:
        agent = get_agent()
        
        if stream:
            # Streaming response
            async for chunk in agent.stream(
                prompt=prompt,
                session_id=session_id,
                user_id=user_id,
                tenant_id=tenant_id,
            ):
                # Format as SSE data
                yield f"data: {json.dumps({'content': chunk})}\n\n"
            
            # Send completion signal
            yield "data: [DONE]\n\n"
        else:
            # Non-streaming response
            result = await agent.invoke(
                prompt=prompt,
                session_id=session_id,
                user_id=user_id,
                tenant_id=tenant_id,
            )
            yield json.dumps(result)
        
        logger.info(
            "agentcore_invocation_completed",
            session_id=session_id,
            user_id=user_id,
        )
        
    except Exception as e:
        logger.error(
            "agentcore_invocation_error",
            error=str(e),
            session_id=session_id,
            user_id=user_id,
        )
        yield json.dumps({"error": str(e)})


# ============================================================================
# Health Check Endpoint
# ============================================================================

async def health_check() -> dict[str, Any]:
    """Health check for the agent runtime.
    
    Returns:
        Health status dictionary
    """
    try:
        container = get_container()
        memory_healthy = await container.memory_client.health_check()
        
        return {
            "status": "healthy" if memory_healthy else "degraded",
            "components": {
                "memory": "healthy" if memory_healthy else "unhealthy",
                "agent": "healthy",
            },
        }
    except Exception as e:
        return {
            "status": "unhealthy",
            "error": str(e),
        }


# ============================================================================
# Main Entry Point
# ============================================================================

if __name__ == "__main__":
    # Start the AgentCore Runtime
    app.run()
    
    # For local testing, you can also run:
    # asyncio.run(test_invoke())

async def test_invoke():
    """Test function for local development."""
    test_payload = {
        "prompt": "製品の返品方法を教えてください",
        "session_id": "test-session-001",
        "user_id": "test-user-001",
        "tenant_id": "test-tenant",
    }
    
    print("Testing agent invocation...")
    async for chunk in invoke(test_payload):
        print(chunk, end="", flush=True)
    print("\nDone!")
