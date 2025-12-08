"""AgentCore Runtime Entrypoint.

This is the main entry point for the Strands Agent running on
Amazon Bedrock AgentCore Runtime.

Based on the official AgentCore documentation:
https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/runtime-get-started-toolkit.html
"""

import json
import os
from typing import Any

import structlog
from bedrock_agentcore import BedrockAgentCoreApp
from strands import Agent

logger = structlog.get_logger()

# ============================================================================
# AgentCore App
# ============================================================================

app = BedrockAgentCoreApp()

# ============================================================================
# Agent Setup
# ============================================================================

# Get model from environment or use default
# Note: Use direct model ID or inference profile (apac.* for Asia Pacific)
MODEL_ID = os.environ.get("BEDROCK_MODEL_ID", "amazon.nova-pro-v1:0")

# System prompt for the agent
SYSTEM_PROMPT = """あなたは優秀なカスタマーサポートアシスタントです。
ユーザーの質問に対して、丁寧かつ的確に回答してください。

## 回答のガイドライン
- 簡潔で分かりやすい言葉を使う
- 必要に応じて箇条書きを使用する
- 不明な点があれば確認する
"""

# Initialize the Strands Agent
agent = Agent(
    model=MODEL_ID,
    system_prompt=SYSTEM_PROMPT,
)

logger.info("agent_initialized", model_id=MODEL_ID)


# ============================================================================
# AgentCore Entrypoint
# ============================================================================

@app.entrypoint
def invoke(payload: dict[str, Any]) -> dict[str, Any]:
    """AgentCore Runtime entrypoint.
    
    This function is called by AgentCore Runtime for each invocation.
    
    Args:
        payload: Request payload with the following structure:
            {
                "prompt": "User's question",
                "session_id": "sess-123",  # optional
                "user_id": "user-456",     # optional
            }
    
    Returns:
        Response dictionary with the agent's response
    """
    # Extract parameters from payload
    prompt = payload.get("prompt", "")
    session_id = payload.get("session_id", "default-session")
    user_id = payload.get("user_id", "default-user")
    
    if not prompt:
        return {"error": "prompt is required"}
    
    logger.info(
        "agentcore_invocation_started",
        session_id=session_id,
        user_id=user_id,
        prompt_preview=prompt[:50],
    )
    
    try:
        # Invoke the agent
        result = agent(prompt)
        
        # Extract the response
        response_text = result.message if hasattr(result, 'message') else str(result)
        
        logger.info(
            "agentcore_invocation_completed",
            session_id=session_id,
            user_id=user_id,
            response_length=len(response_text),
        )
        
        return {
            "response": response_text,
            "session_id": session_id,
        }
        
    except Exception as e:
        logger.error(
            "agentcore_invocation_error",
            error=str(e),
            session_id=session_id,
            user_id=user_id,
        )
        return {"error": str(e)}


# ============================================================================
# Main Entry Point
# ============================================================================

if __name__ == "__main__":
    # Start the AgentCore Runtime server
    app.run()
