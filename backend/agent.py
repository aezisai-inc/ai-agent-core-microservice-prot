"""AgentCore Runtime Entrypoint with RAG Integration.

This is the main entry point for the Strands Agent running on
Amazon Bedrock AgentCore Runtime with Knowledge Base RAG.

Based on the official AgentCore documentation:
https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/runtime-get-started-toolkit.html

Configuration is loaded from SSM Parameter Store at runtime:
- /agentcore/{env}/knowledge-base-id
- /agentcore/{env}/rag-top-k
- /agentcore/{env}/rag-score-threshold
"""

import os
from typing import Any

import boto3
import structlog
from bedrock_agentcore import BedrockAgentCoreApp
from strands import Agent

logger = structlog.get_logger()

# ============================================================================
# SSM Parameter Store Configuration Loader
# ============================================================================

class SSMConfigLoader:
    """Load configuration from SSM Parameter Store with fallbacks."""
    
    def __init__(self, region: str, environment: str):
        self._client = boto3.client("ssm", region_name=region)
        self._env = environment
        self._cache: dict[str, str] = {}
        self._prefix = f"/agentcore/{environment}"
    
    def get(self, key: str, default: str = "") -> str:
        """Get parameter value from SSM with caching.
        
        Args:
            key: Parameter key (e.g., 'knowledge-base-id')
            default: Default value if parameter not found
        
        Returns:
            Parameter value or default
        """
        # Check cache first
        if key in self._cache:
            return self._cache[key]
        
        param_name = f"{self._prefix}/{key}"
        
        try:
            response = self._client.get_parameter(
                Name=param_name,
                WithDecryption=True,  # Support SecureString
            )
            value = response["Parameter"]["Value"]
            self._cache[key] = value
            logger.info("ssm_parameter_loaded", parameter=param_name)
            return value
            
        except self._client.exceptions.ParameterNotFound:
            logger.warning(
                "ssm_parameter_not_found",
                parameter=param_name,
                using_default=default,
            )
            return default
            
        except Exception as e:
            logger.error(
                "ssm_parameter_error",
                parameter=param_name,
                error=str(e),
            )
            return default
    
    def get_int(self, key: str, default: int) -> int:
        """Get integer parameter value."""
        value = self.get(key, str(default))
        try:
            return int(value)
        except ValueError:
            return default
    
    def get_float(self, key: str, default: float) -> float:
        """Get float parameter value."""
        value = self.get(key, str(default))
        try:
            return float(value)
        except ValueError:
            return default


# ============================================================================
# Configuration
# ============================================================================

# AWS Region and Environment
REGION = os.environ.get("AWS_REGION", "ap-northeast-1")
ENVIRONMENT = os.environ.get("AGENTCORE_ENV", "development")

# Initialize SSM Config Loader
ssm_config = SSMConfigLoader(region=REGION, environment=ENVIRONMENT)

# Load configuration from SSM Parameter Store
KNOWLEDGE_BASE_ID = ssm_config.get("knowledge-base-id", "")
RAG_TOP_K = ssm_config.get_int("rag-top-k", 5)
RAG_SCORE_THRESHOLD = ssm_config.get_float("rag-score-threshold", 0.5)

# Model ID (can also be from SSM if needed)
MODEL_ID = os.environ.get("BEDROCK_MODEL_ID", "apac.amazon.nova-pro-v1:0")

logger.info(
    "configuration_loaded",
    region=REGION,
    environment=ENVIRONMENT,
    knowledge_base_id=KNOWLEDGE_BASE_ID or "NOT_CONFIGURED",
    rag_top_k=RAG_TOP_K,
    rag_score_threshold=RAG_SCORE_THRESHOLD,
    model_id=MODEL_ID,
)

# ============================================================================
# Knowledge Base Client
# ============================================================================

class KnowledgeBaseClient:
    """Client for Bedrock Knowledge Base retrieval."""
    
    def __init__(self, knowledge_base_id: str, region: str = "ap-northeast-1"):
        self._client = boto3.client("bedrock-agent-runtime", region_name=region)
        self._knowledge_base_id = knowledge_base_id
        self._region = region
    
    def retrieve(
        self,
        query: str,
        top_k: int = 5,
        score_threshold: float = 0.5,
    ) -> list[dict[str, Any]]:
        """Retrieve relevant documents from Knowledge Base.
        
        Args:
            query: Search query
            top_k: Number of results to return
            score_threshold: Minimum similarity score
        
        Returns:
            List of relevant document chunks
        """
        if not self._knowledge_base_id:
            logger.warning("knowledge_base_not_configured")
            return []
        
        try:
            response = self._client.retrieve(
                knowledgeBaseId=self._knowledge_base_id,
                retrievalQuery={"text": query},
                retrievalConfiguration={
                    "vectorSearchConfiguration": {
                        "numberOfResults": top_k,
                        "overrideSearchType": "HYBRID",
                    }
                },
            )
            
            results = []
            for item in response.get("retrievalResults", []):
                score = item.get("score", 0)
                
                # Filter by score threshold
                if score < score_threshold:
                    continue
                
                content = item.get("content", {}).get("text", "")
                location = item.get("location", {})
                s3_uri = location.get("s3Location", {}).get("uri", "")
                
                # Extract filename from S3 URI
                source_name = s3_uri.split("/")[-1] if s3_uri else "Unknown"
                
                results.append({
                    "content": content,
                    "score": score,
                    "source": source_name,
                    "uri": s3_uri,
                })
            
            logger.info(
                "knowledge_base_retrieval_complete",
                knowledge_base_id=self._knowledge_base_id,
                query_preview=query[:50],
                results_count=len(results),
            )
            
            return results
            
        except Exception as e:
            logger.error(
                "knowledge_base_retrieval_error",
                error=str(e),
                knowledge_base_id=self._knowledge_base_id,
            )
            return []


