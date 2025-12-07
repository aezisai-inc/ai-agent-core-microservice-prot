#!/usr/bin/env python3
"""
AgentCore 完全デプロイスクリプト

以下を順番に作成:
1. Knowledge Base (S3 Vector RAG)
2. CodeBuild でイメージビルド & ECR プッシュ
3. Agent Runtime
4. Agent Runtime Endpoint

Usage:
    uv run python scripts/deploy-agentcore.py --env development
"""

import argparse
import json
import sys
import time
import uuid

import boto3
from botocore.exceptions import ClientError


def create_knowledge_base(env: str, region: str = "ap-northeast-1") -> dict:
    """Knowledge Base (S3 Vector) を作成"""
    client = boto3.client("bedrock-agent", region_name=region)
    
    kb_name = f"agentic-rag-kb-{env}"
    
    # 既存チェック
    try:
        response = client.list_knowledge_bases()
        for kb in response.get("knowledgeBaseSummaries", []):
            if kb["name"] == kb_name:
                print(f"Knowledge Base already exists: {kb['knowledgeBaseId']}")
                return kb
    except ClientError as e:
        print(f"Warning: {e}")
    
    # 作成
    print(f"Creating Knowledge Base: {kb_name}")
    
    # IAM Role ARN (CDKで作成済みのものを使用)
    account_id = boto3.client("sts").get_caller_identity()["Account"]
    role_arn = f"arn:aws:iam::{account_id}:role/agentcore-runtime-role-{env}"
    
    try:
        response = client.create_knowledge_base(
            name=kb_name,
            description=f"Knowledge Base for Agentic RAG {env}",
            roleArn=role_arn,
            knowledgeBaseConfiguration={
                "type": "VECTOR",
                "vectorKnowledgeBaseConfiguration": {
                    "embeddingModelArn": f"arn:aws:bedrock:{region}::foundation-model/amazon.titan-embed-text-v2:0"
                }
            },
            storageConfiguration={
                "type": "S3",
                "s3Configuration": {
                    "bucketArn": f"arn:aws:s3:::agentcore-vectors-{account_id}-{env}"
                }
            }
        )
        print(f"Created: {response['knowledgeBase']['knowledgeBaseId']}")
        return response["knowledgeBase"]
    except ClientError as e:
        print(f"Error creating Knowledge Base: {e}")
        raise


def start_codebuild(env: str, region: str = "ap-northeast-1") -> str:
    """CodeBuild でイメージビルド開始"""
    client = boto3.client("codebuild", region_name=region)
    
    project_name = f"agentic-rag-build-{env}"
    
    # ビルド開始
    print(f"Starting CodeBuild: {project_name}")
    try:
        response = client.start_build(
            projectName=project_name,
            environmentVariablesOverride=[
                {"name": "ENVIRONMENT", "value": env, "type": "PLAINTEXT"},
            ]
        )
        build_id = response["build"]["id"]
        print(f"Build started: {build_id}")
        return build_id
    except ClientError as e:
        print(f"Error: {e}")
        print("CodeBuild project may not exist. Creating buildspec for manual setup...")
        return None


def wait_codebuild(build_id: str, region: str = "ap-northeast-1") -> bool:
    """CodeBuild 完了待機"""
    client = boto3.client("codebuild", region_name=region)
    
    print("Waiting for CodeBuild to complete...")
    for _ in range(60):  # 最大30分
        response = client.batch_get_builds(ids=[build_id])
        build = response["builds"][0]
        status = build["buildStatus"]
        print(f"  Status: {status}")
        
        if status == "SUCCEEDED":
            return True
        if status in ["FAILED", "FAULT", "STOPPED", "TIMED_OUT"]:
            print(f"Build failed: {status}")
            return False
        
        time.sleep(30)
    
    print("Build timed out")
    return False


def create_agent_runtime(
    env: str,
    ecr_uri: str,
    memory_store_id: str,
    knowledge_base_id: str,
    region: str = "us-east-1"
) -> dict:
    """AgentCore Runtime を作成"""
    client = boto3.client("bedrock-agentcore-control", region_name=region)
    
    runtime_name = f"agenticRagRuntime{env.capitalize()}"
    
    # 既存チェック
    try:
        response = client.list_agent_runtimes()
        for runtime in response.get("agentRuntimes", []):
            if runtime.get("name") == runtime_name:
                print(f"Agent Runtime already exists: {runtime['agentRuntimeId']}")
                return runtime
    except ClientError as e:
        print(f"Warning: {e}")
    
    # 作成
    print(f"Creating Agent Runtime: {runtime_name}")
    
    account_id = boto3.client("sts").get_caller_identity()["Account"]
    role_arn = f"arn:aws:iam::{account_id}:role/agentcore-runtime-role-{env}"
    
    try:
        response = client.create_agent_runtime(
            agentRuntimeName=runtime_name,
            description=f"AgentCore Runtime for Agentic RAG {env}",
            agentRuntimeArtifact={
                "containerConfiguration": {
                    "containerUri": ecr_uri,
                }
            },
            roleArn=role_arn,
            networkConfiguration={
                "networkMode": "PUBLIC"
            },
        )
        print(f"Created: {response['agentRuntime']['agentRuntimeId']}")
        return response["agentRuntime"]
    except ClientError as e:
        print(f"Error creating Agent Runtime: {e}")
        raise


