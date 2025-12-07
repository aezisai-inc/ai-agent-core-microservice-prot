"""
Tests for Tracing Service.

AWS X-Ray分散トレーシング機能のテスト。
"""

from unittest.mock import MagicMock, patch

import pytest

from src.infrastructure.observability.tracer import TracingService


class TestTracingService:
    """TracingService tests."""

    @pytest.fixture
    def mock_powertools_tracer(self) -> MagicMock:
        """PowertoolsのTracerをモック."""
        with patch(
            "src.infrastructure.observability.tracer.Tracer"
        ) as mock_tracer_class:
            mock_instance = MagicMock()
            mock_tracer_class.return_value = mock_instance
            
            # providerとin_subsegmentのモック
            mock_provider = MagicMock()
            mock_instance.provider = mock_provider
            
            mock_subsegment = MagicMock()
            mock_provider.in_subsegment.return_value.__enter__ = MagicMock(
                return_value=mock_subsegment
            )
            mock_provider.in_subsegment.return_value.__exit__ = MagicMock(
                return_value=False
            )
            
            yield mock_instance

    def test_create_tracing_service(
        self, mock_powertools_tracer: MagicMock
    ) -> None:
        """TracingServiceを作成できること."""
        service = TracingService(service="TestService", auto_patch=False)

        assert service._service == "TestService"

    def test_trace_agent_invocation(
        self, mock_powertools_tracer: MagicMock
    ) -> None:
        """エージェント呼び出しをトレースできること."""
        service = TracingService()

        with service.trace_agent_invocation(
            tenant_id="tenant-1",
            agent_id="agent-1",
            session_id="session-1",
        ):
            pass

        mock_powertools_tracer.provider.in_subsegment.assert_called_with(
            "agent_invocation"
        )

    def test_trace_memory_operation(
        self, mock_powertools_tracer: MagicMock
    ) -> None:
        """メモリ操作をトレースできること."""
        service = TracingService()

        with service.trace_memory_operation(
            operation="read",
            memory_type="episodic",
            tenant_id="tenant-1",
        ):
            pass

        mock_powertools_tracer.provider.in_subsegment.assert_called_with(
            "memory_read"
        )

    def test_trace_tool_execution(
        self, mock_powertools_tracer: MagicMock
    ) -> None:
        """ツール実行をトレースできること."""
        service = TracingService()

        with service.trace_tool_execution(
            tool_name="search_knowledge_base",
            tenant_id="tenant-1",
        ):
            pass

        mock_powertools_tracer.provider.in_subsegment.assert_called_with(
            "tool_search_knowledge_base"
        )

    def test_trace_llm_call(
        self, mock_powertools_tracer: MagicMock
    ) -> None:
        """LLM呼び出しをトレースできること."""
        service = TracingService()

        with service.trace_llm_call(
            model_id="anthropic.claude-3-sonnet",
            tenant_id="tenant-1",
        ):
            pass

        mock_powertools_tracer.provider.in_subsegment.assert_called_with(
            "llm_call"
        )

    def test_trace_knowledge_search(
        self, mock_powertools_tracer: MagicMock
    ) -> None:
        """Knowledge Base検索をトレースできること."""
        service = TracingService()

        with service.trace_knowledge_search(
            knowledge_base_id="kb-123",
            tenant_id="tenant-1",
        ):
            pass

        mock_powertools_tracer.provider.in_subsegment.assert_called_with(
            "knowledge_search"
        )

    def test_add_metadata(
        self, mock_powertools_tracer: MagicMock
    ) -> None:
        """メタデータを追加できること."""
        service = TracingService()

        service.add_metadata("key", {"nested": "value"})

        mock_powertools_tracer.put_metadata.assert_called_once_with(
            "key", {"nested": "value"}
        )

    def test_add_annotation(
        self, mock_powertools_tracer: MagicMock
    ) -> None:
        """アノテーションを追加できること."""
        service = TracingService()

        service.add_annotation("status", "success")

        mock_powertools_tracer.put_annotation.assert_called_once_with(
            "status", "success"
        )

    def test_capture_method(
        self, mock_powertools_tracer: MagicMock
    ) -> None:
        """メソッドをキャプチャできること."""
        service = TracingService()

        def sample_method() -> str:
            return "result"

        service.capture_method(sample_method)

        mock_powertools_tracer.capture_method.assert_called_once()

    def test_tracer_property(
        self, mock_powertools_tracer: MagicMock
    ) -> None:
        """tracerプロパティでインスタンスを取得できること."""
        service = TracingService()
        
        assert service.tracer == mock_powertools_tracer
