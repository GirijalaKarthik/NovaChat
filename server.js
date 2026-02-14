const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");
const db = require("./db"); 
require('dotenv').config();

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static("Public"));

app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "Public", "Index.html"));
});

let onlineUsers = {}; 

io.on("connection", (socket) => {
    
    socket.on("login_request", (data) => {
        const sql = "SELECT * FROM users WHERE username = ? AND password = ?";
        db.query(sql, [data.username, data.password], (err, results) => {
            if (!err && results.length > 0) {
                const user = results[0];
                socket.username = user.username;
                onlineUsers[user.username] = socket.id;
                
                socket.emit("login_response", { success: true, username: user.username });
                io.emit("update_user_list", Object.keys(onlineUsers));
            } else {
                socket.emit("login_response", { success: false, msg: "Invalid Credentials" });
            }
        });
    });

    socket.on("send_message", (data) => {
        const { sender, msg, toUser, type } = data;
        const sql = "INSERT INTO chats (sender_name, message, to_user, type) VALUES (?, ?, ?, ?)";
        db.query(sql, [sender, msg, toUser, type], (err, result) => {
            if (!err) {
                const messageData = { id: result.insertId, sender, msg, toUser, type };
                if (type === 'private') {
                    if (onlineUsers[toUser]) io.to(onlineUsers[toUser]).emit("receive_message", messageData);
                    socket.emit("receive_message", messageData);
                } else {
                    io.emit("receive_message", messageData);
                }
            }
        });
    });

    socket.on("disconnect", () => {
        if (socket.username) {
            delete onlineUsers[socket.username];
            io.emit("update_user_list", Object.keys(onlineUsers));
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server Running on Port ${PORT}`));