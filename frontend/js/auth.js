// Инициализация глобального интерфейса
window.Auth = {
    checkGuard: checkAuthGuard,
    logout: logoutUser
};

document.addEventListener("DOMContentLoaded", () => {
    const loginForm = document.getElementById("login-form");
    const registerForm = document.getElementById("register-form");

    // ЛОГИКА АВТОРИЗАЦИИ
    if (loginForm) {
        loginForm.addEventListener("submit", async (e) => {
            e.preventDefault();
            
            const submitBtn = loginForm.querySelector('button[type="submit"]');
            const usernameInput = document.getElementById("username").value.trim();
            const passwordInput = document.getElementById("password").value;
            const errorBlock = document.getElementById("auth-error");

            if (errorBlock) errorBlock.style.display = "none";
            
            if (submitBtn) {
                submitBtn.disabled = true;
                submitBtn.dataset.originalText = submitBtn.innerHTML;
                submitBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Вход...';
            }

            try {
                // Вызываем сетевой модуль из api.js
                const data = await window.API.login(usernameInput, passwordInput);
                
                // Сохраняем токен в localStorage
                localStorage.setItem("access_token", data.access_token);
                
                // Запрашиваем роль пользователя
                const userProfile = await window.API.getProfile();
                
                // Кэширование роли на клиенте
                localStorage.setItem("user_role_id", userProfile.role_id);
                
                // Роутинг после успешного ввода пароля
                if (userProfile.role_id === 1) {
                    // Администратор уходит в конструктор/каталог управления
                    window.location.href = "/pages/catalog.html";
                } else {
                    // Обычный пользователь попадает ИСКЛЮЧИТЕЛЬНО в свой личный кабинет
                    window.location.href = "/pages/user.html";
                }
            } catch (error) {
                if (errorBlock) {
                    errorBlock.textContent = error.message || "Неверное имя пользователя или пароль";
                    errorBlock.style.display = "block";
                }
                if (submitBtn) {
                    submitBtn.disabled = false;
                    submitBtn.innerHTML = submitBtn.dataset.originalText;
                }
            }
        });
    }

    // ЛОГИКА РЕГИСТРАЦИИ
    if (registerForm) {
        registerForm.addEventListener("submit", async (e) => {
            e.preventDefault();

            const submitBtn = registerForm.querySelector('button[type="submit"]');
            const username = document.getElementById("reg-username").value.trim();
            const email = document.getElementById("reg-email").value.trim();
            const password = document.getElementById("reg-password").value;
            const roleSelect = document.getElementById("reg-role");
            
            const roleId = roleSelect ? parseInt(roleSelect.value, 10) : 2; 
            
            const errorBlock = document.getElementById("reg-error");
            const successBlock = document.getElementById("reg-success");

            if (errorBlock) errorBlock.style.display = "none";
            if (successBlock) successBlock.style.display = "none";

            if (submitBtn) {
                submitBtn.disabled = true;
                submitBtn.dataset.originalText = submitBtn.innerHTML;
                submitBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Регистрация...';
            }

            try {
                await window.API.register(username, email, password, roleId);
                
                if (successBlock) {
                    successBlock.textContent = "Регистрация успешна! Перенаправление на вход...";
                    successBlock.style.display = "block";
                    
                    setTimeout(() => {
                        window.location.href = "/pages/login.html";
                    }, 2000);
                }
            } catch (error) {
                if (errorBlock) {
                    errorBlock.textContent = error.message || "Ошибка регистрации. Проверьте данные.";
                    errorBlock.style.display = "block";
                }
                if (submitBtn) {
                    submitBtn.disabled = false;
                    submitBtn.innerHTML = submitBtn.dataset.originalText;
                }
            }
        });
    }
});

//Глобальная функция проверки авторизации (вызывается на защищенных страницах)
async function checkAuthGuard() {
    const token = localStorage.getItem("access_token");
    if (!token) {
        window.location.href = "/pages/login.html";
        return null;
    }

    try {
        // Запрашиваем актуальный профиль
        const user = await window.API.getProfile();
        localStorage.setItem("user_role_id", user.role_id);

        // Защита страниц от несанкционированного доступа ролей.
        // Если обычный юзер пытается вручную открыть конструктор, кидаем его обратно в кабинет
        const currentPath = window.location.pathname;
        if (user.role_id !== 1 && (currentPath.includes("constructor.html"))) {
            window.location.href = "/pages/user.html";
            return null;
        }

        return user;
    } catch (err) {
        // Если сессия протухла — чистим хранилище
        localStorage.removeItem("access_token");
        localStorage.removeItem("user_role_id");
        window.location.href = "/pages/login.html";
        return null;
    }
}


//Глобальная функция для выхода из системы
function logoutUser() {
    localStorage.removeItem("access_token");
    localStorage.removeItem("user_role_id");
    window.location.href = "/pages/login.html";
}