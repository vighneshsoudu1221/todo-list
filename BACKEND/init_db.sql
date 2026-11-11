-- init_db.sql
-- Create required tables for the Todo app

CREATE TABLE IF NOT EXISTS users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  username VARCHAR(255) UNIQUE NOT NULL,
  email VARCHAR(255) UNIQUE NOT NULL,
  password VARCHAR(255) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS todoItems (
  ID INT AUTO_INCREMENT PRIMARY KEY,
  itemDescription TEXT,
  category VARCHAR(255),
  completed TINYINT DEFAULT 0,
  user_id INT,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
