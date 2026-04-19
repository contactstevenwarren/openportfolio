"""YAML-backed ticker classifications (roadmap section 6).

YAML is the source of truth in v0.1. The `classifications` DB table stays
empty until M3 introduces user overrides, at which point user rows take
precedence over the YAML baseline.
"""

from dataclasses import dataclass
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
