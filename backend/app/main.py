import os
import mimetypes
from fastapi import FastAPI, Request, HTTPException 
from fastapi.responses import FileResponse          
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from app.db.session import engine
from app.db.base_class import Base

# 1. ИМПОРТ МОДЕЛЕЙ ДЛЯ СИНХРОНИЗАЦИИ С БД
from app.models.template import ReportTemplate, TemplateParameter 
from app.models.user import User 
from app.models.history import ReportHistory 
from app.models.purchase import Purchase

# Автоматическое создание таблиц в базе данных
Base.metadata.create_all(bind=engine)

# 2. ИМПОРТ РОУТЕРОВ
from app.api.purchases import router as purchases_router
from app.api.auth import router as auth_router
from app.api.reports import router as reports_router 
from app.api.prices import router as prices_router 
from app.api.templates import router as templates_router 

app = FastAPI(title="Report Craft API")

mimetypes.add_type("text/css", ".css")
mimetypes.add_type("application/javascript", ".js")

# Настройка CORS
origins = [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "http://localhost:5500",
    "http://127.0.0.1:5500",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Базовый эндпоинт проверки бэкенда
@app.get("/api")
def read_root():
    return {"message": "API is working successfully"}

# 3. ПОДКЛЮЧЕНИЕ РОУТЕРОВ БИЗНЕС-ЛОГИКИ (С префиксом /api)
app.include_router(auth_router, prefix="/api")
app.include_router(reports_router, prefix="/api")
app.include_router(prices_router, prefix="/api")
app.include_router(templates_router, prefix="/api") 
app.include_router(purchases_router, prefix="/api")

# Автоматическое создание папки для генерации PDF, если её нет
PDF_OUTPUT_DIR = "../generated_pdfs"
if not os.path.exists(PDF_OUTPUT_DIR):
    os.makedirs(PDF_OUTPUT_DIR)

# Определяем пути к фронтенду
current_dir = os.path.dirname(os.path.abspath(__file__))  # папка backend/app/
backend_dir = os.path.dirname(current_dir)                # папка backend/
project_root = os.path.dirname(backend_dir)               # корень всего проекта (ReportCraft)
frontend_path = os.path.join(project_root, "frontend")

# ГЛОБАЛЬНЫЙ ОБРАБОТЧИК ОШИБКИ 404 (Кастомная страница из папки pages)
@app.exception_handler(HTTPException)
async def custom_http_exception_handler(request: Request, exc: HTTPException):
    # Если ошибка 404 и запрос пришел НЕ на API
    if exc.status_code == 404 and not request.url.path.startswith("/api"):
        path_to_404 = os.path.join(frontend_path, "pages", "404.html")
        
        if os.path.exists(path_to_404):
            return FileResponse(path_to_404, status_code=404)
            
    from fastapi.responses import JSONResponse
    return JSONResponse(status_code=exc.status_code, content={"detail": exc.detail})

# Перехватываем системные 404 ошибки от Starlette (неверный URL страницы в браузере)
@app.exception_handler(404)
async def not_found_exception_handler(request: Request, exc):
    if not request.url.path.startswith("/api"):
        path_to_404 = os.path.join(frontend_path, "pages", "404.html")
        if os.path.exists(path_to_404):
            return FileResponse(path_to_404, status_code=404)
            
    from fastapi.responses import JSONResponse
    return JSONResponse(status_code=404, content={"detail": "Not Found"})


# 4. РАЗДАЧА ФРОНТЕНДА (СТРОГО В КОНЦЕ ФАЙЛА)
if os.path.exists(frontend_path):
    app.mount("/css", StaticFiles(directory=os.path.join(frontend_path, "css")), name="css")
    app.mount("/js", StaticFiles(directory=os.path.join(frontend_path, "js")), name="js")
    app.mount("/pages", StaticFiles(directory=os.path.join(frontend_path, "pages")), name="pages")
    
    app.mount("/", StaticFiles(directory=frontend_path, html=False), name="frontend")
else:
    print(f"⚠️ Предупреждение: Папка фронтенда не найдена по пути {frontend_path}")