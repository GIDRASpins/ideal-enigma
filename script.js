function showLogin() {
    const welcome = document.getElementById('welcome-screen');
    const login = document.getElementById('login-screen');

    // Плавне зникнення вітання
    welcome.style.opacity = '0';
    welcome.style.transform = 'scale(0.9)';
    
    setTimeout(() => {
        welcome.classList.add('hidden');
        login.classList.remove('hidden');
    }, 500);
}

// Обробка форми
document.getElementById('loginForm').addEventListener('submit', function(e) {
    e.preventDefault();
    const btn = this.querySelector('.main-btn');
    btn.innerText = 'Підключення...';
    btn.style.opacity = '0.7';
    
    setTimeout(() => {
        alert('Ви успішно авторизовані!');
        // Тут роутер зазвичай перенаправляє користувача далі
    }, 1500);
});