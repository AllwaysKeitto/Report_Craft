//Модуль render.js (Движок отрисовки интерфейса / Render Engine)

import { state } from './state.js';
import { bindWidgetTransform, bindSheetTransform } from './interactions.js';

// Кеш DOM-нод
const blueprint = document.getElementById('canvas-blueprint');
const layersContainer = document.getElementById('layers-tree-container');
const widgetPropsContainer = document.getElementById('widget-specific-properties');

/**
 * Безопасный вызов отрисовки линеек
 */
function drawRulersSafe() {
    if (typeof drawRulers === 'function') {
        drawRulers();
    } else if (window.drawRulers === 'function') {
        window.drawRulers();
    }
}

/**
 * Глобальное обновление трансформаций холста (Масштаб и Смещение)
 */
export function updateTransform() {
    if (!blueprint) return;
    blueprint.style.transform = `translate(${state.panX}px, ${state.panY}px) scale(${state.zoom})`;
    
    // Обновляем значение масштаба в футере
    const zoomVal = document.getElementById('zoom-val');
    if (zoomVal) zoomVal.innerText = `${Math.round(state.zoom * 100)}%`;
    
    drawRulersSafe();
}

/**
 * Главная функция рендеринга всего интерфейса редактора
 */
export function renderEditor() {
    if (!blueprint) return;

    const isPresentation = document.body.classList.contains('presentation-active');
    
    // 1. Переключаем текст навигации
    const zoomIndicator = document.querySelector('.zoom-indicator');
    if (zoomIndicator) {
        const hintSpan = zoomIndicator.querySelector('span:last-child');
        if (hintSpan) {
            hintSpan.innerHTML = isPresentation 
                ? '<kbd>Space</kbd> + Мышь = Панорама | <kbd>Ctrl</kbd> + Скролл = Зум холста'
                : '<kbd>Space</kbd> + Мышь = Панорама | <kbd>Ctrl</kbd> + Скролл = Зум | <kbd>Del</kbd> = Удалить';
        }
    }

    // 2. Блокируем или разрешаем взаимодействие с контентом
    if (isPresentation) {
        blueprint.style.pointerEvents = 'auto'; 
        blueprint.style.userSelect = 'none';
        blueprint.style.setProperty('--presentation-mode-pointer', 'none');

        if (state.selectedIds && state.selectedIds.length > 0) {
            state.selectedIds = []; 
            state.selectedNodeId = null; 
        }

        const selectionBox = document.querySelector('.selection-zone-box, .selection-box');
        if (selectionBox) selectionBox.remove();
    } else {
        blueprint.style.userSelect = 'auto';
        blueprint.style.setProperty('--presentation-mode-pointer', 'auto');
    }
    
    // УБИРАЕМ BLUEPRINT.INNERHTML = '' ===
    // Вместо полной очистки мы точечно управляем структурой листов и виджетов

    state.sheets.forEach(sheet => {
        // Ищем, есть ли уже этот лист на холсте
        let sheetEl = document.getElementById(sheet.id);
        const isNewSheet = !sheetEl;

        if (isNewSheet) {
            sheetEl = document.createElement('div');
            sheetEl.id = sheet.id;
            sheetEl.className = 'canvas-sheet';
        }

        // Обновляем базовые стили существующего листа
        sheetEl.style.cssText = `
            position: absolute;
            left: ${sheet.x}px; top: ${sheet.y}px; width: ${sheet.w}px; height: ${sheet.h}px;
            display: ${state.layerVisibility[sheet.id] === false ? 'none' : 'block'};
            opacity: ${(sheet.opacity !== undefined ? sheet.opacity : 100) / 100};
        `;

        // РЕНДЕРИМ ВИДЖЕТЫ ВНУТРИ ДАННОГО ЛИСТА
        const sheetWidgets = state.widgets.filter(w => w.sheetId === sheet.id);
        const currentWidgetIds = sheetWidgets.map(w => w.id);

        // Точечно удаляем из DOM-листа только те виджеты, которых больше нет в стейте
        Array.from(sheetEl.children).forEach(child => {
            if (child.classList.contains('canvas-widget') && !currentWidgetIds.includes(child.id)) {
                child.remove(); 
                console.log(`[ReportCraft] Удален виджет из DOM: ${child.id}`);
            }
        });

        sheetWidgets.forEach(widget => {
            let widgetEl = document.getElementById(widget.id);
            const isNewWidget = !widgetEl;

            if (isNewWidget) {
                widgetEl = document.createElement('div');
                widgetEl.id = widget.id;
            }
            
            const isWidgetSelected = state.selectedIds.includes(widget.id) && state.selectedType === 'widget';
            widgetEl.className = `canvas-widget ${isWidgetSelected ? 'selected' : ''}`;
            
            widgetEl.style.cssText = `
                position: absolute;
                left: ${widget.x}px; top: ${widget.y}px; width: ${widget.w}px; height: ${widget.h}px;
                display: ${state.layerVisibility[widget.id] === false ? 'none' : 'block'};
                transform: rotate(${widget.rotation || 0}deg); 
                opacity: ${(widget.opacity !== undefined ? widget.opacity : 100) / 100}; 
                border-radius: ${widget.border_radius || 0}px;
            `;

            if (isNewWidget) {
                widgetEl.addEventListener('mousedown', (e) => {
                    if (document.body.classList.contains('presentation-active')) return;
                    e.stopPropagation();
                    const isMulti = state.isShiftPressed;
                    
                    if (isMulti) {
                        if (state.selectedIds.includes(widget.id)) {
                            state.selectedIds = state.selectedIds.filter(id => id !== widget.id);
                        } else {
                            if (state.selectedType !== 'widget') state.selectedIds = []; 
                            state.selectedIds.push(widget.id);
                        }
                    } else {
                        state.selectedIds = [widget.id];
                    }
                    
                    state.selectedType = 'widget';
                    import('./state.js').then(m => m.dispatchUpdate());
                });

                // Наполняем контентом (включая .chart-container) СТРОГО один раз при создании
                injectWidgetContent(widgetEl, widget);
                sheetEl.appendChild(widgetEl);
            }
        });

        // Добавляем сам лист на холст, если его еще нет
        if (isNewSheet && blueprint) {
            blueprint.appendChild(sheetEl);
        }
    });

    // ЧИСТКА ЛИСТОВ: Точечно удаляем листы, которые были удалены из стейта
    if (blueprint) {
        const activeSheetIds = state.sheets.map(s => s.id);
        Array.from(blueprint.children).forEach(sheetChild => {
            if (sheetChild.classList.contains('canvas-sheet') && !activeSheetIds.includes(sheetChild.id)) {
                sheetChild.remove();
                console.log(`[ReportCraft] Удален лист из DOM: ${sheetChild.id}`);
            }
        });
    }

    // УМНОЕ ОБНОВЛЕНИЕ И УПРАВЛЕНИЕ Z-INDEX В РЕАЛЬНОМ ВРЕМЕНИ 
    const totalSheets = state.sheets.length;
    state.sheets.forEach((sheet, idx) => {
        const el = document.getElementById(sheet.id);
        if (el) {
            if (state.selectedIds.includes(sheet.id) && state.selectedType === 'sheet') {
                el.classList.add('selected-sheet');
            } else {
                el.classList.remove('selected-sheet');
            }
            
            el.style.display = state.layerVisibility[sheet.id] === false ? 'none' : 'block';
            el.style.left = `${sheet.x}px`;
            el.style.top = `${sheet.y}px`;
            el.style.width = `${sheet.w}px`;
            el.style.height = `${sheet.h}px`;
            el.style.opacity = `${(sheet.opacity !== undefined ? sheet.opacity : 100) / 100}`;
            el.style.zIndex = totalSheets - idx; 
        }
    });

    // Управляем Z-Index и геометрией виджетов
    state.widgets.forEach((widget, idx) => {
        const el = document.getElementById(widget.id);
        if (el) {
            const isInteracting = el.classList.contains('interact-dragging') || el.classList.contains('interact-resizing');

            const prevWidth = el.style.width;
            const prevHeight = el.style.height;

            el.style.display = state.layerVisibility[widget.id] === false ? 'none' : 'block';
            el.style.left = `${widget.x}px`;
            el.style.top = `${widget.y}px`;
            el.style.width = `${widget.w}px`;
            el.style.height = `${widget.h}px`;
            el.style.transform = `rotate(${widget.rotation || 0}deg)`;
            el.style.opacity = `${(widget.opacity !== undefined ? widget.opacity : 100) / 100}`;
            el.style.borderRadius = `${widget.border_radius || 0}px`;
            el.style.zIndex = idx + 1;

           const isChart = widget?.type?.startsWith('chart_');

            if (!isChart) {
                // Текст, Таблицы и KPI карточки обновляем ВСЕГДА.
                injectWidgetContent(el, widget);
            } else {
                // Графики обновляем только если пользователь их активно крутит/ресайзит
                if (isInteracting) {
                    injectWidgetContent(el, widget);
                }
            }
            
            // УПРАВЛЕНИЕ ГРАФИКАМИ:
            if (isChart) {
                const chartDom = el.querySelector('.chart-container');
                if (chartDom) {
                    const chartInstance = window.echarts?.getInstanceByDom(chartDom);
                    
                    if (chartInstance) {
                        if (isInteracting) {
                            updateEChartOptions(chartInstance, widget);
                        }

                        const isSizeChanged = prevWidth !== `${widget.w}px` || prevHeight !== `${widget.h}px`;
                        if (isSizeChanged) {
                            chartInstance.resize({ silent: true });
                        }
                    } else {
                        initEChartInstance(widget);
                    }
                }
            }
        }
    });

    // ИНИЦИАЛИЗАЦИЯ ИНТЕРАКТИВА (ТРАНСФОРМАЦИИ) 
    if (state.selectedIds && state.selectedIds.length > 0) {
        state.selectedIds.forEach(currentId => {
            if (state.selectedType === 'widget') {
                const activeWidget = state.widgets.find(w => w.id === currentId);
                if (activeWidget && !state.layerLocks[activeWidget.id]) {
                    try { bindWidgetTransform(activeWidget.id, activeWidget); } catch(e) { console.warn(e); }
                }
            } else if (state.selectedType === 'sheet') {
                const activeSheet = state.sheets.find(s => s.id === currentId);
                if (activeSheet && !state.layerLocks[activeSheet.id]) {
                    try { 
                        if (typeof bindSheetTransform === 'function') {
                            bindSheetTransform(activeSheet.id, activeSheet); 
                        } else {
                            bindWidgetTransform(activeSheet.id, activeSheet); 
                        }
                    } catch(e) { console.warn("Ошибка интерактива листа:", e); }
                }
            }
        });
    }

    syncPropertiesPanel();
}

