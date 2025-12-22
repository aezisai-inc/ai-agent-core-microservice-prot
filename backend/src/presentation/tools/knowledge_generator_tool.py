"""Knowledge Generator Tool for Strands Agent.

Generates knowledge documents from chat history and stores them
in S3 for ingestion into the Knowledge Base (RAG).

This tool enables the agent to:
1. Analyze conversation history
2. Extract important information (decisions, learnings, FAQs)
3. Generate structured Markdown documents
4. Upload to S3 documents bucket
5. Trigger Knowledge Base ingestion (optional)

Example usage:
    ```python
    from strands import Agent, tool
    from presentation.tools import create_knowledge_generator_tool
    
    generator_tool = create_knowledge_generator_tool(
        s3_bucket="agentcore-documents-xxx-development",
        knowledge_base_id="KCOEXQD1NV",
    )
    
    agent = Agent(
        model="amazon.nova-pro-v1:0",
        tools=[tool(generator_tool)],
    )
    ```
"""

import json
import os
from datetime import datetime
from typing import Any, Callable
from dataclasses import dataclass

import boto3
import structlog
from strands import Agent

logger = structlog.get_logger()


@dataclass
class ConversationMessage:
    """Single message in a conversation."""
    role: str  # "user" or "assistant"
    content: str
    timestamp: str | None = None


@dataclass
class KnowledgeDocument:
    """Generated knowledge document."""
    title: str
    content: str
    category: str
    tags: list[str]
    source_session_id: str
    generated_at: str


# ============================================================================
# Document Templates
# ============================================================================

ANALYSIS_PROMPT = """以下の会話履歴を分析し、ナレッジベースに追加すべき重要な情報を抽出してください。

## 会話履歴
{conversation}

## 抽出すべき情報
1. **決定事項**: 会話で決まったこと
2. **問題と解決策**: 発生した問題とその解決方法
3. **FAQ候補**: よくある質問として登録すべき内容
4. **学習事項**: 今後に活かせる知見やベストプラクティス

## 出力形式
以下のJSON形式で出力してください:
```json
{{
  "title": "ドキュメントのタイトル",
  "category": "faq|troubleshooting|decision|learning",
  "tags": ["タグ1", "タグ2"],
  "summary": "1-2文の要約",
  "sections": [
    {{
      "heading": "セクション見出し",
      "content": "セクション内容"
    }}
  ],
  "should_save": true/false
}}
```

注意:
- 会話に重要な情報がない場合は should_save: false を返してください
- 個人情報や機密情報は含めないでください
- 一般化して再利用可能な形式にしてください
"""

DOCUMENT_TEMPLATE = """# {title}

**カテゴリ**: {category}  
**タグ**: {tags}  
**作成日**: {created_at}  
**ソース**: チャットセッション {session_id}

---

## 概要

{summary}

{sections}

---

*このドキュメントは会話履歴から自動生成されました。*
"""


# ============================================================================
# Knowledge Generator Tool
# ============================================================================

