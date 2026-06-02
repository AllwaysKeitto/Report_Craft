//Модуль state.js глобального состояния (Управляет данными холста, историей Undo/Redo и реактивными событиями.)

// ПРЕСЕТЫ РАЗМЕРОВ ЛИСТОВ (Стандартные размеры)
export const SHEET_PRESETS = {
    A4_PORTRAIT:  { name: 'Лист A4 (Вертикальный)', w: 794, h: 1123 },
    A4_LANDSCAPE: { name: 'Лист A4 (Горизонтальный)', w: 1123, h: 794 },
    A3_PORTRAIT:  { name: 'Лист A3 (Вертикальный)', w: 1123, h: 1587 },
    A3_LANDSCAPE: { name: 'Лист A3 (Горизонтальный)', w: 1587, h: 1123 },
    LETTER:       { name: 'US Letter', w: 816, h: 1056 },
    WEB_1920:     { name: 'Web Desktop (1920x1080)', w: 1920, h: 1080 },
    WEB_1280:     { name: 'Web Laptop (1280x720)', w: 1280, h: 720 },
    MOBILE_IPHONE:{ name: 'Mobile (iPhone 14/15)', w: 393, h: 852 }
};

// Глобальное реактивное состояние редактора
export const state = {
    // Навигация по холсту
    zoom: 1.0,
    panX: 60,
    panY: 60,
    isSpacePressed: false,
    isPanning: false,
    startX: 0,
    startY: 0,

    // Режимы инструментов (select, pen, pencil, text, frame, section, shape_rect, etc.)
    toolMode: 'select', 

    // Структура документов и слоев
    sheets: [
        { id: 'sheet_1', name: 'Лист 1 (A4)', x: 100, y: 100, w: 794, h: 1123, rotation: 0, opacity: 100 }
    ],
    widgets: [], // Сюда входят фреймы, фигуры, текстовые блоки, графики и таблицы
    
    // Фокус и выделение
    selectedIds: [], 
    selectedType: null, 
    activeSheetId: 'sheet_1',
    isShiftPressed: false,

    // Векторная сеть пера
    penPoints: [], 
    activeVectorPath: null,

    // Стили по умолчанию для новых элементов (Styles)
    defaultStyles: {
        fill: '#0b99ff',
        stroke: '#000000',
        strokeWidth: 0,
        strokeType: 'solid',
        borderRadius: 4,
        opacity: 100,
        fontFamily: 'Inter, sans-serif',
        fontSize: 13,
        fontColor: '#1a202c',
        isBold: false,
        isItalic: false,
        effects: { 
            dropShadow: false, 
            shadowX: 0, shadowY: 4, shadowBlur: 10, shadowColor: 'rgba(0,0,0,0.1)',
            layerBlur: 0 
        }
    },

    // Менеджер видимости и блокировки слоев
    layerVisibility: {},
    layerLocks: {},

    // Архитектура машины времени
    undoStack: [],
    redoStack: []
};

// СИСТЕМА УВЕДОМЛЕНИЙ (ПАТТЕРН НАБЛЮДАТЕЛЬ) 
const listeners = new Set();

export function subscribe(listener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
}

export function dispatchUpdate() {
    // 1. Сначала уведомляем всех стандартных подписчиков (например, renderEditor)
    listeners.forEach(listener => listener(state));
    
    // 2. Архитектурное исправление: Принудительно и независимо обновляем дерево слоев,
    // так как стейт изменился (добавился виджет, изменилось выделение или порядок z-index)
    if (typeof window.renderLayersTree === 'function') {
        window.renderLayersTree();
    } else if (typeof renderLayersTree === 'function') {
        // На случай, если функция импортирована напрямую в этот модуль или глобально
        renderLayersTree();
    }
}

// УПРАВЛЕНИЕ ИНСТРУМЕНТАМИ 
export function setToolMode(mode) {
    state.toolMode = mode;
    if (mode !== 'pen' && state.penPoints.length > 0) {
        state.penPoints = [];
    }
    dispatchUpdate();
}

