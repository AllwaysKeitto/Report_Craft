import os
from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    PROJECT_NAME: str = "Report Constructor API"
    SECRET_KEY: str = os.getenv("SECRET_KEY", "SUPER_SECRET_FIGMA_REPORT_KEY_2026")
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24 # 1 день
    
    # SQLite база данных в корне папки backend
    DATABASE_URL: str = os.getenv("DATABASE_URL", "sqlite:///../reports_cache.db")

    class Config:
        case_sensitive = True

settings = Settings()