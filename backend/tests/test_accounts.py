"""Tests for /api/accounts."""

from datetime import UTC, datetime

from fastapi.testclient import TestClient
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.main import _migrate_schema
from app.models import Account, Classification, Institution, Position


def test_list_requires_admin_token(client: TestClient) -> None:
    r = client.get("/api/accounts")
    assert r.status_code == 401


def test_create_requires_admin_token(client: TestClient) -> None:
    r = client.post("/api/accounts", json={"label": "IRA"})
    assert r.status_code == 401


def test_list_empty(client: TestClient, auth_headers: dict[str, str]) -> None:
    r = client.get("/api/accounts", headers=auth_headers)
    assert r.status_code == 200
    assert r.json() == []


def test_create_and_list(client: TestClient, auth_headers: dict[str, str]) -> None:
    create = client.post(
        "/api/accounts",
        json={"label": "Fidelity Taxable", "type": "brokerage"},
        headers=auth_headers,
    )
    assert create.status_code == 201
    body = create.json()
    assert body["label"] == "Fidelity Taxable"
    assert body["type"] == "brokerage"
    assert body["id"] > 0

    listed = client.get("/api/accounts", headers=auth_headers).json()
    assert len(listed) == 1
    assert listed[0]["label"] == "Fidelity Taxable"


def test_type_defaults_to_brokerage(
    client: TestClient, auth_headers: dict[str, str]
) -> None:
    r = client.post("/api/accounts", json={"label": "Just a label"}, headers=auth_headers)
    assert r.json()["type"] == "brokerage"


# --- v0.1.5 M2: PATCH + DELETE --------------------------------------------


def test_patch_updates_label_and_type(
    client: TestClient, auth_headers: dict[str, str]
) -> None:
    created = client.post(
        "/api/accounts",
        json={"label": "Old", "type": "brokerage"},
        headers=auth_headers,
    ).json()

    r = client.patch(
        f"/api/accounts/{created['id']}",
        json={"label": "New", "type": "brokerage", "tax_treatment": "hsa"},
        headers=auth_headers,
    )
    assert r.status_code == 200
    body = r.json()
    assert body["label"] == "New"
    assert body["type"] == "brokerage"
    assert body["tax_treatment"] == "hsa"


def test_patch_partial_keeps_unset_fields(
    client: TestClient, auth_headers: dict[str, str]
) -> None:
    created = client.post(
        "/api/accounts",
        json={"label": "Label", "type": "brokerage"},
        headers=auth_headers,
    ).json()

    r = client.patch(
        f"/api/accounts/{created['id']}",
        json={"label": "Renamed"},
        headers=auth_headers,
    )
    assert r.json()["label"] == "Renamed"
    assert r.json()["type"] == "brokerage"


def test_patch_404_on_missing(
    client: TestClient, auth_headers: dict[str, str]
) -> None:
    r = client.patch("/api/accounts/99999", json={"label": "X"}, headers=auth_headers)
    assert r.status_code == 404


def test_delete_cascades_positions(
    client: TestClient, auth_headers: dict[str, str], test_db: Session
) -> None:
    account = Account(label="Doomed", type="brokerage")
    test_db.add(account)
    test_db.commit()
    test_db.add(
        Position(
            account_id=account.id,
            ticker="VTI",
            shares=1.0,
            market_value=1000.0,
            as_of=datetime.now(UTC),
            source="paste",
        )
    )
    test_db.commit()

    r = client.delete(f"/api/accounts/{account.id}", headers=auth_headers)
    assert r.status_code == 204

    # Account gone and its position cascaded. Using the API (not the
    # test_db session) because the session has the row in its identity
    # map from the earlier add; the API opens a fresh session.
    remaining_accounts = client.get("/api/accounts", headers=auth_headers).json()
    assert remaining_accounts == []
    remaining_positions = client.get("/api/positions", headers=auth_headers).json()
    assert remaining_positions == []


def test_delete_404_on_missing(
    client: TestClient, auth_headers: dict[str, str]
) -> None:
    r = client.delete("/api/accounts/99999", headers=auth_headers)
    assert r.status_code == 404


def test_patch_and_delete_require_admin_token(client: TestClient) -> None:
    assert client.patch("/api/accounts/1", json={"label": "X"}).status_code == 401
    assert client.delete("/api/accounts/1").status_code == 401


# --- enriched AccountRead shape -------------------------------------------


