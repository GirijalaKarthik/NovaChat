-- Users Table
CREATE TABLE IF NOT EXISTS users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(255) NOT NULL UNIQUE,
    password VARCHAR(255) NOT NULL,
    role ENUM('admin', 'student') DEFAULT 'student'
);

-- Chats Table
CREATE TABLE IF NOT EXISTS chats (
    id INT AUTO_INCREMENT PRIMARY KEY,
    sender_name VARCHAR(255),
    message TEXT,
    to_user VARCHAR(255) DEFAULT 'Everyone',
    type VARCHAR(50) DEFAULT 'public',
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);