def create_knowledge_generator_tool(
    s3_bucket: str,
    s3_prefix: str = "documents/generated/",
    knowledge_base_id: str | None = None,
    data_source_id: str | None = None,
    region: str = "ap-northeast-1",
    model_id: str = "apac.amazon.nova-pro-v1:0",
) -> Callable[[str, str], str]:
    """Create a knowledge generator tool with injected dependencies.
    
    Args:
        s3_bucket: S3 bucket for storing generated documents
        s3_prefix: S3 key prefix for generated documents
        knowledge_base_id: Optional KB ID to trigger ingestion
        data_source_id: Optional Data Source ID for ingestion
        region: AWS region
        model_id: Bedrock model ID for analysis
    
    Returns:
        A tool function for Strands Agent
    """
    
    s3_client = boto3.client("s3", region_name=region)
    bedrock_client = boto3.client("bedrock-runtime", region_name=region)
    bedrock_agent_client = boto3.client("bedrock-agent", region_name=region) if knowledge_base_id else None
    
    async def generate_knowledge_from_history(
        conversation_json: str,
        session_id: str,
    ) -> str:
        """
        会話履歴からナレッジドキュメントを生成してS3に保存する
        
        このツールは会話の重要な情報を分析し、
        再利用可能なナレッジドキュメントとしてKnowledge Baseに追加します。
        
        Args:
            conversation_json: 会話履歴のJSON文字列
                フォーマット: [{"role": "user"|"assistant", "content": "..."}]
            session_id: 会話のセッションID
        
        Returns:
            生成結果のJSON文字列
            
            成功時:
            {
                "success": true,
                "document_key": "documents/generated/xxx.md",
                "title": "生成されたドキュメントタイトル",
                "ingestion_triggered": true/false
            }
            
            スキップ時:
            {
                "success": true,
                "skipped": true,
                "reason": "重要な情報が見つかりませんでした"
            }
        """
        try:
            # Parse conversation
            conversation = json.loads(conversation_json)
            
            logger.info(
                "knowledge_generation_started",
                session_id=session_id,
                message_count=len(conversation),
            )
            
            # Format conversation for analysis
            formatted_conversation = _format_conversation(conversation)
            
            # Analyze conversation using LLM
            analysis = await _analyze_conversation(
                bedrock_client,
                model_id,
                formatted_conversation,
            )
            
            if not analysis or not analysis.get("should_save", False):
                logger.info(
                    "knowledge_generation_skipped",
                    session_id=session_id,
                    reason="No important information found",
                )
                return json.dumps({
                    "success": True,
                    "skipped": True,
                    "reason": "重要な情報が見つかりませんでした",
                }, ensure_ascii=False)
            
            # Generate document
            document = _generate_document(analysis, session_id)
            
            # Upload to S3
            document_key = await _upload_to_s3(
                s3_client,
                s3_bucket,
                s3_prefix,
                document,
            )
            
            # Trigger ingestion if configured
            ingestion_triggered = False
            if bedrock_agent_client and knowledge_base_id and data_source_id:
                ingestion_triggered = await _trigger_ingestion(
                    bedrock_agent_client,
                    knowledge_base_id,
                    data_source_id,
                )
            
            logger.info(
                "knowledge_generation_completed",
                session_id=session_id,
                document_key=document_key,
                title=document.title,
                ingestion_triggered=ingestion_triggered,
            )
            
            return json.dumps({
                "success": True,
                "document_key": document_key,
                "title": document.title,
                "category": document.category,
                "tags": document.tags,
                "ingestion_triggered": ingestion_triggered,
            }, ensure_ascii=False)
            
        except json.JSONDecodeError as e:
            logger.error("knowledge_generation_json_error", error=str(e))
            return json.dumps({
                "success": False,
                "error": f"会話履歴のJSONパースに失敗しました: {str(e)}",
            }, ensure_ascii=False)
            
        except Exception as e:
            logger.error(
                "knowledge_generation_error",
                error=str(e),
                session_id=session_id,
            )
            return json.dumps({
                "success": False,
                "error": f"ナレッジ生成中にエラーが発生しました: {str(e)}",
            }, ensure_ascii=False)
    
    return generate_knowledge_from_history


def _format_conversation(messages: list[dict[str, Any]]) -> str:
    """Format conversation messages for analysis."""
    lines = []
    for msg in messages:
        role = "ユーザー" if msg.get("role") == "user" else "アシスタント"
        content = msg.get("content", "")
        lines.append(f"**{role}**: {content}")
    return "\n\n".join(lines)


async def _analyze_conversation(
    client: Any,
    model_id: str,
    conversation: str,
) -> dict[str, Any] | None:
    """Analyze conversation using LLM and extract knowledge."""
    import re
    prompt = ANALYSIS_PROMPT.format(conversation=conversation)
    
    try:
        # Build request body based on model type
        if "nova" in model_id.lower():
            # Amazon Nova format
            request_body = {
                "messages": [{"role": "user", "content": [{"text": prompt}]}],
                "inferenceConfig": {
                    "maxTokens": 2000,
                    "temperature": 0.3,
                },
            }
        elif "claude" in model_id.lower():
            # Anthropic Claude format
            request_body = {
                "anthropic_version": "bedrock-2023-05-31",
                "messages": [{"role": "user", "content": prompt}],
                "max_tokens": 2000,
                "temperature": 0.3,
            }
        else:
            # Default format (try Nova)
            request_body = {
                "messages": [{"role": "user", "content": [{"text": prompt}]}],
                "inferenceConfig": {
                    "maxTokens": 2000,
                    "temperature": 0.3,
                },
            }
        
        response = client.invoke_model(
            modelId=model_id,
            contentType="application/json",
            accept="application/json",
            body=json.dumps(request_body),
        )
        
        response_body = json.loads(response["body"].read())
        
        # Extract content based on model response format
        if "output" in response_body:
            # Nova format
            content = response_body["output"]["message"]["content"][0]["text"]
        elif "content" in response_body:
            # Claude format
            content = response_body["content"][0]["text"]
        else:
            content = str(response_body)
        
        # Parse JSON from response
        # Find JSON block in response
        json_match = re.search(r"```json\s*([\s\S]*?)\s*```", content)
        if json_match:
            return json.loads(json_match.group(1))
        
        # Try parsing entire content as JSON
        return json.loads(content)
        
    except Exception as e:
        logger.error("conversation_analysis_error", error=str(e))
        return None