function injectWidgetContent(container, w) {
    if (w.type === 'kpi_card') {
        // Если пользователь прямо сейчас редактирует текст внутри этой карточки,
        // не перезаписываем HTML, чтобы не сбросить курсор ввода
        if (document.activeElement && container.contains(document.activeElement)) {
            return;
        }

        const fontFamily = w.font_family || 'sans-serif';
        const textColor = w.text_color || '#0f172a';      
        const labelColor = w.label_color || '#64748b';    
        const textAlign = w.text_align || 'left';         
        const isBold = w.font_weight === 'bold' || w.is_bold === true;
        const isItalic = w.font_style === 'italic' || w.is_italic === true;
        const valueSize = w.font_size ? `${w.font_size}px` : '24px';
        const labelSize = w.label_size ? `${w.label_size}px` : '11px';

        container.innerHTML = `
            <div style="padding: 12px; font-family: ${fontFamily}; height: 100%; display: flex; flex-direction: column; justify-content: space-between; box-sizing: border-box; user-select: none; text-align: ${textAlign};">
                <div style="font-size: ${labelSize}; color: ${labelColor}; font-weight: 500; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 4px;">
                    ${w.text_content || 'KPI Индикатор'}
                </div>
                <div style="font-size: ${valueSize}; font-weight: ${isBold ? '700' : '400'}; font-style: ${isItalic ? 'italic' : 'normal'}; color: ${textColor}; line-height: 1.2;">
                    ${w.kpi_value || '0'}
                </div>
            </div>
        `;
        return;
    }

    if (w.type === 'frame') {
        container.classList.add('figma-frame');
        container.innerHTML = `
            <div class="frame-header" style="position:absolute; top:-18px; left:0; font-family:sans-serif; font-size:10px; color:#64748b; font-weight:500; user-select:none;">
                #️⃣ ${w.name}
            </div>
            <div class="frame-content" style="width:100%; height:100%; overflow:hidden; position:relative;"></div>
        `;
        return;
    }

    if (w.type === 'shape_rect') {
        const fill = w.fill_type === 'solid' ? w.bg_color : `url(#grad-${w.id})`;
        container.innerHTML = `
            <svg width="100%" height="100%" style="display:block; overflow:visible;">
                ${generateSvgGradient(w)}
                <rect x="${(w.stroke_width || 0)/2}" y="${(w.stroke_width || 0)/2}" 
                      width="100%" height="100%" 
                      rx="${w.border_radius || 0}" ry="${w.border_radius || 0}" 
                      fill="${fill}" stroke="${w.stroke_color || 'transparent'}" stroke-width="${w.stroke_width || 0}" stroke-dasharray="${w.stroke_type === 'dashed' ? '5,5' : 'none'}"/>
            </svg>`;
        return;
    }

    if (w.type === 'shape_circle') { 
        const fill = w.fill_type === 'solid' ? w.bg_color : `url(#grad-${w.id})`;
        container.innerHTML = `
            <svg width="100%" height="100%" style="display:block; overflow:visible;">
                ${generateSvgGradient(w)}
                <ellipse cx="50%" cy="50%" rx="50%" ry="50%" fill="${fill}" stroke="${w.stroke_color || 'transparent'}" stroke-width="${w.stroke_width || 0}" stroke-dasharray="${w.stroke_type === 'dashed' ? '5,5' : 'none'}"/>
            </svg>`;
        return; 
    }

    if (w.type === 'shape_triangle') {
        const fill = w.fill_type === 'solid' ? (w.bg_color || '#0b99ff') : `url(#grad-${w.id})`;
        container.innerHTML = `
            <svg width="100%" height="100%" viewBox="0 0 100 100" preserveAspectRatio="none" style="display:block; overflow:visible;">
                ${generateSvgGradient(w)}
                <polygon points="50,4 4,96 96,96" fill="${fill}" stroke="${w.stroke_color || 'transparent'}" stroke-width="${w.stroke_width || 0}" stroke-dasharray="${w.stroke_type === 'dashed' ? '5,5' : 'none'}" stroke-linejoin="round"/>
            </svg>`;
        return;
    }

    if (w.type === 'shape_polygon' || w.type === 'shape_star') {
        const fill = w.fill_type === 'solid' ? (w.bg_color || '#0b99ff') : `url(#grad-${w.id})`;
        const points = w.type === 'shape_polygon' ? calculatePolygonPoints(w.polygon_sides || 5) : calculateStarPoints(w.polygon_sides || 5);
        container.innerHTML = `
            <svg width="100%" height="100%" viewBox="0 0 100 100" preserveAspectRatio="none" style="display:block; overflow:visible;">
                ${generateSvgGradient(w)}
                <polygon points="${points}" fill="${fill}" stroke="${w.stroke_color || 'transparent'}" stroke-width="${w.stroke_width || 0}" stroke-dasharray="${w.stroke_type === 'dashed' ? '5,5' : 'none'}" stroke-linejoin="round"/>
            </svg>`;
        return;
    }

    if (w.type === 'vector_path' && w.points) {
        let d = '';
        w.points.forEach((p, idx) => { d += `${idx === 0 ? 'M' : 'L'} ${p.x} ${p.y}`; });
        container.innerHTML = `
            <svg width="100%" height="100%" style="overflow:visible; position:absolute; top:0; left:0;">
                <path d="${d}" fill="none" stroke="${w.stroke_color || '#0b99ff'}" stroke-width="${w.stroke_width || 2}" />
            </svg>
        `;
        return;
    }

    // Настройки текста теперь применяются через инлайн-стили
    if (w.type === 'text_block') {
        container.innerHTML = `
            <div style="
                width:100%; height:100%; 
                font-family: ${w.font_family || 'Inter, sans-serif'} !important; 
                font-size: ${w.font_size || 13}px !important; 
                color: ${w.font_color || '#1a202c'} !important;
                font-weight: ${w.isBold ? 'bold' : 'normal'} !important; 
                font-style: ${w.isItalic ? 'italic' : 'normal'} !important;
                line-height: ${w.line_height || 1.4}; 
                letter-spacing: ${w.letter_spacing || 0}px;
                word-wrap: break-word; 
                padding: 4px; 
                box-sizing: border-box;
                white-space: ${w.text_resizing === 'auto-width' ? 'nowrap' : 'normal'};
            ">${w.text_content || 'Текст'}</div>
        `;
        return;
    }

    if (w.type === 'kpi_card') {
        // 1. Собираем параметры шрифтов и стилей из объекта виджета w
        const fontFamily = w.font_family || 'sans-serif';
        const textColor = w.text_color || '#0f172a';      
        const labelColor = w.label_color || '#64748b';    
        const textAlign = w.text_align || 'left';         
        
        // Параметры начертания
        const isBold = w.font_weight === 'bold' || w.is_bold === true;
        const isItalic = w.font_style === 'italic' || w.is_italic === true;

        // Динамические размеры (если юзер меняет их из панели свойств)
        const valueSize = w.font_size ? `${w.font_size}px` : '24px';
        const labelSize = w.label_size ? `${w.label_size}px` : '11px';

        // 2. Генерируем HTML с применением всех стилей
        container.innerHTML = `
            <div style="
                padding: 12px; 
                font-family: ${fontFamily}; 
                height: 100%; 
                display: flex; 
                flex-direction: column; 
                justify-content: space-between; 
                box-sizing: border-box; 
                user-select: none;
                text-align: ${textAlign};
            ">
                <div style="
                    font-size: ${labelSize}; 
                    color: ${labelColor}; 
                    font-weight: 500; 
                    text-transform: uppercase;
                    letter-spacing: 0.5px;
                    margin-bottom: 4px;
                ">
                    ${w.text_content || 'KPI Индикатор'}
                </div>
                
                <div style="
                    font-size: ${valueSize}; 
                    font-weight: ${isBold ? '700' : '400'}; 
                    font-style: ${isItalic ? 'italic' : 'normal'};
                    color: ${textColor};
                    line-height: 1.2;
                    transition: color 0.2s ease, font-size 0.2s ease;
                ">
                    ${w.kpi_value || '0'}
                </div>
            </div>
        `;
        return;
    }

    // Стили текста (цвет, шрифт, размер) наследуются и применяются ко всей таблице
    if (w.type === 'table_element') {
        if (!w.table_data) {
            w.table_data = {
                headers: ['Столбец 1', 'Столбец 2'],
                rows: [['Ячейка 1', 'Ячейка 2'], ['Ячейка 3', 'Ячейка 4']]
            };
        }
        
        const fontFamily = w.font_family || 'Inter, sans-serif';
        const fontSize = w.font_size ? `${w.font_size}px` : '11px';
        const fontColor = w.font_color || '#334155';
        const fontWeight = w.isBold ? 'bold' : 'normal';
        const fontStyle = w.isItalic ? 'italic' : 'normal';

        let tableHtml = `<table style="width:100%; height:100%; border-collapse:collapse; font-family:${fontFamily} !important; font-size:${fontSize} !important; color:${fontColor} !important; font-weight:${fontWeight} !important; font-style:${fontStyle} !important;">`;
        
        // Шапка таблицы
        tableHtml += '<thead><tr>';
        w.table_data.headers.forEach(h => {
            tableHtml += `<th style="background:#f1f5f9; border:1px solid #cbd5e1; padding:6px; font-weight:600; text-align:left; color:#1e293b; font-family:${fontFamily} !important; font-size:${fontSize} !important;">${h || ''}</th>`;
        });
        tableHtml += '</tr></thead><tbody>';

        // Строки таблицы
        w.table_data.rows.forEach(row => { 
            tableHtml += '<tr>'; 
            row.forEach(cell => { 
                tableHtml += `<td style="border:1px solid #e2e8f0; padding:6px; background:#fff; color:${fontColor} !important; font-family:${fontFamily} !important; font-size:${fontSize} !important; font-weight:${fontWeight} !important; font-style:${fontStyle} !important;">${cell || ''}</td>`; 
            }); 
            tableHtml += '</tr>'; 
        });
        
        tableHtml += '</tbody></table>';
        container.innerHTML = tableHtml;
        return;
    }

    if (w.type.startsWith('chart_')) {
        const isTransparent = w.bg_color === 'transparent' || !w.bg_color;
        container.style.background = isTransparent ? 'transparent' : w.bg_color;
        container.style.borderRadius = (w.border_radius || 0) + 'px';
        container.style.border = w.border_width ? `${w.border_width}px solid ${w.stroke_color || '#000'}` : 'none';
        
        container.innerHTML = `<div class="chart-container" style="width:100%; height:100%; min-width:100px; min-height:100px;"></div>`;
    }
}

