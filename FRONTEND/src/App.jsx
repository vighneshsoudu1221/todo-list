import { useEffect, useMemo, useState } from "react";

const API_BASE = import.meta.env.DEV
  ? "http://localhost:5000"
  : "https://todo-list-moy3.onrender.com";

const STORAGE_TOKEN = "todo_app_token";
const STORAGE_USER = "todo_app_user";

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
      Authorization: `Bearer ${token}`,
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

  const submit = async (e) => {
    e.preventDefault();

    const response = await fetch(`${API_BASE}/login`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ username, password }),
    });

    const data = await response.json();

    if (!response.ok) {
      setError(data.error);
      return;
    }

    onLogin(data);
  };

  return (
    <div className="auth-card">
      <h1>Login</h1>

      <form onSubmit={submit}>
        <label>Username</label>

        <input
          type="text"
          placeholder="Enter username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
        />

        <label>Password</label>

        <input
          type="password"
          placeholder="Enter password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />

        <button type="submit">Login</button>

        {error && <div className="error">{error}</div>}
      </form>

      <p>
        New here?
        <button
          className="link-button"
          onClick={onNavigate}
          type="button"
        >
          Register
        </button>
      </p>
    </div>
  );
}

function Register({ onNavigate }) {
  return (
    <div className="auth-card">
      <h1>Register</h1>

      <button onClick={onNavigate}>Go to Login</button>
    </div>
  );
}

function TodoPage({ user, logout }) {
  return (
    <div className="auth-card">
      <h1>Welcome {user.username}</h1>

      <button onClick={logout}>Logout</button>
    </div>
  );
}

export default App;