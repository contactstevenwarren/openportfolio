"""Unit tests for app.validation.

Each validator is tested in isolation and then composed via
validate_position / annotate. Fixtures are synthesized -- M2.2b's
paste fixtures exercise the end-to-end pipeline.
"""

import pytest

from app.schemas import ExtractedPosition
from app.validation import (
    annotate,
    validate_cost_basis,
    validate_market_value,
    validate_position,
    validate_shares,
    validate_source_span,
    validate_ticker,
)


def _position(**overrides: object) -> ExtractedPosition:
    defaults: dict[str, object] = dict(
        ticker="VTI",
        shares=100.0,
        cost_basis=20000.0,
        confidence=0.95,
        source_span="VTI 100.00 $245.32",
    )
    defaults.update(overrides)
    return ExtractedPosition(**defaults)  # type: ignore[arg-type]


# --- ticker ---------------------------------------------------------------


@pytest.mark.parametrize(
    "ticker",
    # 123VTI is valid: leading digits allowed to store CUSIPs as-is
    # (see fix(validation): widen ticker regex to allow CUSIPs stored as-is)
    ["VTI", "BRK.B", "BTC-USD", "X", "VOOG", "QQQM", "123VTI"],
)
def test_valid_tickers(ticker: str) -> None:
    assert validate_ticker(ticker) == []


@pytest.mark.parametrize(
    "ticker",
    ["vti", "TOOLONGTICKERXY", "", "VTI!", "VT I", "VTI@NYSE"],
)
def test_invalid_tickers(ticker: str) -> None:
    errors = validate_ticker(ticker)
    assert len(errors) == 1
    assert "does not match" in errors[0]


# --- shares ---------------------------------------------------------------


def test_positive_shares_valid() -> None:
    assert validate_shares(100.5) == []


def test_zero_shares_invalid() -> None:
    assert any("> 0" in e for e in validate_shares(0))


def test_negative_shares_invalid() -> None:
    assert any("> 0" in e for e in validate_shares(-10))


def test_implausible_shares_flagged() -> None:
    assert any("plausibility" in e for e in validate_shares(1e9))


# --- cost_basis -----------------------------------------------------------


def test_null_cost_basis_ok() -> None:
    assert validate_cost_basis(None) == []


def test_zero_cost_basis_ok() -> None:
    assert validate_cost_basis(0) == []


def test_negative_cost_basis_rejected() -> None:
    assert any(">= 0" in e for e in validate_cost_basis(-1))


def test_implausible_cost_basis_flagged() -> None:
    assert any("plausibility" in e for e in validate_cost_basis(1e11))


# --- market_value ---------------------------------------------------------


def test_null_market_value_ok() -> None:
    assert validate_market_value(None) == []


def test_negative_market_value_rejected() -> None:
    assert any(">= 0" in e for e in validate_market_value(-1))


def test_implausible_market_value_flagged() -> None:
    assert any("plausibility" in e for e in validate_market_value(1e11))


# --- source_span ----------------------------------------------------------


def test_clean_span_ok() -> None:
    assert validate_source_span("VTI 120 $245.32") == []


def test_five_digit_run_ok() -> None:
    assert validate_source_span("VTI 12345 shares") == []


def test_long_digit_run_flagged() -> None:
    errors = validate_source_span("Account 123456789 VTI 100")
    assert errors and "digit run" in errors[0]


# --- composite ------------------------------------------------------------


def test_valid_position_has_no_errors() -> None:
    assert validate_position(_position()) == []


def test_invalid_position_collects_all_errors() -> None:
    p = _position(
        ticker="bad!",
        shares=-1,
        cost_basis=-5,
        market_value=-10,
        source_span="acct 999999999",
    )
    errors = validate_position(p)
    assert len(errors) == 5


def test_confidence_outside_range_rejected_at_parse_time() -> None:
    # Pydantic enforces 0..1 at construction; the validation layer never
    # sees out-of-range confidence because the row never parses.
    from pydantic import ValidationError

    with pytest.raises(ValidationError):
        ExtractedPosition(
            ticker="VTI",
            shares=1,
            confidence=1.5,
            source_span="VTI 1",
        )


# --- annotate -------------------------------------------------------------


def test_annotate_does_not_mutate_input() -> None:
    original = _position(ticker="bad!")
    annotate([original])
    assert original.validation_errors == []


def test_annotate_populates_errors_on_copy() -> None:
    result = annotate([_position(ticker="bad!")])
    assert len(result[0].validation_errors) == 1


def test_annotate_preserves_order() -> None:
    rows = [
        _position(ticker="VTI"),
        _position(ticker="bad!"),
        _position(ticker="SPY"),
    ]
    result = annotate(rows)
    assert [r.ticker for r in result] == ["VTI", "bad!", "SPY"]
    assert result[0].validation_errors == []
    assert result[1].validation_errors != []
    assert result[2].validation_errors == []


def test_annotate_empty_list() -> None:
    assert annotate([]) == []
