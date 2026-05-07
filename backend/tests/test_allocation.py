"""Tests for the v0.1 allocation engine stub.

Locks the math (value resolution precedence, asset-class grouping,
unclassified handling, pct sums, ordering) and the GET /api/allocation
endpoint contract. M4 will add fund look-through + remaining rings.
"""

from datetime import UTC, datetime

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.allocation import aggregate, position_value
from app.classifications import BucketEntry, ClassificationEntry, load_classifications, primary_asset_class
from app.models import Account, Position


def _position(
    ticker: str,
    shares: float = 1.0,
    cost_basis: float | None = None,
    market_value: float | None = None,
    investable: bool = True,
) -> Position:
    return Position(
        ticker=ticker,
        shares=shares,
        cost_basis=cost_basis,
        market_value=market_value,
        as_of=datetime.now(UTC),
        source="paste",
        account_id=0,
        investable=investable,
    )


# --- position_value precedence --------------------------------------------


def test_value_prefers_market_value() -> None:
    p = _position("VTI", cost_basis=20000.0, market_value=24500.0)
    assert position_value(p) == 24500.0


def test_value_falls_back_to_cost_basis() -> None:
    p = _position("VTI", cost_basis=20000.0, market_value=None)
    assert position_value(p) == 20000.0


def test_value_is_zero_when_both_missing() -> None:
    p = _position("VTI", cost_basis=None, market_value=None)
    assert position_value(p) == 0.0


# --- aggregate ------------------------------------------------------------


def _classifications() -> dict[str, ClassificationEntry]:
    return {
        "VTI": ClassificationEntry.from_flat(ticker="VTI", asset_class="Stocks"),
        "BND": ClassificationEntry.from_flat(ticker="BND", asset_class="Bonds"),
        "GLD": ClassificationEntry.from_flat(ticker="GLD", asset_class="Commodities"),
    }


def test_empty_portfolio() -> None:
    result = aggregate([], _classifications())
    assert result.total == 0.0
    assert result.by_asset_class == []
    assert result.unclassified_tickers == []


def test_single_position() -> None:
    result = aggregate(
        [_position("VTI", market_value=10000.0)], _classifications()
    )
    assert result.total == 10000.0
    assert len(result.by_asset_class) == 1
    assert result.by_asset_class[0].name == "Stocks"
    assert result.by_asset_class[0].pct == 100.0
    assert result.by_asset_class[0].tickers == ["VTI"]


def test_same_asset_class_sums() -> None:
    result = aggregate(
        [
            _position("VTI", market_value=60000.0),
            _position("VTI", market_value=40000.0),  # second taxable account same ticker
        ],
        _classifications(),
    )
    assert result.total == 100000.0
    assert len(result.by_asset_class) == 1
    assert result.by_asset_class[0].value == 100000.0


def test_multiple_asset_classes_sum_to_100() -> None:
    result = aggregate(
        [
            _position("VTI", market_value=60000.0),
            _position("BND", market_value=30000.0),
            _position("GLD", market_value=10000.0),
        ],
        _classifications(),
    )
    assert result.total == 100000.0
    pct_sum = sum(s.pct for s in result.by_asset_class)
    assert abs(pct_sum - 100.0) < 1e-9


def test_slices_sorted_by_value_desc() -> None:
    result = aggregate(
        [
            _position("GLD", market_value=10000.0),
            _position("VTI", market_value=60000.0),
            _position("BND", market_value=30000.0),
        ],
        _classifications(),
    )
    assert [s.name for s in result.by_asset_class] == ["Stocks", "Bonds", "Commodities"]


def test_mixed_value_sources() -> None:
    # VTI has market_value, BND falls back to cost_basis, GLD contributes 0.
    result = aggregate(
        [
            _position("VTI", market_value=50000.0, cost_basis=45000.0),
            _position("BND", cost_basis=30000.0),
            _position("GLD"),
        ],
        _classifications(),
    )
    by_name = {s.name: s for s in result.by_asset_class}
    assert by_name["Stocks"].value == 50000.0
    assert by_name["Bonds"].value == 30000.0
    assert by_name["Commodities"].value == 0.0


def test_aggregate_excludes_non_investable_from_total_and_tree() -> None:
    # GLD is non-investable -- counts toward net_worth but not Investment
    # Portfolio. The Commodities slice disappears entirely from the tree.
    result = aggregate(
        [
            _position("VTI", market_value=10000.0),
            _position("BND", market_value=5000.0),
            _position("GLD", market_value=3000.0, investable=False),
        ],
        _classifications(),
    )
    assert result.total == 15000.0
    assert result.net_worth == 18000.0
    names = {s.name for s in result.by_asset_class}
    assert "Commodities" not in names
    pct_sum = sum(s.pct for s in result.by_asset_class)
    assert abs(pct_sum - 100.0) < 1e-9


