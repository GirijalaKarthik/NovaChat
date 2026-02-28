// server.js
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { nanoid } = require('nanoid');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.use(express.static(__dirname));

const spaces = {};

io.on('connection', (socket) => {
    socket.on('create_space', (username) => {
        const spaceCode = nanoid(6);
        spaces[spaceCode] = { host: socket.id, users: [{ id: socket.id, name: username }] };
        socket.join(spaceCode);
        socket.emit('space_created', { spaceCode, isHost: true });
        io.to(spaceCode).emit('update_users', spaces[spaceCode].users);
    });

    socket.on('join_space', ({ spaceCode, username }) => {
        if (spaces[spaceCode]) {
            spaces[spaceCode].users.push({ id: socket.id, name: username });
            socket.join(spaceCode);
            socket.emit('space_joined', { spaceCode, isHost: false });
            io.to(spaceCode).emit('update_users', spaces[spaceCode].users);
        } else {
            socket.emit('error', 'Space not found');
        }
    });

    socket.on('send_message', ({ spaceCode, username, text }) => {
        const messageId = 'msg-' + Math.random().toString(36).substr(2, 9);
        io.to(spaceCode).emit('receive_message', { messageId, username, text });
    });

    socket.on('kick_user', ({ spaceCode, targetId }) => {
        if (spaces[spaceCode] && spaces[spaceCode].host === socket.id) {
            io.to(targetId).emit('kicked');
            const targetSocket = io.sockets.sockets.get(targetId);
            if (targetSocket) {
                targetSocket.leave(spaceCode);
            }
            spaces[spaceCode].users = spaces[spaceCode].users.filter(u => u.id !== targetId);
            io.to(spaceCode).emit('update_users', spaces[spaceCode].users);
        }
    });

    socket.on('delete_message', ({ spaceCode, messageId }) => {
        if (spaces[spaceCode] && spaces[spaceCode].host === socket.id) {
            io.to(spaceCode).emit('message_removed', messageId);
        }
    });

    socket.on('disconnect', () => {
        for (const spaceCode in spaces) {
            const space = spaces[spaceCode];
            const userIndex = space.users.findIndex(u => u.id === socket.id);
            if (userIndex !== -1) {
                space.users.splice(userIndex, 1);
                io.to(spaceCode).emit('update_users', space.users);
                if (space.users.length === 0 || space.host === socket.id) {
                    delete spaces[spaceCode];
                    io.to(spaceCode).emit('space_ended');
                }
                break;
            }
        }
    });
});

server.listen(3000, () => console.log('Server running on port 3000'));