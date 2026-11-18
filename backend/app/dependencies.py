"""
FastAPI dependency injection — current user, DB session, Redis client.
"""
import uuid
from typing import Annotated

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from jose import JWTError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
import redis.asyncio as aioredis

from app.database import get_db
from app.core.security import decode_token, AuthUser
from app.core.cache import cache_get, cache_set, cache_invalidate
from app.models.user import User, UserRole
from app.config import settings

bearer_scheme = HTTPBearer(auto_error=True)

# ── Redis singleton ─────────────────────────────────────────────────────────

_redis_client: aioredis.Redis | None = None


async def get_redis() -> aioredis.Redis:
    global _redis_client
    if _redis_client is None:
        _redis_client = aioredis.from_url(
            settings.REDIS_URL,
            encoding="utf-8",
            decode_responses=True,
            # Without these, a dropped/idled-out Redis (e.g. local WSL Redis
            # going down) leaves every request touching it hanging on the OS
            # TCP timeout (20-30s+) instead of failing fast. retry_on_timeout
            # off so a single slow attempt doesn't double the wait. Tight
            # enough that a stalled Redis can't meaningfully slow down a
            # request that's using it only as a cache (see core/cache.py) —
            # callers there already treat a timeout as a cache miss.
            socket_timeout=1.0,
            socket_connect_timeout=1.0,
            retry_on_timeout=False,
        )
    return _redis_client


# ── Auth dependency ─────────────────────────────────────────────────────────

# Every authenticated request pays for this lookup, so caching it directly
# attacks the floor every endpoint otherwise shares — see core/cache.py's
# module docstring for the fail-open contract this relies on. Short TTL so
# a deactivation/role change (nothing currently does either, but see
# invalidate_auth_cache below) self-heals quickly even if an invalidation
# call were ever missed.
AUTH_CACHE_TTL_SECONDS = 60


async def invalidate_auth_cache(redis: aioredis.Redis, user_id: uuid.UUID | str) -> None:
    """Call after logout, password change, role update, or deactivation."""
    await cache_invalidate(redis, "authuser", str(user_id))


async def get_current_user(
    credentials: Annotated[HTTPAuthorizationCredentials, Depends(bearer_scheme)],
    db: Annotated[AsyncSession, Depends(get_db)],
    redis: Annotated[aioredis.Redis, Depends(get_redis)],
) -> User | AuthUser:
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Invalid or expired token",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = decode_token(credentials.credentials)
        if payload.get("type") != "access":
            raise credentials_exception
        user_id: str = payload.get("sub")
        if not user_id:
            raise credentials_exception
    except JWTError:
        raise credentials_exception

    cached = await cache_get(redis, "authuser", user_id)
    if cached is not None:
        if not cached.get("is_active"):
            raise credentials_exception
        return AuthUser(
            id=uuid.UUID(cached["id"]),
            email=cached["email"],
            full_name=cached["full_name"],
            role=UserRole(cached["role"]),
            organization_id=uuid.UUID(cached["organization_id"]),
            is_active=cached["is_active"],
        )

    result = await db.execute(
        select(User).where(User.id == uuid.UUID(user_id), User.is_active == True)
    )
    user = result.scalar_one_or_none()
    if user is None:
        raise credentials_exception

    await cache_set(
        redis, "authuser", user_id,
        value={
            "id": str(user.id),
            "email": user.email,
            "full_name": user.full_name,
            "role": user.role.value,
            "organization_id": str(user.organization_id),
            "is_active": user.is_active,
        },
        ttl=AUTH_CACHE_TTL_SECONDS,
    )
    return user


async def get_current_admin(
    current_user: Annotated["User | AuthUser", Depends(get_current_user)],
) -> "User | AuthUser":
    if current_user.role != UserRole.ADMIN:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required",
        )
    return current_user


# Convenience type aliases
CurrentUser = Annotated["User | AuthUser", Depends(get_current_user)]
AdminUser = Annotated["User | AuthUser", Depends(get_current_admin)]
DB = Annotated[AsyncSession, Depends(get_db)]
Redis = Annotated[aioredis.Redis, Depends(get_redis)]
