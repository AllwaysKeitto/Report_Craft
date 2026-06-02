FROM python:3.11-slim
WORKDIR /app

# Устанавка системные зависимости, для сборки некоторых пакетов (для работы с PDF и БД)
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    libpq-dev \
    && rm -rf /var/lib/apt/lists/*

COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Копируем всю структуру проекта в контейнер
COPY . .
# Открываем порт
EXPOSE 8000

# Команда для запуска сервера uvicorn
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--app-dir", "backend"]