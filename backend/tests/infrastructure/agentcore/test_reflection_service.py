"""Tests for Reflection Service."""

import pytest
from unittest.mock import AsyncMock, MagicMock

from src.infrastructure.agentcore.memory_config import MemoryConfig
from src.infrastructure.agentcore.memory_client import (
    AgentCoreMemoryClient,
    MemoryRecord,
)
from src.infrastructure.agentcore.reflection_service import (
    Reflection,
    ReflectionService,
)


@pytest.fixture
def memory_config() -> MemoryConfig:
    """Create a test memory configuration."""
    return MemoryConfig(
        memory_store_id="test-memory-store",
        region="us-east-1",
        max_reflections_per_query=2,
        reflection_context_max_chars=1000,
        enable_tenant_isolation=True,
    )


@pytest.fixture
def mock_memory_client(memory_config: MemoryConfig) -> MagicMock:
    """Create a mock memory client."""
    client = MagicMock(spec=AgentCoreMemoryClient)
    client._config = memory_config
    return client


@pytest.fixture
def reflection_service(
    mock_memory_client: MagicMock,
    memory_config: MemoryConfig,
) -> ReflectionService:
    """Create a reflection service with mocked client."""
    return ReflectionService(
        memory_client=mock_memory_client,
        config=memory_config,
    )


class TestReflectionService:
    """Tests for ReflectionService."""

    async def test_retrieve_relevant_reflections(
        self,
        reflection_service: ReflectionService,
        mock_memory_client: MagicMock,
    ) -> None:
        """Test retrieving relevant reflections."""
        mock_records = [
            MemoryRecord(
                id="ref-1",
                namespace="/reflections/user-456",
                content={
                    "use_case": "Password reset support",
                    "insight": "Clear step-by-step instructions improve success rate",
                    "success_patterns": [
                        "Provide numbered steps",
                        "Include screenshots when possible",
                    ],
                    "failure_patterns": [
                        "Too much technical jargon",
                    ],
                    "best_practices": [
                        "Verify user identity first",
                        "Offer alternative contact methods",
                    ],
                    "episode_count": 15,
                },
                score=0.92,
                timestamp="2024-01-01T00:00:00Z",
            ),
        ]
        mock_memory_client.retrieve_memories = AsyncMock(return_value=mock_records)

        reflections = await reflection_service.retrieve_relevant_reflections(
            user_id="user-456",
            use_case="How to help with password reset",
            tenant_id="tenant-789",
        )

        assert len(reflections) == 1
        assert reflections[0].id == "ref-1"
        assert reflections[0].use_case == "Password reset support"
        assert "step-by-step" in reflections[0].insight
        assert len(reflections[0].success_patterns) == 2
        assert reflections[0].episode_count == 15

    async def test_retrieve_reflections_with_tenant_isolation(
        self,
        reflection_service: ReflectionService,
        mock_memory_client: MagicMock,
    ) -> None:
        """Test that tenant isolation is applied to namespace."""
        mock_memory_client.retrieve_memories = AsyncMock(return_value=[])

        await reflection_service.retrieve_relevant_reflections(
            user_id="user-456",
            use_case="test query",
            tenant_id="tenant-789",
        )

        call_args = mock_memory_client.retrieve_memories.call_args
        namespace = call_args.kwargs["namespace"]

        assert "/tenant/tenant-789" in namespace
        assert "/reflections/user-456" in namespace

    def test_build_reflection_prompt(
        self,
        reflection_service: ReflectionService,
    ) -> None:
        """Test building prompt from reflections."""
        reflections = [
            Reflection(
                id="ref-1",
                use_case="Password reset support",
                insight="Clear instructions improve success",
                success_patterns=["Numbered steps", "Visual aids"],
                failure_patterns=["Technical jargon"],
                best_practices=["Verify identity first"],
                episode_count=10,
            ),
        ]

        prompt = reflection_service.build_reflection_prompt(reflections)

        assert "## Insights from Past Experience:" in prompt
        assert "Password reset support" in prompt
        assert "Clear instructions improve success" in prompt
        assert "What works well:" in prompt
        assert "Numbered steps" in prompt
        assert "What to avoid:" in prompt
        assert "Technical jargon" in prompt
        assert "Best practices:" in prompt
        assert "Verify identity first" in prompt

    def test_build_reflection_prompt_empty(
        self,
        reflection_service: ReflectionService,
    ) -> None:
        """Test building prompt with no reflections returns empty string."""
        prompt = reflection_service.build_reflection_prompt([])
        assert prompt == ""

    def test_build_reflection_prompt_truncation(
        self,
        reflection_service: ReflectionService,
    ) -> None:
        """Test that prompt is truncated when too long."""
        reflections = [
            Reflection(
                id="ref-1",
                use_case="Test",
                insight="A" * 2000,  # Very long insight
                success_patterns=["B" * 500],
                failure_patterns=[],
                best_practices=[],
            ),
        ]

        prompt = reflection_service.build_reflection_prompt(
            reflections,
            max_chars=500,
        )

        assert len(prompt) <= 500
        assert prompt.endswith("...")

    def test_apply_patterns_to_decision_low_risk(
        self,
        reflection_service: ReflectionService,
    ) -> None:
        """Test pattern analysis for low-risk action."""
        reflections = [
            Reflection(
                id="ref-1",
                use_case="Customer support",
                insight="Test",
                success_patterns=[
                    "Start with greeting",
                    "Ask clarifying questions",
                ],
                failure_patterns=[
                    "Skip verification",
                ],
                best_practices=[
                    "Be polite and patient",
                ],
            ),
        ]

        result = reflection_service.apply_patterns_to_decision(
            reflections=reflections,
            proposed_action="I will start with a greeting and ask questions",
        )

        assert result["risk_level"] == "low"
        assert len(result["matching_success_patterns"]) > 0

    def test_apply_patterns_to_decision_high_risk(
        self,
        reflection_service: ReflectionService,
    ) -> None:
        """Test pattern analysis for high-risk action."""
        reflections = [
            Reflection(
                id="ref-1",
                use_case="Customer support",
                insight="Test",
                success_patterns=[],
                failure_patterns=[
                    "Skip user verification",
                    "Provide generic responses",
                ],
                best_practices=[],
            ),
        ]

        result = reflection_service.apply_patterns_to_decision(
            reflections=reflections,
            proposed_action="I will skip verification and give a generic answer",
        )

        assert result["risk_level"] == "high"
        assert len(result["matching_failure_patterns"]) > 0


class TestReflectionDataclass:
    """Tests for Reflection dataclass."""

    def test_reflection_creation(self) -> None:
        """Test creating a Reflection."""
        reflection = Reflection(
            id="ref-123",
            use_case="Test use case",
            insight="Test insight",
            success_patterns=["pattern1"],
            failure_patterns=["pattern2"],
            best_practices=["practice1"],
            episode_count=5,
            timestamp="2024-01-01T00:00:00Z",
        )

        assert reflection.id == "ref-123"
        assert reflection.use_case == "Test use case"
        assert reflection.episode_count == 5

    def test_reflection_default_values(self) -> None:
        """Test Reflection default values."""
        reflection = Reflection(
            id="ref-123",
            use_case="Test",
            insight="Test",
        )

        assert reflection.success_patterns == []
        assert reflection.failure_patterns == []
        assert reflection.best_practices == []
        assert reflection.episode_count == 0
        assert reflection.timestamp == ""
        assert reflection.raw_data == {}
