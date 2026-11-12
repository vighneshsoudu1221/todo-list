# Backend

This backend serves the Todo app API and static HTML pages for authentication.

## Run locally

1. Copy `.env.example` to `.env`.
2. Set `DATABASE_URL` to your PostgreSQL connection URL and set `JWT_SECRET` to a random value of at least 32 characters.
3. Create a PostgreSQL database named `todo`. The server creates its tables when it starts.
4. Install dependencies:
   ```bash
   npm install
   ```
5. Start the server:
   ```bash
   npm start
   ```

## Deploy

- Set the service root directory to `BACKEND`; `Procfile` is provided for Heroku-style deployment.
- `package.json` includes a `start` script and Node engine requirement.
- Environment variables are loaded from `.env` and should be configured in the target deployment environment.
- Set `DATABASE_URL` to the PostgreSQL connection URL and `JWT_SECRET` to a random value of at least 32 characters.
- The server creates the required tables on startup.
- Confirm `https://<your-backend>/health` reports `{"status":"ok","db":"reachable"}` after deployment. A 404 means the service is not running this backend entry point.
