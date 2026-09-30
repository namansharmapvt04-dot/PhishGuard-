"""
Pytest configuration and shared fixtures for PhishGuard backend tests.

Uses:
- httpx.AsyncClient with ASGITransport to hit FastAPI directly (no real server needed)
- SQLite in-memory DB instead of PostgreSQL (no external DB needed)
- FakeRedis stub instead of a real Redis instance
"""
import asyncio
import uuid
from typing import AsyncGenerator

import pytest
import pytest_asyncio
from httpx import AsyncClient, ASGITransport
from sqlalchemy.pool import StaticPool

# ── 1. Set env vars FIRST (before any app imports) ─────────────────────────
import os
os.environ["DATABASE_URL"] = "sqlite+aiosqlite:///:memory:"
os.environ.setdefault("REDIS_URL", "redis://localhost:6379/0")
os.environ.setdefault("SECRET_KEY", "test-secret-key-for-pytest-only")
os.environ.setdefault("GROQ_API_KEY", "gsk_test_fake_key")
os.environ.setdefault("ENVIRONMENT", "development")
os.environ.setdefault("FRONTEND_URL", "http://localhost:5173")

# ── 2. Patch create_async_engine BEFORE app.database is imported ────────────
# database.py passes pool_size/max_overflow which SQLite doesn't support.
# We strip those kwargs when the URL is SQLite.
import sqlalchemy.ext.asyncio as _sqla_async
_real_create_async_engine = _sqla_async.create_async_engine

def _patched_create_async_engine(url, **kwargs):
    url_str = str(url)
    if "sqlite" in url_str:
        kwargs.pop("pool_size", None)
        kwargs.pop("max_overflow", None)
        kwargs.pop("pool_pre_ping", None)
        kwargs.setdefault("poolclass", StaticPool)
        kwargs.setdefault("connect_args", {"check_same_thread": False})
    return _real_create_async_engine(url, **kwargs)

_sqla_async.create_async_engine = _patched_create_async_engine

# ── 3. Stub out ML modules that aren't installed (langgraph, chromadb, etc.) ──
import sys
from unittest.mock import MagicMock

# Stub langgraph
for _mod in [
    "langgraph", "langgraph.graph", "langgraph.checkpoint",
    "langchain", "langchain.schema", "langchain_core", "langchain_core.messages",
    "langchain_groq", "langchain_openai", "langchain_community",
    "chromadb", "sentence_transformers", "ragas", "datasets",
]:
    sys.modules.setdefault(_mod, MagicMock())

# Stub app.agents so campaigns router doesn't fail on import
_agents_mock = MagicMock()
_agents_mock.generation_pipeline = MagicMock()
_agents_mock.AgentState = dict
sys.modules["app.agents"] = _agents_mock
sys.modules["app.agents.graph"] = _agents_mock
sys.modules["app.agents.state"] = _agents_mock

# Stub app.rag
_rag_mock = MagicMock()
_rag_mock.collection_count = lambda: 0
sys.modules["app.rag"] = _rag_mock
sys.modules["app.rag.vectorstore"] = _rag_mock

# ── 4. Now import the app (engine is created with safe kwargs) ──────────────
from app.main import app
from app.database import Base, get_db, engine as app_engine
from app.dependencies import get_redis


# ── Re-use the engine already created by database.py (now backed by SQLite) ─
from sqlalchemy.ext.asyncio import async_sessionmaker, AsyncSession

TestingSessionLocal = async_sessionmaker(app_engine, expire_on_commit=False)


async def override_get_db() -> AsyncGenerator[AsyncSession, None]:
    async with TestingSessionLocal() as session:
        async with session.begin():
            yield session


# ── Fake Redis (replaces real Redis for tests) ─────────────────────────────
class FakeRedis:
    """Minimal in-memory Redis stub for testing."""
    def __init__(self):
        self._store: dict = {}

    async def setex(self, key, seconds, value):
        self._store[key] = value

    async def get(self, key):
        return self._store.get(key)

    async def delete(self, key):
        self._store.pop(key, None)

    async def ping(self):
        return True


fake_redis = FakeRedis()


async def override_get_redis():
    yield fake_redis


# ── Session-scoped event loop ──────────────────────────────────────────────
@pytest.fixture(scope="session")
def event_loop():
    loop = asyncio.new_event_loop()
    yield loop
    loop.close()


# ── Create / drop all tables around the test session ──────────────────────
@pytest_asyncio.fixture(scope="session", autouse=True)
async def setup_db():
    async with app_engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield
    async with app_engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)


# ── Wire overrides into the FastAPI app ────────────────────────────────────
@pytest_asyncio.fixture(scope="session")
async def client() -> AsyncGenerator[AsyncClient, None]:
    app.dependency_overrides[get_db] = override_get_db
    app.dependency_overrides[get_redis] = override_get_redis

    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as ac:
        yield ac

    app.dependency_overrides.clear()


# ── Convenience: register + login a fresh admin user ─────────────────────
@pytest_asyncio.fixture()
async def auth_headers(client: AsyncClient) -> dict:
    """Returns Authorization headers for a freshly-registered admin user."""
    unique = uuid.uuid4().hex[:8]
    reg_payload = {
        "email": f"admin_{unique}@example.com",
        "password": "StrongPass123!",
        "full_name": "Test Admin",
        "organization": {
            "name": f"TestOrg_{unique}",
            "domain": f"testorg-{unique}.com",
        },
    }
    reg = await client.post("/api/v1/auth/register", json=reg_payload)
    assert reg.status_code == 201, reg.text

    login = await client.post(
        "/api/v1/auth/login",
        json={"email": reg_payload["email"], "password": reg_payload["password"]},
    )
    assert login.status_code == 200, login.text
    token = login.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}
