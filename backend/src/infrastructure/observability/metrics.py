"""
AgentCore Memory Metrics Service.

エピソード記憶、Reflections、セッション管理に関する
メトリクスの収集とCloudWatchへの送信を担当。

KPI対応:
- エピソード検出率 (>80%)
- 類似エピソード活用率 (>60%)
- Reflection生成数 (>10/週)
- 応答品質向上 (+15%)
- 同一エラー再発率 (-30%)
"""

from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum
from typing import Any

from aws_lambda_powertools import Metrics
from aws_lambda_powertools.metrics import MetricUnit


class MetricNamespace(str, Enum):
    """CloudWatch Metric Namespaces."""
    
    AGENT = "AgentCore/Agent"
    MEMORY = "AgentCore/Memory"
    EPISODE = "AgentCore/Episode"
    REFLECTION = "AgentCore/Reflection"
    SESSION = "AgentCore/Session"
    KNOWLEDGE = "AgentCore/Knowledge"


@dataclass
class AgentMetrics:
    """エージェント実行メトリクス."""
    
    tenant_id: str
    agent_id: str
    session_id: str
    
    # 実行統計
    invocation_count: int = 0
    success_count: int = 0
    error_count: int = 0
    
    # レイテンシ
    total_latency_ms: float = 0.0
    llm_latency_ms: float = 0.0
    tool_latency_ms: float = 0.0
    memory_latency_ms: float = 0.0
    
    # トークン使用量
    input_tokens: int = 0
    output_tokens: int = 0
    total_tokens: int = 0
    
    # ツール実行
    tool_invocations: int = 0
    tool_successes: int = 0
    tool_failures: int = 0
    
    timestamp: datetime = field(default_factory=datetime.utcnow)


@dataclass
class EpisodeMetrics:
    """エピソード記憶メトリクス."""
    
    tenant_id: str
    agent_id: str
    
    # エピソード検出 (KPI: >80%)
    interaction_count: int = 0
    episode_detected_count: int = 0
    detection_rate: float = 0.0
    
    # 類似エピソード活用 (KPI: >60%)
    queries_with_context: int = 0
    queries_total: int = 0
    context_utilization_rate: float = 0.0
    
    # エピソード品質
    avg_similarity_score: float = 0.0
    avg_episodes_per_query: float = 0.0
    
    # ストレージ
    total_episodes_stored: int = 0
    episodes_retrieved: int = 0
    
    timestamp: datetime = field(default_factory=datetime.utcnow)
    
    def calculate_rates(self) -> None:
        """レートを計算."""
        if self.interaction_count > 0:
            self.detection_rate = self.episode_detected_count / self.interaction_count
        if self.queries_total > 0:
            self.context_utilization_rate = self.queries_with_context / self.queries_total


@dataclass
class ReflectionMetrics:
    """Reflectionsメトリクス."""
    
    tenant_id: str
    agent_id: str
    
    # Reflection生成 (KPI: >10/週)
    reflections_generated: int = 0
    reflections_applied: int = 0
    
    # パターン適用
    success_patterns_applied: int = 0
    failure_patterns_avoided: int = 0
    
    # 品質向上 (KPI: +15%)
    baseline_quality_score: float = 0.0
    current_quality_score: float = 0.0
    quality_improvement_rate: float = 0.0
    
    # エラー再発 (KPI: -30%)
    unique_error_types: int = 0
    repeated_errors: int = 0
    error_repeat_rate: float = 0.0
    
    timestamp: datetime = field(default_factory=datetime.utcnow)
    
    def calculate_improvement(self) -> None:
        """改善率を計算."""
        if self.baseline_quality_score > 0:
            self.quality_improvement_rate = (
                (self.current_quality_score - self.baseline_quality_score)
                / self.baseline_quality_score
            )


@dataclass
class SessionMetrics:
    """セッション管理メトリクス."""
    
    tenant_id: str
    
    # アクティブセッション
    active_sessions: int = 0
    total_sessions_created: int = 0
    sessions_expired: int = 0
    
    # メッセージ統計
    total_messages: int = 0
    avg_messages_per_session: float = 0.0
    
    # セッション時間
    avg_session_duration_minutes: float = 0.0
    max_session_duration_minutes: float = 0.0
    
    timestamp: datetime = field(default_factory=datetime.utcnow)


