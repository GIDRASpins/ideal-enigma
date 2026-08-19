require('dotenv').config();
const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const app = express();
app.use(cors());
app.use(express.json());

// Визначаємо шлях до статичних файлів (якщо є папка public — беремо її, якщо ні — беремо корінь)
const staticDir = fs.existsSync(path.join(__dirname, 'public', 'index.html'))
    ? path.join(__dirname, 'public')
    : __dirname;

app.use(express.static(staticDir));

// Підключення до бази PostgreSQL
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
    console.warn('⚠️ DATABASE_URL не знайдена у Variables. Використовуються базові тарифи.');
}

const pool = new Pool({
    connectionString: databaseUrl,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

// Базові тарифи
const DEFAULT_TARIFFS = [
    { id: 'basic_1h', type: 'basic', name: 'Базовий 1 год', duration: 3600, price: 10, timeLabel: '1 година', desc: 'Достатньо для соцмереж та веб-серфінгу.', isMore: false },
    { id: 'basic_12h', type: 'basic', name: 'Базовий 12 год', duration: 43200, price: 50, timeLabel: '12 годин', desc: 'Економний вибір на весь день.', isMore: false },
    { id: 'basic_1d', type: 'basic', name: 'Базовий 1 день', duration: 86400, price: 80, timeLabel: '1 день', desc: '', isMore: true },
    { id: 'basic_7d', type: 'basic', name: 'Базовий 7 днів', duration: 604800, price: 250, timeLabel: '7 днів', desc: '', isMore: true },
    
    { id: 'ultra_1h', type: 'ultra', name: 'Ультра 1 год', duration: 3600, price: 15, timeLabel: '1 година', desc: 'Максимальна швидкість + високий пріоритет.', isMore: false },
    { id: 'ultra_12h', type: 'ultra', name: 'Ультра 12 год', duration: 43200, price: 75, timeLabel: '12 годин', desc: 'Гігабітний канал, 4K відео без затримок.', isMore: false },
    { id: 'ultra_1d', type: 'ultra', name: 'Ультра 1 день', duration: 86400, price: 120, timeLabel: '1 день', desc: '', isMore: true },
    { id: 'ultra_7d', type: 'ultra', name: 'Ультра 7 днів', duration: 604800, price: 350, timeLabel: '7 днів', desc: '', isMore: true }
];

// Ініціалізація БД
async function initDB() {
    if (!databaseUrl) return;
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
        console.log('✅ База даних PostgreSQL успішно підключена');
    } catch (err) {
        console.error('Помилка підключення до БД:', err.message);
    }
}
initDB();

// API отримання тарифів
app.get('/api/tariffs', async (req, res) => {
    const routerId = req.query.router_id || 'default';
    
    if (!databaseUrl) {
        return res.json({ routerId: 'default', tariffs: DEFAULT_TARIFFS });
    }

    try {
        const result = await pool.query(
            'SELECT tariff_id, custom_price FROM router_tariffs WHERE router_id = $1',
            [routerId]
        );

        const customPriceMap = {};
        result.rows.forEach(row => {
            customPriceMap[row.tariff_id] = parseFloat(row.custom_price);
        });

        const tariffs = DEFAULT_TARIFFS.map(t => ({
            ...t,
            price: customPriceMap[t.id] !== undefined ? customPriceMap[t.id] : t.price
        }));

        res.json({ routerId, tariffs });
    } catch (err) {
        res.json({ routerId: 'default', tariffs: DEFAULT_TARIFFS });
    }
});

// API адмінки для зміни ціни
app.post('/api/admin/set-price', async (req, res) => {
    const { router_id, tariff_id, price } = req.body;
    if (!router_id || !tariff_id || price === undefined) {
        return res.status(400).json({ error: 'Поля router_id, tariff_id, price є обовʼязковими' });
    }

    try {
        await pool.query(
            'INSERT INTO routers (router_id, name) VALUES ($1, $2) ON CONFLICT (router_id) DO NOTHING',
            [router_id, `Роутер ${router_id}`]
        );

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

// Головний маршрут — повертає index.html
app.get('*', (req, res) => {
    const indexPath = path.join(staticDir, 'index.html');
    if (fs.existsSync(indexPath)) {
        res.sendFile(indexPath);
    } else {
        res.status(404).send('Помилка: файл index.html не знайдено в проєкті.');
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 Сервер працює на порту ${PORT}`);
    console.log(`📂 Статичні файли віддаються з: ${staticDir}`);
});
