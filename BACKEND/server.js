require("dotenv").config();

const crypto = require("crypto");
const express = require("express");
const cors = require("cors");
const mysql = require("mysql2");
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

const db = mysql.createConnection({
  host: process.env.DB_HOST || "localhost",
  user: process.env.DB_USER || "root",
  password: process.env.DB_PASSWORD || "",
  database: process.env.DB_NAME || "todo",
});

const memoryStore = {
  users: [],
  todos: [],
};

let useMemoryFallback = false;
let nextUserId = 1;
let nextTodoId = 1;

const initTables = (callback) => {
  const createUsersTable = `
    CREATE TABLE IF NOT EXISTS users (
      id INT AUTO_INCREMENT PRIMARY KEY,
      username VARCHAR(255) UNIQUE NOT NULL,
      email VARCHAR(255) UNIQUE NOT NULL,
      password VARCHAR(255) NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `;

  const createTodosTable = `
    CREATE TABLE IF NOT EXISTS todoItems (
      ID INT AUTO_INCREMENT PRIMARY KEY,
      itemDescription TEXT,
      category VARCHAR(255),
      completed TINYINT DEFAULT 0,
      user_id INT,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `;

  db.query(createUsersTable, (err) => {
    if (err) {
      return callback(err);
    }

    console.log("✅ Users table ready");
    db.query(createTodosTable, (todoTableError) => {
      if (todoTableError) {
        return callback(todoTableError);
      }

      console.log("✅ TodoItems table ready");
      callback(null);
    });
  });
};