function applyFigmaStyles(el, w) {
    if (w.type === 'shape_rect' || w.type === 'shape_circle') return; 

    if (w.fill_type === 'solid') {
        el.style.backgroundColor = w.bg_color;
    } else if (w.fill_type === 'linear-gradient') {
        el.style.background = `linear-gradient(135deg, ${w.bg_color}, ${w.gradient_color_2 || '#fff'})`;
    } else if (w.fill_type === 'radial-gradient') {
        el.style.background = `radial-gradient(circle, ${w.bg_color}, ${w.gradient_color_2 || '#fff'})`;
    }

    const isSpecialShape = w.type.includes('triangle') || w.type.includes('polygon') || w.type.includes('star');
    if (w.stroke_width > 0 && !isSpecialShape) {
        el.style.border = `${w.stroke_width}px ${w.stroke_type || 'solid'} ${w.stroke_color || '#000'}`;
    }

    if (w.blend_mode) el.style.mixBlendMode = w.blend_mode;
    
    let filterString = '';
    if (w.effects?.layerBlur > 0) filterString += `blur(${w.effects.layerBlur}px) `;
    el.style.filter = filterString.trim() || 'none';

    if (w.effects?.dropShadow) {
        const fx = w.effects;
        el.style.boxShadow = `${fx.shadowX || 0}px ${fx.shadowY || 0}px ${fx.shadowBlur || 0}px ${fx.shadowColor || 'rgba(0,0,0,0.5)'}`;
    }
}

