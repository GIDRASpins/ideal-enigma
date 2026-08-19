// Глобальний стан додатку
let selectedTariffData = { type: '', name: '', price: 0, duration: 0 };

// Окремий баланс і таймер для Базового тарифу
let basicBalance = 0;
let basicTimeLeft = 0;
let basicTimer = null;

// Окремий баланс і таймер для Ультра тарифу
let ultraBalance = 0;
let ultraTimeLeft = 0;
let ultraTimer = null;

/**
 * Плавний перехід між екранами
 */
function showScreen(fromId, toId) {
    const from = document.getElementById(fromId);
    const to = document.getElementById(toId);
    
    from.classList.add('hidden');
    setTimeout(() => {
        to.classList.remove('hidden');
    }, 400);
}

/**
 * Логін користувача
 */
document.getElementById('loginForm').addEventListener('submit', function(e) {
    e.preventDefault();
    const btn = this.querySelector('.main-btn');
    btn.innerText = 'Вхід...';
    btn.disabled = true;
    
    setTimeout(() => {
        btn.disabled = false;
        btn.innerText = 'Увійти в мережу';
        showScreen('login-screen', 'tariff-screen');
    }, 1000);
});

/**
 * Розгортання списку додаткових тарифів
 */
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

/**
 * Вибір конкретного тарифу
 * @param {string} type - 'basic' або 'ultra'
 */
function selectTariff(type, name, price, duration) {
    selectedTariffData = { type, name, price, duration };
    
    document.getElementById('payment-info').innerHTML = `Тариф: <b>${name}</b><br>До сплати: <b>${price} ₴</b>`;
    document.getElementById('finalPayBtn').innerText = `Оплатити ${price} ₴`;
    
    showScreen('tariff-screen', 'method-screen');
}

/**
 * Швидкі методи оплати (Apple / Google Pay)
 */
function fakePay(method) {
    if (confirm(`Підтвердити оплату ${selectedTariffData.price} ₴ через ${method}?`)) {
        completePayment();
    }
}

/**
 * Обробка форми оплати карткою
 */
document.getElementById('paymentForm').addEventListener('submit', function(e) {
    e.preventDefault();
    const btn = document.getElementById('finalPayBtn');
    
    btn.disabled = true;
    btn.innerText = 'Обробка платежу...';
    
    setTimeout(() => {
        btn.disabled = false;
        btn.innerText = `Оплатити ${selectedTariffData.price} ₴`;
        completePayment();
    }, 2000);
});

/**
 * Успішне завершення платежу
 */
function completePayment() {
    alert(`Оплата успішна! Тариф "${selectedTariffData.name}" активовано.`);
    
    // Оновлення окремого балансу та таймера залежно від обраного тарифу
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
    
    // Очищення форми
    document.getElementById('paymentForm').reset();
    
    // Повернення до екрану тарифів
    const activeScreen = !document.getElementById('card-screen').classList.contains('hidden') 
        ? 'card-screen' 
        : 'method-screen';
        
    showScreen(activeScreen, 'tariff-screen');
}

/**
 * Форматування часу (дні, години, хвилини, секунди)
 */
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

/**
 * Таймер для Базового тарифу
 */
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
            return;
        }
        basicTimeLeft--;
        display.innerText = formatTime(basicTimeLeft);
    }, 1000);
}

/**
 * Таймер для Ультра тарифу
 */
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
            return;
        }
        ultraTimeLeft--;
        display.innerText = formatTime(ultraTimeLeft);
    }, 1000);
}