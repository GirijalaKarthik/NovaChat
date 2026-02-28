const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;

// Tell Express to serve files from the "public" folder
app.use(express.static(path.join(__dirname, 'public')));

// Explicitly look for "Index.html" with a capital 'I' inside the 'public' folder
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'Index.html'));
});

const spaces = {};

function generateCode() {
    return Math.random().toString(36).substring(2, 8).toUpperCase();
}

io.on('connection', (socket) => {
    socket.on('create_space', (name) => {
        const code = generateCode();
        spaces[code] = { host: socket.id, users: [{ id: socket.id, name: name }] };
        socket.join(code);
        socket.spaceCode = code;
        socket.userName = name;
        socket.emit('space_created', { code: code, isHost: true });
        io.to(code).emit('update_user_list', spaces[code].users);
    });

    socket.on('join_space', (data) => {
        const code = data.code;
        const name = data.name;
        if (spaces[code]) {
            const nameExists = spaces[code].users.some(u => u.name === name);
            if(nameExists) {
                return socket.emit('error_msg', 'Name already taken in this space');
            }
            spaces[code].users.push({ id: socket.id, name: name });
            socket.join(code);
            socket.spaceCode = code;
            socket.userName = name;
            socket.emit('joined_success', { code: code, isHost: false });
            io.to(code).emit('update_user_list', spaces[code].users);
        } else {
            socket.emit('error_msg', 'Invalid Space Code');
        }
    });

    socket.on('send_message', (data) => {
        const code = socket.spaceCode;
        if (!code) return;
        const messageId = 'msg-' + Math.random().toString(36).substr(2, 9);
        const isPrivate = data.toUser !== "Everyone";
        const payload = {
            messageId: messageId,
            sender: socket.userName,
            msg: data.msg,
            toUser: data.toUser,
            isPrivate: isPrivate
        };
        io.to(code).emit('receive_message', payload);
    });

    socket.on('delete_message', (data) => {
        const code = socket.spaceCode;
        if (code) {
            io.to(code).emit('message_removed', data.messageId);
        }
    });

    socket.on('kick_user', (data) => {
        const code = socket.spaceCode;
        if (spaces[code] && spaces[code].host === socket.id) {
            const targetUser = spaces[code].users.find(u => u.name === data.targetName);
            if (targetUser) {
                io.to(targetUser.id).emit('kicked');
                const targetSocket = io.sockets.sockets.get(targetUser.id);
                if (targetSocket) {
                    targetSocket.leave(code);
                }
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