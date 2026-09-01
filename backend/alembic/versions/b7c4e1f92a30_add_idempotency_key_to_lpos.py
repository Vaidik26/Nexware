"""Add idempotency_key to lpos

Guards against duplicate orders when a mobile client retries a create it never
saw the response to. Nullable, so existing rows and clients that send no
Idempotency-Key header are unaffected.

Revision ID: b7c4e1f92a30
Revises: 570ebae96126
Create Date: 2026-09-01 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'b7c4e1f92a30'
down_revision = '570ebae96126'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('lpos', sa.Column('idempotency_key', sa.String(), nullable=True))
    # Unique so a concurrent duplicate loses at the database rather than relying
    # on the read-then-insert check in create_lpo, which is a race on its own.
    # PostgreSQL treats NULLs as distinct, so unkeyed rows never collide.
    op.create_index(
        op.f('ix_lpos_idempotency_key'),
        'lpos',
        ['idempotency_key'],
        unique=True,
    )


def downgrade() -> None:
    op.drop_index(op.f('ix_lpos_idempotency_key'), table_name='lpos')
    op.drop_column('lpos', 'idempotency_key')
