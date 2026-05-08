import pytest

from app.scrub_digits import scrub_digit_runs


@pytest.mark.parametrize(
    ("inp", "expected_sub", "redactions"),
    [
        ("acct 1234567890 here", "[REDACTED]", 1),
        ("no long runs 12345 ok", "12345", 0),
        ("123456", "[REDACTED]", 1),
        ("", "", 0),
    ],
)
def test_scrub_digit_runs_basic(inp: str, expected_sub: str, redactions: int) -> None:
    out, n = scrub_digit_runs(inp)
    assert n == redactions
    if expected_sub == "[REDACTED]":
        assert "[REDACTED]" in out
    else:
        assert expected_sub in out


def test_scrub_excludes_decimal_fraction() -> None:
    """Runs attached to .digit (share / price decimals) stay intact like scrub.ts."""
    text = "shares 123456.789 and cash"
    out, n = scrub_digit_runs(text)
    assert n == 0
    assert "123456.789" in out


def test_scrub_multiple_redactions() -> None:
    out, n = scrub_digit_runs("id 1234567 other 9876543210")
    assert n == 2
    assert out.count("[REDACTED]") == 2


def test_word_boundary_no_match_inside_token() -> None:
    out, n = scrub_digit_runs("x1234567y")
    assert n == 0