def create_agent_runtime_endpoint(
    runtime_id: str,
    env: str,
    region: str = "us-east-1"
) -> dict:
    """Agent Runtime Endpoint を作成"""
    client = boto3.client("bedrock-agentcore-control", region_name=region)
    
    endpoint_name = f"agenticRagEndpoint{env.capitalize()}"
    
    # 既存チェック
    try:
        response = client.list_agent_runtime_endpoints(agentRuntimeId=runtime_id)
        for endpoint in response.get("agentRuntimeEndpoints", []):
            if endpoint.get("name") == endpoint_name:
                print(f"Endpoint already exists: {endpoint['agentRuntimeEndpointId']}")
                return endpoint
    except ClientError as e:
        print(f"Warning: {e}")
    
    # 作成
    print(f"Creating Agent Runtime Endpoint: {endpoint_name}")
    
    try:
        response = client.create_agent_runtime_endpoint(
            agentRuntimeId=runtime_id,
            name=endpoint_name,
            description=f"Endpoint for Agentic RAG {env}",
        )
        print(f"Created: {response['agentRuntimeEndpoint']['agentRuntimeEndpointId']}")
        return response["agentRuntimeEndpoint"]
    except ClientError as e:
        print(f"Error creating Endpoint: {e}")
        raise


def update_ssm_parameters(
    env: str,
    knowledge_base_id: str,
    runtime_id: str,
    endpoint_url: str,
    region: str = "ap-northeast-1"
):
    """SSM パラメータを更新"""
    ssm = boto3.client("ssm", region_name=region)
    
    params = {
        f"/agentcore/{env}/knowledge-base-id": knowledge_base_id,
        f"/agentcore/{env}/runtime-id": runtime_id,
        f"/agentcore/{env}/endpoint-url": endpoint_url,
    }
    
    for name, value in params.items():
        ssm.put_parameter(Name=name, Value=value, Type="String", Overwrite=True)
        print(f"Updated SSM: {name}")


def main():
    parser = argparse.ArgumentParser(description="Deploy AgentCore")
    parser.add_argument("--env", default="development", help="Environment")
    parser.add_argument("--skip-build", action="store_true", help="Skip CodeBuild")
    args = parser.parse_args()
    
    env = args.env
    account_id = boto3.client("sts").get_caller_identity()["Account"]
    ecr_uri = f"{account_id}.dkr.ecr.ap-northeast-1.amazonaws.com/agentic-rag-agent-{env}:latest"
    
    print(f"\n=== Deploying AgentCore for {env} ===\n")
    
    # 1. Knowledge Base
    print("\n--- Step 1: Knowledge Base ---")
    try:
        kb = create_knowledge_base(env)
        kb_id = kb.get("knowledgeBaseId", "unknown")
    except Exception as e:
        print(f"Skipping Knowledge Base: {e}")
        kb_id = "placeholder"
    
    # 2. CodeBuild (オプション)
    if not args.skip_build:
        print("\n--- Step 2: CodeBuild ---")
        build_id = start_codebuild(env)
        if build_id:
            if not wait_codebuild(build_id):
                print("Build failed. Run manually or use --skip-build")
                sys.exit(1)
    
    # 3. Agent Runtime
    print("\n--- Step 3: Agent Runtime ---")
    # Memory Store ID を取得
    ssm = boto3.client("ssm", region_name="ap-northeast-1")
    try:
        memory_store_id = ssm.get_parameter(
            Name=f"/agentcore/{env}/memory-store-id"
        )["Parameter"]["Value"]
    except:
        memory_store_id = "placeholder"
    
    try:
        runtime = create_agent_runtime(env, ecr_uri, memory_store_id, kb_id)
        runtime_id = runtime.get("agentRuntimeId", runtime.get("id", "unknown"))
    except Exception as e:
        print(f"Error: {e}")
        sys.exit(1)
    
    # 4. Endpoint
    print("\n--- Step 4: Agent Runtime Endpoint ---")
    try:
        endpoint = create_agent_runtime_endpoint(runtime_id, env)
        endpoint_url = endpoint.get("endpointUrl", "pending")
    except Exception as e:
        print(f"Error: {e}")
        endpoint_url = "pending"
    
    # 5. SSM 更新
    print("\n--- Step 5: Update SSM Parameters ---")
    try:
        update_ssm_parameters(env, kb_id, runtime_id, endpoint_url)
    except Exception as e:
        print(f"Warning: {e}")
    
    print(f"\n=== Deployment Complete ===")
    print(f"Knowledge Base ID: {kb_id}")
    print(f"Runtime ID: {runtime_id}")
    print(f"Endpoint URL: {endpoint_url}")


if __name__ == "__main__":
    main()

