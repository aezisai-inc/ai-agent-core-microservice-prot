#!/usr/bin/env python3
"""Knowledge Base Document Ingestion Script.

This script uploads sample documents to S3 and triggers
Knowledge Base ingestion for the Agentic RAG system.

Usage:
    # Upload and ingest documents
    python scripts/ingest-documents.py
    
    # Upload only (skip ingestion)
    python scripts/ingest-documents.py --upload-only
    
    # Check ingestion status
    python scripts/ingest-documents.py --status
"""

import argparse
import os
import sys
import time
from pathlib import Path

import boto3
from botocore.exceptions import ClientError

# Configuration from environment or defaults
REGION = os.getenv("AWS_REGION", "ap-northeast-1")
ENVIRONMENT = os.getenv("ENVIRONMENT", "development")


def get_config():
    """Get configuration from SSM Parameter Store."""
    ssm = boto3.client("ssm", region_name=REGION)
    sts = boto3.client("sts", region_name=REGION)
    
    account_id = sts.get_caller_identity()["Account"]
    
    config = {
        "account_id": account_id,
        "region": REGION,
        "environment": ENVIRONMENT,
    }
    
    # Try to get values from SSM
    param_mappings = {
        "knowledge_base_id": f"/agentcore/{ENVIRONMENT}/knowledge-base-id",
        "data_source_id": f"/agentcore/{ENVIRONMENT}/data-source-id",
    }
    
    for key, param_name in param_mappings.items():
        try:
            response = ssm.get_parameter(Name=param_name)
            config[key] = response["Parameter"]["Value"]
        except ClientError as e:
            if e.response["Error"]["Code"] == "ParameterNotFound":
                print(f"Warning: SSM parameter {param_name} not found")
                config[key] = None
            else:
                raise
    
    # Derive bucket name
    config["documents_bucket"] = f"agentcore-documents-{account_id}-{ENVIRONMENT}"
    
    return config


def upload_documents(config: dict, docs_path: str = "docs/sample"):
    """Upload documents to S3.
    
    Args:
        config: Configuration dictionary
        docs_path: Path to documents directory
    """
    s3 = boto3.client("s3", region_name=REGION)
    bucket = config["documents_bucket"]
    
    docs_dir = Path(docs_path)
    if not docs_dir.exists():
        print(f"Error: Documents directory '{docs_path}' not found")
        sys.exit(1)
    
    print(f"\n📤 Uploading documents to s3://{bucket}/documents/")
    print("-" * 50)
    
    uploaded_count = 0
    for doc_file in docs_dir.glob("**/*"):
        if doc_file.is_file():
            # Preserve relative path structure
            relative_path = doc_file.relative_to(docs_dir)
            s3_key = f"documents/{relative_path}"
            
            # Determine content type
            content_type = "text/plain"
            if doc_file.suffix == ".md":
                content_type = "text/markdown"
            elif doc_file.suffix == ".pdf":
                content_type = "application/pdf"
            elif doc_file.suffix == ".html":
                content_type = "text/html"
            
            try:
                s3.upload_file(
                    str(doc_file),
                    bucket,
                    s3_key,
                    ExtraArgs={
                        "ContentType": content_type,
                        "Metadata": {
                            "tenant_id": "default",
                            "source": "sample-docs",
                        },
                    },
                )
                print(f"  ✅ {relative_path} -> {s3_key}")
                uploaded_count += 1
            except Exception as e:
                print(f"  ❌ {relative_path}: {e}")
    
    print(f"\n📊 Uploaded {uploaded_count} documents")
    return uploaded_count


def start_ingestion(config: dict):
    """Start Knowledge Base ingestion job.
    
    Args:
        config: Configuration dictionary
    
    Returns:
        Ingestion job ID
    """
    if not config.get("knowledge_base_id") or not config.get("data_source_id"):
        print("Error: Knowledge Base ID or Data Source ID not configured")
        print("Please set SSM parameters or check configuration")
        sys.exit(1)
    
    bedrock_agent = boto3.client("bedrock-agent", region_name=REGION)
    
    print(f"\n🔄 Starting ingestion job...")
    print(f"   Knowledge Base: {config['knowledge_base_id']}")
    print(f"   Data Source: {config['data_source_id']}")
    
    try:
        response = bedrock_agent.start_ingestion_job(
            knowledgeBaseId=config["knowledge_base_id"],
            dataSourceId=config["data_source_id"],
        )
        
        job_id = response["ingestionJob"]["ingestionJobId"]
        status = response["ingestionJob"]["status"]
        
        print(f"\n✅ Ingestion job started!")
        print(f"   Job ID: {job_id}")
        print(f"   Status: {status}")
        
        return job_id
        
    except Exception as e:
        print(f"\n❌ Failed to start ingestion: {e}")
        sys.exit(1)


