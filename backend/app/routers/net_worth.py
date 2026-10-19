"""Net worth and financial accounts router."""

from fastapi import APIRouter, Depends, status
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session

from app.database import get_db
from app.schemas.common import ApiResponse
from app.schemas.financial_account import (
    FinancialAccountCreate,
    FinancialAccountResponse,
    FinancialAccountUpdate,
    NetWorthSnapshotResponse,
    NetWorthSummaryResponse,
)
from app.services.financial_account_service import FinancialAccountService
from fastapi import HTTPException

router = APIRouter(prefix="/api/net-worth", tags=["net-worth"])


@router.get("/accounts", response_model=ApiResponse[list[FinancialAccountResponse]])
def get_accounts(db: Session = Depends(get_db)) -> ApiResponse[list[FinancialAccountResponse]]:
    return ApiResponse(success=True, data=FinancialAccountService.get_all(db), error=None)


@router.post(
    "/accounts",
    response_model=ApiResponse[FinancialAccountResponse],
    status_code=status.HTTP_201_CREATED,
)
def create_account(
    data: FinancialAccountCreate, db: Session = Depends(get_db)
) -> JSONResponse | ApiResponse[FinancialAccountResponse]:
    try:
        account = FinancialAccountService.create(db, data)
    except HTTPException as exc:
        return JSONResponse(
            status_code=exc.status_code,
            content={"success": False, "data": None, "error": exc.detail},
        )
    return ApiResponse(success=True, data=account, error=None)


@router.put("/accounts/{account_id}", response_model=ApiResponse[FinancialAccountResponse])
def update_account(
    account_id: int, data: FinancialAccountUpdate, db: Session = Depends(get_db)
) -> JSONResponse | ApiResponse[FinancialAccountResponse]:
    try:
        account = FinancialAccountService.update(db, account_id, data)
    except HTTPException as exc:
        return JSONResponse(
            status_code=exc.status_code,
            content={"success": False, "data": None, "error": exc.detail},
        )
    return ApiResponse(success=True, data=account, error=None)


@router.delete("/accounts/{account_id}", response_model=ApiResponse[None])
def delete_account(
    account_id: int, db: Session = Depends(get_db)
) -> JSONResponse | ApiResponse[None]:
    try:
        FinancialAccountService.delete(db, account_id)
    except HTTPException as exc:
        return JSONResponse(
            status_code=exc.status_code,
            content={"success": False, "data": None, "error": exc.detail},
        )
    return ApiResponse(success=True, data=None, error=None)


@router.get("/summary", response_model=ApiResponse[NetWorthSummaryResponse])
def get_summary(db: Session = Depends(get_db)) -> ApiResponse[NetWorthSummaryResponse]:
    return ApiResponse(success=True, data=FinancialAccountService.get_summary(db), error=None)


@router.get("/snapshots", response_model=ApiResponse[list[NetWorthSnapshotResponse]])
def get_snapshots(db: Session = Depends(get_db)) -> ApiResponse[list[NetWorthSnapshotResponse]]:
    return ApiResponse(success=True, data=FinancialAccountService.get_snapshots(db), error=None)
