import { 
    state, 
    saveHistoryState, 
    createNewWidget, 
    updateSelectedProps, 
    duplicateSelectedNode, 
    deleteSelectedNode,
    moveSelectedWidgetLayer, 
    dispatchUpdate,
    selectNode
} from './state.js';
import { updateTransform, renderEditor } from './render.js';
import interact from 'https://cdn.jsdelivr.net/npm/@interactjs/interactjs/index.js';
import { subscribe } from './state.js';

let viewportEl = null;
let blueprintEl = null;

// Переменные для прямоугольного выделения рамкой
let selectionBox = null;
let startSelectX = 0;
let startSelectY = 0;
let isSelecting = false;


//Инициализация основного холста и сопутствующих систем
export function initCanvasControls(viewport, blueprint) {
    viewportEl = viewport;
    blueprintEl = blueprint;

    initPanAndZoom();
    initSidebarDragAndDrop();
    initKeyboardShortcuts();
    initPropertiesPanelListeners();
    initApiModalListeners(); 

    // Обработка кликов и прямоугольного выделения рамкой
    viewportEl.addEventListener('mousedown', (e) => {
        // 1. Клик или растягивание рамки по пустому месту холста
        if (e.target === viewportEl || e.target === blueprintEl) {
            if (e.button === 0 && state.isShiftPressed) {
                // Запуск логики прямоугольного выделения (Shift + ЛКМ)
                isSelecting = true;
                const rect = blueprintEl.getBoundingClientRect();
                startSelectX = (e.clientX - rect.left) / state.zoom;
                startSelectY = (e.clientY - rect.top) / state.zoom;

                selectionBox = document.createElement('div');
                selectionBox.id = 'marquee-selection-box';
                Object.assign(selectionBox.style, {
                    position: 'absolute',
                    border: '1px dashed #0b99ff',
                    backgroundColor: 'rgba(11, 153, 255, 0.15)',
                    left: `${startSelectX}px`,
                    top: `${startSelectY}px`,
                    width: '0px',
                    height: '0px',
                    pointerEvents: 'none',
                    zIndex: '99999'
                });
                blueprintEl.appendChild(selectionBox);
                e.preventDefault();
                return;
            } else if (e.button === 0) {
                // Обычный клик по пустому месту — сбрасываем всё выделение
                state.selectedIds = [];
                state.selectedType = null;
                dispatchUpdate();
                return;
            }
        }

        // Проверяем, зажат ли Shift в момент клика по объектам
        const isMulti = state.isShiftPressed;

        // 2. Ищем, кликнули ли мы по виджету (.canvas-widget)
        const clickedWidget = e.target.closest('.canvas-widget');
        if (clickedWidget) {
            e.stopPropagation(); // Чтобы клик не провалился в лист под виджетом
            selectNode(clickedWidget.id, 'widget', isMulti);
            return;
        }

        // 3. Ищем, кликнули ли мы по листу (.canvas-sheet)
        const clickedSheet = e.target.closest('.canvas-sheet');
        if (clickedSheet) {
            if (e.target === clickedSheet || e.target.classList.contains('sheet-watermark') || e.target.tagName === 'HEADER') {
                selectNode(clickedSheet.id, 'sheet', isMulti);
            }
        }
        interact('.rotate-handle').draggable({
        onstart: function (event) {
            const widgetEl = event.target.closest('.canvas-widget');
            const rect = widgetEl.getBoundingClientRect();
            
            // Запоминаем центр элемента относительно окна браузера
            event.target.dataset.centerX = rect.left + rect.width / 2;
            event.target.dataset.centerY = rect.top + rect.height / 2;
        },
        onmove: function (event) {
            const widgetEl = event.target.closest('.canvas-widget');
            
            // Находим наш объект в state (проверяем по id)
            const widgetId = widgetEl.id.replace('widget-', ''); 
            const widgetObj = state.widgets.find(w => w.id === widgetId);
            
            if (!widgetObj) return;

            const centerX = parseFloat(event.target.dataset.centerX);
            const centerY = parseFloat(event.target.dataset.centerY);

            // Вычисляем угол между центром элемента и курсором мыши
            const angleRad = Math.atan2(event.clientY - centerY, event.clientX - centerX);
            let angleDeg = (angleRad * 180) / Math.PI;

            // Корректируем на 90 градусов 
            angleDeg = Math.round(angleDeg + 90);
            if (angleDeg < 0) angleDeg += 360;

            // Сохраняем в state
            widgetObj.rotation = angleDeg;

            // Вращаем визуально на холсте (учитывая, что позиция x/y задается через top/left)
            widgetEl.style.transform = `rotate(${angleDeg}deg)`;

            // Синхронизируем с инпутом в правой панели
            const propRotation = document.getElementById('prop-rotation');
            const labelRotation = document.getElementById('rotate-val-label');
            
            if (state.selectedIds.includes(widgetObj.id)) {
                if (propRotation) propRotation.value = angleDeg;
                if (labelRotation) labelRotation.innerText = `${angleDeg}°`;
            }
        },
        onend: function () {
            saveHistoryState();
            dispatchUpdate();
        }
    });
    });

    // Слежение за растягиванием рамки выделения
    window.addEventListener('mousemove', (e) => {
        if (!isSelecting || !selectionBox) return;

        const rect = blueprintEl.getBoundingClientRect();
        const currentX = (e.clientX - rect.left) / state.zoom;
        const currentY = (e.clientY - rect.top) / state.zoom;

        const x = Math.min(startSelectX, currentX);
        const y = Math.min(startSelectY, currentY);
        const w = Math.abs(startSelectX - currentX);
        const h = Math.abs(startSelectY - currentY);

        selectionBox.style.left = `${x}px`;
        selectionBox.style.top = `${y}px`;
        selectionBox.style.width = `${w}px`;
        selectionBox.style.height = `${h}px`;
    });

    // Завершение выделения рамкой
    window.addEventListener('mouseup', () => {
        if (!isSelecting) return;
        isSelecting = false;

        if (selectionBox) {
            const boxLeft = parseFloat(selectionBox.style.left);
            const boxTop = parseFloat(selectionBox.style.top);
            const boxRight = boxLeft + parseFloat(selectionBox.style.width);
            const boxBottom = boxTop + parseFloat(selectionBox.style.height);

            const newlySelectedIds = [];

            // Проверяем геометрическое пересечение со всеми виджетами
            state.widgets.forEach(widget => {
                const wLeft = widget.x;
                const wTop = widget.y;
                const wRight = widget.x + widget.w;
                const wBottom = widget.y + widget.h;

                const isIntersecting = !(wRight < boxLeft || wLeft > boxRight || wBottom < boxTop || wTop > boxBottom);

                if (isIntersecting && !state.layerLocks[widget.id]) {
                    newlySelectedIds.push(widget.id);
                }
            });

            if (newlySelectedIds.length > 0) {
                state.selectedType = 'widget';
                state.selectedIds = [...new Set([...state.selectedIds, ...newlySelectedIds])];
            } else if (!state.isShiftPressed) {
                state.selectedIds = [];
                state.selectedType = null;
            }

            selectionBox.remove();
            selectionBox = null;
            dispatchUpdate();
        }
    });
}

