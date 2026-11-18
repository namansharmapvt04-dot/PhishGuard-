"""
Short-lived Redis read cache for heavy GET endpoints (campaign list, target
list, campaign stats). Pure speed optimisation, not a source of truth — every
caller must still work (just slower) if Redis is unavailable, so every
operation here fails open rather than raising.
"""
import json
from typing import Any

import redis.asyncio as aioredis
import structlog

log = structlog.get_logger(__name__)

# Short enough that a mutation whose invalidation call we missed self-heals
# quickly; long enough to absorb the repeated navigation (Overview → Targets
# → Campaigns → back) this is meant to fix.
DEFAULT_TTL_SECONDS = 20


def _key(namespace: str, *parts: object) -> str:
    return "cache:" + namespace + ":" + ":".join(str(p) for p in parts)


async def cache_get(redis: aioredis.Redis, namespace: str, *parts: object) -> Any | None:
    try:
        raw = await redis.get(_key(namespace, *parts))
    except Exception as e:
        log.warning("cache.get_failed", namespace=namespace, error=str(e))
        return None
    if raw is None:
        return None
    try:
        return json.loads(raw)
    except ValueError:
        return None


async def cache_set(
    redis: aioredis.Redis,
    namespace: str,
    *parts: object,
    value: Any,
    ttl: int = DEFAULT_TTL_SECONDS,
) -> None:
    try:
        await redis.set(_key(namespace, *parts), json.dumps(value), ex=ttl)
    except Exception as e:
        log.warning("cache.set_failed", namespace=namespace, error=str(e))


async def cache_invalidate(redis: aioredis.Redis, namespace: str, *parts: object) -> None:
    """Drop one cached entry — call after any write that changes it."""
    try:
        await redis.delete(_key(namespace, *parts))
    except Exception as e:
        log.warning("cache.invalidate_failed", namespace=namespace, error=str(e))
