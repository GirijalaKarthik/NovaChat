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
app.get("/", (req, res) => { res.sendFile(path.join(__dirname, "Public", "Index.html")); });

let onlineUsers = {}; // Maps Username -> Socket ID
let protectedGroups = {}; // Stores { groupName: { password, limit, members: [], admin } }

io.on("connection", (socket) => {
    
    // --- LOGIN & REGISTER WITH ROLE ---
    socket.on("login_request", (data) => {
        const sql = "SELECT * FROM users WHERE username = ? AND password = ?";
        db.query(sql, [data.username, data.password], (err, results) => {
            if (!err && results.length > 0) {
                const user = results[0];
                socket.username = user.username;
                socket.role = user.role;
                onlineUsers[user.username] = socket.id;
                
                socket.emit("login_response", { success: true, role: user.role, username: user.username });
                io.emit("update_lists", { users: Object.keys(onlineUsers), groups: Object.keys(protectedGroups) });
            } else { socket.emit("login_response", { success: false, msg: "Invalid Credentials" }); }
        });
    });

    socket.on("register_request", (data) => {
        const sql = "INSERT INTO users (username, password, role) VALUES (?, ?, ?)";
        db.query(sql, [data.username, data.password, data.role], (err) => {
            if (err) socket.emit("register_response", { success: false, msg: "Username Taken" });
            else socket.emit("register_response", { success: true, msg: "Success! Launch now." });
        });
    });

    // --- PROTECTED GROUPS (Admin Only) ---
    socket.on("create_group", (data) => {
        if (socket.role === 'admin') {
            protectedGroups[data.name] = { 
                password: data.password, 
                limit: data.limit, 
                members: [socket.username], 
                admin: socket.username 
            };
            io.emit("update_lists", { users: Object.keys(onlineUsers), groups: Object.keys(protectedGroups) });
            socket.emit("group_response", { success: true, msg: `Group ${data.name} Created!` });
        }
    });

    socket.on("join_group", (data) => {
        const group = protectedGroups[data.name];
        if (group.password === data.password) {
            if (group.members.length < group.limit) {
                if (!group.members.includes(socket.username)) group.members.push(socket.username);
                socket.emit("group_join_success", { name: data.name });
            } else { socket.emit("group_response", { success: false, msg: "Group Full!" }); }
        } else { socket.emit("group_response", { success: false, msg: "Wrong Password!" }); }
    });

    // --- PRIVATE & GROUP MESSAGING ---
    socket.on("send_message", (data) => {
        const { sender, msg, toUser, type } = data;
        const messageData = { sender, msg, toUser, type, role: socket.role, id: Date.now() };

        if (type === 'private') {
            if (onlineUsers[toUser]) io.to(onlineUsers[toUser]).emit("receive_message", messageData);
            socket.emit("receive_message", messageData);
        } else if (type === 'group') {
            // Only admin of that group can send messages
            if (protectedGroups[toUser] && protectedGroups[toUser].admin === sender) {
                io.emit("receive_message", messageData);
            }
        } else {
            io.emit("receive_message", messageData); // Public Bvrc
        }
    });

    socket.on("disconnect", () => {
        if (socket.username) {
            delete onlineUsers[socket.username];
            io.emit("update_lists", { users: Object.keys(onlineUsers), groups: Object.keys(protectedGroups) });
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Nebula Core Online: ${PORT}`));