def build_rag_context(chunks: list[dict[str, Any]]) -> str:
    """Build RAG context from retrieved chunks.
    
    Args:
        chunks: List of retrieved document chunks
    
    Returns:
        Formatted context string
    """
    if not chunks:
        return ""
    
    context_parts = ["## 参照ドキュメント\n"]
    context_parts.append("以下の社内ドキュメントを参考に回答してください。\n")
    
    for i, chunk in enumerate(chunks[:5], 1):
        content = chunk.get("content", "")[:800]  # Limit content length
        source = chunk.get("source", "Unknown")
        score = chunk.get("score", 0.0)
        
        context_parts.append(f"### ドキュメント {i} (関連度: {score:.2f})")
        context_parts.append(f"**ソース**: {source}")
        context_parts.append(f"```\n{content}\n```\n")
    
    return "\n".join(context_parts)


# ============================================================================
# AgentCore App
# ============================================================================

app = BedrockAgentCoreApp()

# ============================================================================
# Agent Setup
# ============================================================================

# Base system prompt
BASE_SYSTEM_PROMPT = """あなたは優秀なカスタマーサポートアシスタントです。
ユーザーの質問に対して、丁寧かつ的確に回答してください。

## 回答のガイドライン
- 参照ドキュメントが提供されている場合は、その内容を優先して回答する
- ドキュメントに記載がない場合は、その旨を伝える
- 簡潔で分かりやすい言葉を使う
- 必要に応じて箇条書きやMarkdown記法を使用する
- 不明な点があれば確認する

## 重要
- 参照ドキュメントの内容に基づいて回答してください
- ドキュメントに記載されていない情報を推測で答えないでください
"""

# Initialize Knowledge Base client
kb_client = KnowledgeBaseClient(
    knowledge_base_id=KNOWLEDGE_BASE_ID,
    region=REGION,
) if KNOWLEDGE_BASE_ID else None

logger.info(
    "agent_initialized",
    rag_enabled=bool(KNOWLEDGE_BASE_ID),
)


# ============================================================================
# AgentCore Entrypoint
# ============================================================================

@app.entrypoint
def invoke(payload: dict[str, Any]) -> dict[str, Any]:
    """AgentCore Runtime entrypoint with RAG.
    
    This function is called by AgentCore Runtime for each invocation.
    It performs Knowledge Base retrieval and injects context into the prompt.
    
    Args:
        payload: Request payload with the following structure:
            {
                "prompt": "User's question",
                "session_id": "sess-123",  # optional
                "user_id": "user-456",     # optional
            }
    
    Returns:
        Response dictionary with the agent's response and sources
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
        rag_enabled=bool(kb_client),
    )
    
    # =========================================================================
    # RAG: Retrieve relevant documents from Knowledge Base
    # =========================================================================
    rag_chunks = []
    rag_context = ""
    
    if kb_client:
        rag_chunks = kb_client.retrieve(
            query=prompt,
            top_k=RAG_TOP_K,
            score_threshold=RAG_SCORE_THRESHOLD,
        )
        rag_context = build_rag_context(rag_chunks)
        
        logger.info(
            "rag_context_built",
            chunks_count=len(rag_chunks),
            context_length=len(rag_context),
        )
    
    # =========================================================================
    # Build enriched system prompt with RAG context
    # =========================================================================
    if rag_context:
        enriched_system_prompt = f"{BASE_SYSTEM_PROMPT}\n\n{rag_context}"
    else:
        enriched_system_prompt = BASE_SYSTEM_PROMPT
    
    # Create agent with enriched prompt
    agent = Agent(
        model=MODEL_ID,
        system_prompt=enriched_system_prompt,
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
            rag_chunks_used=len(rag_chunks),
        )
        
        # Build response with sources
        response = {
            "response": response_text,
            "session_id": session_id,
        }
        
        # Include RAG sources if available
        if rag_chunks:
            response["sources"] = [
                {
                    "content": chunk["content"][:200],  # Preview
                    "source": chunk["source"],
                    "score": chunk["score"],
                }
                for chunk in rag_chunks
            ]
        
        return response
        
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
