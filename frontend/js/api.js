/**
 * Модуль api.js (Интеграция с бэкендом)
 * НАЗНАЧЕНИЕ: 
 * - Обеспечивает HTTP-взаимодействие фронтенда с бэкендом на FastAPI (/api).
 * - Реализует универсальную обертку apiRequest с автоматической подстановкой JWT-токенов.
 * - Обрабатывает сквозные ошибки авторизации (401, 403) и делает редирект на login.html.
 * - Экспортирует глобальный объект `window.API` для вызова методов авторизации.
 * - Работы с редактором шаблонами, покупками и рендерингом отчетов.
 */

// Константа базового URL бэкенда FastAPI
const API_BASE_URL = "/api";

/**
 * Универсальный метод для отправки HTTP-запросов с поддержкой JWT
 * @param {string} endpoint - Конечная точка (например, '/auth/me' или '/templates')
 * @param {string} method - HTTP метод ('GET', 'POST', 'PUT', 'DELETE')
 * @param {Object|FormData|string|null} body - Тело запроса
 * @param {Object} customHeaders - Кастомные заголовки (например, для смены Content-Type)
 * @returns {Promise<Object|null>} - Ответ от бэкенда в формате JSON или null для пустых ответов
 */
async function apiRequest(endpoint, method = "GET", body = null, customHeaders = {}) {
    const url = `${API_BASE_URL}${endpoint}`;
    const token = localStorage.getItem("access_token");
    
    const headers = { ...customHeaders };
    
    // Автоматически ставим application/json, если это обычный объект и тип не переопределен
    if (body && !(body instanceof FormData) && !headers["Content-Type"]) {
        headers["Content-Type"] = "application/json";
    }
    
    if (token) {
        headers["Authorization"] = `Bearer ${token}`;
    }
    
    const config = {
        method: method,
        headers: headers
    };
    
    if (body) {
        // Если передаем FormData (например, файлы)
        if (body instanceof FormData) {
            config.body = body;
        } else if (headers["Content-Type"] === "application/x-www-form-urlencoded") {
            config.body = body; // передается в виде строки URLSearchParams
        } else {
            config.body = JSON.stringify(body);
        }
    }
    
    try {
        const response = await fetch(url, config);
        
        // Обработка критических статусов авторизации
        if (response.status === 401) {
            localStorage.removeItem("access_token");
            localStorage.removeItem("user_role_id");
            
            // Редирект выполняется только если мы не на странице логина
            if (!window.location.pathname.includes("login.html")) {
                window.location.href = "/pages/login.html";
            }
            throw new Error("Сессия устарела. Пожалуйста, авторизуйтесь заново.");
        }
        
        if (response.status === 403) {
            throw new Error("Доступ запрещен. Недостаточно прав для выполнения операции.");
        }

        // Безопасный разбор тела ответа для контента 204 No Content
        let data = null;
        const contentType = response.headers.get("content-type");
        if (response.status !== 204 && contentType && contentType.includes("application/json")) {
            data = await response.json();
        }
        
        if (!response.ok) {
            // Умный разбор ошибок FastAPI, включая массивы валидации 422
            let errorMessage = `Ошибка сервера: ${response.status}`;
            
            if (data && data.detail) {
                if (typeof data.detail === 'string') {
                    errorMessage = data.detail;
                } else if (Array.isArray(data.detail)) {
                    // Формируем читаемый текст из массива ошибок Pydantic
                    errorMessage = data.detail.map(err => `Поле ${err.loc.join('.')}: ${err.msg}`).join(' | ');
                } else if (typeof data.detail === 'object') {
                    errorMessage = JSON.stringify(data.detail);
                }
            }
            throw new Error(errorMessage);
        }
        
        return data;
        
    } catch (error) {
        console.error(`Ошибка при запросе к ${endpoint}:`, error.message);
        throw error;
    }
}

// Экспортируем функции в глобальную область видимости
window.API = {
    // Авторизация и профиль
    // Запрос переведен на стандарт URLSearchParams (совместимость с OAuth2PasswordRequestForm в FastAPI)
    login: (username, password) => {
        return apiRequest("/auth/login", "POST", { 
            username: username, 
            password: password 
        });
    },
    
    register: (username, email, password, role_id) => apiRequest("/auth/register", "POST", { username, email, password, role_id }),
    getProfile: () => apiRequest("/auth/me", "GET"),
    
    // Figma-like Шаблоны
    getTemplates: () => apiRequest("/templates/", "GET"), // Нужен слэш на конце
    getTemplate: (id) => apiRequest(`/templates/${id}`, "GET"), 
    createTemplate: (templateData) => apiRequest("/templates/", "POST", templateData), // Нужен слэш на конце
    updateTemplate: (id, templateData) => apiRequest(`/templates/${id}`, "PUT", templateData), 
    deleteTemplate: (id) => apiRequest(`/templates/${id}`, "DELETE"),
    
    // Магазин / Лицензии шаблонов
    getPurchases: () => apiRequest("/purchases/", "GET"),
    buyTemplate: (templateId) => apiRequest("/purchases/", "POST", { template_id: templateId }),
    
    // Рендеринг отчетов и экспорт
    renderReport: (templateId, appliedParams, comment) => apiRequest("/reports/render", "POST", {
        template_id: templateId,
        applied_params_json: JSON.stringify(appliedParams),
        user_comment: comment
    }),
    getHistory: () => apiRequest("/reports/history", "GET"),
    getDownloadUrl: (historyId) => `${API_BASE_URL}/reports/download/${historyId}`
};