subscribe((updatedState) => {
    // ОБРАБОТКА ЛИСТОВ 
    document.querySelectorAll('.canvas-sheet').forEach(sheetEl => {
        if (updatedState.selectedIds.includes(sheetEl.id) && updatedState.selectedType === 'sheet') {
            sheetEl.classList.add('selected-sheet');
        } else {
            sheetEl.classList.remove('selected-sheet');
        }
    });

    // ОБРАБОТКА ВИДЖЕТОВ 
    document.querySelectorAll('.canvas-widget').forEach(widgetEl => {
        if (updatedState.selectedIds.includes(widgetEl.id) && updatedState.selectedType === 'widget') {
            widgetEl.classList.add('selected'); 
        } else {
            widgetEl.classList.remove('selected');
        }
    });
});

//Управление интеграцией с FastAPI для KPI карточек
function initApiModalListeners() {
    const btnOpen = document.getElementById('btn-open-api-modal');
    const btnClose = document.getElementById('btn-close-api-modal');
    const btnApply = document.getElementById('btn-apply-api');
    const modal = document.getElementById('api-cost-modal');
    const assetSelect = document.getElementById('api-asset-source');

    if (!modal) return;

    if (btnOpen) {
        btnOpen.addEventListener('click', () => {
            const currentSelectedId = state.selectedIds[0];
            const selectedWidget = state.widgets.find(w => w.id === currentSelectedId);
            if (!selectedWidget || selectedWidget.type !== 'kpi_card') {
                alert('⚠️ Пожалуйста, выберите KPI Карточку на холсте, чтобы привязать её к API цен!');
                return;
            }
            modal.style.display = 'flex';
        });
    }

    if (btnClose) {
        btnClose.addEventListener('click', () => {
            modal.style.display = 'none';
        });
    }

    if (btnApply) {
        btnApply.addEventListener('click', async () => {
            const source = assetSelect.value;
            const targetCurrency = document.getElementById('api-currency-target').value || 'RUB';
            
            btnApply.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Подключение...';
            btnApply.disabled = true;

            try {
                const response = await fetch(`/api/prices/ticker?source=${source}&target_currency=${targetCurrency}`);
                const data = await response.json();

                if (data.status === 'success') {
                    const currentSelectedId = state.selectedIds[0];
                    const selectedWidget = state.widgets.find(w => w.id === currentSelectedId);
                    if (selectedWidget) {
                        selectedWidget.kpi_value = data.value;
                        selectedWidget.api_source = source;
                        
                        const fullText = assetSelect.options[assetSelect.selectedIndex].text;
                        const cleanName = fullText.split(' (')[0] || source;
                        
                        selectedWidget.text_content = cleanName;
                        
                        saveHistoryState();
                        dispatchUpdate();
                    }
                    modal.style.display = 'none';
                } else {
                    alert('Ошибка привязки API: ' + (data.detail || 'Неизвестный сбой бэкенда'));
                }
            } catch (err) {
                console.error(err);
                alert('Не удалось связаться с сервером FastAPI.');
            } finally {
                btnApply.innerHTML = 'Привязать к KPI';
                btnApply.disabled = false;
            }
        });
    }
}


