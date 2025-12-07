"""
AgentCore Tracing Service.

AWS X-Rayを使用した分散トレーシング機能を提供。
エージェント実行、メモリ操作、ツール呼び出しの
追跡と可視化を担当。
"""

from contextlib import contextmanager
from typing import Any, Generator

from aws_lambda_powertools import Tracer


class TracingService:
    """
    X-Ray Tracingサービス.
    
    AWS Lambda Powertoolsを使用してトレースを収集。
    """
    
    def __init__(
        self,
        service: str = "AgentCoreRuntime",
        *,
        auto_patch: bool = True,
    ):
        """
        トレーシングサービスを初期化.
        
        Args:
            service: サービス名
            auto_patch: 自動パッチ有効化
        """
        self._tracer = Tracer(service=service, auto_patch=auto_patch)
        self._service = service
    
    @contextmanager
    def trace_agent_invocation(
        self,
        tenant_id: str,
        agent_id: str,
        session_id: str,
    ) -> Generator[None, None, None]:
        """
        エージェント呼び出しをトレース.
        
        Args:
            tenant_id: テナントID
            agent_id: エージェントID
            session_id: セッションID
            
        Yields:
            トレースコンテキスト
        """
        with self._tracer.provider.in_subsegment("agent_invocation") as subsegment:
            subsegment.put_annotation("tenant_id", tenant_id)
            subsegment.put_annotation("agent_id", agent_id)
            subsegment.put_annotation("session_id", session_id)
            yield
    
    @contextmanager
    def trace_memory_operation(
        self,
        operation: str,
        memory_type: str,
        tenant_id: str,
    ) -> Generator[None, None, None]:
        """
        メモリ操作をトレース.
        
        Args:
            operation: 操作種別（read/write/query）
            memory_type: メモリタイプ（episodic/reflection/session）
            tenant_id: テナントID
            
        Yields:
            トレースコンテキスト
        """
        with self._tracer.provider.in_subsegment(f"memory_{operation}") as subsegment:
            subsegment.put_annotation("operation", operation)
            subsegment.put_annotation("memory_type", memory_type)
            subsegment.put_annotation("tenant_id", tenant_id)
            yield
    
    @contextmanager
    def trace_tool_execution(
        self,
        tool_name: str,
        tenant_id: str,
    ) -> Generator[None, None, None]:
        """
        ツール実行をトレース.
        
        Args:
            tool_name: ツール名
            tenant_id: テナントID
            
        Yields:
            トレースコンテキスト
        """
        with self._tracer.provider.in_subsegment(f"tool_{tool_name}") as subsegment:
            subsegment.put_annotation("tool_name", tool_name)
            subsegment.put_annotation("tenant_id", tenant_id)
            yield
    
    @contextmanager
    def trace_llm_call(
        self,
        model_id: str,
        tenant_id: str,
    ) -> Generator[None, None, None]:
        """
        LLM呼び出しをトレース.
        
        Args:
            model_id: モデルID
            tenant_id: テナントID
            
        Yields:
            トレースコンテキスト
        """
        with self._tracer.provider.in_subsegment("llm_call") as subsegment:
            subsegment.put_annotation("model_id", model_id)
            subsegment.put_annotation("tenant_id", tenant_id)
            yield
    
    @contextmanager
    def trace_knowledge_search(
        self,
        knowledge_base_id: str,
        tenant_id: str,
    ) -> Generator[None, None, None]:
        """
        Knowledge Base検索をトレース.
        
        Args:
            knowledge_base_id: Knowledge Base ID
            tenant_id: テナントID
            
        Yields:
            トレースコンテキスト
        """
        with self._tracer.provider.in_subsegment("knowledge_search") as subsegment:
            subsegment.put_annotation("knowledge_base_id", knowledge_base_id)
            subsegment.put_annotation("tenant_id", tenant_id)
            yield
    
    def add_metadata(self, key: str, value: Any) -> None:
        """
        メタデータを現在のセグメントに追加.
        
        Args:
            key: メタデータキー
            value: メタデータ値
        """
        self._tracer.put_metadata(key, value)
    
    def add_annotation(self, key: str, value: str | int | bool) -> None:
        """
        アノテーションを現在のセグメントに追加.
        
        Args:
            key: アノテーションキー
            value: アノテーション値
        """
        self._tracer.put_annotation(key, value)
    
    def capture_method(self, method: Any) -> Any:
        """
        メソッドをデコレートしてトレースを自動追加.
        
        Args:
            method: デコレート対象メソッド
            
        Returns:
            デコレートされたメソッド
        """
        return self._tracer.capture_method(method)
    
    @property
    def tracer(self) -> Tracer:
        """Lambda Powertoolsトレーサーインスタンスを取得."""
        return self._tracer
