"""Application settings."""

from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""

    # AWS
    aws_region: str = "ap-northeast-1"

    # DynamoDB
    event_store_table: str = "agentic-rag-events"
    read_model_table: str = "agentic-rag-read-models"

    # Bedrock
    knowledge_base_id: str = ""
    default_model_id: str = "anthropic.claude-3-sonnet-20240229-v1:0"

    # AgentCore
    agent_id: str = ""
    agent_alias_id: str = ""

    # Cognito
    cognito_user_pool_id: str = ""
    cognito_client_id: str = ""

    # Logging
    log_level: str = "INFO"

    class Config:
        env_prefix = "APP_"
        env_file = ".env"
