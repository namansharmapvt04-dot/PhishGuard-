import uuid
from datetime import datetime
from enum import Enum as PyEnum

from sqlalchemy import String, DateTime, Enum, ForeignKey, func, Uuid
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class EventType(str, PyEnum):
    EMAIL_OPENED = "EMAIL_OPENED"
    LINK_CLICKED = "LINK_CLICKED"
    CREDENTIALS_SUBMITTED = "CREDENTIALS_SUBMITTED"
    ATTACHMENT_OPENED = "ATTACHMENT_OPENED"
    REPORTED_PHISH = "REPORTED_PHISH"


class TrackingEvent(Base):
    __tablename__ = "tracking_events"

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4)

    event_type: Mapped[EventType] = mapped_column(Enum(EventType), nullable=False, index=True)

    # Captured context
    ip_address: Mapped[str | None] = mapped_column(String(45), nullable=True)   # supports IPv6
    user_agent: Mapped[str | None] = mapped_column(String(512), nullable=True)
    geo_country: Mapped[str | None] = mapped_column(String(2), nullable=True)   # ISO 3166-1 alpha-2

    occurred_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), index=True
    )

    # Foreign keys
    campaign_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("campaigns.id", ondelete="CASCADE"), index=True
    )
    target_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("targets.id", ondelete="CASCADE"), index=True
    )

    # Relationships
    campaign: Mapped = relationship("Campaign", back_populates="tracking_events")
    target: Mapped = relationship("Target", back_populates="tracking_events")
