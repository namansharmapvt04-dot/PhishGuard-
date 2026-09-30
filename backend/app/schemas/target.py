from __future__ import annotations
from pydantic import BaseModel, EmailStr, Field
from datetime import datetime
import uuid

from app.models.target import TargetStatus


class TargetCreate(BaseModel):
    email: EmailStr
    full_name: str = Field(..., min_length=2, max_length=255)
    department: str | None = None
    job_title: str | None = None
    manager_name: str | None = None


class TargetBulkCreate(BaseModel):
    targets: list[TargetCreate] = Field(..., min_length=1, max_length=500)


class TargetOut(BaseModel):
    id: uuid.UUID
    email: str
    full_name: str
    department: str | None
    job_title: str | None
    manager_name: str | None
    status: TargetStatus
    sent_at: datetime | None
    campaign_id: uuid.UUID
    created_at: datetime

    model_config = {"from_attributes": True}


class TargetActivity(BaseModel):
    target_id: uuid.UUID
    email: str
    full_name: str
    opened: bool
    clicked: bool
    credentials_submitted: bool
    reported: bool
    first_event_at: datetime | None
