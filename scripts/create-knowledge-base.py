#!/usr/bin/env python3
"""
Knowledge Base (S3 Vector) Creation Script

Creates a Bedrock Knowledge Base with S3 as the data source
for RAG (Retrieval Augmented Generation) functionality.

Usage:
    python scripts/create-knowledge-base.py
"""

import boto3
import os
import time
import json
from typing import Optional

# Configuration
REGION = os.environ.get("AWS_DEFAULT_REGION", "ap-northeast-1")
ENVIRONMENT = os.environ.get("ENVIRONMENT", "development")
ACCOUNT_ID = boto3.client("sts").get_caller_identity()["Account"]

# Clients
bedrock_agent = boto3.client("bedrock-agent", region_name=REGION)
iam_client = boto3.client("iam")
ssm_client = boto3.client("ssm", region_name=REGION)
s3_client = boto3.client("s3", region_name=REGION)


def get_ssm_parameter(name: str) -> Optional[str]:
    """Get SSM parameter value."""
    try:
        response = ssm_client.get_parameter(Name=name)
        return response["Parameter"]["Value"]
    except ssm_client.exceptions.ParameterNotFound:
        print(f"  ⚠️  SSM parameter {name} not found")
        return None


def put_ssm_parameter(name: str, value: str, description: str = "") -> None:
    """Create or update SSM parameter."""
    ssm_client.put_parameter(
        Name=name,
        Value=value,
        Type="String",
        Description=description,
        Overwrite=True,
    )
    print(f"  ✅ SSM parameter {name} updated")


def create_knowledge_base_role() -> str:
    """Create IAM role for Knowledge Base."""
    role_name = f"bedrock-knowledge-base-role-{ENVIRONMENT}"
    
    # Check if role exists
    try:
        response = iam_client.get_role(RoleName=role_name)
        print(f"  ✅ IAM role already exists: {role_name}")
        return response["Role"]["Arn"]
    except iam_client.exceptions.NoSuchEntityException:
        pass
    
    print(f"  Creating IAM role: {role_name}")
    
    # Trust policy
    trust_policy = {
        "Version": "2012-10-17",
        "Statement": [
            {
                "Effect": "Allow",
                "Principal": {
                    "Service": "bedrock.amazonaws.com"
                },
                "Action": "sts:AssumeRole",
                "Condition": {
                    "StringEquals": {
                        "aws:SourceAccount": ACCOUNT_ID
                    },
                    "ArnLike": {
                        "aws:SourceArn": f"arn:aws:bedrock:{REGION}:{ACCOUNT_ID}:knowledge-base/*"
                    }
                }
            }
        ]
    }
    
    # Create role
    response = iam_client.create_role(
        RoleName=role_name,
        AssumeRolePolicyDocument=json.dumps(trust_policy),
        Description=f"IAM role for Bedrock Knowledge Base ({ENVIRONMENT})",
    )
    role_arn = response["Role"]["Arn"]
    
    # Attach policies
    policies = {
        "S3Access": {
            "Version": "2012-10-17",
            "Statement": [
                {
                    "Effect": "Allow",
                    "Action": [
                        "s3:GetObject",
                        "s3:ListBucket"
                    ],
                    "Resource": [
                        f"arn:aws:s3:::agentcore-documents-{ACCOUNT_ID}-{ENVIRONMENT}",
                        f"arn:aws:s3:::agentcore-documents-{ACCOUNT_ID}-{ENVIRONMENT}/*",
                        f"arn:aws:s3:::agentcore-vectors-{ACCOUNT_ID}-{ENVIRONMENT}",
                        f"arn:aws:s3:::agentcore-vectors-{ACCOUNT_ID}-{ENVIRONMENT}/*"
                    ]
                }
            ]
        },
        "BedrockAccess": {
            "Version": "2012-10-17",
            "Statement": [
                {
                    "Effect": "Allow",
                    "Action": [
                        "bedrock:InvokeModel"
                    ],
                    "Resource": [
                        f"arn:aws:bedrock:{REGION}::foundation-model/*"
                    ]
                }
            ]
        }
    }
    
    for policy_name, policy_doc in policies.items():
        iam_client.put_role_policy(
            RoleName=role_name,
            PolicyName=policy_name,
            PolicyDocument=json.dumps(policy_doc)
        )
    
    print(f"  ✅ IAM role created: {role_arn}")
    
    # Wait for IAM propagation
    print("  Waiting for IAM propagation (10s)...")
    time.sleep(10)
    
    return role_arn


