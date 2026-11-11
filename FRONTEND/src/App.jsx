import { useEffect, useMemo, useState } from "react";

const API_BASE = (
  import.meta.env.VITE_API_BASE_URL ||
  (import.meta.env.DEV ? "http://localhost:5000" : "https://todo-list-moy3.onrender.com")
).replace(/\/+$/, "");

const STORAGE_TOKEN = "todo_app_token";
const STORAGE_USER = "todo_app_user";

const CATEGORIES = ["General", "Work", "Personal", "Shopping", "Urgent"];
const isTodoCompleted = (completed) =>
  completed === true || completed === 1 || completed === "1";

function App() {
  const [view, setView] = useState("login");
  const [user, setUser] = useState(() => {
    const saved = localStorage.getItem(STORAGE_USER);
    return saved ? JSON.parse(saved) : null;
  });

  const [token, setToken] = useState(
    () => localStorage.getItem(STORAGE_TOKEN)
  );

  useEffect(() => {
    if (token && user) {
      setView("todolist");
    }
  }, [token, user]);

  const authHeaders = useMemo(
    () => ({
      "Content-Type": "application/json",
      Authorization: token ? "Bearer " + token : "",
    }),
    [token]
  );

  const onLogin = ({ token, user }) => {
    localStorage.setItem(STORAGE_TOKEN, token);
    localStorage.setItem(STORAGE_USER, JSON.stringify(user));

    setToken(token);
    setUser(user);
    setView("todolist");
  };

  const logout = () => {
    localStorage.clear();
    setUser(null);
    setToken(null);
    setView("login");
  };

  return (
    <div className="app-shell">
      {view === "login" && (
        <Login onLogin={onLogin} onNavigate={() => setView("register")} />
      )}

      {view === "register" && (
        <Register onNavigate={() => setView("login")} />
      )}

      {view === "todolist" && (
        <TodoPage user={user} logout={logout} authHeaders={authHeaders} />
      )}
    </div>
  );
}

function Login({ onLogin, onNavigate }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError("");

    if (!username || !password) {
      setError("Please fill in all fields");
      return;
    }

    setLoading(true);
    try {
      const response = await fetch(`${API_BASE}/login`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ username, password }),
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        setError(
          typeof data.error === "string"
            ? data.error
            : "Login failed. Check the backend service logs."
        );
        return;
      }

      if (!data.token || !data.user) {
        setError("The backend returned an invalid login response.");
        return;
      }

      onLogin(data);
    } catch (err) {
      setError("Failed to connect to server. Ensure backend is running.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-card">
      <div className="auth-header">
        <h1>Welcome Back</h1>
        <p className="auth-subtitle">Sign in to manage your daily tasks</p>
      </div>

      <form onSubmit={submit}>
        <div className="input-group">
          <label>Username</label>
          <input
            type="text"
            placeholder="Enter your username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
          />
        </div>

        <div className="input-group">
          <label>Password</label>
          <input
            type="password"
            placeholder="Enter your password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>

        {error && <div className="error-badge">{error}</div>}

        <button type="submit" disabled={loading} className="btn-primary">
          {loading ? "Signing in..." : "Login"}
        </button>
      </form>

      <div className="auth-footer">
        <span>Don't have an account?</span>
        <button
          className="link-button"
          onClick={onNavigate}
          type="button"
        >
          Create one
        </button>
      </div>
    </div>
  );
}

