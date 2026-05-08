"""Test-only helpers for ORM rows."""

from sqlalchemy.orm import Session

from app.models import Classification, ClassificationBucket


def seed_user_classification(
    session: Session,
    ticker: str,
    asset_class: str,
    sub_class: str | None = None,
) -> None:
    session.add(Classification(ticker=ticker, source="user"))
    session.flush()
    session.add(
        ClassificationBucket(
            ticker=ticker,
            sort_order=0,
            asset_class=asset_class,
            sub_class=sub_class,
            weight=1.0,
        )
    )