def test_aggregate_net_worth_equals_total_when_all_investable() -> None:
    result = aggregate(
        [
            _position("VTI", market_value=10000.0),
            _position("BND", market_value=5000.0),
        ],
        _classifications(),
    )
    assert result.total == result.net_worth == 15000.0


def test_aggregate_assets_total_includes_non_investable() -> None:
    # assets_total is the full classified sum; total is investable-only.
    result = aggregate(
        [
            _position("VTI", market_value=10000.0),
            _position("GLD", market_value=3000.0, investable=False),
        ],
        _classifications(),
    )
    assert result.assets_total == 13000.0
    assert result.total == 10000.0


def test_aggregate_unflushed_position_treated_as_investable() -> None:
    # An unflushed ORM Position has investable=None until INSERT. The
    # filter uses ``is False`` so None still counts toward total.
    p = Position(
        ticker="VTI",
        shares=1.0,
        market_value=10000.0,
        cost_basis=None,
        as_of=datetime.now(UTC),
        source="paste",
        account_id=0,
    )
    assert p.investable is None
    result = aggregate([p], _classifications())
    assert result.total == 10000.0
    assert result.net_worth == 10000.0


def test_unclassified_tickers_surface() -> None:
    result = aggregate(
        [
            _position("VTI", market_value=50000.0),
            _position("UNKNOWN", market_value=10000.0),
        ],
        _classifications(),
    )
    assert result.total == 50000.0  # UNKNOWN excluded from total
    assert result.unclassified_tickers == ["UNKNOWN"]


def test_unclassified_dedup_preserves_order() -> None:
    result = aggregate(
        [_position("FOO"), _position("BAR"), _position("FOO")],
        _classifications(),
    )
    assert result.unclassified_tickers == ["FOO", "BAR"]


def test_ring_layout_is_asset_class_then_sub_class() -> None:
    classifications = {
        "MYSTOCK": ClassificationEntry.from_flat(
            ticker="MYSTOCK",
            asset_class="Stocks",
            sub_class="US Stocks",
        ),
        "MYBOND": ClassificationEntry(
            ticker="MYBOND",
            source="user",
            buckets=(
                BucketEntry("Bonds", "US Treasury", 0.67),
                BucketEntry("Bonds", "US Corporate", 0.33),
            ),
        ),
    }
    result = aggregate(
        [
            _position("MYSTOCK", market_value=60000.0),
            _position("MYBOND", market_value=40000.0),
        ],
        classifications,
    )
    by_name = {s.name: s for s in result.by_asset_class}

    equity = by_name["Stocks"]
    assert [c.name for c in equity.children] == ["US Stocks"]
    assert equity.children[0].value == 60000.0

    fi = by_name["Bonds"]
    assert len(fi.children) == 2
    by_sub = {c.name: c.value for c in fi.children}
    assert abs(by_sub.get("US Treasury", 0) + by_sub.get("US Corporate", 0) - 40000.0) < 0.01


def test_ring_layout_falls_back_to_other_when_sub_class_missing() -> None:
    entries = {
        "CASH:ally": ClassificationEntry.from_flat(
            ticker="CASH:ally",
            asset_class="Cash",
            sub_class="Cash & Savings",
        ),
    }
    result = aggregate([_position("CASH:ally", market_value=10000.0)], entries)
    cash = result.by_asset_class[0]
    assert cash.name == "Cash"
    assert [c.name for c in cash.children] == ["Cash & Savings"]
    assert cash.children[0].value == 10000.0


# --- sector_breakdown (deprecated; always empty) -------------------------


def test_sector_breakdown_empty_for_seed_portfolio() -> None:
    result = aggregate(
        [
            _position("VTI", market_value=60000.0),
            _position("BND", market_value=30000.0),
            _position("GLD", market_value=10000.0),
        ],
        load_classifications(),
    )
    for s in result.by_asset_class:
        assert s.sector_breakdown == []


def test_user_equity_slice_has_empty_sector_breakdown() -> None:
    entries = {
        "MYSTOCK": ClassificationEntry.from_flat(
            ticker="MYSTOCK",
            asset_class="Stocks",
            sub_class="US Stocks",
            source="user",
        ),
    }
    result = aggregate([_position("MYSTOCK", market_value=50000.0)], entries)
    equity = next(s for s in result.by_asset_class if s.name == "Stocks")
    assert equity.sector_breakdown == []


