"""
Session Memory Service - Short-term memory for conversation context.

AgentCore Memory の Short-term Memory を使用して、
セッション内の会話コンテキストを管理する。
"""
from dataclasses import dataclass, field
from datetime import datetime
from typing import Optional
import structlog

from .memory_client import AgentCoreMemoryClient
from .memory_config import MemoryConfig

logger = structlog.get_logger(__name__)


@dataclass
class Message:
    """会話メッセージ"""
    role: str  # "user" | "assistant" | "system" | "tool"
    content: str
    timestamp: str = field(default_factory=lambda: datetime.utcnow().isoformat())
    metadata: dict = field(default_factory=dict)


@dataclass
class SessionContext:
    """セッションコンテキスト"""
    session_id: str
    user_id: str
    messages: list[Message] = field(default_factory=list)
    metadata: dict = field(default_factory=dict)
    created_at: str = field(default_factory=lambda: datetime.utcnow().isoformat())
    updated_at: str = field(default_factory=lambda: datetime.utcnow().isoformat())

    @property
    def message_count(self) -> int:
        return len(self.messages)

    def add_message(self, role: str, content: str, metadata: dict | None = None) -> None:
        """メッセージを追加"""
        self.messages.append(Message(
            role=role,
            content=content,
            metadata=metadata or {}
        ))
        self.updated_at = datetime.utcnow().isoformat()

    def get_recent_messages(self, count: int = 10) -> list[Message]:
        """直近のメッセージを取得"""
        return self.messages[-count:] if self.messages else []

    def to_prompt_context(self, max_messages: int = 10) -> str:
        """プロンプト用のコンテキスト文字列を生成"""
        recent = self.get_recent_messages(max_messages)
        if not recent:
            return ""
        
        lines = ["## 会話履歴:"]
        for msg in recent:
            role_label = {
                "user": "ユーザー",
                "assistant": "アシスタント",
                "system": "システム",
                "tool": "ツール"
            }.get(msg.role, msg.role)
            lines.append(f"[{role_label}]: {msg.content[:500]}")
        
        return "\n".join(lines)


class SessionMemoryService:
    """
    セッションメモリサービス
    
    AgentCore Memory の Short-term Memory を使用して、
    セッション単位の会話コンテキストを管理する。
    """

    def __init__(
        self,
        memory_client: AgentCoreMemoryClient,
        config: MemoryConfig
    ):
        self._client = memory_client
        self._config = config
        self._cache: dict[str, SessionContext] = {}

    async def get_session(
        self,
        session_id: str,
        user_id: str
    ) -> SessionContext:
        """
        セッションコンテキストを取得
        
        キャッシュがあればキャッシュから、なければAgentCore Memoryから取得
        """
        cache_key = f"{user_id}:{session_id}"
        
        # キャッシュチェック
        if self._config.enable_memory_cache and cache_key in self._cache:
            logger.debug("session_cache_hit", session_id=session_id)
            return self._cache[cache_key]
        
        # AgentCore Memory から取得
        try:
            raw_messages = await self._client.retrieve_memories(
                memory_id=self._config.memory_store_id,
                namespace=f"/sessions/{user_id}/{session_id}",
                query="*",  # セッション内の全メッセージ
                max_results=self._config.max_session_messages
            )
            
            context = SessionContext(
                session_id=session_id,
                user_id=user_id
            )
            
            for raw in raw_messages:
                context.messages.append(Message(
                    role=raw.get("role", "user"),
                    content=raw.get("content", ""),
                    timestamp=raw.get("timestamp", ""),
                    metadata=raw.get("metadata", {})
                ))
            
            # キャッシュに保存
            if self._config.enable_memory_cache:
                self._cache[cache_key] = context
            
            logger.info(
                "session_loaded",
                session_id=session_id,
                message_count=len(context.messages)
            )
            return context
            
        except Exception as e:
            logger.warning(
                "session_load_failed",
                session_id=session_id,
                error=str(e)
            )
            # 新規セッションとして返す
            return SessionContext(session_id=session_id, user_id=user_id)

    async def save_message(
        self,
        session_id: str,
        user_id: str,
        role: str,
        content: str,
        metadata: dict | None = None
    ) -> None:
        """
        メッセージを保存
        
        AgentCore Memory にメッセージを保存し、キャッシュも更新
        """
        try:
            # AgentCore Memory に保存
            await self._client.create_event(
                memory_id=self._config.memory_store_id,
                actor_id=user_id,
                session_id=session_id,
                messages=[(content, role.upper())],
                namespace=f"/sessions/{user_id}/{session_id}"
            )
            
            # キャッシュ更新
            cache_key = f"{user_id}:{session_id}"
            if cache_key in self._cache:
                self._cache[cache_key].add_message(role, content, metadata)
            
            logger.info(
                "message_saved",
                session_id=session_id,
                role=role,
                content_length=len(content)
            )
            
        except Exception as e:
            logger.error(
                "message_save_failed",
                session_id=session_id,
                error=str(e)
            )
            raise

    async def save_turn(
        self,
        session_id: str,
        user_id: str,
        user_message: str,
        assistant_response: str,
        tool_calls: list[dict] | None = None
    ) -> None:
        """
        会話ターン（ユーザー→アシスタント）を一括保存
        
        エピソード検出の精度向上のため、Tool結果も含めて保存
        """
        messages: list[tuple[str, str]] = [
            (user_message, "USER"),
            (assistant_response, "ASSISTANT"),
        ]
        
        # Tool結果を含める
        if tool_calls:
            for tool in tool_calls:
                tool_content = f"Tool: {tool.get('name', 'unknown')}, Result: {str(tool.get('result', ''))[:500]}"
                messages.append((tool_content, "TOOL"))
        
        try:
            await self._client.create_event(
                memory_id=self._config.memory_store_id,
                actor_id=user_id,
                session_id=session_id,
                messages=messages,
                namespace=f"/sessions/{user_id}/{session_id}"
            )
            
            # キャッシュ更新
            cache_key = f"{user_id}:{session_id}"
            if cache_key in self._cache:
                self._cache[cache_key].add_message("user", user_message)
                self._cache[cache_key].add_message("assistant", assistant_response)
                if tool_calls:
                    for tool in tool_calls:
                        self._cache[cache_key].add_message(
                            "tool",
                            f"{tool.get('name')}: {str(tool.get('result', ''))[:200]}"
                        )
            
            logger.info(
                "turn_saved",
                session_id=session_id,
                tool_count=len(tool_calls) if tool_calls else 0
            )
            
        except Exception as e:
            logger.error("turn_save_failed", session_id=session_id, error=str(e))
            raise

    async def clear_session(self, session_id: str, user_id: str) -> None:
        """セッションをクリア"""
        cache_key = f"{user_id}:{session_id}"
        if cache_key in self._cache:
            del self._cache[cache_key]
        
        logger.info("session_cleared", session_id=session_id)

    def invalidate_cache(self, session_id: str | None = None, user_id: str | None = None) -> None:
        """キャッシュを無効化"""
        if session_id and user_id:
            cache_key = f"{user_id}:{session_id}"
            self._cache.pop(cache_key, None)
        else:
            self._cache.clear()
        
        logger.debug("cache_invalidated", session_id=session_id)

    def build_context_prompt(
        self,
        context: SessionContext,
        max_messages: int | None = None
    ) -> str:
        """
        セッションコンテキストからプロンプト用の文字列を生成
        """
        max_msgs = max_messages or self._config.max_session_messages
        return context.to_prompt_context(max_msgs)
