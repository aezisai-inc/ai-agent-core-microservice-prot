"""Bedrock AgentCore Client."""

from typing import Any

import boto3
import structlog

logger = structlog.get_logger()


class AgentCoreClient:
    """Client for Amazon Bedrock AgentCore.

    AgentCore provides a managed agent runtime with built-in
    memory, identity, and gateway interceptors.
    """

    def __init__(self, region_name: str = "ap-northeast-1"):
        self._client = boto3.client("bedrock-agent-runtime", region_name=region_name)
        self._region = region_name

    async def invoke_agent(
        self,
        agent_id: str,
        agent_alias_id: str,
        session_id: str,
        input_text: str,
        enable_trace: bool = True,
    ) -> dict[str, Any]:
        """Invoke an AgentCore agent.

        Args:
            agent_id: The agent ID
            agent_alias_id: The agent alias ID
            session_id: The session ID for memory
            input_text: The user's input
            enable_trace: Whether to enable tracing

        Returns:
            The agent's response
        """
        try:
            response = self._client.invoke_agent(
                agentId=agent_id,
                agentAliasId=agent_alias_id,
                sessionId=session_id,
                inputText=input_text,
                enableTrace=enable_trace,
            )

            # Collect the response from the event stream
            completion = ""
            traces = []

            for event in response.get("completion", []):
                if "chunk" in event:
                    chunk = event["chunk"]
                    if "bytes" in chunk:
                        completion += chunk["bytes"].decode("utf-8")

                if "trace" in event and enable_trace:
                    traces.append(event["trace"])

            logger.info(
                "agent_core_invocation_complete",
                agent_id=agent_id,
                session_id=session_id,
            )

            return {
                "completion": completion,
                "traces": traces,
                "session_id": session_id,
            }

        except Exception as e:
            logger.error(
                "agent_core_invocation_error",
                error=str(e),
                agent_id=agent_id,
                session_id=session_id,
            )
            raise

    async def invoke_agent_streaming(
        self,
        agent_id: str,
        agent_alias_id: str,
        session_id: str,
        input_text: str,
    ):
        """Invoke an AgentCore agent with streaming response.

        Yields chunks of the response as they are generated.
        """
        try:
            response = self._client.invoke_agent(
                agentId=agent_id,
                agentAliasId=agent_alias_id,
                sessionId=session_id,
                inputText=input_text,
            )

            for event in response.get("completion", []):
                if "chunk" in event:
                    chunk = event["chunk"]
                    if "bytes" in chunk:
                        yield chunk["bytes"].decode("utf-8")

        except Exception as e:
            logger.error(
                "agent_core_streaming_error",
                error=str(e),
                agent_id=agent_id,
            )
            raise

    async def get_agent_memory(
        self,
        agent_id: str,
        agent_alias_id: str,
        session_id: str,
    ) -> list[dict]:
        """Get the memory contents for a session.

        Returns the conversation history stored in AgentCore Memory.
        """
        try:
            response = self._client.get_agent_memory(
                agentId=agent_id,
                agentAliasId=agent_alias_id,
                memoryId=session_id,
                memoryType="SESSION_SUMMARY",
            )

            return response.get("memoryContents", [])

        except Exception as e:
            logger.error(
                "agent_core_memory_error",
                error=str(e),
                agent_id=agent_id,
                session_id=session_id,
            )
            return []
