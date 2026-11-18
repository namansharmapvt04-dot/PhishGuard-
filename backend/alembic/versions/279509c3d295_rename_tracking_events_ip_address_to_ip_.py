"""rename tracking_events.ip_address to ip_hash

Revision ID: 279509c3d295
Revises: d9ef57f43a73
Create Date: 2026-11-18 11:40:21.141586

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '279509c3d295'
down_revision: Union[str, None] = 'd9ef57f43a73'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Raw IPs are no longer stored (app/api/tracking.py now hashes with
    # SHA-256 before insert) — widen to fit a 64-char hex digest while
    # renaming. Existing rows had at most a 45-char raw IP in this column;
    # those values are stale/non-hashes and are not migrated in place.
    op.alter_column(
        "tracking_events",
        "ip_address",
        new_column_name="ip_hash",
        type_=sa.String(64),
        existing_type=sa.String(45),
        existing_nullable=True,
    )


def downgrade() -> None:
    op.alter_column(
        "tracking_events",
        "ip_hash",
        new_column_name="ip_address",
        type_=sa.String(45),
        existing_type=sa.String(64),
        existing_nullable=True,
    )
