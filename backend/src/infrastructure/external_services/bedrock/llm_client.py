"""Bedrock LLM Client."""

import json

import boto3
import structlog

logger = structlog.get_logger()


class BedrockLLMClient:
    """Client for Amazon Bedrock LLM services.

    Provides methods to generate text using Claude and other models.
    """

    def __init__(self, region_name: str = "ap-northeast-1"):
        self._client = boto3.client("bedrock-runtime", region_name=region_name)
        self._region = region_name

    async def generate(
        self,
        prompt: str,
        system_prompt: str,
        context: str | None = None,
        model_id: str = "anthropic.claude-3-sonnet-20240229-v1:0",
        temperature: float = 0.7,
        max_tokens: int = 4096,
    ) -> tuple[str, int]:
        """Generate a response using Bedrock.

        Args:
            prompt: The user's prompt
            system_prompt: The system prompt for the agent
            context: Optional RAG context
            model_id: The Bedrock model ID
            temperature: Sampling temperature
            max_tokens: Maximum tokens to generate

        Returns:
            Tuple of (response_content, tokens_used)
        """
        # Build the full prompt with context
        full_prompt = prompt
        if context:
            full_prompt = f"""Based on the following context, answer the user's question.

Context:
{context}

User Question: {prompt}"""

        # Build the request body for Claude
        body = {
            "anthropic_version": "bedrock-2023-05-31",
            "max_tokens": max_tokens,
            "temperature": temperature,
            "system": system_prompt,
            "messages": [
                {
                    "role": "user",
                    "content": full_prompt,
                }
            ],
        }

        try:
            response = self._client.invoke_model(
                modelId=model_id,
                body=json.dumps(body),
                contentType="application/json",
                accept="application/json",
            )

            response_body = json.loads(response["body"].read())

            content = response_body.get("content", [{}])[0].get("text", "")
            usage = response_body.get("usage", {})
            tokens_used = usage.get("input_tokens", 0) + usage.get("output_tokens", 0)

            logger.info(
                "bedrock_generation_complete",
                model_id=model_id,
                tokens_used=tokens_used,
            )

            return content, tokens_used

        except Exception as e:
            logger.error("bedrock_generation_error", error=str(e), model_id=model_id)
            raise

    async def generate_streaming(
        self,
        prompt: str,
        system_prompt: str,
        context: str | None = None,
        model_id: str = "anthropic.claude-3-sonnet-20240229-v1:0",
        temperature: float = 0.7,
        max_tokens: int = 4096,
    ):
        """Generate a streaming response using Bedrock.

        Yields chunks of the response as they are generated.
        """
        full_prompt = prompt
        if context:
            full_prompt = f"""Based on the following context, answer the user's question.

Context:
{context}

User Question: {prompt}"""

        body = {
            "anthropic_version": "bedrock-2023-05-31",
            "max_tokens": max_tokens,
            "temperature": temperature,
            "system": system_prompt,
            "messages": [
                {
                    "role": "user",
                    "content": full_prompt,
                }
            ],
        }

        try:
            response = self._client.invoke_model_with_response_stream(
                modelId=model_id,
                body=json.dumps(body),
                contentType="application/json",
                accept="application/json",
            )

            for event in response.get("body", []):
                chunk = event.get("chunk")
                if chunk:
                    chunk_data = json.loads(chunk.get("bytes", b"{}").decode())
                    if chunk_data.get("type") == "content_block_delta":
                        delta = chunk_data.get("delta", {})
                        text = delta.get("text", "")
                        if text:
                            yield text

        except Exception as e:
            logger.error("bedrock_streaming_error", error=str(e), model_id=model_id)
            raise
