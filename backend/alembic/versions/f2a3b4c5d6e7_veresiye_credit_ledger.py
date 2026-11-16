"""Veresiye (cari hesap) ve borç takip tabloları.

Kurumsal veresiye (credit_companies, credit_vehicles, credit_drivers), bireysel
veresiye (credit_customers), cari defter (credit_sales, credit_payments) ve
yüklenen belgeler (credit_documents). Mevcut tablolara dokunmaz.

Revision ID: f2a3b4c5d6e7
Revises: e1f2a3b4c5d6
"""

from alembic import op
import sqlalchemy as sa

revision = "f2a3b4c5d6e7"
down_revision = "e1f2a3b4c5d6"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table('credit_companies',
    sa.Column('id', sa.UUID(), nullable=False),
    sa.Column('station_id', sa.UUID(), nullable=False, comment='Anlaşmanın yapıldığı istasyon'),
    sa.Column('name', sa.String(length=255), nullable=False, comment='Şirket adı / unvanı'),
    sa.Column('tax_number', sa.String(length=20), nullable=True, comment='Vergi kimlik numarası'),
    sa.Column('tax_office', sa.String(length=100), nullable=True, comment='Vergi dairesi'),
    sa.Column('address', sa.String(length=500), nullable=True),
    sa.Column('contact_name', sa.String(length=255), nullable=True, comment='Yetkili kişi'),
    sa.Column('phone', sa.String(length=20), nullable=True),
    sa.Column('email', sa.String(length=255), nullable=True),
    sa.Column('is_authorized', sa.Boolean(), nullable=False, comment='Veresiye yakıt alım yetkisi açık mı'),
    sa.Column('authorization_ended_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('authorization_ended_by', sa.UUID(), nullable=True),
    sa.Column('authorization_end_reason', sa.String(length=500), nullable=True),
    sa.Column('credit_limit', sa.Numeric(precision=14, scale=2), nullable=True, comment='Opsiyonel kredi limiti (TL); NULL = limitsiz'),
    sa.Column('payment_term_days', sa.Integer(), nullable=True, comment='Opsiyonel ödeme vadesi (gün); NULL = vadesiz'),
    sa.Column('notes', sa.Text(), nullable=True),
    sa.Column('created_by', sa.UUID(), nullable=True),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.CheckConstraint('credit_limit IS NULL OR credit_limit >= 0', name='ck_credit_companies_limit'),
    sa.CheckConstraint('payment_term_days IS NULL OR (payment_term_days >= 1 AND payment_term_days <= 365)', name='ck_credit_companies_term'),
    sa.ForeignKeyConstraint(['authorization_ended_by'], ['users.id'], ondelete='SET NULL'),
    sa.ForeignKeyConstraint(['created_by'], ['users.id'], ondelete='SET NULL'),
    sa.ForeignKeyConstraint(['station_id'], ['stations.id'], ondelete='RESTRICT'),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_credit_companies_station_id'), 'credit_companies', ['station_id'], unique=False)
    op.create_index('uq_credit_companies_station_tax', 'credit_companies', ['station_id', 'tax_number'], unique=True, postgresql_where=sa.text('tax_number IS NOT NULL'))
    op.create_table('credit_documents',
    sa.Column('id', sa.UUID(), nullable=False),
    sa.Column('station_id', sa.UUID(), nullable=False),
    sa.Column('kind', sa.String(length=20), nullable=False, comment='receipt | id_photo'),
    sa.Column('content_type', sa.String(length=100), nullable=False),
    sa.Column('size_bytes', sa.Integer(), nullable=False, comment='Şifrelenmemiş dosya boyutu'),
    sa.Column('sha256', sa.String(length=64), nullable=False, comment='Şifrelenmemiş içeriğin SHA-256 özeti'),
    sa.Column('storage_key', sa.String(length=255), nullable=False, comment='Yükleme dizinindeki rastgele dosya adı'),
    sa.Column('is_encrypted', sa.Boolean(), nullable=False),
    sa.Column('uploaded_by', sa.UUID(), nullable=True),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.CheckConstraint("kind IN ('receipt', 'id_photo')", name='ck_credit_documents_kind'),
    sa.CheckConstraint('size_bytes > 0', name='ck_credit_documents_size'),
    sa.ForeignKeyConstraint(['station_id'], ['stations.id'], ondelete='RESTRICT'),
    sa.ForeignKeyConstraint(['uploaded_by'], ['users.id'], ondelete='SET NULL'),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('storage_key')
    )
    op.create_index(op.f('ix_credit_documents_station_id'), 'credit_documents', ['station_id'], unique=False)
    op.create_table('credit_customers',
    sa.Column('id', sa.UUID(), nullable=False),
    sa.Column('station_id', sa.UUID(), nullable=False),
    sa.Column('full_name', sa.String(length=255), nullable=False, comment='Adı soyadı'),
    sa.Column('tc_encrypted', sa.Text(), nullable=False, comment='Şifreli T.C. kimlik no'),
    sa.Column('tc_hash', sa.String(length=64), nullable=False, comment='HMAC kör indeks'),
    sa.Column('phone', sa.String(length=20), nullable=False, comment='Cep telefonu'),
    sa.Column('plate', sa.String(length=20), nullable=True, comment='Varsa araç plakası'),
    sa.Column('id_photo_document_id', sa.UUID(), nullable=True, comment='Kimlik fotoğrafı'),
    sa.Column('is_active', sa.Boolean(), nullable=False, comment='Veresiye alım yetkisi açık mı'),
    sa.Column('credit_limit', sa.Numeric(precision=14, scale=2), nullable=True, comment='Opsiyonel kredi limiti (TL); NULL = limitsiz'),
    sa.Column('notes', sa.Text(), nullable=True),
    sa.Column('created_by', sa.UUID(), nullable=True),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.CheckConstraint('credit_limit IS NULL OR credit_limit >= 0', name='ck_credit_customers_limit'),
    sa.ForeignKeyConstraint(['created_by'], ['users.id'], ondelete='SET NULL'),
    sa.ForeignKeyConstraint(['id_photo_document_id'], ['credit_documents.id'], ondelete='SET NULL'),
    sa.ForeignKeyConstraint(['station_id'], ['stations.id'], ondelete='RESTRICT'),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('station_id', 'tc_hash', name='uq_credit_customers_station_tc')
    )
    op.create_index(op.f('ix_credit_customers_plate'), 'credit_customers', ['plate'], unique=False)
    op.create_index(op.f('ix_credit_customers_station_id'), 'credit_customers', ['station_id'], unique=False)
    op.create_index(op.f('ix_credit_customers_tc_hash'), 'credit_customers', ['tc_hash'], unique=False)
    op.create_table('credit_drivers',
    sa.Column('id', sa.UUID(), nullable=False),
    sa.Column('credit_company_id', sa.UUID(), nullable=False),
    sa.Column('full_name', sa.String(length=255), nullable=False),
    sa.Column('tc_encrypted', sa.Text(), nullable=False, comment='Şifreli T.C. kimlik no'),
    sa.Column('tc_hash', sa.String(length=64), nullable=False, comment='HMAC kör indeks'),
    sa.Column('phone', sa.String(length=20), nullable=True),
    sa.Column('is_active', sa.Boolean(), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.ForeignKeyConstraint(['credit_company_id'], ['credit_companies.id'], ondelete='RESTRICT'),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('credit_company_id', 'tc_hash', name='uq_credit_drivers_company_tc')
    )
    op.create_index(op.f('ix_credit_drivers_credit_company_id'), 'credit_drivers', ['credit_company_id'], unique=False)
    op.create_index(op.f('ix_credit_drivers_tc_hash'), 'credit_drivers', ['tc_hash'], unique=False)
    op.create_table('credit_vehicles',
    sa.Column('id', sa.UUID(), nullable=False),
    sa.Column('credit_company_id', sa.UUID(), nullable=False),
    sa.Column('station_id', sa.UUID(), nullable=False, comment='Şirketin istasyonu (plaka sorgusu için denormalize)'),
    sa.Column('plate', sa.String(length=20), nullable=False, comment='Normalize plaka (örn: 06ABC123)'),
    sa.Column('description', sa.String(length=255), nullable=True, comment='Marka/model/not'),
    sa.Column('is_active', sa.Boolean(), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.ForeignKeyConstraint(['credit_company_id'], ['credit_companies.id'], ondelete='RESTRICT'),
    sa.ForeignKeyConstraint(['station_id'], ['stations.id'], ondelete='RESTRICT'),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('credit_company_id', 'plate', name='uq_credit_vehicles_company_plate')
    )
    op.create_index(op.f('ix_credit_vehicles_credit_company_id'), 'credit_vehicles', ['credit_company_id'], unique=False)
    op.create_index('uq_credit_vehicles_station_active_plate', 'credit_vehicles', ['station_id', 'plate'], unique=True, postgresql_where=sa.text('is_active'))
    op.create_table('credit_payments',
    sa.Column('id', sa.UUID(), nullable=False),
    sa.Column('station_id', sa.UUID(), nullable=False),
    sa.Column('account_type', sa.String(length=20), nullable=False, comment='corporate | individual'),
    sa.Column('credit_company_id', sa.UUID(), nullable=True),
    sa.Column('credit_customer_id', sa.UUID(), nullable=True),
    sa.Column('kind', sa.String(length=20), nullable=False),
    sa.Column('amount', sa.Numeric(precision=12, scale=2), nullable=False, comment='Tutar (TL)'),
    sa.Column('method', sa.String(length=20), nullable=False, comment='cash | credit_card | eft | other'),
    sa.Column('payment_date', sa.DateTime(timezone=True), nullable=False),
    sa.Column('reference', sa.String(length=100), nullable=True, comment='Dekont / makbuz no'),
    sa.Column('note', sa.String(length=500), nullable=True),
    sa.Column('recorded_by', sa.UUID(), nullable=True),
    sa.Column('voided_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('voided_by', sa.UUID(), nullable=True),
    sa.Column('void_reason', sa.String(length=500), nullable=True),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.CheckConstraint("(account_type = 'corporate' AND credit_company_id IS NOT NULL AND credit_customer_id IS NULL) OR (account_type = 'individual' AND credit_customer_id IS NOT NULL AND credit_company_id IS NULL)", name='ck_credit_payments_account'),
    sa.CheckConstraint("(kind = 'payment' AND amount > 0) OR (kind = 'adjustment' AND amount <> 0)", name='ck_credit_payments_amount'),
    sa.CheckConstraint("kind IN ('payment', 'adjustment')", name='ck_credit_payments_kind'),
    sa.CheckConstraint("method IN ('cash', 'credit_card', 'eft', 'other')", name='ck_credit_payments_method'),
    sa.ForeignKeyConstraint(['credit_company_id'], ['credit_companies.id'], ondelete='RESTRICT'),
    sa.ForeignKeyConstraint(['credit_customer_id'], ['credit_customers.id'], ondelete='RESTRICT'),
    sa.ForeignKeyConstraint(['recorded_by'], ['users.id'], ondelete='SET NULL'),
    sa.ForeignKeyConstraint(['station_id'], ['stations.id'], ondelete='RESTRICT'),
    sa.ForeignKeyConstraint(['voided_by'], ['users.id'], ondelete='SET NULL'),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index('ix_credit_payments_company_date', 'credit_payments', ['credit_company_id', 'payment_date'], unique=False)
    op.create_index('ix_credit_payments_customer_date', 'credit_payments', ['credit_customer_id', 'payment_date'], unique=False)
    op.create_index('ix_credit_payments_station_date', 'credit_payments', ['station_id', 'payment_date'], unique=False)
    op.create_table('credit_sales',
    sa.Column('id', sa.UUID(), nullable=False),
    sa.Column('transaction_id', sa.UUID(), nullable=False, comment='Eşleşen satış/otomasyon kaydı (1:1)'),
    sa.Column('station_id', sa.UUID(), nullable=False),
    sa.Column('shift_id', sa.UUID(), nullable=False),
    sa.Column('account_type', sa.String(length=20), nullable=False, comment='corporate | individual'),
    sa.Column('credit_company_id', sa.UUID(), nullable=True),
    sa.Column('credit_customer_id', sa.UUID(), nullable=True),
    sa.Column('vehicle_id', sa.UUID(), nullable=True),
    sa.Column('plate', sa.String(length=20), nullable=True, comment='Satış anındaki plaka'),
    sa.Column('driver_id', sa.UUID(), nullable=True),
    sa.Column('driver_name', sa.String(length=255), nullable=True, comment='Satış anındaki sürücü adı'),
    sa.Column('identity_verified', sa.Boolean(), nullable=False, comment='Sürücü/müşteri T.C. kimlik no satış anında sistemdeki kayıtla eşleşti mi'),
    sa.Column('amount', sa.Numeric(precision=12, scale=2), nullable=False, comment='Satış tutarı (TL)'),
    sa.Column('liters', sa.Numeric(precision=10, scale=3), nullable=True),
    sa.Column('fuel_type', sa.String(length=50), nullable=True),
    sa.Column('sale_time', sa.DateTime(timezone=True), nullable=False),
    sa.Column('receipt_document_id', sa.UUID(), nullable=True),
    sa.Column('receipt_uploaded_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('commitment', sa.String(length=64), nullable=False, comment='Kaydın SHA-256 taahhüdü (kimlik/tutar açıklamaz)'),
    sa.Column('commitment_nonce', sa.String(length=64), nullable=False, comment='Taahhüdün özel nonce değeri; genel API yanıtlarına dahil edilmez'),
    sa.Column('created_by', sa.UUID(), nullable=True),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.CheckConstraint("(account_type = 'corporate' AND credit_company_id IS NOT NULL AND credit_customer_id IS NULL) OR (account_type = 'individual' AND credit_customer_id IS NOT NULL AND credit_company_id IS NULL)", name='ck_credit_sales_account'),
    sa.CheckConstraint('amount > 0', name='ck_credit_sales_amount'),
    sa.ForeignKeyConstraint(['created_by'], ['users.id'], ondelete='SET NULL'),
    sa.ForeignKeyConstraint(['credit_company_id'], ['credit_companies.id'], ondelete='RESTRICT'),
    sa.ForeignKeyConstraint(['credit_customer_id'], ['credit_customers.id'], ondelete='RESTRICT'),
    sa.ForeignKeyConstraint(['driver_id'], ['credit_drivers.id'], ondelete='SET NULL'),
    sa.ForeignKeyConstraint(['receipt_document_id'], ['credit_documents.id'], ondelete='SET NULL'),
    sa.ForeignKeyConstraint(['shift_id'], ['shifts.id'], ondelete='RESTRICT'),
    sa.ForeignKeyConstraint(['station_id'], ['stations.id'], ondelete='RESTRICT'),
    sa.ForeignKeyConstraint(['transaction_id'], ['transactions.id'], ondelete='RESTRICT'),
    sa.ForeignKeyConstraint(['vehicle_id'], ['credit_vehicles.id'], ondelete='SET NULL'),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('transaction_id')
    )
    op.create_index('ix_credit_sales_company_time', 'credit_sales', ['credit_company_id', 'sale_time'], unique=False)
    op.create_index('ix_credit_sales_customer_time', 'credit_sales', ['credit_customer_id', 'sale_time'], unique=False)
    op.create_index(op.f('ix_credit_sales_shift_id'), 'credit_sales', ['shift_id'], unique=False)
    op.create_index('ix_credit_sales_station_time', 'credit_sales', ['station_id', 'sale_time'], unique=False)


def downgrade() -> None:
    op.drop_index('ix_credit_sales_station_time', table_name='credit_sales')
    op.drop_index(op.f('ix_credit_sales_shift_id'), table_name='credit_sales')
    op.drop_index('ix_credit_sales_customer_time', table_name='credit_sales')
    op.drop_index('ix_credit_sales_company_time', table_name='credit_sales')
    op.drop_table('credit_sales')
    op.drop_index('ix_credit_payments_station_date', table_name='credit_payments')
    op.drop_index('ix_credit_payments_customer_date', table_name='credit_payments')
    op.drop_index('ix_credit_payments_company_date', table_name='credit_payments')
    op.drop_table('credit_payments')
    op.drop_index('uq_credit_vehicles_station_active_plate', table_name='credit_vehicles', postgresql_where=sa.text('is_active'))
    op.drop_index(op.f('ix_credit_vehicles_credit_company_id'), table_name='credit_vehicles')
    op.drop_table('credit_vehicles')
    op.drop_index(op.f('ix_credit_drivers_tc_hash'), table_name='credit_drivers')
    op.drop_index(op.f('ix_credit_drivers_credit_company_id'), table_name='credit_drivers')
    op.drop_table('credit_drivers')
    op.drop_index(op.f('ix_credit_customers_tc_hash'), table_name='credit_customers')
    op.drop_index(op.f('ix_credit_customers_station_id'), table_name='credit_customers')
    op.drop_index(op.f('ix_credit_customers_plate'), table_name='credit_customers')
    op.drop_table('credit_customers')
    op.drop_index(op.f('ix_credit_documents_station_id'), table_name='credit_documents')
    op.drop_table('credit_documents')
    op.drop_index('uq_credit_companies_station_tax', table_name='credit_companies', postgresql_where=sa.text('tax_number IS NOT NULL'))
    op.drop_index(op.f('ix_credit_companies_station_id'), table_name='credit_companies')
    op.drop_table('credit_companies')