class MetricsService:
    """
    CloudWatch Metricsサービス.
    
    AWS Lambda Powertoolsを使用してメトリクスを収集・送信。
    """
    
    def __init__(
        self,
        namespace: str = "AgentCore",
        service: str = "AgentCoreRuntime",
    ):
        """
        メトリクスサービスを初期化.
        
        Args:
            namespace: CloudWatch名前空間
            service: サービス名
        """
        self._metrics = Metrics(namespace=namespace, service=service)
        self._namespace = namespace
        self._service = service
    
    def record_agent_invocation(
        self,
        metrics: AgentMetrics,
        *,
        success: bool = True,
    ) -> None:
        """
        エージェント呼び出しメトリクスを記録.
        
        Args:
            metrics: エージェントメトリクス
            success: 成功フラグ
        """
        dimensions = {
            "TenantId": metrics.tenant_id,
            "AgentId": metrics.agent_id,
        }
        
        self._metrics.add_dimension(**dimensions)
        
        # 呼び出し回数
        self._metrics.add_metric(
            name="InvocationCount",
            unit=MetricUnit.Count,
            value=1,
        )
        
        if success:
            self._metrics.add_metric(
                name="SuccessCount",
                unit=MetricUnit.Count,
                value=1,
            )
        else:
            self._metrics.add_metric(
                name="ErrorCount",
                unit=MetricUnit.Count,
                value=1,
            )
        
        # レイテンシ
        if metrics.total_latency_ms > 0:
            self._metrics.add_metric(
                name="TotalLatency",
                unit=MetricUnit.Milliseconds,
                value=metrics.total_latency_ms,
            )
        
        if metrics.llm_latency_ms > 0:
            self._metrics.add_metric(
                name="LLMLatency",
                unit=MetricUnit.Milliseconds,
                value=metrics.llm_latency_ms,
            )
        
        if metrics.memory_latency_ms > 0:
            self._metrics.add_metric(
                name="MemoryLatency",
                unit=MetricUnit.Milliseconds,
                value=metrics.memory_latency_ms,
            )
        
        # トークン
        if metrics.total_tokens > 0:
            self._metrics.add_metric(
                name="InputTokens",
                unit=MetricUnit.Count,
                value=metrics.input_tokens,
            )
            self._metrics.add_metric(
                name="OutputTokens",
                unit=MetricUnit.Count,
                value=metrics.output_tokens,
            )
            self._metrics.add_metric(
                name="TotalTokens",
                unit=MetricUnit.Count,
                value=metrics.total_tokens,
            )
    
    def record_episode_detection(
        self,
        metrics: EpisodeMetrics,
    ) -> None:
        """
        エピソード検出メトリクスを記録.
        
        KPI: エピソード検出率 >80%
        
        Args:
            metrics: エピソードメトリクス
        """
        metrics.calculate_rates()
        
        dimensions = {
            "TenantId": metrics.tenant_id,
            "AgentId": metrics.agent_id,
        }
        
        self._metrics.add_dimension(**dimensions)
        
        # エピソード検出
        self._metrics.add_metric(
            name="InteractionCount",
            unit=MetricUnit.Count,
            value=metrics.interaction_count,
        )
        self._metrics.add_metric(
            name="EpisodeDetectedCount",
            unit=MetricUnit.Count,
            value=metrics.episode_detected_count,
        )
        self._metrics.add_metric(
            name="EpisodeDetectionRate",
            unit=MetricUnit.Percent,
            value=metrics.detection_rate * 100,
        )
        
        # 類似エピソード活用
        self._metrics.add_metric(
            name="ContextUtilizationRate",
            unit=MetricUnit.Percent,
            value=metrics.context_utilization_rate * 100,
        )
        
        # 品質指標
        if metrics.avg_similarity_score > 0:
            self._metrics.add_metric(
                name="AvgSimilarityScore",
                unit=MetricUnit.NoUnit,
                value=metrics.avg_similarity_score,
            )
    
    def record_reflection_generation(
        self,
        metrics: ReflectionMetrics,
    ) -> None:
        """
        Reflection生成メトリクスを記録.
        
        KPI: Reflection生成数 >10/週
        
        Args:
            metrics: Reflectionメトリクス
        """
        metrics.calculate_improvement()
        
        dimensions = {
            "TenantId": metrics.tenant_id,
            "AgentId": metrics.agent_id,
        }
        
        self._metrics.add_dimension(**dimensions)
        
        # Reflection生成
        self._metrics.add_metric(
            name="ReflectionsGenerated",
            unit=MetricUnit.Count,
            value=metrics.reflections_generated,
        )
        self._metrics.add_metric(
            name="ReflectionsApplied",
            unit=MetricUnit.Count,
            value=metrics.reflections_applied,
        )
        
        # パターン適用
        self._metrics.add_metric(
            name="SuccessPatternsApplied",
            unit=MetricUnit.Count,
            value=metrics.success_patterns_applied,
        )
        self._metrics.add_metric(
            name="FailurePatternsAvoided",
            unit=MetricUnit.Count,
            value=metrics.failure_patterns_avoided,
        )
        
        # 品質向上
        self._metrics.add_metric(
            name="QualityImprovementRate",
            unit=MetricUnit.Percent,
            value=metrics.quality_improvement_rate * 100,
        )
        
        # エラー再発率
        if metrics.unique_error_types > 0:
            error_rate = metrics.repeated_errors / metrics.unique_error_types
            self._metrics.add_metric(
                name="ErrorRepeatRate",
                unit=MetricUnit.Percent,
                value=error_rate * 100,
            )
    
    def record_session_activity(
        self,
        metrics: SessionMetrics,
    ) -> None:
        """
        セッションアクティビティメトリクスを記録.
        
        Args:
            metrics: セッションメトリクス
        """
        dimensions = {
            "TenantId": metrics.tenant_id,
        }
        
        self._metrics.add_dimension(**dimensions)
        
        self._metrics.add_metric(
            name="ActiveSessions",
            unit=MetricUnit.Count,
            value=metrics.active_sessions,
        )
        self._metrics.add_metric(
            name="TotalSessionsCreated",
            unit=MetricUnit.Count,
            value=metrics.total_sessions_created,
        )
        self._metrics.add_metric(
            name="SessionsExpired",
            unit=MetricUnit.Count,
            value=metrics.sessions_expired,
        )
        self._metrics.add_metric(
            name="TotalMessages",
            unit=MetricUnit.Count,
            value=metrics.total_messages,
        )
        
        if metrics.avg_session_duration_minutes > 0:
            self._metrics.add_metric(
                name="AvgSessionDuration",
                unit=MetricUnit.Seconds,
                value=metrics.avg_session_duration_minutes * 60,
            )
    
    def record_knowledge_search(
        self,
        tenant_id: str,
        query_latency_ms: float,
        results_count: int,
        *,
        cache_hit: bool = False,
    ) -> None:
        """
        Knowledge Base検索メトリクスを記録.
        
        Args:
            tenant_id: テナントID
            query_latency_ms: クエリレイテンシ
            results_count: 結果数
            cache_hit: キャッシュヒットフラグ
        """
        self._metrics.add_dimension(TenantId=tenant_id)
        
        self._metrics.add_metric(
            name="KnowledgeQueryCount",
            unit=MetricUnit.Count,
            value=1,
        )
        self._metrics.add_metric(
            name="KnowledgeQueryLatency",
            unit=MetricUnit.Milliseconds,
            value=query_latency_ms,
        )
        self._metrics.add_metric(
            name="KnowledgeResultsCount",
            unit=MetricUnit.Count,
            value=results_count,
        )
        
        if cache_hit:
            self._metrics.add_metric(
                name="KnowledgeCacheHit",
                unit=MetricUnit.Count,
                value=1,
            )
    
    def flush(self) -> dict[str, Any]:
        """
        蓄積されたメトリクスをCloudWatchに送信.
        
        Returns:
            送信されたメトリクスの詳細
        """
        return self._metrics.serialize_metric_set()
    
    @property
    def metrics(self) -> Metrics:
        """Lambda Powertoolsメトリクスインスタンスを取得."""
        return self._metrics
