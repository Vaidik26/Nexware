"""Modular user tables, FK enforcement, and ghost code removal

Revision ID: a2b3a4726cab
Revises: 5d13b698f8d2
Create Date: 2026-08-26 13:39:29.731790

Started from ``alembic revision --autogenerate`` and then corrected by hand. The
generated version could not run:

* It dropped ``pick_list_items`` and ``pick_list_boxes`` before
  ``pick_list_box_items``, and ``users`` before the ``lpos`` foreign keys that
  referenced it. PostgreSQL refuses both. Drops here go children-first.
* It added ``lpos.internal_ref``, ``lpos.customer_id`` and
  ``notifications.picker_id`` as NOT NULL columns with no default, which aborts
  on the first existing row.
* It dropped and recreated ``sales_items`` and ``users``, discarding the item
  master and every account.

MASTER DATA IS PRESERVED. The two populated tables that change shape are
migrated in place rather than rebuilt:

* ``sales_items`` is RENAMEd to ``products`` with its columns, indexes and id
  sequence renamed alongside. Every row, and every id, survives untouched.
* ``users`` is split by ``role`` into the four persona tables with an
  INSERT..SELECT that carries the bcrypt hashes across, so existing passwords
  keep working. Pickers and sales reps get their email as ``username``, which is
  one of the two identifiers the old login already accepted — nobody has to
  change how they sign in. Only after the backfill is ``users`` dropped.

``customers``, ``raw_materials``, ``captured_prices`` and ``carton_types`` are
not touched at all beyond one added index.

The picklist family and ``lpos`` ARE dropped and recreated. They were verified
empty before this was written; if that is no longer true, stop and write the
backfill first.

``notifications`` is dropped and NOT recreated. The in-app feed is retired in
favour of the WebSocket channel; Expo push survives on ``picker_users.push_token``.
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = 'a2b3a4726cab'
down_revision = '5d13b698f8d2'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ── Drop the old shape, children before parents ───────────────────────────
    op.drop_index(op.f('ix_pick_list_box_items_box_id'), table_name='pick_list_box_items')
    op.drop_index(op.f('ix_pick_list_box_items_id'), table_name='pick_list_box_items')
    op.drop_index(op.f('ix_pick_list_box_items_item_id'), table_name='pick_list_box_items')
    op.drop_table('pick_list_box_items')

    op.drop_index(op.f('ix_pick_list_items_id'), table_name='pick_list_items')
    op.drop_table('pick_list_items')

    op.drop_index(op.f('ix_pick_list_boxes_id'), table_name='pick_list_boxes')
    op.drop_table('pick_list_boxes')

    op.drop_index(op.f('ix_pick_assignments_id'), table_name='pick_assignments')
    op.drop_table('pick_assignments')

    op.drop_index(op.f('ix_pick_lists_id'), table_name='pick_lists')
    op.drop_table('pick_lists')

    # lpos and notifications both reference users and both change shape enough
    # that an in-place ALTER cannot express it.
    op.drop_index(op.f('ix_lpos_id'), table_name='lpos')
    op.drop_index(op.f('ix_lpos_lpo_number'), table_name='lpos')
    op.drop_table('lpos')

    op.drop_index(op.f('ix_notifications_id'), table_name='notifications')
    op.drop_index(op.f('ix_notifications_user_id'), table_name='notifications')
    op.drop_table('notifications')

    # ── sales_items → products, in place ──────────────────────────────────────
    # A rename keeps all 228 rows, the primary key values and the sequence
    # position. Rebuilding the table would have thrown the item master away.
    op.rename_table('sales_items', 'products')
    op.alter_column('products', 'item_number', new_column_name='product_code')
    op.alter_column('products', 'item_name', new_column_name='name')
    op.execute('ALTER INDEX ix_sales_items_id RENAME TO ix_products_id')
    op.execute('ALTER INDEX ix_sales_items_item_number RENAME TO ix_products_product_code')
    op.execute('ALTER INDEX ix_sales_items_primary_barcode RENAME TO ix_products_primary_barcode')
    op.execute('ALTER INDEX ix_sales_items_secondary_barcode RENAME TO ix_products_secondary_barcode')
    op.execute('ALTER SEQUENCE sales_items_id_seq RENAME TO products_id_seq')

    # ── The four persona tables ───────────────────────────────────────────────
    op.create_table(
        'admin_users',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('email', sa.String(), nullable=False),
        sa.Column('full_name', sa.String(), nullable=False),
        sa.Column('hashed_password', sa.String(), nullable=False),
        sa.Column('is_active', sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_admin_users_email'), 'admin_users', ['email'], unique=True)
    op.create_index(op.f('ix_admin_users_id'), 'admin_users', ['id'], unique=False)

    op.create_table(
        'picker_users',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('username', sa.String(), nullable=False),
        sa.Column('full_name', sa.String(), nullable=False),
        sa.Column('hashed_password', sa.String(), nullable=False),
        sa.Column('is_available', sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column('is_active', sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column('push_token', sa.String(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_picker_users_id'), 'picker_users', ['id'], unique=False)
    op.create_index(op.f('ix_picker_users_username'), 'picker_users', ['username'], unique=True)

    op.create_table(
        'sales_users',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('username', sa.String(), nullable=False),
        sa.Column('display_name', sa.String(), nullable=False),
        sa.Column('emp_id', sa.String(), nullable=True),
        sa.Column('phone', sa.String(), nullable=True),
        sa.Column('hashed_password', sa.String(), nullable=False),
        sa.Column('is_active', sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column('last_login_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_sales_users_emp_id'), 'sales_users', ['emp_id'], unique=False)
    op.create_index(op.f('ix_sales_users_id'), 'sales_users', ['id'], unique=False)
    op.create_index(op.f('ix_sales_users_username'), 'sales_users', ['username'], unique=True)

    op.create_table(
        'dashboard_users',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('email', sa.String(), nullable=False),
        sa.Column('full_name', sa.String(), nullable=False),
        sa.Column('hashed_password', sa.String(), nullable=False),
        sa.Column('is_active', sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_dashboard_users_email'), 'dashboard_users', ['email'], unique=True)
    op.create_index(op.f('ix_dashboard_users_id'), 'dashboard_users', ['id'], unique=False)

    # ── Carry the existing accounts across, then retire `users` ───────────────
    # bcrypt hashes move verbatim, so everyone's current password still works.
    # Pickers and sales reps take their email as `username`: the old login
    # accepted either email or full_name, so this keeps every existing sign-in
    # working unchanged. Rename them later via PATCH /pickers/{id} if you want
    # shorter handles.
    #
    # COALESCE on the boolean flags because they were nullable on `users` and
    # are NOT NULL here. Rows without a password hash cannot log in and are not
    # carried over.
    op.execute(
        """
        INSERT INTO admin_users (email, full_name, hashed_password, is_active, created_at)
        SELECT email, full_name, hashed_password, COALESCE(is_active, true), created_at
        FROM users
        WHERE role = 'admin' AND hashed_password IS NOT NULL AND email IS NOT NULL
        """
    )
    op.execute(
        """
        INSERT INTO picker_users
            (username, full_name, hashed_password, is_available, is_active, push_token, created_at)
        SELECT COALESCE(email, full_name), full_name, hashed_password,
               COALESCE(is_available, true), COALESCE(is_active, true), push_token, created_at
        FROM users
        WHERE role = 'picker' AND hashed_password IS NOT NULL
        """
    )
    op.execute(
        """
        INSERT INTO sales_users
            (username, display_name, hashed_password, is_active, created_at)
        SELECT COALESCE(email, full_name), full_name, hashed_password,
               COALESCE(is_active, true), created_at
        FROM users
        WHERE role IN ('sales_person', 'sales') AND hashed_password IS NOT NULL
        """
    )

    op.drop_index(op.f('ix_users_email'), table_name='users')
    op.drop_index(op.f('ix_users_id'), table_name='users')
    op.drop_table('users')

    # `notifications` is dropped above and deliberately NOT recreated. The
    # in-app feed is retired: live updates now go over the WebSocket, and Expo
    # push (which still reaches a closed app) needs only the push_token column
    # on picker_users.

    # ── LPOs ──────────────────────────────────────────────────────────────────
    op.create_table(
        'lpos',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('lpo_number', sa.String(), nullable=False),
        sa.Column('internal_ref', sa.String(), nullable=False),
        sa.Column('customer_id', sa.Integer(), nullable=False),
        sa.Column('sales_person_id', sa.Integer(), nullable=True),
        sa.Column('created_by_admin_id', sa.Integer(), nullable=True),
        sa.Column('signed_lpo_url', sa.String(), nullable=True),
        sa.Column('status', sa.String(), nullable=True, server_default='pending'),
        sa.Column('source', sa.String(), nullable=True, server_default='upload'),
        sa.Column('delivery_date', sa.DateTime(timezone=True), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
        sa.ForeignKeyConstraint(['customer_id'], ['customers.id'], ),
        sa.ForeignKeyConstraint(['sales_person_id'], ['sales_users.id'], ),
        sa.ForeignKeyConstraint(['created_by_admin_id'], ['admin_users.id'], ),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_lpos_id'), 'lpos', ['id'], unique=False)
    op.create_index(op.f('ix_lpos_lpo_number'), 'lpos', ['lpo_number'], unique=True)
    op.create_index(op.f('ix_lpos_internal_ref'), 'lpos', ['internal_ref'], unique=True)
    op.create_index(op.f('ix_lpos_customer_id'), 'lpos', ['customer_id'], unique=False)
    op.create_index(op.f('ix_lpos_sales_person_id'), 'lpos', ['sales_person_id'], unique=False)
    op.create_index(op.f('ix_lpos_created_by_admin_id'), 'lpos', ['created_by_admin_id'], unique=False)

    op.create_table(
        'lpo_items',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('lpo_id', sa.Integer(), nullable=False),
        sa.Column('product_id', sa.Integer(), nullable=True),
        sa.Column('barcode', sa.String(), nullable=False),
        sa.Column('description', sa.String(), nullable=True),
        sa.Column('quantity', sa.Float(), nullable=False),
        sa.Column('unit', sa.String(), nullable=False),
        sa.ForeignKeyConstraint(['lpo_id'], ['lpos.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['product_id'], ['products.id'], ),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_lpo_items_barcode'), 'lpo_items', ['barcode'], unique=False)
    op.create_index(op.f('ix_lpo_items_id'), 'lpo_items', ['id'], unique=False)
    op.create_index(op.f('ix_lpo_items_lpo_id'), 'lpo_items', ['lpo_id'], unique=False)
    op.create_index(op.f('ix_lpo_items_product_id'), 'lpo_items', ['product_id'], unique=False)

    # ── Picking ───────────────────────────────────────────────────────────────
    op.create_table(
        'picklists',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('picklist_number', sa.String(), nullable=False),
        sa.Column('order_number', sa.String(), nullable=False),
        sa.Column('customer_id', sa.Integer(), nullable=False),
        sa.Column('sales_order_id', sa.Integer(), nullable=True),
        sa.Column('sales_person_id', sa.Integer(), nullable=True),
        sa.Column('status', sa.String(), nullable=True, server_default='draft'),
        sa.Column('picker_job_number', sa.Integer(), nullable=True),
        sa.Column('delivery_date', sa.DateTime(timezone=True), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
        sa.Column('active_box_carton_id', sa.Integer(), nullable=True),
        sa.Column('active_box_contents', postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.ForeignKeyConstraint(['active_box_carton_id'], ['carton_types.id'], ),
        sa.ForeignKeyConstraint(['customer_id'], ['customers.id'], ),
        sa.ForeignKeyConstraint(['sales_order_id'], ['sales_orders.id'], ),
        sa.ForeignKeyConstraint(['sales_person_id'], ['sales_users.id'], ),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_picklists_active_box_carton_id'), 'picklists', ['active_box_carton_id'], unique=False)
    op.create_index(op.f('ix_picklists_customer_id'), 'picklists', ['customer_id'], unique=False)
    op.create_index(op.f('ix_picklists_id'), 'picklists', ['id'], unique=False)
    op.create_index(op.f('ix_picklists_picklist_number'), 'picklists', ['picklist_number'], unique=True)
    op.create_index(op.f('ix_picklists_sales_order_id'), 'picklists', ['sales_order_id'], unique=False)
    op.create_index(op.f('ix_picklists_sales_person_id'), 'picklists', ['sales_person_id'], unique=False)

    # picklist_boxes before picklist_items: items carry a box_id FK.
    op.create_table(
        'picklist_boxes',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('picklist_id', sa.Integer(), nullable=False),
        sa.Column('carton_type_id', sa.Integer(), nullable=False),
        sa.Column('entered_weight', sa.Float(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
        sa.Column('is_audited', sa.Boolean(), nullable=True, server_default=sa.false()),
        sa.ForeignKeyConstraint(['carton_type_id'], ['carton_types.id'], ),
        sa.ForeignKeyConstraint(['picklist_id'], ['picklists.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_picklist_boxes_carton_type_id'), 'picklist_boxes', ['carton_type_id'], unique=False)
    op.create_index(op.f('ix_picklist_boxes_id'), 'picklist_boxes', ['id'], unique=False)
    op.create_index(op.f('ix_picklist_boxes_picklist_id'), 'picklist_boxes', ['picklist_id'], unique=False)

    op.create_table(
        'picklist_items',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('picklist_id', sa.Integer(), nullable=False),
        sa.Column('product_id', sa.Integer(), nullable=False),
        sa.Column('barcode', sa.String(), nullable=False),
        sa.Column('quantity', sa.Float(), nullable=False),
        sa.Column('picked_quantity', sa.Float(), nullable=True, server_default=sa.text('0.0')),
        sa.Column('unit', sa.String(), nullable=False),
        sa.Column('is_picked', sa.Boolean(), nullable=True, server_default=sa.false()),
        sa.Column('picked_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('is_audited', sa.Boolean(), nullable=True, server_default=sa.false()),
        sa.Column('is_full_carton', sa.Boolean(), nullable=True, server_default=sa.true()),
        sa.Column('box_id', sa.Integer(), nullable=True),
        sa.Column('missing_reported', sa.Boolean(), nullable=True, server_default=sa.false()),
        sa.Column('missing_approved', sa.Boolean(), nullable=True),
        sa.Column('bin_location', sa.String(), nullable=True),
        sa.ForeignKeyConstraint(['box_id'], ['picklist_boxes.id'], ),
        sa.ForeignKeyConstraint(['picklist_id'], ['picklists.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['product_id'], ['products.id'], ),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_picklist_items_barcode'), 'picklist_items', ['barcode'], unique=False)
    op.create_index(op.f('ix_picklist_items_box_id'), 'picklist_items', ['box_id'], unique=False)
    op.create_index(op.f('ix_picklist_items_id'), 'picklist_items', ['id'], unique=False)
    op.create_index(op.f('ix_picklist_items_picklist_id'), 'picklist_items', ['picklist_id'], unique=False)
    op.create_index(op.f('ix_picklist_items_product_id'), 'picklist_items', ['product_id'], unique=False)

    op.create_table(
        'picklist_box_items',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('box_id', sa.Integer(), nullable=False),
        sa.Column('item_id', sa.Integer(), nullable=False),
        sa.Column('quantity', sa.Float(), nullable=False),
        sa.ForeignKeyConstraint(['box_id'], ['picklist_boxes.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['item_id'], ['picklist_items.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_picklist_box_items_box_id'), 'picklist_box_items', ['box_id'], unique=False)
    op.create_index(op.f('ix_picklist_box_items_id'), 'picklist_box_items', ['id'], unique=False)
    op.create_index(op.f('ix_picklist_box_items_item_id'), 'picklist_box_items', ['item_id'], unique=False)

    op.create_table(
        'picklist_assignments',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('picklist_id', sa.Integer(), nullable=False),
        sa.Column('picker_id', sa.Integer(), nullable=False),
        sa.Column('assigned_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
        sa.Column('completed_at', sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(['picker_id'], ['picker_users.id'], ),
        sa.ForeignKeyConstraint(['picklist_id'], ['picklists.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_picklist_assignments_id'), 'picklist_assignments', ['id'], unique=False)
    op.create_index(op.f('ix_picklist_assignments_picker_id'), 'picklist_assignments', ['picker_id'], unique=False)
    op.create_index(op.f('ix_picklist_assignments_picklist_id'), 'picklist_assignments', ['picklist_id'], unique=False)

    # ── Kept tables: index and NOT NULL tightening ────────────────────────────
    op.create_index(op.f('ix_captured_prices_material_id'), 'captured_prices', ['material_id'], unique=False)
    op.alter_column('raw_materials', 'category', existing_type=sa.VARCHAR(), nullable=False)
    op.alter_column('raw_materials', 'market_type', existing_type=sa.VARCHAR(), nullable=False)


def downgrade() -> None:
    """
    Reverse the schema change.

    The item master survives a round trip — ``products`` is renamed back rather
    than rebuilt. Accounts are rebuilt from the four persona tables before those
    are dropped, so logins survive too. What cannot come back is anything
    written to the new picklist/LPO tables after the upgrade; those are dropped.
    """
    op.alter_column('raw_materials', 'market_type', existing_type=sa.VARCHAR(), nullable=True)
    op.alter_column('raw_materials', 'category', existing_type=sa.VARCHAR(), nullable=True)
    op.drop_index(op.f('ix_captured_prices_material_id'), table_name='captured_prices')

    # Children before parents.
    for table in (
        'picklist_assignments',
        'picklist_box_items',
        'picklist_items',
        'picklist_boxes',
        'picklists',
        'lpo_items',
        'lpos',
    ):
        op.drop_table(table)

    # ── products → sales_items, in place ──────────────────────────────────────
    op.execute('ALTER SEQUENCE products_id_seq RENAME TO sales_items_id_seq')
    op.execute('ALTER INDEX ix_products_secondary_barcode RENAME TO ix_sales_items_secondary_barcode')
    op.execute('ALTER INDEX ix_products_primary_barcode RENAME TO ix_sales_items_primary_barcode')
    op.execute('ALTER INDEX ix_products_product_code RENAME TO ix_sales_items_item_number')
    op.execute('ALTER INDEX ix_products_id RENAME TO ix_sales_items_id')
    op.alter_column('products', 'name', new_column_name='item_name')
    op.alter_column('products', 'product_code', new_column_name='item_number')
    op.rename_table('products', 'sales_items')

    # ── Rebuild `users` from the persona tables, then drop them ───────────────
    op.create_table(
        'users',
        sa.Column('id', sa.INTEGER(), autoincrement=True, nullable=False),
        sa.Column('email', sa.VARCHAR(), nullable=True),
        sa.Column('full_name', sa.VARCHAR(), nullable=False),
        sa.Column('role', sa.VARCHAR(), nullable=False),
        sa.Column('hashed_password', sa.VARCHAR(), nullable=True),
        sa.Column('picker_pin_hash', sa.VARCHAR(), nullable=True),
        sa.Column('is_available', sa.BOOLEAN(), nullable=True),
        sa.Column('is_active', sa.BOOLEAN(), nullable=True),
        sa.Column('push_token', sa.VARCHAR(), nullable=True),
        sa.Column('created_at', postgresql.TIMESTAMP(timezone=True), server_default=sa.text('now()'), nullable=True),
        sa.PrimaryKeyConstraint('id', name=op.f('users_pkey')),
    )
    op.create_index(op.f('ix_users_id'), 'users', ['id'], unique=False)
    op.create_index(op.f('ix_users_email'), 'users', ['email'], unique=True)

    op.execute(
        """
        INSERT INTO users (email, full_name, role, hashed_password, is_active, created_at)
        SELECT email, full_name, 'admin', hashed_password, is_active, created_at
        FROM admin_users
        """
    )
    op.execute(
        """
        INSERT INTO users
            (email, full_name, role, hashed_password, is_available, is_active, push_token, created_at)
        SELECT username, full_name, 'picker', hashed_password,
               is_available, is_active, push_token, created_at
        FROM picker_users
        """
    )
    op.execute(
        """
        INSERT INTO users (email, full_name, role, hashed_password, is_active, created_at)
        SELECT username, display_name, 'sales_person', hashed_password, is_active, created_at
        FROM sales_users
        """
    )

    for table in ('admin_users', 'picker_users', 'sales_users', 'dashboard_users'):
        op.drop_table(table)

    op.create_table(
        'notifications',
        sa.Column('id', sa.INTEGER(), autoincrement=True, nullable=False),
        sa.Column('user_id', sa.INTEGER(), nullable=True),
        sa.Column('type', sa.VARCHAR(), nullable=True),
        sa.Column('title', sa.VARCHAR(), nullable=True),
        sa.Column('message', sa.VARCHAR(), nullable=True),
        sa.Column('is_read', sa.BOOLEAN(), nullable=True),
        sa.Column('created_at', postgresql.TIMESTAMP(timezone=True), server_default=sa.text('now()'), nullable=True),
        sa.PrimaryKeyConstraint('id', name=op.f('notifications_pkey')),
    )
    op.create_index(op.f('ix_notifications_id'), 'notifications', ['id'], unique=False)
    op.create_index(op.f('ix_notifications_user_id'), 'notifications', ['user_id'], unique=False)

    op.create_table(
        'lpos',
        sa.Column('id', sa.INTEGER(), autoincrement=True, nullable=False),
        sa.Column('lpo_number', sa.VARCHAR(), nullable=False),
        sa.Column('customer_name', sa.VARCHAR(), nullable=False),
        sa.Column('sales_person_id', sa.INTEGER(), nullable=True),
        sa.Column('items', postgresql.JSON(astext_type=sa.Text()), nullable=False),
        sa.Column('signed_lpo_url', sa.VARCHAR(), nullable=True),
        sa.Column('status', sa.VARCHAR(), nullable=True),
        sa.Column('source', sa.VARCHAR(), nullable=True),
        sa.Column('delivery_date', postgresql.TIMESTAMP(timezone=True), nullable=True),
        sa.Column('created_at', postgresql.TIMESTAMP(timezone=True), server_default=sa.text('now()'), nullable=True),
        sa.Column('created_by_id', sa.INTEGER(), nullable=True),
        sa.ForeignKeyConstraint(['sales_person_id'], ['users.id'], name=op.f('lpos_sales_person_id_fkey')),
        sa.ForeignKeyConstraint(['created_by_id'], ['users.id'], name=op.f('lpos_created_by_id_fkey')),
        sa.PrimaryKeyConstraint('id', name=op.f('lpos_pkey')),
    )
    op.create_index(op.f('ix_lpos_id'), 'lpos', ['id'], unique=False)
    op.create_index(op.f('ix_lpos_lpo_number'), 'lpos', ['lpo_number'], unique=True)

    op.create_table(
        'pick_lists',
        sa.Column('id', sa.INTEGER(), autoincrement=True, nullable=False),
        sa.Column('order_number', sa.VARCHAR(), nullable=False),
        sa.Column('customer_name', sa.VARCHAR(), nullable=False),
        sa.Column('sales_order_id', sa.INTEGER(), nullable=True),
        sa.Column('sales_person_id', sa.INTEGER(), nullable=True),
        sa.Column('status', sa.VARCHAR(), nullable=True),
        sa.Column('picker_job_number', sa.INTEGER(), nullable=True),
        sa.Column('delivery_date', postgresql.TIMESTAMP(timezone=True), nullable=True),
        sa.Column('created_at', postgresql.TIMESTAMP(timezone=True), server_default=sa.text('now()'), nullable=True),
        sa.Column('active_box_carton_id', sa.INTEGER(), nullable=True),
        sa.Column('active_box_contents', postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.ForeignKeyConstraint(['active_box_carton_id'], ['carton_types.id'], name=op.f('pick_lists_active_box_carton_id_fkey')),
        sa.ForeignKeyConstraint(['sales_order_id'], ['sales_orders.id'], name=op.f('pick_lists_sales_order_id_fkey')),
        sa.ForeignKeyConstraint(['sales_person_id'], ['users.id'], name=op.f('pick_lists_sales_person_id_fkey')),
        sa.PrimaryKeyConstraint('id', name=op.f('pick_lists_pkey')),
    )
    op.create_index(op.f('ix_pick_lists_id'), 'pick_lists', ['id'], unique=False)

    op.create_table(
        'pick_list_boxes',
        sa.Column('id', sa.INTEGER(), autoincrement=True, nullable=False),
        sa.Column('pick_list_id', sa.INTEGER(), nullable=False),
        sa.Column('carton_type_id', sa.INTEGER(), nullable=False),
        sa.Column('entered_weight', sa.DOUBLE_PRECISION(precision=53), nullable=False),
        sa.Column('created_at', postgresql.TIMESTAMP(timezone=True), server_default=sa.text('now()'), nullable=True),
        sa.Column('is_audited', sa.BOOLEAN(), server_default=sa.text('false'), nullable=True),
        sa.ForeignKeyConstraint(['carton_type_id'], ['carton_types.id'], name=op.f('pick_list_boxes_carton_type_id_fkey')),
        sa.ForeignKeyConstraint(['pick_list_id'], ['pick_lists.id'], name=op.f('pick_list_boxes_pick_list_id_fkey')),
        sa.PrimaryKeyConstraint('id', name=op.f('pick_list_boxes_pkey')),
    )
    op.create_index(op.f('ix_pick_list_boxes_id'), 'pick_list_boxes', ['id'], unique=False)

    op.create_table(
        'pick_list_items',
        sa.Column('id', sa.INTEGER(), autoincrement=True, nullable=False),
        sa.Column('pick_list_id', sa.INTEGER(), nullable=False),
        sa.Column('barcode', sa.VARCHAR(), nullable=False),
        sa.Column('product_name', sa.VARCHAR(), nullable=False),
        sa.Column('quantity', sa.DOUBLE_PRECISION(precision=53), nullable=False),
        sa.Column('picked_quantity', sa.DOUBLE_PRECISION(precision=53), server_default=sa.text('0.0'), nullable=True),
        sa.Column('unit', sa.VARCHAR(), nullable=False),
        sa.Column('is_picked', sa.BOOLEAN(), nullable=True),
        sa.Column('picked_at', postgresql.TIMESTAMP(timezone=True), nullable=True),
        sa.Column('is_audited', sa.BOOLEAN(), server_default=sa.text('false'), nullable=True),
        sa.Column('is_full_carton', sa.BOOLEAN(), server_default=sa.text('true'), nullable=True),
        sa.Column('box_id', sa.INTEGER(), nullable=True),
        sa.Column('missing_reported', sa.BOOLEAN(), server_default=sa.text('false'), nullable=True),
        sa.Column('missing_approved', sa.BOOLEAN(), nullable=True),
        sa.Column('bin_location', sa.VARCHAR(), nullable=True),
        sa.ForeignKeyConstraint(['box_id'], ['pick_list_boxes.id'], name=op.f('pick_list_items_box_id_fkey')),
        sa.ForeignKeyConstraint(['pick_list_id'], ['pick_lists.id'], name=op.f('pick_list_items_pick_list_id_fkey')),
        sa.PrimaryKeyConstraint('id', name=op.f('pick_list_items_pkey')),
    )
    op.create_index(op.f('ix_pick_list_items_id'), 'pick_list_items', ['id'], unique=False)

    op.create_table(
        'pick_list_box_items',
        sa.Column('id', sa.INTEGER(), autoincrement=True, nullable=False),
        sa.Column('box_id', sa.INTEGER(), nullable=False),
        sa.Column('item_id', sa.INTEGER(), nullable=False),
        sa.Column('quantity', sa.DOUBLE_PRECISION(precision=53), nullable=False),
        sa.ForeignKeyConstraint(['box_id'], ['pick_list_boxes.id'], name=op.f('pick_list_box_items_box_id_fkey'), ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['item_id'], ['pick_list_items.id'], name=op.f('pick_list_box_items_item_id_fkey'), ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id', name=op.f('pick_list_box_items_pkey')),
    )
    op.create_index(op.f('ix_pick_list_box_items_box_id'), 'pick_list_box_items', ['box_id'], unique=False)
    op.create_index(op.f('ix_pick_list_box_items_id'), 'pick_list_box_items', ['id'], unique=False)
    op.create_index(op.f('ix_pick_list_box_items_item_id'), 'pick_list_box_items', ['item_id'], unique=False)

    op.create_table(
        'pick_assignments',
        sa.Column('id', sa.INTEGER(), autoincrement=True, nullable=False),
        sa.Column('pick_list_id', sa.INTEGER(), nullable=False),
        sa.Column('picker_id', sa.INTEGER(), nullable=False),
        sa.Column('assigned_at', postgresql.TIMESTAMP(timezone=True), server_default=sa.text('now()'), nullable=True),
        sa.Column('completed_at', postgresql.TIMESTAMP(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(['pick_list_id'], ['pick_lists.id'], name=op.f('pick_assignments_pick_list_id_fkey')),
        sa.ForeignKeyConstraint(['picker_id'], ['users.id'], name=op.f('pick_assignments_picker_id_fkey')),
        sa.PrimaryKeyConstraint('id', name=op.f('pick_assignments_pkey')),
    )
    op.create_index(op.f('ix_pick_assignments_id'), 'pick_assignments', ['id'], unique=False)
