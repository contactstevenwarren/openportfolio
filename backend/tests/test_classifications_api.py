"""Tests for /api/classifications (v0.1.5 M3).

Covers the merged GET list, the PATCH upsert + Provenance capture, the
DELETE revert-to-YAML, and the orphan-block that prevents DELETE from
silently unclassifying held positions.
"""

from datetime import UTC, datetime
from unittest.mock import patch

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.llm import TickerClassificationResult
from app.models import Account, Classification, Position, Provenance


def _position(test_db: Session, ticker: str) -> None:
    account = test_db.query(Account).first()
    if account is None:
        account = Account(label="Test", type="brokerage")
        test_db.add(account)
        test_db.commit()
    test_db.add(
        Position(
            account_id=account.id,
            ticker=ticker,
            shares=1.0,
            market_value=1000.0,
            as_of=datetime.now(UTC),
            source="paste",
        )
    )
    test_db.commit()


# --- auth -----------------------------------------------------------------


def test_endpoints_require_admin_token(client: TestClient) -> None:
    assert client.get("/api/classifications").status_code == 401
    assert client.get("/api/classifications/taxonomy").status_code == 401
    assert (
        client.post("/api/classifications/suggest", json={"tickers": ["X"]}).status_code
        == 401
    )
    assert (
        client.patch("/api/classifications/VTI", json={"asset_class": "equity"}).status_code
        == 401
    )
    assert client.delete("/api/classifications/VTI").status_code == 401


# --- taxonomy -------------------------------------------------------------


def test_taxonomy_returns_friendly_labels(
    client: TestClient, auth_headers: dict[str, str]
) -> None:
    body = client.get("/api/classifications/taxonomy", headers=auth_headers).json()
    by_value = {o["value"]: o["label"] for o in body["asset_classes"]}
    assert by_value["fixed_income"] == "Fixed Income"
    assert by_value["real_estate"] == "Real Estate"
    # Sanity: every roadmap asset class is present.
    assert set(by_value) >= {
        "equity",
        "fixed_income",
        "real_estate",
        "commodity",
        "crypto",
        "cash",
        "private",
    }


# --- list (merged YAML + user) --------------------------------------------


def test_list_includes_yaml_baseline(
    client: TestClient, auth_headers: dict[str, str]
) -> None:
    rows = client.get("/api/classifications", headers=auth_headers).json()
    tickers = {r["ticker"] for r in rows}
    assert "VTI" in tickers
    vti = next(r for r in rows if r["ticker"] == "VTI")
    assert vti["source"] == "yaml"
    assert vti["overrides_yaml"] is False


def test_list_shows_user_row_as_override(
    client: TestClient, auth_headers: dict[str, str], test_db: Session
) -> None:
    # BND is yaml-backed as us_aggregate; user reclassifies to us_treasury.
    test_db.add(
        Classification(
            ticker="BND",
            asset_class="fixed_income",
            sub_class="us_treasury",
            region="US",
            source="user",
        )
    )
    test_db.commit()

    rows = client.get("/api/classifications", headers=auth_headers).json()
    bnd = next(r for r in rows if r["ticker"] == "BND")
    assert bnd["source"] == "user"
    assert bnd["sub_class"] == "us_treasury"
    assert bnd["overrides_yaml"] is True
    # And there's only one BND row (the yaml one is suppressed when
    # user overrides it).
    assert sum(1 for r in rows if r["ticker"] == "BND") == 1


def test_list_exposes_full_breakdown_for_auto_split_funds(
    client: TestClient, auth_headers: dict[str, str]
) -> None:
    # VT has a multi-region + multi-sub_class + multi-sector lookthrough.
    # The endpoint exposes every dimension, weight-sorted, so the UI
    # tooltip can render the same decomposition the allocation engine uses.
    rows = client.get("/api/classifications", headers=auth_headers).json()
    vt = next(r for r in rows if r["ticker"] == "VT")
    assert vt["has_breakdown"] is True
    br = vt["breakdown"]
    assert br is not None

    region_buckets = {b["bucket"] for b in br["region"]}
    assert {"US", "intl_developed", "intl_emerging"} <= region_buckets

    # Each dimension is sorted by weight descending -- the UI depends
    # on this so the tooltip doesn't need to re-sort.
    for dim in ("region", "sub_class", "sector"):
        weights = [b["weight"] for b in br[dim]]
        assert weights == sorted(weights, reverse=True), dim


