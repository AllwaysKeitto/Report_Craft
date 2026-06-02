//модуль main.js (Главный управляющий контроллер интерфейса)

import { 
    state, 
    SHEET_PRESETS, 
    subscribe, 
    setToolMode, 
    undo, 
    redo, 
    saveHistoryState,
    deleteSelectedNode,
    duplicateSelectedNode,
    createNewSheet,
    dispatchUpdate
} from './state.js';
import { renderEditor, updateTransform } from './render.js';
import { initCanvasControls, initPropertiesPanelListeners } from './interactions.js';
import './presenter.js'; // api.js импортировать не нужно, так как методы лежат в window.API

// Флаг защиты от дребезга контактов и бесконечной рекурсии рендеринга
let isRendering = false;

// Флаг отслеживания режима презентации
let isPresentationMode = false;

/**
 * 1. РЕАКТИВНАЯ ПОДПИСКА НА ИЗМЕНЕНИЯ СОСТОЯНИЯ
 * Синхронизирует интерфейс при вызове dispatchUpdate().
 */
subscribe((updatedState) => {
    if (isRendering) return;
    
    try {
        isRendering = true;
        
        // Перерисовываем холст, слои и обновляем инспектор свойств
        renderEditor();
        
        // Синхронизация слоев (список листов и элементов) 
        updateLayersTreeUI(updatedState);
        
        // Подсвечиваем активный режим инструмента в тулбаре
        updateToolbarUI(updatedState.toolMode);
    } catch (err) {
        console.error("Критическая ошибка во время циклического рендера холста:", err);
    } finally {
        isRendering = false;
    }
});


/**
 * 2. ИНИЦИАЛИЗАЦИЯ ПРИ ЗАГРУЗКЕ СТРАНИЦЫ
 * Aсинхронный импорт макета с сервера по ID из URL
 */
window.addEventListener('DOMContentLoaded', async () => {
    const viewport = document.getElementById('viewport');
    const blueprint = document.getElementById('canvas-blueprint');

    if (!viewport || !blueprint) {
        console.error("Ошибка инициализации: Не найдены базовые узлы вьюпорта холста.");
        return;
    }

    // Запускаем модуль интеракций (Zoom, Pan, Drag & Drop)
    initCanvasControls(viewport, blueprint);

    // Привязываем слушатели изменений полей ввода в правой панели свойств
    initPropertiesPanelListeners();

    // Навешиваем клики на статические кнопки верхнего тулбара
    bindToolbarButtons();

  
    // СИНХРОНИЗАЦИЯ: ЗАГРУЗКА МАКЕТА С СЕРВЕРА
    const urlParams = new URLSearchParams(window.location.search);
    const templateId = urlParams.get('id');

    if (templateId && window.API) {
        try {
            console.log(`[ReportCraft] Обнаружен ID макета: ${templateId}. Начинаем загрузку...`);
            
            // Стучимся к API
            const template = await window.API.getTemplate(templateId);
            
            if (template) {
                // 1. Подставляем метаданные в инпуты тулбара
                const titleInput = document.getElementById('template-title-input');
                const priceInput = document.getElementById('template-price-input');
                
                if (titleInput) titleInput.value = template.title || 'Без названия';
                if (priceInput) priceInput.value = template.price || 0.0;

                // 2. Распаковываем Figma-подобие в стейт
                if (template.layout_json) {
                    const canvasLayout = JSON.parse(template.layout_json);
                    
                    // Обновляем мутабельный глобальный объект state
                    state.widgets = canvasLayout.widgets || [];
                    state.sheets = canvasLayout.sheets || [];
                    
                    console.log("[ReportCraft] Данные успешно импортированы в стейт:", state);
                }
            }
        } catch (err) {
            console.error("[ReportCraft] Не удалось восстановить проект с бэкенда:", err);
            alert(`⚠️ Ошибка загрузки проекта: ${err.message}`);
        }
    }

    // Сохраняем стартовую точку в историю (для Undo/Redo)
    saveHistoryState();

    // Первичный рендер сетки и позиционирование холста
    renderEditor();
    updateTransform();
    
    // Первичный рендер дерева
    updateLayersTreeUI(state);
});