function Register({ onNavigate }) {
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    setSuccess("");

    if (!username || !email || !password) {
      setError("Please fill in all fields");
      return;
    }

    setLoading(true);
    try {
      const response = await fetch(`${API_BASE}/register`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ username, email, password }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error || "Registration failed");
        setLoading(false);
        return;
      }

      setSuccess("Account created successfully! Redirecting to login...");
      setTimeout(() => {
        onNavigate();
      }, 1500);
    } catch (err) {
      setError("Failed to connect to backend server.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-card">
      <div className="auth-header">
        <h1>Create Account</h1>
        <p className="auth-subtitle">Get started with your free account</p>
      </div>

      <form onSubmit={submit}>
        <div className="input-group">
          <label>Username</label>
          <input
            type="text"
            placeholder="Choose a username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
          />
        </div>

        <div className="input-group">
          <label>Email</label>
          <input
            type="email"
            placeholder="Enter your email address"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>

        <div className="input-group">
          <label>Password</label>
          <input
            type="password"
            placeholder="Choose a strong password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>

        {error && <div className="error-badge">{error}</div>}
        {success && <div className="success-badge">{success}</div>}

        <button type="submit" disabled={loading} className="btn-primary">
          {loading ? "Creating account..." : "Register"}
        </button>
      </form>

      <div className="auth-footer">
        <span>Already have an account?</span>
        <button
          className="link-button"
          onClick={onNavigate}
          type="button"
        >
          Sign In
        </button>
      </div>
    </div>
  );
}

