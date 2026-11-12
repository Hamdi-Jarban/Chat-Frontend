# Chat Frontend

Arabic-first RTL chat interface for the Laravel [Chat-Api](https://github.com/Hamdi-Jarban/Chat-Api). The application supports public chat, direct conversations, comments/emoji, blocking, and optional Laravel Reverb updates.

## Local setup

Requirements: Node.js 22.12+ (Vite 8), npm, and a running Chat-Api instance.

```powershell
npm ci
Copy-Item .env.example .env.local
npm run dev
```

Set `VITE_API_BASE_URL` in `.env.local` to the API base URL, for example `http://localhost:8000/api`. Restart Vite after changing environment variables. Use `npm run test`, `npm run build`, and `npm run lint` for checks.

## Google OAuth configuration

Google redirects to the **backend callback**, then the backend redirects to the frontend callback with a short-lived one-time code. Google must not redirect directly to Vite.

For a local setup, configure the Backend `.env` approximately as follows:

```dotenv
APP_URL=http://localhost:8000
GOOGLE_REDIRECT_URI=http://localhost:8000/api/auth/google/callback
FRONTEND_AUTH_CALLBACK_URL=http://localhost:5173/auth/callback
CORS_ALLOWED_ORIGINS=http://localhost:5173
SESSION_DRIVER=database
```

Set the exact `GOOGLE_REDIRECT_URI` as an authorized redirect URI in the Google OAuth client. Configure valid `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` only in the Backend environment. Then run `php artisan migrate` in Chat-Api and start Laravel on port 8000. The web-session middleware on the Google redirect/callback routes stores and verifies OAuth `state`.

The flow is:

1. The user chooses **Continue with Google** and is sent to `GET /api/auth/google/redirect`.
2. Laravel verifies Google's callback and redirects to `FRONTEND_AUTH_CALLBACK_URL#code=...` (or a non-sensitive error code).
3. Frontend bootstrap reads the fragment and removes it from browser history before rendering, then posts the code to `POST /api/auth/exchange`.
4. The code is valid once for two minutes; only its SHA-256 digest is stored by the Backend. After exchange, the frontend keeps the returned Sanctum token in memory only, not in `localStorage`.

Keep `FRONTEND_AUTH_CALLBACK_URL` fixed to a trusted frontend origin/path; never accept a user-supplied redirect URL. Use HTTPS in deployed environments, and set CORS to the exact frontend origin. Do not put Google client secrets or `REVERB_APP_SECRET` into any `VITE_*` variable. The returned Bearer token is not exposed in the redirect URL or displayed in the UI. Because the token is memory-only, reloading the page ends the local authenticated session.

Expired temporary codes are pruned by Laravel's scheduled `model:prune` task; ensure Laravel's scheduler runs in production.
