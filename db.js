const mysql = require('mysql2');
require('dotenv').config();

let pool;

if (process.env.DB_URL) {
    console.log("☁️ Connecting to Cloud Database (Pool)...");
    // 👇 FIX: Use 'createPool' instead of 'createConnection'
    pool = mysql.createPool({
        uri: process.env.DB_URL,
        waitForConnections: true,
        connectionLimit: 10, // Allows up to 10 users at once
        queueLimit: 0,
        ssl: {
            rejectUnauthorized: false
        }
    });
} else {
    console.log("💻 Connecting to Localhost...");
    pool = mysql.createPool({
        host: 'localhost',
        user: 'root',
        password: '',
        database: 'studentdb',
        waitForConnections: true,
        connectionLimit: 10,
        queueLimit: 0
    });
}

// Check connection (Optional, just for logs)
pool.getConnection((err, connection) => {
    if (err) {
        console.error('❌ Database Connection Failed:', err.message);
    } else {
        console.log('✅ Connected to MySQL Database!');
        
        // Auto-Create Tables
        const initSQL = `
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
        `;
        connection.query(initSQL, (err) => {
            if (err) console.error("❌ Table Error:", err.message);
            else console.log("✅ Tables checked/created!");
            connection.release(); // Always release the connection back to the pool
        });
    }
});

module.exports = pool;