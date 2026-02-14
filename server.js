const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");
const db = require("./db"); // Assuming your db.js is set up
require('dotenv').config();

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static("Public"));

let onlineUsers = [];
let groups = []; // Memory storage for groups (easier for expo demo)

io.on("connection", (socket) => {
    
    // LOGIN
    socket.on("login_request", (data) => {
        const sql = "SELECT * FROM users WHERE username = ? AND password = ?";
        db.query(sql, [data.username, data.password], (err, results) => {
            if (!err && results.length > 0) {
                const user = results[0];
                socket.username = user.username;
                socket.role = user.role; // 'admin' or 'student'
                
                if(!onlineUsers.includes(user.username)) onlineUsers.push(user.username);
                
                socket.emit("login_response", { success: true, role: user.role });
                io.emit("update_lists", { users: onlineUsers, groups: groups });
            } else {
                socket.emit("login_response", { success: false, msg: "Invalid Credentials" });
            }
        });
    });

    // REGISTER
    socket.on("register_request", (data) => {
        const sql = "INSERT INTO users (username, password, role) VALUES (?, ?, 'student')";
        db.query(sql, [data.username, data.password], (err) => {
            if (err) socket.emit("register_response", { msg: "Username Taken" });
            else socket.emit("register_response", { msg: "Success! Login now." });
        });
    });

    // CREATE GROUP (Admin Only)
    socket.on("create_group", (data) => {
        if(socket.role === 'admin') {
            groups.push({ name: data.name, limit: data.limit, creator: socket.username });
            io.emit("update_lists", { users: onlineUsers, groups: groups });
        }
    });

    // SEND MESSAGE
    socket.on("send_message", (data) => {
        // PERMISSION CHECK: If group, ONLY admin can speak
        if(data.type === 'group' && socket.role !== 'admin') {
            return; // Block message
        }

        // Broadcast
        io.emit("receive_message", data); 
        
        // Optional: Save to DB here if needed
        // db.query("INSERT INTO chats ...")
    });

    // DISCONNECT
    socket.on("disconnect", () => {
        onlineUsers = onlineUsers.filter(u => u !== socket.username);
        io.emit("update_lists", { users: onlineUsers, groups: groups });
    });
});

server.listen(3000, () => console.log("Server Running on 3000"));