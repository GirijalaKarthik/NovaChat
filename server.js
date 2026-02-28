require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const mysql = require('mysql2/promise');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;

// --- AIVEN MYSQL CONNECTION ---
const pool = mysql.createPool(process.env.DATABASE_URL);

// Initialize Database Table
const initDb = async () => {
    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS illegal_logs (
                id INT AUTO_INCREMENT PRIMARY KEY,
                space_name VARCHAR(255),
                sender_name VARCHAR(255),
                message_content TEXT,
                flagged_word VARCHAR(100),
                timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        console.log("MySQL Connected: Sentinel Table Ready");
    } catch (err) {
        console.error("Database Connection Failed:", err);
    }
};
initDb();

// --- SENTINEL KEYWORDS ---
const FORBIDDEN_WORDS = [
    'ganja', 'weed', 'drugs', 'cocaine', 'heroin', 'meth', 
    'kidnap', 'abduct', 'murder', 'kill', 'assassin',
    'terrorist', 'bomb', 'explosive', 'weapon', 'pistol', 'rifle',
    'smuggling', 'trafficking', 'extortion'
];

app.use(express.static(__dirname));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

const spaces = {};

function generateCode() {
    return Math.random().toString(36).substring(2, 8).toUpperCase();
}

io.on('connection', (socket) => {
    // Create Space
    socket.on('create_space', (data) => {
        const code = generateCode();
        spaces[code] = { host: socket.id, spaceName: data.spaceName, users: [{ id: socket.id, name: data.name }] };
        socket.join(code);
        socket.spaceCode = code;
        socket.userName = data.name;
        socket.emit('space_created', { code: code, isHost: true, spaceName: data.spaceName });
        io.to(code).emit('update_user_list', spaces[code].users);
    });

    // Join Space
    socket.on('join_space', (data) => {
        const code = data.code;
        const name = data.name;
        if (spaces[code]) {
            const nameExists = spaces[code].users.some(u => u.name === name);
            if(nameExists) return socket.emit('error_msg', 'Name already taken');
            
            spaces[code].users.push({ id: socket.id, name: name });
            socket.join(code);
            socket.spaceCode = code;
            socket.userName = name;
            socket.emit('joined_success', { code: code, isHost: false, spaceName: spaces[code].spaceName });
            io.to(code).emit('update_user_list', spaces[code].users);
        } else {
            socket.emit('error_msg', 'Invalid Space Code');
        }
    });

    // Handle Messages + Sentinel Logic
    socket.on('send_message', async (data) => {
        const code = socket.spaceCode;
        if (!code) return;

        const messageId = 'msg-' + Math.random().toString(36).substr(2, 9);
        const lowerMsg = data.msg.toLowerCase();

        // Check for illegal content
        const foundWord = FORBIDDEN_WORDS.find(word => lowerMsg.includes(word));
        if (foundWord) {
            try {
                // Silently log to Aiven MySQL
                await pool.query(
                    'INSERT INTO illegal_logs (space_name, sender_name, message_content, flagged_word) VALUES (?, ?, ?, ?)',
                    [spaces[code].spaceName, socket.userName, data.msg, foundWord]
                );
            } catch (err) {
                console.error("Sentinel Logging Error:", err);
            }
        }

        const payload = {
            messageId,
            sender: socket.userName,
            msg: data.msg,
            toUser: data.toUser,
            isPrivate: data.toUser !== "Everyone"
        };
        io.to(code).emit('receive_message', payload);
    });

    socket.on('update_space_name', (spaceName) => {
        const code = socket.spaceCode;
        if (code && spaces[code] && spaces[code].host === socket.id) {
            spaces[code].spaceName = spaceName;
            io.to(code).emit('space_name_updated', spaceName);
        }
    });

    socket.on('delete_message', (data) => {
        const code = socket.spaceCode;
        if (code) io.to(code).emit('message_removed', data.messageId);
    });

    socket.on('kick_user', (data) => {
        const code = socket.spaceCode;
        if (spaces[code] && spaces[code].host === socket.id) {
            const targetUser = spaces[code].users.find(u => u.name === data.targetName);
            if (targetUser) {
                io.to(targetUser.id).emit('kicked');
                const targetSocket = io.sockets.sockets.get(targetUser.id);
                if (targetSocket) targetSocket.leave(code);
                spaces[code].users = spaces[code].users.filter(u => u.id !== targetUser.id);
                io.to(code).emit('update_user_list', spaces[code].users);
            }
        }
    });

    socket.on('end_space', () => {
        const code = socket.spaceCode;
        if (spaces[code] && spaces[code].host === socket.id) {
            delete spaces[code];
            io.to(code).emit('space_ended');
        }
    });

    socket.on('disconnect', () => {
        const code = socket.spaceCode;
        if (code && spaces[code]) {
            spaces[code].users = spaces[code].users.filter(u => u.id !== socket.id);
            io.to(code).emit('update_user_list', spaces[code].users);
            if (spaces[code].users.length === 0 || spaces[code].host === socket.id) {
                delete spaces[code];
                io.to(code).emit('space_ended');
            }
        }
    });
});

server.listen(PORT, () => console.log(`Server running on port ${PORT}`));