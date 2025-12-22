"""Integration test for Knowledge Generator Tool with real AWS resources.

This test requires AWS credentials and actual resources:
- S3 bucket: agentcore-documents-226484346947-development
- Knowledge Base: KCOEXQD1NV
- Data Source: R1BW5OB1WP

Run with:
    cd backend
    uv run python tests/integration/test_knowledge_generator_aws.py
"""

import asyncio
import json
import os
import sys

# Add parent directory to path for imports
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "../.."))

import boto3
import structlog

structlog.configure(
    processors=[
        structlog.processors.add_log_level,
        structlog.dev.ConsoleRenderer(colors=True),
    ],
)

logger = structlog.get_logger()


# ============================================================================
# Configuration
# ============================================================================

S3_BUCKET = "agentcore-documents-226484346947-development"
S3_PREFIX = "documents/generated/"
KNOWLEDGE_BASE_ID = "KCOEXQD1NV"
DATA_SOURCE_ID = "R1BW5OB1WP"
REGION = "ap-northeast-1"
MODEL_ID = "apac.amazon.nova-pro-v1:0"


# ============================================================================
# Test Data
# ============================================================================

SAMPLE_CONVERSATION = [
    {
        "role": "user",
        "content": "プロダクトの料金プランについて教えてください。"
    },
    {
        "role": "assistant",
        "content": """当社のプロダクトには3つの料金プランがあります：

1. **スタータープラン**: ¥10,000/月
   - 基本機能のみ
   - 月間1,000リクエストまで
   - メールサポート

2. **プロフェッショナルプラン**: ¥30,000/月
   - 全機能利用可能
   - 月間10,000リクエストまで
   - 優先サポート
   - API アクセス

3. **エンタープライズプラン**: 要お問い合わせ
   - 無制限リクエスト
   - 専任サポート
   - SLA保証
   - カスタム機能開発"""
    },
    {
        "role": "user",
        "content": "プロフェッショナルとエンタープライズの違いは何ですか？"
    },
    {
        "role": "assistant",
        "content": """主な違いは以下の点です：

**リクエスト制限**
- プロフェッショナル: 月間10,000リクエストまで
- エンタープライズ: 無制限

**サポート体制**
- プロフェッショナル: 優先サポート（平日対応）
- エンタープライズ: 専任サポート（24/7対応）

**SLA**
- プロフェッショナル: 99.5%の可用性
- エンタープライズ: 99.9%のSLA保証あり

**カスタマイズ**
- プロフェッショナル: 標準機能のみ
- エンタープライズ: カスタム機能開発可能

大規模な利用やミッションクリティカルな用途にはエンタープライズをお勧めします。"""
    },
]


# ============================================================================
# Test Functions
# ============================================================================

async def test_analyze_conversation():
    """Test conversation analysis with Bedrock."""
    logger.info("=== Test 1: Conversation Analysis ===")
    
    bedrock_client = boto3.client("bedrock-runtime", region_name=REGION)
    
    # Format conversation
    formatted = []
    for msg in SAMPLE_CONVERSATION:
        role = "ユーザー" if msg["role"] == "user" else "アシスタント"
        formatted.append(f"**{role}**: {msg['content']}")
    conversation_text = "\n\n".join(formatted)
    
    prompt = f"""以下の会話履歴を分析し、ナレッジベースに追加すべき重要な情報を抽出してください。

## 会話履歴
{conversation_text}

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
    
    try:
        # Nova format request
        request_body = {
            "messages": [{"role": "user", "content": [{"text": prompt}]}],
            "inferenceConfig": {
                "maxTokens": 2000,
                "temperature": 0.3,
            },
        }
        
        response = bedrock_client.invoke_model(
            modelId=MODEL_ID,
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
        
        logger.info("LLM response received", response_length=len(content))
        print("\n--- LLM Response ---")
        print(content)
        print("--- End Response ---\n")
        
        # Parse JSON from response
        import re
        json_match = re.search(r"```json\s*([\s\S]*?)\s*```", content)
        if json_match:
            analysis = json.loads(json_match.group(1))
        else:
            analysis = json.loads(content)
        
        logger.info("Analysis parsed successfully", 
                   title=analysis.get("title"),
                   category=analysis.get("category"),
                   should_save=analysis.get("should_save"))
        
        return analysis
        
    except Exception as e:
        logger.error("Analysis failed", error=str(e))
        raise


async def test_s3_upload(analysis: dict):
    """Test S3 document upload."""
    logger.info("=== Test 2: S3 Upload ===")
    
    s3_client = boto3.client("s3", region_name=REGION)
    
    from datetime import datetime
    now = datetime.utcnow()
    timestamp = now.strftime("%Y%m%d_%H%M%S")
    
    # Build sections
    sections_md = ""
    for section in analysis.get("sections", []):
        heading = section.get("heading", "")
        content = section.get("content", "")
        sections_md += f"## {heading}\n\n{content}\n\n"
    
    tags = analysis.get("tags", [])
    tags_str = ", ".join(tags) if tags else "未分類"
    
    document_content = f"""# {analysis.get("title", "無題")}

**カテゴリ**: {analysis.get("category", "general")}  
**タグ**: {tags_str}  
**作成日**: {now.isoformat()}Z  
**ソース**: チャットセッション test-session-001

