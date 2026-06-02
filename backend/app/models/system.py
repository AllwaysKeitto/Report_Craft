from sqlalchemy import Column, Integer, String, Text, DateTime, Index
from datetime import datetime
from app.db.base_class import Base

class ApiCache(Base):
    __tablename__ = "api_cache"

    id = Column(Integer, primary_key=True, index=True)
    cache_key = Column(String, unique=True, nullable=False, index=True) 
    response_data = Column(Text, nullable=False) 
    updated_at = Column(DateTime, default=datetime.utcnow)

class SystemSetting(Base):
    __tablename__ = "system_settings"

    id = Column(Integer, primary_key=True, index=True)
    setting_key = Column(String, unique=True, nullable=False, index=True)
    setting_value = Column(String, nullable=False)
    description = Column(String, nullable=True)

# Сводный индекс для мониторинга устаревания кэша производительности
Index("ix_api_cache_key_time", ApiCache.cache_key, ApiCache.updated_at)