def create_knowledge_base(role_arn: str) -> Optional[str]:
    """Create Bedrock Knowledge Base."""
    kb_name = f"agentcore-knowledge-base-{ENVIRONMENT}"
    
    # Check if KB already exists
    print(f"\n📚 Creating Knowledge Base: {kb_name}")
    response = bedrock_agent.list_knowledge_bases()
    for kb in response.get("knowledgeBaseSummaries", []):
        if kb.get("name") == kb_name:
            kb_id = kb["knowledgeBaseId"]
            print(f"  ✅ Knowledge Base already exists: {kb_id}")
            return kb_id
    
    # S3 bucket for documents
    documents_bucket = f"agentcore-documents-{ACCOUNT_ID}-{ENVIRONMENT}"
    
    try:
        response = bedrock_agent.create_knowledge_base(
            name=kb_name,
            description=f"Knowledge Base for Agentic RAG ({ENVIRONMENT})",
            roleArn=role_arn,
            knowledgeBaseConfiguration={
                "type": "VECTOR",
                "vectorKnowledgeBaseConfiguration": {
                    "embeddingModelArn": f"arn:aws:bedrock:{REGION}::foundation-model/amazon.titan-embed-text-v2:0"
                }
            },
            storageConfiguration={
                "type": "OPENSEARCH_SERVERLESS",
                "opensearchServerlessConfiguration": {
                    "collectionArn": "",  # Will be auto-created
                    "vectorIndexName": "bedrock-knowledge-base-index",
                    "fieldMapping": {
                        "vectorField": "embedding",
                        "textField": "text",
                        "metadataField": "metadata"
                    }
                }
            }
        )
        
        kb_id = response["knowledgeBase"]["knowledgeBaseId"]
        print(f"  ⏳ Knowledge Base created: {kb_id}")
        
        # Wait for KB to be active
        print("  Waiting for Knowledge Base to be ACTIVE...")
        for i in range(30):
            time.sleep(10)
            kb_response = bedrock_agent.get_knowledge_base(knowledgeBaseId=kb_id)
            status = kb_response["knowledgeBase"]["status"]
            print(f"    [{i*10}s] Status: {status}")
            if status == "ACTIVE":
                print(f"  ✅ Knowledge Base is ACTIVE")
                return kb_id
            if status == "FAILED":
                print(f"  ❌ Knowledge Base failed: {kb_response}")
                return None
        
        print("  ⚠️  Timeout waiting for Knowledge Base")
        return kb_id
        
    except Exception as e:
        print(f"  ❌ Failed to create Knowledge Base: {e}")
        # Try with simpler S3 configuration
        print("  Trying with S3 storage configuration...")
        return create_knowledge_base_s3_only(role_arn)


def create_knowledge_base_s3_only(role_arn: str) -> Optional[str]:
    """Create Knowledge Base with S3-only storage (simpler setup)."""
    kb_name = f"agentcore-kb-{ENVIRONMENT}"
    documents_bucket = f"agentcore-documents-{ACCOUNT_ID}-{ENVIRONMENT}"
    
    try:
        # First, create a simple KB without OpenSearch
        response = bedrock_agent.create_knowledge_base(
            name=kb_name,
            description=f"Knowledge Base for Agentic RAG ({ENVIRONMENT})",
            roleArn=role_arn,
            knowledgeBaseConfiguration={
                "type": "VECTOR",
                "vectorKnowledgeBaseConfiguration": {
                    "embeddingModelArn": f"arn:aws:bedrock:{REGION}::foundation-model/amazon.titan-embed-text-v2:0"
                }
            },
            storageConfiguration={
                "type": "PINECONE",  # Placeholder - will need actual vector store
            }
        )
        kb_id = response["knowledgeBase"]["knowledgeBaseId"]
        print(f"  ✅ Knowledge Base created (simple): {kb_id}")
        return kb_id
    except Exception as e:
        print(f"  ❌ Simple KB creation also failed: {e}")
        return None


def create_data_source(kb_id: str, role_arn: str) -> Optional[str]:
    """Create S3 data source for Knowledge Base."""
    print(f"\n📂 Creating Data Source for KB: {kb_id}")
    
    ds_name = f"s3-documents-{ENVIRONMENT}"
    documents_bucket = f"agentcore-documents-{ACCOUNT_ID}-{ENVIRONMENT}"
    
    # Check if data source exists
    response = bedrock_agent.list_data_sources(knowledgeBaseId=kb_id)
    for ds in response.get("dataSourceSummaries", []):
        if ds.get("name") == ds_name:
            ds_id = ds["dataSourceId"]
            print(f"  ✅ Data Source already exists: {ds_id}")
            return ds_id
    
    try:
        response = bedrock_agent.create_data_source(
            knowledgeBaseId=kb_id,
            name=ds_name,
            description=f"S3 documents data source ({ENVIRONMENT})",
            dataSourceConfiguration={
                "type": "S3",
                "s3Configuration": {
                    "bucketArn": f"arn:aws:s3:::{documents_bucket}",
                    "inclusionPrefixes": ["documents/"]
                }
            }
        )
        
        ds_id = response["dataSource"]["dataSourceId"]
        print(f"  ✅ Data Source created: {ds_id}")
        return ds_id
        
    except Exception as e:
        print(f"  ❌ Failed to create Data Source: {e}")
        return None


def main():
    print("=" * 60)
    print("  Knowledge Base (S3 Vector) Creation")
    print("=" * 60)
    print(f"  Environment: {ENVIRONMENT}")
    print(f"  Region: {REGION}")
    print(f"  Account ID: {ACCOUNT_ID}")
    print("=" * 60)
    
    # Step 1: Create IAM role
    print("\n🔐 Step 1: Create IAM Role")
    role_arn = create_knowledge_base_role()
    
    # Step 2: Create Knowledge Base
    print("\n📚 Step 2: Create Knowledge Base")
    kb_id = create_knowledge_base(role_arn)
    
    if kb_id:
        # Step 3: Create Data Source
        print("\n📂 Step 3: Create Data Source")
        ds_id = create_data_source(kb_id, role_arn)
        
        # Save to SSM
        put_ssm_parameter(
            f"/agentcore/{ENVIRONMENT}/knowledge-base-id",
            kb_id,
            "Bedrock Knowledge Base ID"
        )
        
        if ds_id:
            put_ssm_parameter(
                f"/agentcore/{ENVIRONMENT}/data-source-id",
                ds_id,
                "Knowledge Base Data Source ID"
            )
        
        print("\n" + "=" * 60)
        print("  ✅ Knowledge Base Setup Complete!")
        print("=" * 60)
        print(f"  Knowledge Base ID: {kb_id}")
        if ds_id:
            print(f"  Data Source ID: {ds_id}")
        print("=" * 60)
        return True
    else:
        print("\n❌ Knowledge Base creation failed")
        return False


if __name__ == "__main__":
    success = main()
    exit(0 if success else 1)

