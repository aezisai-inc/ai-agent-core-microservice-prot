# AgentCore Runtime Container Image
# 
# This Dockerfile builds the container image for running the
# Strands Agent on Amazon Bedrock AgentCore Runtime.
#
# Usage:
#   docker build -t agentic-rag-agent .
#   docker run -p 8080:8080 agentic-rag-agent

FROM python:3.11-slim

# Set working directory
WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Copy dependency files first (for better layer caching)
COPY requirements.txt .
COPY pyproject.toml .

# Install Python dependencies
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY src/ ./src/
COPY agent.py .

# Set Python path
ENV PYTHONPATH=/app
ENV PYTHONUNBUFFERED=1

# Expose port for health checks (optional)
EXPOSE 8080

# AgentCore Runtime entrypoint
# The agentcore CLI will use this as the entry point
CMD ["python", "agent.py"]

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:8080/health || exit 1
