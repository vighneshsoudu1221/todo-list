require("dotenv").config();

const crypto = require("crypto");
const express = require("express");
const cors = require("cors");
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
const JWT_SECRET =
  rawJwtSecret.length >= 32
    ? rawJwtSecret
    : crypto.randomBytes(32).toString("hex");

if (!process.env.JWT_SECRET || process.env.JWT_SECRET.trim().length < 32) {
  console.warn(
    "JWT_SECRET missing or too short; generated a temporary secret for this session."
  );
}

// Support both PostgreSQL and MySQL
const isPostgres = Boolean(
  process.env.DATABASE_URL &&
    (process.env.DATABASE_URL.startsWith("postgres://") ||
      process.env.DATABASE_URL.startsWith("postgresql://"))
);

let dbPool;
if (isPostgres) {
  const { Pool } = require("pg");
  const isCloud =
    process.env.DATABASE_URL.includes("render.com") ||
    process.env.DATABASE_URL.includes("dpg-") ||
    process.env.NODE_ENV === "production";
  dbPool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: isCloud ? { rejectUnauthorized: false } : undefined,
  });
} else {
  const mysql = require("mysql2/promise");
  dbPool = mysql.createPool({
    host: process.env.DB_HOST || "localhost",
    user: process.env.DB_USER || "root",
    password: process.env.DB_PASSWORD || "",
    database: process.env.DB_NAME || "todo",
    port: Number(process.env.DB_PORT) || 3306,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
  });
}

// Unified query wrapper
const db = {
  isPostgres,
  async query(sql, params = []) {
    if (isPostgres) {
      let paramIndex = 1;
      const pgSql = sql.replace(/\?/g, () => `$${paramIndex++}`);
      const res = await dbPool.query(pgSql, params);
      return {
        rows: res.rows || [],
        insertId: res.rows?.[0]?.id,
      };
    } else {
      const mySql = sql.replace(/\$\d+/g, "?");
      const [res] = await dbPool.query(mySql, params);
      if (Array.isArray(res)) {
        return { rows: res, insertId: null };
      }
      return { rows: [], insertId: res.insertId };
    }
  },
  async end() {
    return dbPool.end();
  },
};

const initTables = async () => {
  if (isPostgres) {
    await db.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        username VARCHAR(255) UNIQUE NOT NULL,
        email VARCHAR(255) UNIQUE NOT NULL,
        password VARCHAR(255) NOT NULL,
        created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await db.query(`
      CREATE TABLE IF NOT EXISTS todo_items (
        id SERIAL PRIMARY KEY,
        item_description TEXT,
        category VARCHAR(255),
        completed BOOLEAN DEFAULT FALSE,
        user_id INTEGER,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `);
  } else {
    await db.query(`
      CREATE TABLE IF NOT EXISTS users (
        id INT AUTO_INCREMENT PRIMARY KEY,
        username VARCHAR(255) UNIQUE NOT NULL,
        email VARCHAR(255) UNIQUE NOT NULL,
        password VARCHAR(255) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await db.query(`
      CREATE TABLE IF NOT EXISTS todo_items (
        id INT AUTO_INCREMENT PRIMARY KEY,
        item_description TEXT,
        category VARCHAR(255),
        completed BOOLEAN DEFAULT FALSE,
        user_id INT,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `);
  }

  console.log("Database tables verified successfully");
};

const startServer = async () => {
  try {
    await db.query("SELECT 1");
    console.log(`Connected to ${isPostgres ? "PostgreSQL" : "MySQL"} database.`);
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
    const sql = isPostgres
      ? "INSERT INTO users (username, email, password) VALUES (?, ?, ?) RETURNING id"
      : "INSERT INTO users (username, email, password) VALUES (?, ?, ?)";

    const result = await db.query(sql, [username, email, hashedPassword]);
    const userId = result.insertId || result.rows?.[0]?.id;

    res.json({
      message: "User registered successfully",
      userId,
    });
  } catch (err) {
    console.error("Register error:", err);
    if (err.code === "23505" || err.code === "ER_DUP_ENTRY") {
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
      "SELECT * FROM users WHERE username = ?",
      [username]
    );

    if (!result.rows || result.rows.length === 0) {
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
      `SELECT id AS ID, item_description AS itemDescription,
              category, completed, user_id
       FROM todo_items
       WHERE user_id = ?
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
    const sql = isPostgres
      ? `INSERT INTO todo_items (item_description, category, user_id)
         VALUES (?, ?, ?)
         RETURNING id`
      : `INSERT INTO todo_items (item_description, category, user_id)
         VALUES (?, ?, ?)`;

    const result = await db.query(sql, [sanitizedText, normalizedCategory, req.user.id]);
    const newId = result.insertId || result.rows?.[0]?.id;

    res.json({
      message: "Todo added",
      id: newId,
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
      "UPDATE todo_items SET completed = ? WHERE id = ? AND user_id = ?",
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
      "DELETE FROM todo_items WHERE id = ? AND user_id = ?",
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
