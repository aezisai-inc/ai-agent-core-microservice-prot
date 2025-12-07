"""Tests for Knowledge Tool."""

import json
import pytest
from unittest.mock import AsyncMock, MagicMock

from src.presentation.tools.knowledge_tool import (
    create_knowledge_tool,
    search_knowledge_base,
)


@pytest.fixture
def mock_vector_client() -> MagicMock:
    """Create mock vector search client."""
    client = MagicMock()
    client.search = AsyncMock(return_value=[
        {
            "content": "To return a product, go to My Orders...",
            "source": "returns-faq.md",
            "score": 0.95,
        },
        {
            "content": "Return policy: 30 days from purchase...",
            "source": "return-policy.md",
            "score": 0.87,
        },
    ])
    return client


class TestCreateKnowledgeTool:
    """Tests for create_knowledge_tool factory."""

    async def test_create_tool_returns_function(
        self,
        mock_vector_client: MagicMock,
    ) -> None:
        """Test that create_knowledge_tool returns a callable."""
        tool = create_knowledge_tool(mock_vector_client)
        
        assert callable(tool)

    async def test_tool_returns_json(
        self,
        mock_vector_client: MagicMock,
    ) -> None:
        """Test that tool returns valid JSON."""
        tool = create_knowledge_tool(mock_vector_client)
        result = await tool("How to return a product?")
        
        parsed = json.loads(result)
        assert "chunks" in parsed
        assert "total" in parsed
        assert "query" in parsed

    async def test_tool_uses_vector_client(
        self,
        mock_vector_client: MagicMock,
    ) -> None:
        """Test that tool calls vector client with correct params."""
        tool = create_knowledge_tool(
            mock_vector_client,
            tenant_id="tenant-123",
            max_results=3,
        )
        await tool("test query")
        
        mock_vector_client.search.assert_called_once_with(
            query="test query",
            tenant_id="tenant-123",
            top_k=3,
        )

    async def test_tool_formats_results(
        self,
        mock_vector_client: MagicMock,
    ) -> None:
        """Test that tool formats search results correctly."""
        tool = create_knowledge_tool(mock_vector_client)
        result = await tool("test query")
        
        parsed = json.loads(result)
        assert len(parsed["chunks"]) == 2
        
        first_chunk = parsed["chunks"][0]
        assert "content" in first_chunk
        assert "source" in first_chunk
        assert "score" in first_chunk

    async def test_tool_handles_empty_results(
        self,
        mock_vector_client: MagicMock,
    ) -> None:
        """Test that tool handles empty search results."""
        mock_vector_client.search = AsyncMock(return_value=[])
        
        tool = create_knowledge_tool(mock_vector_client)
        result = await tool("unknown query")
        
        parsed = json.loads(result)
        assert parsed["chunks"] == []
        assert parsed["total"] == 0

    async def test_tool_handles_errors(
        self,
        mock_vector_client: MagicMock,
    ) -> None:
        """Test that tool handles search errors gracefully."""
        mock_vector_client.search = AsyncMock(
            side_effect=Exception("Connection error")
        )
        
        tool = create_knowledge_tool(mock_vector_client)
        result = await tool("test query")
        
        parsed = json.loads(result)
        assert "error" in parsed
        assert parsed["chunks"] == []
        assert parsed["total"] == 0


class TestSearchKnowledgeBase:
    """Tests for search_knowledge_base standalone function."""

    async def test_returns_dict(
        self,
        mock_vector_client: MagicMock,
    ) -> None:
        """Test that function returns a dictionary."""
        result = await search_knowledge_base(
            query="test query",
            vector_client=mock_vector_client,
        )
        
        assert isinstance(result, dict)
        assert "chunks" in result
        assert "total" in result

    async def test_with_tenant_id(
        self,
        mock_vector_client: MagicMock,
    ) -> None:
        """Test function with tenant ID."""
        await search_knowledge_base(
            query="test",
            vector_client=mock_vector_client,
            tenant_id="tenant-123",
        )
        
        mock_vector_client.search.assert_called_once()
        call_args = mock_vector_client.search.call_args
        assert call_args.kwargs["tenant_id"] == "tenant-123"

    async def test_with_max_results(
        self,
        mock_vector_client: MagicMock,
    ) -> None:
        """Test function with custom max results."""
        await search_knowledge_base(
            query="test",
            vector_client=mock_vector_client,
            max_results=10,
        )
        
        call_args = mock_vector_client.search.call_args
        assert call_args.kwargs["top_k"] == 10

    async def test_handles_errors(
        self,
        mock_vector_client: MagicMock,
    ) -> None:
        """Test that function handles errors gracefully."""
        mock_vector_client.search = AsyncMock(
            side_effect=Exception("Service unavailable")
        )
        
        result = await search_knowledge_base(
            query="test",
            vector_client=mock_vector_client,
        )
        
        assert "error" in result
        assert result["chunks"] == []
