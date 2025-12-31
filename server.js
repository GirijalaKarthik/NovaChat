const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");

// Import connection from db.js
const db = require("./db"); 

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// 👇 FIX 1: Use "Public" with a Capital P (Matches your folder)
app.use(express.static("Public"));

let onlineUsers = {}; 

app.get("/", (req, res) => {
    // 👇 FIX 2: Point to Public/Index.html (Matches your file)
    res.sendFile(path.join(__dirname, "Public", "Index.html"));
});

io.on("connection", (socket) => {
    
    // --- LOGIN HANDLER ---
    socket.on("login_request", (data) => {
        const { username, password } = data;
        const sql = "SELECT * FROM users WHERE username = ? AND password = ?";
        db.query(sql, [username, password], (err, results) => {
            if (err) {
                console.error("Login DB Error:", err);
                socket.emit("login_response", { success: false, msg: "Database Error" });
            } else if (results.length > 0) {
                onlineUsers[username] = socket.id;
                socket.username = username;
                socket.emit("login_response", { success: true });
                io.emit("update_user_list", Object.keys(onlineUsers));
                
                db.query("SELECT * FROM chats WHERE type='public' ORDER BY id ASC", (err, chats) => {
                    if (!err) socket.emit("load_messages", chats);
                });
            } else {
                socket.emit("login_response", { success: false, msg: "Wrong Password or Username!" });
            }
        });
    });

    // --- REGISTER HANDLER ---
    socket.on("register_request", (data) => {
        const { username, password } = data;
        const sql = "INSERT INTO users (username, password) VALUES (?, ?)";
        db.query(sql, [username, password], (err) => {
            if (err) {
                socket.emit("register_response", { success: false, msg: "Username already exists!" });
            } else {
                socket.emit("register_response", { success: true, msg: "Account Created! Please Login." });
            }
        });
    });

    // --- CHAT LOGIC ---
    socket.on("send_message", (data) => {
        const { sender, msg, toUser } = data;
        const isPrivate = (toUser !== "Everyone");
        const type = isPrivate ? 'private' : 'public';

        const sql = "INSERT INTO chats (sender_name, message, type) VALUES (?, ?, ?)";
        db.query(sql, [sender, msg, type], (err, result) => {
            if (!err) {
                const messageData = { 
                    id: result.insertId, sender, msg, isPrivate, toUser 
                };
                if (!isPrivate) {
                    io.emit("receive_message", messageData);
                } else {
                    const recipientSocketId = onlineUsers[toUser];
                    const senderSocketId = onlineUsers[sender];
                    if (recipientSocketId) io.to(recipientSocketId).emit("receive_message", messageData);
                    if (senderSocketId) io.to(senderSocketId).emit("receive_message", messageData);
                }
            }
        });
    });

    socket.on("delete_message", (id) => {
        db.query("DELETE FROM chats WHERE id = ?", [id], (err) => {
            if (!err) io.emit("message_deleted", id);
        });
    });

    socket.on("clear_all_chat", () => {
        db.query("DELETE FROM chats", (err) => {
            if (!err) io.emit("chat_cleared");
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
server.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}...`);
});