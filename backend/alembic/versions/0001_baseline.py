"""Initial schema (SQLite); matches ORM in ``app.models``.

Existing deployments that already have tables from legacy ``create_all`` skip DDL;
Alembic still records this revision (stamp-on-upgrade).

Revision ID: 0001_baseline
Revises:
Create Date: 2026-05-07

"""

from typing import Sequence

from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect

revision: str = "0001_baseline"
down_revision: str | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    bind = op.get_bind()
    insp = inspect(bind)
    if "institutions" in insp.get_table_names():
        return

    op.create_table(
        "institutions",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(length=120), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(),
            server_default=sa.text("CURRENT_TIMESTAMP"),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_table(
        "classifications",
        sa.Column("ticker", sa.String(length=64), nullable=False),
        sa.Column("source", sa.String(length=50), nullable=False),
        sa.Column(
            "updated_at",
            sa.DateTime(),
            server_default=sa.text("CURRENT_TIMESTAMP"),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("ticker"),
    )
    op.create_table(
        "snapshots",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column(
            "taken_at",
            sa.DateTime(),
            server_default=sa.text("CURRENT_TIMESTAMP"),
            nullable=False,
        ),
        sa.Column("net_worth_usd", sa.Float(), nullable=False),
        sa.Column("payload_json", sa.Text(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_table(
        "targets",
        sa.Column("path", sa.String(length=128), nullable=False),
        sa.Column("pct", sa.Integer(), nullable=False),
        sa.Column(
            "updated_at",
            sa.DateTime(),
            server_default=sa.text("CURRENT_TIMESTAMP"),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("path"),
    )
    op.create_table(
        "provenance",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("entity_type", sa.String(length=50), nullable=False),
        sa.Column("entity_id", sa.Integer(), nullable=False),
        sa.Column("entity_key", sa.String(length=64), nullable=True),
        sa.Column("field", sa.String(length=50), nullable=False),
        sa.Column("source", sa.String(length=200), nullable=False),
        sa.Column("confidence", sa.Float(), nullable=True),
        sa.Column("llm_span", sa.Text(), nullable=True),
        sa.Column(
            "captured_at",
            sa.DateTime(),
            server_default=sa.text("CURRENT_TIMESTAMP"),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_table(
        "accounts",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("label", sa.String(length=100), nullable=False),
        sa.Column("type", sa.String(length=50), nullable=False),
        sa.Column("currency", sa.String(length=3), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(),
            server_default=sa.text("CURRENT_TIMESTAMP"),
            nullable=False,
        ),
        sa.Column("institution_id", sa.Integer(), nullable=True),
        sa.Column(
            "tax_treatment",
            sa.String(length=20),
            server_default=sa.text("'taxable'"),
            nullable=False,
        ),
        sa.Column(
            "staleness_threshold_days",
            sa.Integer(),
            server_default=sa.text("30"),
            nullable=False,
        ),
        sa.Column(
            "is_archived",
            sa.Boolean(),
            server_default=sa.text("0"),
            nullable=False,
        ),
        sa.Column(
            "is_investable",
            sa.Boolean(),
            server_default=sa.text("1"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["institution_id"],
            ["institutions.id"],
            ondelete="SET NULL",
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_table(
        "positions",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("account_id", sa.Integer(), nullable=False),
        sa.Column("ticker", sa.String(length=64), nullable=False),
        sa.Column("shares", sa.Float(), nullable=False),
        sa.Column("cost_basis", sa.Float(), nullable=True),
        sa.Column("market_value", sa.Float(), nullable=True),
        sa.Column("as_of", sa.DateTime(), nullable=False),
        sa.Column("source", sa.String(length=50), nullable=False),
        sa.Column(
            "investable",
            sa.Boolean(),
            server_default=sa.text("1"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["account_id"],
            ["accounts.id"],
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_table(
        "classification_buckets",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("ticker", sa.String(length=64), nullable=False),
        sa.Column(
            "sort_order",
            sa.Integer(),
            server_default=sa.text("0"),
            nullable=False,
        ),
        sa.Column("asset_class", sa.String(length=50), nullable=False),
        sa.Column("sub_class", sa.String(length=50), nullable=True),
        sa.Column("weight", sa.Float(), nullable=False),
        sa.ForeignKeyConstraint(
            ["ticker"],
            ["classifications.ticker"],
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_table(
        "liabilities",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("label", sa.String(length=120), nullable=False),
        sa.Column("kind", sa.String(length=40), nullable=False),
        sa.Column("balance", sa.Float(), nullable=False),
        sa.Column("as_of", sa.DateTime(), nullable=False),
        sa.Column("institution_id", sa.Integer(), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("source", sa.String(length=50), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(),
            server_default=sa.text("CURRENT_TIMESTAMP"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["institution_id"],
            ["institutions.id"],
            ondelete="SET NULL",
        ),
        sa.PrimaryKeyConstraint("id"),
    )

    op.execute(
        "CREATE UNIQUE INDEX ux_institutions_name_lower ON institutions (lower(name))"
    )
    op.create_index(
        "ix_provenance_entity_key", "provenance", ["entity_key"], unique=False
    )
    op.create_index(
        "ix_provenance_entity_id", "provenance", ["entity_id"], unique=False
    )
    op.create_index(
        "ix_provenance_entity_type", "provenance", ["entity_type"], unique=False
    )
    op.create_index(
        "ix_accounts_institution_id", "accounts", ["institution_id"], unique=False
    )
    op.create_index(
        "ix_classification_buckets_ticker",
        "classification_buckets",
        ["ticker"],
        unique=False,
    )
    op.create_index(
        "ix_liabilities_institution_id",
        "liabilities",
        ["institution_id"],
        unique=False,
    )
    op.create_index("ix_positions_ticker", "positions", ["ticker"], unique=False)
    op.create_index(
        "ix_positions_account_id", "positions", ["account_id"], unique=False
    )


def downgrade() -> None:
    op.drop_table("targets")
    op.drop_table("snapshots")
    op.drop_table("provenance")
    op.drop_table("classification_buckets")
    op.drop_table("positions")
    op.drop_table("liabilities")
    op.drop_table("accounts")
    op.drop_table("classifications")
    op.drop_table("institutions")
