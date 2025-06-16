const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const crypto = require('crypto');

const app = express();
const PORT = 3000;

// Инициализация базы данных
const db = new sqlite3.Database('./database.sqlite', (err) => {
    if (err) {
        console.error('❌ Ошибка подключения к SQLite:', err);
    } else {
        console.log('✅ Подключено к SQLite');
        initializeDatabase();
    }
});

function initializeDatabase() {
    db.run(`
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL
        );
    `);

    db.run(`
        CREATE TABLE IF NOT EXISTS tasks (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            task_text TEXT NOT NULL,
            FOREIGN KEY(user_id) REFERENCES users(id)
        );
    `);
}

// Middleware
app.use(bodyParser.json());
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type']
}));
app.use(express.static('public'));

// Хеширование пароля
function hashPassword(password) {
    return crypto.createHash('sha256').update(password).digest('hex');
}

// Регистрация
app.post('/api/register', (req, res) => {
    const { username, password } = req.body;
    
    if (!username || !password) {
        return res.status(400).json({ error: 'Username and password are required' });
    }

    db.get('SELECT id FROM users WHERE username = ?', [username], (err, row) => {
        if (err) {
            return res.status(500).json({ error: 'Database error' });
        }
        if (row) {
            return res.status(400).json({ error: 'Username already exists' });
        }

        const passwordHash = hashPassword(password);
        db.run('INSERT INTO users (username, password_hash) VALUES (?, ?)', 
            [username, passwordHash], 
            function(err) {
                if (err) {
                    return res.status(500).json({ error: 'Registration failed' });
                }
                res.json({ status: 'success', userId: this.lastID });
            }
        );
    });
});

// Вход
app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    
    if (!username || !password) {
        return res.status(400).json({ error: 'Username and password are required' });
    }

    const passwordHash = hashPassword(password);
    db.get('SELECT id FROM users WHERE username = ? AND password_hash = ?', 
        [username, passwordHash], 
        (err, row) => {
            if (err) {
                return res.status(500).json({ error: 'Database error' });
            }
            if (!row) {
                return res.status(401).json({ error: 'Invalid credentials' });
            }
            res.json({ status: 'success', userId: row.id });
        }
    );
});

// Получение задач
app.get('/api/todos/:userId', (req, res) => {
    const userId = req.params.userId;
    
    db.all('SELECT id, task_text FROM tasks WHERE user_id = ?', 
        [userId], 
        (err, rows) => {
            if (err) {
                return res.status(500).json({ error: 'Database error' });
            }
            res.json(rows.map(row => ({ id: row.id, text: row.task_text })));
        }
    );
});

// Добавление задачи
app.post('/api/todos/:userId', (req, res) => {
    console.log('Adding task for user:', req.params.userId, 'Text:', req.body.task_text);
    const userId = req.params.userId;
    const { task_text } = req.body;
    
    if (!task_text) {
        return res.status(400).json({ error: 'Task text is required' });
    }

    db.run('INSERT INTO tasks (user_id, task_text) VALUES (?, ?)', 
        [userId, task_text], 
        function(err) {
            if (err) {
                return res.status(500).json({ error: 'Failed to add task' });
            }
            res.json({ status: 'success', taskId: this.lastID });
        }
    );
});

// Удаление задачи
app.delete('/api/todos/:userId/:taskId', (req, res) => {
    const { userId, taskId } = req.params;
    
    db.run('DELETE FROM tasks WHERE id = ? AND user_id = ?', 
        [taskId, userId], 
        function(err) {
            if (err) {
                return res.status(500).json({ error: 'Failed to delete task' });
            }
            if (this.changes === 0) {
                return res.status(404).json({ error: 'Task not found' });
            }
            res.json({ status: 'success' });
        }
    );
});

// Обновление задачи
app.put('/api/todos/:userId/:taskId', (req, res) => {
    const { userId, taskId } = req.params;
    const { task_text } = req.body;
    
    if (!task_text) {
        return res.status(400).json({ error: 'Task text is required' });
    }

    db.run('UPDATE tasks SET task_text = ? WHERE id = ? AND user_id = ?', 
        [task_text, taskId, userId], 
        function(err) {
            if (err) {
                return res.status(500).json({ error: 'Failed to update task' });
            }
            if (this.changes === 0) {
                return res.status(404).json({ error: 'Task not found' });
            }
            res.json({ status: 'success' });
        }
    );
});

// Запуск сервера
app.listen(PORT, () => {
    console.log(`Сервер запущен на http://localhost:${PORT}`);
});