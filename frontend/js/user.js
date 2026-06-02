document.addEventListener("DOMContentLoaded", async () => {
    const currentUser = await window.Auth.checkGuard();
    if (!currentUser) return;

    const isAdmin = currentUser.role_id === 1;

    const userBlock = document.getElementById("nav-user-block");
    const adminBlock = document.getElementById("nav-admin-block");
    const pageTitle = document.querySelector(".main-content h1");
    const pageDesc = document.querySelector(".main-content p");
    const reportsGrid = document.getElementById("user-purchased-grid"); 

    if (isAdmin) {
        if (userBlock) userBlock.style.display = "none";  
        if (adminBlock) adminBlock.style.display = "flex"; 
        
        const adminLink = adminBlock.querySelector(".nav-item");
        if (adminLink) {
            adminLink.style.background = "rgba(255, 255, 255, 0.1)";
            adminLink.style.color = "#ffffff";
            adminLink.style.fontWeight = "600";
        }

        if (pageTitle) pageTitle.textContent = "Управление шаблонами системы";
        if (pageDesc) pageDesc.textContent = "Список всех созданных в конструкторе макетов. Вы можете отредактировать их или опубликовать в общий каталог.";
    } else {
        if (userBlock) userBlock.style.display = "flex";
        if (adminBlock) adminBlock.style.display = "none";
    }

    if (reportsGrid) {
        await renderUserLibrary(reportsGrid, currentUser);
    }
});


/**
 * Отрисовка купленных лицензий пользователя
 */
async function renderUserLibrary(container, user) {
    container.innerHTML = "<p class='loading' style='color: #94a3b8;'>Загрузка ваших лицензий...</p>";

    try {
        // Запрашиваем напрямую только купленные шаблоны пользователя
        const token = localStorage.getItem("access_token");
        const response = await fetch("/api/purchases/my-templates", {
            headers: {
                "Authorization": `Bearer ${token}`,
                "Content-Type": "application/json"
            }
        });

        if (!response.ok) throw new Error("Не удалось загрузить библиотеку отчетов");
        
        const myTemplates = await response.json();

        if (myTemplates.length === 0) {
            container.innerHTML = `
                <div class="empty-state" style="grid-column: 1/-1; text-align: center; padding: 3rem; background: #1e293b; border-radius: 8px; border: 1px dashed #334155; width: 100%;">
                    <p style="color: #94a3b8; font-size: 1.1rem; margin-bottom: 1.5rem;">У вас пока нет купленных шаблонов отчётов.</p>
                    <a href="/pages/catalog.html" class="btn btn-primary" style="display: inline-block; width: auto; text-decoration: none; background: #0b99ff; color: #fff; padding: 10px 20px; border-radius: 6px; font-weight: 600;">Перейти в каталог</a>
                </div>
            `;
            return;
        }

        container.innerHTML = ""; 

        myTemplates.forEach(template => {
            const card = document.createElement("div");
            card.className = "template-card";
            card.style.cssText = "background: #1e293b; border-radius: 8px; padding: 20px; display: flex; flex-direction: column; justify-content: space-between; border: 1px solid #334155;";
            
            // Проверяем архивное состояние для вывода метки
            const isArchived = template.is_archived === true || template.is_archived === 1 || String(template.is_archived).toLowerCase() === "true";

            card.innerHTML = `
                <div class="card-header" style="margin-bottom: 15px;">
                    <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 10px;">
                        <h3 class="template-title" style="margin: 0; font-size: 1.25rem; color: #fff; text-align: left;">${escapeHtml(template.title)}</h3>
                        ${isArchived ? '<span style="font-size: 11px; background: rgba(239, 68, 68, 0.15); color: #ef4444; padding: 2px 6px; border-radius: 4px; font-weight: 600; white-space: nowrap;">Архивный</span>' : ''}
                    </div>
                    <p class="template-desc" style="margin: 0; color: #94a3b8; font-size: 0.9rem; line-height: 1.4; text-align: left;">${escapeHtml(template.description || "Без описания")}</p>
                </div>
                <div class="card-footer" style="display: flex; flex-direction: column; gap: 12px; margin-top: auto; border-top: 1px dashed #334155; padding-top: 15px; width: 100%;">
                    <div class="price-tag" style="text-align: left;">
                        <span class="badge-free" style="background-color: rgba(14, 165, 233, 0.15); color: #38bdf8; padding: 4px 8px; border-radius: 4px; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px;">Лицензия активна</span>
                    </div>
                    
                    <div class="action-block" style="display: flex; gap: 8px; width: 100%; align-items: center;">
                        <button class="btn btn-success btn-view" data-id="${template.id}" style="flex: 1; display: flex; align-items: center; justify-content: center; gap: 8px; background: #10b981; color: white; border: none; padding: 10px; border-radius: 6px; font-weight: 600; cursor: pointer; height: 38px;">
                            <i class="fa-solid fa-play" style="font-size: 12px;"></i> Смотреть отчет
                        </button>
                        
                        <button class="btn btn-secondary btn-pdf" data-id="${template.id}" style="width: 42px; height: 38px; display: flex; align-items: center; justify-content: center; background: #334155; border: none; border-radius: 6px; cursor: pointer; transition: background 0.2s;">
                            <i class="fa-solid fa-file-pdf" style="color: #f43f5e; font-size: 18px;"></i>
                        </button>
                    </div>
                </div>
            `;
            container.appendChild(card);
        });

        container.onclick = async (e) => {
            const viewBtn = e.target.closest(".btn-view");
            const pdfBtn = e.target.closest(".btn-pdf");

            if (viewBtn) {
                const id = viewBtn.getAttribute("data-id");
                window.location.href = `/pages/constructor.html?id=${id}&mode=presentation`;
                return;
            }

            if (pdfBtn) {
                const id = parseInt(pdfBtn.getAttribute("data-id"), 10);
                const targetTemplate = myTemplates.find(t => t.id === id);
                if (targetTemplate) {
                    await downloadPdfDirectly(targetTemplate, pdfBtn);
                }
            }
        };

    } catch (error) {
        console.error(error);
        container.innerHTML = `<p class='error-state' style='color: #ef4444;'>Ошибка сборки библиотеки: ${error.message}</p>`;
    }
}

