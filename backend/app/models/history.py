from sqlalchemy import Column, Integer, Text, String, DateTime, ForeignKey, Index
from sqlalchemy.orm import relationship
from datetime import datetime
from app.db.base_class import Base

class ReportHistory(Base):
    __tablename__ = "report_history"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    template_id = Column(Integer, ForeignKey("report_templates.id"), nullable=False)
    generated_at = Column(DateTime, default=datetime.utcnow)
    applied_params_json = Column(Text, nullable=False) 
    user_comment = Column(Text, nullable=True) 
    pdf_file_path = Column(String, nullable=True)

    user = relationship("User", back_populates="history")
    template = relationship("ReportTemplate", back_populates="history")

Index("ix_report_history_user_template", ReportHistory.user_id, ReportHistory.template_id)