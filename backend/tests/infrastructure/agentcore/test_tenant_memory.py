"""Tests for TenantMemoryService."""
import pytest
from unittest.mock import AsyncMock, MagicMock, patch

from src.infrastructure.agentcore.tenant_memory import (
    TenantConfig,
    TenantMemoryService,
)
from src.infrastructure.agentcore.memory_config import MemoryConfig
from src.infrastructure.agentcore.episodic_memory import Episode
from src.infrastructure.agentcore.reflection_service import Reflection


class TestTenantConfig:
    """TenantConfig dataclass tests."""

    def test_tenant_config_creation(self):
        """Test tenant config creation."""
        config = TenantConfig(
            tenant_id="tenant-1",
            name="Test Tenant"
        )
        assert config.tenant_id == "tenant-1"
        assert config.name == "Test Tenant"
        assert config.enable_episodic_memory is True
        assert config.enable_reflections is True

    def test_tenant_config_custom_values(self):
        """Test tenant config with custom values."""
        config = TenantConfig(
            tenant_id="tenant-1",
            name="Custom Tenant",
            max_episodes_per_query=5,
            max_reflections_per_query=3,
            enable_episodic_memory=False
        )
        assert config.max_episodes_per_query == 5
        assert config.enable_episodic_memory is False

    def test_get_namespace_prefix_default(self):
        """Test default namespace prefix."""
        config = TenantConfig(tenant_id="tenant-1", name="Test")
        assert config.get_namespace_prefix() == "/tenant/tenant-1"

    def test_get_namespace_prefix_custom(self):
        """Test custom namespace prefix."""
        config = TenantConfig(
            tenant_id="tenant-1",
            name="Test",
            namespace_prefix="/custom/path"
        )
        assert config.get_namespace_prefix() == "/custom/path"


