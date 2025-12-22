# AgentCore Runtime Container Image
# 
# This Dockerfile builds the container image for running the
# Strands Agent on Amazon Bedrock AgentCore Runtime.
#
# Usage:
#   docker build -t agentic-rag-agent .
#   docker run -p 8080:8080 agentic-rag-agent

# Use ECR Public Gallery to avoid Docker Hub rate limits
FROM public.ecr.aws/docker/library/python:3.11-slim

# Set working directory
WORKDIR /app

# Install system dependencies and uv
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    curl \
    && rm -rf /var/lib/apt/lists/* \
    && curl -LsSf https://astral.sh/uv/install.sh | sh

# Add uv to PATH
ENV PATH="/root/.local/bin:$PATH"

# Copy all project files (including README.md required by pyproject.toml)
COPY pyproject.toml uv.lock README.md ./
COPY src/ ./src/

# Install Python dependencies using uv (much faster than pip)
# --no-dev: skip dev dependencies
# --frozen: use lockfile without updating
RUN uv sync --no-dev --frozen

# Copy application code
COPY agent.py .

# Set Python path
ENV PYTHONPATH=/app
ENV PYTHONUNBUFFERED=1

# AgentCore Configuration
# These values are loaded from SSM Parameter Store at runtime.
# See: docs/deployment/ssm-parameters.md for parameter naming conventions.
# 
# Required SSM Parameters:
#   /agentcore/{env}/knowledge-base-id  - Bedrock Knowledge Base ID
#   /agentcore/{env}/rag-top-k          - Number of RAG results (default: 5)
#   /agentcore/{env}/rag-score-threshold - Minimum similarity score (default: 0.5)
#
# Environment variables below are defaults/fallbacks only:
ENV AWS_REGION=ap-northeast-1
ENV AGENTCORE_ENV=development

# Expose port for health checks (optional)
EXPOSE 8080

# AgentCore Runtime entrypoint
# Use uv run to execute with the correct virtual environment
CMD ["uv", "run", "python", "agent.py"]

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:8080/health || exit 1
