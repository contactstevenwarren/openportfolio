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
from app.models import Account, Classification, ClassificationBucket, Position, Provenance

from tests.db_helpers import seed_user_classification


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
        client.patch(
            "/api/classifications/VTI",
            json={
                "buckets": [{"asset_class": "Stocks", "sub_class": "US Stocks", "weight": 1.0}]
            },
        ).status_code
        == 401
    )
    assert client.delete("/api/classifications/VTI").status_code == 401


# --- taxonomy -------------------------------------------------------------


def test_taxonomy_returns_friendly_labels(
    client: TestClient, auth_headers: dict[str, str]
) -> None:
    body = client.get("/api/classifications/taxonomy", headers=auth_headers).json()
    by_value = {o["value"]: o["label"] for o in body["asset_classes"]}
    # Locked taxonomy: value and label are the same plain-English string.
    for o in body["asset_classes"]:
        assert o["label"] == o["value"]
    assert by_value["Bonds"] == "Bonds"
    assert set(by_value) >= {
        "Stocks",
        "Bonds",
        "Real Estate",
        "Commodities",
        "Crypto",
        "Cash",
        "Private",
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
    assert vti["how_classified"] == "built_in"


def test_list_shows_user_row_as_override(
    client: TestClient, auth_headers: dict[str, str], test_db: Session
) -> None:
    # BND is yaml-backed (Treasury + Corporate); user overrides to a single bucket.
    seed_user_classification(test_db, "BND", "Bonds", "US Corporate")
    test_db.commit()

    rows = client.get("/api/classifications", headers=auth_headers).json()
    bnd = next(r for r in rows if r["ticker"] == "BND")
    assert bnd["source"] == "user"
    assert bnd["buckets"][0]["sub_class"] == "US Corporate"
    assert bnd["overrides_yaml"] is True
    assert bnd["how_classified"] == "unknown"
    # And there's only one BND row (the yaml one is suppressed when
    # user overrides it).
    assert sum(1 for r in rows if r["ticker"] == "BND") == 1


def test_list_exposes_full_breakdown_for_auto_split_funds(
    client: TestClient, auth_headers: dict[str, str]
) -> None:
    # VT is multi-bucket in the seed; list exposes weighted (asset_class, sub_class) rows.
    rows = client.get("/api/classifications", headers=auth_headers).json()
    vt = next(r for r in rows if r["ticker"] == "VT")
    assert vt["has_breakdown"] is True
    subs = {b["sub_class"] for b in vt["buckets"]}
    assert {"US Stocks", "International Developed", "International Emerging"} <= subs
    weights = [b["weight"] for b in vt["buckets"]]
    assert abs(sum(weights) - 1.0) < 1e-6


def test_list_yaml_visible_when_classification_header_has_no_buckets(
    client: TestClient, auth_headers: dict[str, str], test_db: Session
) -> None:
    """Orphan DB header (no classification_buckets) must not hide YAML seed tickers."""
    test_db.add(Classification(ticker="VT", source="user"))
    test_db.commit()

    rows = client.get("/api/classifications", headers=auth_headers).json()
    vt = next(r for r in rows if r["ticker"] == "VT")
    assert vt["source"] == "yaml"
    assert vt["overrides_yaml"] is False
    assert vt["has_breakdown"] is True


def test_list_single_bucket_fund_still_carries_breakdown(
    client: TestClient, auth_headers: dict[str, str]
) -> None:
    # VTI is a single-bucket stock in the seed.
    rows = client.get("/api/classifications", headers=auth_headers).json()
    vti = next(r for r in rows if r["ticker"] == "VTI")
    assert vti["has_breakdown"] is False
    assert len(vti["buckets"]) == 1
    assert vti["buckets"][0]["sub_class"] == "US Stocks"


def test_list_has_no_breakdown_for_individual_stocks(
    client: TestClient, auth_headers: dict[str, str]
) -> None:
    # AAPL is a single-bucket stock in the seed.
    rows = client.get("/api/classifications", headers=auth_headers).json()
    aapl = next(r for r in rows if r["ticker"] == "AAPL")
    assert aapl["has_breakdown"] is False
    assert len(aapl["buckets"]) == 1


def test_list_new_user_ticker_is_not_an_override(
    client: TestClient, auth_headers: dict[str, str], test_db: Session
) -> None:
    # User-invented ticker with no YAML baseline -- overrides_yaml=False.
    seed_user_classification(test_db, "wine-bottle-2019", "Commodities", "Other Commodities")
    test_db.commit()

    rows = client.get("/api/classifications", headers=auth_headers).json()
    wine = next(r for r in rows if r["ticker"] == "wine-bottle-2019")
    assert wine["source"] == "user"
    assert wine["overrides_yaml"] is False
    assert wine["how_classified"] == "unknown"


# --- PATCH ----------------------------------------------------------------


def test_patch_creates_user_override(
    client: TestClient, auth_headers: dict[str, str], test_db: Session
) -> None:
    r = client.patch(
        "/api/classifications/BND",
        json={
            "buckets": [
                {"asset_class": "Bonds", "sub_class": "US Treasury", "weight": 1.0}
            ],
        },
        headers=auth_headers,
    )
    assert r.status_code == 200
    body = r.json()
    assert body["source"] == "user"
    assert body["buckets"][0]["sub_class"] == "US Treasury"
    assert body["overrides_yaml"] is True
    assert body["how_classified"] == "classifications_ui"

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
            "buckets": [
                {"asset_class": "Bonds", "sub_class": "US Treasury", "weight": 1.0}
            ],
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
    assert fields == {"buckets"}
    for p in prov:
        assert p.source == "user"


def test_patch_updates_existing_user_row(
    client: TestClient, auth_headers: dict[str, str], test_db: Session
) -> None:
    seed_user_classification(test_db, "BND", "Bonds", "US Corporate")
    test_db.commit()

    client.patch(
        "/api/classifications/BND",
        json={
            "buckets": [
                {"asset_class": "Bonds", "sub_class": "US Treasury", "weight": 1.0}
            ],
        },
        headers=auth_headers,
    )

    test_db.expire_all()
    b = (
        test_db.query(ClassificationBucket)
        .filter(ClassificationBucket.ticker == "BND")
        .one()
    )
    assert b.sub_class == "US Treasury"


def test_patch_rejects_invalid_asset_class(
    client: TestClient, auth_headers: dict[str, str]
) -> None:
    r = client.patch(
        "/api/classifications/BND",
        json={
            "buckets": [{"asset_class": "nonsense", "sub_class": "US Treasury", "weight": 1.0}]
        },
        headers=auth_headers,
    )
    assert r.status_code == 422


# --- DELETE ---------------------------------------------------------------


def test_delete_reverts_yaml_ticker_to_baseline(
    client: TestClient, auth_headers: dict[str, str], test_db: Session
) -> None:
    # User override on a YAML-backed ticker -> delete reverts cleanly.
    seed_user_classification(test_db, "BND", "Bonds", "US Corporate")
    test_db.commit()

    r = client.delete("/api/classifications/BND", headers=auth_headers)
    assert r.status_code == 204

    rows = client.get("/api/classifications", headers=auth_headers).json()
    bnd = next(r for r in rows if r["ticker"] == "BND")
    assert bnd["source"] == "yaml"
    subs = {b["sub_class"] for b in bnd["buckets"]}
    assert subs == {"US Treasury", "US Corporate"}


def test_delete_blocked_when_positions_would_orphan(
    client: TestClient, auth_headers: dict[str, str], test_db: Session
) -> None:
    # User-invented ticker + a held position -> delete blocked.
    seed_user_classification(test_db, "wine-bottle-2019", "Commodities", "Other Commodities")
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
    seed_user_classification(test_db, "orphan", "Commodities", "Other Commodities")
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
    assert rows[0]["asset_class"] == "Stocks"
    assert rows[0]["sub_class"] == "US Stocks"


def test_suggest_multi_bucket_yaml_uses_dominant_weight_sub_class(
    client: TestClient, auth_headers: dict[str, str]
) -> None:
    r = client.post(
        "/api/classifications/suggest",
        json={"tickers": ["VT"]},
        headers=auth_headers,
    )
    assert r.status_code == 200
    row = r.json()[0]
    assert row["ticker"] == "VT"
    assert row["source"] == "existing"
    assert row["asset_class"] == "Stocks"
    assert row["sub_class"] == "US Stocks"


def test_suggest_calls_llm_for_unknown_ticker(
    client: TestClient, auth_headers: dict[str, str]
) -> None:
    fake = TickerClassificationResult(
        asset_class="Stocks",
        confidence=0.82,
        reasoning="Large-cap US equity ETF.",
        model="azure/test-deployment",
    )
    with patch("app.llm.classify_ticker", return_value=fake):
        r = client.post(
            "/api/classifications/suggest",
            json={"tickers": ["ZZNOTINSEED99"]},
            headers=auth_headers,
        )
    assert r.status_code == 200
    row = r.json()[0]
    assert row["source"] == "llm"
    assert row["asset_class"] == "Stocks"
    assert row["confidence"] == 0.82
    assert row["reasoning"] == "Large-cap US equity ETF."


def test_suggest_none_when_llm_returns_null(
    client: TestClient, auth_headers: dict[str, str]
) -> None:
    with patch("app.llm.classify_ticker", return_value=None):
        r = client.post(
            "/api/classifications/suggest",
            json={"tickers": ["ZZNOTINSEED99"]},
            headers=auth_headers,
        )
    assert r.status_code == 200
    row = r.json()[0]
    assert row["source"] == "none"
    assert row.get("asset_class") in (None, "")


def test_list_how_classified_import_llm_after_paste_commit(
    client: TestClient, auth_headers: dict[str, str], test_db: Session
) -> None:
    client.post(
        "/api/positions/commit",
        json={
            "source": "paste:fixture",
            "positions": [
                {
                    "ticker": "HOWLLM1",
                    "shares": 1.0,
                    "cost_basis": 10.0,
                    "market_value": 11.0,
                    "confidence": 0.9,
                    "source_span": "x",
                    "classification": {
                        "asset_class": "Stocks",
                        "sub_class": "US Stocks",
                        "auto_suffix": False,
                        "suggestion_reasoning": "Synthetic test reasoning.",
                    },
                }
            ],
        },
        headers=auth_headers,
    )
    rows = client.get("/api/classifications", headers=auth_headers).json()
    row = next(r for r in rows if r["ticker"] == "HOWLLM1")
    assert row["how_classified"] == "import_llm"
    prov = (
        test_db.query(Provenance)
        .filter(Provenance.entity_type == "classification")
        .filter(Provenance.entity_key == "HOWLLM1")
        .one()
    )
    assert prov.llm_span == "Synthetic test reasoning."


def test_list_how_classified_import_manual_when_no_llm_span(
    client: TestClient, auth_headers: dict[str, str]
) -> None:
    client.post(
        "/api/positions/commit",
        json={
            "source": "paste:fixture2",
            "positions": [
                {
                    "ticker": "HOWMAN1",
                    "shares": 1.0,
                    "cost_basis": 10.0,
                    "market_value": 11.0,
                    "confidence": 0.9,
                    "source_span": "x",
                    "classification": {
                        "asset_class": "Bonds",
                        "sub_class": "US Treasury",
                        "auto_suffix": False,
                    },
                }
            ],
        },
        headers=auth_headers,
    )
    rows = client.get("/api/classifications", headers=auth_headers).json()
    row = next(r for r in rows if r["ticker"] == "HOWMAN1")
    assert row["how_classified"] == "import_manual"


# --- suggest case-sensitivity -----------------------------------------------


def test_suggest_matches_yaml_case_insensitively(
    client: TestClient, auth_headers: dict[str, str]
) -> None:
    """Lowercase ticker 'vt' must still match the YAML key 'VT', not fall through to LLM."""
    with patch("app.llm.classify_ticker") as mock_llm:
        r = client.post(
            "/api/classifications/suggest",
            json={"tickers": ["vt"]},
            headers=auth_headers,
        )
    assert r.status_code == 200
    body = r.json()
    assert len(body) == 1
    item = body[0]
    assert item["source"] == "existing"
    assert item["asset_class"] == "Stocks"
    mock_llm.assert_not_called()