function TodoPage({ user, logout, authHeaders }) {
  const [todos, setTodos] = useState([]);
  const [text, setText] = useState("");
  const [category, setCategory] = useState("General");
  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState("All");
  const [statusFilter, setStatusFilter] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const fetchTodos = async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`${API_BASE}/`, {
        headers: authHeaders,
      });

      if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
          logout();
          return;
        }
        throw new Error("Failed to fetch todos");
      }

      const data = await response.json();
      setTodos(Array.isArray(data) ? data : []);
    } catch (err) {
      setError("Could not load tasks from server.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTodos();
  }, []);

  const addTodo = async (e) => {
    e.preventDefault();
    if (!text.trim()) return;

    try {
      const response = await fetch(`${API_BASE}/add-item`, {
        method: "POST",
        headers: authHeaders,
        body: JSON.stringify({ text: text.trim(), category }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error || "Failed to add todo");
        return;
      }

      setText("");
      fetchTodos();
    } catch (err) {
      setError("Error creating task.");
    }
  };

  const toggleComplete = async (id, currentCompleted) => {
    const newStatus = isTodoCompleted(currentCompleted) ? 0 : 1;
    // Optimistic UI update
    setTodos((prev) =>
      prev.map((t) => (t.ID === id ? { ...t, completed: newStatus } : t))
    );

    try {
      const response = await fetch(`${API_BASE}/toggle-complete/${id}`, {
        method: "PUT",
        headers: authHeaders,
        body: JSON.stringify({ completed: newStatus }),
      });

      if (!response.ok) {
        fetchTodos(); // rollback on error
      }
    } catch (err) {
      fetchTodos();
    }
  };

  const deleteTodo = async (id) => {
    // Optimistic delete
    setTodos((prev) => prev.filter((t) => t.ID !== id));

    try {
      const response = await fetch(`${API_BASE}/delete-item/${id}`, {
        method: "DELETE",
        headers: authHeaders,
      });

      if (!response.ok) {
        fetchTodos();
      }
    } catch (err) {
      fetchTodos();
    }
  };

  const filteredTodos = useMemo(() => {
    return todos.filter((todo) => {
      const matchesSearch = todo.itemDescription
        .toLowerCase()
        .includes(searchQuery.toLowerCase());
      const matchesCategory =
        selectedCategoryFilter === "All" ||
        todo.category === selectedCategoryFilter;
      const completed = isTodoCompleted(todo.completed);
      const matchesStatus =
        statusFilter === "all"
          ? true
          : statusFilter === "active"
          ? !completed
          : completed;

      return matchesSearch && matchesCategory && matchesStatus;
    });
  }, [todos, searchQuery, selectedCategoryFilter, statusFilter]);

  const totalCount = todos.length;
  const completedCount = todos.filter((t) => isTodoCompleted(t.completed)).length;
  const activeCount = totalCount - completedCount;

  return (
    <div className="dashboard-container">
      {/* Top Header Navigation */}
      <header className="dashboard-header">
        <div className="user-brand">
          <div className="avatar">
            {user?.username ? user.username[0].toUpperCase() : "U"}
          </div>
          <div>
            <h2>Hello, {user?.username || "User"} 👋</h2>
            <p className="text-muted">Stay organized and get things done</p>
          </div>
        </div>

        <button onClick={logout} className="btn-logout">
          Logout
        </button>
      </header>

      {/* Stats Counter Bar */}
      <div className="stats-row">
        <div className="stat-card">
          <span className="stat-label">Total Tasks</span>
          <span className="stat-value">{totalCount}</span>
        </div>
        <div className="stat-card">
          <span className="stat-label">Active</span>
          <span className="stat-value active-val">{activeCount}</span>
        </div>
        <div className="stat-card">
          <span className="stat-label">Completed</span>
          <span className="stat-value completed-val">{completedCount}</span>
        </div>
      </div>

      {/* Add Task Form Card */}
      <div className="card add-task-card">
        <h3>Create New Task</h3>
        <form onSubmit={addTodo} className="add-task-form">
          <input
            type="text"
            placeholder="What needs to be done?"
            value={text}
            onChange={(e) => setText(e.target.value)}
            className="input-text"
          />
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="select-category"
          >
            {CATEGORIES.map((cat) => (
              <option key={cat} value={cat}>
                {cat}
              </option>
            ))}
          </select>
          <button type="submit" className="btn-add">
            + Add Task
          </button>
        </form>
      </div>

      {/* Filters & Controls */}
      <div className="controls-row">
        <input
          type="text"
          placeholder="🔍 Search tasks..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="search-input"
        />

        <div className="filter-group">
          {["All", ...CATEGORIES].map((cat) => (
            <button
              key={cat}
              className={`pill-btn ${
                selectedCategoryFilter === cat ? "active" : ""
              }`}
              onClick={() => setSelectedCategoryFilter(cat)}
            >
              {cat}
            </button>
          ))}
        </div>

        <div className="status-tabs">
          <button
            className={`tab-btn ${statusFilter === "all" ? "active" : ""}`}
            onClick={() => setStatusFilter("all")}
          >
            All
          </button>
          <button
            className={`tab-btn ${statusFilter === "active" ? "active" : ""}`}
            onClick={() => setStatusFilter("active")}
          >
            Active
          </button>
          <button
            className={`tab-btn ${
              statusFilter === "completed" ? "active" : ""
            }`}
            onClick={() => setStatusFilter("completed")}
          >
            Completed
          </button>
        </div>
      </div>

      {error && <div className="error-badge mb-15">{error}</div>}

      {/* Tasks List */}
      <div className="card task-list-card">
        {loading ? (
          <div className="empty-state">Loading tasks...</div>
        ) : filteredTodos.length === 0 ? (
          <div className="empty-state">
            <span className="empty-icon">📝</span>
            <p>No tasks found</p>
            <span className="text-muted">
              {todos.length === 0
                ? "Add your first task above to get started!"
                : "Try adjusting your filters or search terms."}
            </span>
          </div>
        ) : (
          <ul className="todo-list">
            {filteredTodos.map((todo) => (
              <li
                key={todo.ID}
                className={`todo-item ${
                  isTodoCompleted(todo.completed) ? "completed" : ""
                }`}
              >
                <label className="checkbox-container">
                  <input
                    type="checkbox"
                    checked={isTodoCompleted(todo.completed)}
                    onChange={() => toggleComplete(todo.ID, todo.completed)}
                  />
                  <span className="checkmark"></span>
                </label>

                <div className="todo-content">
                  <span className="todo-text">{todo.itemDescription}</span>
                  <span className={`category-tag tag-${todo.category?.toLowerCase() || "general"}`}>
                    {todo.category || "General"}
                  </span>
                </div>

                <button
                  className="btn-delete"
                  onClick={() => deleteTodo(todo.ID)}
                  title="Delete task"
                >
                  ✕
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

export default App;