//Панорамирование и Масштабирование холста (Zoom & Pan)
function initPanAndZoom() {
    viewportEl.addEventListener('mousedown', (e) => {
        if (e.button === 1 || state.isSpacePressed) {
            state.isPanning = true;
            state.startX = e.clientX - state.panX;
            state.startY = e.clientY - state.panY;
            viewportEl.style.cursor = 'grabbing';
            e.preventDefault();
            renderEditor();
        }
    });

    window.addEventListener('mousemove', (e) => {
        if (!state.isPanning) return;
        state.panX = e.clientX - state.startX;
        state.panY = e.clientY - state.startY;
        updateTransform();
    });

    window.addEventListener('mouseup', () => {
        if (state.isPanning) {
            state.isPanning = false;
            viewportEl.style.cursor = state.isSpacePressed ? 'grab' : 'default';
        }
    });

    viewportEl.addEventListener('wheel', (e) => {
        if (e.ctrlKey || e.metaKey) {
            e.preventDefault();
            
            const zoomFactor = 1.08;
            const oldZoom = state.zoom;
            
            if (e.deltaY < 0) {
                state.zoom = Math.min(4.0, state.zoom * zoomFactor);
            } else {
                state.zoom = Math.max(0.15, state.zoom / zoomFactor);
            }

            const rect = viewportEl.getBoundingClientRect();
            const mouseX = e.clientX - rect.left;
            const mouseY = e.clientY - rect.top;

            state.panX = mouseX - (mouseX - state.panX) * (state.zoom / oldZoom);
            state.panY = mouseY - (mouseY - state.panY) * (state.zoom / oldZoom);

            updateTransform();
        }
    }, { passive: false });
}


//Drag and Drop из левой панели инструментов на холст
function initSidebarDragAndDrop() {
    const dragButtons = document.querySelectorAll('[data-widget-type]');
    dragButtons.forEach(btn => {
        btn.addEventListener('dragstart', (e) => {
            e.dataTransfer.setData('text/plain', btn.getAttribute('data-widget-type'));
        });
    });

    viewportEl.addEventListener('dragover', (e) => e.preventDefault());

    viewportEl.addEventListener('drop', (e) => {
        e.preventDefault();
        const widgetType = e.dataTransfer.getData('text/plain');
        if (!widgetType) return;

        const rect = blueprintEl.getBoundingClientRect();
        
        const localX = (e.clientX - rect.left) / state.zoom;
        const localY = (e.clientY - rect.top) / state.zoom;

        createNewWidget(widgetType, localX, localY);
    });
}


