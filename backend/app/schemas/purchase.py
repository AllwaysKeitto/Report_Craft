from pydantic import BaseModel
from datetime import datetime

class PurchaseCreate(BaseModel):
    template_id: int

class PurchaseResponse(BaseModel):
    id: int
    user_id: int
    template_id: int
    purchased_at: datetime
    status: str

    class Config:
        from_attributes = True