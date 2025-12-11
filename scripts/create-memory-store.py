#!/usr/bin/env python3
"""
AgentCore Memory Store 作成スクリプト

⚠️  DEPRECATED: このスクリプトは非推奨です。
    CDK Custom Resource を使用してください。

    代替方法:
    ```bash
    cd infrastructure
    npx cdk deploy AgenticRag-Memory-*
    ```

    詳細: docs/architecture/iac-custom-resource-design.md

Usage (非推奨):
    uv run python scripts/create-memory-store.py [--env development|staging|prod]
"""

import argparse
import json
import sys
import time
import warnings

import boto3
from botocore.exceptions import ClientError

# Deprecation warning
warnings.warn(
    "\n"
    "=" * 70 + "\n"
    "⚠️  DEPRECATED: This script is deprecated.\n"
    "   Use CDK Custom Resource instead:\n"
    "\n"
    "   cd infrastructure\n"
    "   npx cdk deploy AgenticRag-Memory-*\n"
    "\n"
    "   See: docs/architecture/iac-custom-resource-design.md\n"
    "=" * 70,
    DeprecationWarning,
    stacklevel=2
)


def create_memory_store(env: str = "development", region: str = "us-east-1") -> dict:
    """AgentCore Memory Store を作成"""
    client = boto3.client("bedrock-agentcore-control", region_name=region)
    
    # 名前はハイフン不可、英数字+アンダースコアのみ
    name = f"agenticRagMemory{env.capitalize()}"
    
    # 既存チェック
    try:
        response = client.list_memories()
        for memory in response.get("memories", []):
            if memory["name"] == name:
                print(f"Memory Store already exists: {memory['id']}")
                return memory
    except ClientError as e:
        print(f"Warning: Could not list memories: {e}")
    
    # 作成
    print(f"Creating Memory Store: {name}")
    response = client.create_memory(
        name=name,
        description=f"Memory store for Agentic RAG {env} environment",
        eventExpiryDuration=30 if env == "development" else 90,
    )
    
    memory = response["memory"]
    print(f"Created: {memory['id']} (status: {memory['status']})")
    
    # ステータス待機
    print("Waiting for ACTIVE status...")
    for _ in range(60):  # 最大3分待機
        time.sleep(3)
        response = client.get_memory(memoryId=memory["id"])
        status = response["memory"]["status"]
        print(f"  Status: {status}")
        if status == "ACTIVE":
            return response["memory"]
        if status == "FAILED":
            raise RuntimeError(f"Memory Store creation failed: {memory['id']}")
    
    print("Warning: Memory Store still creating after 3 minutes")
    return memory


def update_ssm_parameter(memory_id: str, env: str, region: str = "ap-northeast-1"):
    """SSM パラメータを更新"""
    ssm = boto3.client("ssm", region_name=region)
    
    param_name = f"/agentcore/{env}/memory-store-id"
    
    ssm.put_parameter(
        Name=param_name,
        Value=memory_id,
        Type="String",
        Overwrite=True,
    )
    print(f"Updated SSM Parameter: {param_name} = {memory_id}")


def main():
    parser = argparse.ArgumentParser(description="Create AgentCore Memory Store")
    parser.add_argument(
        "--env",
        choices=["development", "staging", "prod"],
        default="development",
        help="Environment name",
    )
    parser.add_argument(
        "--region",
        default="us-east-1",
        help="AWS region for AgentCore (default: us-east-1)",
    )
    parser.add_argument(
        "--ssm-region",
        default="ap-northeast-1",
        help="AWS region for SSM Parameter (default: ap-northeast-1)",
    )
    args = parser.parse_args()
    
    try:
        memory = create_memory_store(args.env, args.region)
        update_ssm_parameter(memory["id"], args.env, args.ssm_region)
        
        print()
        print("=== Summary ===")
        print(json.dumps(memory, indent=2, default=str))
        
    except ClientError as e:
        print(f"AWS Error: {e}", file=sys.stderr)
        sys.exit(1)
    except Exception as e:
        print(f"Error: {e}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()