export function selectNode(id, type, isMultiSelect = false) {
    if (isMultiSelect) {
        // Если тип выделения изменился (например, выделили лист после виджетов), сбрасываем массив
        if (state.selectedType !== type) {
            state.selectedIds = [];
        }
        
        // Если элемент уже выделен — убираем его из выделения (инверсия)
        if (state.selectedIds.includes(id)) {
            state.selectedIds = state.selectedIds.filter(itemId => itemId !== id);
        } else {
            state.selectedIds.push(id);
        }
    } else {
        // Обычный клик без Shift — выделяем только один элемент
        state.selectedIds = id ? [id] : [];
    }
    
    // Если после инверсии массив пуст, сбрасываем тип выделения
    state.selectedType = state.selectedIds.length > 0 ? type : null;
    dispatchUpdate();
}

// СТЭК МАШИНЫ ВРЕМЕНИ (UNDO / REDO) 

function generateUniqueId(prefix = '') {
    const randomPart = Math.random().toString(36).substring(2, 9);
    return `${prefix}${Date.now()}_${randomPart}`;
}

// БЕЗОПАСНЫЙ СЕРИАЛИЗАТОР, защищающий от циклических ссылок
function safeStringify(obj) {
    const cache = new Set();
    return JSON.stringify(obj, (key, value) => {
        if (typeof value === 'object' && value !== null) {
            if (cache.has(value)) return; // Игнорируем зацикленные свойства
            cache.add(value);
        }
        return value;
    });
}

export function saveHistoryState() {
    try {
        const dump = safeStringify({
            sheets: state.sheets,
            widgets: state.widgets,
            selectedIds: state.selectedIds, // сохраняем массив, а не одну-переменную
            selectedType: state.selectedType,
            layerVisibility: state.layerVisibility,
            layerLocks: state.layerLocks
        });

        if (state.undoStack.length === 0 || state.undoStack[state.undoStack.length - 1] !== dump) {
            state.undoStack.push(dump);
            if (state.undoStack.length > 50) state.undoStack.shift(); 
            state.redoStack = []; 
        }
    } catch (e) {
        console.error("Ошибка сохранения истории:", e);
    }
}

export function undo() {
    if (state.undoStack.length <= 1) return state; 
    
    state.redoStack.push(state.undoStack.pop());
    const snapshot = JSON.parse(state.undoStack[state.undoStack.length - 1]);
    
    applySnapshot(snapshot);
    dispatchUpdate();
    return state;
}

export function redo() {
    if (state.redoStack.length === 0) return state;
    
    const nextStr = state.redoStack.pop();
    state.undoStack.push(nextStr);
    
    applySnapshot(JSON.parse(nextStr));
    dispatchUpdate();
    return state;
}

function applySnapshot(snap) {
    state.sheets = snap.sheets;
    state.widgets = snap.widgets;
    state.selectedIds = snap.selectedIds || []; // Восстанавливаем массив
    state.selectedType = snap.selectedType;
    state.layerVisibility = snap.layerVisibility || {};
    state.layerLocks = snap.layerLocks || {};
}

// МУТАЦИИ ГЕОМЕТРИИ И СТИЛЕЙ СЛОЕВ 
export function updateSelectedProps(props) {
    if (state.selectedIds.length === 0) return;

    // Групповое изменение свойств для ВСЕХ выделенных нод одновременно
    state.selectedIds.forEach(id => {
        const target = state.selectedType === 'widget' 
            ? state.widgets.find(w => w.id === id)
            : state.sheets.find(s => s.id === id);

        if (target && !state.layerLocks[target.id]) {
            Object.assign(target, props);
        }
    });

    dispatchUpdate();
}