def check_ingestion_status(config: dict, job_id: str = None):
    """Check ingestion job status.
    
    Args:
        config: Configuration dictionary
        job_id: Specific job ID to check (optional)
    """
    if not config.get("knowledge_base_id") or not config.get("data_source_id"):
        print("Error: Knowledge Base ID or Data Source ID not configured")
        sys.exit(1)
    
    bedrock_agent = boto3.client("bedrock-agent", region_name=REGION)
    
    print(f"\n📊 Ingestion Status")
    print("-" * 50)
    
    try:
        response = bedrock_agent.list_ingestion_jobs(
            knowledgeBaseId=config["knowledge_base_id"],
            dataSourceId=config["data_source_id"],
            maxResults=5,
        )
        
        jobs = response.get("ingestionJobSummaries", [])
        
        if not jobs:
            print("No ingestion jobs found")
            return
        
        for job in jobs:
            job_id = job["ingestionJobId"]
            status = job["status"]
            started = job.get("startedAt", "N/A")
            
            status_icon = {
                "STARTING": "🔄",
                "IN_PROGRESS": "⏳",
                "COMPLETE": "✅",
                "FAILED": "❌",
            }.get(status, "❓")
            
            print(f"\n{status_icon} Job: {job_id}")
            print(f"   Status: {status}")
            print(f"   Started: {started}")
            
            if status == "COMPLETE":
                stats = job.get("statistics", {})
                print(f"   Documents Scanned: {stats.get('numberOfDocumentsScanned', 'N/A')}")
                print(f"   Documents Indexed: {stats.get('numberOfNewDocumentsIndexed', 'N/A')}")
                print(f"   Documents Failed: {stats.get('numberOfDocumentsFailed', 'N/A')}")
                
    except Exception as e:
        print(f"Error checking status: {e}")


def wait_for_ingestion(config: dict, job_id: str, timeout: int = 600):
    """Wait for ingestion job to complete.
    
    Args:
        config: Configuration dictionary
        job_id: Ingestion job ID
        timeout: Maximum wait time in seconds
    """
    bedrock_agent = boto3.client("bedrock-agent", region_name=REGION)
    
    print(f"\n⏳ Waiting for ingestion to complete (timeout: {timeout}s)...")
    
    start_time = time.time()
    while time.time() - start_time < timeout:
        try:
            response = bedrock_agent.get_ingestion_job(
                knowledgeBaseId=config["knowledge_base_id"],
                dataSourceId=config["data_source_id"],
                ingestionJobId=job_id,
            )
            
            status = response["ingestionJob"]["status"]
            
            if status == "COMPLETE":
                print(f"\n✅ Ingestion completed!")
                stats = response["ingestionJob"].get("statistics", {})
                print(f"   Documents Scanned: {stats.get('numberOfDocumentsScanned', 'N/A')}")
                print(f"   Documents Indexed: {stats.get('numberOfNewDocumentsIndexed', 'N/A')}")
                return True
                
            elif status == "FAILED":
                print(f"\n❌ Ingestion failed!")
                failure_reasons = response["ingestionJob"].get("failureReasons", [])
                for reason in failure_reasons:
                    print(f"   Reason: {reason}")
                return False
            
            print(f"   Status: {status}...", end="\r")
            time.sleep(10)
            
        except Exception as e:
            print(f"Error: {e}")
            time.sleep(10)
    
    print(f"\n⚠️ Timeout waiting for ingestion")
    return False


def main():
    parser = argparse.ArgumentParser(description="Knowledge Base Document Ingestion")
    parser.add_argument(
        "--upload-only",
        action="store_true",
        help="Upload documents only, skip ingestion",
    )
    parser.add_argument(
        "--status",
        action="store_true",
        help="Check ingestion status only",
    )
    parser.add_argument(
        "--wait",
        action="store_true",
        help="Wait for ingestion to complete",
    )
    parser.add_argument(
        "--docs-path",
        default="docs/sample",
        help="Path to documents directory",
    )
    args = parser.parse_args()
    
    print("=" * 50)
    print("🚀 Knowledge Base Document Ingestion")
    print("=" * 50)
    
    # Get configuration
    config = get_config()
    print(f"\n📋 Configuration:")
    print(f"   Region: {config['region']}")
    print(f"   Environment: {config['environment']}")
    print(f"   Documents Bucket: {config['documents_bucket']}")
    print(f"   Knowledge Base: {config.get('knowledge_base_id', 'Not configured')}")
    print(f"   Data Source: {config.get('data_source_id', 'Not configured')}")
    
    if args.status:
        check_ingestion_status(config)
        return
    
    # Upload documents
    uploaded = upload_documents(config, args.docs_path)
    
    if uploaded == 0:
        print("No documents uploaded")
        return
    
    if args.upload_only:
        print("\n📝 Upload complete. Run without --upload-only to start ingestion.")
        return
    
    # Start ingestion
    job_id = start_ingestion(config)
    
    if args.wait:
        wait_for_ingestion(config, job_id)
    else:
        print("\n💡 Run with --status to check ingestion progress")
        print(f"   python scripts/ingest-documents.py --status")


if __name__ == "__main__":
    main()










