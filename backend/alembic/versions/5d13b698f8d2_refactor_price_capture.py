"""refactor_price_capture

Revision ID: 5d13b698f8d2
Revises: 625ba9e9ff0f
Create Date: 2026-08-20 14:34:48.810584

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '5d13b698f8d2'
down_revision = '625ba9e9ff0f'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Drop old tables
    op.drop_table('dubai_prices')
    op.drop_table('international_prices')

    # Add columns to raw_materials
    # op.add_column('raw_materials', sa.Column('category', sa.String(), nullable=False, server_default='Uncategorized'))
    # op.add_column('raw_materials', sa.Column('market_type', sa.String(), nullable=False, server_default='BOTH'))

    # Create captured_prices table
    op.create_table(
        'captured_prices',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('material_id', sa.Integer(), nullable=False),
        sa.Column('date', sa.Date(), nullable=False),
        sa.Column('currency', sa.String(), nullable=False),
        sa.Column('local_price', sa.Float(), nullable=True),
        sa.Column('fob_price', sa.Float(), nullable=True),
        sa.Column('cif_price', sa.Float(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
        sa.ForeignKeyConstraint(['material_id'], ['raw_materials.id'], ),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('material_id', 'date', name='uq_captured_price_date')
    )
    op.create_index(op.f('ix_captured_prices_id'), 'captured_prices', ['id'], unique=False)

def downgrade() -> None:
    # Drop captured_prices table
    op.drop_index(op.f('ix_captured_prices_id'), table_name='captured_prices')
    op.drop_table('captured_prices')

    # Remove columns from raw_materials
    op.drop_column('raw_materials', 'market_type')
    op.drop_column('raw_materials', 'category')

    # Recreate old tables (simplified for downgrade)
    op.create_table(
        'dubai_prices',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('material_id', sa.Integer(), nullable=False),
        sa.Column('date', sa.Date(), nullable=False),
        sa.Column('local_market_price', sa.Float(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
        sa.ForeignKeyConstraint(['material_id'], ['raw_materials.id'], ),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('material_id', 'date', name='uq_dubai_price_date')
    )
    op.create_table(
        'international_prices',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('material_id', sa.Integer(), nullable=False),
        sa.Column('date', sa.Date(), nullable=False),
        sa.Column('fob_price', sa.Float(), nullable=False),
        sa.Column('cif_price', sa.Float(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
        sa.ForeignKeyConstraint(['material_id'], ['raw_materials.id'], ),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('material_id', 'date', name='uq_intl_price_date')
    )