// УПРАВЛЕНИЕ ПОРЯДКОМ СЛОЕВ (ПЕРЕМЕЩЕНИЕ ВЫШЕ/НИЖЕ)
export function moveSelectedWidgetLayer(direction) {
    // Для изменения Z-Index порядок важен, берем первый попавшийся из пачки или перебираем
    if (state.selectedIds.length === 0 || state.selectedType !== 'widget') return;
    
    // Сортируем индексы выделенных элементов, чтобы при движении вверх/вниз они не перетирали друг друга
    const selectedIndices = state.selectedIds
        .map(id => state.widgets.findIndex(w => w.id === id))
        .filter(idx => idx !== -1)
        .sort((a, b) => direction === 'up' ? b - a : a - b);

    selectedIndices.forEach(currentIndex => {
        if (direction === 'up' && currentIndex < state.widgets.length - 1) {
            const temp = state.widgets[currentIndex];
            state.widgets[currentIndex] = state.widgets[currentIndex + 1];
            state.widgets[currentIndex + 1] = temp;
        } else if (direction === 'down' && currentIndex > 0) {
            const temp = state.widgets[currentIndex];
            state.widgets[currentIndex] = state.widgets[currentIndex - 1];
            state.widgets[currentIndex - 1] = temp;
        }
    });

    saveHistoryState();
    dispatchUpdate();
}

// ДИНАМИЧЕСКОЕ СОЗДАНИЕ НОВЫХ ФОРМАТОВ ЛИСТОВ
export function createNewSheet(presetKey, x = 150, y = 150) {
    const preset = SHEET_PRESETS[presetKey] || SHEET_PRESETS.A4_PORTRAIT;
    const id = generateUniqueId('sheet_');
    
    const newSheet = {
        id,
        name: `${preset.name} ${state.sheets.length + 1}`,
        x: Math.round(x),
        y: Math.round(y),
        w: preset.w,
        h: preset.h,
        rotation: 0,
        opacity: 100
    };

    state.sheets.push(newSheet);
    state.selectedIds = [id]; // Запись в массив
    state.selectedType = 'sheet';
    state.activeSheetId = id;

    saveHistoryState();
    dispatchUpdate();
    return id;
}

export function createNewWidget(type, localX, localY) {
    const id = generateUniqueId('widget');
    const initialEffects = JSON.parse(JSON.stringify(state.defaultStyles.effects));

    const newWidget = {
        id,
        sheetId: state.activeSheetId,
        parentId: null, 
        type,
        name: getWidgetDefaultName(type),
        x: Math.round(localX),
        y: Math.round(localY),
        w: getWidgetDefaultSize(type).w,
        h: getWidgetDefaultSize(type).h,
        rotation: 0,
        opacity: state.defaultStyles.opacity,

        // СТИЛИЗАЦИЯ И ОФОРМЛЕНИЕ
        bg_color: type.startsWith('shape') || type === 'frame' || type === 'section' ? state.defaultStyles.fill : '#ffffff',
        fill_type: 'solid', 
        gradient_color_2: '#38a169', 
        
        stroke_color: state.defaultStyles.stroke,
        stroke_width: type.startsWith('shape') ? 1 : 0, 
        stroke_type: 'solid', 
        stroke_position: 'inside', 
        
        border_radius: type === 'shape_circle' ? 9999 : state.defaultStyles.borderRadius,
        corner_smoothing: false, 
        
        effects: initialEffects,
        blend_mode: 'normal', 

        // ОГРАНИЧЕНИЯ И AUTO LAYOUT
        constraints: { horizontal: 'left', vertical: 'top' }, 
        autoLayout: {
            enabled: type === 'frame', 
            direction: 'horizontal', 
            spacing: 8,
            paddingTop: 10, paddingBottom: 10, paddingLeft: 10, paddingRight: 10,
            alignment: 'start' 
        },
        childrenIds: [], 

        // ТЕКСТОВЫЕ ПАРАМЕТРЫ
        text_content: type === 'text_block' ? 'Двойной клик для ввода текста...' : 'Контент',
        kpi_value: '0.00 ₽',
        font_size: state.defaultStyles.fontSize,
        font_family: state.defaultStyles.fontFamily,
        font_color: state.defaultStyles.fontColor,
        isBold: state.defaultStyles.isBold,
        isItalic: state.defaultStyles.isItalic,
        line_height: 1.2,
        letter_spacing: 0,
        text_resizing: 'auto-height', 

        // Данные графиков и таблиц
        chart_points: [{ label: 'Q1', val: 20 }, { label: 'Q2', val: 50 }, { label: 'Q3', val: 40 }, { label: 'Q4', val: 80 }],
        table_rows: [['Параметр', 'Значение'], ['Данные 1', '100 ₽'], ['Данные 2', '200 ₽']],
        polygon_sides: type === 'shape_polygon' ? 5 : (type === 'shape_star' ? 5 : 3)
    };

    state.widgets.push(newWidget);
    state.selectedIds = [id]; // Запись в массив
    state.selectedType = 'widget';
    
    saveHistoryState();
    dispatchUpdate();
    return id;
}

