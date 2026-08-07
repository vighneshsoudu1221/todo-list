require("dotenv").config();

const express = require("express");
const cors = require("cors");
const mysql = require("mysql2");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const JWT_SECRET = process.env.JWT_SECRET || "your_jwt_secret_key";

const db = mysql.createConnection({
  host: process.env.DB_HOST || "localhost",
  user: process.env.DB_USER || "root",
  password: process.env.DB_PASSWORD || "",
  database: process.env.DB_NAME || "todo",
});

db.connect((err) => {
  if (err) {
    console.log("Database connection failed:", err);
    return;
  }

  console.log("✅ Connected to MySQL database");
});

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
      error: "All fields required",
    });
  }

  try {
    const hashedPassword = await bcrypt.hash(password, 10);

    db.query(
      "INSERT INTO users (username, email, password) VALUES (?, ?, ?)",
      [username, email, hashedPassword],
      (err) => {
        if (err) {
          return res.status(500).json(err);
        }

        res.json({
          message: "User registered successfully",
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

  db.query(
    "SELECT * FROM users WHERE username = ?",
    [username],
    async (err, result) => {
      if (err) {
        return res.status(500).json(err);
      }

      if (result.length === 0) {
        return res.status(400).json({
          error: "User not found",
        });
      }

      const user = result[0];

      const isValidPassword = await bcrypt.compare(
        password,
        user.password
      );

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
    }
  );
});

// Get todos

app.get("/", authenticateToken, (req, res) => {
  db.query(
    "SELECT * FROM todoItems WHERE user_id = ? ORDER BY ID DESC",
    [req.user.id],
    (err, result) => {
      if (err) {
        return res.status(500).json(err);
      }

      res.json(result);
    }
  );
});

// Add todo

app.post("/add-item", authenticateToken, (req, res) => {
  const { text, category } = req.body;

  db.query(
    "INSERT INTO todoItems (itemDescription, category, user_id) VALUES (?, ?, ?)",
    [text, category || "General", req.user.id],
    (err, result) => {
      if (err) {
        return res.status(500).json(err);
      }

      res.json({
        message: "Todo added",
        id: result.insertId,
      });
    }
  );
});

// Toggle complete

app.put("/toggle-complete/:id", authenticateToken, (req, res) => {
  const { completed } = req.body;

  db.query(
    "UPDATE todoItems SET completed = ? WHERE ID = ? AND user_id = ?",
    [completed ? 1 : 0, req.params.id, req.user.id],
    (err) => {
      if (err) {
        return res.status(500).json(err);
      }

      res.json({
        message: "Updated",
      });
    }
  );
});

// Delete todo

app.delete("/delete-item/:id", authenticateToken, (req, res) => {
  db.query(
    "DELETE FROM todoItems WHERE ID = ? AND user_id = ?",
    [req.params.id, req.user.id],
    (err) => {
      if (err) {
        return res.status(500).json(err);
      }

      res.json({
        message: "Deleted",
      });
    }
  );
});

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});