def test_list_returns_enriched_shape(
    client: TestClient, auth_headers: dict[str, str], test_db: Session
) -> None:
    """GET /api/accounts returns the enriched shape including balance, class_breakdown, etc."""
    inst = Institution(name="Test Bank")
    test_db.add(inst)
    test_db.commit()

    account = Account(
        label="My Brokerage",
        type="brokerage",
        institution_id=inst.id,
        tax_treatment="taxable",
    )
    test_db.add(account)
    test_db.commit()

    now = datetime.now(UTC)
    # Two classified positions + one unclassified
    test_db.add(Classification(ticker="VTI", asset_class="equity", source="user"))
    test_db.add(Classification(ticker="BND", asset_class="fixed_income", source="user"))
    test_db.commit()

    test_db.add(Position(account_id=account.id, ticker="VTI", shares=10, market_value=2000.0, as_of=now, source="paste"))
    test_db.add(Position(account_id=account.id, ticker="BND", shares=5, market_value=500.0, as_of=now, source="paste"))
    test_db.add(Position(account_id=account.id, ticker="UNKNOWN", shares=1, market_value=100.0, as_of=now, source="manual"))
    test_db.commit()

    r = client.get("/api/accounts", headers=auth_headers)
    assert r.status_code == 200
    rows = r.json()
    assert len(rows) == 1
    row = rows[0]

    assert row["balance"] == 2600.0
    assert row["last_updated_at"] is not None
    assert row["last_update_source"] in ("paste", "manual")
    assert row["position_count"] == 3
    assert row["classified_position_count"] == 2
    assert row["institution_name"] == "Test Bank"
    assert row["institution_id"] == inst.id
    assert row["tax_treatment"] == "taxable"
    assert row["is_manual"] is False
    assert row["is_archived"] is False
    assert row["staleness_threshold_days"] == 30

    # class_breakdown: only non-zero asset classes
    breakdown_classes = {b["asset_class"] for b in row["class_breakdown"]}
    assert "equity" in breakdown_classes
    assert "fixed_income" in breakdown_classes
    # All values positive
    for b in row["class_breakdown"]:
        assert b["value"] > 0


def test_enriched_real_estate_is_manual(
    client: TestClient, auth_headers: dict[str, str]
) -> None:
    # Create via the API so staleness_threshold_days defaults correctly for the type.
    r = client.post(
        "/api/accounts",
        json={"label": "House", "type": "real_estate", "tax_treatment": "taxable",
              "staleness_threshold_days": 90},
        headers=auth_headers,
    )
    assert r.status_code == 201

    r = client.get("/api/accounts", headers=auth_headers)
    row = r.json()[0]
    assert row["is_manual"] is True
    assert row["staleness_threshold_days"] == 90


# --- cross-validation -----------------------------------------------------


def test_invalid_tax_type_combo_rejected_on_create(
    client: TestClient, auth_headers: dict[str, str]
) -> None:
    r = client.post(
        "/api/accounts",
        json={"label": "Bad", "type": "real_estate", "tax_treatment": "hsa"},
        headers=auth_headers,
    )
    assert r.status_code == 422


def test_invalid_tax_type_combo_rejected_on_patch(
    client: TestClient, auth_headers: dict[str, str]
) -> None:
    created = client.post(
        "/api/accounts",
        json={"label": "RE", "type": "real_estate"},
        headers=auth_headers,
    ).json()

    r = client.patch(
        f"/api/accounts/{created['id']}",
        json={"tax_treatment": "tax_deferred"},
        headers=auth_headers,
    )
    assert r.status_code == 422


def test_valid_tax_treatments_on_brokerage(
    client: TestClient, auth_headers: dict[str, str]
) -> None:
    for treatment in ("taxable", "tax_deferred", "tax_free", "hsa"):
        r = client.post(
            "/api/accounts",
            json={"label": f"Acct-{treatment}", "type": "brokerage", "tax_treatment": treatment},
            headers=auth_headers,
        )
        assert r.status_code == 201, f"Expected 201 for tax_treatment={treatment!r}"
        assert r.json()["tax_treatment"] == treatment


# --- HSA migration ---------------------------------------------------------


def test_hsa_migration_converts_type(test_db: Session) -> None:
    """_migrate_schema converts type='hsa' rows to type='brokerage'+tax_treatment='hsa'."""
    # Insert a legacy HSA row directly bypassing ORM validation
    test_db.execute(
        text("INSERT INTO accounts (label, type, currency) VALUES ('Old HSA', 'hsa', 'USD')")
    )
    test_db.commit()

    _migrate_schema(test_db.bind)  # type: ignore[arg-type]

    test_db.expire_all()
    account = test_db.query(Account).filter_by(label="Old HSA").one()
    assert account.type == "brokerage"
    assert account.tax_treatment == "hsa"


