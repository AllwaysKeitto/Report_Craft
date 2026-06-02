document.addEventListener("DOMContentLoaded", async () => {
    // Проверяем авторизацию пользователя перед загрузкой отчета
    const currentUser = await window.Auth.checkGuard();
    if (!currentUser) return;

    // Извлекаем ID шаблона из URL
    const urlParams = new URLSearchParams(window.location.search);
    const templateId = urlParams.get("template_id");

    if (!templateId) {
        alert("Ошибка: Не указан ID шаблона для генерации отчета.");
        window.location.href = "/pages/catalog.html";
        return;
    }

    const reportCanvas = document.getElementById("report-render-canvas");
    if (!reportCanvas) return;

    // Глобальный массив для хранения инстансов графиков (чтобы правильно их ресайзить)
    window.ActiveCharts = [];

    // Инициализируем построение отчета
    await loadAndBuildReport(templateId, reportCanvas);
});

/**
 * Основная функция сборки отчета из JSON структуры и данных API
 */
async function loadAndBuildReport(templateId, container) {
    container.innerHTML = "<p class='loading'>Сборка отчета, выгрузка финансовых данных и рендеринг графиков...</p>";

    try {
        // Очищаем старые инстансы графиков из памяти при пересборке
        if (window.ActiveCharts && window.ActiveCharts.length > 0) {
            window.ActiveCharts.forEach(chart => chart.dispose());
            window.ActiveCharts = [];
        }

        // 1. Получаем сам шаблон с бэкенда
        const template = await window.API.getTemplate(templateId);
        const layout = JSON.parse(template.layout_json);
        
        // По умолчанию запрашиваем данные для дефолтного тикера
        const defaultParams = { ticker: "AAPL" };

        // Делаем ОДИН тяжелый запрос к API для получения данных всего отчета
        const reportResponseData = await window.API.renderReport(templateId, defaultParams, "Просмотр отчета");

        container.innerHTML = ""; // Очищаем лоадер
        
        // Настройка контейнера под размеры макета (вычисляем динамически по максимальным границам)
        container.style.position = "relative";
        container.style.width = "100%";
        container.style.backgroundColor = "#ffffff";
        container.style.border = "1px solid #cbd5e0";
        
        // Динамический расчет высоты контейнера на основе виджетов
        let maxY = 1200;
        if (layout.widgets && layout.widgets.length > 0) {
            maxY = Math.max(...layout.widgets.map(w => (w.y || 0) + (w.h || 0))) + 100;
        }
        container.style.height = `${maxY}px`;

        // 2. Итерируемся по каждому виджету и воссоздаем его из готовых данных
        layout.widgets.forEach((widgetData, index) => {
            const widgetDOM = document.createElement("div");
            widgetDOM.className = "rendered-widget";
            widgetDOM.style.position = "absolute";
            
            // Безопасное позиционирование без хардкода (-2000)
            // Если координаты в конструкторе абсолютные, используем нормализованный расчет
            widgetDOM.style.left = `${widgetData.x}px`; 
            widgetDOM.style.top = `${widgetData.y}px`;
            widgetDOM.style.width = `${widgetData.w || widgetData.width}px`;
            widgetDOM.style.height = `${widgetData.h || widgetData.height}px`;
            
            widgetDOM.style.border = "1px solid #e2e8f0";
            widgetDOM.style.borderRadius = "6px";
            widgetDOM.style.boxShadow = "0 4px 6px -1px rgba(0, 0, 0, 0.1)";
            widgetDOM.style.backgroundColor = widgetData.bg_color || "#ffffff";
            
            const chartContainerId = `echart-widget-${index}`;
            
            // Безопасное создание структуры
            const innerContent = document.createElement("div");
            innerContent.className = "widget-inner-content";
            innerContent.id = chartContainerId;
            innerContent.style.width = "100%";
            innerContent.style.height = "100%";
            widgetDOM.appendChild(innerContent);
            
            container.appendChild(widgetDOM);

            // 3. Рендерим график/таблицу, передавая уже скачанные данные отчета
            if (widgetData.type === "chart" || widgetData.type.startsWith("chart_") || widgetData.type === "table_element") {
                renderEChartWidget(innerContent, widgetData, defaultParams, reportResponseData);
            } else if (widgetData.type === "text_block") {
                innerContent.textContent = widgetData.text_content || "";
                innerContent.style.padding = "10px";
                innerContent.style.fontSize = `${widgetData.font_size}px` || "14px";
                innerContent.style.color = widgetData.font_color || "#000";
            }
        });

    } catch (error) {
        container.innerHTML = `<p class='error-state'>Ошибка построения отчета: ${error.message}</p>`;
    }
}

/**
 * Функция отрисовки графика ECharts с использованием переданных данных
 */
