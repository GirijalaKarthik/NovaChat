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

// Force load your specific Index.html to avoid "Cannot GET /" errors
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
                socket.role = user.role;
                onlineUsers[user.username] = socket.id; // Map username to unique socket ID
                
                socket.emit("login_response", { success: true, role: user.role, username: user.username });
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
                const messageData = { id: result.insertId, sender, msg, toUser, type, role: socket.role };
                if (type === 'private') {
                    // Fix: Transmit privately to the specific recipient and the sender
                    if (onlineUsers[toUser]) io.to(onlineUsers[toUser]).emit("receive_message", messageData);
                    socket.emit("receive_message", messageData);
                } else {
                    io.emit("receive_message", messageData); // Public broadcast for Bvrc
                }
            }
        });
    });

    // Re-added: Individual message deletion logic
    socket.on("delete_message", (id) => {
        db.query("DELETE FROM chats WHERE id = ?", [id], (err) => {
            if (!err) io.emit("message_deleted", id);
        });
    });

    // Re-added: Full history clearing logic
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
server.listen(PORT, () => console.log(`Nebula Core Online: Port ${PORT}`));