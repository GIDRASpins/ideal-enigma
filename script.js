// Глобальний стан додатку
let currentUser = null;
let selectedTariffData = { type: '', name: '', price: 0, duration: 0 };
let currentRouterId = 'default';

// Окремий баланс і таймер для Базового
let basicBalance = 0;
let basicTimeLeft = 0;
let basicTimer = null;

// Окремий баланс і таймер для Ультра
let ultraBalance = 0;
let ultraTimeLeft = 0;
let ultraTimer = null;

/**
 * Ініціалізація:
 * 1. Збереження параметрів авторизації Captive Portal (NoDogSplash / openNDS тощо)
 * 2. Завантаження тарифів
 * 3. Перевірка збереженої сесії
 */
window.addEventListener('DOMContentLoaded', () => {
    const params = new URLSearchParams(window.location.search);
    if (params.has('login_url')) localStorage.setItem('saved_login_url', params.get('login_url'));
    if (params.has('tok')) localStorage.setItem('saved_tok', params.get('tok'));
    if (params.has('redir')) localStorage.setItem('saved_redir', params.get('redir'));
    if (params.has('authaction')) localStorage.setItem('saved_authaction', params.get('authaction'));

    loadDynamicTariffs();
    checkSavedUserSession();
});

function checkSavedUserSession() {
    const savedUserJson = localStorage.getItem('wifi_user');
    if (savedUserJson) {
        try {
            const user = JSON.parse(savedUserJson);
            applyUserSession(user);
            // Пропускаємо екран входу одразу на тарифи
            document.getElementById('welcome-screen').classList.add('hidden');
            document.getElementById('tariff-screen').classList.remove('hidden');
        } catch (e) {
            localStorage.removeItem('wifi_user');
        }
    }
}

function applyUserSession(user) {
    currentUser = user;
    document.getElementById('current-username-display').innerText = user.username;

    basicBalance = parseFloat(user.basic_balance || 0);
    ultraBalance = parseFloat(user.ultra_balance || 0);
    basicTimeLeft = parseInt(user.basic_time_left || 0, 10);
    ultraTimeLeft = parseInt(user.ultra_time_left || 0, 10);

    document.getElementById('basic-balance').innerText = `${basicBalance}.00 ₴`;
    document.getElementById('ultra-balance').innerText = `${ultraBalance}.00 ₴`;

    if (basicTimeLeft > 0) startBasicTimer();
    if (ultraTimeLeft > 0) startUltraTimer();
}

/**
 * Вхід користувача (збереження в БД та LocalStorage)
 */
document.getElementById('loginForm').addEventListener('submit', async function(e) {
    e.preventDefault();
    const btn = document.getElementById('loginSubmitBtn');
    const username = document.getElementById('loginUsername').value.trim();
    const accessCode = document.getElementById('loginPassword').value.trim();

    btn.innerText = 'Вхід...';
    btn.disabled = true;

    try {
        const response = await fetch('/api/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, accessCode })
        });

        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Помилка авторизації');

        // Зберігаємо в LocalStorage
        localStorage.setItem('wifi_user', JSON.stringify(data.user));
        applyUserSession(data.user);

        showScreen('login-screen', 'tariff-screen');
    } catch (err) {
        alert(err.message);
    } finally {
        btn.disabled = false;
        btn.innerText = 'Увійти в мережу';
    }
});

/**
 * Вихід з акаунта
 */
function logoutUser() {
    if (!confirm('Ви дійсно бажаєте вийти з акаунта?')) return;

    // Зупиняємо таймери
    if (basicTimer) clearInterval(basicTimer);
    if (ultraTimer) clearInterval(ultraTimer);

    // Очищаємо LocalStorage та стан
    localStorage.removeItem('wifi_user');
    currentUser = null;
    basicBalance = 0;
    ultraBalance = 0;
    basicTimeLeft = 0;
    ultraTimeLeft = 0;

    document.getElementById('loginForm').reset();
    document.getElementById('timer-badge-basic').classList.add('hidden-timer');
    document.getElementById('timer-badge-ultra').classList.add('hidden-timer');

    showScreen('tariff-screen', 'welcome-screen');
}

/**
 * Синхронізація поточного балансу та часу з БД і LocalStorage
 */
async function syncUserData() {
    if (!currentUser) return;

    currentUser.basic_balance = basicBalance;
    currentUser.ultra_balance = ultraBalance;
    currentUser.basic_time_left = basicTimeLeft;
    currentUser.ultra_time_left = ultraTimeLeft;

    localStorage.setItem('wifi_user', JSON.stringify(currentUser));

    try {
        await fetch('/api/user/sync', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                username: currentUser.username,
                basic_balance: basicBalance,
                ultra_balance: ultraBalance,
                basic_time_left: basicTimeLeft,
                ultra_time_left: ultraTimeLeft
            })
        });
    } catch (e) {
        console.warn('Синхронізація з БД не вдалася (офлайн режим):', e);
    }
}