function calculatePolygonPoints(sides) {
    let points = [];
    const radius = 45; 
    for (let i = 0; i < sides; i++) {
        let angle = (i * 2 * Math.PI) / sides - Math.PI / 2;
        let x = 50 + Math.cos(angle) * radius;
        let y = 50 + Math.sin(angle) * radius;
        points.push(`${x.toFixed(2)},${y.toFixed(2)}`);
    }
    return points.join(' ');
}

function calculateStarPoints(spikes) {
    let points = [];
    let rot = (Math.PI / 2) * 3;
    let step = Math.PI / spikes;
    const outerRadius = 45;
    const innerRadius = 20;

    for (let i = 0; i < spikes; i++) {
        let x1 = 50 + Math.cos(rot) * outerRadius;
        let y1 = 50 + Math.sin(rot) * outerRadius;
        points.push(`${x1.toFixed(2)},${y1.toFixed(2)}`);
        rot += step;

        let x2 = 50 + Math.cos(rot) * innerRadius;
        let y2 = 50 + Math.sin(rot) * innerRadius;
        points.push(`${x2.toFixed(2)},${y2.toFixed(2)}`);
        rot += step;
    }
    return points.join(' ');
}

function generateSvgGradient(w) {
    if (w.fill_type === 'solid' || !w.fill_type) return '';
    return `<defs>
        <linearGradient id="grad-${w.id}" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" style="stop-color:${w.bg_color};stop-opacity:1" />
            <stop offset="100%" style="stop-color:${w.gradient_color_2 || '#fff'};stop-opacity:1" />
        </linearGradient>
    </defs>`;
}
function initEChartInstance(w) {
    const widgetEl = document.getElementById(w.id);
    if (!widgetEl) {
        console.warn(`[eCharts Отладка] [ID: ${w.id}] Элемент виджета не найден в DOM!`);
        return;
    }
    const chartDom = widgetEl.querySelector('.chart-container');
    if (!chartDom) {
        console.warn(`[eCharts Отладка] [ID: ${w.id}] Контейнер .chart-container не найден!`);
        return;
    }

    if (typeof window.echarts === 'undefined') {
        console.error("[eCharts Отладка] Библиотека window.echarts не загружена!");
        return;
    }

    // Проверяем, почему график инициализируется
    console.log(`%c[eCharts Инициализация] Вызвана для [ID: ${w.id}, Имя: ${w.name || 'Без имени'}]`, 'color: #0b99ff; font-weight: bold;');

    if (chartDom.getAttribute('data-chart-initialized') === 'true') {
        console.log(`%c[eCharts Отладка] [ID: ${w.id}] График уже имел атрибут инициализации, но функция всё равно вызвана!`, 'color: #e28743');
    }
    
    chartDom.setAttribute('data-chart-initialized', 'true');

    setTimeout(() => {
        let myChart = window.echarts.getInstanceByDom(chartDom);
        if (!myChart) {
            console.log(`[eCharts Отладка] [ID: ${w.id}] Создаем новый инстанс ECharts (init)`);
            myChart = window.echarts.init(chartDom, null, { renderer: 'svg' });
        } else {
            console.log(`[eCharts Отладка] [ID: ${w.id}] Инстанс уже существовал в памяти ECharts`);
        }
        
        updateEChartOptions(myChart, w);
    }, 50);
}

function updateEChartOptions(chartInstance, w) {
    const defaultColors = ['#0b99ff', '#38a169', '#e53e3e', '#805ad5', '#e28743'];
    const points = w.chart_points && w.chart_points.length > 0 
        ? w.chart_points 
        : [{ label: 'Параметр 1', val: 40 }, { label: 'Параметр 2', val: 60 }];

    const isPie = w.type === 'chart_pie';
    const isRadar = w.type === 'chart_radar';
    const isLine = w.type === 'chart_line';
    const isBar = w.type === 'chart_bar';
    const isAlreadyAnimated = chartInstance.custom_animated === true;
    const usePercent = w.show_as_percent === true;
    const labelFormatter = (params) => {
        let value = isPie ? params.value : params.data;
        if (typeof value === 'object' && value !== null) value = value.value || 0;
        
        if (usePercent) {
            if (isPie) return `${params.name}: ${value} (${params.percent}%)`;
            const total = points.reduce((sum, p) => sum + p.val, 0) || 1;
            const pct = ((value / total) * 100).toFixed(1);
            return `${value} (${pct}%)`;
        }
        return isPie ? `${params.name}: ${value}` : value;
    };

   let option = {
        // Стартовая анимация включена ТОЛЬКО в самый первый раз
        animation: !isAlreadyAnimated, 
        animationDuration: 500,
        
        // Анимация изменения цифр включена ВСЕГДА (для плавности перетекания)
        animationUpdate: true,        
        animationDurationUpdate: 350, 
        animationEasing: 'cubicOut',
        animationEasingUpdate: 'cubicOut',
        backgroundColor: 'transparent',
        
        tooltip: { 
            show: true,
            trigger: isPie ? 'item' : (isRadar ? 'item' : 'axis'),
            confine: true,
            borderWidth: 0,
            backgroundColor: 'rgba(15, 23, 42, 0.9)',
            textStyle: { color: '#fff', fontSize: 11 }
        },
        grid: (isPie || isRadar) ? undefined : { top: 35, bottom: 30, left: 50, right: 20 },
    };

    if (isRadar) {
        const maxVal = Math.max(...points.map(x => x.val)) * 1.2 || 100;
        option.radar = {
            indicator: points.map(p => ({ name: `${p.label}: ${p.val}`, max: maxVal })),
            axisName: { color: '#64748b', fontSize: 10 },
            splitArea: { show: true, areaStyle: { color: ['rgba(250,250,250,0.02)', 'rgba(200,200,200,0.02)'] } }
        };
        option.series = [{
            type: 'radar',
            data: [{
                value: points.map(p => p.val),
                name: w.name || 'Показатели',
                itemStyle: { color: w.line_color || '#0b99ff' },
                areaStyle: { color: (w.line_color || '#0b99ff') + '33' }
            }],
            label: { show: false }
        }];
    } else if (isPie) {
        option.series = [{
            type: 'pie',
            radius: '65%',
            center: ['50%', '50%'],
            // Добавляем hover-анимацию увеличения сектора при наведении
            emphasis: {
                scale: true,
                scaleSize: 6,
                itemStyle: { shadowBlur: 10, shadowOffsetX: 0, shadowColor: 'rgba(0, 0, 0, 0.2)' }
            },
            data: points.map((p, idx) => ({
                name: p.label,
                value: p.val,
                itemStyle: { color: p.color || defaultColors[idx % defaultColors.length] }
            })),
            label: {
                show: true,
                position: 'outside',
                formatter: labelFormatter,
                fontSize: 11,
                color: '#1e293b'
            }
        }];
    } else {
        option.xAxis = { type: 'category', data: points.map(p => p.label), axisLabel: { fontSize: 10 } };
        option.yAxis = { type: 'value', axisLabel: { fontSize: 10 }, splitLine: { show: true, lineStyle: { color: '#e2e8f0' } } };
        
        option.series = [{
            type: isLine ? 'line' : 'bar',
            barMaxWidth: 30,
            data: points.map(p => p.val),
            // Эффект наведения для столбцов/линий
            emphasis: {
                itemStyle: { focus: 'series', opacity: 0.9 }
            },
            itemStyle: {
                color: isLine ? (w.line_color || '#0b99ff') : function(params) {
                    return points[params.dataIndex].color || w.line_color || defaultColors[params.dataIndex % defaultColors.length];
                }
            },
            lineStyle: isLine ? { width: 3, color: w.line_color || '#0b99ff' } : undefined,
            label: { show: true, position: 'top', formatter: labelFormatter, fontSize: 10 }
        }];
    }

    chartInstance.setOption(option, false);
    chartInstance.custom_animated = true;
}

