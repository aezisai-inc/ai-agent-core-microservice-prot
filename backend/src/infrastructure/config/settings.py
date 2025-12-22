"""Application settings."""

from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    """Application settings loaded from environment variables.
    
    All sensitive IDs should be set via environment variables or SSM parameters.
    See DEPLOYMENT_REPORT.md for SSM parameter paths.
    """

    # AWS
    aws_region: str = "ap-northeast-1"
    environment: str = "development"

    # DynamoDB (環境に応じてテーブル名が変わる)
    event_store_table: str = "agentic-rag-events-development"
    read_model_table: str = "agentic-rag-read-models-development"

    # Bedrock Knowledge Base (S3 Vectors)
    # SSM: /agentcore/${environment}/knowledge-base-id
    knowledge_base_id: str = ""
    # SSM: /agentcore/${environment}/data-source-id
    data_source_id: str = ""
    default_model_id: str = "us.amazon.nova-pro-v1:0"

    # AgentCore
    # SSM: /agentcore/${environment}/agent-endpoint-id
    agent_runtime_name: str = ""
    agent_endpoint_id: str = ""
    # SSM: /agentcore/${environment}/memory-store-id
    memory_store_id: str = ""

    # Cognito
    cognito_user_pool_id: str = ""
    cognito_client_id: str = ""

    # Logging
    log_level: str = "INFO"

    class Config:
        env_prefix = "APP_"
        env_file = ".env"
