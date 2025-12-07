#!/usr/bin/env python3
"""
AgentCore Full Deployment Script

This script deploys the complete AgentCore infrastructure:
1. Agent Runtime (using ECR image)
2. Agent Runtime Endpoint
3. Gateway (optional)

Prerequisites:
- ECR image must be built and pushed
- Memory Store must be created (us-east-1)
- IAM role must exist

Usage:
    python scripts/deploy-agentcore-full.py
"""

import boto3
import os
import time
import json
from typing import Optional

# Configuration
AGENTCORE_REGION = "us-east-1"  # AgentCore is only available in us-east-1
INFRA_REGION = os.environ.get("AWS_DEFAULT_REGION", "ap-northeast-1")
ENVIRONMENT = os.environ.get("ENVIRONMENT", "development")
ACCOUNT_ID = boto3.client("sts").get_caller_identity()["Account"]

# Clients
agentcore_client = boto3.client("bedrock-agentcore-control", region_name=AGENTCORE_REGION)
ssm_client = boto3.client("ssm", region_name=INFRA_REGION)
iam_client = boto3.client("iam")


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


def wait_for_status(get_func, resource_id: str, target_status: str = "ACTIVE", max_wait: int = 300) -> bool:
    """Wait for resource to reach target status."""
    start_time = time.time()
    while time.time() - start_time < max_wait:
        try:
            response = get_func(resource_id)
            status = response.get("status", "UNKNOWN")
            print(f"    Status: {status}")
            if status == target_status:
                return True
            if status in ["FAILED", "DELETE_FAILED"]:
                print(f"  ❌ Resource failed: {response}")
                return False
        except Exception as e:
            print(f"    Error checking status: {e}")
        time.sleep(10)
    print(f"  ⚠️  Timeout waiting for {target_status}")
    return False


def get_or_create_workload_identity() -> Optional[str]:
    """Get or create workload identity for AgentCore."""
    print("\n🔐 Checking Workload Identity...")
    
    # Name must match [a-zA-Z][a-zA-Z0-9_]{0,47} - no hyphens allowed
    identity_name = f"agentcoreIdentity{ENVIRONMENT.capitalize()}"
    
    # List existing identities
    try:
        response = agentcore_client.list_workload_identities()
        for identity in response.get("workloadIdentities", []):
            if identity.get("name") == identity_name:
                identity_id = identity["workloadIdentityId"]
                print(f"  ✅ Found existing Workload Identity: {identity_id}")
                return identity_id
    except Exception as e:
        print(f"  ⚠️  Error listing identities: {e}")
    
    # Create new identity
    try:
        print(f"  Creating Workload Identity '{identity_name}'...")
        response = agentcore_client.create_workload_identity(name=identity_name)
        identity_id = response["workloadIdentity"]["workloadIdentityId"]
        print(f"  ✅ Created Workload Identity: {identity_id}")
        return identity_id
    except Exception as e:
        print(f"  ❌ Failed to create Workload Identity: {e}")
        return None


def create_agent_runtime(ecr_uri: str, memory_store_id: str) -> Optional[str]:
    """Create Agent Runtime."""
    print("\n🚀 Creating Agent Runtime...")
    
    # Name must match [a-zA-Z][a-zA-Z0-9_]{0,47} - no hyphens allowed
    runtime_name = f"agentcoreRuntime{ENVIRONMENT.capitalize()}"
    
    # Check if runtime already exists
    try:
        response = agentcore_client.list_agent_runtimes()
        for runtime in response.get("agentRuntimes", []):
            if runtime.get("name") == runtime_name:
                runtime_id = runtime["agentRuntimeId"]
                print(f"  ✅ Found existing Agent Runtime: {runtime_id}")
                return runtime_id
    except Exception as e:
        print(f"  ⚠️  Error listing runtimes: {e}")
    
    # Get IAM role ARN
    role_arn = f"arn:aws:iam::{ACCOUNT_ID}:role/agentcore-runtime-role-{ENVIRONMENT}"
    
    try:
        print(f"  Creating Agent Runtime '{runtime_name}'...")
        print(f"    ECR URI: {ecr_uri}")
        print(f"    Memory Store ID: {memory_store_id}")
        print(f"    Role ARN: {role_arn}")
        
        response = agentcore_client.create_agent_runtime(
            agentRuntimeName=runtime_name,
            description=f"AgentCore Runtime for {ENVIRONMENT} environment",
            agentRuntimeArtifact={
                "containerConfiguration": {
                    "containerUri": f"{ecr_uri}:latest",
                }
            },
            roleArn=role_arn,
            networkConfiguration={
                "networkMode": "PUBLIC"
            },
        )
        
        runtime_id = response["agentRuntimeId"]
        print(f"  ⏳ Agent Runtime created: {runtime_id}")
        print("  Waiting for runtime to become ACTIVE...")
        
        # Wait for runtime to be active
        def get_runtime_status(rid):
            return agentcore_client.get_agent_runtime(agentRuntimeId=rid)["agentRuntime"]
        
        if wait_for_status(get_runtime_status, runtime_id):
            print(f"  ✅ Agent Runtime is ACTIVE: {runtime_id}")
            put_ssm_parameter(
                f"/agentcore/{ENVIRONMENT}/agent-runtime-id",
                runtime_id,
                "AgentCore Agent Runtime ID"
            )
            return runtime_id
        else:
            print(f"  ❌ Agent Runtime failed to activate")
            return None
            
    except Exception as e:
        print(f"  ❌ Failed to create Agent Runtime: {e}")
        return None