# --- GET /api/allocation --------------------------------------------------


def test_endpoint_requires_admin_token(client: TestClient) -> None:
    r = client.get("/api/allocation")
    assert r.status_code == 401


def test_endpoint_empty(client: TestClient, auth_headers: dict[str, str]) -> None:
    r = client.get("/api/allocation", headers=auth_headers)
    assert r.status_code == 200
    body = r.json()
    assert body["total"] == 0.0
    assert body["by_asset_class"] == []
    assert body["unclassified_tickers"] == []


def test_endpoint_reads_seed_classifications(
    client: TestClient, auth_headers: dict[str, str], test_db: Session
) -> None:
    # Seed portfolio: VTI (equity) + BND (Bonds).
    account = Account(label="Test", type="brokerage")
    test_db.add(account)
    test_db.commit()
    test_db.add_all(
        [
            _position_row(account.id, "VTI", market_value=60000.0),
            _position_row(account.id, "BND", market_value=40000.0),
        ]
    )
    test_db.commit()

    r = client.get("/api/allocation", headers=auth_headers)
    body = r.json()
    assert body["total"] == 100000.0
    by_name = {s["name"]: s for s in body["by_asset_class"]}
    assert by_name["Stocks"]["pct"] == 60.0
    assert by_name["Bonds"]["pct"] == 40.0


def _position_row(
    account_id: int, ticker: str, market_value: float | None = None
) -> Position:
    return Position(
        account_id=account_id,
        ticker=ticker,
        shares=1.0,
        market_value=market_value,
        as_of=datetime.now(UTC),
        source="paste",
    )


def test_uses_real_yaml_classifications() -> None:
    # Sanity: the full seed YAML loads and contains the assets we expect
    # the allocation engine to group.
    entries = load_classifications()
    assert primary_asset_class(entries["VTI"]) == "Stocks"
    assert primary_asset_class(entries["BND"]) == "Bonds"
    assert primary_asset_class(entries["CASH"]) == "Cash"


# --- v0.1.5 M1: user overrides affect allocation --------------------------


def test_user_override_beats_yaml_in_allocation(
    client: TestClient, auth_headers: dict[str, str], test_db: Session
) -> None:
    """Core v0.1.5 user story 2: override a ticker's classification and
    see it reflected in the allocation payload (sub_class, sunburst
    routing, and the classification_sources map that drives tooltip
    provenance). YAML BND is split Treasury/Corporate; the user reclassifies
    to a single US Treasury bucket — allocation must reflect the override.
    """
    from tests.db_helpers import seed_user_classification

    account = Account(label="Test", type="brokerage")
    test_db.add(account)
    test_db.commit()
    test_db.add(_position_row(account.id, "BND", market_value=10000.0))
    seed_user_classification(test_db, "BND", "Bonds", "US Treasury")
    test_db.commit()

    r = client.get("/api/allocation", headers=auth_headers)
    body = r.json()
    assert body["classification_sources"]["BND"] == "user"

    bonds = next(s for s in body["by_asset_class"] if s["name"] == "Bonds")
    sub_names = [c["name"] for c in bonds["children"]]
    assert "US Treasury" in sub_names
    assert "US Corporate" not in sub_names or "US Treasury" in sub_names


def test_classification_sources_default_to_yaml(
    client: TestClient, auth_headers: dict[str, str], test_db: Session
) -> None:
    # No DB overrides -> every held ticker's source is "yaml".
    account = Account(label="Test", type="brokerage")
    test_db.add(account)
    test_db.commit()
    test_db.add(_position_row(account.id, "VTI", market_value=1000.0))
    test_db.commit()

    body = client.get("/api/allocation", headers=auth_headers).json()
    assert body["classification_sources"] == {"VTI": "yaml"}


def test_synthetic_tickers_are_unclassified_without_user_row(
    client: TestClient, auth_headers: dict[str, str], test_db: Session
) -> None:
    # v0.1.5 M4 removed the synthetic-prefix fallback. A position whose
    # ticker has no YAML or user classification is unclassified -- the
    # migration step covers pre-existing synthetic positions at startup;
    # new ones ride through /manual which writes a Classification row.
    account = Account(label="Test", type="brokerage")
    test_db.add(account)
    test_db.commit()
    test_db.add(_position_row(account.id, "REALESTATE:house", market_value=500000.0))
    test_db.commit()

    body = client.get("/api/allocation", headers=auth_headers).json()
    assert "REALESTATE:house" in body["unclassified_tickers"]
    assert "REALESTATE:house" not in body["classification_sources"]
