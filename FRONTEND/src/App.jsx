import { useEffect, useMemo, useState } from "react";

const API_BASE = import.meta.env.DEV
  ? "http://localhost:5000"
  : import.meta.env.VITE_API_BASE || "https://todo-list-1-st3e.onrender.com";

const STORAGE_TOKEN = "todo_app_token";
const STORAGE_USER = "todo_app_user";

function App() {
  const [view, setView] = useState("login");
  const [user, setUser] = useState(() => {
    const saved = localStorage.getItem(STORAGE_USER);
    return saved ? JSON.parse(saved) : null;
  });
  const [token, setToken] = useState(() => localStorage.getItem(STORAGE_TOKEN));

  useEffect(() => {
    if (token && user) {
      setView("todolist");
    }
  }, [token, user]);

  const authHeaders = useMemo(
    () => ({ Authorization: `Bearer ${token}` }),
    [token],
  );

  const onLogin = ({ token, user }) => {
    localStorage.setItem(STORAGE_TOKEN, token);
    localStorage.setItem(STORAGE_USER, JSON.stringify(user));
    setToken(token);
    setUser(user);
    setView("todolist");
  };

  const onLogout = () => {
    localStorage.removeItem(STORAGE_TOKEN);
    localStorage.removeItem(STORAGE_USER);
    setToken(null);
    setUser(null);
    setView("login");
  };

  return (
    <div className="app-shell">
      {view === "login" && (
        <LoginForm onLogin={onLogin} onNavigate={() => setView("register")} />
      )}
      {view === "register" && (
        <RegisterForm onNavigate={() => setView("login")} />
      )}
      {view === "todolist" && token && user && (
        <TodoApp user={user} onLogout={onLogout} authHeaders={authHeaders} />
      )}
    </div>
  );
}

function LoginForm({ onLogin, onNavigate }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  const submit = async (event) => {
    event.preventDefault();
    setError("");

    if (!username || !password) {
      setError("Username and password are required.");
      return;
    }

    const response = await fetch(`${API_BASE}/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    });

    const data = await response.json();
    if (!response.ok) {
      setError(data.error || "Login failed.");
      return;
    }

    onLogin(data);
  };

  return (
    <div className="auth-card">
      <h1>Login</h1>
      <form onSubmit={submit}>
        <label>
          Username
          <input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
          />
        </label>
        <label>
          Password
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>
        <button type="submit">Login</button>
        {error && <div className="error">{error}</div>}
      </form>
      <p>
        New here?{" "}
        <button className="link-button" onClick={onNavigate}>
          Register
        </button>
      </p>
    </div>
  );
}

function RegisterForm({ onNavigate }) {
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const submit = async (event) => {
    event.preventDefault();
    setError("");
    setSuccess("");

    if (!username || !email || !password) {
      setError("All fields are required.");
      return;
    }

    const response = await fetch(`${API_BASE}/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, email, password }),
    });

    const data = await response.json();

    if (!response.ok) {
      setError(data.error || "Registration failed.");
      return;
    }

    setSuccess("Registration successful. Please login.");
  };

  return (
    <div className="auth-card">
      <h1>Register</h1>
      <form onSubmit={submit}>
        <label>
          Username
          <input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
          />
        </label>
        <label>
          Email
          <input value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        <label>
          Password
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>
        <button type="submit">Register</button>
        {error && <div className="error">{error}</div>}
        {success && <div className="success">{success}</div>}
      </form>
      <p>
        Already have an account?{" "}
        <button className="link-button" onClick={onNavigate}>
          Login
        </button>
      </p>
    </div>
  );
}

