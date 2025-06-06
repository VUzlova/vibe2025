const http = require('http');
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');

const PORT = 3000;

// Database connection settings
const dbConfig = {
    host: 'localhost',
    user: 'root',
    password: '',
    database: 'todolist',
};

async function retrieveListItems() {
    try {
        const connection = await mysql.createConnection(dbConfig);
        const query = 'SELECT id, text, created_at as createdAt, updated_at as updatedAt FROM items ORDER BY createdAt DESC';
        const [rows] = await connection.execute(query);
        await connection.end();
        return rows;
    } catch (error) {
        console.error('Error retrieving list items:', error);
        throw error;
    }
}

async function getHtmlRows() {
    const todoItems = await retrieveListItems();

    return todoItems.map((item, index) => `
        <tr>
            <td>${index + 1}</td>
            <td>${item.text}</td>
            <td>
                <button onclick="startEdit(${index})">Edit</button>
                <button onclick="removeItem(${index})">Remove</button>
            </td>
        </tr>
    `).join('');
}

async function handleRequest(req, res) {
    if (req.url === '/') {
        try {
            const html = await fs.promises.readFile(
                path.join(__dirname, 'index.html'), 
                'utf8'
            );
            
            // Полностью заменяем tbody содержимым
            const processedHtml = html.replace(
                '<tbody id="listBody">\n        <br />\n    </tbody>',
                `<tbody id="listBody">\n        ${await getHtmlRows()}\n    </tbody>`
            );
            
            res.writeHead(200, { 'Content-Type': 'text/html' });
            res.end(processedHtml);
        } catch (err) {
            console.error(err);
            res.writeHead(500, { 'Content-Type': 'text/plain' });
            res.end('Error loading index.html');
        }
    } else if (req.url === '/script.js') {
        try {
            const script = await fs.promises.readFile(
                path.join(__dirname, 'script.js'), 
                'utf8'
            );
            res.writeHead(200, { 'Content-Type': 'application/javascript' });
            res.end(script);
        } catch (err) {
            console.error(err);
            res.writeHead(500, { 'Content-Type': 'text/plain' });
            res.end('Error loading script.js');
        }
    } else {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('Route not found');
    }
}

const server = http.createServer(handleRequest);
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));