def _generate_document(
    analysis: dict[str, Any],
    session_id: str,
) -> KnowledgeDocument:
    """Generate a knowledge document from analysis results."""
    now = datetime.utcnow().isoformat() + "Z"
    
    # Build sections
    sections_md = ""
    for section in analysis.get("sections", []):
        heading = section.get("heading", "")
        content = section.get("content", "")
        sections_md += f"## {heading}\n\n{content}\n\n"
    
    # Format tags
    tags = analysis.get("tags", [])
    tags_str = ", ".join(tags) if tags else "未分類"
    
    # Generate content
    content = DOCUMENT_TEMPLATE.format(
        title=analysis.get("title", "無題のドキュメント"),
        category=analysis.get("category", "general"),
        tags=tags_str,
        created_at=now,
        session_id=session_id,
        summary=analysis.get("summary", ""),
        sections=sections_md,
    )
    
    return KnowledgeDocument(
        title=analysis.get("title", "無題のドキュメント"),
        content=content,
        category=analysis.get("category", "general"),
        tags=tags,
        source_session_id=session_id,
        generated_at=now,
    )


async def _upload_to_s3(
    client: Any,
    bucket: str,
    prefix: str,
    document: KnowledgeDocument,
) -> str:
    """Upload document to S3."""
    import base64
    import hashlib
    
    # Generate unique filename using hash for Japanese titles
    timestamp = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
    title_hash = hashlib.md5(document.title.encode()).hexdigest()[:8]
    filename = f"{timestamp}_{title_hash}.md"
    
    key = f"{prefix.rstrip('/')}/{document.category}/{filename}"
    
    # S3 metadata only supports ASCII, so encode Japanese text
    def encode_metadata(value: str) -> str:
        """Base64 encode non-ASCII metadata values."""
        return base64.b64encode(value.encode("utf-8")).decode("ascii")
    
    client.put_object(
        Bucket=bucket,
        Key=key,
        Body=document.content.encode("utf-8"),
        ContentType="text/markdown; charset=utf-8",
        Metadata={
            "title-b64": encode_metadata(document.title),
            "category": document.category,
            "tags-b64": encode_metadata(",".join(document.tags)),
            "session-id": document.source_session_id,
            "generated-at": document.generated_at,
        },
    )
    
    logger.info(
        "document_uploaded_to_s3",
        bucket=bucket,
        key=key,
        size=len(document.content),
    )
    
    return key


async def _trigger_ingestion(
    client: Any,
    knowledge_base_id: str,
    data_source_id: str,
) -> bool:
    """Trigger Knowledge Base ingestion job."""
    try:
        response = client.start_ingestion_job(
            knowledgeBaseId=knowledge_base_id,
            dataSourceId=data_source_id,
        )
        
        job_id = response.get("ingestionJob", {}).get("ingestionJobId", "")
        
        logger.info(
            "ingestion_job_started",
            knowledge_base_id=knowledge_base_id,
            data_source_id=data_source_id,
            job_id=job_id,
        )
        
        return True
        
    except Exception as e:
        logger.warning(
            "ingestion_job_failed",
            error=str(e),
            knowledge_base_id=knowledge_base_id,
        )
        return False


# ============================================================================
# Standalone function (non-tool version)
# ============================================================================

async def generate_knowledge_document(
    conversation: list[dict[str, Any]],
    session_id: str,
    s3_bucket: str,
    s3_prefix: str = "documents/generated/",
    knowledge_base_id: str | None = None,
    data_source_id: str | None = None,
    region: str = "ap-northeast-1",
    model_id: str = "apac.amazon.nova-pro-v1:0",
) -> dict[str, Any]:
    """Generate knowledge document from conversation (non-tool version).
    
    This function can be called directly without Strands Agent.
    
    Args:
        conversation: List of conversation messages
        session_id: Session identifier
        s3_bucket: S3 bucket name
        s3_prefix: S3 key prefix
        knowledge_base_id: Optional KB ID for ingestion
        data_source_id: Optional Data Source ID for ingestion
        region: AWS region
        model_id: Bedrock model ID
    
    Returns:
        Result dictionary with document info or error
    """
    tool = create_knowledge_generator_tool(
        s3_bucket=s3_bucket,
        s3_prefix=s3_prefix,
        knowledge_base_id=knowledge_base_id,
        data_source_id=data_source_id,
        region=region,
        model_id=model_id,
    )
    
    result = await tool(
        json.dumps(conversation, ensure_ascii=False),
        session_id,
    )
    
    return json.loads(result)









