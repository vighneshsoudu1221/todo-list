require("dotenv").config();

const express = require("express");

const cors = require("cors");

const mysql = require("mysql2");

const bcrypt = require("bcrypt");

const jwt = require("jsonwebtoken");

const path = require("path");

const app = express();

app.use(cors()); // Enable CORS

app.use(express.json()); // for JSON data

app.use(express.urlencoded({ extended: true })); // for form data

const JWT_SECRET = process.env.JWT_SECRET || "your_jwt_secret_key"; // In production, use environment variables

const db = mysql.createConnection({
  host: process.env.DB_HOST || "localhost",
  user: process.env.DB_USER || "root",
  password: process.env.DB_PASSWORD || "@vighnesh@",
  database: process.env.DB_NAME || "todo",
});

db.connect((err) => {
  if (err) {
    console.log("Database connection failed:", err);

    return;
  }

  console.log("✅ Connected to MySQL database");

  // Create tables if not exist

  db.query(
    `

CREATE TABLE IF NOT EXISTS users (

  id INT AUTO_INCREMENT PRIMARY KEY,

  username VARCHAR(255) UNIQUE NOT NULL,

  email VARCHAR(255) UNIQUE NOT NULL,

  password VARCHAR(255) NOT NULL,

  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP

)

`,

    (err) => {
      if (err) console.log("Error creating users table:", err);
    },
  );

  db.query(
    `

CREATE TABLE IF NOT EXISTS todoItems (

  ID INT AUTO_INCREMENT PRIMARY KEY,

  itemDescription TEXT,

  category VARCHAR(255),

  completed TINYINT DEFAULT 0,

  user_id INT,

  FOREIGN KEY (user_id) REFERENCES users(id)

)

`,

    (err) => {
      if (err) console.log("Error creating todoItems table:", err);
    },
  );

  // Ensure email column exists on users table (in case table was created earlier without it)

  db.query("SHOW COLUMNS FROM users LIKE 'email'", (err, results) => {
    if (err) {
      console.log("Error checking users table columns:", err);

      return;
    }

    if (!results || results.length === 0) {
      db.query(
        "ALTER TABLE users ADD COLUMN email VARCHAR(255) UNIQUE",

        (alterErr) => {
          if (alterErr)
            console.log("Error adding email column to users:", alterErr);
          else console.log("Added email column to users table");
        },
      );
    }
  });
});

// Middleware to verify JWT

const authenticateToken = (req, res, next) => {
  const authHeader = req.headers["authorization"];

  const token = authHeader && authHeader.split(" ")[1];

  if (!token) return res.status(401).json({ error: "Access token required" });

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ error: "Invalid token" });

    req.user = user;

    next();
  });
};

const isProduction = process.env.NODE_ENV === "production";
const frontendDistPath = path.join(__dirname, "../FRONTEND/dist");

if (isProduction) {
  app.use(express.static(frontendDistPath));
}

// User registration

app.post("/register", async (req, res) => {
  console.log("Register request:", req.body);

  const { username, email, password } = req.body;

  if (!username || !email || !password) {
    console.log("Missing fields");

    return res.status(400).json({ error: "All fields required" });
  }

  try {
    const hashedPassword = await bcrypt.hash(password, 10);

    console.log("Hashed password, inserting user");

    db.query(
      "INSERT INTO users (username, email, password) VALUES (?, ?, ?)",

      [username, email, hashedPassword],

      (err, result) => {
        if (err) {
          console.log("Insert error:", err);

          if (err.code === "ER_DUP_ENTRY") {
            return res

              .status(400)

              .json({ error: "Username or email already exists" });
          }

          return res.status(500).send(err);
        }

        console.log("User registered:", result);

        res.json({ message: "User registered successfully" });
      },
    );
  } catch (err) {
    console.log("Hash error:", err);

    res.status(500).json({ error: "Server error" });
  }
});

// User login

app.post("/login", (req, res) => {
  console.log("Login request:", req.body);

  const { username, password } = req.body;

  if (!username || !password) {
    console.log("Missing username or password");

    return res.status(400).json({ error: "Username and password required" });
  }

  db.query(
    "SELECT * FROM users WHERE username = ?",

    [username],

    async (err, result) => {
      if (err) {
        console.log("Query error:", err);

        return res.status(500).send(err);
      }

      if (result.length === 0) {
        console.log("User not found");

        return res.status(400).json({ error: "User not found" });
      }

      const user = result[0];

      console.log("User found, checking password");

      const isValidPassword = await bcrypt.compare(password, user.password);

      if (!isValidPassword) {
        console.log("Invalid password");

        return res.status(400).json({ error: "Invalid password" });
      }

      console.log("Login successful, generating token");

      const token = jwt.sign(
        { id: user.id, username: user.username },

        JWT_SECRET,

        { expiresIn: "24h" },
      );

      res.json({
        token,

        user: { id: user.id, username: user.username, email: user.email },
      });
    },
  );
});

app.get("/", authenticateToken, (req, res) => {
  db.query(
    "SELECT * FROM todoItems WHERE user_id = ? ORDER BY ID DESC",

    [req.user.id],

    (err, result) => {
      if (err) return res.status(500).send(err);

      res.json(result);
    },
  );
});

// Add new todo (with category)

app.post("/add-item", authenticateToken, (req, res) => {
  const { text, category } = req.body;

  if (!text || text.trim() === "") {
    return res.status(400).json({ error: "Text required" });
  }

  db.query(
    "INSERT INTO todoItems (itemDescription, category, user_id) VALUES (?, ?, ?)",

    [text, category || "General", req.user.id],

    (err, result) => {
      if (err) return res.status(500).send(err);

      res.json({ message: "Todo added", id: result.insertId });
    },
  );
});

// Update todo (text + category)

app.put("/update-item/:id", authenticateToken, (req, res) => {
  const id = req.params.id;

  const { text, category } = req.body;

  if (!text || text.trim() === "") {
    return res.status(400).json({ error: "Text required" });
  }

  db.query(
    "UPDATE todoItems SET itemDescription = ?, category = ? WHERE ID = ? AND user_id = ?",

    [text, category || "General", id, req.user.id],

    (err, result) => {
      if (err) return res.status(500).send(err);

      res.json({ message: "Todo updated" });
    },
  );
});

// Toggle completed state

app.put("/toggle-complete/:id", authenticateToken, (req, res) => {
  const id = req.params.id;

  const { completed } = req.body;

  db.query(
    "UPDATE todoItems SET completed = ? WHERE ID = ? AND user_id = ?",

    [completed ? 1 : 0, id, req.user.id],

    (err, result) => {
      if (err) return res.status(500).send(err);

      res.json({ message: "Updated completed state" });
    },
  );
});

// Delete a todo

app.delete("/delete-item/:id", authenticateToken, (req, res) => {
  const id = req.params.id;

  db.query(
    "DELETE FROM todoItems WHERE ID = ? AND user_id = ?",

    [id, req.user.id],

    (err, result) => {
      if (err) return res.status(500).send(err);

      res.json({ message: "Todo deleted" });
    },
  );
});

if (isProduction) {
  app.get("*", (req, res) => {
    res.sendFile(path.join(frontendDistPath, "index.html"));
  });
}

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log("Registered routes:");
  const stack = app._router?.stack || [];
  stack.forEach((middleware) => {
    if (middleware.route) {
      const method = Object.keys(middleware.route.methods)[0].toUpperCase();
      console.log(`${method} ${middleware.route.path}`);
    }
  });
});
