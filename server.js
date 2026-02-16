const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");
const { customAlphabet } = require('nanoid');
const alphabet = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const nanoid = customAlphabet(alphabet, 6); 

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static("Public"));

app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "Public", "Index.html"));
});

// --- SPACE MANAGEMENT ---
let spaces = {}; 
let users = {}; 

io.on("connection", (socket) => {

    // 1. CREATE SPACE
    socket.on("create_space", (name) => {
        const code = nanoid();
        spaces[code] = { hostId: socket.id, users: [] };
        socket.join(code);
        
        users[socket.id] = { name: name, space: code };
        spaces[code].users.push({ id: socket.id, name: name });

        socket.emit("space_created", { code: code, name: name });
        io.to(code).emit("update_user_list", spaces[code].users);
    });

    // 2. JOIN SPACE
    socket.on("join_space", ({ name, code }) => {
        if (!spaces[code]) {
            socket.emit("error_msg", "Invalid or Expired Space Code");
            return;
        }
        socket.join(code);
        users[socket.id] = { name: name, space: code };
        spaces[code].users.push({ id: socket.id, name: name });

        socket.emit("joined_success", { code: code, name: name });
        io.to(code).emit("update_user_list", spaces[code].users);
    });

    // 3. SEND MESSAGE
    socket.on("send_message", (data) => {
        const user = users[socket.id];
        if (!user) return;

        const messageData = { 
            sender: user.name, 
            msg: data.msg, 
            toUser: data.toUser, 
            isPrivate: data.toUser !== "Everyone",
            id: Date.now() 
        };

        if (data.toUser === "Everyone") {
            io.to(user.space).emit("receive_message", messageData);
        } else {
            const recipient = spaces[user.space].users.find(u => u.name === data.toUser);
            if (recipient) {
                io.to(recipient.id).emit("receive_message", messageData); 
                socket.emit("receive_message", messageData); 
            }
        }
    });

    // 4. END SPACE (NEW FEATURE)
    socket.on("end_space", () => {
        const user = users[socket.id];
        if (user && spaces[user.space] && spaces[user.space].hostId === socket.id) {
            // Delete the space so code becomes invalid
            delete spaces[user.space]; 
            // Optional: You could emit an event here to kick everyone out, 
            // but for now we just make the code invalid for new joins.
        }
    });

    // 5. DISCONNECT
    socket.on("disconnect", () => {
        const user = users[socket.id];
        if (user) {
            const spaceCode = user.space;
            if (spaces[spaceCode]) {
                spaces[spaceCode].users = spaces[spaceCode].users.filter(u => u.id !== socket.id);
                if (spaces[spaceCode].users.length === 0) {
                    delete spaces[spaceCode];
                } else {
                    io.to(spaceCode).emit("update_user_list", spaces[spaceCode].users);
                }
            }
            delete users[socket.id];
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`NovaChat Spaces Running on ${PORT}`));