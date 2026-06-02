import json
from datetime import datetime, timedelta, timezone
import yfinance as yf
from sqlalchemy.orm import Session
from app.models.system import ApiCache

CACHE_EXPIRE_MINUTES = 15

def get_financial_data(db: Session, ticker: str, period: str = "1mo", interval: str = "1d") -> dict:
    """
    Получает исторические данные акций из yfinance с кэшированием в БД.
    """
    cache_key = f"yf_{ticker}_{period}_{interval}".lower()
    
    # Пытаемся найти данные в локальном кэше SQLite
    cached_record = db.query(ApiCache).filter(ApiCache.cache_key == cache_key).first()
    
    if cached_record:
        # Проверяем, не устарел ли кэш (сравниваем с текущим временем UTC)
        now = datetime.now(timezone.utc)
        record_time = cached_record.updated_at.replace(tzinfo=timezone.utc) if cached_record.updated_at.tzinfo is None else cached_record.updated_at
        
        if now - record_time < timedelta(minutes=CACHE_EXPIRE_MINUTES):
            # Кэш валиден, возвращаем данные из БД
            return json.loads(cached_record.response_data)
            
    # Если кэша нет или он устарел — делаем реальный запрос к yfinance API
    try:
        stock = yf.Ticker(ticker)
        hist = stock.history(period=period, interval=interval)
        
        if hist.empty:
            return {"error": f"No data found for ticker {ticker}"}
            
        # Преобразуем DataFrame в структурированный словарь для ECharts
        dates = [date.strftime('%Y-%m-%d') for date in hist.index]
        prices = [round(float(price), 2) for price in hist['Close'].tolist()]
        volumes = [int(vol) for vol in hist['Volume'].tolist()]
        
        result_data = {
            "ticker": ticker.upper(),
            "company_name": stock.info.get("longName", ticker.upper()),
            "currency": stock.info.get("currency", "USD"),
            "dates": dates,
            "prices": prices,
            "volumes": volumes,
            "last_updated": datetime.utcnow().isoformat()
        }
        
        # Сохраняем или обновляем кэш в нашей базе данных
        if cached_record:
            cached_record.response_data = json.dumps(result_data)
            cached_record.updated_at = datetime.utcnow()
        else:
            new_cache = ApiCache(
                cache_key=cache_key,
                response_data=json.dumps(result_data),
                updated_at=datetime.utcnow()
            )
            db.add(new_cache)
            
        db.commit()
        return result_data

    except Exception as e:
        # Если API недоступно, но у нас был старый кэш — отдаем его как fallback
        if cached_record:
            return json.loads(cached_record.response_data)
        return {"error": f"Failed to fetch market data: {str(e)}"}