"""
Tests for authentication endpoints:
  POST /api/v1/auth/register
  POST /api/v1/auth/login
  POST /api/v1/auth/refresh
  POST /api/v1/auth/logout
  GET  /api/v1/auth/me
"""
import uuid
import pytest
from httpx import AsyncClient


def unique_user():
    """Generate a unique user + org payload each call."""
    uid = uuid.uuid4().hex[:8]
    return {
        "email": f"user_{uid}@example.com",
        "password": "SecurePass123!",
        "full_name": "Test User",
        "organization": {
            "name": f"Org_{uid}",
            "domain": f"org-{uid}.com",
        },
    }


# ── Registration ──────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_register_success(client: AsyncClient):
    payload = unique_user()
    r = await client.post("/api/v1/auth/register", json=payload)
    assert r.status_code == 201, r.text
    data = r.json()
    assert data["email"] == payload["email"]
    assert data["full_name"] == payload["full_name"]
    assert data["role"].upper() == "ADMIN"  # SQLite stores enum value as-is
    assert "hashed_password" not in data  # never leak the hash


@pytest.mark.asyncio
async def test_register_duplicate_email(client: AsyncClient):
    payload = unique_user()
    await client.post("/api/v1/auth/register", json=payload)
    # Second registration with same email must fail
    r = await client.post("/api/v1/auth/register", json=payload)
    assert r.status_code == 400
    assert "already registered" in r.json()["detail"].lower()


@pytest.mark.asyncio
async def test_register_missing_fields(client: AsyncClient):
    """Pydantic should reject an incomplete payload with 422."""
    r = await client.post("/api/v1/auth/register", json={"email": "bad@x.com"})
    assert r.status_code == 422


# ── Login ─────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_login_success(client: AsyncClient):
    payload = unique_user()
    await client.post("/api/v1/auth/register", json=payload)

    r = await client.post(
        "/api/v1/auth/login",
        json={"email": payload["email"], "password": payload["password"]},
    )
    assert r.status_code == 200, r.text
    data = r.json()
    assert "access_token" in data
    assert "refresh_token" in data
    assert data["token_type"] == "bearer"


@pytest.mark.asyncio
async def test_login_wrong_password(client: AsyncClient):
    payload = unique_user()
    await client.post("/api/v1/auth/register", json=payload)

    r = await client.post(
        "/api/v1/auth/login",
        json={"email": payload["email"], "password": "WRONG_PASSWORD"},
    )
    assert r.status_code == 401


@pytest.mark.asyncio
async def test_login_unknown_email(client: AsyncClient):
    r = await client.post(
        "/api/v1/auth/login",
        json={"email": "ghost@nowhere.com", "password": "irrelevant"},
    )
    assert r.status_code == 401


# ── /me ───────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_me_authenticated(client: AsyncClient, auth_headers: dict):
    r = await client.get("/api/v1/auth/me", headers=auth_headers)
    assert r.status_code == 200, r.text
    data = r.json()
    assert "email" in data
    assert "organization" in data


@pytest.mark.asyncio
async def test_me_unauthenticated(client: AsyncClient):
    r = await client.get("/api/v1/auth/me")
    assert r.status_code == 401


# ── Refresh ───────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_token_refresh(client: AsyncClient):
    payload = unique_user()
    await client.post("/api/v1/auth/register", json=payload)
    login = await client.post(
        "/api/v1/auth/login",
        json={"email": payload["email"], "password": payload["password"]},
    )
    refresh_token = login.json()["refresh_token"]

    r = await client.post("/api/v1/auth/refresh", json={"refresh_token": refresh_token})
    assert r.status_code == 200, r.text
    assert "access_token" in r.json()


@pytest.mark.asyncio
async def test_token_refresh_invalid_token(client: AsyncClient):
    r = await client.post("/api/v1/auth/refresh", json={"refresh_token": "not.a.real.token"})
    assert r.status_code == 401


# ── Logout ────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_logout(client: AsyncClient, auth_headers: dict):
    r = await client.post("/api/v1/auth/logout", headers=auth_headers)
    assert r.status_code == 204
