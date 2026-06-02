import { state } from './state.js';
import { renderEditor } from './render.js';

let isPresentationRunning = false;
let autoTransitionTimer = null;
let currentSlideIndex = 0;
let slides = [];
let savedActiveSheetId = null;

// 1. ОПРЕДЕЛЕНИЕ РОЛИ И РЕЖИМА
const userRole = state?.user?.roleId || localStorage.getItem('user_role_id'); 
const isAdmin = userRole == '1' || userRole === 'admin'; 

const urlParams = new URLSearchParams(window.location.search);
const isPresentationParam = urlParams.get('mode') === 'presentation';

// Пользователь ВСЕГДА находится в режиме презентации (просмотра), админ — только если нажал кнопку
const isReadOnlyPresentation = !isAdmin || isPresentationParam;

export function startPresentation() {
  const allSlides = document.querySelectorAll('.canvas-sheet');
  if (allSlides.length === 0) {
    console.warn('[ReportCraft] Листы для презентации пока не отрендерились в DOM.');
    return;
  }
  
  if (isAdmin) {
    savedActiveSheetId = state.activeSheetId;
  }
  
  slides = Array.from(allSlides);
  currentSlideIndex = 0;
  
  document.body.classList.add('presentation-active');
  
  // Элементы интерфейса, которые нужно скрыть
  const elementsToHide = [
    'editor-left-sidebar', 'editor-right-sidebar', 
    'toolbar-meta-block', 'toolbar-history-block', 'toolbar-tools-block',
    'toolbar-separator-1', 'toolbar-separator-2', 'btn-duplicate', 
    'toggle-rulers-btn', 'zoom-footer-hints', 'zoom-footer-separator'
  ];

  elementsToHide.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.setProperty('display', 'none', 'important');
  });

  // Растягиваем холст на 100% ширины
  const mainContainer = document.getElementById('editor-main-container');
  if (mainContainer) {
    mainContainer.style.gridTemplateColumns = '1fr';
  }

  // Показываем первый слайд
  slides.forEach((slide, index) => {
    slide.style.display = index === 0 ? 'block' : 'none';
  });
  
  if (state && state.sheets && state.sheets[0]) {
    state.activeSheetId = state.sheets[0].id;
    state.selectedIds = [state.sheets[0].id];
    state.selectedType = 'sheet';
  }

  // Имитируем изменение размера окна, чтобы eCharts и CSS-контейнеры пересчитали свои пропорции под 100% ширины экрана
  setTimeout(() => {
    window.dispatchEvent(new Event('resize'));
    console.log('[ReportCraft] Изменение размеров экрана отправлено для eCharts виджетов.');
  }, 50);

  startAutoTransition();
  isPresentationRunning = true;
  console.log('[ReportCraft] Режим просмотра активирован. Роль:', isAdmin ? 'Admin' : 'User');
}

export function exitPresentation() {
  // Если это обычный пользователь (не админ), ему НЕЛЬЗЯ выходить в конструктор.
  // Его выбрасывает обратно в каталог отчетов.
  if (!isAdmin) {
    window.location.href = './catalog.html'; 
    return;
  }

  // Если это админ, который зашел по прямой ссылке просмотра — тоже отправляем в каталог
  if (isPresentationParam) {
    window.location.href = './catalog.html';
    return;
  }

  // ЛОГИКА ВЫХОДА ДЛЯ АДМИНА (возврат в редактор)
  if (autoTransitionTimer) {
    clearInterval(autoTransitionTimer);
    autoTransitionTimer = null;
  }
  
  document.body.classList.remove('presentation-active');
  
  // Возвращаем панели управления конструктора для админа
  const flexElements = ['editor-left-sidebar', 'toolbar-meta-block', 'toolbar-history-block', 'toolbar-tools-block'];
  const blockElements = ['editor-right-sidebar', 'toolbar-separator-1', 'toolbar-separator-2', 'btn-duplicate', 'toggle-rulers-btn'];
  const inlineElements = ['zoom-footer-hints', 'zoom-footer-separator'];

  flexElements.forEach(id => { const el = document.getElementById(id); if (el) el.style.display = 'flex'; });
  blockElements.forEach(id => { const el = document.getElementById(id); if (el) el.style.display = 'block'; });
  inlineElements.forEach(id => { const el = document.getElementById(id); if (el) el.style.display = 'inline'; });

  const mainContainer = document.getElementById('editor-main-container');
  if (mainContainer) {
    mainContainer.style.gridTemplateColumns = ''; 
  }
  
  if (savedActiveSheetId && state) {
    state.activeSheetId = savedActiveSheetId;
    state.selectedIds = [savedActiveSheetId];
    state.selectedType = 'sheet';
  }

  isPresentationRunning = false;

  const blueprint = document.getElementById('canvas-blueprint');
  if (blueprint) blueprint.innerHTML = '';
  
  if (typeof renderEditor === 'function') {
    renderEditor();
  }
}