//Привязка событий к кнопкам управления в верхнем тулбаре
function bindToolbarButtons() {
    // Кнопки истории
    const btnUndo = document.getElementById('btn-undo');
    const btnRedo = document.getElementById('btn-redo');
    if (btnUndo) btnUndo.addEventListener('click', () => undo());
    if (btnRedo) btnRedo.addEventListener('click', () => redo());

    // Переключатели инструментов (Выбор / Перо)
    const toolSelect = document.getElementById('tool-select');
    const toolPen = document.getElementById('tool-pen');

    if (toolSelect) toolSelect.addEventListener('click', () => setToolMode('select'));
    if (toolPen) toolPen.addEventListener('click', () => setToolMode('pen'));

    // Удаление/дублирование элементов
    const btnDelete = document.getElementById('btn-delete-node');
    if (btnDelete) {
        btnDelete.addEventListener('click', () => deleteSelectedNode());
    }

    const btnDuplicate = document.getElementById('btn-duplicate');
    if (btnDuplicate) {
        btnDuplicate.addEventListener('click', () => duplicateSelectedNode());
    }

    // Добавление Листов
    const btnAddSheet = document.getElementById('btn-add-sheet');
    const sheetPreset = document.getElementById('sheet-preset-select');

    if (btnAddSheet && sheetPreset) {
        btnAddSheet.addEventListener('click', () => {
            const rawKey = sheetPreset.value || 'A4_PORTRAIT';
            const selectedKey = rawKey.toUpperCase().replace('-', '_'); 
            
            const presetConfig = SHEET_PRESETS[selectedKey];
            if (!presetConfig) {
                console.error(`Ошибка: Пресет ${selectedKey} не найден.`);
                return;
            }

            const nextX = 100 + (state.sheets.length * (presetConfig.w + 100));
            const nextY = 100;
            
            const newSheetId = createNewSheet(selectedKey, nextX, nextY);
            
            setTimeout(() => {
                const sheetDOM = document.getElementById(newSheetId);
                if (sheetDOM) sheetDOM.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }, 50);
        });
    }

    // ОБРАБОТЧИКИ СОХРАНЕНИЯ, ВЫХОДА И ПРЕЗЕНТАЦИИ
    // 1. Сохранение проекта
    const btnSave = document.getElementById('btn-save-template'); // Точный ID из HTML
    if (btnSave) {
        btnSave.addEventListener('click', async (e) => {
            e.preventDefault();
            
            // Собираем данные из инпутов тулбара
            const templateTitle = document.getElementById('template-title-input')?.value || 'Без названия';
            const templatePrice = parseFloat(document.getElementById('template-price-input')?.value) || 0.0;

            // Сериализуем состояние холста (листы и виджеты) в единую JSON-строку для layout_json
            const canvasLayout = {
                widgets: state.widgets || [],
                sheets: state.sheets || []
            };

            // СТРОГОЕ СООТВЕТСТВИЕ СХЕМЕ PYDANTIC (TemplateCreate / TemplateUpdate)
            const projectData = {
                title: templateTitle,
                description: `Шаблон создан в конструкторе ReportCraft PRO`,
                layout_json: JSON.stringify(canvasLayout), // Упаковываем в строку, как требует бэкенд
                price: templatePrice,
                is_public: false,
                parameters: [] // Пустой массив параметров для схемы TemplateCreate
            };

            // Визуальный отклик активации сохранения
            btnSave.disabled = true;
            const originalText = btnSave.innerHTML;
            btnSave.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Сохранение...`;

            try {
                // Резервное копирование сырых данных в локальное хранилище браузера
                localStorage.setItem('ide_saved_project', JSON.stringify(canvasLayout));
                
                let response;
                
                // Проверяем, редактируем ли мы существующий шаблон (?id=...)
                const urlParams = new URLSearchParams(window.location.search);
                const templateId = urlParams.get('id');

                if (templateId && window.API) {
                    // Для обновления (TemplateUpdate) параметры можно не слать, Pydantic съест объект выборочно
                    const updateData = {
                        title: projectData.title,
                        description: projectData.description,
                        layout_json: projectData.layout_json,
                        price: projectData.price,
                        is_public: projectData.is_public
                    };
                    response = await window.API.updateTemplate(templateId, updateData);
                } else if (window.API) {
                    // Создаем абсолютно новый шаблон (TemplateCreate)
                    response = await window.API.createTemplate(projectData);
                    
                    // Если бэкенд успешно создал запись и вернул ID, привязываем его к URL
                    if (response && response.id) {
                        window.history.replaceState(null, '', `?id=${response.id}`);
                    }
                } else {
                    throw new Error("Модуль API не инициализирован глобально.");
                }
                
                alert(`Макет «${projectData.title}» успешно сохранен на сервере FastAPI!`);
            } catch (err) {
                console.error("Критическая ошибка сохранения шаблона:", err);
                alert(`❌ Ошибка сохранения: ${err.message}`);
            } finally {
                // Возвращаем кнопку в исходное состояние
                btnSave.disabled = false;
                btnSave.innerHTML = originalText;
            }
        });
    }

    // 2. Безопасный выход в Личный Кабинет
    const btnExit = document.getElementById('btn-exit') || document.getElementById('exit-constructor');
    if (btnExit) {
        btnExit.addEventListener('click', (e) => {
            e.preventDefault(); 
            // Перенаправляем пользователя на главную страницу личного кабинета 
            window.location.href = '/pages/catalog.html'; 
        });
    }

    // 3. Переключатель режима презентации
    const btnPresent = document.getElementById('btn-presentation'); // Указали точный ID
    if (btnPresent) {
        btnPresent.addEventListener('click', (e) => {
            e.preventDefault();
            togglePresentationMode();
        });
    }
}


//Логика переключения режима интерактивной презентации

function togglePresentationMode() {
    isPresentationMode = !isPresentationMode;
    const body = document.body;
    const blueprint = document.getElementById('canvas-blueprint');
    
    if (isPresentationMode) {
        body.classList.add('presentation-active');
        
        // Полностью очищаем выделение элементов в стейте
        state.selectedIds = [];
        state.selectedType = null;
        
        // Принудительно отключаем interact.js на всех виджетах и листах
        if (window.interact) {
            window.interact('.canvas-widget').unset();
            window.interact('.canvas-sheet').unset();
        }

        // Удаляем классы interact-dragging/resizing, если они зависли
        blueprint?.querySelectorAll('.interact-dragging, .interact-resizing').forEach(el => {
            el.classList.remove('interact-dragging', 'interact-resizing');
        });
        
    } else {
        body.classList.remove('presentation-active');
        
        // Возвращаем управление (инициализируем заново)
        const viewport = document.getElementById('viewport');
        if (typeof initCanvasControls === 'function' && viewport && blueprint) {
            initCanvasControls(viewport, blueprint);
        }
    }
    
    // Перерисовываем редактор с учетом нового режима
    renderEditor();
}

// Глобальное отслеживание горячих клавиш для выхода из презентации
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && isPresentationMode) {
        togglePresentationMode();
    }
});


//Визуальное переключение активных классов на кнопках инструментов
function updateToolbarUI(activeMode) {
    const toolSelect = document.getElementById('tool-select');
    const toolPen = document.getElementById('tool-pen');

    if (!toolSelect || !toolPen) return;

    toolSelect.classList.toggle('active', activeMode === 'select');
    toolPen.classList.toggle('active', activeMode === 'pen');
}

//Синхронизация и генерация дерева макета 
function updateLayersTreeUI(currentState) {
    const treeContainer = document.getElementById('layers-tree-container');
    if (!treeContainer) return;

    treeContainer.innerHTML = ''; 

    if (!currentState.sheets || currentState.sheets.length === 0) {
        treeContainer.innerHTML = `<div style="font-size:11px; color:#94a3b8; padding: 8px 12px; font-style:italic;">Нет активных листов</div>`;
        return;
    }

    currentState.sheets.forEach((sheet, index) => {
        const item = document.createElement('div');
        const isSelected = currentState.selectedIds.includes(sheet.id) && currentState.selectedType === 'sheet'; 
        
        item.style.display = 'flex';
        item.style.alignItems = 'center';
        item.style.gap = '8px';
        item.style.padding = '6px 10px';
        item.style.fontSize = '12px';
        item.style.cursor = 'pointer';
        item.style.borderRadius = '4px';
        item.style.borderBottom = '1px solid #f1f5f9';
        item.style.transition = 'background 0.15s ease';
        
        if (isSelected) {
            item.style.background = '#e0f2fe';
            item.style.color = '#0369a1';
        } else {
            item.style.color = '#334155';
            item.style.background = 'none';
        }
        
        item.innerHTML = `
            <i class="fa-regular fa-file-lines" style="color: ${isSelected ? '#0b99ff' : '#94a3b8'}; font-size:13px;"></i>
            <span style="font-weight: ${isSelected ? '600' : '400'};">Лист ${index + 1}</span>
            <span style="color: #94a3b8; font-size: 10px; margin-left: auto; font-family: monospace;">${sheet.w}×${sheet.h}</span>
        `;

        if (!isSelected) {
            item.addEventListener('mouseenter', () => item.style.background = '#f1f5f9');
            item.addEventListener('mouseleave', () => item.style.background = 'none');
        }

        item.addEventListener('click', () => {
            const isMulti = currentState.isShiftPressed;

            if (isMulti) {
                if (currentState.selectedIds.includes(sheet.id)) {
                    currentState.selectedIds = currentState.selectedIds.filter(id => id !== sheet.id);
                } else {
                    if (currentState.selectedType !== 'sheet') currentState.selectedIds = [];
                    currentState.selectedIds.push(sheet.id);
                }
            } else {
                currentState.selectedIds = [sheet.id];
            }

            currentState.selectedType = 'sheet';
            dispatchUpdate();

            if (!isMulti) {
                const targetSheetDOM = document.getElementById(sheet.id);
                if (targetSheetDOM) {
                    targetSheetDOM.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }
            }
        });

        treeContainer.appendChild(item);
    });
}