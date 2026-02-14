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

let onlineUsers = {}; 

app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "Public", "Index.html"));
});

io.on("connection", (socket) => {
    
    // --- 1. LOGIN & ROLE CHECK ---
    socket.on("login_request", (data) => {
        const { username, password } = data;
        
        const sql = "SELECT * FROM users WHERE username = ? AND password = ?";
        db.query(sql, [username, password], (err, results) => {
            if (err) {
                socket.emit("login_response", { success: false, msg: "Database Error" });
            } else if (results.length > 0) {
                const user = results[0];
                
                // Save user info in the socket
                onlineUsers[username] = socket.id;
                socket.username = username;
                socket.userRole = user.role; // Stores 'admin' or 'student'

                // Send success + THE ROLE back to the frontend
                socket.emit("login_response", { 
                    success: true, 
                    role: user.role,  
                    msg: `Welcome back, ${user.role}!`
                });

                io.emit("update_user_list", Object.keys(onlineUsers));
                
                // Load Public Chat History
                db.query("SELECT * FROM chats WHERE type='public' ORDER BY id ASC", (err, chats) => {
                    if (!err) socket.emit("load_messages", chats);
                });
            } else {
                socket.emit("login_response", { success: false, msg: "Wrong Password!" });
            }
        });
    });

    // --- 2. 👑 ADMIN: CREATE GROUP (NEW!) ---
    socket.on("create_group_request", (data) => {
        // Security Check: Is this socket actually an Admin?
        if (socket.userRole !== 'admin') {
            socket.emit("group_creation_response", { success: false, msg: "🚫 You are not an Admin!" });
            return;
        }

        const { name, desc } = data;
        
        // Insert into Database
        // We use a subquery to find the User ID of the admin
        const sql = "INSERT INTO groups (name, description, created_by) VALUES (?, ?, (SELECT id FROM users WHERE username = ?))";
        
        db.query(sql, [name, desc, socket.username], (err) => {
            if (err) {
                console.error(err);
                socket.emit("group_creation_response", { success: false, msg: "❌ Error: Group name might already exist." });
            } else {
                // Tell EVERYONE a new group exists
                io.emit("group_creation_response", { success: true, msg: `✅ Group '${name}' Created Successfully!` });
            }
        });
    });

    // --- 3. REGISTER (Default = Student) ---
    socket.on("register_request", (data) => {
        const { username, password } = data;
        const sql = "INSERT INTO users (username, password, role) VALUES (?, ?, 'student')";
        db.query(sql, [username, password], (err) => {
            if (err) socket.emit("register_response", { success: false, msg: "Username taken!" });
            else socket.emit("register_response", { success: true, msg: "Registered! Please Login." });
        });
    });

    // --- 4. SEND MESSAGE ---
    socket.on("send_message", (data) => {
        const { sender, msg } = data;
        const sql = "INSERT INTO chats (sender_name, message, type) VALUES (?, ?, 'public')";
        db.query(sql, [sender, msg], (err, result) => {
            if (!err) {
                // Check if the sender is an Admin
                const isAdmin = (socket.userRole === 'admin');
                io.emit("receive_message", { id: result.insertId, sender, msg, isAdmin });
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

const PORT = process.env.PORT || 10000;
server.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}...`));