function getWidgetDefaultName(type) {
    const names = {
        shape_rect: 'Прямоугольник', shape_circle: 'Эллипс', shape_triangle: 'Треугольник',
        shape_polygon: 'Полигон', shape_star: 'Звезда', frame: 'Фрейм', section: 'Секция',
        text_block: 'Текст', kpi_card: 'KPI Карточка', table_element: 'Таблица',
        chart_pie: 'Круговая диаграмма', chart_bar: 'Гистограмма', chart_line: 'Линейный график'
    };
    return names[type] || 'Элемент';
}

function getWidgetDefaultSize(type) {
    if (type === 'frame') return { w: 300, h: 200 };
    if (type === 'section') return { w: 450, h: 320 };
    if (type === 'text_block') return { w: 200, h: 40 };
    if (type === 'table_element') return { w: 380, h: 140 };
    if (type.startsWith('chart_')) return { w: 300, h: 200 };
    return { w: 100, h: 100 }; 
}

// УДАЛЕНИЕ И ДУБЛИРОВАНИЕ СЛОЕВ
export function deleteSelectedNode() {
    if (state.selectedIds.length === 0) return;

    if (state.selectedType === 'widget') {
        // Удаляем из стейта ВСЕ выделенные виджеты разом
        state.widgets = state.widgets.filter(w => !state.selectedIds.includes(w.id));
        state.selectedIds = [];
        state.selectedType = null;
    } else if (state.selectedType === 'sheet') {
        // Массовое удаление листов с проверкой, чтобы не удалить вообще всё
        const initialCount = state.sheets.length;
        state.sheets = state.sheets.filter(s => !state.selectedIds.includes(s.id));
        
        // Если попытались удалить все листы, оставляем хотя бы один
        if (state.sheets.length === 0 && initialCount > 0) {
            // Отменяем удаление последнего оставшегося листа
            return; 
        }

        // Чистим виджеты, принадлежавшие удаленным листам
        state.widgets = state.widgets.filter(w => !state.selectedIds.includes(w.sheetId));
        
        // Переводим фокус на первый оставшийся лист
        if (state.sheets.length > 0) {
            state.selectedIds = [state.sheets[0].id];
            state.selectedType = 'sheet';
            state.activeSheetId = state.sheets[0].id;
        } else {
            state.selectedIds = [];
            state.selectedType = null;
        }
    }

    saveHistoryState();
    dispatchUpdate();
}

export function duplicateSelectedNode() {
    if (state.selectedIds.length === 0 || state.selectedType !== 'widget') return;
    
    const duplicatedIds = [];

    // Итерируемся по массиву и дублируем целую пачку виджетов
    state.selectedIds.forEach(id => {
        const origin = state.widgets.find(w => w.id === id);
        if (!origin || state.layerLocks[origin.id]) return;

        const clone = JSON.parse(safeStringify(origin));
        clone.id = generateUniqueId('widget');
        clone.x += 30; 
        clone.y += 30;

        state.widgets.push(clone);
        duplicatedIds.push(clone.id);
    });

    // После дублирования автоматически переносим выделение на новые клонированные элементы
    if (duplicatedIds.length > 0) {
        state.selectedIds = duplicatedIds;
    }

    saveHistoryState();
    dispatchUpdate();
}