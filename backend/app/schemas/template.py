from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime

class ParameterBase(BaseModel):
    param_key: str
    param_type: str
    default_value: Optional[str] = None
    description: Optional[str] = None

class ParameterCreate(ParameterBase):
    pass

class ParameterResponse(ParameterBase):
    id: int
    template_id: int

    class Config:
        from_attributes = True

class TemplateBase(BaseModel):
    title: str
    description: Optional[str] = None
    layout_json: str  
    price: float = 0.0
    is_public: bool = False
    is_archived: bool = False

class TemplateCreate(TemplateBase):
    parameters: List[dict] = [] # или ParameterCreate

class TemplateUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    layout_json: Optional[str] = None
    price: Optional[float] = None
    is_public: Optional[bool] = None
    is_archived: Optional[bool] = None

class TemplateResponse(TemplateBase):
    id: int
    created_at: datetime
    # Если в параметрах используется схема, оставь её, либо List[dict] для теста
    parameters: List[dict] = []

    class Config:
        from_attributes = True  