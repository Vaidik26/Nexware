"""Add pick_list_box_items table

Revision ID: a1b2c3d4e5f6
Revises: 73b56e2529f9
Create Date: 2026-08-18 10:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'a1b2c3d4e5f6'
down_revision = '73b56e2529f9'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        'pick_list_box_items',
        sa.Column('id', sa.Integer(), primary_key=True, index=True),
        sa.Column('box_id', sa.Integer(), sa.ForeignKey('pick_list_boxes.id', ondelete='CASCADE'), nullable=False),
        sa.Column('item_id', sa.Integer(), sa.ForeignKey('pick_list_items.id', ondelete='CASCADE'), nullable=False),
        sa.Column('quantity', sa.Float(), nullable=False),
    )
    op.create_index('ix_pick_list_box_items_box_id', 'pick_list_box_items', ['box_id'])
    op.create_index('ix_pick_list_box_items_item_id', 'pick_list_box_items', ['item_id'])


def downgrade() -> None:
    op.drop_index('ix_pick_list_box_items_item_id', table_name='pick_list_box_items')
    op.drop_index('ix_pick_list_box_items_box_id', table_name='pick_list_box_items')
    op.drop_table('pick_list_box_items')
