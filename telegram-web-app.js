// Файл: public/telegram-web-app.js
window.Telegram = {
    WebApp: {
        initDataUnsafe: {
            user: {
                id: 123456789,
                first_name: 'Local',
                last_name: 'User',
                username: 'local_user',
                language_code: 'en'
            }
        },
        showAlert: function(message, callback) {
            alert(message);
            if (callback) callback();
        },
        showConfirm: function(message, callback) {
            const result = confirm(message);
            if (callback) callback(result);
        },
        ready: function() {
            console.log('Telegram WebApp ready');
        },
        expand: function() {
            console.log('Telegram WebApp expanded');
        },
        close: function() {
            console.log('Telegram WebApp close requested');
        },
        sendData: function(data) {
            console.log('Data sent to bot:', data);
        },
        onEvent: function(eventType, callback) {
            console.log(`Event handler set for: ${eventType}`);
        }
    }
};

console.log('Telegram WebApp mock loaded');