const startServer = () => {
  const PORT = process.env.PORT || 5000;
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}${useMemoryFallback ? " (in-memory fallback mode)" : ""}`);
  });
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

    if (useMemoryFallback) {
      const existingUser = memoryStore.users.find(
        (user) => user.username === username || user.email === email
      );

      if (existingUser) {
        return res.status(400).json({
          error: "Username or Email already exists",
        });
      }

      const user = {
        id: nextUserId++,
        username,
        email,
        password: hashedPassword,
      };

      memoryStore.users.push(user);
      return res.json({
        message: "User registered successfully",
        userId: user.id,
      });
    }

    db.query(
      "INSERT INTO users (username, email, password) VALUES (?, ?, ?)",
      [username, email, hashedPassword],
      (err, result) => {
        if (err) {
          console.error("Register error:", err);
          if (err.code === "ER_DUP_ENTRY" || err.errno === 1062) {
            return res.status(400).json({
              error: "Username or Email already exists",
            });
          }
          return res.status(500).json({ error: err.message || "Registration failed" });
        }

        res.json({
          message: "User registered successfully",
          userId: result.insertId,
        });
      }
    );
  } catch (err) {
    res.status(500).json({
      error: "Server error",
    });
  }
});

// Login

app.post("/login", (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({
      error: "Username and password are required",
    });
  }

  if (useMemoryFallback) {
    const user = memoryStore.users.find((entry) => entry.username === username);

    if (!user) {
      return res.status(400).json({
        error: "User not found",
      });
    }

    return bcrypt.compare(password, user.password)
      .then((isValidPassword) => {
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

        return res.json({
          token,
          user: {
            id: user.id,
            username: user.username,
            email: user.email,
          },
        });
      })
      .catch((authError) => {
        console.error("Login authentication error:", authError);
        return res.status(500).json({ error: "Login failed due to a server error" });
      });
  }

  db.query(
    "SELECT * FROM users WHERE username = ?",
    [username],
    async (err, result) => {
      if (err) {
        console.error("Login query error:", err);
        return res.status(500).json({ error: err.message || "Login query failed" });
      }

      if (!result || result.length === 0) {
        return res.status(400).json({
          error: "User not found",
        });
      }

      const user = result[0];

      try {
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
      } catch (authError) {
        console.error("Login authentication error:", authError);
        res.status(500).json({ error: "Login failed due to a server error" });
      }
    }
  );
});

// Get todos

app.get("/", authenticateToken, (req, res) => {
  if (useMemoryFallback) {
    const todos = memoryStore.todos
      .filter((todo) => todo.user_id === req.user.id)
      .sort((a, b) => b.ID - a.ID);
    return res.json(todos);
  }

  db.query(
    "SELECT * FROM todoItems WHERE user_id = ? ORDER BY ID DESC",
    [req.user.id],
    (err, result) => {
      if (err) {
        console.error("Get todos error:", err);
        return res.status(500).json({ error: err.message || "Failed to fetch todos" });
      }

      res.json(result);
    }
  );
});

// Add todo

app.post("/add-item", authenticateToken, (req, res) => {
  const { text, category } = req.body;

  if (typeof text !== "string" || text.trim() === "") {
    return res.status(400).json({ error: "Todo text is required" });
  }

  const sanitizedText = text.trim();
  const normalizedCategory = category || "General";

  if (useMemoryFallback) {
    const todo = {
      ID: nextTodoId++,
      itemDescription: sanitizedText,
      category: normalizedCategory,
      completed: 0,
      user_id: req.user.id,
    };

    memoryStore.todos.push(todo);
    return res.json({
      message: "Todo added",
      id: todo.ID,
      itemDescription: sanitizedText,
      category: normalizedCategory,
      completed: 0,
      user_id: req.user.id,
    });
  }

  db.query(
    "INSERT INTO todoItems (itemDescription, category, user_id) VALUES (?, ?, ?)",
    [sanitizedText, normalizedCategory, req.user.id],
    (err, result) => {
      if (err) {
        console.error("Add-item error:", err);
        return res.status(500).json({ error: err.message || "Failed to add todo" });
      }

      res.json({
        message: "Todo added",
        id: result.insertId,
        itemDescription: sanitizedText,
        category: normalizedCategory,
        completed: 0,
        user_id: req.user.id,
      });
    }
  );
});

// Toggle complete

app.put("/toggle-complete/:id", authenticateToken, (req, res) => {
  const { completed } = req.body;
  const nextCompleted = completed ? 1 : 0;

  if (useMemoryFallback) {
    const todo = memoryStore.todos.find(
      (entry) => entry.ID === Number(req.params.id) && entry.user_id === req.user.id
    );

    if (!todo) {
      return res.status(404).json({ error: "Todo not found" });
    }

    todo.completed = nextCompleted;
    return res.json({
      message: "Updated",
      completed: nextCompleted,
    });
  }

  db.query(
    "UPDATE todoItems SET completed = ? WHERE ID = ? AND user_id = ?",
    [nextCompleted, req.params.id, req.user.id],
    (err) => {
      if (err) {
        console.error("Toggle-complete error:", err);
        return res.status(500).json({ error: err.message || "Failed to update status" });
      }

      res.json({
        message: "Updated",
        completed: nextCompleted,
      });
    }
  );
});

// Delete todo

app.delete("/delete-item/:id", authenticateToken, (req, res) => {
  if (useMemoryFallback) {
    const itemId = Number(req.params.id);
    const beforeLength = memoryStore.todos.length;
    memoryStore.todos = memoryStore.todos.filter(
      (todo) => !(todo.ID === itemId && todo.user_id === req.user.id)
    );

    if (memoryStore.todos.length === beforeLength) {
      return res.status(404).json({ error: "Todo not found" });
    }

    return res.json({ message: "Deleted" });
  }

  db.query(
    "DELETE FROM todoItems WHERE ID = ? AND user_id = ?",
    [req.params.id, req.user.id],
    (err) => {
      if (err) {
        console.error("Delete-item error:", err);
        return res.status(500).json({ error: err.message || "Failed to delete todo" });
      }

      res.json({
        message: "Deleted",
      });
    }
  );
});

// Temporary health check route for debugging database connectivity
app.get("/health", (req, res) => {
  if (useMemoryFallback) {
    return res.json({ status: "ok", db: "memory-fallback" });
  }

  db.query("SELECT 1", (err) => {
    if (err) {
      console.error("Health check DB error:", err);
      return res
        .status(500)
        .json({ status: "error", detail: err.message || err });
    }

    res.json({ status: "ok", db: "reachable" });
  });
});

const PORT = process.env.PORT || 5000;

db.connect((err) => {
  if (err) {
    console.warn("❌ Database connection failed:", err.message);
    console.warn("⚠️ Using in-memory fallback mode so the app can still run without MySQL.");
    useMemoryFallback = true;
    startServer();
    return;
  }

  console.log("✅ Connected to MySQL database");
  initTables((tableError) => {
    if (tableError) {
      console.error("❌ Database table initialization failed:", tableError.message);
      db.end(() => process.exit(1));
      return;
    }

    startServer();
  });
});
