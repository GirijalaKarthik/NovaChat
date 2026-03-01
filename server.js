require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const mysql = require('mysql2/promise');

const app = express();
const server = http.createServer(app);
// Increased buffer size for images/files/audio (10MB)
const io = new Server(server, { maxHttpBufferSize: 1e7 });

const PORT = process.env.PORT || 3000;

const pool = mysql.createPool(process.env.DATABASE_URL);

const initDb = async () => {
    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS illegal_logs_v2 (
                id INT AUTO_INCREMENT PRIMARY KEY,
                space_name VARCHAR(255),
                sender_name VARCHAR(255),
                ip_address VARCHAR(45),
                message_content TEXT,
                flagged_word VARCHAR(100),
                timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
    } catch (err) {
        console.error(err);
    }
};
initDb();

const FORBIDDEN_WORDS = [
    'ganja', 'weed', 'drugs', 'cocaine', 'heroin', 'meth', 
    'kidnap', 'abduct', 'murder', 'kill', 'assassin',
    'terrorist', 'bomb', 'explosive', 'weapon', 'pistol', 'rifle',
    'smuggling', 'trafficking', 'extortion', 'tupaki', 'champesta', 
    'champeyi', 'narukutha', 'narakadam', 'supari', 'goonda', 
    'theevravadi', 'balatkaram', 'atyacharam', 'mathu', 'vyabhacharam','rape' 
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
    const clientIp = socket.handshake.headers['x-forwarded-for'] || socket.handshake.address;

    socket.on('admin_login', async (password) => {
        if (password === process.env.ADMIN_PASSWORD) {
            try {
                const [logs] = await pool.query('SELECT * FROM illegal_logs_v2 ORDER BY timestamp DESC');
                const activeSpaces = Object.keys(spaces).map(code => ({
                    code: code,
                    name: spaces[code].spaceName,
                    host: spaces[code].users.find(u => u.id === spaces[code].host)?.name || 'Unknown',
                    userCount: spaces[code].users.length
                }));
                let totalUsers = 0;
                for (const code in spaces) { totalUsers += spaces[code].users.length; }
                socket.emit('admin_login_success', { logs, activeSpaces, totalUsers });
            } catch (err) {
                socket.emit('admin_error', 'Database error.');
            }
        } else {
            socket.emit('admin_error', 'Access Denied');
        }
    });

    socket.on('create_space', (data) => {
        const code = generateCode();
        spaces[code] = { host: socket.id, spaceName: data.spaceName, users: [{ id: socket.id, name: data.name }] };
        socket.join(code);
        socket.spaceCode = code;
        socket.userName = data.name;
        socket.emit('space_created', { code: code, isHost: true, spaceName: data.spaceName });
        io.to(code).emit('update_user_list', spaces[code].users);
    });

    socket.on('join_space', (data) => {
        const code = data.code;
        const name = data.name;
        if (spaces[code]) {
            if(spaces[code].users.some(u => u.name === name)) return socket.emit('error_msg', 'Name taken');
            spaces[code].users.push({ id: socket.id, name: name });
            socket.join(code);
            socket.spaceCode = code;
            socket.userName = name;
            socket.emit('joined_success', { code: code, isHost: false, spaceName: spaces[code].spaceName });
            io.to(code).emit('update_user_list', spaces[code].users);
        } else {
            socket.emit('error_msg', 'Invalid Code');
        }
    });

    socket.on('typing', () => {
        if (socket.spaceCode) socket.to(socket.spaceCode).emit('user_typing', socket.userName);
    });

    socket.on('stop_typing', () => {
        if (socket.spaceCode) socket.to(socket.spaceCode).emit('user_stopped_typing', socket.userName);
    });

    socket.on('send_message', async (data) => {
        const code = socket.spaceCode;
        if (!code) return;

        const messageId = 'msg-' + Math.random().toString(36).substr(2, 9);
        const lowerMsg = data.msg.toLowerCase();
        const foundWord = FORBIDDEN_WORDS.find(word => lowerMsg.includes(word));
        
        if (foundWord) {
            try {
                await pool.query(
                    'INSERT INTO illegal_logs_v2 (space_name, sender_name, ip_address, message_content, flagged_word) VALUES (?, ?, ?, ?, ?)',
                    [spaces[code].spaceName, socket.userName, clientIp, data.msg, foundWord]
                );
            } catch (err) {}
        }

        io.to(code).emit('receive_message', {
            messageId, sender: socket.userName, msg: data.msg, type: 'text', toUser: data.toUser, isPrivate: data.toUser !== "Everyone"
        });
    });

    socket.on('edit_message', async (data) => {
        const code = socket.spaceCode;
        if (!code) return;

        const lowerMsg = data.newMsg.toLowerCase();
        const foundWord = FORBIDDEN_WORDS.find(word => lowerMsg.includes(word));
        
        if (foundWord) {
            try {
                await pool.query(
                    'INSERT INTO illegal_logs_v2 (space_name, sender_name, ip_address, message_content, flagged_word) VALUES (?, ?, ?, ?, ?)',
                    [spaces[code].spaceName, socket.userName, clientIp, "[EDITED] " + data.newMsg, foundWord]
                );
            } catch (err) {}
        }

        io.to(code).emit('message_edited', { messageId: data.messageId, newMsg: data.newMsg });
    });

    socket.on('send_media', (data) => {
        const code = socket.spaceCode;
        if (!code) return;
        const messageId = 'msg-' + Math.random().toString(36).substr(2, 9);
        io.to(code).emit('receive_message', {
            messageId, sender: socket.userName, msg: data.fileData, fileName: data.fileName, type: data.fileType, toUser: data.toUser, isPrivate: data.toUser !== "Everyone"
        });
    });

    socket.on('update_space_name', (spaceName) => {
        const code = socket.spaceCode;
        if (code && spaces[code] && spaces[code].host === socket.id) {
            spaces[code].spaceName = spaceName;
            io.to(code).emit('space_name_updated', spaceName);
        }
    });

    socket.on('delete_message', (data) => {
        if (socket.spaceCode) io.to(socket.spaceCode).emit('message_removed', data.messageId);
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