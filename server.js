const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");
const { customAlphabet } = require('nanoid');
const alphabet = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const nanoid = customAlphabet(alphabet, 6); // Generates codes like "X7Y2Z1"
const OpenAI = require("openai");
const bodyParser = require('body-parser');
require('dotenv').config();

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// --- AI CONFIGURATION ---
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

app.use(express.static("Public"));
app.use(bodyParser.json());

app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "Public", "Index.html"));
});

// --- MEMORY STORAGE (No Database needed for Spaces) ---
let spaces = {}; // Stores active rooms
let users = {};  // Maps socket ID to user info

// --- AI ENDPOINTS ---
app.post('/api/ai/summarize', async (req, res) => {
    try {
        const completion = await openai.chat.completions.create({
            messages: [
                { role: "system", content: "Summarize this chat conversation in 3 short bullet points." },
                { role: "user", content: req.body.chatHistory }
            ],
            model: "gpt-3.5-turbo",
        });
        res.json({ result: completion.choices[0].message.content });
    } catch (e) { res.status(500).json({ error: "AI Failed" }); }
});

app.post('/api/ai/suggest', async (req, res) => {
    try {
        const completion = await openai.chat.completions.create({
            messages: [
                { role: "system", content: `You are '${req.body.myName}'. Suggest a short, casual reply.` },
                { role: "user", content: req.body.chatHistory }
            ],
            model: "gpt-3.5-turbo",
            max_tokens: 60
        });
        res.json({ result: completion.choices[0].message.content.replace(/^"|"$/g, '') });
    } catch (e) { res.status(500).json({ error: "AI Failed" }); }
});

app.post('/api/ai/translate', async (req, res) => {
    try {
        const completion = await openai.chat.completions.create({
            messages: [
                { role: "system", content: "Translate this to English (or say 'Already English')." },
                { role: "user", content: req.body.text }
            ],
            model: "gpt-3.5-turbo",
            max_tokens: 60
        });
        res.json({ result: completion.choices[0].message.content });
    } catch (e) { res.status(500).json({ error: "AI Failed" }); }
});

// --- SOCKET LOGIC ---
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
            socket.emit("error_msg", "Invalid or Expired Code");
            return;
        }
        socket.join(code);
        users[socket.id] = { name: name, space: code };
        spaces[code].users.push({ id: socket.id, name: name });

        socket.emit("joined_success", { code: code, name: name });
        io.to(code).emit("update_user_list", spaces[code].users);
    });

    // 3. MESSAGING
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

    // 4. END SPACE
    socket.on("end_space", () => {
        const user = users[socket.id];
        if (user && spaces[user.space] && spaces[user.space].hostId === socket.id) {
            delete spaces[user.space]; // Code becomes invalid
            // Optionally notify clients here
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
server.listen(PORT, () => console.log(`NovaChat Spaces Online: ${PORT}`));