def test_archive_round_trip(
    client: TestClient, auth_headers: dict[str, str]
) -> None:
    """PATCH is_archived=true hides the account; PATCH is_archived=false restores it."""
    created = client.post(
        "/api/accounts",
        json={"label": "Old Account", "type": "brokerage"},
        headers=auth_headers,
    ).json()
    account_id = created["id"]
    assert created["is_archived"] is False

    # Archive
    r = client.patch(
        f"/api/accounts/{account_id}",
        json={"is_archived": True},
        headers=auth_headers,
    )
    assert r.status_code == 200
    assert r.json()["is_archived"] is True

    # Confirm GET reflects it
    rows = client.get("/api/accounts", headers=auth_headers).json()
    match = next((a for a in rows if a["id"] == account_id), None)
    assert match is not None
    assert match["is_archived"] is True

    # Unarchive
    r2 = client.patch(
        f"/api/accounts/{account_id}",
        json={"is_archived": False},
        headers=auth_headers,
    )
    assert r2.status_code == 200
    assert r2.json()["is_archived"] is False


def test_hsa_migration_is_idempotent(test_db: Session) -> None:
    """Running _migrate_schema twice leaves the row unchanged on the second run."""
    test_db.execute(
        text("INSERT INTO accounts (label, type, currency) VALUES ('HSA Again', 'hsa', 'USD')")
    )
    test_db.commit()

    _migrate_schema(test_db.bind)  # type: ignore[arg-type]
    _migrate_schema(test_db.bind)  # type: ignore[arg-type]

    test_db.expire_all()
    account = test_db.query(Account).filter_by(label="HSA Again").one()
    assert account.type == "brokerage"
    assert account.tax_treatment == "hsa"


# --- atomic asset account creation (PR 1A) --------------------------------


def test_create_real_estate_account_with_position(
    client: TestClient, auth_headers: dict[str, str]
) -> None:
    """POST /api/accounts with initial_position creates account + position + classification atomically."""
    r = client.post(
        "/api/accounts",
        json={
            "label": "My Home",
            "type": "real_estate",
            "initial_position": {"market_value": 500000.0, "cost_basis": 300000.0},
        },
        headers=auth_headers,
    )
    assert r.status_code == 201
    account = r.json()
    assert account["type"] == "real_estate"
    assert account["position_count"] == 1

    positions = client.get("/api/positions", headers=auth_headers).json()
    assert len(positions) == 1
    pos = positions[0]
    assert pos["ticker"] == "my-home"
    assert pos["market_value"] == 500000.0
    assert pos["cost_basis"] == 300000.0
    assert pos["shares"] == 1.0
    assert pos["source"] == "manual"

    classifications = client.get("/api/classifications", headers=auth_headers).json()
    cls_row = next((c for c in classifications if c["ticker"] == "my-home"), None)
    assert cls_row is not None
    assert cls_row["asset_class"] == "real_estate"
    assert cls_row["source"] == "user"


def test_create_real_estate_account_without_position(
    client: TestClient, auth_headers: dict[str, str]
) -> None:
    """Creating a real_estate account without initial_position is allowed."""
    r = client.post(
        "/api/accounts",
        json={"label": "Vacant Lot", "type": "real_estate"},
        headers=auth_headers,
    )
    assert r.status_code == 201
    assert r.json()["position_count"] == 0

    positions = client.get("/api/positions", headers=auth_headers).json()
    assert positions == []


def test_e1_real_estate_rejects_second_position(
    client: TestClient, auth_headers: dict[str, str]
) -> None:
    """E1: committing a second position to a real_estate account is rejected with 400."""
    created = client.post(
        "/api/accounts",
        json={
            "label": "Duplex",
            "type": "real_estate",
            "initial_position": {"market_value": 400000.0},
        },
        headers=auth_headers,
    ).json()
    account_id = created["id"]

    r = client.post(
        "/api/positions/commit",
        json={
            "account_id": account_id,
            "positions": [
                {
                    "ticker": "second-property",
                    "shares": 1.0,
                    "market_value": 200000.0,
                    "confidence": 1.0,
                    "source_span": "test",
                }
            ],
        },
        headers=auth_headers,
    )
    assert r.status_code == 400
    assert "one position" in r.json()["detail"]
    assert "replace_account=true" in r.json()["detail"]