// Хранилище для свёрнутых листов (чтобы состояние не терялось при перерисовке)
if (!window.collapsedSheets) {
    window.collapsedSheets = new Set();
}

function renderLayersTree() {
    if (!layersContainer) return;
    
    layersContainer.innerHTML = '';
    
    let draggedId = null;
    let draggedType = null;

    state.sheets.forEach(sheet => {
        // Создаем контейнер-обёртку для листа и его подслоев
        const sheetWrapper = document.createElement('div');
        sheetWrapper.className = 'sheet-layer-wrapper';
        sheetWrapper.style.marginBottom = '4px';

        // Рендерим сам заголовок листа
        const sheetItem = createLayerDOMNode(sheet, 'sheet', `fa-solid fa-file-invoice`);
        sheetWrapper.appendChild(sheetItem);

        // Создаем контейнер для внутренних виджетов листа
        const widgetsContainer = document.createElement('div');
        widgetsContainer.className = 'sheet-widgets-container';
        widgetsContainer.style.display = window.collapsedSheets.has(sheet.id) ? 'none' : 'block';
        sheetWrapper.appendChild(widgetsContainer);

        // Добавляем кнопку сворачивания/разворачивания в заголовок листа
        const isCollapsed = window.collapsedSheets.has(sheet.id);
        const foldBtn = document.createElement('i');
        foldBtn.className = `fa-solid ${isCollapsed ? 'fa-chevron-right' : 'fa-chevron-down'} fold-btn`;
        foldBtn.style.cssText = 'cursor:pointer; font-size:10px; color:#64748b; margin-right:4px;';
        
        foldBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            if (window.collapsedSheets.has(sheet.id)) {
                window.collapsedSheets.delete(sheet.id);
            } else {
                window.collapsedSheets.add(sheet.id);
            }
            renderLayersTree(); // Быстро перерисовываем только дерево слоев
        });
        
        // Вставляем стрелочку в самое начало кликабельной зоны листа
        const clickZone = sheetItem.querySelector('.layer-title-clickable');
        if (clickZone) clickZone.insertBefore(foldBtn, clickZone.firstChild);

        // DRAG & DROP ДЛЯ ЛИСТОВ 
        sheetItem.setAttribute('draggable', 'true');
        sheetItem.addEventListener('dragstart', (e) => {
            draggedId = sheet.id;
            draggedType = 'sheet';
            sheetItem.style.opacity = '0.5';
            e.stopPropagation();
        });
        sheetItem.addEventListener('dragend', () => { sheetItem.style.opacity = '1'; });
        sheetItem.addEventListener('dragover', (e) => e.preventDefault());
        sheetItem.addEventListener('drop', async (e) => {
            e.preventDefault();
            e.stopPropagation();
            if (draggedType !== 'sheet' || draggedId === sheet.id) return;

            const fromIdx = state.sheets.findIndex(s => s.id === draggedId);
            const toIdx = state.sheets.findIndex(s => s.id === sheet.id);

            if (fromIdx !== -1 && toIdx !== -1) {
                const [movedSheet] = state.sheets.splice(fromIdx, 1);
                state.sheets.splice(toIdx, 0, movedSheet);
                
                if (blueprint) blueprint.innerHTML = ''; 
                const m = await import('./state.js');
                m.dispatchUpdate();
            }
        });

        // Рендерим виджеты текущего листа внутрь его контейнера
        const sheetWidgets = state.widgets.filter(w => w.sheetId === sheet.id);
        
        [...sheetWidgets].reverse().forEach(widget => {
            let icon = 'fa-solid fa-shapes';
            if (widget.type.startsWith('chart_')) icon = 'fa-solid fa-chart-diagram';
            if (widget.type === 'text_block') icon = 'fa-solid fa-font';
            if (widget.type === 'table_element') icon = 'fa-solid fa-table';
            
            const widgetItem = createLayerDOMNode(widget, 'widget', icon, true);
            widgetsContainer.appendChild(widgetItem);

            // DRAG & DROP ДЛЯ ВИДЖЕТОВ ВНУТРИ ЛИСТА 
            widgetItem.setAttribute('draggable', 'true');
            widgetItem.addEventListener('dragstart', (e) => {
                draggedId = widget.id;
                draggedType = 'widget';
                widgetItem.style.opacity = '0.5';
                e.stopPropagation();
            });
            widgetItem.addEventListener('dragend', () => { widgetItem.style.opacity = '1'; });
            widgetItem.addEventListener('dragover', (e) => e.preventDefault());
            widgetItem.addEventListener('drop', async (e) => {
                e.preventDefault();
                e.stopPropagation();
                if (draggedType !== 'widget' || draggedId === widget.id) return;

                const fromIdx = state.widgets.findIndex(w => w.id === draggedId);
                const toIdx = state.widgets.findIndex(w => w.id === widget.id);

                if (fromIdx !== -1 && toIdx !== -1) {
                    if (state.widgets[fromIdx].sheetId === state.widgets[toIdx].sheetId) {
                        const [movedWidget] = state.widgets.splice(fromIdx, 1);
                        state.widgets.splice(toIdx, 0, movedWidget);

                        if (blueprint) blueprint.innerHTML = ''; 
                        const m = await import('./state.js');
                        m.dispatchUpdate();
                    }
                }
            });
        });

        layersContainer.appendChild(sheetWrapper);
    });
}

