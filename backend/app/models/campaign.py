import uuid
from datetime import datetime
from enum import Enum as PyEnum

from sqlalchemy import String, Text, Integer, Float, DateTime, Enum, ForeignKey, JSON, func, Uuid
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class CampaignState(str, PyEnum):
    DRAFT = "DRAFT"
    GENERATING = "GENERATING"
    READY = "READY"
    ESCALATED = "ESCALATED"
    SCHEDULED = "SCHEDULED"
    RUNNING = "RUNNING"
    PAUSED = "PAUSED"
    DONE = "DONE"


class Campaign(Base):
    __tablename__ = "campaigns"

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Campaign configuration
    sender_persona: Mapped[str | None] = mapped_column(String(255), nullable=True)
    attack_vector: Mapped[str | None] = mapped_column(String(100), nullable=True)
    target_department: Mapped[str | None] = mapped_column(String(100), nullable=True)
    urgency_level: Mapped[str | None] = mapped_column(String(20), nullable=True)

    # State machine
    state: Mapped[CampaignState] = mapped_column(
        Enum(CampaignState), default=CampaignState.DRAFT, index=True
    )

    # Generated email content
    email_subject: Mapped[str | None] = mapped_column(String(500), nullable=True)
    email_body: Mapped[str | None] = mapped_column(Text, nullable=True)
    email_from_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    email_from_address: Mapped[str | None] = mapped_column(String(255), nullable=True)

    # Agent pipeline results
    ragas_score: Mapped[float | None] = mapped_column(Float, nullable=True)
    retry_count: Mapped[int] = mapped_column(Integer, default=0)
    agent_metadata: Mapped[dict | None] = mapped_column(JSON, nullable=True)

    # Scheduling
    scheduled_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    # Timestamps
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    # Foreign keys
    organization_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("organizations.id", ondelete="CASCADE"), index=True
    )
    created_by_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )

    # Relationships
    organization: Mapped = relationship("Organization", back_populates="campaigns")
    created_by: Mapped = relationship("User", back_populates="campaigns")
    targets: Mapped[list["Target"]] = relationship("Target", back_populates="campaign", cascade="all, delete-orphan")
    tracking_events: Mapped[list["TrackingEvent"]] = relationship("TrackingEvent", back_populates="campaign")
