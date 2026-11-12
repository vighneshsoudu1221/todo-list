require("dotenv").config();

const crypto = require("crypto");
const express = require("express");
const cors = require("cors");
const { Pool } = require("pg");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

const app = express();

app.use(cors());
app.use(express.json({ strict: true }));
app.use(express.urlencoded({ extended: true }));

app.use((err, req, res, next) => {
  if (err instanceof SyntaxError && err.status === 400 && "body" in err) {
    return res.status(400).json({ error: "Invalid JSON payload" });
  }

  next(err);
});

const rawJwtSecret = process.env.JWT_SECRET?.trim() || "";
const JWT_SECRET = rawJwtSecret.length >= 32 ? rawJwtSecret : crypto.randomBytes(32).toString("hex");

if (!process.env.JWT_SECRET || process.env.JWT_SECRET.trim().length < 32) {
  console.warn("JWT_SECRET missing or too short; generated a temporary secret for this session.");
}

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is required to connect to PostgreSQL");
}

const db = new Pool({
  connectionString: process.env.DATABASE_URL,
});

const initTables = async () => {
  const createUsersTable = `
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      username VARCHAR(255) UNIQUE NOT NULL,
      email VARCHAR(255) UNIQUE NOT NULL,
      password VARCHAR(255) NOT NULL,
      created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    )
  `;

  const createTodosTable = `
    CREATE TABLE IF NOT EXISTS todo_items (
      id SERIAL PRIMARY KEY,
      item_description TEXT,
      category VARCHAR(255),
      completed BOOLEAN DEFAULT FALSE,
      user_id INTEGER,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `;

  await db.query(createUsersTable);
  console.log("Users table ready");
  await db.query(createTodosTable);
  console.log("Todo items table ready");
};

const startServer = async () => {
  try {
    await db.query("SELECT 1");
    await initTables();

    const PORT = process.env.PORT || 5000;
    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
    });
  } catch (err) {
    console.error("Database startup failed:", err.message);
    await db.end();
    process.exitCode = 1;
  }
};

// Middleware

const authenticateToken = (req, res, next) => {
  const authHeader = req.headers["authorization"];

  const token = authHeader && authHeader.split(" ")[1];

  if (!token) {
    return res.status(401).json({
      error: "Access token required",
    });
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({
        error: "Invalid token",
      });
    }

    req.user = user;
    next();
  });
};

// Register

app.post("/register", async (req, res) => {
  const { username, email, password } = req.body;

  if (!username || !email || !password) {
    return res.status(400).json({
      error: "All fields (username, email, password) are required",
    });
  }

  try {
    const hashedPassword = await bcrypt.hash(password, 10);
    const result = await db.query(
      "INSERT INTO users (username, email, password) VALUES ($1, $2, $3) RETURNING id",
      [username, email, hashedPassword]
    );

    res.json({
      message: "User registered successfully",
      userId: result.rows[0].id,
    });
  } catch (err) {
    console.error("Register error:", err);
    if (err.code === "23505") {
      return res.status(400).json({
        error: "Username or Email already exists",
      });
    }

    res.status(500).json({
      error: "Registration failed",
    });
  }
});

// Login

app.post("/login", async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({
      error: "Username and password are required",
    });
  }

  try {
    const result = await db.query(
      "SELECT * FROM users WHERE username = $1",
      [username]
    );

    if (result.rows.length === 0) {
      return res.status(400).json({
        error: "User not found",
      });
    }

    const user = result.rows[0];
    const isValidPassword = await bcrypt.compare(password, user.password);

    if (!isValidPassword) {
      return res.status(400).json({
        error: "Invalid password",
      });
    }

    const token = jwt.sign(
      {
        id: user.id,
        username: user.username,
      },
      JWT_SECRET,
      {
        expiresIn: "24h",
      }
    );

    res.json({
      token,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
      },
    });
  } catch (err) {
    console.error("Login error:", err);
    res.status(500).json({ error: "Login failed due to a server error" });
  }
});

// Get todos

app.get("/", authenticateToken, async (req, res) => {
  try {
    const result = await db.query(
      `SELECT id AS "ID", item_description AS "itemDescription",
              category, completed, user_id
       FROM todo_items
       WHERE user_id = $1
       ORDER BY id DESC`,
      [req.user.id]
    );

    res.json(result.rows);
  } catch (err) {
    console.error("Get todos error:", err);
    res.status(500).json({ error: "Failed to fetch todos" });
  }
});

// Add todo

app.post("/add-item", authenticateToken, async (req, res) => {
  const { text, category } = req.body;

  if (typeof text !== "string" || text.trim() === "") {
    return res.status(400).json({ error: "Todo text is required" });
  }

  const sanitizedText = text.trim();
  const normalizedCategory = category || "General";

  try {
    const result = await db.query(
      `INSERT INTO todo_items (item_description, category, user_id)
       VALUES ($1, $2, $3)
       RETURNING id`,
      [sanitizedText, normalizedCategory, req.user.id]
    );

    res.json({
      message: "Todo added",
      id: result.rows[0].id,
      itemDescription: sanitizedText,
      category: normalizedCategory,
      completed: 0,
      user_id: req.user.id,
    });
  } catch (err) {
    console.error("Add-item error:", err);
    res.status(500).json({ error: "Failed to add todo" });
  }
});

// Toggle complete

app.put("/toggle-complete/:id", authenticateToken, async (req, res) => {
  const { completed } = req.body;
  const nextCompleted = Boolean(completed);

  try {
    await db.query(
      "UPDATE todo_items SET completed = $1 WHERE id = $2 AND user_id = $3",
      [nextCompleted, req.params.id, req.user.id]
    );

    res.json({
      message: "Updated",
      completed: nextCompleted,
    });
  } catch (err) {
    console.error("Toggle-complete error:", err);
    res.status(500).json({ error: "Failed to update status" });
  }
});

// Delete todo

app.delete("/delete-item/:id", authenticateToken, async (req, res) => {
  try {
    await db.query(
      "DELETE FROM todo_items WHERE id = $1 AND user_id = $2",
      [req.params.id, req.user.id]
    );

    res.json({ message: "Deleted" });
  } catch (err) {
    console.error("Delete-item error:", err);
    res.status(500).json({ error: "Failed to delete todo" });
  }
});

app.get("/health", async (req, res) => {
  try {
    await db.query("SELECT 1");
    res.json({ status: "ok", db: "reachable" });
  } catch (err) {
    console.error("Health check DB error:", err);
    res.status(500).json({ status: "error", db: "unreachable" });
  }
});

startServer();