//Привязка перетаскивания и изменения размеров к конкретному виджету
export function bindWidgetTransform(elementId, widgetObj) {
    if (state.layerLocks[widgetObj.id]) return;

    const el = document.getElementById(elementId);
    if (!el) return;

    if (el.dataset.interactInitialized === 'true') return;

    try {
        interact(`#${elementId}`).unset();
    } catch (e) {}

    el.dataset.interactInitialized = 'true';

    interact(`#${elementId}`)
        .draggable({
            inertia: false,
            autoScroll: true,
            listeners: {
                move(event) {
                    // Рассчитываем шаг перемещения мыши с учетом масштаба холста
                    const dx = event.dx / state.zoom;
                    const dy = event.dy / state.zoom;

                    // Если перетаскиваемый объект входит в выделенную группу, двигаем всю пачку
                    if (state.selectedIds.includes(widgetObj.id) && state.selectedType === 'widget') {
                        state.selectedIds.forEach(id => {
                            const widget = state.widgets.find(w => w.id === id);
                            if (widget && !state.layerLocks[widget.id]) {
                                widget.x += dx;
                                widget.y += dy;
                                
                                const widgetEl = document.getElementById(`widget-${widget.id}`) || document.getElementById(widget.id);
                                if (widgetEl) {
                                    widgetEl.style.left = `${Math.round(widget.x)}px`;
                                    widgetEl.style.top = `${Math.round(widget.y)}px`;
                                }
                            }
                        });
                    } else {
                        // Если объект перемещается индивидуально
                        widgetObj.x += dx;
                        widgetObj.y += dy;
                        el.style.left = `${Math.round(widgetObj.x)}px`;
                    }
                    
                    // Обновление значений в полях инспектора свойств
                    const inputX = document.getElementById('prop-x');
                    const inputY = document.getElementById('prop-y');
                    if (inputX && state.selectedIds.includes(widgetObj.id)) inputX.value = Math.round(widgetObj.x);
                    if (inputY && state.selectedIds.includes(widgetObj.id)) inputY.value = Math.round(widgetObj.y);
                },
                end() {
                    saveHistoryState();
                    dispatchUpdate();
                }
            }
        })
       .resizable({
            // Разрешаем тянуть за сами границы элемента
            edges: { left: true, right: true, bottom: true, top: true },
            listeners: {
                move(event) {
                    // Рассчитываем дельту с учетом зума холста
                    const deltaW = event.deltaRect.width / state.zoom;
                    const deltaH = event.deltaRect.height / state.zoom;
                    const deltaX = event.deltaRect.left / state.zoom;
                    const deltaY = event.deltaRect.top / state.zoom;

                    // Обновляем размеры
                    widgetObj.w = Math.max(20, widgetObj.w + deltaW);
                    widgetObj.h = Math.max(20, widgetObj.h + deltaH);

                    // Сдвигаем координаты, если тянем за левый или верхний край
                    widgetObj.x += deltaX;
                    widgetObj.y += deltaY;

                    // Мгновенно перерисовываем стили
                    el.style.width = `${Math.round(widgetObj.w)}px`;
                    el.style.height = `${Math.round(widgetObj.h)}px`;
                    el.style.left = `${Math.round(widgetObj.x)}px`;
                    el.style.top = `${Math.round(widgetObj.y)}px`;
                    
                    // Синхронизируем инпут-поля в панели свойств
                    const inputW = document.getElementById('prop-w');
                    const inputH = document.getElementById('prop-h');
                    const inputX = document.getElementById('prop-x');
                    const inputY = document.getElementById('prop-y');
                    
                    if (state.selectedIds.includes(widgetObj.id)) {
                        if (inputW) inputW.value = Math.round(widgetObj.w);
                        if (inputH) inputH.value = Math.round(widgetObj.h);
                        if (inputX) inputX.value = Math.round(widgetObj.x);
                        if (inputY) inputY.value = Math.round(widgetObj.y);
                    }
                    
                    // Автоматический ресайз ECharts
                    const chartDom = el.querySelector('.chart-container');
                    if (chartDom) {
                        const chartInstance = window.echarts?.getInstanceByDom(chartDom);
                        if (chartInstance) chartInstance.resize();
                    }
                },
                end() {
                    saveHistoryState();
                    dispatchUpdate();
                }
            }
        });
}


