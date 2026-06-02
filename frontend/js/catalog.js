document.addEventListener("DOMContentLoaded", async () => {
    // Проверяем профиль пользователя
    const currentUser = await window.Auth.checkGuard();
    if (!currentUser) return;

    const catalogGrid = document.getElementById("catalog-grid");
    if (!catalogGrid) return;

    // Адаптируем интерфейс самой страницы под роль
    adjustCatalogInterface(currentUser);

    // Инициализация загрузки и отрисовки данных
    await renderCatalog(catalogGrid, currentUser);
});


// Настройка элементов интерфейса страницы под Админа или Пользователя
function adjustCatalogInterface(user) {
    const isAdmin = user.role_id === 1;
    const adminNav = document.getElementById("admin-only-nav");
    const userNav = document.getElementById("user-my-reports-nav");
    const pageTitle = document.getElementById("catalog-page-title");
    const pageDesc = document.getElementById("catalog-page-desc");

    if (isAdmin) {
        if (adminNav) adminNav.style.display = "block"; // Показываем админу ссылку на constructor
        if (userNav) userNav.style.display = "none";    // Прячем от админа раздел "Мои отчеты"
        if (pageTitle) pageTitle.textContent = "Управление и публикация шаблонов";
        if (pageDesc) pageDesc.textContent = "Редактируйте макеты холста, публикуйте их на продажу в общий каталог или выдавайте приватные доступы.";
    } else {
        if (adminNav) adminNav.style.display = "none";
        if (userNav) userNav.style.display = "flex";
    }
}


