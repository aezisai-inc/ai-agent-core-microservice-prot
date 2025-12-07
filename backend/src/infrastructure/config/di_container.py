"""Dependency Injection Container.

Provides centralized dependency management for the application.
Implements a simple service locator pattern with lazy initialization.
"""

from functools import cached_property
from typing import Any

import structlog

from src.infrastructure.config.settings import Settings
from src.infrastructure.agentcore.memory_config import MemoryConfig
from src.infrastructure.agentcore.memory_client import AgentCoreMemoryClient
from src.infrastructure.agentcore.episodic_memory import EpisodicMemoryService
from src.infrastructure.agentcore.reflection_service import ReflectionService

logger = structlog.get_logger()


class DIContainer:
    """Dependency Injection Container.
    
    Provides lazy-loaded access to application services and their dependencies.
    Services are created once and reused throughout the application lifecycle.
    
    Example usage:
        ```python
        container = DIContainer()
        
        # Get services
        episodic_service = container.episodic_memory_service
        reflection_service = container.reflection_service
        ```
    """

    def __init__(
        self,
        settings: Settings | None = None,
        memory_config: MemoryConfig | None = None,
    ):
        """Initialize the container.
        
        Args:
            settings: Application settings (loads from env if not provided)
            memory_config: Memory configuration (loads from env if not provided)
        """
        self._settings = settings or Settings()
        self._memory_config = memory_config or MemoryConfig()
        self._instances: dict[str, Any] = {}

    @property
    def settings(self) -> Settings:
        """Get application settings."""
        return self._settings

    @property
    def memory_config(self) -> MemoryConfig:
        """Get memory configuration."""
        return self._memory_config

    @cached_property
    def memory_client(self) -> AgentCoreMemoryClient:
        """Get the AgentCore Memory client.
        
        Returns:
            Configured memory client instance
        """
        logger.info(
            "initializing_memory_client",
            region=self._memory_config.region,
            memory_store_id=self._memory_config.memory_store_id,
        )
        return AgentCoreMemoryClient(config=self._memory_config)

    @cached_property
    def episodic_memory_service(self) -> EpisodicMemoryService:
        """Get the Episodic Memory service.
        
        Returns:
            Configured episodic memory service instance
        """
        logger.info("initializing_episodic_memory_service")
        return EpisodicMemoryService(
            memory_client=self.memory_client,
            config=self._memory_config,
        )

    @cached_property
    def reflection_service(self) -> ReflectionService:
        """Get the Reflection service.
        
        Returns:
            Configured reflection service instance
        """
        logger.info("initializing_reflection_service")
        return ReflectionService(
            memory_client=self.memory_client,
            config=self._memory_config,
        )

    def reset(self) -> None:
        """Reset all cached instances.
        
        Useful for testing or when configuration changes.
        """
        # Clear cached properties
        for attr in ["memory_client", "episodic_memory_service", "reflection_service"]:
            if attr in self.__dict__:
                del self.__dict__[attr]
        
        self._instances.clear()
        logger.info("di_container_reset")


# Global container instance
_container: DIContainer | None = None


def get_container() -> DIContainer:
    """Get the global DI container instance.
    
    Creates the container on first call (singleton pattern).
    
    Returns:
        The global DIContainer instance
    """
    global _container
    if _container is None:
        _container = DIContainer()
    return _container


def reset_container() -> None:
    """Reset the global container.
    
    Useful for testing or reconfiguration.
    """
    global _container
    if _container is not None:
        _container.reset()
    _container = None
