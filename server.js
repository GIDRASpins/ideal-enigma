const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Підключення до бази PostgreSQL на Railway (через змінну DATABASE_URL)
const pool = new Pool({
    connectionString: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/wifi_db',
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

// Базові (дефолтні) тарифи, якщо в базі немає кастомних цін для роутера
const DEFAULT_TARIFFS = [
    // Базові
    { id: 'basic_1h', type: 'basic', name: 'Базовий 1 год', duration: 3600, price: 10, timeLabel: '1 година', desc: 'Достатньо для соцмереж та веб-серфінгу.', isMore: false },
    { id: 'basic_12h', type: 'basic', name: 'Базовий 12 год', duration: 43200, price: 50, timeLabel: '12 годин', desc: 'Економний вибір на весь день.', isMore: false },
    { id: 'basic_1d', type: 'basic', name: 'Базовий 1 день', duration: 86400, price: 80, timeLabel: '1 день', desc: '', isMore: true },
    { id: 'basic_7d', type: 'basic', name: 'Базовий 7 днів', duration: 604800, price: 250, timeLabel: '7 днів', desc: '', isMore: true },
    
    // Ультра
    { id: 'ultra_1h', type: 'ultra', name: 'Ультра 1 год', duration: 3600, price: 15, timeLabel: '1 година', desc: 'Максимальна швидкість + високий пріоритет.', isMore: false },
    { id: 'ultra_12h', type: 'ultra', name: 'Ультра 12 год', duration: 43200, price: 75, timeLabel: '12 годин', desc: 'Гігабітний канал, 4K відео без затримок.', isMore: false },
    { id: 'ultra_1d', type: 'ultra', name: 'Ультра 1 день', duration: 86400, price: 120, timeLabel: '1 день', desc: '', isMore: true },
    { id: 'ultra_7d', type: 'ultra', name: 'Ультра 7 днів', duration: 604800, price: 350, timeLabel: '7 днів', desc: '', isMore: true }
];

// Автоматичне створення таблиць в базі при запуску
async function initDB() {
    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS routers (
                router_id VARCHAR(100) PRIMARY KEY,
                name VARCHAR(255),
                location VARCHAR(255),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS router_tariffs (
                id SERIAL PRIMARY KEY,
                router_id VARCHAR(100) REFERENCES routers(router_id) ON DELETE CASCADE,
                tariff_id VARCHAR(50) NOT NULL,
                custom_price NUMERIC(10, 2) NOT NULL,
                UNIQUE(router_id, tariff_id)
            );
        `);
        console.log('✅ База даних успішно ініціалізована');
    } catch (err) {
        console.error('Помилка ініціалізації БД (використовуються дефолтні ціни):', err.message);
    }
}
initDB();

/**
 * 📡 Отримання тарифів під конкретний роутер
 * Приклад запиту: GET /api/tariffs?router_id=router_cafe_1
 */
app.get('/api/tariffs', async (req, res) => {
    const routerId = req.query.router_id || 'default';
    
    try {
        // Отримуємо кастомні ціни для цього роутера, якщо вони є
        const result = await pool.query(
            'SELECT tariff_id, custom_price FROM router_tariffs WHERE router_id = $1',
            [routerId]
        );

        const customPriceMap = {};
        result.rows.forEach(row => {
            customPriceMap[row.tariff_id] = parseFloat(row.custom_price);
        });

        // Формуємо фінальний список: якщо є кастомна ціна — беремо її, інакше дефолтну
        const tariffs = DEFAULT_TARIFFS.map(t => ({
            ...t,
            price: customPriceMap[t.id] !== undefined ? customPriceMap[t.id] : t.price
        }));

        res.json({ routerId, tariffs });
    } catch (err) {
        console.warn('Використовуються стандартні ціни (БД офлайн або відсутня):', err.message);
        res.json({ routerId: 'default', tariffs: DEFAULT_TARIFFS });
    }
});

/**
 * 🛠 Зміна/Встановлення ціни на тарифи для роутера
 * POST /api/admin/set-price
 * Тіло: { "router_id": "router_cafe_1", "tariff_id": "basic_1h", "price": 20 }
 */
app.post('/api/admin/set-price', async (req, res) => {
    const { router_id, tariff_id, price } = req.body;
    if (!router_id || !tariff_id || price === undefined) {
        return res.status(400).json({ error: 'Неповні дані (router_id, tariff_id, price обовʼязкові)' });
    }

    try {
        // Створюємо роутер, якщо ще не існує
        await pool.query(
            'INSERT INTO routers (router_id, name) VALUES ($1, $2) ON CONFLICT (router_id) DO NOTHING',
            [router_id, `Роутер ${router_id}`]
        );

        // Оновлюємо або створюємо ціну
        await pool.query(`
            INSERT INTO router_tariffs (router_id, tariff_id, custom_price)
            VALUES ($1, $2, $3)
            ON CONFLICT (router_id, tariff_id)
            DO UPDATE SET custom_price = EXCLUDED.custom_price
        `, [router_id, tariff_id, price]);

        res.json({ success: true, message: `Ціну для ${tariff_id} на ${router_id} встановлено: ${price} ₴` });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 Сервер працює на порту ${PORT}`);
});