"""
Tenant Memory Service - Multi-tenant namespace isolation for AgentCore Memory.

テナントごとに namespace を分離し、データの隔離を実現する。
"""
from dataclasses import dataclass
from typing import Optional
import structlog

from .memory_client import AgentCoreMemoryClient
from .memory_config import MemoryConfig
from .episodic_memory import EpisodicMemoryService, Episode
from .reflection_service import ReflectionService, Reflection
from .session_memory import SessionMemoryService, SessionContext

logger = structlog.get_logger(__name__)


@dataclass
class TenantConfig:
    """テナント設定"""
    tenant_id: str
    name: str
    # メモリ設定のオーバーライド
    max_episodes_per_query: int | None = None
    max_reflections_per_query: int | None = None
    max_session_messages: int | None = None
    # 機能フラグ
    enable_episodic_memory: bool = True
    enable_reflections: bool = True
    # カスタム namespace プレフィックス
    namespace_prefix: str | None = None

    def get_namespace_prefix(self) -> str:
        """テナント用の namespace プレフィックスを取得"""
        return self.namespace_prefix or f"/tenant/{self.tenant_id}"


class TenantMemoryService:
    """
    テナントメモリサービス
    
    マルチテナント環境でのメモリ分離を実現する。
    各テナントは独自の namespace を持ち、データが隔離される。
    """

    def __init__(
        self,
        memory_client: AgentCoreMemoryClient,
        config: MemoryConfig
    ):
        self._client = memory_client
        self._config = config
        self._tenant_configs: dict[str, TenantConfig] = {}
        # サービスキャッシュ（テナントごと）
        self._episodic_services: dict[str, EpisodicMemoryService] = {}
        self._reflection_services: dict[str, ReflectionService] = {}
        self._session_services: dict[str, SessionMemoryService] = {}

    def register_tenant(self, tenant_config: TenantConfig) -> None:
        """テナントを登録"""
        self._tenant_configs[tenant_config.tenant_id] = tenant_config
        logger.info(
            "tenant_registered",
            tenant_id=tenant_config.tenant_id,
            name=tenant_config.name
        )

    def get_tenant_config(self, tenant_id: str) -> TenantConfig:
        """テナント設定を取得"""
        if tenant_id not in self._tenant_configs:
            # デフォルト設定で自動登録
            default_config = TenantConfig(
                tenant_id=tenant_id,
                name=f"Tenant-{tenant_id}"
            )
            self._tenant_configs[tenant_id] = default_config
            logger.info("tenant_auto_registered", tenant_id=tenant_id)
        
        return self._tenant_configs[tenant_id]

    def _get_tenant_memory_config(self, tenant_id: str) -> MemoryConfig:
        """テナント用のメモリ設定を生成"""
        tenant_config = self.get_tenant_config(tenant_id)
        
        # テナント設定でオーバーライド
        return MemoryConfig(
            memory_store_id=self._config.memory_store_id,
            max_episodes_per_query=(
                tenant_config.max_episodes_per_query 
                or self._config.max_episodes_per_query
            ),
            max_reflections_per_query=(
                tenant_config.max_reflections_per_query 
                or self._config.max_reflections_per_query
            ),
            max_session_messages=(
                tenant_config.max_session_messages 
                or self._config.max_session_messages
            ),
            episode_context_max_chars=self._config.episode_context_max_chars,
            reflection_context_max_chars=self._config.reflection_context_max_chars,
            enable_tenant_isolation=True,
            tenant_namespace_prefix=tenant_config.get_namespace_prefix(),
            enable_memory_cache=self._config.enable_memory_cache,
            cache_ttl_seconds=self._config.cache_ttl_seconds
        )

    def get_episodic_service(self, tenant_id: str) -> EpisodicMemoryService:
        """テナント用のエピソードメモリサービスを取得"""
        tenant_config = self.get_tenant_config(tenant_id)
        
        if not tenant_config.enable_episodic_memory:
            raise ValueError(f"Episodic memory is disabled for tenant: {tenant_id}")
        
        if tenant_id not in self._episodic_services:
            tenant_memory_config = self._get_tenant_memory_config(tenant_id)
            self._episodic_services[tenant_id] = EpisodicMemoryService(
                memory_client=self._client,
                config=tenant_memory_config
            )
            logger.debug("episodic_service_created", tenant_id=tenant_id)
        
        return self._episodic_services[tenant_id]

    def get_reflection_service(self, tenant_id: str) -> ReflectionService:
        """テナント用のリフレクションサービスを取得"""
        tenant_config = self.get_tenant_config(tenant_id)
        
        if not tenant_config.enable_reflections:
            raise ValueError(f"Reflections are disabled for tenant: {tenant_id}")
        
        if tenant_id not in self._reflection_services:
            tenant_memory_config = self._get_tenant_memory_config(tenant_id)
            self._reflection_services[tenant_id] = ReflectionService(
                memory_client=self._client,
                config=tenant_memory_config
            )
            logger.debug("reflection_service_created", tenant_id=tenant_id)
        
        return self._reflection_services[tenant_id]

    def get_session_service(self, tenant_id: str) -> SessionMemoryService:
        """テナント用のセッションメモリサービスを取得"""
        if tenant_id not in self._session_services:
            tenant_memory_config = self._get_tenant_memory_config(tenant_id)
            self._session_services[tenant_id] = SessionMemoryService(
                memory_client=self._client,
                config=tenant_memory_config
            )
            logger.debug("session_service_created", tenant_id=tenant_id)
        
        return self._session_services[tenant_id]

    async def get_full_context(
        self,
        tenant_id: str,
        user_id: str,
        session_id: str,
        query: str
    ) -> dict:
        """
        テナント用の完全なメモリコンテキストを取得
        
        Returns:
            {
                "session": SessionContext,
                "episodes": List[Episode],
                "reflections": List[Reflection],
                "context_prompt": str
            }
        """
        tenant_config = self.get_tenant_config(tenant_id)
        result: dict = {
            "session": None,
            "episodes": [],
            "reflections": [],
            "context_prompt": ""
        }
        
        # セッションコンテキスト取得
        session_service = self.get_session_service(tenant_id)
        result["session"] = await session_service.get_session(session_id, user_id)
        
        # エピソード取得（有効な場合）
        if tenant_config.enable_episodic_memory:
            episodic_service = self.get_episodic_service(tenant_id)
            result["episodes"] = await episodic_service.retrieve_similar_episodes(
                user_id=user_id,
                query=query
            )
        
        # リフレクション取得（有効な場合）
        if tenant_config.enable_reflections:
            reflection_service = self.get_reflection_service(tenant_id)
            result["reflections"] = await reflection_service.retrieve_relevant_reflections(
                user_id=user_id,
                use_case=query
            )
        
        # 統合コンテキストプロンプト生成
        result["context_prompt"] = self._build_full_context_prompt(
            session=result["session"],
            episodes=result["episodes"],
            reflections=result["reflections"],
            tenant_config=tenant_config
        )
        
        logger.info(
            "full_context_retrieved",
            tenant_id=tenant_id,
            session_messages=result["session"].message_count if result["session"] else 0,
            episode_count=len(result["episodes"]),
            reflection_count=len(result["reflections"])
        )
        
        return result

    def _build_full_context_prompt(
        self,
        session: SessionContext | None,
        episodes: list[Episode],
        reflections: list[Reflection],
        tenant_config: TenantConfig
    ) -> str:
        """統合コンテキストプロンプトを構築"""
        sections = []
        
        # セッション履歴
        if session and session.messages:
            session_service = self.get_session_service(tenant_config.tenant_id)
            session_prompt = session_service.build_context_prompt(session)
            if session_prompt:
                sections.append(session_prompt)
        
        # エピソードコンテキスト
        if episodes and tenant_config.enable_episodic_memory:
            episodic_service = self.get_episodic_service(tenant_config.tenant_id)
            episode_prompt = episodic_service.build_episode_context(episodes)
            if episode_prompt:
                sections.append(episode_prompt)
        
        # リフレクションコンテキスト
        if reflections and tenant_config.enable_reflections:
            reflection_service = self.get_reflection_service(tenant_config.tenant_id)
            reflection_prompt = reflection_service.build_reflection_prompt(reflections)
            if reflection_prompt:
                sections.append(reflection_prompt)
        
        return "\n\n".join(sections)

    async def save_interaction(
        self,
        tenant_id: str,
        user_id: str,
        session_id: str,
        user_message: str,
        assistant_response: str,
        tool_calls: list[dict] | None = None
    ) -> None:
        """
        インタラクションを保存（セッション + エピソード検出用）
        """
        tenant_config = self.get_tenant_config(tenant_id)
        
        # セッションに保存
        session_service = self.get_session_service(tenant_id)
        await session_service.save_turn(
            session_id=session_id,
            user_id=user_id,
            user_message=user_message,
            assistant_response=assistant_response,
            tool_calls=tool_calls
        )
        
        # エピソード検出用に保存（有効な場合）
        if tenant_config.enable_episodic_memory:
            episodic_service = self.get_episodic_service(tenant_id)
            await episodic_service.save_interaction(
                session_id=session_id,
                user_id=user_id,
                user_message=user_message,
                assistant_response=assistant_response,
                tool_calls=tool_calls or []
            )
        
        logger.info(
            "interaction_saved",
            tenant_id=tenant_id,
            session_id=session_id
        )

    def clear_tenant_cache(self, tenant_id: str) -> None:
        """テナントのキャッシュをクリア"""
        if tenant_id in self._session_services:
            self._session_services[tenant_id].invalidate_cache()
        
        logger.info("tenant_cache_cleared", tenant_id=tenant_id)

    def remove_tenant(self, tenant_id: str) -> None:
        """テナントを削除"""
        self._tenant_configs.pop(tenant_id, None)
        self._episodic_services.pop(tenant_id, None)
        self._reflection_services.pop(tenant_id, None)
        self._session_services.pop(tenant_id, None)
        
        logger.info("tenant_removed", tenant_id=tenant_id)
