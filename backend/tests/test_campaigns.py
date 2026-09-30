"""
Tests for campaign CRUD endpoints (no AI pipeline triggered):
  POST   /api/v1/campaigns
  GET    /api/v1/campaigns
  GET    /api/v1/campaigns/{id}
  PATCH  /api/v1/campaigns/{id}
  DELETE /api/v1/campaigns/{id}
  POST   /api/v1/campaigns/{id}/pause
  POST   /api/v1/campaigns/{id}/resume
  GET    /api/v1/campaigns/{id}/stats
"""
import pytest
from httpx import AsyncClient

CAMPAIGN_PAYLOAD = {
    "name": "Test IT Credential Campaign",
    "description": "Testing phishing awareness for the IT dept",
    "target_department": "IT",
    "urgency_level": "high",
    "attack_vector": "credential harvesting",
}


async def create_campaign(client: AsyncClient, headers: dict, payload: dict = None) -> dict:
    p = payload or CAMPAIGN_PAYLOAD
    r = await client.post("/api/v1/campaigns", json=p, headers=headers)
    assert r.status_code == 201, r.text
    return r.json()


# ── Create ────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_create_campaign(client: AsyncClient, auth_headers: dict):
    data = await create_campaign(client, auth_headers)
    assert data["name"] == CAMPAIGN_PAYLOAD["name"]
    assert data["state"] == "DRAFT"
    assert "id" in data


@pytest.mark.asyncio
async def test_create_campaign_unauthenticated(client: AsyncClient):
    r = await client.post("/api/v1/campaigns", json=CAMPAIGN_PAYLOAD)
    assert r.status_code == 401


@pytest.mark.asyncio
async def test_create_campaign_missing_name(client: AsyncClient, auth_headers: dict):
    r = await client.post("/api/v1/campaigns", json={"description": "no name"}, headers=auth_headers)
    assert r.status_code == 422


# ── List ──────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_list_campaigns(client: AsyncClient, auth_headers: dict):
    await create_campaign(client, auth_headers)
    r = await client.get("/api/v1/campaigns", headers=auth_headers)
    assert r.status_code == 200
    assert isinstance(r.json(), list)
    assert len(r.json()) >= 1


@pytest.mark.asyncio
async def test_list_campaigns_unauthenticated(client: AsyncClient):
    r = await client.get("/api/v1/campaigns")
    assert r.status_code == 401


# ── Get by ID ─────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_get_campaign(client: AsyncClient, auth_headers: dict):
    created = await create_campaign(client, auth_headers)
    r = await client.get(f"/api/v1/campaigns/{created['id']}", headers=auth_headers)
    assert r.status_code == 200
    assert r.json()["id"] == created["id"]


@pytest.mark.asyncio
async def test_get_campaign_not_found(client: AsyncClient, auth_headers: dict):
    fake_id = "00000000-0000-0000-0000-000000000000"
    r = await client.get(f"/api/v1/campaigns/{fake_id}", headers=auth_headers)
    assert r.status_code == 404


# ── Update ────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_update_campaign(client: AsyncClient, auth_headers: dict):
    created = await create_campaign(client, auth_headers)
    r = await client.patch(
        f"/api/v1/campaigns/{created['id']}",
        json={"name": "Updated Name"},
        headers=auth_headers,
    )
    assert r.status_code == 200
    assert r.json()["name"] == "Updated Name"


# ── Delete ────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_delete_campaign(client: AsyncClient, auth_headers: dict):
    created = await create_campaign(client, auth_headers)
    r = await client.delete(f"/api/v1/campaigns/{created['id']}", headers=auth_headers)
    assert r.status_code == 204

    # Verify it's gone
    r2 = await client.get(f"/api/v1/campaigns/{created['id']}", headers=auth_headers)
    assert r2.status_code == 404


# ── Pause / Resume ────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_pause_draft_campaign_fails(client: AsyncClient, auth_headers: dict):
    """Only RUNNING campaigns can be paused."""
    created = await create_campaign(client, auth_headers)
    r = await client.post(f"/api/v1/campaigns/{created['id']}/pause", headers=auth_headers)
    assert r.status_code == 400


@pytest.mark.asyncio
async def test_resume_draft_campaign_fails(client: AsyncClient, auth_headers: dict):
    """Only PAUSED campaigns can be resumed."""
    created = await create_campaign(client, auth_headers)
    r = await client.post(f"/api/v1/campaigns/{created['id']}/resume", headers=auth_headers)
    assert r.status_code == 400


# ── Stats ─────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_campaign_stats_empty(client: AsyncClient, auth_headers: dict):
    created = await create_campaign(client, auth_headers)
    r = await client.get(f"/api/v1/campaigns/{created['id']}/stats", headers=auth_headers)
    assert r.status_code == 200
    stats = r.json()
    assert stats["total_targets"] == 0
    assert stats["emails_sent"] == 0
    assert stats["click_rate"] == 0.0
