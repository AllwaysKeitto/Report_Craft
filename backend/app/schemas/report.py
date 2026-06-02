from pydantic import BaseModel
from typing import Optional
from datetime import datetime

class ReportRenderRequest(BaseModel):
    template_id: int
    applied_params_json: str  # Параметры, переданные в yfinance (например: {"ticker": "AAPL"})
    user_comment: Optional[str] = None

class ReportHistoryResponse(BaseModel):
    id: int
    user_id: int
    template_id: int
    generated_at: datetime
    applied_params_json: str
    user_comment: Optional[str] = None
    pdf_file_path: Optional[str] = None

    class Config:
        from_attributes = True