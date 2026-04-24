"""Tests for POST /api/positions/commit."""

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.models import Account, Classification, Position, Provenance


def _body(**overrides: object) -> dict[str, object]:
    base: dict[str, object] = {
        "source": "paste:fidelity-2026-04-19",
        "positions": [
            {
                "ticker": "VTI",
                "shares": 120.0,
                "cost_basis": 22000.0,
                "market_value": 29438.40,
                "confidence": 0.98,
                "source_span": "VTI 120.000 $29,438.40",
            }
        ],
    }
    base.update(overrides)
    return base


def test_requires_admin_token(client: TestClient) -> None:
    r = client.post("/api/positions/commit", json=_body())
    assert r.status_code == 401


def test_auto_seeds_default_account_on_first_commit(
    client: TestClient, auth_headers: dict[str, str], test_db: Session
) -> None:
    assert test_db.query(Account).count() == 0

    r = client.post("/api/positions/commit", json=_body(), headers=auth_headers)
    assert r.status_code == 201

    account = test_db.query(Account).one()
    assert account.label == "Default"
    assert account.type == "brokerage"
    assert r.json()["account_id"] == account.id


def test_uses_explicit_account_id(
    client: TestClient, auth_headers: dict[str, str], test_db: Session
) -> None:
    account = Account(label="Schwab Roth", type="brokerage")
    test_db.add(account)
    test_db.commit()
    body = _body(account_id=account.id)

    r = client.post("/api/positions/commit", json=body, headers=auth_headers)
    assert r.status_code == 201
    assert r.json()["account_id"] == account.id
    # No "Default" was auto-seeded.
    assert test_db.query(Account).count() == 1


def test_unknown_account_returns_404(
    client: TestClient, auth_headers: dict[str, str]
) -> None:
    r = client.post(
        "/api/positions/commit",
        json=_body(account_id=999),
        headers=auth_headers,
    )
    assert r.status_code == 404


def test_writes_position_fields(
    client: TestClient, auth_headers: dict[str, str], test_db: Session
) -> None:
    r = client.post("/api/positions/commit", json=_body(), headers=auth_headers)
    position_id = r.json()["position_ids"][0]

    p = test_db.get(Position, position_id)
    assert p is not None
    assert p.ticker == "VTI"
    assert p.shares == 120.0
    assert p.cost_basis == 22000.0
    assert p.market_value == 29438.40
    assert p.source == "paste:fidelity-2026-04-19"


def test_provenance_rows_created_per_numeric_field(
    client: TestClient, auth_headers: dict[str, str], test_db: Session
) -> None:
    r = client.post("/api/positions/commit", json=_body(), headers=auth_headers)
    position_id = r.json()["position_ids"][0]

    rows = (
        test_db.query(Provenance)
        .filter_by(entity_type="position", entity_id=position_id)
        .all()
    )
    fields = {row.field for row in rows}
    # shares, cost_basis, market_value. ticker is a label, not a number.
    assert fields == {"shares", "cost_basis", "market_value"}
    for row in rows:
        assert row.source == "paste:fidelity-2026-04-19"
        assert row.confidence == 0.98
        assert row.llm_span == "VTI 120.000 $29,438.40"


def test_provenance_skips_null_fields(
    client: TestClient, auth_headers: dict[str, str], test_db: Session
) -> None:
    # Vanguard-style row: market_value only, no cost_basis.
    body = {
        "source": "paste:vanguard",
        "positions": [
            {
                "ticker": "BND",
                "shares": 75.0,
                "cost_basis": None,
                "market_value": 5433.75,
                "confidence": 0.95,
                "source_span": "BND 75.0000 $5,433.75",
            }
        ],
    }

    r = client.post("/api/positions/commit", json=body, headers=auth_headers)
    position_id = r.json()["position_ids"][0]

    fields = {
        row.field
        for row in test_db.query(Provenance).filter_by(entity_id=position_id).all()
    }
    assert fields == {"shares", "market_value"}


