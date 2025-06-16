require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
const sqlite3 = require('sqlite3').verbose();

const bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, { polling: true });
const API_URL = 'http://localhost:3000/api';

// Подключение к SQLite
const db = new sqlite3.Database('./database.sqlite');

// Установка команд меню
bot.setMyCommands([
    { command: '/start', description: 'Начало работы' },
    { command: '/register', description: 'Регистрация' },
    { command: '/login', description: 'Вход' },
    { command: '/add_task', description: 'Добавить задачу' },
    { command: '/edit_task', description: 'Редактировать задачу' },
    { command: '/delete_task', description: 'Удалить задачу' },
    { command: '/my_tasks', description: 'Мои задачи' },
    { command: '/logout', description: 'Выход' }
]);

// Сессии пользователей
const userSessions = {};

// Команда /start
bot.onText(/\/start/, (msg) => {
    const chatId = msg.chat.id;
    userSessions[chatId] = { auth: false };
    
    const welcomeMsg = `📝 *To-Do List Bot*\n\n` +
                     `Добро пожаловать! Этот бот поможет вам управлять задачами.\n\n` +
                     `Для начала работы:\n` +
                     `1. Зарегистрируйтесь командой /register\n` +
                     `2. Войдите командой /login\n\n` +
                     `После входа вы сможете управлять задачами.`;
    
    bot.sendMessage(chatId, welcomeMsg, { parse_mode: 'Markdown' });
});

// Команда /register
bot.onText(/\/register/, (msg) => {
    const chatId = msg.chat.id;
    userSessions[chatId] = { 
        ...userSessions[chatId],
        auth: false,
        waitingForRegister: true,
        waitingForAuth: false
    };
    bot.sendMessage(chatId, 'Для регистрации введите ваш логин и пароль в формате:\n\n`логин:пароль`\n\nПароль должен содержать не менее 5 символов.', {
        parse_mode: 'Markdown'
    });
});

// Команда /login
bot.onText(/\/login/, (msg) => {
    const chatId = msg.chat.id;
    userSessions[chatId] = { 
        ...userSessions[chatId],
        auth: false,
        waitingForAuth: true,
        waitingForRegister: false
    };
    bot.sendMessage(chatId, 'Для входа введите ваш логин и пароль в формате:\n\n`логин:пароль`', {
        parse_mode: 'Markdown'
    });
});

// Обработка сообщений
bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    const text = msg.text;
    const session = userSessions[chatId] || { auth: false };

    if (!text || text.startsWith('/')) return;

    // Обработка регистрации
    if (session.waitingForRegister) {
        try {
            const [username, password] = text.split(':');
            
            if (!username || !password || password.length < 5) {
                throw new Error('Неверный формат или пароль слишком короткий (мин. 5 символов)');
            }

            const response = await axios.post(`${API_URL}/register`, {
                username: username.trim(),
                password: password.trim()
            });

            userSessions[chatId] = {
                auth: true,
                userId: response.data.userId,
                username: username.trim(),
                state: null
            };

            bot.sendMessage(chatId, `✅ *Регистрация успешна!*\n\nТеперь вы можете управлять задачами.`, {
                parse_mode: 'Markdown'
            });
        } catch (error) {
            const errorMsg = error.response?.data?.error || error.message;
            bot.sendMessage(chatId, `❌ Ошибка регистрации: ${errorMsg}`);
        }
        return;
    }

    // Обработка входа
    if (session.waitingForAuth) {
        try {
            const [username, password] = text.split(':');
            
            if (!username || !password) {
                throw new Error('Неверный формат ввода');
            }

            const response = await axios.post(`${API_URL}/login`, {
                username: username.trim(),
                password: password.trim()
            });

            userSessions[chatId] = {
                auth: true,
                userId: response.data.userId,
                username: username.trim(),
                state: null
            };

            const tasksResponse = await axios.get(`${API_URL}/todos/${response.data.userId}`);
            const tasks = tasksResponse.data;

            bot.sendMessage(chatId, `✅ *Вход выполнен!*\n\nВсего задач: ${tasks.length}\n\nИспользуйте команды для управления задачами.`, {
                parse_mode: 'Markdown'
            });
        } catch (error) {
            const errorMsg = error.response?.data?.error || error.message;
            bot.sendMessage(chatId, `❌ Ошибка входа: ${errorMsg}`);
        }
        return;
    }

    // Обработка состояний
    if (session.auth) {
        // Добавление задачи
        if (session.state === 'adding_task') {
            try {
                await axios.post(`${API_URL}/todos/${session.userId}`, {
                    task_text: text
                });
                
                userSessions[chatId].state = null;
                bot.sendMessage(chatId, `✅ Задача добавлена:\n"${text}"`);
            } catch (error) {
                bot.sendMessage(chatId, '❌ Не удалось добавить задачу');
            }
            return;
        }

        // Редактирование задачи
        if (session.state === 'editing_task') {
            try {
                const taskNumber = parseInt(text);
                const tasksResponse = await axios.get(`${API_URL}/todos/${session.userId}`);
                const tasks = tasksResponse.data;
                
                if (isNaN(taskNumber)) throw new Error('Введите номер задачи');
                if (taskNumber < 1 || taskNumber > tasks.length) throw new Error('Неверный номер задачи');
                
                userSessions[chatId].state = 'editing_task_text';
                userSessions[chatId].editingTaskId = tasks[taskNumber - 1].id;
                
                bot.sendMessage(chatId, `Введите новый текст для задачи №${taskNumber}:\n\nТекущий текст: "${tasks[taskNumber - 1].text}"`);
            } catch (error) {
                bot.sendMessage(chatId, `❌ Ошибка: ${error.message}`);
            }
            return;
        }

        // Сохранение отредактированной задачи
        if (session.state === 'editing_task_text') {
            try {
                await axios.put(`${API_URL}/todos/${session.userId}/${session.editingTaskId}`, {
                    task_text: text
                });
                
                userSessions[chatId].state = null;
                bot.sendMessage(chatId, `✅ Задача обновлена:\n"${text}"`);
            } catch (error) {
                bot.sendMessage(chatId, '❌ Не удалось обновить задачу');
            }
            return;
        }

        // Удаление задачи
        if (session.state === 'deleting_task') {
            try {
                const taskNumber = parseInt(text);
                const tasksResponse = await axios.get(`${API_URL}/todos/${session.userId}`);
                const tasks = tasksResponse.data;
                
                if (isNaN(taskNumber)) throw new Error('Введите номер задачи');
                if (taskNumber < 1 || taskNumber > tasks.length) throw new Error('Неверный номер задачи');
                
                await axios.delete(`${API_URL}/todos/${session.userId}/${tasks[taskNumber - 1].id}`);
                
                userSessions[chatId].state = null;
                bot.sendMessage(chatId, `✅ Задача удалена`);
            } catch (error) {
                bot.sendMessage(chatId, `❌ Ошибка: ${error.message}`);
            }
            return;
        }
    }
});