def test_list_single_bucket_fund_still_carries_breakdown(
    client: TestClient, auth_headers: dict[str, str]
) -> None:
    # BND is 100% us_aggregate / 100% US -> has_breakdown=True and the
    # tooltip data is present (one bucket per dimension, not empty).
    rows = client.get("/api/classifications", headers=auth_headers).json()
    bnd = next(r for r in rows if r["ticker"] == "BND")
    assert bnd["has_breakdown"] is True
    assert bnd["breakdown"] is not None
    assert [b["bucket"] for b in bnd["breakdown"]["region"]] == ["US"]
    assert [b["bucket"] for b in bnd["breakdown"]["sub_class"]] == ["us_aggregate"]


def test_list_has_no_breakdown_for_individual_stocks(
    client: TestClient, auth_headers: dict[str, str]
) -> None:
    # AAPL is a single stock with no lookthrough entry.
    rows = client.get("/api/classifications", headers=auth_headers).json()
    aapl = next(r for r in rows if r["ticker"] == "AAPL")
    assert aapl["has_breakdown"] is False
    assert aapl["breakdown"] is None


def test_list_new_user_ticker_is_not_an_override(
    client: TestClient, auth_headers: dict[str, str], test_db: Session
) -> None:
    # User-invented ticker with no YAML baseline -- overrides_yaml=False.
    test_db.add(
        Classification(
            ticker="wine-bottle-2019",
            asset_class="commodity",
            sub_class="wine",
            source="user",
        )
    )
    test_db.commit()

    rows = client.get("/api/classifications", headers=auth_headers).json()
    wine = next(r for r in rows if r["ticker"] == "wine-bottle-2019")
    assert wine["source"] == "user"
    assert wine["overrides_yaml"] is False


# --- PATCH ----------------------------------------------------------------


def test_patch_creates_user_override(
    client: TestClient, auth_headers: dict[str, str], test_db: Session
) -> None:
    r = client.patch(
        "/api/classifications/BND",
        json={
            "asset_class": "fixed_income",
            "sub_class": "us_treasury",
            "region": "US",
        },
        headers=auth_headers,
    )
    assert r.status_code == 200
    body = r.json()
    assert body["source"] == "user"
    assert body["sub_class"] == "us_treasury"
    assert body["overrides_yaml"] is True

    # Row persisted.
    row = test_db.get(Classification, "BND")
    assert row is not None
    assert row.source == "user"


def test_patch_writes_provenance_per_field(
    client: TestClient, auth_headers: dict[str, str], test_db: Session
) -> None:
    client.patch(
        "/api/classifications/BND",
        json={
            "asset_class": "fixed_income",
            "sub_class": "us_treasury",
            "region": "US",
        },
        headers=auth_headers,
    )

    prov = (
        test_db.query(Provenance)
        .filter(Provenance.entity_type == "classification")
        .filter(Provenance.entity_key == "BND")
        .all()
    )
    fields = {p.field for p in prov}
    # Every writable field gets a provenance row (full-shape PATCH).
    assert fields == {"asset_class", "sub_class", "sector", "region"}
    for p in prov:
        assert p.source == "user"


def test_patch_updates_existing_user_row(
    client: TestClient, auth_headers: dict[str, str], test_db: Session
) -> None:
    test_db.add(
        Classification(
            ticker="BND",
            asset_class="fixed_income",
            sub_class="us_aggregate",
            source="user",
        )
    )
    test_db.commit()

    client.patch(
        "/api/classifications/BND",
        json={"asset_class": "fixed_income", "sub_class": "us_treasury"},
        headers=auth_headers,
    )

    test_db.expire_all()
    row = test_db.get(Classification, "BND")
    assert row is not None
    assert row.sub_class == "us_treasury"


def test_patch_rejects_invalid_asset_class(
    client: TestClient, auth_headers: dict[str, str]
) -> None:
    r = client.patch(
        "/api/classifications/BND",
        json={"asset_class": "nonsense"},
        headers=auth_headers,
    )
    assert r.status_code == 422


