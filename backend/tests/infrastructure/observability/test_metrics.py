"""
Tests for Metrics Service.

AgentCore Memory関連のメトリクス収集機能のテスト。
"""

from datetime import datetime
from unittest.mock import MagicMock, patch

import pytest

from src.infrastructure.observability.metrics import (
    AgentMetrics,
    EpisodeMetrics,
    MetricsService,
    ReflectionMetrics,
    SessionMetrics,
)


class TestAgentMetrics:
    """AgentMetrics dataclass tests."""

    def test_create_agent_metrics(self) -> None:
        """AgentMetricsを作成できること."""
        metrics = AgentMetrics(
            tenant_id="tenant-1",
            agent_id="agent-1",
            session_id="session-1",
            invocation_count=10,
            success_count=8,
            error_count=2,
            total_latency_ms=1500.0,
            llm_latency_ms=1000.0,
            input_tokens=500,
            output_tokens=300,
        )

        assert metrics.tenant_id == "tenant-1"
        assert metrics.agent_id == "agent-1"
        assert metrics.session_id == "session-1"
        assert metrics.invocation_count == 10
        assert metrics.success_count == 8
        assert metrics.error_count == 2
        assert metrics.total_latency_ms == 1500.0
        assert isinstance(metrics.timestamp, datetime)

    def test_default_values(self) -> None:
        """デフォルト値が設定されること."""
        metrics = AgentMetrics(
            tenant_id="tenant-1",
            agent_id="agent-1",
            session_id="session-1",
        )

        assert metrics.invocation_count == 0
        assert metrics.success_count == 0
        assert metrics.error_count == 0
        assert metrics.total_latency_ms == 0.0
        assert metrics.total_tokens == 0


class TestEpisodeMetrics:
    """EpisodeMetrics dataclass tests."""

    def test_create_episode_metrics(self) -> None:
        """EpisodeMetricsを作成できること."""
        metrics = EpisodeMetrics(
            tenant_id="tenant-1",
            agent_id="agent-1",
            interaction_count=100,
            episode_detected_count=85,
            queries_with_context=70,
            queries_total=100,
        )

        assert metrics.tenant_id == "tenant-1"
        assert metrics.interaction_count == 100
        assert metrics.episode_detected_count == 85

    def test_calculate_rates(self) -> None:
        """レートを正しく計算できること."""
        metrics = EpisodeMetrics(
            tenant_id="tenant-1",
            agent_id="agent-1",
            interaction_count=100,
            episode_detected_count=85,
            queries_with_context=70,
            queries_total=100,
        )

        metrics.calculate_rates()

        assert metrics.detection_rate == 0.85
        assert metrics.context_utilization_rate == 0.70

    def test_calculate_rates_with_zero_values(self) -> None:
        """ゼロ値でもエラーが発生しないこと."""
        metrics = EpisodeMetrics(
            tenant_id="tenant-1",
            agent_id="agent-1",
            interaction_count=0,
            queries_total=0,
        )

        metrics.calculate_rates()

        assert metrics.detection_rate == 0.0
        assert metrics.context_utilization_rate == 0.0


class TestReflectionMetrics:
    """ReflectionMetrics dataclass tests."""

    def test_create_reflection_metrics(self) -> None:
        """ReflectionMetricsを作成できること."""
        metrics = ReflectionMetrics(
            tenant_id="tenant-1",
            agent_id="agent-1",
            reflections_generated=15,
            reflections_applied=12,
            success_patterns_applied=10,
            failure_patterns_avoided=5,
        )

        assert metrics.reflections_generated == 15
        assert metrics.reflections_applied == 12
        assert metrics.success_patterns_applied == 10

    def test_calculate_improvement(self) -> None:
        """品質改善率を正しく計算できること."""
        metrics = ReflectionMetrics(
            tenant_id="tenant-1",
            agent_id="agent-1",
            baseline_quality_score=0.70,
            current_quality_score=0.85,
        )

        metrics.calculate_improvement()

        # (0.85 - 0.70) / 0.70 = 0.2142...
        assert 0.21 < metrics.quality_improvement_rate < 0.22

    def test_calculate_improvement_with_zero_baseline(self) -> None:
        """ベースラインがゼロでもエラーが発生しないこと."""
        metrics = ReflectionMetrics(
            tenant_id="tenant-1",
            agent_id="agent-1",
            baseline_quality_score=0.0,
            current_quality_score=0.85,
        )

        metrics.calculate_improvement()

        assert metrics.quality_improvement_rate == 0.0


class TestSessionMetrics:
    """SessionMetrics dataclass tests."""

    def test_create_session_metrics(self) -> None:
        """SessionMetricsを作成できること."""
        metrics = SessionMetrics(
            tenant_id="tenant-1",
            active_sessions=50,
            total_sessions_created=200,
            sessions_expired=150,
            total_messages=5000,
            avg_messages_per_session=25.0,
        )

        assert metrics.active_sessions == 50
        assert metrics.total_sessions_created == 200
        assert metrics.total_messages == 5000