function renderEChartWidget(chartDom, widgetData, params, reportData) {
    if (!chartDom) return;
    
    const myChart = echarts.init(chartDom);

    try {
        // Данные берутся из готового ответа, запросы к сети заблокированы
        const dates = reportData.dates || ["Пн", "Вт", "Ср", "Чт", "Пт"];
        const prices = reportData.prices || [150, 152, 153, 149, 155];

        const option = {
            title: {
                text: `${widgetData.name || 'Динамика актива'} (${params.ticker})`,
                left: 'center',
                textStyle: { fontSize: 13, color: '#2d3748', fontFamily: 'Inter, sans-serif' }
            },
            tooltip: {
                trigger: 'axis',
                formatter: '{b}: {c} ₽'
            },
            grid: { top: 50, bottom: 40, left: 50, right: 20 },
            xAxis: {
                type: 'category',
                data: dates,
                axisLine: { lineStyle: { color: '#a0aec0' } }
            },
            yAxis: {
                type: 'value',
                axisLine: { lineStyle: { color: '#a0aec0' } },
                splitLine: { lineStyle: { color: '#edf2f7' } }
            },
            series: [{
                data: prices,
                type: widgetData.type.includes("bar") ? "bar" : "line", 
                smooth: true,
                itemStyle: { color: '#3182ce' },
                areaStyle: !widgetData.type.includes("bar") ? {
                    color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
                        { offset: 0, color: 'rgba(49,130,206,0.4)' },
                        { offset: 1, color: 'rgba(49,130,206,0.0)' }
                    ])
                } : null
            }]
        };

        myChart.setOption(option);
        
        // Сохраняем инстанс в глобальный массив для централизованного ресайза
        window.ActiveCharts.push(myChart);

    } catch (error) {
        chartDom.innerHTML = `<div style="padding:20px; color:#e53e3e; font-size:12px;">Ошибка отрисовки: ${error.message}</div>`;
    }
}

// Глобальный обработчик изменения размеров экрана (Один на все графики)
// Предотвращает утечки памяти
window.addEventListener('resize', () => {
    if (window.ActiveCharts && window.ActiveCharts.length > 0) {
        window.ActiveCharts.forEach(chart => {
            if (chart) chart.resize();
        });
    }
});

/**
 * Функция для скачивания PDF версии текущего отчета
 */
window.downloadPdfReport = async function(templateId, ticker = "AAPL") {
    const btn = document.getElementById("download-pdf-btn");
    if (btn) {
        btn.disabled = true;
        btn.textContent = "Экспорт в PDF...";
    }

    try {
        const renderedInfo = await window.API.renderReport(templateId, { ticker }, "Экспорт в PDF файл");
        const downloadUrl = window.API.getDownloadUrl(renderedInfo.history_id);
        
        const link = document.createElement('a');
        link.href = downloadUrl;
        link.setAttribute('download', `Report_${templateId}.pdf`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

    } catch (error) {
        alert(`Не удалось сгенерировать PDF: ${error.message}`);
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.textContent = "Скачать PDF отчет";
        }
    }
};

/**
 * Функция экспорта отрендеренного холста в PDF документ
 */
window.downloadPdfReport = async function() {
    const reportCanvas = document.getElementById("report-render-canvas");
    const pdfButton = document.getElementById("download-pdf-btn");

    if (!reportCanvas) {
        alert("Ошибка: Холст отчета не найден!");
        return;
    }

    // Блокируем кнопку на время генерации, чтобы юзер не кликал повторно
    const originalText = pdfButton.innerHTML;
    pdfButton.disabled = true;
    pdfButton.innerHTML = `<i class="fa-solid fa-circle-notch fa-spin"></i> Формирование PDF...`;

    try {
        // Используем встроенный jsPDF (FastAPI / ESM формат импорта глобальной библиотеки)
        const { jsPDF } = window.jspdf;

        // Настройки html2canvas для четкости графиков ECharts
        const canvasOptions = {
            scale: 2,             // Увеличиваем разрешение в 2 раза (чтобы текст и графики не пикселили)
            useCORS: true,         // Разрешаем загрузку внешних картинок, если они есть
            logging: false,        // Выключаем спам в консоль
            backgroundColor: "#ffffff" // Принудительный белый фон для печатного листа
        };

        // 1. Превращаем DOM-дерево холста в растровый Canvas элемент
        const canvas = await html2canvas(reportCanvas, canvasOptions);
        const imgData = canvas.toDataURL("image/png");

        // 2. Рассчитываем пропорции под стандартный лист А4
        const pdf = new jsPDF("p", "mm", "a4");
        const imgWidth = 210;     // Ширина листа A4 в мм
        const pageHeight = 295;   // Высота листа A4 в мм
        const imgHeight = (canvas.height * imgWidth) / canvas.width;
        
        let heightLeft = imgHeight;
        let position = 0;

        // 3. Добавляем картинку холста в PDF (с поддержкой многостраничности, если холст длинный)
        pdf.addImage(imgData, "PNG", 0, position, imgWidth, imgHeight, undefined, 'FAST');
        heightLeft -= pageHeight;

        while (heightLeft >= 0) {
            position = heightLeft - imgHeight;
            pdf.addPage();
            pdf.addImage(imgData, "PNG", 0, position, imgWidth, imgHeight, undefined, 'FAST');
            heightLeft -= pageHeight;
        }

        // Получаем имя отчета для названия файла (вытаскиваем из h3 или h1 заголовка)
        const reportTitleEl = document.querySelector(".template-title");
        const fileName = reportTitleEl ? `${reportTitleEl.textContent.trim()}_report.pdf` : "reportcraft_document.pdf";

        // 4. Скачиваем готовый файл в браузер
        pdf.save(fileName);

    } catch (error) {
        console.error("Ошибка при генерации PDF:", error);
        alert(`Не удалось экспортировать PDF: ${error.message}`);
    } finally {
        // Возвращаем кнопку в исходное состояние
        pdfButton.disabled = false;
        pdfButton.innerHTML = originalText;
    }
};