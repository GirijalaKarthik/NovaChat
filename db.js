const mysql = require('mysql2');
require('dotenv').config();

let pool;

// 1. Setup Connection
if (process.env.DB_URL) {
    console.log("☁️ Connecting to Cloud Database...");
    pool = mysql.createPool({
        uri: process.env.DB_URL,
        waitForConnections: true,
        connectionLimit: 5,
        multipleStatements: true, // Critical for running multiple queries!
        ssl: { rejectUnauthorized: false }
    });
} else {
    console.log("💻 Connecting to Localhost...");
    pool = mysql.createPool({
        host: 'localhost',
        user: 'root',
        password: '',
        database: 'studentdb',
        waitForConnections: true,
        connectionLimit: 5,
        multipleStatements: true
    });
}

// 2. The "Auto-Upgrade" Function
const promisePool = pool.promise();

async function initDB() {
    try {
        // A. Basic Tables
        await promisePool.query(`
            CREATE TABLE IF NOT EXISTS users (
                id INT AUTO_INCREMENT PRIMARY KEY,
                username VARCHAR(255) NOT NULL,
                password VARCHAR(255) NOT NULL
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

        // B. Add Roles (Admin/Student)
        try {
            await promisePool.query("ALTER TABLE users ADD COLUMN role ENUM('admin', 'student') DEFAULT 'student'");
            console.log("✅ Database Upgraded: Added 'role' column.");
        } catch (err) {
            // Ignore error if column already exists
        }

        // C. Create Group & File Tables
        await promisePool.query(`
            CREATE TABLE IF NOT EXISTS groups (
                id INT AUTO_INCREMENT PRIMARY KEY,
                name VARCHAR(255) NOT NULL UNIQUE,
                description TEXT,
                created_by INT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
            CREATE TABLE IF NOT EXISTS group_members (
                id INT AUTO_INCREMENT PRIMARY KEY,
                user_id INT,
                group_id INT,
                joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(user_id, group_id)
            );
            CREATE TABLE IF NOT EXISTS files (
                id INT AUTO_INCREMENT PRIMARY KEY,
                group_id INT,
                uploader_id INT,
                file_name VARCHAR(255),
                file_url TEXT,
                uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);
        console.log("✅ Group & File Tables Checked.");

        // D. Promote YOU to Admin (Run every time just in case)
        // 👇👇 CHANGE 'Deva' TO YOUR USERNAME IF NEEDED 👇👇
        const [result] = await promisePool.query("UPDATE users SET role = 'admin' WHERE username = 'Deva'");
        if (result.affectedRows > 0) console.log("👑 Admin Check: User 'Deva' is an Admin.");

    } catch (err) {
        console.error("❌ Database Init Error:", err.message);
    }
}

// Run the upgrade instantly
initDB();

module.exports = pool;