function createLayerDOMNode(obj, type, iconClass, isNested = false) {
    const item = document.createElement('div');
    
    // ПРОВЕРКА ПОДСВЕТКИ: проверяем наличие ID в стейте выделения
    const isActiveLayer = state.selectedIds.includes(obj.id) && state.selectedType === type;
    
    item.className = `layer-item ${isActiveLayer ? 'active' : ''}`;
    item.style.cssText = `
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 6px 8px;
        margin-bottom: 2px;
        border-radius: 4px;
        transition: background 0.15s;
        background: ${isActiveLayer ? '#e2e8f0 !important' : 'transparent'}; 
        border-left: ${isActiveLayer ? '3px solid #0b99ff' : '3px solid transparent'};
    `;
    
    if (isNested) {
        item.style.paddingLeft = '24px';
        item.style.marginLeft = '4px';
    }

    const isVisible = state.layerVisibility[obj.id] !== false;
    const isLocked = state.layerLocks[obj.id] === true;

    item.innerHTML = `
        <div class="layer-title-clickable" style="flex-grow:1; display:flex; align-items:center; gap:6px; cursor:pointer; overflow:hidden;">
            <i class="fa-solid fa-bars drag-handle" style="font-size:9px; color:#94a3b8; cursor:grab; display:${isNested ? 'block' : 'none'};"></i>
            <i class="${iconClass}" style="font-size:10px; width:12px; color:#94a3b8;"></i>
            <span class="layer-name-span" contenteditable="true" style="font-size:11px; color:#1e293b; font-weight:500; min-width:30px; outline:none;">${obj.name || obj.text_content || obj.type}</span>
        </div>
        <div class="layer-actions" style="display:flex; gap:6px; color:#64748b; user-select:none;">
            <i class="fa-solid ${isVisible ? 'fa-eye' : 'fa-eye-slash'} layer-action-btn toggle-vis" title="Скрыть/Показать" style="cursor:pointer;"></i>
            <i class="fa-solid ${isLocked ? 'fa-lock' : 'fa-lock-open'} layer-action-btn toggle-lock" title="Заблокировать слой" style="cursor:pointer;"></i>
        </div>
    `;

    const nameSpan = item.querySelector('.layer-name-span');
    nameSpan.addEventListener('blur', (e) => {
        obj.name = e.target.innerText.trim();
        import('./state.js').then(m => m.dispatchUpdate());
    });
    nameSpan.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); nameSpan.blur(); }
    });

    item.querySelector('.layer-title-clickable').addEventListener('click', async (e) => {
        if (e.target.classList.contains('fold-btn') || e.target === nameSpan || e.target.classList.contains('drag-handle')) return; 
        
        const isMulti = state.isShiftPressed;
        const stateModule = await import('./state.js');

        if (isMulti) {
            if (state.selectedIds.includes(obj.id)) {
                state.selectedIds = state.selectedIds.filter(id => id !== obj.id);
            } else {
                if (state.selectedType !== type) state.selectedIds = [];
                state.selectedIds.push(obj.id);
            }
        } else {
            state.selectedIds = [obj.id];
        }

        state.selectedType = type;

        if (type === 'sheet') {
            state.activeSheetId = obj.id;
        } else if (type === 'widget' && obj.sheetId) {
            state.activeSheetId = obj.sheetId;
        }

        stateModule.dispatchUpdate();
    });

    item.querySelector('.toggle-vis').addEventListener('click', (e) => {
        e.stopPropagation();
        state.layerVisibility[obj.id] = !isVisible;
        if (blueprint) blueprint.innerHTML = ''; 
        import('./state.js').then(m => m.dispatchUpdate());
    });

    item.querySelector('.toggle-lock').addEventListener('click', (e) => {
        e.stopPropagation();
        state.layerLocks[obj.id] = !isLocked;
        import('./state.js').then(m => m.dispatchUpdate());
    });

    return item;
}

// Делаем функцию глобальной для state.js
window.renderLayersTree = renderLayersTree;

