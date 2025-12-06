"""S3Vector Client for serverless vector search."""

from typing import Any

import boto3
import structlog

logger = structlog.get_logger()


class S3VectorClient:
    """Client for S3Vector serverless vector store.

    S3Vector provides vector search capabilities using S3 as the
    underlying storage, integrated with Bedrock Knowledge Bases.
    """

    def __init__(
        self,
        knowledge_base_id: str,
        region_name: str = "ap-northeast-1",
    ):
        self._client = boto3.client("bedrock-agent-runtime", region_name=region_name)
        self._knowledge_base_id = knowledge_base_id
        self._region = region_name

    async def search(
        self,
        query: str,
        tenant_id: str,
        top_k: int = 5,
        score_threshold: float = 0.7,
    ) -> list[dict[str, Any]]:
        """Search for relevant documents using vector similarity.

        Args:
            query: The search query
            tenant_id: The tenant ID for multi-tenant filtering
            top_k: Number of results to return
            score_threshold: Minimum similarity score

        Returns:
            List of relevant document chunks with scores
        """
        try:
            # Build the retrieval configuration
            retrieval_config = {
                "vectorSearchConfiguration": {
                    "numberOfResults": top_k,
                    "overrideSearchType": "HYBRID",
                    "filter": {
                        "equals": {
                            "key": "tenant_id",
                            "value": tenant_id,
                        }
                    },
                }
            }

            response = self._client.retrieve(
                knowledgeBaseId=self._knowledge_base_id,
                retrievalQuery={"text": query},
                retrievalConfiguration=retrieval_config,
            )

            results = []
            for result in response.get("retrievalResults", []):
                score = result.get("score", 0)

                # Filter by score threshold
                if score < score_threshold:
                    continue

                content = result.get("content", {}).get("text", "")
                location = result.get("location", {})
                metadata = result.get("metadata", {})

                results.append(
                    {
                        "content": content,
                        "score": score,
                        "source": location.get("s3Location", {}).get("uri", ""),
                        "chunk_id": metadata.get("chunk_id", ""),
                        "document_id": metadata.get("document_id", ""),
                        "metadata": metadata,
                    }
                )

            logger.info(
                "s3vector_search_complete",
                knowledge_base_id=self._knowledge_base_id,
                query_length=len(query),
                results_count=len(results),
            )

            return results

        except Exception as e:
            logger.error(
                "s3vector_search_error",
                error=str(e),
                knowledge_base_id=self._knowledge_base_id,
            )
            raise

    async def retrieve_and_generate(
        self,
        query: str,
        tenant_id: str,
        model_id: str = "anthropic.claude-3-sonnet-20240229-v1:0",
        top_k: int = 5,
    ) -> dict[str, Any]:
        """Retrieve relevant documents and generate a response.

        This combines retrieval and generation in a single call,
        using Bedrock's built-in RAG capabilities.
        """
        try:
            response = self._client.retrieve_and_generate(
                input={"text": query},
                retrieveAndGenerateConfiguration={
                    "type": "KNOWLEDGE_BASE",
                    "knowledgeBaseConfiguration": {
                        "knowledgeBaseId": self._knowledge_base_id,
                        "modelArn": f"arn:aws:bedrock:{self._region}::foundation-model/{model_id}",
                        "retrievalConfiguration": {
                            "vectorSearchConfiguration": {
                                "numberOfResults": top_k,
                                "filter": {
                                    "equals": {
                                        "key": "tenant_id",
                                        "value": tenant_id,
                                    }
                                },
                            }
                        },
                    },
                },
            )

            output = response.get("output", {}).get("text", "")
            citations = response.get("citations", [])

            # Extract sources from citations
            sources = []
            for citation in citations:
                for ref in citation.get("retrievedReferences", []):
                    sources.append(
                        {
                            "content": ref.get("content", {}).get("text", ""),
                            "source": ref.get("location", {}).get("s3Location", {}).get("uri", ""),
                        }
                    )

            return {
                "response": output,
                "sources": sources,
            }

        except Exception as e:
            logger.error(
                "s3vector_retrieve_and_generate_error",
                error=str(e),
                knowledge_base_id=self._knowledge_base_id,
            )
            raise