def test_commits_multiple_positions(
    client: TestClient, auth_headers: dict[str, str], test_db: Session
) -> None:
    body = {
        "source": "paste:schwab",
        "positions": [
            {
                "ticker": "SPY",
                "shares": 100.0,
                "cost_basis": 48000.0,
                "market_value": 55530.0,
                "confidence": 0.98,
                "source_span": "SPY 100 $55,530",
            },
            {
                "ticker": "QQQ",
                "shares": 50.0,
                "cost_basis": 21200.0,
                "market_value": 24787.5,
                "confidence": 0.98,
                "source_span": "QQQ 50 $24,787.50",
            },
        ],
    }

    r = client.post("/api/positions/commit", json=body, headers=auth_headers)
    assert r.status_code == 201
    ids = r.json()["position_ids"]
    assert len(ids) == 2
    assert len(set(ids)) == 2  # distinct ids
    tickers = {p.ticker for p in test_db.query(Position).all()}
    assert tickers == {"SPY", "QQQ"}


def test_response_includes_final_tickers(
    client: TestClient, auth_headers: dict[str, str]
) -> None:
    # Paste commits pass through the proposed ticker unchanged.
    r = client.post("/api/positions/commit", json=_body(), headers=auth_headers)
    assert r.json()["tickers"] == ["VTI"]


# --- v0.1.5 M4: manual-entry classification + auto-suffix ----------------


def _manual_body(
    label: str,
    asset_class: str,
    sub_class: str | None = None,
    market_value: float = 1000.0,
) -> dict[str, object]:
    return {
        "source": "manual",
        "positions": [
            {
                "ticker": label,
                "shares": 1.0,
                "cost_basis": None,
                "market_value": market_value,
                "confidence": 1.0,
                "source_span": "",
                "classification": {
                    "asset_class": asset_class,
                    "sub_class": sub_class,
                },
            }
        ],
    }


def test_manual_commit_writes_classification_row(
    client: TestClient, auth_headers: dict[str, str], test_db: Session
) -> None:
    r = client.post(
        "/api/positions/commit",
        json=_manual_body("wine-bottle-2019", "commodity", "wine"),
        headers=auth_headers,
    )
    assert r.status_code == 201

    row = test_db.get(Classification, "wine-bottle-2019")
    assert row is not None
    assert row.asset_class == "commodity"
    assert row.sub_class == "wine"
    assert row.source == "user"


def test_manual_commit_auto_suffixes_on_collision(
    client: TestClient, auth_headers: dict[str, str], test_db: Session
) -> None:
    first = client.post(
        "/api/positions/commit",
        json=_manual_body("gold-bar", "commodity", "gold"),
        headers=auth_headers,
    )
    assert first.json()["tickers"] == ["gold-bar"]

    second = client.post(
        "/api/positions/commit",
        json=_manual_body("gold-bar", "commodity", "gold"),
        headers=auth_headers,
    )
    assert second.json()["tickers"] == ["gold-bar-2"]

    third = client.post(
        "/api/positions/commit",
        json=_manual_body("gold-bar", "commodity", "gold"),
        headers=auth_headers,
    )
    assert third.json()["tickers"] == ["gold-bar-3"]

    # Each got its own Classification row.
    assert test_db.get(Classification, "gold-bar") is not None
    assert test_db.get(Classification, "gold-bar-2") is not None
    assert test_db.get(Classification, "gold-bar-3") is not None


def test_manual_commit_writes_provenance_for_classification(
    client: TestClient, auth_headers: dict[str, str], test_db: Session
) -> None:
    client.post(
        "/api/positions/commit",
        json=_manual_body("wine-bottle", "commodity", "wine"),
        headers=auth_headers,
    )

    prov = (
        test_db.query(Provenance)
        .filter(Provenance.entity_type == "classification")
        .filter(Provenance.entity_key == "wine-bottle")
        .all()
    )
    fields = {p.field for p in prov}
    assert fields == {"asset_class", "sub_class", "sector", "region"}
    for p in prov:
        assert p.source == "manual"


def test_manual_commit_rejects_invalid_asset_class(
    client: TestClient, auth_headers: dict[str, str]
) -> None:
    r = client.post(
        "/api/positions/commit",
        json=_manual_body("bad", "nonsense"),
        headers=auth_headers,
    )
    assert r.status_code == 422


def test_paste_commit_without_classification_does_not_touch_classifications(
    client: TestClient, auth_headers: dict[str, str], test_db: Session
) -> None:
    # Baseline: paste of VTI doesn't create a Classification row (YAML
    # covers VTI). Confirms the classification-upsert path is strictly
    # opt-in via the manual flow.
    client.post("/api/positions/commit", json=_body(), headers=auth_headers)
    assert test_db.query(Classification).count() == 0


