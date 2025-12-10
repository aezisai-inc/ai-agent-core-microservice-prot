"""AG-UI Protocol Entrypoint for AgentCore Runtime.

This module provides an AG-UI compatible endpoint that can be called
by CopilotKit Runtime. It wraps the existing Strands Agent without
modifying the original agent.py.

Note:
    - This is a separate entrypoint from the existing invoke()
    - Both entrypoints share the same Strands Agent configuration
    - No changes to existing code required

AG-UI Protocol Reference:
    https://docs.ag-ui.com/

Usage:
    This file can be used as an alternative entrypoint for AgentCore Runtime
    when AG-UI protocol support is needed.
"""

import json
import os
from typing import Any, AsyncGenerator, Iterator

import structlog
from strands import Agent

logger = structlog.get_logger()

# ============================================================================
# Agent Setup (既存 agent.py と同じ設定を共有)
# ============================================================================

MODEL_ID = os.environ.get("BEDROCK_MODEL_ID", "apac.amazon.nova-pro-v1:0")

SYSTEM_PROMPT = """あなたは優秀なカスタマーサポートアシスタントです。
ユーザーの質問に対して、丁寧かつ的確に回答してください。

## 回答のガイドライン
- 簡潔で分かりやすい言葉を使う
- 必要に応じて箇条書きを使用する
- 不明な点があれば確認する
- Markdown形式で見やすく整形する
"""

# Strands Agent (既存 agent.py と同じ設定)
agent = Agent(
    model=MODEL_ID,
    system_prompt=SYSTEM_PROMPT,
)

logger.info("ag_ui_agent_initialized", model_id=MODEL_ID)


# ============================================================================
# AG-UI Protocol Types
# ============================================================================

class AgUiEventType:
    """AG-UI Protocol event types."""
    
    RUN_STARTED = "RUN_STARTED"
    RUN_FINISHED = "RUN_FINISHED"
    RUN_ERROR = "RUN_ERROR"
    TEXT_MESSAGE_START = "TEXT_MESSAGE_START"
    TEXT_MESSAGE_CONTENT = "TEXT_MESSAGE_CONTENT"
    TEXT_MESSAGE_END = "TEXT_MESSAGE_END"
    TOOL_CALL_START = "TOOL_CALL_START"
    TOOL_CALL_ARGS = "TOOL_CALL_ARGS"
    TOOL_CALL_END = "TOOL_CALL_END"


# ============================================================================
# AG-UI Protocol Handler
# ============================================================================

class AgUiProtocolHandler:
    """AG-UI Protocol message handler.
    
    Translates between AG-UI protocol format and Strands Agent.
    
    AG-UI Event Types:
        - RUN_STARTED: Agent run started
        - RUN_FINISHED: Agent run completed
        - RUN_ERROR: Error occurred
        - TEXT_MESSAGE_START: Start of assistant message
        - TEXT_MESSAGE_CONTENT: Streaming text content
        - TEXT_MESSAGE_END: End of assistant message
    """
    
    def __init__(self, strands_agent: Agent):
        """Initialize handler with Strands Agent.
        
        Args:
            strands_agent: Configured Strands Agent instance
        """
        self._agent = strands_agent
    
    def _extract_user_message(self, messages: list[dict[str, Any]]) -> str:
        """Extract the latest user message from AG-UI messages.
        
        Args:
            messages: List of messages in AG-UI format
        
        Returns:
            User message string
        """
        for msg in reversed(messages):
            if msg.get("role") == "user":
                content = msg.get("content", "")
                if isinstance(content, str):
                    return content
                elif isinstance(content, list):
                    # Handle content array format: [{"type": "text", "text": "..."}]
                    parts = []
                    for item in content:
                        if isinstance(item, dict):
                            if "text" in item:
                                parts.append(item["text"])
                            elif "content" in item:
                                parts.append(item["content"])
                    return " ".join(parts)
        return ""
    
    def handle_request(
        self,
        messages: list[dict[str, Any]],
        thread_id: str,
        run_id: str | None = None,
    ) -> Iterator[dict[str, Any]]:
        """Handle AG-UI protocol request (synchronous).
        
        Args:
            messages: List of conversation messages in AG-UI format
            thread_id: Thread/session identifier
            run_id: Optional run identifier
        
        Yields:
            AG-UI protocol events
        """
        user_message = self._extract_user_message(messages)
        
        if not user_message:
            yield {
                "type": AgUiEventType.RUN_ERROR,
                "threadId": thread_id,
                "error": "No user message found in request",
            }
            return
        
        message_id = f"msg-{thread_id}-{run_id or 'default'}"
        
        logger.info(
            "ag_ui_request_started",
            thread_id=thread_id,
            run_id=run_id,
            message_preview=user_message[:50],
        )
        
        # Emit RUN_STARTED
        yield {
            "type": AgUiEventType.RUN_STARTED,
            "threadId": thread_id,
            "runId": run_id,
        }
        
        # Emit TEXT_MESSAGE_START
        yield {
            "type": AgUiEventType.TEXT_MESSAGE_START,
            "messageId": message_id,
            "role": "assistant",
        }
        
        try:
            # Invoke Strands Agent
            result = self._agent(user_message)
            
            # Extract response text
            response_text = ""
            if hasattr(result, "message"):
                response_text = result.message
            elif hasattr(result, "content"):
                response_text = str(result.content)
            else:
                response_text = str(result)
            
            # Emit TEXT_MESSAGE_CONTENT (single chunk for non-streaming)
            yield {
                "type": AgUiEventType.TEXT_MESSAGE_CONTENT,
                "messageId": message_id,
                "delta": response_text,
            }
            
            # Emit TEXT_MESSAGE_END
            yield {
                "type": AgUiEventType.TEXT_MESSAGE_END,
                "messageId": message_id,
            }
            
            # Emit RUN_FINISHED
            yield {
                "type": AgUiEventType.RUN_FINISHED,
                "threadId": thread_id,
                "runId": run_id,
            }
            
            logger.info(
                "ag_ui_request_completed",
                thread_id=thread_id,
                response_length=len(response_text),
            )
            
        except Exception as e:
            logger.error(
                "ag_ui_request_error",
                thread_id=thread_id,
                error=str(e),
            )
            yield {
                "type": AgUiEventType.RUN_ERROR,
                "threadId": thread_id,
                "error": str(e),
            }


