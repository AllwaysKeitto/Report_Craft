import httpx
from fastapi import APIRouter, HTTPException, Query

router = APIRouter(prefix="/prices", tags=["External Prices API"])

CRYPTO_MAPPING = {
    "btc": "bitcoin",
    "eth": "ethereum",
    "sol": "solana",
    "ton": "the-open-network",
    "usdt": "tether"
}

# Символы валют для красивого вывода
CURRENCY_SYMBOLS = {
    "RUB": "₽",
    "USD": "$",
    "EUR": "€"
}

async def get_cbr_rates(client: httpx.AsyncClient):
    """Вспомогательная функция для получения актуальных курсов валют ЦБ РФ"""
    url = "https://www.cbr-xml-daily.ru/daily_json.js"
    res = await client.get(url)
    if res.status_code == 200:
        data = res.json()
        return {
            "USD": data["Valute"]["USD"]["Value"],
            "EUR": data["Valute"]["EUR"]["Value"],
            "RUB": 1.0
        }
    raise Exception("Не удалось загрузить курсы ЦБ РФ")

@router.get("/ticker")
async def get_market_ticker(source: str, target_currency: str = Query("RUB")):
    """
    Получает живые котировки и конвертирует их в выбранную валюту (RUB, USD, EUR)
    """
    target_currency = target_currency.upper()
    if target_currency not in CURRENCY_SYMBOLS:
        raise HTTPException(status_code=400, detail="Неподдерживаемая целевая валюта")

    try:
        async with httpx.AsyncClient(timeout=7.0) as client:
            # Получаем курсы для конвертации
            rates = await get_cbr_rates(client)
            
            price_in_rub = 0.0
            
            # 1. КРИПТОВАЛЮТЫ (Запрашиваем сразу в USD для точности кросс-курса)
            if source.startswith("coingecko-"):
                coin_code = source.split("-")[1]
                api_id = CRYPTO_MAPPING.get(coin_code)
                
                if not api_id:
                    raise HTTPException(status_code=400, detail=f"Криптовалюта {coin_code} не поддерживается")
                
                url = f"https://api.coingecko.com/api/v3/simple/price?ids={api_id}&vs_currencies=usd"
                response = await client.get(url)
                
                if response.status_code == 200:
                    data = response.json()
                    price_in_usd = data[api_id]["usd"]
                    price_in_rub = price_in_usd * rates["USD"] # Переводим в рубли-базис

            # 2. НАЦИОНАЛЬНЫЕ ВАЛЮТЫ ЦБ РФ
            elif source.startswith("cbr-"):
                valute_code = source.split("-")[1].upper() # Валюта-источник (например, USD или EUR)
                
                url = "https://www.cbr-xml-daily.ru/daily_json.js"
                response = await client.get(url)
                
                if response.status_code == 200:
                    data = response.json()
                    if "Valute" in data and valute_code in data["Valute"]:
                        valute_data = data["Valute"][valute_code]
                        nominal = valute_data.get("Nominal", 1)
                        price_in_rub = valute_data["Value"] / nominal
                    else:
                        raise HTTPException(status_code=400, detail=f"Валюта {valute_code} не найдена")

            # 3. СЫРЬЕВЫЕ ТОВАРЫ И ИНДЕКСЫ (Золото, Нефть и т.д. изначально в USD)
            elif source.startswith("bi-"):
                market_asset = source.split("-")[1]
                
                market_data_usd = {
                    "gold": 2345.50,   # Цена за унцию в USD
                    "brent": 82.45,    # Баррель в USD
                    "imoex": 3150.20 / rates["USD"], # Переводим индекс Рублей в USD эквивалент
                    "sp500": 5120.15   # Индекс в USD
                }
                
                if market_asset == "gold":
                    res = await client.get("https://api.coingecko.com/api/v3/simple/price?ids=pax-gold&vs_currencies=usd")
                    if res.status_code == 200:
                        market_data_usd["gold"] = res.json()["pax-gold"]["usd"]

                if market_asset in market_data_usd:
                    price_in_rub = market_data_usd[market_asset] * rates["USD"]
                else:
                    raise HTTPException(status_code=400, detail="Товар не поддерживается")

            # ЭТАП КОНВЕРТАЦИИ И ФОРМАТИРОВАНИЯ 
            # Переводим из базового рубля в выбранную пользователем валюту
            if target_currency == "RUB":
                final_value = price_in_rub
            else:
                final_value = price_in_rub / rates[target_currency]

            # Форматируем вывод с красивыми отступами тысяч и правильным символом
            symbol = CURRENCY_SYMBOLS[target_currency]
            
            if target_currency == "RUB":
                return {"status": "success", "value": f"{final_value:,.2f} {symbol}".replace(",", " ")}
            else:
                return {"status": "success", "value": f"{symbol}{final_value:,.2f}".replace(",", " ")}

    except Exception as e:
        raise HTTPException(status_code=503, detail=f"Ошибка конвертации котировок: {str(e)}")