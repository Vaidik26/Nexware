"""Role-based access for dashboard users: role column + module/area grant tables

Revision ID: b4e7c9d21a08
Revises: a2b3a4726cab
Create Date: 2026-08-27

Gives ``dashboard_users`` the three pieces the hybrid access rule needs:

* ``dashboard_users.role`` — the base role, one of DEV / FINANCE / MANAGER /
  SALES / WAREHOUSE. Supplies the default module and area set.
* ``dashboard_user_modules`` — EXPLICIT module grants. Zero rows means "inherit
  the role default", so there is no marker row for "explicitly nothing"; the
  row count is the flag.
* ``dashboard_user_areas`` — EXPLICIT territory grants, each optionally narrowed
  to one sales channel. ``channel`` NULL means both books.

THE BACKFILL, AND WHY IT IS NOT THE FAIL-CLOSED ROLE. New rows get SALES, whose
default opens nothing — the right default for an account nobody has configured
yet. Rows that ALREADY EXIST are backfilled to MANAGER instead (SALES_DASH,
every territory), because they were created under a build where a dashboard
viewer could open every dashboard in the portal, and SALES would lock every one
of them out on deploy with no warning. MANAGER is the narrowest role that keeps
them doing what they were created to do: read a dashboard.

If that is wider than you want for a particular account, change its role on the
User Management screen — one dropdown per user, and not a judgement a migration
should be making on an operator's behalf.

The server default is set to MANAGER for the duration of the ``ADD COLUMN`` and
then moved to SALES, so the backfill and the fail-closed default do not have to
fight over one value.
"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = 'b4e7c9d21a08'
down_revision = 'a2b3a4726cab'
branch_labels = None
depends_on = None

#: Kept as literals rather than imported from backend.constants on purpose: a
#: migration records what the schema was asked for on the day it ran. Importing
#: the live enum would let a later edit to the application silently rewrite the
#: meaning of an already-applied migration.
_ROLES = ('DEV', 'FINANCE', 'MANAGER', 'SALES', 'WAREHOUSE')
_MODULES = ('SALES_DASH', 'PROCUREMENT', 'USER_ADMIN')
_CHANNELS = ('KEY', 'VAN')
_ALL_AREAS = 'ALL'

_BACKFILL_ROLE = 'MANAGER'
_FAIL_CLOSED_ROLE = 'SALES'


def _in_list(column: str, values: tuple) -> str:
    return f"{column} IN ({', '.join(repr(v) for v in values)})"


def upgrade() -> None:
    # ── The role column ───────────────────────────────────────────────────────
    op.add_column(
        'dashboard_users',
        sa.Column('role', sa.String(), nullable=False, server_default=_BACKFILL_ROLE),
    )
    op.alter_column('dashboard_users', 'role', server_default=_FAIL_CLOSED_ROLE)
    op.create_check_constraint(
        'ck_dashboard_users_role', 'dashboard_users', _in_list('role', _ROLES)
    )

    # ── Explicit module grants ────────────────────────────────────────────────
    op.create_table(
        'dashboard_user_modules',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('module', sa.String(), nullable=False),
        sa.ForeignKeyConstraint(['user_id'], ['dashboard_users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint(
            'user_id', 'module', name='uq_dashboard_user_modules_user_module'
        ),
        sa.CheckConstraint(
            _in_list('module', _MODULES), name='ck_dashboard_user_modules_module'
        ),
    )
    op.create_index(op.f('ix_dashboard_user_modules_id'), 'dashboard_user_modules', ['id'])
    op.create_index(
        op.f('ix_dashboard_user_modules_user_id'), 'dashboard_user_modules', ['user_id']
    )

    # ── Explicit territory grants ─────────────────────────────────────────────
    # `area` is not constrained to a list of names. The nine supervisor areas
    # come from the customer master and are regenerated when it changes, so
    # pinning them in a CHECK would make a legitimately new territory
    # unassignable until the next migration. A typo costs visibility, not
    # secrecy: an area nobody owns matches no customer.
    op.create_table(
        'dashboard_user_areas',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('area', sa.String(), nullable=False),
        sa.Column('channel', sa.String(), nullable=True),
        sa.ForeignKeyConstraint(['user_id'], ['dashboard_users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('user_id', 'area', name='uq_dashboard_user_areas_user_area'),
        sa.CheckConstraint(
            f"channel IS NULL OR {_in_list('channel', _CHANNELS)}",
            name='ck_dashboard_user_areas_channel',
        ),
        # ALL is every area of both books by definition, so pairing it with a
        # channel would be a third, undefined thing. Refused, not reinterpreted.
        sa.CheckConstraint(
            f"area <> '{_ALL_AREAS}' OR channel IS NULL",
            name='ck_dashboard_user_areas_all_has_no_channel',
        ),
        sa.CheckConstraint(
            'length(btrim(area)) > 0', name='ck_dashboard_user_areas_area_not_blank'
        ),
    )
    op.create_index(op.f('ix_dashboard_user_areas_id'), 'dashboard_user_areas', ['id'])
    op.create_index(
        op.f('ix_dashboard_user_areas_user_id'), 'dashboard_user_areas', ['user_id']
    )


def downgrade() -> None:
    """
    Drop the grant tables and the role column.

    Every explicit grant is lost — there is nowhere to put it in the old shape.
    Accounts survive; after a downgrade every dashboard user is back to the
    undifferentiated viewer they were, which is what the old build enforced.
    """
    op.drop_index(op.f('ix_dashboard_user_areas_user_id'), table_name='dashboard_user_areas')
    op.drop_index(op.f('ix_dashboard_user_areas_id'), table_name='dashboard_user_areas')
    op.drop_table('dashboard_user_areas')

    op.drop_index(
        op.f('ix_dashboard_user_modules_user_id'), table_name='dashboard_user_modules'
    )
    op.drop_index(op.f('ix_dashboard_user_modules_id'), table_name='dashboard_user_modules')
    op.drop_table('dashboard_user_modules')

    op.drop_constraint('ck_dashboard_users_role', 'dashboard_users', type_='check')
    op.drop_column('dashboard_users', 'role')