# --- DELETE ---------------------------------------------------------------


def test_delete_reverts_yaml_ticker_to_baseline(
    client: TestClient, auth_headers: dict[str, str], test_db: Session
) -> None:
    # User override on a YAML-backed ticker -> delete reverts cleanly.
    test_db.add(
        Classification(
            ticker="BND",
            asset_class="fixed_income",
            sub_class="us_treasury",
            source="user",
        )
    )
    test_db.commit()

    r = client.delete("/api/classifications/BND", headers=auth_headers)
    assert r.status_code == 204

    rows = client.get("/api/classifications", headers=auth_headers).json()
    bnd = next(r for r in rows if r["ticker"] == "BND")
    assert bnd["source"] == "yaml"
    assert bnd["sub_class"] == "us_aggregate"  # back to YAML baseline


def test_delete_blocked_when_positions_would_orphan(
    client: TestClient, auth_headers: dict[str, str], test_db: Session
) -> None:
    # User-invented ticker + a held position -> delete blocked.
    test_db.add(
        Classification(
            ticker="wine-bottle-2019",
            asset_class="commodity",
            sub_class="wine",
            source="user",
        )
    )
    test_db.commit()
    _position(test_db, "wine-bottle-2019")

    r = client.delete(
        "/api/classifications/wine-bottle-2019", headers=auth_headers
    )
    assert r.status_code == 409
    assert "position" in r.json()["detail"].lower()

    # Row still present.
    assert test_db.get(Classification, "wine-bottle-2019") is not None


def test_delete_allowed_for_user_ticker_without_positions(
    client: TestClient, auth_headers: dict[str, str], test_db: Session
) -> None:
    test_db.add(
        Classification(
            ticker="orphan",
            asset_class="commodity",
            sub_class="other",
            source="user",
        )
    )
    test_db.commit()

    r = client.delete("/api/classifications/orphan", headers=auth_headers)
    assert r.status_code == 204

    test_db.expire_all()
    assert test_db.get(Classification, "orphan") is None


def test_delete_noop_when_no_user_row(
    client: TestClient, auth_headers: dict[str, str]
) -> None:
    # VTI is yaml-only; delete is a safe no-op (idempotent).
    r = client.delete("/api/classifications/VTI", headers=auth_headers)
    assert r.status_code == 204


# --- suggest (paste review) ------------------------------------------------


def test_suggest_returns_existing_yaml_row(
    client: TestClient, auth_headers: dict[str, str]
) -> None:
    r = client.post(
        "/api/classifications/suggest",
        json={"tickers": ["VTI"]},
        headers=auth_headers,
    )
    assert r.status_code == 200
    rows = r.json()
    assert len(rows) == 1
    assert rows[0]["ticker"] == "VTI"
    assert rows[0]["source"] == "existing"
    assert rows[0]["asset_class"] == "equity"


def test_suggest_calls_llm_for_unknown_ticker(
    client: TestClient, auth_headers: dict[str, str]
) -> None:
    fake = TickerClassificationResult(
        asset_class="equity",
        confidence=0.82,
        reasoning="Large-cap US equity ETF.",
        model="azure/test-deployment",
    )
    with patch("app.main.classify_ticker", return_value=fake):
        r = client.post(
            "/api/classifications/suggest",
            json={"tickers": ["ZZNOTINSEED99"]},
            headers=auth_headers,
        )
    assert r.status_code == 200
    row = r.json()[0]
    assert row["source"] == "llm"
    assert row["asset_class"] == "equity"
    assert row["confidence"] == 0.82
    assert row["reasoning"] == "Large-cap US equity ETF."


def test_suggest_none_when_llm_returns_null(
    client: TestClient, auth_headers: dict[str, str]
) -> None:
    with patch("app.main.classify_ticker", return_value=None):
        r = client.post(
            "/api/classifications/suggest",
            json={"tickers": ["ZZNOTINSEED99"]},
            headers=auth_headers,
        )
    assert r.status_code == 200
    row = r.json()[0]
    assert row["source"] == "none"
    assert row.get("asset_class") in (None, "")
