"""strict role based access remove dev warehouse modules

Revision ID: 75589c10ea1b
Revises: b4e7c9d21a08
Create Date: 2026-08-27

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '75589c10ea1b'
down_revision = 'b4e7c9d21a08'
branch_labels = None
depends_on = None

_OLD_ROLES = ('DEV', 'FINANCE', 'MANAGER', 'SALES', 'WAREHOUSE')
_NEW_ROLES = ('FINANCE', 'MANAGER', 'SALES')

def _in_list(column: str, values: tuple) -> str:
    return f"{column} IN ({', '.join(repr(v) for v in values)})"


def upgrade() -> None:
    # 1. Backfill any existing DEV or WAREHOUSE users
    op.execute("UPDATE dashboard_users SET role = 'MANAGER' WHERE role = 'DEV'")
    op.execute("UPDATE dashboard_users SET role = 'SALES' WHERE role = 'WAREHOUSE'")

    # 2. Update the role check constraint
    op.drop_constraint('ck_dashboard_users_role', 'dashboard_users', type_='check')
    op.create_check_constraint(
        'ck_dashboard_users_role', 'dashboard_users', _in_list('role', _NEW_ROLES)
    )

    # 3. Drop explicit modules table (we are strictly role-based now)
    op.drop_index('ix_dashboard_user_modules_user_id', table_name='dashboard_user_modules')
    op.drop_index('ix_dashboard_user_modules_id', table_name='dashboard_user_modules')
    op.drop_table('dashboard_user_modules')


def downgrade() -> None:
    # 1. Restore the explicit modules table
    op.create_table(
        'dashboard_user_modules',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('module', sa.String(), nullable=False),
        sa.ForeignKeyConstraint(['user_id'], ['dashboard_users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('user_id', 'module', name='uq_dashboard_user_modules_user_module'),
        sa.CheckConstraint(
            _in_list('module', ('SALES_DASH', 'PROCUREMENT', 'USER_ADMIN')), 
            name='ck_dashboard_user_modules_module'
        ),
    )
    op.create_index('ix_dashboard_user_modules_id', 'dashboard_user_modules', ['id'])
    op.create_index('ix_dashboard_user_modules_user_id', 'dashboard_user_modules', ['user_id'])

    # 2. Revert the role check constraint
    op.drop_constraint('ck_dashboard_users_role', 'dashboard_users', type_='check')
    op.create_check_constraint(
        'ck_dashboard_users_role', 'dashboard_users', _in_list('role', _OLD_ROLES)
    )