class TestMetricsService:
    """MetricsService tests."""

    @pytest.fixture
    def mock_powertools_metrics(self) -> MagicMock:
        """PowertoolsのMetricsをモック."""
        with patch(
            "src.infrastructure.observability.metrics.Metrics"
        ) as mock_metrics_class:
            mock_instance = MagicMock()
            mock_metrics_class.return_value = mock_instance
            yield mock_instance

    def test_create_metrics_service(
        self, mock_powertools_metrics: MagicMock
    ) -> None:
        """MetricsServiceを作成できること."""
        service = MetricsService(
            namespace="TestNamespace",
            service="TestService",
        )

        assert service._namespace == "TestNamespace"
        assert service._service == "TestService"

    def test_record_agent_invocation_success(
        self, mock_powertools_metrics: MagicMock
    ) -> None:
        """エージェント呼び出し成功をメトリクス記録できること."""
        service = MetricsService()
        
        metrics = AgentMetrics(
            tenant_id="tenant-1",
            agent_id="agent-1",
            session_id="session-1",
            total_latency_ms=1500.0,
            llm_latency_ms=1000.0,
            memory_latency_ms=200.0,
            input_tokens=500,
            output_tokens=300,
            total_tokens=800,
        )

        service.record_agent_invocation(metrics, success=True)

        # add_dimensionが呼ばれたことを確認
        mock_powertools_metrics.add_dimension.assert_called()
        # add_metricが複数回呼ばれたことを確認
        assert mock_powertools_metrics.add_metric.call_count >= 1

    def test_record_agent_invocation_error(
        self, mock_powertools_metrics: MagicMock
    ) -> None:
        """エージェント呼び出しエラーをメトリクス記録できること."""
        service = MetricsService()
        
        metrics = AgentMetrics(
            tenant_id="tenant-1",
            agent_id="agent-1",
            session_id="session-1",
        )

        service.record_agent_invocation(metrics, success=False)

        mock_powertools_metrics.add_metric.assert_called()

    def test_record_episode_detection(
        self, mock_powertools_metrics: MagicMock
    ) -> None:
        """エピソード検出メトリクスを記録できること."""
        service = MetricsService()
        
        metrics = EpisodeMetrics(
            tenant_id="tenant-1",
            agent_id="agent-1",
            interaction_count=100,
            episode_detected_count=85,
            queries_with_context=70,
            queries_total=100,
            avg_similarity_score=0.85,
        )

        service.record_episode_detection(metrics)

        mock_powertools_metrics.add_dimension.assert_called()
        # EpisodeDetectionRateなどのメトリクスが記録されることを確認
        assert mock_powertools_metrics.add_metric.call_count >= 4

    def test_record_reflection_generation(
        self, mock_powertools_metrics: MagicMock
    ) -> None:
        """Reflection生成メトリクスを記録できること."""
        service = MetricsService()
        
        metrics = ReflectionMetrics(
            tenant_id="tenant-1",
            agent_id="agent-1",
            reflections_generated=15,
            reflections_applied=12,
            success_patterns_applied=10,
            failure_patterns_avoided=5,
            baseline_quality_score=0.70,
            current_quality_score=0.85,
            unique_error_types=10,
            repeated_errors=3,
        )

        service.record_reflection_generation(metrics)

        mock_powertools_metrics.add_metric.assert_called()

    def test_record_session_activity(
        self, mock_powertools_metrics: MagicMock
    ) -> None:
        """セッションアクティビティメトリクスを記録できること."""
        service = MetricsService()
        
        metrics = SessionMetrics(
            tenant_id="tenant-1",
            active_sessions=50,
            total_sessions_created=200,
            sessions_expired=150,
            total_messages=5000,
            avg_session_duration_minutes=30.0,
        )

        service.record_session_activity(metrics)

        mock_powertools_metrics.add_metric.assert_called()

    def test_record_knowledge_search(
        self, mock_powertools_metrics: MagicMock
    ) -> None:
        """Knowledge Base検索メトリクスを記録できること."""
        service = MetricsService()

        service.record_knowledge_search(
            tenant_id="tenant-1",
            query_latency_ms=150.0,
            results_count=5,
            cache_hit=True,
        )

        mock_powertools_metrics.add_dimension.assert_called()
        assert mock_powertools_metrics.add_metric.call_count >= 3

    def test_record_knowledge_search_without_cache_hit(
        self, mock_powertools_metrics: MagicMock
    ) -> None:
        """キャッシュミスのKnowledge Base検索メトリクスを記録できること."""
        service = MetricsService()

        service.record_knowledge_search(
            tenant_id="tenant-1",
            query_latency_ms=250.0,
            results_count=3,
            cache_hit=False,
        )

        # cache_hitがFalseの場合、KnowledgeCacheHitは記録されない
        calls = mock_powertools_metrics.add_metric.call_args_list
        metric_names = [call.kwargs.get("name") for call in calls]
        assert "KnowledgeCacheHit" not in metric_names

    def test_flush_metrics(
        self, mock_powertools_metrics: MagicMock
    ) -> None:
        """メトリクスをフラッシュできること."""
        mock_powertools_metrics.serialize_metric_set.return_value = {
            "metrics": []
        }
        
        service = MetricsService()
        result = service.flush()

        mock_powertools_metrics.serialize_metric_set.assert_called_once()
        assert "metrics" in result

    def test_metrics_property(
        self, mock_powertools_metrics: MagicMock
    ) -> None:
        """metricsプロパティでインスタンスを取得できること."""
        service = MetricsService()
        
        assert service.metrics == mock_powertools_metrics