// Cвободное групповое перетаскивание листов (макетов) по бесконечному холсту
export function bindSheetTransform(sheetId, sheetObj) {
    if (state.layerLocks[sheetObj.id]) return;

    const el = document.getElementById(sheetId);
    if (!el) return;

    if (el.dataset.interactInitialized === 'true') return;

    try { interact(`#${sheetId}`).unset(); } catch (e) {}
    el.dataset.interactInitialized = 'true';

    interact(`#${sheetId}`).draggable({
        inertia: false,
        autoScroll: true,
        listeners: {
            move(event) {
                const dx = event.dx / state.zoom;
                const dy = event.dy / state.zoom;

                // Сдвигаем группу листов вместе, если они выделены
                if (state.selectedIds.includes(sheetObj.id) && state.selectedType === 'sheet') {
                    state.selectedIds.forEach(id => {
                        const sheet = state.sheets.find(s => s.id === id);
                        if (sheet && !state.layerLocks[sheet.id]) {
                            sheet.x += dx;
                            sheet.y += dy;
                            const sheetEl = document.getElementById(sheet.id);
                            if (sheetEl) {
                                sheetEl.style.left = `${Math.round(sheet.x)}px`;
                                sheetEl.style.top = `${Math.round(sheet.y)}px`;
                            }
                        }
                    });
                } else {
                    sheetObj.x += dx;
                    sheetObj.y += dy;
                    el.style.left = `${Math.round(sheetObj.x)}px`;
                }

                const inputX = document.getElementById('prop-x');
                const inputY = document.getElementById('prop-y');
                if (inputX && state.selectedIds.includes(sheetObj.id)) inputX.value = Math.round(sheetObj.x);
                if (inputY && state.selectedIds.includes(sheetObj.id)) inputY.value = Math.round(sheetObj.y);
            },
            end() {
                saveHistoryState();
                dispatchUpdate();
            }
        }
    });
}


// Глобальные горячие клавиши (Shortcuts) + Менеджер порядка слоев
function initKeyboardShortcuts() {
    window.addEventListener('keydown', (e) => {
        if (['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName) || 
            document.activeElement.isContentEditable) {
            return;
        }

        // ЗАХВАТ SHIFT
        if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') {
            state.isShiftPressed = true;
        }
        if (e.code === 'Space') {
            state.isSpacePressed = true;
            if (viewportEl) viewportEl.style.cursor = 'grab';
            e.preventDefault();
        }
        if ((e.ctrlKey || e.metaKey) && e.code === 'KeyD') {
            e.preventDefault();
            duplicateSelectedNode();
        }
        if (e.code === 'Delete' || e.code === 'Backspace') {
            e.preventDefault();
            // Защита: удаляем выделенную пачку, если первый элемент не залочен
            const primaryId = state.selectedIds[0];
            if (primaryId && !state.layerLocks[primaryId]) {
                deleteSelectedNode();
            }
        }

        // Управление слоями "Выше / Ниже" через Ctrl + Стрелки
        if ((e.ctrlKey || e.metaKey) && e.code === 'ArrowUp') {
            e.preventDefault();
            moveSelectedWidgetLayer('up');
        }
        if ((e.ctrlKey || e.metaKey) && e.code === 'ArrowDown') {
            e.preventDefault();
            moveSelectedWidgetLayer('down');
        }
    });

    window.addEventListener('keyup', (e) => {
        if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') {
            state.isShiftPressed = false;
        }
        if (e.code === 'Space') {
            state.isSpacePressed = false;
            if (viewportEl) viewportEl.style.cursor = 'default';
        }
    });
}