function syncPropertiesPanel() {
    if (!state.selectedIds || state.selectedIds.length === 0) return;
    const currentActiveId = state.selectedIds[state.selectedIds.length - 1];

    const target = state.selectedType === 'widget' 
        ? state.widgets.find(w => w.id === currentActiveId)
        : state.sheets.find(s => s.id === currentActiveId);

    if (!target) return;

    const setVal = (id, val) => { const el = document.getElementById(id); if (el) el.value = val; };

    setVal('prop-x', Math.round(target.x));
    setVal('prop-y', Math.round(target.y));
    setVal('prop-w', Math.round(target.w));
    setVal('prop-h', Math.round(target.h));
    setVal('prop-rotation', target.rotation || 0);
    setVal('prop-opacity', target.opacity !== undefined ? target.opacity : 100);

    const rotLabel = document.getElementById('rotate-val-label');
    const opacityLabel = document.getElementById('opacity-val-label');
    if (rotLabel) rotLabel.innerText = `${target.rotation || 0}°`;
    if (opacityLabel) opacityLabel.innerText = `${target.opacity !== undefined ? target.opacity : 100}%`;

    // Ползунки ограничений вместо текстовых полей ввода геометрии
    const radiusBox = document.getElementById('prop-radius-box');
    const sidesBox = document.getElementById('prop-polygon-sides-box');
    
    if (radiusBox && sidesBox) {
        if (target.type === 'shape_circle') {
            radiusBox.style.display = 'none';
            sidesBox.style.display = 'none';
        } else if (target.type === 'shape_polygon' || target.type === 'shape_star') {
            radiusBox.style.display = 'none';
            sidesBox.style.display = 'block';
            sidesBox.innerHTML = `
                <div style="display:flex; justify-content:space-between; font-size:11px;">
                    <span>Стороны/Вершины:</span>
                    <span id="sides-val-lbl">${target.polygon_sides || 5}</span>
                </div>
                <input type="range" id="prop-polygon-sides-slider" min="3" max="30" value="${target.polygon_sides || 5}" style="width:100%;">
            `;
            document.getElementById('prop-polygon-sides-slider').addEventListener('input', (e) => {
                target.polygon_sides = parseInt(e.target.value);
                document.getElementById('sides-val-lbl').innerText = e.target.value;
                import('./state.js').then(m => m.dispatchUpdate());
            });
        } else {
            radiusBox.style.display = 'block';
            sidesBox.style.display = 'none';
            radiusBox.innerHTML = `
                <div style="display:flex; justify-content:space-between; font-size:11px;">
                    <span>Скругление углов:</span>
                    <span id="radius-val-lbl">${target.border_radius || 0}px</span>
                </div>
                <input type="range" id="prop-border-radius-slider" min="0" max="50" value="${target.border_radius || 0}" style="width:100%;">
            `;
            document.getElementById('prop-border-radius-slider').addEventListener('input', (e) => {
                target.border_radius = parseInt(e.target.value);
                document.getElementById('radius-val-lbl').innerText = e.target.value + 'px';
                import('./state.js').then(m => m.dispatchUpdate());
            });
        }
    }

    // Ползунок-ограничитель (макс 20px)
    const strokeWidthInput = document.getElementById('prop-stroke-width');
    if (strokeWidthInput && strokeWidthInput.type !== 'range') {
        const parent = strokeWidthInput.parentElement;
        if (parent) {
            parent.innerHTML = `
                <div style="display:flex; justify-content:space-between; font-size:11px;">
                    <span>Толщина обводки:</span>
                    <span id="stroke-w-lbl">${target.stroke_width || 0}px</span>
                </div>
                <input type="range" id="prop-stroke-width" min="0" max="20" value="${target.stroke_width || 0}" style="width:100%;">
            `;
            document.getElementById('prop-stroke-width').addEventListener('input', (e) => {
                target.stroke_width = parseInt(e.target.value);
                document.getElementById('stroke-w-lbl').innerText = e.target.value + 'px';
                import('./state.js').then(m => m.dispatchUpdate());
            });
        }
    }

    const autoLayoutSection = document.getElementById('inspector-auto-layout');
    if (autoLayoutSection) {
        if (target.type === 'frame' && target.autoLayout) {
            autoLayoutSection.style.display = 'block';
            setVal('prop-al-spacing', target.autoLayout.spacing || 0);
            setVal('prop-al-padding', target.autoLayout.paddingTop || 0);
            
            const btnHor = document.getElementById('prop-al-dir-hor');
            const btnVer = document.getElementById('prop-al-dir-ver');
            if (target.autoLayout.direction === 'horizontal') {
                btnHor?.classList.add('active'); btnVer?.classList.remove('active');
            } else {
                btnVer?.classList.add('active'); btnHor?.classList.remove('active');
            }
        } else {
            autoLayoutSection.style.display = 'none';
        }
    }

    if (target.fill_type) {
        setVal('prop-fill-type', target.fill_type);
        setVal('prop-bg-color', target.bg_color || '#ffffff');
        
        const gradColor2El = document.getElementById('prop-gradient-color2');
        if (gradColor2El) {
            gradColor2El.value = target.gradient_color_2 || '#38a169';
            gradColor2El.style.display = target.fill_type === 'solid' ? 'none' : 'block';
        }
    }

    if (target.stroke_color !== undefined) {
        setVal('prop-stroke-color', target.stroke_color);
        setVal('prop-stroke-type', target.stroke_type || 'solid');
    }

    if (target.effects) {
        const shadowEnEl = document.getElementById('prop-effect-shadow-en');
        if (shadowEnEl) shadowEnEl.checked = !!target.effects.dropShadow;
        setVal('prop-effect-blur', target.effects.layerBlur || 0);
    }

    if (widgetPropsContainer) {
        if (document.activeElement?.id !== 'prop-custom-text' && !document.activeElement?.classList.contains('prop-chart-input')) {
            widgetPropsContainer.innerHTML = '';
            
            // РЕДАКТОР ДЛЯ ТЕКСТА И KPI
            if (target.type === 'text_block' || target.type === 'kpi_card') {
                widgetPropsContainer.innerHTML = `
                    <div class="form-group" style="margin-bottom:12px;">
                        <label style="font-size:10px; color:#94a3b8; display:block; margin-bottom:4px;">Контент / Текст</label>
                        <textarea id="prop-custom-text" class="form-control" style="width:100%; height:60px; font-size:12px; font-family:sans-serif;">${target.text_content || ''}</textarea>
                    </div>
                `;
                document.getElementById('prop-custom-text').addEventListener('input', (e) => {
                    target.text_content = e.target.value;
                    import('./state.js').then(m => m.dispatchUpdate());
                });
                return;
            }

            // Интерактивный редактор таблиц (Строки, Столбцы, Удаление на месте)
            if (target.type === 'table_element') {
                if (!target.table_data) {
                    target.table_data = {
                        headers: ['Столбец 1', 'Столбец 2'],
                        rows: [['Ячейка 1', 'Ячейка 2'], ['Ячейка 3', 'Ячейка 4']]
                    };
                }

                let tableHtml = `
                    <div class="form-group" style="margin-bottom:12px;">
                        <label style="font-size:10px; color:#94a3b8; display:block; margin-bottom:6px; font-weight:600;">Столбцы таблицы</label>
                        <div style="display:flex; flex-direction:column; gap:4px; margin-bottom:6px;">
                `;

                target.table_data.headers.forEach((h, colIdx) => {
                    tableHtml += `
                        <div style="display:flex; gap:4px; align-items:center;">
                            <input type="text" class="prop-table-header" data-idx="${colIdx}" style="flex:1; font-size:11px; padding:4px;" value="${h}">
                            <i class="fa-solid fa-trash remove-col-btn" data-idx="${colIdx}" style="cursor:pointer; color:#ef4444; font-size:11px; padding:4px;" title="Удалить столбец"></i>
                        </div>
                    `;
                });

                tableHtml += `
                        </div>
                        <button id="add-table-col-btn" style="width:100%; font-size:11px; padding:4px; background:#f1f5f9; border:1px solid #cbd5e1; border-radius:4px; cursor:pointer; margin-bottom:12px;">+ Добавить столбец</button>
                        
                        <label style="font-size:10px; color:#94a3b8; display:block; margin-bottom:6px; font-weight:600;">Строки и данные</label>
                        <div style="display:flex; flex-direction:column; gap:6px; max-height:180px; overflow-y:auto; margin-bottom:6px;">
                `;

                target.table_data.rows.forEach((row, rowIdx) => {
                    tableHtml += `<div style="display:flex; gap:4px; align-items:center; padding-bottom:4px; border-bottom:1px solid #f1f5f9;">`;
                    row.forEach((cell, colIdx) => {
                        tableHtml += `<input type="text" class="prop-table-cell" data-row="${rowIdx}" data-col="${colIdx}" style="flex:1; min-width:30px; font-size:10px; padding:2px;" value="${cell}">`;
                    });
                    tableHtml += `
                            <i class="fa-solid fa-trash remove-row-btn" data-idx="${rowIdx}" style="cursor:pointer; color:#ef4444; font-size:11px; padding:4px;" title="Удалить строку"></i>
                        </div>
                    `;
                });

                tableHtml += `
                        </div>
                        <button id="add-table-row-btn" style="width:100%; font-size:11px; padding:4px; background:#f1f5f9; border:1px solid #cbd5e1; border-radius:4px; cursor:pointer;">+ Добавить строку</button>
                    </div>
                `;

                widgetPropsContainer.innerHTML = tableHtml;

                // Слушатели таблицы
                widgetPropsContainer.querySelectorAll('.prop-table-header').forEach(input => {
                    input.addEventListener('change', (e) => {
                        const idx = parseInt(e.target.getAttribute('data-idx'));
                        target.table_data.headers[idx] = e.target.value;
                        import('./state.js').then(m => m.dispatchUpdate());
                    });
                });

                widgetPropsContainer.querySelectorAll('.prop-table-cell').forEach(input => {
                    input.addEventListener('change', (e) => {
                        const r = parseInt(e.target.getAttribute('data-row'));
                        const c = parseInt(e.target.getAttribute('data-col'));
                        target.table_data.rows[r][c] = e.target.value;
                        import('./state.js').then(m => m.dispatchUpdate());
                    });
                });

                widgetPropsContainer.querySelectorAll('.remove-col-btn').forEach(btn => {
                    btn.addEventListener('click', (e) => {
                        const idx = parseInt(e.target.getAttribute('data-idx'));
                        if (target.table_data.headers.length <= 1) return;
                        target.table_data.headers.splice(idx, 1);
                        target.table_data.rows.forEach(r => r.splice(idx, 1));
                        import('./state.js').then(m => m.dispatchUpdate());
                        syncPropertiesPanel();
                    });
                });

                widgetPropsContainer.querySelectorAll('.remove-row-btn').forEach(btn => {
                    btn.addEventListener('click', (e) => {
                        const idx = parseInt(btn.getAttribute('data-idx'));
                        target.table_data.rows.splice(idx, 1);
                        import('./state.js').then(m => m.dispatchUpdate());
                        syncPropertiesPanel();
                    });
                });

                document.getElementById('add-table-col-btn').addEventListener('click', () => {
                    target.table_data.headers.push(`Столбец ${target.table_data.headers.length + 1}`);
                    target.table_data.rows.forEach(r => r.push(''));
                    import('./state.js').then(m => m.dispatchUpdate());
                    syncPropertiesPanel();
                });

                document.getElementById('add-table-row-btn').addEventListener('click', () => {
                    const newRow = Array(target.table_data.headers.length).fill('');
                    target.table_data.rows.push(newRow);
                    import('./state.js').then(m => m.dispatchUpdate());
                    syncPropertiesPanel();
                });
                return;
            }

            // Обновленный блок свойств для графиков (проценты, общая линия)
            if (target.type?.startsWith('chart_')) {
                if (!target.chart_points) {
                    target.chart_points = [{ label: 'Параметр 1', val: 40 }, { label: 'Параметр 2', val: 30 }];
                }

                const isLineOrRadar = target.type === 'chart_line' || target.type === 'chart_radar';

                let propsHtml = `
                    <div class="form-group" style="margin-bottom:12px; border-bottom:1px solid #e2e8f0; padding-bottom:10px;">
                        <label style="font-size:10px; color:#94a3b8; display:block; margin-bottom:6px; font-weight:600;">Настройки диаграммы</label>
                        
                        <label style="display:flex; align-items:center; gap:6px; font-size:11px; margin-bottom:8px; cursor:pointer;">
                            <input type="checkbox" id="chart-prop-percent" ${target.show_as_percent ? 'checked' : ''}>
                            Показывать в процентах (%)
                        </label>

                        ${isLineOrRadar ? `
                            <div style="display:flex; align-items:center; gap:8px; margin-top:8px;">
                                <span style="font-size:11px;">Цвет линии/граней:</span>
                                <input type="color" id="chart-prop-line-color" style="width:28px; height:22px; border:none; background:none; cursor:pointer;" value="${target.line_color || '#0b99ff'}">
                            </div>
                        ` : ''}
                    </div>

                    <div class="form-group" style="margin-bottom:12px;">
                        <label style="font-size:10px; color:#94a3b8; display:block; margin-bottom:6px; font-weight:600;">Данные списка</label>
                        <div id="chart-points-list" style="display:flex; flex-direction:column; gap:6px; margin-bottom:8px;">
                `;

                target.chart_points.forEach((p, idx) => {
                    propsHtml += `
                        <div class="chart-point-row" data-idx="${idx}" style="display:flex; gap:4px; align-items:center;">
                            ${!isLineOrRadar ? `
                                <input type="color" class="prop-chart-input point-color" style="width:20px; height:20px; border:none; background:none; cursor:pointer;" value="${p.color || '#0b99ff'}">
                            ` : ''}
                            <input type="text" class="prop-chart-input point-label" style="flex:2; font-size:11px; padding:4px; border:1px solid #cbd5e1; border-radius:4px;" value="${p.label}">
                            <input type="number" class="prop-chart-input point-val" style="flex:1; font-size:11px; padding:4px; border:1px solid #cbd5e1; border-radius:4px; width:40px;" value="${p.val}">
                            <i class="fa-solid fa-trash remove-point-btn" style="cursor:pointer; color:#ef4444; font-size:11px; padding:4px;"></i>
                        </div>
                    `;
                });

                propsHtml += `
                        </div>
                        <button id="add-chart-point-btn" style="width:100%; font-size:11px; padding:5px; background:#f1f5f9; border:1px solid #cbd5e1; border-radius:4px; cursor:pointer;">
                            + Добавить категорию
                        </button>
                    </div>
                `;

                widgetPropsContainer.innerHTML = propsHtml;

                // Слушатели для настроек графиков
                document.getElementById('chart-prop-percent').addEventListener('change', (e) => {
                    target.show_as_percent = e.target.checked;
                    triggerChartUpdate(target);
                });

                if (isLineOrRadar && document.getElementById('chart-prop-line-color')) {
                    document.getElementById('chart-prop-line-color').addEventListener('change', (e) => {
                        target.line_color = e.target.value;
                        triggerChartUpdate(target);
                    });
                }

                widgetPropsContainer.querySelectorAll('.chart-point-row').forEach(row => {
                    const idx = parseInt(row.getAttribute('data-idx'));
                    
                    if (!isLineOrRadar) {
                        row.querySelector('.point-color').addEventListener('change', (e) => {
                            target.chart_points[idx].color = e.target.value;
                            triggerChartUpdate(target);
                        });
                    }
                    row.querySelector('.point-label').addEventListener('change', (e) => {
                        target.chart_points[idx].label = e.target.value;
                        triggerChartUpdate(target);
                    });
                    row.querySelector('.point-val').addEventListener('change', (e) => {
                        target.chart_points[idx].val = parseFloat(e.target.value) || 0;
                        triggerChartUpdate(target);
                    });
                    row.querySelector('.remove-point-btn').addEventListener('click', () => {
                        target.chart_points.splice(idx, 1);
                        triggerChartUpdate(target);
                        syncPropertiesPanel();
                    });
                });

                document.getElementById('add-chart-point-btn').addEventListener('click', () => {
                    target.chart_points.push({ label: `Параметр ${target.chart_points.length + 1}`, val: 10 });
                    triggerChartUpdate(target);
                    syncPropertiesPanel();
                });
            }
        }
    }
}

