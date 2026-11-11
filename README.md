# Todo App (Backend + Frontend)

This repository contains a React frontend (Vite) and an Express + MySQL backend.

## Quick overview

- `BACKEND/` - Express server
- `FRONTEND/` - Vite + React app

---

## Local setup

1. Backend

- Copy `BACKEND/.env.example` to `BACKEND/.env` and update values.
- Set `JWT_SECRET` to a random value of at least 32 characters; the backend will not start without it.
- Install dependencies and start server:

```bash
cd BACKEND
npm install
npm start
```

- Verify DB connectivity:

```bash
curl -i http://localhost:5000/health
```

2. Database

- Create the required tables using the provided SQL:

```bash
# adjust host/user/password as needed
mysql -h DB_HOST -u DB_USER -pDB_PASSWORD DB_NAME < BACKEND/init_db.sql
```

3. Frontend

```bash
cd FRONTEND
npm install
npm run dev
```

Open `http://localhost:3000` in the browser (Vite default).

---

## Deploying Backend (Render)

- Create a new Web Service in Render and connect the repository.
- Set the service root directory to `BACKEND` and the start command to `npm start`.
- Set environment variables on Render (Service > Environment):
  - `DB_HOST` - host for your MySQL
  - `DB_USER` - database user
  - `DB_PASSWORD` - database password
  - `DB_NAME` - database name
  - `JWT_SECRET` - random secret of at least 32 characters
  - `PORT` - optional (default 5000)

- Ensure the database is accessible by Render (use Render managed DB or whitelist your DB host).
- Redeploy and check logs in Render dashboard. Verify `https://<your-backend>/health` returns `{"status":"ok","db":"reachable"}` before testing login.
- If `/health` returns 404, the Render service is not running this repository's `BACKEND/server.js`; check its root directory, branch, and start command.

---

## Deploying Frontend (Vercel)

- Set the Vercel project root directory to `FRONTEND` and use `npm run build` with `dist` as the output directory.
- Set `VITE_API_BASE_URL` in the Vercel project environment variables to the backend's base URL (for example, `https://<your-backend>.onrender.com`), then redeploy. The code falls back to the current Render URL when this variable is unset.
- Deploy and test the login flow.

---

## Troubleshooting

- 500 errors on `/login` often indicate DB issues, missing tables, or auth errors.
- Use the `/health` route (added temporarily) to verify DB connectivity:

```bash
curl -i https://<your-backend>/health
```

- Check server logs (Render) for stack traces and errors.

---

## Security

- Never commit `.env` files with secrets. Use `BACKEND/.env.example` for reference.
- Store secrets in your hosting provider's environment variable settings.

---

If you want, I can:

- Run through these steps and guide you interactively.
- Create a PR with these helper files and deployment notes.
