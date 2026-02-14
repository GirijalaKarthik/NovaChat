const mysql = require('mysql2');
require('dotenv').config();

let pool;

// 1. Connection Setup
if (process.env.DB_URL) {
    console.log("☁️ Connecting to Cloud Database...");
    pool = mysql.createPool({
        uri: process.env.DB_URL,
        waitForConnections: true,
        connectionLimit: 5,
        multipleStatements: true,
        ssl: { rejectUnauthorized: false }
    });
} else {
    console.log("💻 Connecting to Localhost...");
    pool = mysql.createPool({
        host: 'localhost', user: 'root', password: '', database: 'studentdb',
        waitForConnections: true, connectionLimit: 5, multipleStatements: true
    });
}

const promisePool = pool.promise();

// 2. The Auto-Setup Function
async function initDB() {
    try {
        // A. Create Tables
        await promisePool.query(`
            CREATE TABLE IF NOT EXISTS users (
                id INT AUTO_INCREMENT PRIMARY KEY,
                username VARCHAR(255) NOT NULL,
                password VARCHAR(255) NOT NULL,
                role ENUM('admin', 'student') DEFAULT 'student'
            );
            CREATE TABLE IF NOT EXISTS chats (
                id INT AUTO_INCREMENT PRIMARY KEY,
                sender_name VARCHAR(255),
                message TEXT,
                to_user VARCHAR(255) DEFAULT 'Everyone',
                type VARCHAR(50) DEFAULT 'public',
                timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);

        // B. 👑 INJECT ADMINS (The New Part)
        // We check if Hod@mca exists first to avoid duplicates
        const [users] = await promisePool.query("SELECT * FROM users WHERE username = 'Hod@mca'");
        
        if (users.length === 0) {
            console.log("⚡ Injecting Admin Accounts...");
            await promisePool.query(`
                INSERT INTO users (username, password, role) VALUES 
                ('Hod@mca', 'novachat@123', 'admin'),
                ('Hod@btech', 'novachat@123', 'admin'),
                ('Hod@pharmacy', 'novachat@123', 'admin'),
                ('Hod@degree', 'novachat@123', 'admin');
            `);
            console.log("✅ Success! 4 HODs created.");
        } else {
            console.log("🛡️ Admins already exist. Skipping injection.");
        }

    } catch (err) {
        console.error("❌ Database Error:", err.message);
    }
}

initDB();
module.exports = pool;