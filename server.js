require('dotenv').config();
const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const app = express();
app.use(cors());
app.use(express.json());

// Визначаємо шлях до статичних файлів
const staticDir = fs.existsSync(path.join(__dirname, 'public', 'index.html'))
    ? path.join(__dirname, 'public')
    : __dirname;

app.use(express.static(staticDir));

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
    console.warn('⚠️ DATABASE_URL не знайдена у Variables. Дані зберігатимуться локально.');
}

const pool = new Pool({
    connectionString: databaseUrl,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

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

// Ініціалізація таблиць (роутери, тарифи, користувачі)
async function initDB() {
    if (!databaseUrl) return;
    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS routers (
                router_id VARCHAR(100) PRIMARY KEY,
                name VARCHAR(255),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS router_tariffs (
                id SERIAL PRIMARY KEY,
                router_id VARCHAR(100) REFERENCES routers(router_id) ON DELETE CASCADE,
                tariff_id VARCHAR(50) NOT NULL,
                custom_price NUMERIC(10, 2) NOT NULL,
                UNIQUE(router_id, tariff_id)
            );

            CREATE TABLE IF NOT EXISTS users (
                id SERIAL PRIMARY KEY,
                username VARCHAR(100) UNIQUE NOT NULL,
                access_code VARCHAR(100) NOT NULL,
                basic_balance NUMERIC(10, 2) DEFAULT 0,
                ultra_balance NUMERIC(10, 2) DEFAULT 0,
                basic_time_left INT DEFAULT 0,
                ultra_time_left INT DEFAULT 0,
                last_active TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);
        console.log('✅ База даних PostgreSQL успішно ініціалізована');
    } catch (err) {
        console.error('Помилка підключення до БД:', err.message);
    }
}
initDB();

// 1. Авторизація / Реєстрація користувача
app.post('/api/auth/login', async (req, res) => {
    const { username, accessCode } = req.body;
    if (!username || !accessCode) {
        return res.status(400).json({ error: "Введіть ім'я та код" });
    }

    if (!databaseUrl) {
        // Якщо база не підключена, повертаємо локальну відповідь
        return res.json({
            user: { username, basic_balance: 0, ultra_balance: 0, basic_time_left: 0, ultra_time_left: 0 }
        });
    }

    try {
        let userResult = await pool.query('SELECT * FROM users WHERE username = $1', [username.trim()]);
        
        if (userResult.rows.length === 0) {
            // Створюємо нового користувача
            const insertResult = await pool.query(`
                INSERT INTO users (username, access_code) 
                VALUES ($1, $2) 
                RETURNING username, basic_balance, ultra_balance, basic_time_left, ultra_time_left
            `, [username.trim(), accessCode.trim()]);
            return res.json({ user: insertResult.rows[0] });
        }

        const user = userResult.rows[0];
        if (user.access_code !== accessCode.trim()) {
            return res.status(401).json({ error: 'Невірний код доступу для цього імені' });
        }

        // Оновлюємо час останньої активності
        await pool.query('UPDATE users SET last_active = CURRENT_TIMESTAMP WHERE username = $1', [username.trim()]);

        res.json({
            user: {
                username: user.username,
                basic_balance: parseFloat(user.basic_balance),
                ultra_balance: parseFloat(user.ultra_balance),
                basic_time_left: parseInt(user.basic_time_left, 10),
                ultra_time_left: parseInt(user.ultra_time_left, 10)
            }
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 2. Синхронізація балансу та таймерів користувача в БД
app.post('/api/user/sync', async (req, res) => {
    const { username, basic_balance, ultra_balance, basic_time_left, ultra_time_left } = req.body;
    if (!username || !databaseUrl) return res.json({ success: true });

    try {
        await pool.query(`
            UPDATE users 
            SET basic_balance = $1, ultra_balance = $2, basic_time_left = $3, ultra_time_left = $4, last_active = CURRENT_TIMESTAMP
            WHERE username = $5
        `, [basic_balance, ultra_balance, basic_time_left, ultra_time_left, username]);

        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 3. Отримання тарифів
app.get('/api/tariffs', async (req, res) => {
    const routerId = req.query.router_id || 'default';
    if (!databaseUrl) return res.json({ routerId: 'default', tariffs: DEFAULT_TARIFFS });

    try {
        const result = await pool.query(
            'SELECT tariff_id, custom_price FROM router_tariffs WHERE router_id = $1',
            [routerId]
        );

        const customPriceMap = {};
        result.rows.forEach(row => customPriceMap[row.tariff_id] = parseFloat(row.custom_price));

        const tariffs = DEFAULT_TARIFFS.map(t => ({
            ...t,
            price: customPriceMap[t.id] !== undefined ? customPriceMap[t.id] : t.price
        }));

        res.json({ routerId, tariffs });
    } catch (err) {
        res.json({ routerId: 'default', tariffs: DEFAULT_TARIFFS });
    }
});

// Головний маршрут
app.get('*', (req, res) => {
    const indexPath = path.join(staticDir, 'index.html');
    if (fs.existsSync(indexPath)) {
        res.sendFile(indexPath);
    } else {
        res.status(404).send('Файл index.html не знайдено.');
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 Сервер працює на порту ${PORT}`);
});