// Отрисовка карточек
async function renderCatalog(container, user) {
    container.innerHTML = "<p class='loading'>Загрузка шаблонов...</p>";

    try {
        const isAdmin = user.role_id === 1;
        
        // Параллельно запрашиваем список шаблонов и список покупок
        const [templates, purchases] = await Promise.all([
            window.API.getTemplates(),
            window.API.getPurchases()
        ]);

        const purchasedIds = new Set(purchases.map(p => p.template_id));

        if (templates.length === 0) {
            container.innerHTML = "<p class='empty-state'>Нет доступных шаблонов.</p>";
            return;
        }

        container.innerHTML = ""; // Очищаем лоадер

        templates.forEach(template => {
            
            // 1. Приведение флага архивации к строгому Boolean
            const isArchived = !!template.is_archived && (
                template.is_archived === true || 
                template.is_archived === 1 || 
                String(template.is_archived).toLowerCase() === "true" || 
                String(template.is_archived) === "1"
            );

            const isPurchased = purchasedIds.has(template.id);
            const isFree = template.price === 0;

            // 2. ФИЛЬТР ВИДИМОСТИ
            if (isAdmin) {
                // Админа пропускаем без фильтрации 
            } else {
                // Если шаблон заархивирован:
                if (isArchived) {
                    // Показывать ТОЛЬКО если пользователь его купил. Если НЕ купил — скрываем карточку.
                    if (!isPurchased) {
                        return; 
                    }
                }
                
                // Если шаблон не заархивирован, но админ убрал его в черновики (is_public: False):
                if (!isArchived && !template.is_public && !isPurchased) {
                    return; // Некупленный черновик тоже скрываем от обычных пользователей
                }
            }

            // Создаем карточку
            const card = document.createElement("div");
            card.className = "template-card";
            card.setAttribute("data-id", template.id);

            // 1. Формируем HTML для ОБЫЧНОГО ПОЛЬЗОВАТЕЛЯ
            if (!isAdmin) {
                let actionBlockContent = "";
                
                if (isPurchased) {
                    actionBlockContent = `
                        <span class="status-purchased" style="color: #10b981; font-weight: 600; display: flex; align-items: center; gap: 6px; font-size: 14px; padding: 8px 0;">
                            <i class="fa-solid fa-circle-check"></i> Приобретено
                        </span>`;
                } else if (isFree) {
                    actionBlockContent = `<button class="btn btn-primary btn-buy" data-id="${template.id}" style="background: #0ea5e9;">Получить бесплатно</button>`;
                } else {
                    actionBlockContent = `<button class="btn btn-primary btn-buy" data-id="${template.id}">Приобрести шаблон</button>`;
                }

                card.innerHTML = `
                    <div class="card-header">
                        <h3 class="template-title">${escapeHtml(template.title)}</h3>
                        <p class="template-desc">${escapeHtml(template.description || "Без описания")}</p>
                    </div>
                    <div class="card-footer">
                        
                        <div class="price-tag">
                            ${isFree 
                                ? '<span class="badge-free">Бесплатно</span>' 
                                : `<span class="price-val" style="color: #0f172a !important;">${template.price} ₽</span>`
                            }
                        </div>
                        
                        <div class="action-block" style="display: flex; justify-content: flex-end;">
                            ${actionBlockContent}
                        </div>
                    </div>
                `;
            }
            // 2. Формируем HTML для АДМИНИСТРАТОРА
            else {
                card.innerHTML = `
                    <button class="btn-delete-template btn-admin-delete" data-id="${template.id}" title="Удалить этот шаблон навсегда" style="position: absolute; top: 12px; right: 12px; width: 28px; height: 28px; display: flex; align-items: center; justify-content: center; background: rgba(239, 68, 68, 0.1); color: #ef4444; border: 1px solid rgba(239, 68, 68, 0.2); border-radius: 6px; cursor: pointer; font-size: 13px; transition: all 0.2s ease; z-index: 10;">
                        <i class="fa-solid fa-trash-can"></i>
                    </button>

                    <div class="card-header">
                        <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 5px; padding-right: 32px;">
                            <h3 class="template-title" style="margin: 0;">${escapeHtml(template.title)}</h3>
                            <div style="display: flex; gap: 4px; align-items: center;">
                                ${isArchived 
                                    ? '<span style="font-size: 11px; background: rgba(239, 68, 68, 0.2); color: #ef4444; padding: 2px 6px; border-radius: 4px; font-weight: 600; white-space: nowrap;">В архиве</span>' 
                                    : template.is_public 
                                        ? '<span style="font-size: 11px; background: rgba(16, 185, 129, 0.2); color: #10b981; padding: 2px 6px; border-radius: 4px; font-weight: 600; white-space: nowrap;">Опубликован</span>' 
                                        : '<span style="font-size: 11px; background: rgba(245, 158, 11, 0.2); color: #f59e0b; padding: 2px 6px; border-radius: 4px; font-weight: 600; white-space: nowrap;">Черновик</span>'
                                }
                            </div>
                        </div>
                        <p class="template-desc">${escapeHtml(template.description || "Без описания")}</p>
                        
                        <div style="margin-top: 8px; font-size: 13px; color: #94a3b8; font-weight: 600;">
                            Стоимость для пользователя: <span style="color: #38bdf8;">${template.price === 0 ? 'Бесплатно' : template.price + ' ₽'}</span>
                        </div>
                    </div>
                    <div class="card-footer" style="display: flex; flex-direction: column; gap: 8px; border-top: 1px dashed #334155; padding-top: 12px; margin-top: auto;">
                        
                        <button class="btn btn-primary btn-use" data-id="${template.id}" style="width: 100%;">Открыть в редакторе</button>
                        
                        <button class="btn btn-admin-toggle" data-id="${template.id}" data-public="${template.is_public}" style="padding: 6px; font-size: 12px; background: ${template.is_public ? '#ef4444' : '#10b981'}; color: white; border: none; border-radius: 6px; cursor: pointer; font-weight: 600; width: 100%;" ${isArchived ? 'disabled style="background: #334155; cursor: not-allowed;"' : ''}>
                            ${template.is_public ? '❌ Скрыть из продажи' : 'Опубликовать на продажу'}
                        </button>
                        
                        <div style="display: flex; gap: 6px; width: 100%;">
                            <input type="email" class="admin-share-input" placeholder="Email пользователя" style="flex: 1; padding: 6px; font-size: 12px; background: #0f172a; border: 1px solid #334155; border-radius: 6px; color: #fff;" ${isArchived ? 'disabled' : ''}>
                            <button class="btn btn-admin-share" data-id="${template.id}" style="padding: 6px 10px; font-size: 12px; background: #0b99ff; color: white; border: none; border-radius: 6px; cursor: pointer; font-weight: 600; white-space: nowrap;" ${isArchived ? 'disabled style="background: #334155;"' : ''}>Дать доступ</button>
                        </div>
                    </div>
                `;
            }
            container.appendChild(card);
        });

        // Инициализация событий
        initCatalogEvents(container, user);

    } catch (error) {
        container.innerHTML = `<p class='error-state'>Ошибка загрузки данных: ${error.message}</p>`;
    }
}


