"""allow channel with ALL_AREAS

Revision ID: 570ebae96126
Revises: aba7b7e6fe13
Create Date: 2026-08-31 15:21:06.167866

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '570ebae96126'
down_revision = 'aba7b7e6fe13'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.drop_constraint('ck_dashboard_user_areas_all_has_no_channel', 'dashboard_user_areas', type_='check')


def downgrade() -> None:
    op.create_check_constraint(
        'ck_dashboard_user_areas_all_has_no_channel',
        'dashboard_user_areas',
        "area <> 'ALL' OR channel IS NULL"
    )
