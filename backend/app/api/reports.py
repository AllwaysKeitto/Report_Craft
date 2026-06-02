import os
import json
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse
import yfinance as ticker_api
from app.models.template import ReportTemplate
from sqlalchemy.orm import Session
from typing import List

router = APIRouter(tags=["Reports & Constructor"])

from app.db.session import get_db
from app.schemas.report import ReportRenderRequest, ReportHistoryResponse
from app.models.history import ReportHistory
from app.crud import crud_template, crud_purchase
from app.api.auth import get_current_user
from app.services import finance_api, pdf_generator

router = APIRouter(prefix="/reports", tags=["Reports Rendering & PDF"])

# Папка для локального хранения PDF на бэкенде
PDF_OUTPUT_DIR = "../generated_pdfs"

@router.post("/render")
def render_report(request: ReportRenderRequest, db: Session = Depends(get_db), current_user = Depends(get_current_user)):
    # 1. Проверяем доступность шаблона (для обычных пользователей проверяем факт покупки)
    template = crud_template.get_template(db, template_id=request.template_id)
    if not template:
        raise HTTPException(status_code=404, detail="Template not found")
        
    if current_user.role_id != 1:  # Если не админ
        has_access = crud_purchase.check_user_has_template(db, user_id=current_user.id, template_id=request.template_id)
        if not has_access and template.price > 0:
            raise HTTPException(status_code=403, detail="You must purchase this template first")

    # 2. Парсим параметры для yfinance (например, извлечение тикера акций)
    try:
        params = json.loads(request.applied_params_json)
        ticker = params.get("ticker", "AAPL")
        period = params.get("period", "1mo")
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid applied_params_json format")

    # 3. Получаем финансовые данные с учетом кэширования в SQLite
    finance_data = finance_api.get_financial_data(db, ticker=ticker, period=period)
    if "error" in finance_data:
        raise HTTPException(status_code=400, detail=finance_data["error"])

    # 4. Генерируем уникальный PDF-файл
    pdf_filename = f"report_{current_user.id}_{template.id}_{os.urandom(4).hex()}.pdf"
    pdf_path = os.path.join(PDF_OUTPUT_DIR, pdf_filename)
    
    pdf_generator.generate_report_pdf(
        filename=pdf_path,
        report_title=template.title,
        finance_data=finance_data,
        comment=request.user_comment or ""
    )

    # 5. Логируем операцию в историю генераций
    db_history = ReportHistory(
        user_id=current_user.id,
        template_id=template.id,
        applied_params_json=request.applied_params_json,
        user_comment=request.user_comment,
        pdf_file_path=pdf_path
    )
    db.add(db_history)
    db.commit()
    db.refresh(db_history)

    # Возвращаем структурированные данные для отображения в UI через ECharts и ссылку на PDF
    return {
        "history_id": db_history.id,
        "layout_json": json.loads(template.layout_json), # Передаем координаты блоков "Figma"
        "finance_data": finance_data,
        "pdf_url": f"/api/reports/download/{db_history.id}"
    }

@router.get("/history", response_model=List[ReportHistoryResponse])
def get_history(db: Session = Depends(get_db), current_user = Depends(get_current_user)):
    return db.query(ReportHistory).filter(ReportHistory.user_id == current_user.id).all()

@router.get("/download/{history_id}")
def download_pdf(history_id: int, db: Session = Depends(get_db), current_user = Depends(get_current_user)):
    record = db.query(ReportHistory).filter(ReportHistory.id == history_id).first()
    if not record:
        raise HTTPException(status_code=404, detail="Record not found")
        
    # Защита данных: обычный пользователь видит только свои отчеты
    if current_user.role_id != 1 and record.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Access denied")
        
    if not os.path.exists(record.pdf_file_path):
        raise HTTPException(status_code=404, detail="PDF file not found on disk")
        
    return FileResponse(record.pdf_file_path, media_type="application/pdf", filename=os.path.basename(record.pdf_file_path))


@router.get("/reports/market-data")
def get_market_data(ticker: str, period: str = "1mo", interval: str = "1d"):
    """
    Получает данные из Yahoo Finance и форматирует их для графиков ECharts
    """
    try:
        stock = ticker_api.Ticker(ticker)
        hist = stock.history(period=period, interval=interval)
        
        if hist.empty:
            raise HTTPException(status_code=404, detail=f"Тикер {ticker} не найден или данные пустые")
            
        # Форматируем данные для свечного графика ECharts: [Дата, Открытие, Закрытие, Минимум, Максимум]
        categories = [date.strftime('%Y-%m-%d') for date in hist.index]
        values = hist[['Open', 'Close', 'Low', 'High']].values.tolist()
        volumes = hist['Volume'].values.tolist()

        return {
            "ticker": ticker,
            "categories": categories, # Ось X
            "values": values,         # Свечи
            "volumes": volumes        # Объемы торгов
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Ошибка сбора данных: {str(e)}")

@router.post("/reports/templates")
def save_template(data: dict, db: Session = Depends(get_db)):
    """
    Сохраняет структуру шаблона из конструктора в БД
    """
    new_template = ReportTemplate(
        title=data.get("title", "Новый отчет"),
        description=data.get("description", ""),
        layout_json=json.dumps(data.get("layout", [])),
        price=data.get("price", 0.0),
        is_public=data.get("is_public", False)
    )
    db.add(new_template)
    db.db.commit()
    db.refresh(new_template)
    return {"status": "success", "template_id": new_template.id}