from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from app.auth import require_admin_token
from app.db import get_db
from app.schemas import AccountCreate, AccountPatch, AccountRead

from . import service as accounts_svc

router = APIRouter(
    prefix="/api/accounts",
    tags=["accounts"],
    dependencies=[Depends(require_admin_token)],
)


@router.get("", summary="List all accounts")
def list_accounts(db: Session = Depends(get_db)) -> list[AccountRead]:
    return accounts_svc.list_accounts(db)


@router.post("", summary="Create an account", status_code=status.HTTP_201_CREATED)
def create_account(body: AccountCreate, db: Session = Depends(get_db)) -> AccountRead:
    return accounts_svc.create_account(db, body)


@router.patch("/{account_id}", summary="Update an account")
def patch_account(
    account_id: int, body: AccountPatch, db: Session = Depends(get_db)
) -> AccountRead:
    return accounts_svc.patch_account(db, account_id, body)


@router.delete(
    "/{account_id}",
    summary="Delete an account",
    status_code=status.HTTP_204_NO_CONTENT,
)
def delete_account(account_id: int, db: Session = Depends(get_db)) -> None:
    accounts_svc.delete_account(db, account_id)