/**
 * Функция автономной сборки структуры отчета и скачивания PDF
 */
async function downloadPdfDirectly(templateData, buttonElement) {
    const originalHtml = buttonElement.innerHTML;
    buttonElement.disabled = true;
    buttonElement.innerHTML = `<i class="fa-solid fa-circle-notch fa-spin" style="color: #94a3b8;"></i>`;

    try {
        const canvas = document.getElementById("report-render-canvas");
        if (!canvas) throw new Error("Скрытый контейнер #report-render-canvas не найден.");

        // Подготовка невидимого холста A4
        canvas.style.display = "block";
        canvas.style.position = "absolute";
        canvas.style.left = "-9999px";
        canvas.style.width = "800px";
        canvas.style.padding = "40px";
        canvas.style.background = "#ffffff";
        canvas.style.color = "#000000";

        // 1. Рендерим шапку документа
        canvas.innerHTML = `
            <div style="border-bottom: 2px solid #1e293b; padding-bottom: 20px; margin-bottom: 30px; font-family: sans-serif;">
                <h1 style="font-size: 24px; color: #1e293b; margin: 0 0 8px 0;">${escapeHtml(templateData.title)}</h1>
                <p style="color: #64748b; font-size: 14px; margin: 0;">${escapeHtml(templateData.description || "Интерактивный аналитический отчёт")}</p>
            </div>
            <div id="canvas-elements-grid" style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 20px; font-family: sans-serif;"></div>
        `;

        const elementsGrid = document.getElementById("canvas-elements-grid");
        let layout = [];
        
        try {
            layout = typeof templateData.layout_json === "string" ? JSON.parse(templateData.layout_json) : (templateData.layout_json || []);
        } catch(e) {
            layout = [];
        }

        // 2. Автономно перебираем блоки отчета, чтобы PDF не был пустым
        if (Array.isArray(layout) && layout.length > 0) {
            layout.forEach((block, idx) => {
                const blockDiv = document.createElement("div");
                // Если блок занимает всю ширину (grid-column: span 2)
                if (block.w && block.w > 6) {
                    blockDiv.style.gridColumn = "span 2";
                }
                blockDiv.style.background = "#f8fafc";
                blockDiv.style.border = "1px solid #e2e8f0";
                blockDiv.style.borderRadius = "6px";
                blockDiv.style.padding = "15px";
                blockDiv.style.minHeight = "200px";

                blockDiv.innerHTML = `<h4 style="margin: 0 0 10px 0; font-size: 14px; color: #334155; border-bottom: 1px solid #e2e8f0; padding-bottom: 5px;">${escapeHtml(block.title || `Виджет ${idx + 1}`)}</h4>`;
                
                // Создаем контейнер под графики ECharts внутри PDF
                const chartContainer = document.createElement("div");
                chartContainer.style.width = "100%";
                chartContainer.style.height = "160px";
                blockDiv.appendChild(chartContainer);
                elementsGrid.appendChild(blockDiv);

                // Если подключен ECharts, инициализируем его типы графиков
                if (window.echarts && block.type) {
                    try {
                        const myChart = window.echarts.init(chartContainer);
                        let option = {};
                        
                        if (block.type === 'bar') {
                            option = { xAxis: { type: 'category', data: ['Пн', 'Вт', 'Ср', 'Чт', 'Пт'] }, yAxis: { type: 'value' }, series: [{ data: [120, 200, 150, 80, 70], type: 'bar', color: '#0b99ff' }] };
                        } else if (block.type === 'line') {
                            option = { xAxis: { type: 'category', data: ['Янв', 'Фев', 'Мар', 'Апр'] }, yAxis: { type: 'value' }, series: [{ data: [15, 34, 28, 51], type: 'line', color: '#10b981' }] };
                        } else if (block.type === 'pie') {
                            option = { series: [{ type: 'pie', radius: '60%', data: [{ value: 40, name: 'A' }, { value: 30, name: 'B' }, { value: 30, name: 'C' }] }] };
                        }
                        myChart.setOption(option);
                    } catch (err) {
                        console.error("Ошибка отрисовки мини-графика для PDF:", err);
                    }
                }
            });
        } else {
            elementsGrid.innerHTML = `<p style="grid-column: 1/-1; color: #64748b;">Структура элементов отчёта пуста.</p>`;
        }

        // Рендеринг анимаций графиков
        await new Promise(resolve => setTimeout(resolve, 800));

        // Снимок холста через html2canvas
        const { jsPDF } = window.jspdf;
        const htmlCanvas = await html2canvas(canvas, { scale: 2, backgroundColor: "#ffffff", useCORS: true });
        const imgData = htmlCanvas.toDataURL("image/png");

        const pdf = new jsPDF("p", "mm", "a4");
        const imgWidth = 210; 
        const imgHeight = (htmlCanvas.height * imgWidth) / htmlCanvas.width;

        pdf.addImage(imgData, "PNG", 0, 0, imgWidth, imgHeight, undefined, 'FAST');
        pdf.save(`${templateData.title || 'report'}.pdf`);

        canvas.innerHTML = "";
        canvas.style.display = "none";
    } catch (error) {
        console.error(error);
        alert("Ошибка генерации PDF: " + error.message);
    } finally {
        buttonElement.disabled = false;
        buttonElement.innerHTML = originalHtml;
    }
}

function escapeHtml(str) {
    if (!str) return "";
    return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}