def create_agent_runtime_endpoint(runtime_id: str) -> Optional[str]:
    """Create Agent Runtime Endpoint."""
    print("\n🌐 Creating Agent Runtime Endpoint...")
    
    # Name must match [a-zA-Z][a-zA-Z0-9_]{0,47} - no hyphens allowed
    endpoint_name = f"agentcoreEndpoint{ENVIRONMENT.capitalize()}"
    
    # Check if endpoint already exists
    try:
        response = agentcore_client.list_agent_runtime_endpoints(agentRuntimeId=runtime_id)
        for endpoint in response.get("agentRuntimeEndpoints", []):
            if endpoint.get("name") == endpoint_name:
                endpoint_id = endpoint["agentRuntimeEndpointId"]
                print(f"  ✅ Found existing Endpoint: {endpoint_id}")
                return endpoint_id
    except Exception as e:
        print(f"  ⚠️  Error listing endpoints: {e}")
    
    try:
        print(f"  Creating Endpoint '{endpoint_name}'...")
        
        response = agentcore_client.create_agent_runtime_endpoint(
            agentRuntimeId=runtime_id,
            name=endpoint_name,
            description=f"Endpoint for AgentCore Runtime in {ENVIRONMENT}",
        )
        
        endpoint_id = response["agentRuntimeEndpointId"]
        print(f"  ⏳ Endpoint created: {endpoint_id}")
        print("  Waiting for endpoint to become ACTIVE...")
        
        # Wait for endpoint to be active
        def get_endpoint_status(eid):
            return agentcore_client.get_agent_runtime_endpoint(
                agentRuntimeId=runtime_id,
                agentRuntimeEndpointId=eid
            )["agentRuntimeEndpoint"]
        
        if wait_for_status(get_endpoint_status, endpoint_id):
            endpoint_url = agentcore_client.get_agent_runtime_endpoint(
                agentRuntimeId=runtime_id,
                agentRuntimeEndpointId=endpoint_id
            )["agentRuntimeEndpoint"].get("liveEndpointUrl", "")
            
            print(f"  ✅ Endpoint is ACTIVE: {endpoint_id}")
            print(f"  🔗 Endpoint URL: {endpoint_url}")
            
            put_ssm_parameter(
                f"/agentcore/{ENVIRONMENT}/agent-endpoint-id",
                endpoint_id,
                "AgentCore Agent Runtime Endpoint ID"
            )
            if endpoint_url:
                put_ssm_parameter(
                    f"/agentcore/{ENVIRONMENT}/agent-endpoint-url",
                    endpoint_url,
                    "AgentCore Agent Runtime Endpoint URL"
                )
            return endpoint_id
        else:
            print(f"  ❌ Endpoint failed to activate")
            return None
            
    except Exception as e:
        print(f"  ❌ Failed to create Endpoint: {e}")
        return None