function triggerChartUpdate(target) {
    import('./state.js').then(m => m.dispatchUpdate());
    const chartDom = document.getElementById(target.id)?.querySelector('.chart-container');
    const instance = window.echarts?.getInstanceByDom(chartDom);
    if (instance) updateEChartOptions(instance, target);
}

// Функция для поиска текущего редактируемого виджета
function getActiveWidget() {
    const activeId = state.selectedNodeId || (state.selectedIds && state.selectedIds[0]);
    return state.widgets.find(w => w.id === activeId);
}

// ГЛОБАЛЬНЫЙ СЛУШАТЕЛЬ ДЛЯ ИНСПЕКТОРА СВОЙСТВ ТЕКСТА
// Вешаем один раз на body, чтобы обработчики не дублировались при перерисовках
document.body.addEventListener('input', async (e) => {
    const widget = getActiveWidget();
    if (!widget || (widget.type !== 'text_block' && widget.type !== 'table_element')) return;

    let isTextChanged = false;

    // Проверяем, какой именно инпут изменился в сайдбаре
    if (e.target.id === 'text-font-family' || e.target.id === 'prop-font-family') {
        widget.font_family = e.target.value;
        isTextChanged = true;
    }
    
    if (e.target.id === 'text-font-size' || e.target.id === 'prop-font-size') {
        widget.font_size = parseInt(e.target.value) || 13;
        isTextChanged = true;
    }
    
    if (e.target.id === 'text-font-color' || e.target.id === 'prop-font-color') {
        widget.font_color = e.target.value;
        isTextChanged = true;
    }

    // Если текстовое свойство изменилось обновляем DOM и пушим изменения в state
    if (isTextChanged) {
        const el = document.getElementById(widget.id);
        if (el) injectWidgetContent(el, widget); // Мгновенно обновляем текст на холсте
        
        // Импортируем state и вызываем dispatchUpdate, чтобы сработал метод автосохранения
        const stateModule = await import('./state.js');
        stateModule.dispatchUpdate();
    }
});

// ОБРАБОТКА КНОПОК BOLD И ITALIC
document.body.addEventListener('click', async (e) => {
    const widget = getActiveWidget();
    if (!widget || (widget.type !== 'text_block' && widget.type !== 'table_element')) return;

    const btnBold = e.target.closest('#btn-toggle-bold');
    const btnItalic = e.target.closest('#btn-toggle-italic');

    if (btnBold) {
        widget.isBold = !widget.isBold;
        btnBold.classList.toggle('active', widget.isBold);
        
        const el = document.getElementById(widget.id);
        if (el) injectWidgetContent(el, widget);
        
        const stateModule = await import('./state.js');
        stateModule.dispatchUpdate();
    }

    if (btnItalic) {
        widget.isItalic = !widget.isItalic;
        btnItalic.classList.toggle('active', widget.isItalic);
        
        const el = document.getElementById(widget.id);
        if (el) injectWidgetContent(el, widget);
        
        const stateModule = await import('./state.js');
        stateModule.dispatchUpdate();
    }
});