def test_e1_replace_account_allows_one_rejects_two(
    client: TestClient, auth_headers: dict[str, str]
) -> None:
    """E1: replace_account=True allows replacing with 1 position but rejects 2."""
    created = client.post(
        "/api/accounts",
        json={
            "label": "Condo",
            "type": "real_estate",
            "initial_position": {"market_value": 300000.0},
        },
        headers=auth_headers,
    ).json()
    account_id = created["id"]

    # replace with a single position — should succeed
    r = client.post(
        "/api/positions/commit",
        json={
            "account_id": account_id,
            "replace_account": True,
            "positions": [
                {
                    "ticker": "condo",
                    "shares": 1.0,
                    "market_value": 320000.0,
                    "confidence": 1.0,
                    "source_span": "test",
                }
            ],
        },
        headers=auth_headers,
    )
    assert r.status_code == 201

    # replace with two positions — should be rejected
    r = client.post(
        "/api/positions/commit",
        json={
            "account_id": account_id,
            "replace_account": True,
            "positions": [
                {
                    "ticker": "condo-a",
                    "shares": 1.0,
                    "market_value": 160000.0,
                    "confidence": 1.0,
                    "source_span": "test",
                },
                {
                    "ticker": "condo-b",
                    "shares": 1.0,
                    "market_value": 160000.0,
                    "confidence": 1.0,
                    "source_span": "test",
                },
            ],
        },
        headers=auth_headers,
    )
    assert r.status_code == 400
    assert "one position" in r.json()["detail"]


def test_d1_classification_cleaned_on_asset_account_delete(
    client: TestClient, auth_headers: dict[str, str]
) -> None:
    """D1: deleting a real_estate account removes its synthetic classification."""
    created = client.post(
        "/api/accounts",
        json={
            "label": "Beach House",
            "type": "real_estate",
            "initial_position": {"market_value": 800000.0},
        },
        headers=auth_headers,
    ).json()
    account_id = created["id"]

    classifications_before = client.get("/api/classifications", headers=auth_headers).json()
    assert any(c["ticker"] == "beach-house" for c in classifications_before)

    r = client.delete(f"/api/accounts/{account_id}", headers=auth_headers)
    assert r.status_code == 204

    classifications_after = client.get("/api/classifications", headers=auth_headers).json()
    assert not any(c["ticker"] == "beach-house" for c in classifications_after)


def test_d1_recreate_after_delete_uses_same_ticker(
    client: TestClient, auth_headers: dict[str, str]
) -> None:
    """D1: after deleting an account its ticker is freed so recreating uses the same slug."""
    created = client.post(
        "/api/accounts",
        json={
            "label": "My Home",
            "type": "real_estate",
            "initial_position": {"market_value": 500000.0},
        },
        headers=auth_headers,
    ).json()
    account_id = created["id"]

    client.delete(f"/api/accounts/{account_id}", headers=auth_headers)

    recreated = client.post(
        "/api/accounts",
        json={
            "label": "My Home",
            "type": "real_estate",
            "initial_position": {"market_value": 550000.0},
        },
        headers=auth_headers,
    ).json()
    assert recreated["label"] == "My Home"

    # After D1 cleanup the "my-home" ticker is free, so the new account
    # gets "my-home" again (not "my-home-2").
    positions = client.get("/api/positions", headers=auth_headers).json()
    assert len(positions) == 1
    assert positions[0]["ticker"] == "my-home"
    assert positions[0]["market_value"] == 550000.0


def test_d1_orphan_guard_preserves_shared_classification(
    client: TestClient, auth_headers: dict[str, str], test_db: Session
) -> None:
    """D1: classification is NOT removed if another position still references the ticker."""
    re_account = client.post(
        "/api/accounts",
        json={
            "label": "Rental",
            "type": "real_estate",
            "initial_position": {"market_value": 300000.0},
        },
        headers=auth_headers,
    ).json()

    brokerage = client.post(
        "/api/accounts",
        json={"label": "Brokerage", "type": "brokerage"},
        headers=auth_headers,
    ).json()

    # Give the brokerage account a position with the same ticker as the real_estate slug
    from datetime import UTC, datetime as dt
    test_db.add(
        Position(
            account_id=brokerage["id"],
            ticker="rental",
            shares=1.0,
            market_value=300000.0,
            as_of=dt.now(UTC),
            source="manual",
        )
    )
    test_db.commit()

    client.delete(f"/api/accounts/{re_account['id']}", headers=auth_headers)

    classifications = client.get("/api/classifications", headers=auth_headers).json()
    assert any(c["ticker"] == "rental" for c in classifications)


def test_patch_position_as_of(
    client: TestClient, auth_headers: dict[str, str]
) -> None:
    """PATCH /api/positions/{id} with as_of persists the date on the position."""
    account = client.post(
        "/api/accounts",
        json={
            "label": "Test Brokerage",
            "type": "real_estate",
            "initial_position": {"market_value": 100000.0},
        },
        headers=auth_headers,
    ).json()

    positions = client.get("/api/positions", headers=auth_headers).json()
    assert len(positions) == 1
    pos_id = positions[0]["id"]

    r = client.patch(
        f"/api/positions/{pos_id}",
        json={"as_of": "2024-03-15T00:00:00"},
        headers=auth_headers,
    )
    assert r.status_code == 200
    updated = r.json()
    assert updated["as_of"].startswith("2024-03-15")
