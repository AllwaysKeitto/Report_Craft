from sqlalchemy import Column, Integer, DateTime, ForeignKey, String
from sqlalchemy.orm import relationship
from datetime import datetime
from app.db.base_class import Base

class Purchase(Base):
    __tablename__ = "purchases"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    template_id = Column(Integer, ForeignKey("report_templates.id"), nullable=False)
    purchased_at = Column(DateTime, default=datetime.utcnow)
    status = Column(String, default="completed")

    user = relationship("User", back_populates="purchases")
    template = relationship("ReportTemplate", back_populates="purchases")