// Команда /add_task
bot.onText(/\/add_task/, (msg) => {
    const chatId = msg.chat.id;
    const session = userSessions[chatId];
    
    if (!session?.auth) {
        return bot.sendMessage(chatId, 'Сначала авторизуйтесь с помощью /login');
    }
    
    userSessions[chatId].state = 'adding_task';
    bot.sendMessage(chatId, 'Введите текст новой задачи:');
});

// Команда /edit_task
bot.onText(/\/edit_task/, async (msg) => {
    const chatId = msg.chat.id;
    const session = userSessions[chatId];
    
    if (!session?.auth) {
        return bot.sendMessage(chatId, 'Сначала авторизуйтесь с помощью /login');
    }
    
    try {
        const response = await axios.get(`${API_URL}/todos/${session.userId}`);
        const tasks = response.data;
        
        if (tasks.length === 0) {
            return bot.sendMessage(chatId, 'У вас нет задач для редактирования!');
        }
        
        userSessions[chatId].state = 'editing_task';
        
        const taskList = tasks.map((task, index) => `${index + 1}. ${task.text}`).join('\n');
        bot.sendMessage(chatId, `Выберите номер задачи для редактирования:\n\n${taskList}`);
    } catch (error) {
        bot.sendMessage(chatId, '❌ Не удалось загрузить задачи');
    }
});

// Команда /delete_task
bot.onText(/\/delete_task/, async (msg) => {
    const chatId = msg.chat.id;
    const session = userSessions[chatId];
    
    if (!session?.auth) {
        return bot.sendMessage(chatId, 'Сначала авторизуйтесь с помощью /login');
    }
    
    try {
        const response = await axios.get(`${API_URL}/todos/${session.userId}`);
        const tasks = response.data;
        
        if (tasks.length === 0) {
            return bot.sendMessage(chatId, 'У вас нет задач для удаления!');
        }
        
        userSessions[chatId].state = 'deleting_task';
        
        const taskList = tasks.map((task, index) => `${index + 1}. ${task.text}`).join('\n');
        bot.sendMessage(chatId, `Выберите номер задачи для удаления:\n\n${taskList}`);
    } catch (error) {
        bot.sendMessage(chatId, '❌ Не удалось загрузить задачи');
    }
});

// Команда /my_tasks
bot.onText(/\/my_tasks/, async (msg) => {
    const chatId = msg.chat.id;
    const session = userSessions[chatId];
    
    if (!session?.auth) {
        return bot.sendMessage(chatId, 'Сначала авторизуйтесь с помощью /login');
    }
    
    try {
        const response = await axios.get(`${API_URL}/todos/${session.userId}`);
        const tasks = response.data;
        const currentDate = new Date().toLocaleString('ru-RU');
        
        if (tasks.length === 0) {
            return bot.sendMessage(chatId, `На ${currentDate} у вас нет задач!`);
        }
        
        const taskList = tasks.map((task, index) => `${index + 1}. ${task.text}`).join('\n');
        bot.sendMessage(chatId, `📅 *Ваши задачи на ${currentDate}:*\n\n${taskList}\n\nВсего задач: ${tasks.length}`, {
            parse_mode: 'Markdown'
        });
    } catch (error) {
        bot.sendMessage(chatId, '❌ Не удалось загрузить задачи');
    }
});

// Команда /logout
bot.onText(/\/logout/, (msg) => {
    const chatId = msg.chat.id;
    userSessions[chatId] = { auth: false };
    bot.sendMessage(chatId, 'Вы вышли из системы. Для повторного входа используйте /login');
});

console.log('🤖 Бот запущен и готов к работе!');