// Обработчики кликов (Делегирование)
function initCatalogEvents(container, user) {
    if (container.dataset.eventsInitialized === "true") return;
    container.dataset.eventsInitialized = "true";

    container.addEventListener("click", async (e) => {
        const buyButton = e.target.closest(".btn-buy");
        const useButton = e.target.closest(".btn-use");
        const toggleButton = e.target.closest(".btn-admin-toggle");
        const shareButton = e.target.closest(".btn-admin-share");
        const deleteButton = e.target.closest(".btn-admin-delete");

        // 0. АДМИН: Удаление/Архивация шаблона
        if (deleteButton) {
            const templateId = parseInt(deleteButton.getAttribute("data-id"), 10);
            
            const confirmDelete = confirm("Вы уверены, что хотите убрать этот шаблон? Если у него есть покупатели, он заархивируется (скроется из магазина, но останется у владельцев). Если покупателей нет — удалится навсегда.");
            if (!confirmDelete) return;

            deleteButton.disabled = true;
            const originalContent = deleteButton.innerHTML;
            deleteButton.innerHTML = "<i class='fa-solid fa-spinner fa-spin'></i>";

            try {
                await window.API.deleteTemplate(templateId);

                const card = deleteButton.closest(".template-card");
                if (card) {
                    card.style.opacity = "0";
                    card.style.transform = "scale(0.95)";
                    card.style.transition = "all 0.2s ease";
                    setTimeout(async () => {
                        await renderCatalog(container, user); 
                    }, 200);
                } else {
                    await renderCatalog(container, user);
                }

            } catch (error) {
                alert(`Ошибка удаления: ${error.message}`);
                deleteButton.disabled = false;
                deleteButton.innerHTML = originalContent;
            }
            return;
        }

        // 1. ПОЛЬЗОВАТЕЛЬ: Покупка (Имитация платежного шлюза)
        if (buyButton) {
            const templateId = parseInt(buyButton.getAttribute("data-id"), 10);
            const modal = document.getElementById("payment-modal");
            
            document.getElementById("payment-form-body").style.display = "block";
            document.getElementById("payment-loading-body").style.display = "none";
            modal.style.display = "flex";

            const confirmBtn = document.getElementById("confirm-payment-btn");
            const newConfirmBtn = confirmBtn.cloneNode(true);
            confirmBtn.parentNode.replaceChild(newConfirmBtn, confirmBtn);

            newConfirmBtn.addEventListener("click", async () => {
                document.getElementById("payment-form-body").style.display = "none";
                document.getElementById("payment-loading-body").style.display = "block";

                await new Promise(resolve => setTimeout(resolve, 2000)); 

                try {
                    await window.API.buyTemplate(templateId);
                    modal.style.display = "none";
                    alert("Оплата прошла успешно! Шаблон добавлен в вашу библиотеку.");
                    await renderCatalog(container, user);
                } catch (error) {
                    alert(`Ошибка транзакции: ${error.message}`);
                    modal.style.display = "none";
                }
            });
            return;
        }

        // 2. ОБЩЕЕ: Клик по кнопке (Открыть в редакторе)
        if (useButton) {
            const templateId = useButton.getAttribute("data-id");
            if (user.role_id === 1) {
                window.location.href = `/pages/constructor.html?id=${templateId}`;
            } else {
                window.location.href = `/pages/constructor.html?id=${templateId}&mode=presentation`;
            }
            return;
        }

        // 3. АДМИН: Переключение публикации (is_public)
        if (toggleButton) {
            const templateId = parseInt(toggleButton.getAttribute("data-id"), 10);
            const isPublic = toggleButton.getAttribute("data-public") === "true";
            const endpoint = isPublic ? `/templates/${templateId}/unpublish` : `/templates/${templateId}/publish`;
            
            toggleButton.disabled = true;
            toggleButton.textContent = "Обновление...";

            try {
                const token = localStorage.getItem("access_token");
                const response = await fetch(`/api${endpoint}`, {
                    method: 'PATCH',
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'application/json'
                    }
                });

                if (!response.ok) throw new Error("Не удалось изменить статус публикации");

                alert("Статус шаблона в каталоге успешно изменен!");
                await renderCatalog(container, user);
            } catch (error) {
                alert(error.message);
                toggleButton.disabled = false;
                toggleButton.textContent = isPublic ? '❌ Скрыть из продажи' : 'Опубликовать на продажу';
            }
            return;
        }

        // 4. АДМИН: Выдача доступа по Email
        if (shareButton) {
            const templateId = parseInt(shareButton.getAttribute("data-id"), 10);
            const card = shareButton.closest(".template-card");
            const emailInput = card ? card.querySelector(".admin-share-input") : null;
            
            if (!emailInput || !emailInput.value.trim()) {
                alert("Введите Email пользователя для предоставления доступа");
                return;
            }

            const userEmail = emailInput.value.trim();
            shareButton.disabled = true;
            shareButton.textContent = "...";

            try {
                const token = localStorage.getItem("access_token");
                const response = await fetch(`/api/templates/${templateId}/grant-access?user_email=${encodeURIComponent(userEmail)}`, {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'application/json'
                    }
                });

                if (!response.ok) throw new Error("Пользователь не найден или доступ уже есть");

                alert(`Доступ к отчету успешно выдан для пользователя: ${userEmail}`);
                emailInput.value = "";
            } catch (error) {
                alert(error.message);
            } finally {
                shareButton.disabled = false;
                shareButton.textContent = "Дать доступ";
            }
        }
    });
}

function closePaymentModal() {
    document.getElementById("payment-modal").style.display = "none";
}

function escapeHtml(str) {
    if (!str) return "";
    return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}