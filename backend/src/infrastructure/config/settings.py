"""Application settings."""

from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""

    # AWS
    aws_region: str = "ap-northeast-1"
    environment: str = "development"

    # DynamoDB
    event_store_table: str = "agentic-rag-events-development"
    read_model_table: str = "agentic-rag-read-models-development"

    # Bedrock Knowledge Base (S3 Vectors)
    knowledge_base_id: str = "KCOEXQD1NV"  # S3 Vectors backed Knowledge Base
    data_source_id: str = "R1BW5OB1WP"
    default_model_id: str = "us.amazon.nova-pro-v1:0"

    # AgentCore
    agent_runtime_name: str = "agentcoreRuntimeDevelopment"
    agent_endpoint_id: str = "agentcoreEndpointDevelopment"
    memory_store_id: str = "mem_01jensb3j9e3q1hpws0b0gd15r"

    # Cognito
    cognito_user_pool_id: str = ""
    cognito_client_id: str = ""

    # Logging
    log_level: str = "INFO"

    class Config:
        env_prefix = "APP_"
        env_file = ".env"
