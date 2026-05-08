from app.merge_extract import merge_duplicate_tickers
from app.schemas import ExtractedPosition


def test_merge_sums_and_min_confidence() -> None:
    a = ExtractedPosition(
        ticker="VTI",
        shares=10.0,
        cost_basis=1000.0,
        market_value=1100.0,
        confidence=0.9,
        source_span="a",
    )
    b = ExtractedPosition(
        ticker="vti",
        shares=5.0,
        cost_basis=500.0,
        market_value=600.0,
        confidence=0.7,
        source_span="b",
    )
    out = merge_duplicate_tickers([a, b])
    assert len(out) == 1
    m = out[0]
    assert m.ticker == "VTI"
    assert m.shares == 15.0
    assert m.cost_basis == 1500.0
    assert m.market_value == 1700.0
    assert m.confidence == 0.7
    assert m.source_span == "a | b"


def test_merge_none_numerics() -> None:
    a = ExtractedPosition(
        ticker="X",
        shares=1.0,
        cost_basis=None,
        market_value=None,
        confidence=1.0,
        source_span="p1",
    )
    b = ExtractedPosition(
        ticker="X",
        shares=2.0,
        cost_basis=None,
        market_value=3.0,
        confidence=1.0,
        source_span="p2",
    )
    m = merge_duplicate_tickers([a, b])[0]
    assert m.cost_basis is None
    assert m.market_value == 3.0


def test_no_merge_distinct_tickers() -> None:
    rows = [
        ExtractedPosition(
            ticker="A",
            shares=1.0,
            confidence=1.0,
            source_span="a",
        ),
        ExtractedPosition(
            ticker="B",
            shares=2.0,
            confidence=1.0,
            source_span="b",
        ),
    ]
    assert merge_duplicate_tickers(rows) == rows


def test_span_cap_and_truncation_note() -> None:
    long_a = "x" * 1200
    long_b = "y" * 1200
    a = ExtractedPosition(
        ticker="Z",
        shares=1.0,
        confidence=1.0,
        source_span=long_a,
    )
    b = ExtractedPosition(
        ticker="Z",
        shares=1.0,
        confidence=1.0,
        source_span=long_b,
    )
    m = merge_duplicate_tickers([a, b])[0]
    assert len(m.source_span) == 2000
    assert m.source_span.endswith(" […]")
    assert "merged duplicate rows; span truncated" in m.validation_errors


def test_span_join_exactly_at_cap_no_note() -> None:
    # " | " is 3 chars; two spans of 998 + 3 + 998 = 1999
    s = "s" * 998
    a = ExtractedPosition(ticker="Q", shares=1.0, confidence=1.0, source_span=s)
    b = ExtractedPosition(ticker="Q", shares=1.0, confidence=1.0, source_span=s)
    m = merge_duplicate_tickers([a, b])[0]
    assert len(m.source_span) == 1999
    assert "merged duplicate rows; span truncated" not in m.validation_errors


def test_preserves_order_first_occurrence_groups() -> None:
    a = ExtractedPosition(ticker="B", shares=1.0, confidence=1.0, source_span="b")
    b = ExtractedPosition(ticker="A", shares=1.0, confidence=1.0, source_span="a")
    c = ExtractedPosition(ticker="B", shares=1.0, confidence=1.0, source_span="b2")
    out = merge_duplicate_tickers([a, b, c])
    assert [p.ticker for p in out] == ["B", "A"]
    assert out[0].shares == 2.0
