"""Portfolio analysis router."""

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.database import get_db
from app.schemas.common import ApiResponse
from app.schemas.portfolio_analysis import PortfolioInsight
from app.services.portfolio_analysis_service import PortfolioAnalysisService

router = APIRouter(prefix="/api/portfolio", tags=["portfolio"])


@router.get("/analysis", response_model=ApiResponse[list[PortfolioInsight]])
def get_portfolio_analysis(
    db: Session = Depends(get_db),
) -> ApiResponse[list[PortfolioInsight]]:
    insights = PortfolioAnalysisService.analyse(db)
    return ApiResponse(success=True, data=insights, error=None)
