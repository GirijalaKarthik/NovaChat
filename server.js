const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");
const db = require("./db"); 
require('dotenv').config();

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// 1. Serve the 'Public' folder
app.use(express.static("Public"));

// 2. FORCE THE SERVER TO LOAD YOUR SPECIFIC FILE
app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "Public", "Index.html"));
});

let onlineUsers = [];
let groups = []; 

io.on("connection", (socket) => {
    
    // LOGIN
    socket.on("login_request", (data) => {
        const sql = "SELECT * FROM users WHERE username = ? AND password = ?";
        db.query(sql, [data.username, data.password], (err, results) => {
            if (!err && results.length > 0) {
                const user = results[0];
                socket.username = user.username;
                socket.role = user.role; 
                
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

    // CREATE GROUP
    socket.on("create_group", (data) => {
        if(socket.role === 'admin') {
            groups.push({ name: data.name, limit: data.limit, creator: socket.username });
            io.emit("update_lists", { users: onlineUsers, groups: groups });
        }
    });

    // SEND MESSAGE
    socket.on("send_message", (data) => {
        if(data.type === 'group' && socket.role !== 'admin') {
            return; 
        }
        io.emit("receive_message", data); 
    });

    // DISCONNECT
    socket.on("disconnect", () => {
        onlineUsers = onlineUsers.filter(u => u !== socket.username);
        io.emit("update_lists", { users: onlineUsers, groups: groups });
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server Running on Port ${PORT}`));