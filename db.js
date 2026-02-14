const mysql = require('mysql2');
require('dotenv').config();

// Create the connection pool using your Aiven URL
const pool = mysql.createPool({
    uri: process.env.DB_URL,
    ssl: { rejectUnauthorized: false },
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

const promisePool = pool.promise();

// We wrap the SQL in backticks (`) so JavaScript treats it as a string
async function initDB() {
    try {
        await promisePool.query(`
            CREATE TABLE IF NOT EXISTS users (
                id INT AUTO_INCREMENT PRIMARY KEY,
                username VARCHAR(255) NOT NULL UNIQUE,
                password VARCHAR(255) NOT NULL,
                role ENUM('admin', 'student') DEFAULT 'student'
            )
        `);

        await promisePool.query(`
            CREATE TABLE IF NOT EXISTS chats (
                id INT AUTO_INCREMENT PRIMARY KEY,
                sender_name VARCHAR(255),
                message TEXT,
                to_user VARCHAR(255) DEFAULT 'Everyone',
                type VARCHAR(50) DEFAULT 'public',
                timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        console.log("✅ Tables verified/created successfully.");
    } catch (err) {
        console.error("❌ Database initialization failed:", err.message);
    }
}

initDB();

module.exports = pool;