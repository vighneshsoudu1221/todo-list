# Backend

This backend serves the Todo app API and static HTML pages for authentication.

## Run locally

1. Copy `.env.example` to `.env`.
2. Update database credentials and `JWT_SECRET`.
3. Install dependencies:
   ```bash
   npm install
   ```
4. Start the server:
   ```bash
   npm start
   ```

## Deploy

- `Procfile` is provided for Heroku-style deployment.
- `package.json` includes a `start` script and Node engine requirement.
- Environment variables are loaded from `.env` and should be configured in the target deployment environment.
