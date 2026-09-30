"""
Auth endpoints: register, login, refresh, me, logout.
"""
from datetime import datetime, timezone
import uuid

from fastapi import APIRouter, HTTPException, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
import structlog

from app.dependencies import CurrentUser, DB, Redis
from app.models.user import User, Organization
from app.schemas.auth import UserRegister, UserLogin, UserOut, TokenPair, RefreshRequest, AccessToken
from app.core.security import hash_password, verify_password, create_access_token, create_refresh_token, decode_token

log = structlog.get_logger(__name__)
router = APIRouter(prefix="/auth", tags=["auth"])

REFRESH_PREFIX = "refresh:"


@router.post("/register", response_model=UserOut, status_code=status.HTTP_201_CREATED)
async def register(payload: UserRegister, db: DB):
    # Check email uniqueness
    existing = await db.execute(select(User).where(User.email == payload.email))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Email already registered")

    try:
        # Create organisation
        org = Organization(
            name=payload.organization.name,
            domain=payload.organization.domain,
        )
        db.add(org)
        await db.flush()  # get org.id

        # Create first user as ADMIN
        from app.models.user import UserRole
        user = User(
            email=payload.email,
            hashed_password=hash_password(payload.password),
            full_name=payload.full_name,
            role=UserRole.ADMIN,
            organization_id=org.id,
        )
        db.add(user)
        await db.flush()
        await db.refresh(user)
        await db.refresh(user, ["organization"])
        log.info("auth.register", user_id=str(user.id), org=org.name)
        return user
    except IntegrityError as e:
        raise HTTPException(status_code=400, detail="Domain already taken") from e


@router.post("/login", response_model=TokenPair)
async def login(payload: UserLogin, db: DB, redis: Redis):
    result = await db.execute(
        select(User).where(User.email == payload.email, User.is_active == True)
    )
    user = result.scalar_one_or_none()
    if not user or not verify_password(payload.password, user.hashed_password):
        raise HTTPException(status_code=401, detail="Invalid credentials")

    # Update last login
    user.last_login = datetime.now(timezone.utc)

    access = create_access_token(str(user.id), str(user.organization_id), user.role)
    refresh = create_refresh_token(str(user.id))

    # Store refresh token in Redis for revocation support
    await redis.setex(
        f"{REFRESH_PREFIX}{user.id}",
        60 * 60 * 24 * 7,  # 7 days
        refresh,
    )

    log.info("auth.login", user_id=str(user.id))
    return TokenPair(access_token=access, refresh_token=refresh)


@router.post("/refresh", response_model=AccessToken)
async def refresh_token(payload: RefreshRequest, db: DB, redis: Redis):
    from jose import JWTError
    try:
        claims = decode_token(payload.refresh_token)
        if claims.get("type") != "refresh":
            raise HTTPException(status_code=401, detail="Invalid token type")
        user_id = claims["sub"]
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid refresh token")

    # Validate against Redis
    stored = await redis.get(f"{REFRESH_PREFIX}{user_id}")
    if stored != payload.refresh_token:
        raise HTTPException(status_code=401, detail="Refresh token revoked or expired")

    result = await db.execute(select(User).where(User.id == uuid.UUID(user_id), User.is_active == True))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=401, detail="User not found")

    access = create_access_token(str(user.id), str(user.organization_id), user.role)
    return AccessToken(access_token=access)


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
async def logout(current_user: CurrentUser, redis: Redis):
    await redis.delete(f"{REFRESH_PREFIX}{current_user.id}")
    log.info("auth.logout", user_id=str(current_user.id))


@router.get("/me", response_model=UserOut)
async def me(current_user: CurrentUser, db: DB):
    await db.refresh(current_user, ["organization"])
    return current_user
