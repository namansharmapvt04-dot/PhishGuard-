from __future__ import annotations
from pydantic import BaseModel, Field
from datetime import datetime
from typing import Any
import uuid

from app.models.campaign import CampaignState


class CampaignCreate(BaseModel):
    name: str = Field(..., min_length=2, max_length=255)
    description: str | None = None
    target_department: str | None = None
    urgency_level: str | None = Field(None, pattern="^(low|medium|high)$")
    attack_vector: str | None = None
    scheduled_at: datetime | None = None


class CampaignUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    scheduled_at: datetime | None = None


class CampaignOut(BaseModel):
    id: uuid.UUID
    name: str
    description: str | None
    state: CampaignState
    sender_persona: str | None
    attack_vector: str | None
    target_department: str | None
    urgency_level: str | None
    email_subject: str | None
    email_body: str | None
    email_from_name: str | None
    email_from_address: str | None
    ragas_score: float | None
    retry_count: int
    agent_metadata: dict[str, Any] | None
    scheduled_at: datetime | None
    started_at: datetime | None
    completed_at: datetime | None
    created_at: datetime
    updated_at: datetime
    organization_id: uuid.UUID

    model_config = {"from_attributes": True}


class CampaignStats(BaseModel):
    campaign_id: uuid.UUID
    total_targets: int
    emails_sent: int
    opened: int
    clicked: int
    credentials_submitted: int
    reported: int
    open_rate: float
    click_rate: float
    compromise_rate: float