class TestTenantMemoryService:
    """TenantMemoryService tests."""

    @pytest.fixture
    def mock_memory_client(self):
        """Create mock memory client."""
        client = MagicMock()
        client.retrieve_memories = AsyncMock(return_value=[])
        client.create_event = AsyncMock()
        return client

    @pytest.fixture
    def config(self):
        """Create test config."""
        return MemoryConfig(
            memory_store_id="test-store",
            enable_memory_cache=True,
            max_session_messages=10
        )

    @pytest.fixture
    def service(self, mock_memory_client, config):
        """Create service instance."""
        return TenantMemoryService(
            memory_client=mock_memory_client,
            config=config
        )

    def test_register_tenant(self, service):
        """Test tenant registration."""
        tenant_config = TenantConfig(
            tenant_id="tenant-1",
            name="Test Tenant"
        )
        service.register_tenant(tenant_config)
        
        retrieved = service.get_tenant_config("tenant-1")
        assert retrieved.name == "Test Tenant"

    def test_get_tenant_config_auto_register(self, service):
        """Test auto-registration of unknown tenant."""
        config = service.get_tenant_config("unknown-tenant")
        assert config.tenant_id == "unknown-tenant"
        assert config.name == "Tenant-unknown-tenant"

    def test_get_episodic_service(self, service):
        """Test getting episodic service for tenant."""
        episodic = service.get_episodic_service("tenant-1")
        assert episodic is not None
        
        # Same tenant should return same instance
        episodic2 = service.get_episodic_service("tenant-1")
        assert episodic is episodic2

    def test_get_episodic_service_disabled(self, service):
        """Test getting episodic service when disabled."""
        config = TenantConfig(
            tenant_id="tenant-1",
            name="Test",
            enable_episodic_memory=False
        )
        service.register_tenant(config)
        
        with pytest.raises(ValueError, match="disabled"):
            service.get_episodic_service("tenant-1")

    def test_get_reflection_service(self, service):
        """Test getting reflection service for tenant."""
        reflection = service.get_reflection_service("tenant-1")
        assert reflection is not None

    def test_get_reflection_service_disabled(self, service):
        """Test getting reflection service when disabled."""
        config = TenantConfig(
            tenant_id="tenant-1",
            name="Test",
            enable_reflections=False
        )
        service.register_tenant(config)
        
        with pytest.raises(ValueError, match="disabled"):
            service.get_reflection_service("tenant-1")

    def test_get_session_service(self, service):
        """Test getting session service for tenant."""
        session = service.get_session_service("tenant-1")
        assert session is not None
        
        # Same tenant should return same instance
        session2 = service.get_session_service("tenant-1")
        assert session is session2

    @pytest.mark.asyncio
    async def test_get_full_context(self, service, mock_memory_client):
        """Test getting full memory context."""
        context = await service.get_full_context(
            tenant_id="tenant-1",
            user_id="user-1",
            session_id="sess-1",
            query="test query"
        )
        
        assert "session" in context
        assert "episodes" in context
        assert "reflections" in context
        assert "context_prompt" in context

    @pytest.mark.asyncio
    async def test_get_full_context_disabled_features(self, service, mock_memory_client):
        """Test full context with disabled features."""
        config = TenantConfig(
            tenant_id="tenant-1",
            name="Test",
            enable_episodic_memory=False,
            enable_reflections=False
        )
        service.register_tenant(config)
        
        context = await service.get_full_context(
            tenant_id="tenant-1",
            user_id="user-1",
            session_id="sess-1",
            query="test query"
        )
        
        assert context["episodes"] == []
        assert context["reflections"] == []

    @pytest.mark.asyncio
    async def test_save_interaction(self, service, mock_memory_client):
        """Test saving interaction."""
        await service.save_interaction(
            tenant_id="tenant-1",
            user_id="user-1",
            session_id="sess-1",
            user_message="Hello",
            assistant_response="Hi there",
            tool_calls=[{"name": "search", "result": "data"}]
        )
        
        # Should call create_event for session and episodic
        assert mock_memory_client.create_event.call_count >= 1

    @pytest.mark.asyncio
    async def test_save_interaction_disabled_episodic(self, service, mock_memory_client):
        """Test saving interaction with disabled episodic."""
        config = TenantConfig(
            tenant_id="tenant-1",
            name="Test",
            enable_episodic_memory=False
        )
        service.register_tenant(config)
        
        await service.save_interaction(
            tenant_id="tenant-1",
            user_id="user-1",
            session_id="sess-1",
            user_message="Hello",
            assistant_response="Hi there"
        )
        
        # Should only save to session, not episodic
        assert mock_memory_client.create_event.call_count == 1

    def test_clear_tenant_cache(self, service):
        """Test clearing tenant cache."""
        # Get a session service to populate cache
        session_service = service.get_session_service("tenant-1")
        
        # Clear cache
        service.clear_tenant_cache("tenant-1")
        
        # Verify cache was cleared
        assert len(session_service._cache) == 0

    def test_remove_tenant(self, service):
        """Test removing tenant."""
        # Register and get services
        config = TenantConfig(tenant_id="tenant-1", name="Test")
        service.register_tenant(config)
        service.get_episodic_service("tenant-1")
        service.get_reflection_service("tenant-1")
        service.get_session_service("tenant-1")
        
        # Remove tenant
        service.remove_tenant("tenant-1")
        
        # Verify all services are removed
        assert "tenant-1" not in service._tenant_configs
        assert "tenant-1" not in service._episodic_services
        assert "tenant-1" not in service._reflection_services
        assert "tenant-1" not in service._session_services

    def test_tenant_config_override(self, service, config):
        """Test tenant config overrides base config."""
        tenant_config = TenantConfig(
            tenant_id="tenant-1",
            name="Test",
            max_episodes_per_query=10,
            max_reflections_per_query=5
        )
        service.register_tenant(tenant_config)
        
        memory_config = service._get_tenant_memory_config("tenant-1")
        
        assert memory_config.max_episodes_per_query == 10
        assert memory_config.max_reflections_per_query == 5
        assert memory_config.memory_store_id == config.memory_store_id

    def test_multiple_tenants_isolated(self, service):
        """Test that multiple tenants are isolated."""
        service.register_tenant(TenantConfig(
            tenant_id="tenant-1",
            name="Tenant 1",
            max_episodes_per_query=5
        ))
        service.register_tenant(TenantConfig(
            tenant_id="tenant-2",
            name="Tenant 2",
            max_episodes_per_query=10
        ))
        
        # Get services for both tenants
        episodic1 = service.get_episodic_service("tenant-1")
        episodic2 = service.get_episodic_service("tenant-2")
        
        # They should be different instances
        assert episodic1 is not episodic2
        
        # They should have different configs
        assert episodic1._config.max_episodes_per_query == 5
        assert episodic2._config.max_episodes_per_query == 10