def create_gateway(endpoint_id: str, runtime_id: str) -> Optional[str]:
    """Create AgentCore Gateway."""
    print("\n🚪 Creating Gateway...")
    
    # Name must match [a-zA-Z][a-zA-Z0-9_]{0,47} - no hyphens allowed
    gateway_name = f"agentcoreGateway{ENVIRONMENT.capitalize()}"
    
    # Check if gateway already exists
    try:
        response = agentcore_client.list_gateways()
        for gateway in response.get("gateways", []):
            if gateway.get("name") == gateway_name:
                gateway_id = gateway["gatewayId"]
                print(f"  ✅ Found existing Gateway: {gateway_id}")
                return gateway_id
    except Exception as e:
        print(f"  ⚠️  Error listing gateways: {e}")
    
    try:
        print(f"  Creating Gateway '{gateway_name}'...")
        
        response = agentcore_client.create_gateway(
            name=gateway_name,
            description=f"Gateway for AgentCore in {ENVIRONMENT}",
            protocolType="MCP",
        )
        
        gateway_id = response["gatewayId"]
        print(f"  ⏳ Gateway created: {gateway_id}")
        print("  Waiting for gateway to become ACTIVE...")
        
        # Wait for gateway to be active
        def get_gateway_status(gid):
            return agentcore_client.get_gateway(gatewayId=gid)["gateway"]
        
        if wait_for_status(get_gateway_status, gateway_id):
            print(f"  ✅ Gateway is ACTIVE: {gateway_id}")
            
            # Create gateway target
            print("  Creating Gateway Target...")
            try:
                target_response = agentcore_client.create_gateway_target(
                    gatewayIdentifier=gateway_id,
                    name=f"target{ENVIRONMENT.capitalize()}",
                    description=f"Target for {ENVIRONMENT} endpoint",
                    targetConfiguration={
                        "mcpTargetConfiguration": {
                            "openApiSchema": {},
                            "smithyModel": {},
                            "lambda": {
                                "lambdaArn": "",  # Optional
                            }
                        }
                    }
                )
                print(f"  ✅ Gateway Target created")
            except Exception as e:
                print(f"  ⚠️  Gateway Target creation skipped: {e}")
            
            put_ssm_parameter(
                f"/agentcore/{ENVIRONMENT}/gateway-id",
                gateway_id,
                "AgentCore Gateway ID"
            )
            return gateway_id
        else:
            print(f"  ❌ Gateway failed to activate")
            return None
            
    except Exception as e:
        print(f"  ❌ Failed to create Gateway: {e}")
        return None


def main():
    print("=" * 60)
    print("  AgentCore Full Deployment")
    print("=" * 60)
    print(f"  Environment: {ENVIRONMENT}")
    print(f"  AgentCore Region: {AGENTCORE_REGION}")
    print(f"  Infrastructure Region: {INFRA_REGION}")
    print(f"  Account ID: {ACCOUNT_ID}")
    print("=" * 60)
    
    # Get prerequisites from SSM
    # Use us-east-1 ECR URI since AgentCore only runs in us-east-1
    ecr_uri = get_ssm_parameter(f"/agentcore/{ENVIRONMENT}/ecr-repository-uri-useast1")
    if not ecr_uri:
        # Fallback: construct the us-east-1 URI from ap-northeast-1 URI
        ap_ecr_uri = get_ssm_parameter(f"/agentcore/{ENVIRONMENT}/ecr-repository-uri")
        if ap_ecr_uri:
            ecr_uri = ap_ecr_uri.replace("ap-northeast-1", "us-east-1")
    memory_store_id = get_ssm_parameter(f"/agentcore/{ENVIRONMENT}/memory-store-id")
    
    if not ecr_uri:
        print("\n❌ ECR Repository URI not found. Please deploy CDK stack first.")
        return False
    
    if not memory_store_id:
        print("\n❌ Memory Store ID not found. Please create Memory Store first.")
        return False
    
    print(f"\n📦 ECR Repository: {ecr_uri}")
    print(f"🧠 Memory Store ID: {memory_store_id}")
    
    # Step 1: Create Agent Runtime
    runtime_id = create_agent_runtime(ecr_uri, memory_store_id)
    if not runtime_id:
        print("\n❌ Deployment failed at Agent Runtime creation")
        return False
    
    # Step 2: Create Agent Runtime Endpoint
    endpoint_id = create_agent_runtime_endpoint(runtime_id)
    if not endpoint_id:
        print("\n❌ Deployment failed at Endpoint creation")
        return False
    
    # Step 3: Create Gateway (optional)
    gateway_id = create_gateway(endpoint_id, runtime_id)
    # Gateway is optional, don't fail if it doesn't work
    
    print("\n" + "=" * 60)
    print("  ✅ AgentCore Deployment Complete!")
    print("=" * 60)
    print(f"  Agent Runtime ID: {runtime_id}")
    print(f"  Endpoint ID: {endpoint_id}")
    if gateway_id:
        print(f"  Gateway ID: {gateway_id}")
    print("=" * 60)
    
    return True


if __name__ == "__main__":
    success = main()
    exit(0 if success else 1)

