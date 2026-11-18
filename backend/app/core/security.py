import uuid
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone

from jose import JWTError, jwt
from passlib.context import CryptContext

from app.config import settings
from app.models.user import UserRole

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


@dataclass(frozen=True)
class AuthUser:
    """
    Lightweight, read-only stand-in for the full `User` ORM row. On an
    `auth:user:{id}` Redis cache hit, `get_current_user` (dependencies.py)
    returns one of these instead of querying Postgres — it carries every
    primitive field a route handler actually reads off `current_user`
    (confirmed by grepping every `current_user.<attr>` access in app/).

    It is NOT attached to any SQLAlchemy session, so it can't be passed to
    `db.refresh()` or used to access the `organization` lazy relationship —
    the two call sites that needed that (campaigns.py's generate/launch)
    now query Organization directly by `organization_id` instead, which
    works identically whether `current_user` is this or the real ORM row.
    """
    id: uuid.UUID
    email: str
    full_name: str
    role: UserRole
    organization_id: uuid.UUID
    is_active: bool


# ── Password helpers ────────────────────────────────────────────────────────

def hash_password(plain: str) -> str:
    return pwd_context.hash(plain)


def verify_password(plain: str, hashed: str) -> bool:
    return pwd_context.verify(plain, hashed)


# ── JWT helpers ─────────────────────────────────────────────────────────────

def _make_token(data: dict, expires_delta: timedelta) -> str:
    payload = data.copy()
    payload["exp"] = datetime.now(timezone.utc) + expires_delta
    payload["iat"] = datetime.now(timezone.utc)
    payload["jti"] = str(uuid.uuid4())
    return jwt.encode(payload, settings.SECRET_KEY, algorithm=settings.ALGORITHM)


def create_access_token(user_id: str, org_id: str, role: str) -> str:
    return _make_token(
        {"sub": user_id, "org": org_id, "role": role, "type": "access"},
        timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES),
    )


def create_refresh_token(user_id: str) -> str:
    return _make_token(
        {"sub": user_id, "type": "refresh"},
        timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS),
    )


def decode_token(token: str) -> dict:
    """Raises JWTError on invalid/expired tokens."""
    return jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
