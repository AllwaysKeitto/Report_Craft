from sqlalchemy import Column, Integer, String, Text, Float, Boolean, DateTime, ForeignKey
from sqlalchemy.orm import relationship
from datetime import datetime
from app.db.base_class import Base

class ReportTemplate(Base):
    __tablename__ = "report_templates"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String, nullable=False)
    description = Column(Text, nullable=True)
    # JSON-структура хранит Figma-координаты виджетов (x, y, w, h, масштаб, тип графика ECharts)
    layout_json = Column(Text, nullable=False) 
    price = Column(Float, default=0.0) 
    is_public = Column(Boolean, default=False) 
    is_archived = Column(Boolean, default=False, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    parameters = relationship("TemplateParameter", back_populates="template", cascade="all, delete-orphan")
    purchases = relationship("Purchase", back_populates="template")
    history = relationship("ReportHistory", back_populates="template")

class TemplateParameter(Base):
    __tablename__ = "template_parameters"

    id = Column(Integer, primary_key=True, index=True)
    template_id = Column(Integer, ForeignKey("report_templates.id"), nullable=False)
    param_key = Column(String, nullable=False) # Например, "ticker" (для yfinance)
    param_type = Column(String, nullable=False) # "string", "number", "date"
    default_value = Column(String, nullable=True)
    description = Column(String, nullable=True)

    template = relationship("ReportTemplate", back_populates="parameters")