/**
 * Отримання router_id з URL
 */
function getRouterIdFromURL() {
    const params = new URLSearchParams(window.location.search);
    return params.get('router_id') || params.get('mac') || params.get('nasid') || 'default';
}

/**
 * Завантаження тарифів
 */
async function loadDynamicTariffs() {
    currentRouterId = getRouterIdFromURL();
    try {
        const response = await fetch(`/api/tariffs?router_id=${encodeURIComponent(currentRouterId)}`);
        const data = await response.json();
        renderTariffs(data.tariffs);
    } catch (err) {
        renderTariffs(getDefaultTariffsFallback());
    }
}

function renderTariffs(tariffs) {
    const basicList = document.getElementById('basic-tariffs-list');
    const basicMore = document.getElementById('more-tariffs-basic');
    const ultraList = document.getElementById('ultra-tariffs-list');
    const ultraMore = document.getElementById('more-tariffs-ultra');

    basicList.innerHTML = '';
    basicMore.innerHTML = '';
    ultraList.innerHTML = '';
    ultraMore.innerHTML = '';

    tariffs.forEach(t => {
        const btn = document.createElement('button');
        btn.className = `tariff-btn ${t.type === 'ultra' ? 'ultra-btn' : ''} ${t.desc ? 'has-tooltip' : ''}`;
        btn.onclick = () => selectTariff(t.type, t.name, t.price, t.duration);
        
        btn.innerHTML = `
            <span class="time">${t.timeLabel}</span>
            <span class="price">${t.price} ₴</span>
            ${t.desc ? `<span class="tooltip">${t.desc}</span>` : ''}
        `;

        if (t.type === 'basic') {
            if (t.isMore) basicMore.appendChild(btn);
            else basicList.appendChild(btn);
        } else {
            if (t.isMore) ultraMore.appendChild(btn);
            else ultraList.appendChild(btn);
        }
    });
}

function getDefaultTariffsFallback() {
    return [
        { id: 'basic_1h', type: 'basic', name: 'Базовий 1 год', duration: 3600, price: 10, timeLabel: '1 година', desc: 'Достатньо для соцмереж та веб-серфінгу.', isMore: false },
        { id: 'basic_12h', type: 'basic', name: 'Базовий 12 год', duration: 43200, price: 50, timeLabel: '12 годин', desc: 'Економний вибір на весь день.', isMore: false },
        { id: 'basic_1d', type: 'basic', name: 'Базовий 1 день', duration: 86400, price: 80, timeLabel: '1 день', desc: '', isMore: true },
        { id: 'basic_7d', type: 'basic', name: 'Базовий 7 днів', duration: 604800, price: 250, timeLabel: '7 днів', desc: '', isMore: true },
        { id: 'ultra_1h', type: 'ultra', name: 'Ультра 1 год', duration: 3600, price: 15, timeLabel: '1 година', desc: 'Максимальна швидкість + високий пріоритет.', isMore: false },
        { id: 'ultra_12h', type: 'ultra', name: 'Ультра 12 год', duration: 43200, price: 75, timeLabel: '12 годин', desc: 'Гігабітний канал, 4K відео без затримок.', isMore: false },
        { id: 'ultra_1d', type: 'ultra', name: 'Ультра 1 день', duration: 86400, price: 120, timeLabel: '1 день', desc: '', isMore: true },
        { id: 'ultra_7d', type: 'ultra', name: 'Ультра 7 днів', duration: 604800, price: 350, timeLabel: '7 днів', desc: '', isMore: true }
    ];
}

function showScreen(fromId, toId) {
    const from = document.getElementById(fromId);
    const to = document.getElementById(toId);
    from.classList.add('hidden');
    setTimeout(() => to.classList.remove('hidden'), 400);
}

function toggleMore(type) {
    const moreDiv = document.getElementById(`more-tariffs-${type}`);
    const toggleText = document.getElementById(`toggleMoreText-${type}`);
    if (moreDiv.classList.contains('show')) {
        moreDiv.classList.remove('show');
        toggleText.innerText = 'Показати ще ▼';
    } else {
        moreDiv.classList.add('show');
        toggleText.innerText = 'Сховати ▲';
    }
}

function selectTariff(type, name, price, duration) {
    selectedTariffData = { type, name, price, duration };
    document.getElementById('payment-info').innerHTML = `Тариф: <b>${name}</b><br>До сплати: <b>${price} ₴</b>`;
    document.getElementById('finalPayBtn').innerText = `Оплатити ${price} ₴`;
    showScreen('tariff-screen', 'method-screen');
}