def test_paste_commit_with_classification_inserts_user_row_for_unknown_ticker(
    client: TestClient, auth_headers: dict[str, str], test_db: Session
) -> None:
    body = {
        "source": "paste:test",
        "positions": [
            {
                "ticker": "ZZUNKNOWN99",
                "shares": 10.0,
                "cost_basis": 100.0,
                "market_value": 110.0,
                "confidence": 0.95,
                "source_span": "ZZUNKNOWN99 10",
                "classification": {
                    "asset_class": "equity",
                    "auto_suffix": False,
                    "suggestion_confidence": 0.8,
                    "suggestion_reasoning": "Test LLM line.",
                },
            }
        ],
    }
    r = client.post("/api/positions/commit", json=body, headers=auth_headers)
    assert r.status_code == 201
    assert r.json()["tickers"] == ["ZZUNKNOWN99"]
    row = test_db.get(Classification, "ZZUNKNOWN99")
    assert row is not None
    assert row.asset_class == "equity"
    assert row.source == "user"


def test_paste_commit_skips_classification_when_matches_yaml(
    client: TestClient, auth_headers: dict[str, str], test_db: Session
) -> None:
    body = {
        "source": "paste:test",
        "positions": [
            {
                "ticker": "VTI",
                "shares": 1.0,
                "cost_basis": 1.0,
                "market_value": 2.0,
                "confidence": 0.95,
                "source_span": "VTI",
                "classification": {
                    "asset_class": "equity",
                    "auto_suffix": False,
                },
            }
        ],
    }
    r = client.post("/api/positions/commit", json=body, headers=auth_headers)
    assert r.status_code == 201
    assert test_db.query(Classification).count() == 0


def test_paste_commit_skips_when_user_classification_row_exists(
    client: TestClient, auth_headers: dict[str, str], test_db: Session
) -> None:
    test_db.add(
        Classification(
            ticker="VTI",
            asset_class="fixed_income",
            sub_class=None,
            sector=None,
            region=None,
            source="user",
        )
    )
    test_db.commit()

    body = {
        "source": "paste:test",
        "positions": [
            {
                "ticker": "VTI",
                "shares": 1.0,
                "cost_basis": 1.0,
                "market_value": 2.0,
                "confidence": 0.95,
                "source_span": "VTI",
                "classification": {
                    "asset_class": "equity",
                    "auto_suffix": False,
                },
            }
        ],
    }
    r = client.post("/api/positions/commit", json=body, headers=auth_headers)
    assert r.status_code == 201
    row = test_db.get(Classification, "VTI")
    assert row is not None
    assert row.asset_class == "fixed_income"


# --- v0.1.5 M6: snapshot-on-commit ---------------------------------------


def test_commit_writes_snapshot_row(
    client: TestClient, auth_headers: dict[str, str], test_db: Session
) -> None:
    import json

    from app.models import Snapshot

    assert test_db.query(Snapshot).count() == 0

    client.post("/api/positions/commit", json=_body(), headers=auth_headers)

    snaps = test_db.query(Snapshot).all()
    assert len(snaps) == 1
    snap = snaps[0]
    assert snap.net_worth_usd == 29438.40

    payload = json.loads(snap.payload_json)
    assert payload["total_usd"] == 29438.40
    assert "equity" in payload["by_asset_class"]
    assert payload["unclassified_count"] == 0
    assert payload["summary"] is not None


def test_each_commit_appends_a_snapshot(
    client: TestClient, auth_headers: dict[str, str], test_db: Session
) -> None:
    from app.models import Snapshot

    client.post("/api/positions/commit", json=_body(), headers=auth_headers)
    client.post("/api/positions/commit", json=_body(), headers=auth_headers)
    assert test_db.query(Snapshot).count() == 2


# --- replace_account (v0.4) ------------------------------------------------


def test_replace_account_requires_account_id(
    client: TestClient, auth_headers: dict[str, str]
) -> None:
    r = client.post(
        "/api/positions/commit",
        json={
            "replace_account": True,
            "source": "paste:t",
            "positions": [
                {
                    "ticker": "VTI",
                    "shares": 1.0,
                    "cost_basis": 1.0,
                    "market_value": 2.0,
                    "confidence": 0.9,
                    "source_span": "x",
                }
            ],
        },
        headers=auth_headers,
    )
    assert r.status_code == 422
    detail = r.json().get("detail", "")
    assert "account_id" in str(detail).lower()