---

## 概要

{analysis.get("summary", "")}

{sections_md}

---

*このドキュメントは会話履歴から自動生成されました。*
"""
    
    import hashlib
    import base64
    
    title_hash = hashlib.md5(analysis.get("title", "test").encode()).hexdigest()[:8]
    filename = f"{timestamp}_{title_hash}.md"
    key = f"{S3_PREFIX}{analysis.get('category', 'general')}/{filename}"
    
    # S3 metadata only supports ASCII, so encode Japanese text
    def encode_metadata(value: str) -> str:
        return base64.b64encode(value.encode("utf-8")).decode("ascii")
    
    try:
        s3_client.put_object(
            Bucket=S3_BUCKET,
            Key=key,
            Body=document_content.encode("utf-8"),
            ContentType="text/markdown; charset=utf-8",
            Metadata={
                "title-b64": encode_metadata(analysis.get("title", "")),
                "category": analysis.get("category", ""),
                "tags-b64": encode_metadata(",".join(tags)),
                "session-id": "test-session-001",
                "generated-at": now.isoformat() + "Z",
            },
        )
        
        logger.info("Document uploaded to S3",
                   bucket=S3_BUCKET,
                   key=key,
                   size=len(document_content))
        
        # Verify upload
        head = s3_client.head_object(Bucket=S3_BUCKET, Key=key)
        logger.info("Upload verified",
                   content_length=head.get("ContentLength"),
                   content_type=head.get("ContentType"))
        
        return key
        
    except Exception as e:
        logger.error("S3 upload failed", error=str(e))
        raise


async def test_ingestion_trigger():
    """Test Knowledge Base ingestion trigger."""
    logger.info("=== Test 3: Ingestion Trigger ===")
    
    bedrock_agent_client = boto3.client("bedrock-agent", region_name=REGION)
    
    try:
        response = bedrock_agent_client.start_ingestion_job(
            knowledgeBaseId=KNOWLEDGE_BASE_ID,
            dataSourceId=DATA_SOURCE_ID,
        )
        
        job = response.get("ingestionJob", {})
        job_id = job.get("ingestionJobId", "")
        status = job.get("status", "")
        
        logger.info("Ingestion job started",
                   job_id=job_id,
                   status=status,
                   knowledge_base_id=KNOWLEDGE_BASE_ID)
        
        return job_id
        
    except Exception as e:
        logger.error("Ingestion trigger failed", error=str(e))
        raise


async def test_full_tool_integration():
    """Test full tool integration."""
    logger.info("=== Test 4: Full Tool Integration ===")
    
    from src.presentation.tools.knowledge_generator_tool import (
        create_knowledge_generator_tool,
    )
    
    tool = create_knowledge_generator_tool(
        s3_bucket=S3_BUCKET,
        s3_prefix=S3_PREFIX,
        knowledge_base_id=KNOWLEDGE_BASE_ID,
        data_source_id=DATA_SOURCE_ID,
        region=REGION,
        model_id=MODEL_ID,
    )
    
    result = await tool(
        json.dumps(SAMPLE_CONVERSATION, ensure_ascii=False),
        "integration-test-session",
    )
    
    result_data = json.loads(result)
    logger.info("Tool execution completed", result=result_data)
    
    return result_data


# ============================================================================
# Main
# ============================================================================

async def main():
    """Run all tests."""
    print("\n" + "=" * 60)
    print("Knowledge Generator AWS Integration Tests")
    print("=" * 60 + "\n")
    
    print(f"S3 Bucket: {S3_BUCKET}")
    print(f"Knowledge Base: {KNOWLEDGE_BASE_ID}")
    print(f"Data Source: {DATA_SOURCE_ID}")
    print(f"Model: {MODEL_ID}")
    print()
    
    results = {
        "analyze": None,
        "s3_upload": None,
        "ingestion": None,
        "full_integration": None,
    }
    
    try:
        # Test 1: Conversation Analysis
        analysis = await test_analyze_conversation()
        results["analyze"] = "✅ PASS"
        
        if not analysis.get("should_save", False):
            logger.warning("Analysis returned should_save=false, skipping remaining tests")
            return
        
        # Test 2: S3 Upload
        s3_key = await test_s3_upload(analysis)
        results["s3_upload"] = f"✅ PASS (key: {s3_key})"
        
        # Test 3: Ingestion Trigger
        job_id = await test_ingestion_trigger()
        results["ingestion"] = f"✅ PASS (job: {job_id})"
        
        # Test 4: Full Integration
        full_result = await test_full_tool_integration()
        if full_result.get("success"):
            results["full_integration"] = f"✅ PASS (doc: {full_result.get('document_key')})"
        else:
            results["full_integration"] = f"❌ FAIL ({full_result.get('error')})"
        
    except Exception as e:
        logger.error("Test failed", error=str(e))
        import traceback
        traceback.print_exc()
    
    # Summary
    print("\n" + "=" * 60)
    print("Test Results Summary")
    print("=" * 60)
    for test, result in results.items():
        status = result if result else "⏭️ SKIPPED"
        print(f"  {test}: {status}")
    print("=" * 60 + "\n")


if __name__ == "__main__":
    asyncio.run(main())