function TodoApp({ user, onLogout, authHeaders }) {
  const [todos, setTodos] = useState([]);
  const [text, setText] = useState("");
  const [category, setCategory] = useState("General");
  const [filter, setFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("All");
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState(null);
  const [addingTodo, setAddingTodo] = useState(false);
  const [deletingTodoId, setDeletingTodoId] = useState(null);

  const fetchTodos = async () => {
    setLoading(true);
    const response = await fetch(`${API_BASE}/`, {
      headers: authHeaders,
    });
    const data = await response.json();
    setTodos(Array.isArray(data) ? data : []);
    setLoading(false);
  };

  const showToast = (message, type = "success") => {
    setToast({ message, type });
    window.clearTimeout(window.toastTimeout);
    window.toastTimeout = window.setTimeout(() => setToast(null), 2400);
  };

  useEffect(() => {
    fetchTodos();
  }, []);

  const filteredTodos = todos.filter((todo) => {
    if (filter === "completed" && todo.completed != 1) return false;
    if (filter === "pending" && todo.completed == 1) return false;
    if (categoryFilter !== "All" && todo.category !== categoryFilter)
      return false;
    return true;
  });

  const addTodo = async (event) => {
    event.preventDefault();
    if (!text.trim()) return;

    setAddingTodo(true);
    try {
      const response = await fetch(`${API_BASE}/add-item`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders },
        body: JSON.stringify({ text: text.trim(), category }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        showToast(errorData.error || "Could not add todo", "danger");
      } else {
        showToast("Task added successfully", "success");
        setText("");
        fetchTodos();
      }
    } catch (error) {
      showToast("Network error adding task", "danger");
    } finally {
      setAddingTodo(false);
    }
  };

  const toggleComplete = async (todo) => {
    await fetch(`${API_BASE}/toggle-complete/${todo.ID}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", ...authHeaders },
      body: JSON.stringify({ completed: todo.completed ? 0 : 1 }),
    });
    fetchTodos();
  };

  const deleteTodo = async (todo) => {
    setDeletingTodoId(todo.ID);
    showToast("Removing task...", "danger");

    await new Promise((resolve) => setTimeout(resolve, 260));
    await fetch(`${API_BASE}/delete-item/${todo.ID}`, {
      method: "DELETE",
      headers: authHeaders,
    });
    setDeletingTodoId(null);
    showToast("Task deleted", "danger");
    fetchTodos();
  };

  return (
    <div className="todo-page">
      <header>
        <div>
          <h1>{user.username}'s Todo List</h1>
          <p>Keep your tasks organized and up to date.</p>
        </div>
        <button className="logout" onClick={onLogout}>
          Logout
        </button>
      </header>

      <form className="todo-form" onSubmit={addTodo}>
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Add a new task"
        />
        <select value={category} onChange={(e) => setCategory(e.target.value)}>
          <option>General</option>
          <option>Work</option>
          <option>Personal</option>
          <option>Shopping</option>
          <option>Urgent</option>
        </select>
        <button type="submit" className={addingTodo ? "loading" : ""}>
          {addingTodo ? "Adding..." : "Add"}
        </button>
      </form>

      <div className="filters">
        <button
          className={filter === "all" ? "active" : ""}
          onClick={() => setFilter("all")}
        >
          All
        </button>
        <button
          className={filter === "completed" ? "active" : ""}
          onClick={() => setFilter("completed")}
        >
          Completed
        </button>
        <button
          className={filter === "pending" ? "active" : ""}
          onClick={() => setFilter("pending")}
        >
          Pending
        </button>
        <select
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
        >
          <option>All</option>
          <option>General</option>
          <option>Work</option>
          <option>Personal</option>
          <option>Shopping</option>
          <option>Urgent</option>
        </select>
      </div>

      {loading ? (
        <div className="status">Loading...</div>
      ) : filteredTodos.length === 0 ? (
        <div className="status">No todos found</div>
      ) : (
        <ul className="todo-list">
          {filteredTodos.map((todo) => (
            <li
              key={todo.ID}
              className={[
                todo.completed ? "completed" : "",
                deletingTodoId === todo.ID ? "removing" : "",
              ]
                .filter(Boolean)
                .join(" ")}
            >
              <label>
                <input
                  type="checkbox"
                  checked={todo.completed == 1}
                  onChange={() => toggleComplete(todo)}
                />
                <span>{todo.itemDescription}</span>
              </label>
              <div>
                <span
                  className={`category-pill category-${(todo.category || "General").toLowerCase()}`}
                >
                  {todo.category || "General"}
                </span>
                <button onClick={() => deleteTodo(todo)}>Delete</button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default App;