function goToSlide(direction) {
  if (slides.length <= 1) return;

  let newIndex = direction === 'next' 
    ? (currentSlideIndex + 1) % slides.length 
    : (currentSlideIndex - 1 + slides.length) % slides.length;
  
  currentSlideIndex = newIndex;
  
  slides.forEach((slide, index) => {
    slide.style.display = index === newIndex ? 'block' : 'none';
  });
  
  if (state && state.sheets && state.sheets[newIndex]) {
    state.activeSheetId = state.sheets[newIndex].id;
    state.selectedIds = [state.sheets[newIndex].id];
    state.selectedType = 'sheet';
  }

  // Пересчитываем размеры графиков на новом активном слайде
  setTimeout(() => {
    window.dispatchEvent(new Event('resize'));
  }, 30);

  startAutoTransition();
}

function startAutoTransition() {
  if (autoTransitionTimer) clearInterval(autoTransitionTimer);
  autoTransitionTimer = setInterval(() => {
    if (isPresentationRunning) goToSlide('next');
  }, 5000);
}

// Обработка клавиш
document.addEventListener('keydown', (event) => {
  if (!isPresentationRunning) return;
  
  if (event.key === 'Escape') { 
    exitPresentation(); 
    return; 
  }
  
  if (event.code === 'Space' || event.code === 'ArrowRight' || event.code === 'ArrowLeft') {
    event.preventDefault();
    goToSlide((event.code === 'Space' || event.code === 'ArrowRight') ? 'next' : 'prev');
  }
});

// АВТОЗАПУСК: Безопасное ожидание рендеринга отчета с защитой от зависания

if (isReadOnlyPresentation) {
  let attempts = 0;
  const maxAttempts = 50; // Максимум 5 секунд ожидания (50 * 100мс)

  const checkAndStart = () => {
    const allSlides = document.querySelectorAll('.canvas-sheet');
    
    // Отладочный лог, чтобы видеть, идет ли процесс
    console.log(`[ReportCraft] Попытка запуска презентации #${attempts + 1}. Найдено слайдов в DOM:`, allSlides.length);

    if (allSlides.length > 0) {
      console.log('[ReportCraft] Листы успешно обнаружены. Запускаем режим просмотра...');
      startPresentation();
      
      // Стилизация кнопки просмотра для админа
      const btnPresentation = document.getElementById('btn-presentation');
      if (btnPresentation && isAdmin) {
        btnPresentation.innerHTML = `<i class="fa-solid fa-eye"></i> Режим просмотра`;
        btnPresentation.style.background = 'rgba(16, 185, 129, 0.15)';
        btnPresentation.style.color = '#10b981';
      }
    } else if (attempts < maxAttempts) {
      attempts++;
      setTimeout(checkAndStart, 100); // Пробуем снова через 100мс
    } else {
      // ЗАЩИТНЫЙ МЕХАНИЗМ: Если за 5 секунд листы не появились, возвращаем интерфейс, чтобы не было белого экрана
      console.error('[ReportCraft] Критическая ошибка: Движок не отрендерил листы .canvas-sheet за 5 секунд');
      console.log('[ReportCraft] Текущее состояние state.sheets:', state?.sheets);
      
      // Если это админ — аварийно возвращаем его в нормальный конструктор
      if (isAdmin) {
        console.warn('[ReportCraft] Аварийный откат: Возвращаем админа в редактор.');
        isPresentationRunning = true; // Фиктивно ставим true, чтобы exitPresentation сработал корректно
        exitPresentation();
      } else {
        // Обычного юзера отправляем назад в каталог, чтобы он не залипал на белом экране
        alert('Не удалось загрузить листы отчета. Возврат в каталог.');
        window.location.href = './catalog.html';
      }
    }
  };

  // Запускаем проверку, как только DOM готов
  if (document.readyState === 'loading') {
    window.addEventListener('DOMContentLoaded', checkAndStart);
  } else {
    checkAndStart();
  }
}

// Экспорт в глобальную область видимости
window.startPresentation = startPresentation;
window.exitPresentation = exitPresentation;