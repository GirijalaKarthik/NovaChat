const mysql = require('mysql2');
require('dotenv').config();

let pool;

if (process.env.DB_URL) {
    console.log("☁️ Connecting to Cloud Database (Pool)...");
    pool = mysql.createPool({
        uri: process.env.DB_URL,
        waitForConnections: true,
        connectionLimit: 10,
        queueLimit: 0,
        multipleStatements: true,  // 👈 THIS FIXES THE TABLE CREATION ERROR
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
        queueLimit: 0,
        multipleStatements: true // 👈 Added here too just in case
    });
}

// Auto-Create Tables (Split into separate queries to be safe)
pool.getConnection((err, connection) => {
    if (err) {
        console.error('❌ Database Connection Failed:', err.message);
    } else {
        console.log('✅ Connected to MySQL Database!');
        
        // Query 1: Create Users Table
        const userTable = `
            CREATE TABLE IF NOT EXISTS users (
                id INT AUTO_INCREMENT PRIMARY KEY,
                username VARCHAR(255) NOT NULL,
                password VARCHAR(255) NOT NULL
            )`;

        // Query 2: Create Chats Table
        const chatTable = `
            CREATE TABLE IF NOT EXISTS chats (
                id INT AUTO_INCREMENT PRIMARY KEY,
                sender_name VARCHAR(255),
                message TEXT,
                to_user VARCHAR(255) DEFAULT 'Everyone',
                type VARCHAR(50) DEFAULT 'public',
                timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )`;

        connection.query(userTable, (err) => {
            if (err) console.error("❌ User Table Error:", err.message);
            else {
                console.log("✅ Users Table Checked!");
                connection.query(chatTable, (err) => {
                    if (err) console.error("❌ Chat Table Error:", err.message);
                    else console.log("✅ Chats Table Checked!");
                    connection.release();
                });
            }
        });
    }
});

module.exports = pool;