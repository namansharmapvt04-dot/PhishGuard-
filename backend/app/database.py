from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy.orm import DeclarativeBase
from app.config import settings


engine = create_async_engine(
    settings.DATABASE_URL,
    echo=settings.ENVIRONMENT == "development",
    pool_pre_ping=True,
    pool_size=10,
    max_overflow=20,
    # Recycle pooled connections before Neon's own idle-connection reaper (or
    # a NAT/load-balancer in between) can silently drop them — a connection
    # that's gone stale server-side without pool_pre_ping catching it would
    # otherwise fail the next request that picks it up.
    pool_recycle=240,
    # Fail fast instead of hanging a request indefinitely: pool_timeout caps
    # how long a request waits for a free connection when the pool is
    # exhausted, and connect_args' timeout caps establishing a brand new
    # connection to Neon (asyncpg's own connect() kwarg).
    pool_timeout=10,
    connect_args={"timeout": 5},
)

AsyncSessionLocal = async_sessionmaker(
    bind=engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autocommit=False,
    autoflush=False,
)


class Base(DeclarativeBase):
    __allow_unmapped__ = True



async def get_db() -> AsyncSession:
    """FastAPI dependency — yields a DB session and closes it after the request."""
    async with AsyncSessionLocal() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()
