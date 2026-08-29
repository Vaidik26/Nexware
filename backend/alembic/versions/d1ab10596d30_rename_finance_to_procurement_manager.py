"""rename finance to procurement manager

Revision ID: d1ab10596d30
Revises: 75589c10ea1b
Create Date: 2026-08-29 14:07:18.341733

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'd1ab10596d30'
down_revision = '75589c10ea1b'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # 1. Drop old check constraint
    op.execute("ALTER TABLE dashboard_users DROP CONSTRAINT ck_dashboard_users_role")
    
    # 2. Update existing rows
    op.execute("UPDATE dashboard_users SET role = 'PROCUREMENT_MANAGER' WHERE role = 'FINANCE'")
    
    # 3. Add new check constraint
    op.execute("ALTER TABLE dashboard_users ADD CONSTRAINT ck_dashboard_users_role CHECK (role IN ('PROCUREMENT_MANAGER', 'MANAGER', 'SALES'))")

def downgrade() -> None:
    op.execute("ALTER TABLE dashboard_users DROP CONSTRAINT ck_dashboard_users_role")
    op.execute("UPDATE dashboard_users SET role = 'FINANCE' WHERE role = 'PROCUREMENT_MANAGER'")
    op.execute("ALTER TABLE dashboard_users ADD CONSTRAINT ck_dashboard_users_role CHECK (role IN ('FINANCE', 'MANAGER', 'SALES'))")
