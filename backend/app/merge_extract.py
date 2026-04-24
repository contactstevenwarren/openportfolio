from .schemas import ExtractedPosition

_SPAN_JOIN = " | "
_SPAN_CAP = 2000
_SPAN_SUFFIX = " […]"
_TRUNC_NOTE = "merged duplicate rows; span truncated"


def _sum_optional(values: list[float | None]) -> float | None:
    nums = [v for v in values if v is not None]
    if not nums:
        return None
    return float(sum(nums))


def merge_duplicate_tickers(positions: list[ExtractedPosition]) -> list[ExtractedPosition]:
    """Merge rows that share the same normalized ticker (strip + upper)."""

    groups: dict[str, list[ExtractedPosition]] = {}
    order: list[str] = []
    for p in positions:
        key = p.ticker.strip().upper()
        if key not in groups:
            order.append(key)
            groups[key] = []
        groups[key].append(p)

    out: list[ExtractedPosition] = []
    for key in order:
        grp = groups[key]
        if len(grp) == 1:
            out.append(grp[0])
            continue

        joined = _SPAN_JOIN.join(p.source_span for p in grp)
        capped = False
        if len(joined) > _SPAN_CAP:
            capped = True
            keep = _SPAN_CAP - len(_SPAN_SUFFIX)
            if keep < 0:
                keep = 0
            joined = joined[:keep] + _SPAN_SUFFIX

        errs: list[str] = []
        for p in grp:
            errs.extend(p.validation_errors)
        if capped and _TRUNC_NOTE not in errs:
            errs.append(_TRUNC_NOTE)

        merged = ExtractedPosition(
            ticker=grp[0].ticker,
            shares=float(sum(p.shares for p in grp)),
            cost_basis=_sum_optional([p.cost_basis for p in grp]),
            market_value=_sum_optional([p.market_value for p in grp]),
            confidence=min(p.confidence for p in grp),
            source_span=joined,
            validation_errors=errs,
        )
        out.append(merged)
    return out
