"""Income sources and cash flow summary API router."""

from fastapi import APIRouter, Depends, status
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session

from app.database import get_db
from app.schemas.income import IncomeSourceCreate, IncomeSourceUpdate
from app.services.income_service import IncomeNotFoundError, IncomeService

router = APIRouter(prefix="/api", tags=["income"])


@router.get("/income")
def get_income_sources(db: Session = Depends(get_db)) -> JSONResponse:
    """Retrieve all income sources."""
    sources = IncomeService.get_all(db)
    return JSONResponse(
        status_code=status.HTTP_200_OK,
        content={
            "success": True,
            "data": [s.model_dump(mode="json") for s in sources],
            "error": None,
        },
    )


@router.post("/income", status_code=status.HTTP_201_CREATED)
def create_income_source(
    data: IncomeSourceCreate, db: Session = Depends(get_db)
) -> JSONResponse:
    """Add an income source."""
    source = IncomeService.create(db, data)
    return JSONResponse(
        status_code=status.HTTP_201_CREATED,
        content={
            "success": True,
            "data": source.model_dump(mode="json"),
            "error": None,
        },
    )


@router.put("/income/{income_id}")
def update_income_source(
    income_id: int, data: IncomeSourceUpdate, db: Session = Depends(get_db)
) -> JSONResponse:
    """Edit an income source."""
    try:
        source = IncomeService.update(db, income_id, data)
        return JSONResponse(
            status_code=status.HTTP_200_OK,
            content={
                "success": True,
                "data": source.model_dump(mode="json"),
                "error": None,
            },
        )
    except IncomeNotFoundError as e:
        return JSONResponse(
            status_code=status.HTTP_404_NOT_FOUND,
            content={"success": False, "data": None, "error": str(e)},
        )


@router.delete("/income/{income_id}")
def delete_income_source(income_id: int, db: Session = Depends(get_db)) -> JSONResponse:
    """Delete an income source."""
    try:
        IncomeService.delete(db, income_id)
        return JSONResponse(
            status_code=status.HTTP_200_OK,
            content={"success": True, "data": None, "error": None},
        )
    except IncomeNotFoundError as e:
        return JSONResponse(
            status_code=status.HTTP_404_NOT_FOUND,
            content={"success": False, "data": None, "error": str(e)},
        )


@router.get("/cash-flow/summary")
def get_cash_flow_summary(db: Session = Depends(get_db)) -> JSONResponse:
    """Monthly income vs fixed costs, and emergency-fund coverage."""
    summary = IncomeService.get_cash_flow_summary(db)
    return JSONResponse(
        status_code=status.HTTP_200_OK,
        content={
            "success": True,
            "data": summary.model_dump(mode="json"),
            "error": None,
        },
    )
