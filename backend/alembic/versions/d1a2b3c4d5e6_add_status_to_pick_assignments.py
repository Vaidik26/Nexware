"""add status to pick_assignments

Revision ID: d1a2b3c4d5e6
Revises: fe378d9d77f4
Create Date: 2026-08-12

Adds a 'status' column to the pick_assignments table so assignment
status ('assigned', 'completed', 'cancelled') is persisted to the DB.
Previously this field was set in application code but had no matching
column in the model, causing SQLAlchemy to silently discard the value.
"""
from alembic import op
import sqlalchemy as sa

# revision identifiers
revision = 'd1a2b3c4d5e6'
down_revision = 'fe378d9d77f4'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        'pick_assignments',
        sa.Column('status', sa.String(), nullable=True, server_default='assigned'),
    )


def downgrade() -> None:
    op.drop_column('pick_assignments', 'status')
