"""YAML-backed ticker classifications (docs/architecture.md classification and look-through).

YAML is the source of truth in v0.1. The `classifications` DB table stays
empty until M3 introduces user overrides, at which point user rows take
precedence over the YAML baseline.

Synthetic tickers (M3 manual entry for non-brokerage assets) use prefixes
like ``REALESTATE:123Main`` or ``CRYPTO:solana``. They don't belong in the
YAML -- ``classify()`` resolves them by prefix after the exact-match
lookup fails.
"""

from dataclasses import dataclass, replace
from pathlib import Path

import yaml

REPO_ROOT = Path(__file__).resolve().parent.parent.parent
DEFAULT_PATH = REPO_ROOT / "data" / "classifications.yaml"


@dataclass(frozen=True)
class ClassificationEntry:
    ticker: str
    asset_class: str
    sub_class: str | None = None
    sector: str | None = None
    region: str | None = None


# Prefix-based classification for synthetic tickers entered through the
# /manual form. The frontend form emits these prefixes; anything matching
# here bypasses the YAML lookup. Keys are uppercased before compare so
# ``realestate:123main`` resolves the same as ``REALESTATE:123Main``.
_SYNTHETIC_PREFIXES: dict[str, ClassificationEntry] = {
    "REALESTATE": ClassificationEntry(
        ticker="REALESTATE",
        asset_class="real_estate",
        sub_class="direct",
        sector="real_estate",
        region="US",
    ),
    "GOLD": ClassificationEntry(
        ticker="GOLD",
        asset_class="commodity",
        sub_class="gold",
    ),
    "SILVER": ClassificationEntry(
        ticker="SILVER",
        asset_class="commodity",
        sub_class="silver",
    ),
    "CRYPTO": ClassificationEntry(
        ticker="CRYPTO",
        asset_class="crypto",
        sub_class="other",
    ),
    "PRIVATE": ClassificationEntry(
        ticker="PRIVATE",
        asset_class="private",
        sub_class="equity",
    ),
    "HSA_CASH": ClassificationEntry(
        ticker="HSA_CASH",
        asset_class="cash",
        sub_class="hsa_cash",
    ),
    # Generic cash pool for checking / savings / brokerage sweep cash that
    # isn't tied to an HSA (e.g. ``CASH:ally``, ``CASH:wf-checking``).
    "CASH": ClassificationEntry(
        ticker="CASH",
        asset_class="cash",
        sub_class="cash",
    ),
    # Directly-held Treasury notes / bills (brokerage shows the CUSIP, not
    # an ETF ticker). ``TREASURY:91282CKE0`` is the natural encoding.
    "TREASURY": ClassificationEntry(
        ticker="TREASURY",
        asset_class="fixed_income",
        sub_class="us_treasury",
        region="US",
    ),
    # Treasury Inflation-Protected Securities held directly (TreasuryDirect).
    "TIPS": ClassificationEntry(
        ticker="TIPS",
        asset_class="fixed_income",
        sub_class="us_tips",
        region="US",
    ),
    # FDIC-insured CDs held inside a brokerage (Schwab, Vanguard, etc.).
    # Treated as cash-equivalent for the 5-number summary.
    "CD": ClassificationEntry(
        ticker="CD",
        asset_class="cash",
        sub_class="cd",
    ),
    # Employer stock held through an ESPP / RSU grant. Classified as a
    # generic US large-cap equity; user can override via /positions if
    # the employer is small/mid/foreign.
    "ESPP": ClassificationEntry(
        ticker="ESPP",
        asset_class="equity",
        sub_class="us_large_cap",
        sector="diversified",
        region="US",
    ),
}


def load_classifications(path: Path = DEFAULT_PATH) -> dict[str, ClassificationEntry]:
    with path.open() as f:
        raw = yaml.safe_load(f)
    if not isinstance(raw, dict):
        raise ValueError(f"classifications YAML must be a top-level mapping: {path}")

    entries: dict[str, ClassificationEntry] = {}
    for ticker, attrs in raw.items():
        if not isinstance(attrs, dict) or not attrs.get("asset_class"):
            raise ValueError(f"ticker {ticker!r} missing required asset_class")
        entries[ticker] = ClassificationEntry(
            ticker=ticker,
            asset_class=attrs["asset_class"],
            sub_class=attrs.get("sub_class"),
            sector=attrs.get("sector"),
            region=attrs.get("region"),
        )
    return entries


def classify(
    ticker: str, entries: dict[str, ClassificationEntry]
) -> ClassificationEntry | None:
    """Resolve a ticker to a ClassificationEntry.

    Exact YAML match wins. Otherwise, if the ticker is synthetic
    (``PREFIX:rest``), we map the prefix to a canned entry and return a
    copy with the real ticker attached so downstream code can still
    group by ticker label when needed.
    """
    exact = entries.get(ticker)
    if exact is not None:
        return exact
    if ":" in ticker:
        prefix = ticker.split(":", 1)[0].upper()
        synth = _SYNTHETIC_PREFIXES.get(prefix)
        if synth is not None:
            return replace(synth, ticker=ticker)
    return None
