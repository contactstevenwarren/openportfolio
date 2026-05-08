"""Targets PUT validation and serialized GET payload."""

from __future__ import annotations

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.allocation import aggregate, meaningful_children
from app.constants import VALID_ASSET_CLASSES
from app.models import Target
from app.shared.schemas.allocation import AllocationResult
from app.shared.schemas.targets import TargetsPayload
from app.taxonomy import target_path_is_valid


def targets_sum_ok(pcts: list[int]) -> bool:
    return sum(pcts) == 100


def validate_put_targets(body: TargetsPayload, result: AllocationResult) -> None:
    """Enforce the v0.2 targets contract."""
    paths: list[str] = []
    for r in body.root:
        paths.append(r.path)
    for gkey, rows in body.groups.items():
        if gkey not in VALID_ASSET_CLASSES:
            raise HTTPException(
                status_code=422,
                detail=f"unknown targets group key {gkey!r}",
            )
        for r in rows:
            if not r.path.startswith(f"{gkey}."):
                raise HTTPException(
                    status_code=422,
                    detail=f"path {r.path!r} must start with {(gkey + '.')!r}",
                )
            paths.append(r.path)
    if len(set(paths)) != len(paths):
        raise HTTPException(status_code=422, detail="duplicate target paths")

    for r in body.root:
        if "." in r.path:
            raise HTTPException(
                status_code=422,
                detail=f"root target path must be a single segment; got {r.path!r}",
            )

    for r in body.root:
        if not target_path_is_valid(r.path):
            raise HTTPException(
                status_code=422, detail=f"invalid target path {r.path!r}"
            )
    for rows in body.groups.values():
        for r in rows:
            if not target_path_is_valid(r.path):
                raise HTTPException(
                    status_code=422, detail=f"invalid target path {r.path!r}"
                )

    if result.total <= 0:
        if body.root or any(len(v) > 0 for v in body.groups.values()):
            raise HTTPException(
                status_code=422,
                detail="cannot set targets while the portfolio total is zero",
            )
        return

    if body.root:
        required = {s.name for s in result.by_asset_class if s.value > 0}
        if not required:
            raise HTTPException(
                status_code=422,
                detail="root targets require at least one funded asset class in allocation",
            )
        provided = {r.path for r in body.root}
        if not required.issubset(provided):
            raise HTTPException(
                status_code=422,
                detail=(
                    "root targets must include every funded asset class "
                    f"(missing {sorted(required - provided)})"
                ),
            )
        if not targets_sum_ok([r.pct for r in body.root]):
            raise HTTPException(
                status_code=422,
                detail="root targets must sum to 100",
            )

    by_name = {s.name: s for s in result.by_asset_class}
    for gkey, rows in body.groups.items():
        if not rows:
            continue
        sl = by_name.get(gkey)
        if sl is None or sl.value <= 0:
            raise HTTPException(
                status_code=422,
                detail=f"group {gkey!r} has targets but allocation has no funded slice",
            )
        required_p = {
            f"{gkey}.{c.name}" for c in meaningful_children(sl) if c.value > 0
        }
        provided_p = {r.path for r in rows}
        if required_p != provided_p:
            raise HTTPException(
                status_code=422,
                detail=(
                    f"group {gkey!r} targets must cover every drill slice with dollars "
                    f"exactly once (expected {sorted(required_p)}, got {sorted(provided_p)})"
                ),
            )
        if not targets_sum_ok([r.pct for r in rows]):
            raise HTTPException(
                status_code=422,
                detail=(
                    f"group {gkey!r} targets must sum to 100 "
                    "(% of parent asset class)"
                ),
            )


def get_targets_payload(db: Session) -> dict[str, object]:
    rows = db.query(Target).order_by(Target.path).all()
    root: list[dict[str, object]] = []
    groups: dict[str, list[dict[str, object]]] = {}
    for r in rows:
        pct = int(r.pct)
        if "." not in r.path:
            root.append({"path": r.path, "pct": pct})
        else:
            key, _rest = r.path.split(".", 1)
            groups.setdefault(key, []).append({"path": r.path, "pct": pct})
    for _k, lst in groups.items():
        lst.sort(key=lambda x: str(x["path"]))
    return {"root": root, "groups": groups}
