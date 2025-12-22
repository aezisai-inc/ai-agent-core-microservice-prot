#!/usr/bin/env python3
"""RAG Retrieval Test Script.

Tests the Knowledge Base retrieval after document ingestion.

Usage:
    python scripts/test-rag-retrieval.py "検索クエリ"
    python scripts/test-rag-retrieval.py --interactive
"""

import argparse
import json
import os

import boto3
from botocore.exceptions import ClientError

REGION = os.getenv("AWS_REGION", "ap-northeast-1")
ENVIRONMENT = os.getenv("ENVIRONMENT", "development")


def get_knowledge_base_id():
    """Get Knowledge Base ID from SSM."""
    ssm = boto3.client("ssm", region_name=REGION)
    
    try:
        response = ssm.get_parameter(
            Name=f"/agentcore/{ENVIRONMENT}/knowledge-base-id"
        )
        return response["Parameter"]["Value"]
    except ClientError as e:
        if e.response["Error"]["Code"] == "ParameterNotFound":
            print("Error: Knowledge Base ID not found in SSM")
            print("Please run the deployment scripts first")
            return None
        raise


def search_knowledge_base(query: str, kb_id: str, top_k: int = 5):
    """Search the Knowledge Base.
    
    Args:
        query: Search query
        kb_id: Knowledge Base ID
        top_k: Number of results to return
    
    Returns:
        List of search results
    """
    client = boto3.client("bedrock-agent-runtime", region_name=REGION)
    
    try:
        response = client.retrieve(
            knowledgeBaseId=kb_id,
            retrievalQuery={"text": query},
            retrievalConfiguration={
                "vectorSearchConfiguration": {
                    "numberOfResults": top_k,
                }
            },
        )
        
        return response.get("retrievalResults", [])
        
    except Exception as e:
        print(f"Error searching: {e}")
        return []


def display_results(results: list, query: str):
    """Display search results in a formatted way.
    
    Args:
        results: List of search results
        query: Original query
    """
    print(f"\n🔍 Query: {query}")
    print("=" * 60)
    
    if not results:
        print("No results found")
        return
    
    print(f"Found {len(results)} results:\n")
    
    for i, result in enumerate(results, 1):
        score = result.get("score", 0)
        content = result.get("content", {}).get("text", "")
        location = result.get("location", {})
        
        # Get source info
        s3_location = location.get("s3Location", {})
        source_uri = s3_location.get("uri", "Unknown")
        source_name = source_uri.split("/")[-1] if source_uri else "Unknown"
        
        print(f"📄 Result {i} (Score: {score:.4f})")
        print(f"   Source: {source_name}")
        print("-" * 40)
        
        # Truncate content for display
        display_content = content[:500] + "..." if len(content) > 500 else content
        print(f"   {display_content}")
        print()


def interactive_mode(kb_id: str):
    """Run in interactive mode.
    
    Args:
        kb_id: Knowledge Base ID
    """
    print("\n🤖 Interactive RAG Retrieval Test")
    print("   Type 'quit' to exit\n")
    
    while True:
        try:
            query = input("Query> ").strip()
            
            if query.lower() in ["quit", "exit", "q"]:
                print("Goodbye!")
                break
            
            if not query:
                continue
            
            results = search_knowledge_base(query, kb_id)
            display_results(results, query)
            
        except KeyboardInterrupt:
            print("\nGoodbye!")
            break


def main():
    parser = argparse.ArgumentParser(description="Test RAG Retrieval")
    parser.add_argument(
        "query",
        nargs="?",
        help="Search query",
    )
    parser.add_argument(
        "--interactive", "-i",
        action="store_true",
        help="Run in interactive mode",
    )
    parser.add_argument(
        "--top-k", "-k",
        type=int,
        default=5,
        help="Number of results to return",
    )
    args = parser.parse_args()
    
    # Get Knowledge Base ID
    kb_id = get_knowledge_base_id()
    if not kb_id:
        return
    
    print(f"📚 Knowledge Base: {kb_id}")
    
    if args.interactive:
        interactive_mode(kb_id)
    elif args.query:
        results = search_knowledge_base(args.query, kb_id, args.top_k)
        display_results(results, args.query)
    else:
        # Default test queries
        test_queries = [
            "製品の返品方法を教えてください",
            "APIの認証方法は？",
            "料金プランについて",
            "パスワードを忘れた場合",
        ]
        
        print("\n📋 Running test queries...\n")
        
        for query in test_queries:
            results = search_knowledge_base(query, kb_id, 3)
            display_results(results, query)
            print("\n" + "=" * 60 + "\n")


if __name__ == "__main__":
    main()










