"""Knowledge Base search tool for Strands Agent.

Provides RAG (Retrieval-Augmented Generation) capabilities
by searching the S3 Vector knowledge base.
"""

import json
from typing import Any, Callable, Protocol

import structlog

logger = structlog.get_logger()


class VectorSearchClient(Protocol):
    """Protocol for vector search client."""
    
    async def search(
        self,
        query: str,
        tenant_id: str | None = None,
        top_k: int = 5,
    ) -> list[dict[str, Any]]:
        """Search for relevant documents."""
        ...


def create_knowledge_tool(
    vector_client: VectorSearchClient,
    tenant_id: str | None = None,
    max_results: int = 5,
) -> Callable[[str], str]:
    """Create a knowledge base search tool with injected dependencies.
    
    This factory function creates a tool closure that captures
    the vector client and configuration.
    
    Args:
        vector_client: The vector search client instance
        tenant_id: Optional tenant ID for multi-tenant isolation
        max_results: Maximum number of results to return
    
    Returns:
        A tool function that can be used with Strands Agent
    
    Example:
        ```python
        from strands import tool
        
        vector_client = S3VectorClient()
        search_tool = create_knowledge_tool(vector_client, tenant_id="tenant-123")
        
        # Use with Strands Agent
        agent = Agent(tools=[tool(search_tool)])
        ```
    """
    
    async def search_knowledge_base(query: str) -> str:
        """
        ナレッジベースを検索して関連ドキュメントを取得する
        
        このツールは製品情報、FAQ、マニュアルなどの
        社内ドキュメントを検索します。
        
        Args:
            query: 検索クエリ（自然言語）
        
        Returns:
            関連するドキュメントチャンクのJSON文字列
            
            フォーマット:
            {
                "chunks": [
                    {
                        "content": "ドキュメント内容...",
                        "source": "ファイル名",
                        "score": 0.95
                    }
                ],
                "total": 5,
                "query": "元のクエリ"
            }
        """
        try:
            logger.info(
                "knowledge_search_started",
                query=query[:100],
                tenant_id=tenant_id,
            )
            
            results = await vector_client.search(
                query=query,
                tenant_id=tenant_id,
                top_k=max_results,
            )
            
            chunks = [
                {
                    "content": r.get("content", ""),
                    "source": r.get("source", "Unknown"),
                    "score": r.get("score", 0.0),
                }
                for r in results
            ]
            
            response = {
                "chunks": chunks,
                "total": len(chunks),
                "query": query,
            }
            
            logger.info(
                "knowledge_search_completed",
                query=query[:50],
                result_count=len(chunks),
            )
            
            return json.dumps(response, ensure_ascii=False, indent=2)
            
        except Exception as e:
            logger.error(
                "knowledge_search_failed",
                error=str(e),
                query=query[:50],
            )
            return json.dumps({
                "error": f"検索中にエラーが発生しました: {str(e)}",
                "chunks": [],
                "total": 0,
                "query": query,
            }, ensure_ascii=False)
    
    return search_knowledge_base


# Standalone function for use without dependency injection
async def search_knowledge_base(
    query: str,
    vector_client: VectorSearchClient,
    tenant_id: str | None = None,
    max_results: int = 5,
) -> dict[str, Any]:
    """Search knowledge base and return structured results.
    
    This is the non-tool version that can be called directly.
    
    Args:
        query: Search query in natural language
        vector_client: Vector search client instance
        tenant_id: Optional tenant ID
        max_results: Maximum results to return
    
    Returns:
        Dictionary with search results
    """
    try:
        results = await vector_client.search(
            query=query,
            tenant_id=tenant_id,
            top_k=max_results,
        )
        
        return {
            "chunks": [
                {
                    "content": r.get("content", ""),
                    "source": r.get("source", "Unknown"),
                    "score": r.get("score", 0.0),
                }
                for r in results
            ],
            "total": len(results),
            "query": query,
        }
        
    except Exception as e:
        logger.error("knowledge_search_failed", error=str(e))
        return {
            "error": str(e),
            "chunks": [],
            "total": 0,
            "query": query,
        }