function fakePay(method) {
    if (confirm(`Підтвердити оплату ${selectedTariffData.price} ₴ через ${method}?`)) {
        completePayment();
    }
}

document.getElementById('paymentForm').addEventListener('submit', function(e) {
    e.preventDefault();
    const btn = document.getElementById('finalPayBtn');
    btn.disabled = true;
    btn.innerText = 'Обробка платежу...';
    setTimeout(() => {
        btn.disabled = false;
        btn.innerText = `Оплатити ${selectedTariffData.price} ₴`;
        completePayment();
    }, 1500);
});

/**
 * 2. Функція видачі доступу (перехід за посиланням шлюзу)
 */
function grantWifiAccessAndRedirect() {
    const params = new URLSearchParams(window.location.search);
    
    const tok = params.get('tok') || localStorage.getItem('saved_tok') || '';
    const redir = params.get('redir') || localStorage.getItem('saved_redir') || 'https://google.com';
    const authaction = params.get('authaction') || localStorage.getItem('saved_authaction') || 'http://192.168.1.1:2050/nodogsplash_auth/';

    if (authaction && tok) {
        // Формуємо пряме посилання для авторизації
        const finalAuthUrl = authaction + '?tok=' + tok + '&redir=' + encodeURIComponent(redir);
        
        // Переходимо напряму
        window.location.href = finalAuthUrl;
    } else {
        window.location.href = redir;
    }
}

/**
 * 3. Завершення оплати та автоматичний перехід
 */
async function completePayment() {
    if (selectedTariffData.type === 'basic') {
        basicBalance += selectedTariffData.price;
        document.getElementById('basic-balance').innerText = `${basicBalance}.00 ₴`;
        basicTimeLeft += selectedTariffData.duration;
        startBasicTimer();
    } else if (selectedTariffData.type === 'ultra') {
        ultraBalance += selectedTariffData.price;
        document.getElementById('ultra-balance').innerText = `${ultraBalance}.00 ₴`;
        ultraTimeLeft += selectedTariffData.duration;
        startUltraTimer();
    }

    await syncUserData();

    document.getElementById('active-duration-display').innerText = selectedTariffData.name;
    
    const form = document.getElementById('paymentForm');
    if (form) form.reset();

    const activeScreen = !document.getElementById('card-screen').classList.contains('hidden') 
        ? 'card-screen' 
        : 'method-screen';
    
    // Перемикаємо екран на вікно успіху
    showScreen(activeScreen, 'success-screen');

    // Через 1.5 секунди автоматично вмикаємо інтернет
    setTimeout(() => {
        grantWifiAccessAndRedirect();
    }, 1500);
}

function formatTime(secondsTotal) {
    const days = Math.floor(secondsTotal / 86400);
    const hours = Math.floor((secondsTotal % 86400) / 3600).toString().padStart(2, '0');
    const minutes = Math.floor((secondsTotal % 3600) / 60).toString().padStart(2, '0');
    const seconds = (secondsTotal % 60).toString().padStart(2, '0');
    let timeString = "";
    if (days > 0) timeString += `${days}д `;
    timeString += `${hours}:${minutes}:${seconds}`;
    return timeString;
}

function startBasicTimer() {
    const badge = document.getElementById('timer-badge-basic');
    const display = document.getElementById('time-left-basic');
    badge.classList.remove('hidden-timer');
    display.innerText = formatTime(basicTimeLeft);

    if (basicTimer) clearInterval(basicTimer);
    basicTimer = setInterval(() => {
        if (basicTimeLeft <= 0) {
            clearInterval(basicTimer);
            display.innerText = "Час вийшов";
            syncUserData();
            return;
        }
        basicTimeLeft--;
        display.innerText = formatTime(basicTimeLeft);
    }, 1000);
}

function startUltraTimer() {
    const badge = document.getElementById('timer-badge-ultra');
    const display = document.getElementById('time-left-ultra');
    badge.classList.remove('hidden-timer');
    display.innerText = formatTime(ultraTimeLeft);

    if (ultraTimer) clearInterval(ultraTimer);
    ultraTimer = setInterval(() => {
        if (ultraTimeLeft <= 0) {
            clearInterval(ultraTimer);
            display.innerText = "Час вийшов";
            syncUserData();
            return;
        }
        ultraTimeLeft--;
        display.innerText = formatTime(ultraTimeLeft);
    }, 1000);
}

// Періодично раз на 30 секунд зберігаємо залишок часу в БД
setInterval(syncUserData, 30000);