def test_replace_account_empty_positions_422(
    client: TestClient, auth_headers: dict[str, str], test_db: Session
) -> None:
    acct = Account(label="A", type="brokerage")
    test_db.add(acct)
    test_db.commit()
    r = client.post(
        "/api/positions/commit",
        json={
            "replace_account": True,
            "account_id": acct.id,
            "source": "paste:t",
            "positions": [],
        },
        headers=auth_headers,
    )
    assert r.status_code == 422


def test_replace_account_unknown_account_404(
    client: TestClient, auth_headers: dict[str, str]
) -> None:
    r = client.post(
        "/api/positions/commit",
        json={
            "replace_account": True,
            "account_id": 99999,
            "source": "paste:t",
            "positions": [
                {
                    "ticker": "VTI",
                    "shares": 1.0,
                    "cost_basis": 1.0,
                    "market_value": 2.0,
                    "confidence": 0.9,
                    "source_span": "x",
                }
            ],
        },
        headers=auth_headers,
    )
    assert r.status_code == 404


def test_replace_account_deletes_positions_not_in_commit(
    client: TestClient, auth_headers: dict[str, str], test_db: Session
) -> None:
    acct = Account(label="Schwab", type="brokerage")
    test_db.add(acct)
    test_db.commit()

    seed = {
        "account_id": acct.id,
        "source": "paste:seed",
        "positions": [
            {
                "ticker": "VTI",
                "shares": 10.0,
                "cost_basis": 100.0,
                "market_value": 200.0,
                "confidence": 0.9,
                "source_span": "a",
            },
            {
                "ticker": "BND",
                "shares": 5.0,
                "cost_basis": 50.0,
                "market_value": 60.0,
                "confidence": 0.9,
                "source_span": "b",
            },
        ],
    }
    r0 = client.post("/api/positions/commit", json=seed, headers=auth_headers)
    assert r0.status_code == 201
    ids0 = r0.json()["position_ids"]
    tick0 = r0.json()["tickers"]
    vti_id = ids0[tick0.index("VTI")]

    replace = {
        "replace_account": True,
        "account_id": acct.id,
        "source": "paste:replace",
        "positions": [
            {
                "ticker": "vti",
                "shares": 11.0,
                "cost_basis": 101.0,
                "market_value": 201.0,
                "confidence": 0.95,
                "source_span": "upd",
            },
        ],
    }
    r1 = client.post("/api/positions/commit", json=replace, headers=auth_headers)
    assert r1.status_code == 201
    assert r1.json()["position_ids"] == [vti_id]

    rows = test_db.query(Position).filter_by(account_id=acct.id).all()
    assert len(rows) == 1
    assert rows[0].ticker == "VTI"
    assert rows[0].shares == 11.0
    assert rows[0].source == "paste:replace"


def test_replace_account_upsert_adds_provenance_only_for_changed_numerics(
    client: TestClient, auth_headers: dict[str, str], test_db: Session
) -> None:
    acct = Account(label="A", type="brokerage")
    test_db.add(acct)
    test_db.commit()
    client.post(
        "/api/positions/commit",
        json={
            "account_id": acct.id,
            "source": "paste:1",
            "positions": [
                {
                    "ticker": "SPY",
                    "shares": 100.0,
                    "cost_basis": 40000.0,
                    "market_value": 50000.0,
                    "confidence": 0.9,
                    "source_span": "s1",
                },
            ],
        },
        headers=auth_headers,
    )
    pid = test_db.query(Position).filter_by(account_id=acct.id).one().id
    n_before = (
        test_db.query(Provenance)
        .filter_by(entity_type="position", entity_id=pid)
        .count()
    )
    assert n_before == 3

    client.post(
        "/api/positions/commit",
        json={
            "replace_account": True,
            "account_id": acct.id,
            "source": "paste:2",
            "positions": [
                {
                    "ticker": "SPY",
                    "shares": 100.0,
                    "cost_basis": 40000.0,
                    "market_value": 51000.0,
                    "confidence": 0.92,
                    "source_span": "s2",
                },
            ],
        },
        headers=auth_headers,
    )
    n_after = (
        test_db.query(Provenance)
        .filter_by(entity_type="position", entity_id=pid)
        .count()
    )
    assert n_after == n_before + 1
    last = (
        test_db.query(Provenance)
        .filter_by(entity_type="position", entity_id=pid)
        .order_by(Provenance.id.desc())
        .first()
    )
    assert last is not None
    assert last.field == "market_value"
    assert last.source == "paste:2"
    assert last.confidence == 0.92
    assert last.llm_span == "s2"