// Слушатели правой панели инспектора свойств
export function initPropertiesPanelListeners() {
    const inputs = {
        x: document.getElementById('prop-x'),
        y: document.getElementById('prop-y'),
        w: document.getElementById('prop-w'),
        h: document.getElementById('prop-h'),
        radius: document.getElementById('prop-radius'),
        sides: document.getElementById('prop-polygon-sides'),
        rotation: document.getElementById('prop-rotation'),
        opacity: document.getElementById('prop-opacity'),
        fillType: document.getElementById('prop-fill-type'),
        bgColor: document.getElementById('prop-bg-color'),
        gradientColor2: document.getElementById('prop-gradient-color2'),
        strokeColor: document.getElementById('prop-stroke-color'),
        strokeWidth: document.getElementById('prop-stroke-width'),
        strokeType: document.getElementById('prop-stroke-type'),
        shadowEn: document.getElementById('prop-effect-shadow-en'),
        layerBlur: document.getElementById('prop-effect-blur')
    };

    Object.values(inputs).forEach(input => {
        if (!input) return;
        input.addEventListener('change', () => {
            saveHistoryState();
        });
    });

    if (inputs.x) inputs.x.addEventListener('input', (e) => updateSelectedProps({ x: parseInt(e.target.value) || 0 }));
    if (inputs.y) inputs.y.addEventListener('input', (e) => updateSelectedProps({ y: parseInt(e.target.value) || 0 }));
    if (inputs.w) inputs.w.addEventListener('input', (e) => updateSelectedProps({ w: parseInt(e.target.value) || 10 }));
    if (inputs.h) inputs.h.addEventListener('input', (e) => updateSelectedProps({ h: parseInt(e.target.value) || 10 }));
    if (inputs.radius) inputs.radius.addEventListener('input', (e) => updateSelectedProps({ border_radius: parseInt(e.target.value) || 0 }));
    if (inputs.sides) inputs.sides.addEventListener('input', (e) => updateSelectedProps({ polygon_sides: parseInt(e.target.value) || 3 }));

    if (inputs.rotation) {
        inputs.rotation.addEventListener('input', (e) => {
            const val = parseInt(e.target.value) || 0;
            const label = document.getElementById('rotate-val-label');
            if (label) label.innerText = `${val}°`;
            updateSelectedProps({ rotation: val });
        });
    }
    if (inputs.opacity) {
        inputs.opacity.addEventListener('input', (e) => {
            const val = parseInt(e.target.value) || 0;
            const label = document.getElementById('opacity-val-label');
            if (label) label.innerText = `${val}%`;
            updateSelectedProps({ opacity: val });
        });
    }

    if (inputs.fillType) {
        inputs.fillType.addEventListener('change', (e) => {
            const type = e.target.value;
            if (inputs.gradientColor2) {
                inputs.gradientColor2.style.display = type === 'solid' ? 'none' : 'block';
            }
            updateSelectedProps({ fill_type: type });
        });
    }
    if (inputs.bgColor) inputs.bgColor.addEventListener('input', (e) => updateSelectedProps({ bg_color: e.target.value }));
    if (inputs.gradientColor2) inputs.gradientColor2.addEventListener('input', (e) => updateSelectedProps({ gradient_color_2: e.target.value }));

    if (inputs.strokeColor) inputs.strokeColor.addEventListener('input', (e) => updateSelectedProps({ stroke_color: e.target.value }));
    if (inputs.strokeWidth) inputs.strokeWidth.addEventListener('input', (e) => updateSelectedProps({ stroke_width: parseInt(e.target.value) || 0 }));
    if (inputs.strokeType) inputs.strokeType.addEventListener('change', (e) => updateSelectedProps({ stroke_type: e.target.value }));

    if (inputs.shadowEn) {
        inputs.shadowEn.addEventListener('change', (e) => {
            const currentSelectedId = state.selectedIds[0];
            const target = state.widgets.find(w => w.id === currentSelectedId);
            if (target) {
                if (!target.effects) target.effects = {};
                target.effects.dropShadow = e.target.checked;
                dispatchUpdate();
            }
        });
    }
    if (inputs.layerBlur) {
        inputs.layerBlur.addEventListener('input', (e) => {
            const currentSelectedId = state.selectedIds[0];
            const target = state.widgets.find(w => w.id === currentSelectedId);
            if (target) {
                if (!target.effects) target.effects = {};
                target.effects.layerBlur = parseInt(e.target.value) || 0;
                dispatchUpdate();
            }
        });
    }

    const btnAlHor = document.getElementById('prop-al-dir-hor');
    const btnAlVer = document.getElementById('prop-al-dir-ver');
    const inputAlSpacing = document.getElementById('prop-al-spacing');
    const inputAlPadding = document.getElementById('prop-al-padding');

    if (btnAlHor) btnAlHor.addEventListener('click', () => modifyActiveAutoLayout(al => al.direction = 'horizontal'));
    if (btnAlVer) btnAlVer.addEventListener('click', () => modifyActiveAutoLayout(al => al.direction = 'vertical'));
    if (inputAlSpacing) {
        inputAlSpacing.addEventListener('input', (e) => {
            modifyActiveAutoLayout(al => al.spacing = parseInt(e.target.value) || 0);
        });
    }
    if (inputAlPadding) {
        inputAlPadding.addEventListener('input', (e) => {
            const val = parseInt(e.target.value) || 0;
            modifyActiveAutoLayout(al => {
                al.paddingTop = val; al.paddingBottom = val;
                al.paddingLeft = val; al.paddingRight = val;
            });
        });
    }
}

function modifyActiveAutoLayout(callback) {
    const currentSelectedId = state.selectedIds[0];
    const target = state.widgets.find(w => w.id === currentSelectedId);
    if (target && target.autoLayout) {
        callback(target.autoLayout);
        dispatchUpdate();
    }
}