# Global handler instance
ag_ui_handler = AgUiProtocolHandler(agent)


# ============================================================================
# AgentCore Entrypoint (AG-UI Protocol)
# ============================================================================

def ag_ui_invoke(payload: dict[str, Any]) -> Iterator[str]:
    """AG-UI Protocol entrypoint for AgentCore Runtime.
    
    This function handles AG-UI protocol requests and yields SSE-formatted
    responses. It can be registered as an alternative entrypoint in
    AgentCore Runtime.
    
    Args:
        payload: AG-UI request payload containing:
            - messages: List of conversation messages
            - threadId: Thread identifier (maps to session)
            - runId: Optional run identifier
    
    Yields:
        SSE-formatted event strings (data: {...}\n\n)
    """
    messages = payload.get("messages", [])
    thread_id = payload.get("threadId", payload.get("thread_id", "default-thread"))
    run_id = payload.get("runId", payload.get("run_id"))
    
    for event in ag_ui_handler.handle_request(messages, thread_id, run_id):
        yield f"data: {json.dumps(event)}\n\n"


# ============================================================================
# HTTP Endpoint (FastAPI style for local testing / Lambda)
# ============================================================================

def create_fastapi_app():
    """Create FastAPI app for local testing.
    
    Returns:
        FastAPI application with AG-UI endpoint
    """
    try:
        from fastapi import FastAPI, Request
        from fastapi.responses import StreamingResponse
        from fastapi.middleware.cors import CORSMiddleware
    except ImportError:
        logger.warning("FastAPI not installed, skipping HTTP endpoint creation")
        return None
    
    app = FastAPI(
        title="AG-UI Protocol Endpoint",
        description="AgentCore Runtime AG-UI Protocol adapter",
    )
    
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    
    @app.post("/ag-ui")
    async def ag_ui_endpoint(request: Request):
        """AG-UI Protocol HTTP endpoint."""
        body = await request.json()
        
        def generate():
            for event_str in ag_ui_invoke(body):
                yield event_str
        
        return StreamingResponse(
            generate(),
            media_type="text/event-stream",
            headers={
                "Cache-Control": "no-cache",
                "Connection": "keep-alive",
            },
        )
    
    @app.get("/health")
    async def health_check():
        """Health check endpoint."""
        return {"status": "healthy", "model": MODEL_ID}
    
    return app


# ============================================================================
# Main Entry Point (for local testing)
# ============================================================================

if __name__ == "__main__":
    import uvicorn
    
    app = create_fastapi_app()
    if app:
        logger.info("Starting AG-UI Protocol server on port 8080")
        uvicorn.run(app, host="0.0.0.0", port=8080)
    else:
        logger.error("Failed to create FastAPI app. Install fastapi and uvicorn.")
