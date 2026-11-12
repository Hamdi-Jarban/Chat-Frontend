# Chat Frontend

Arabic-first RTL chat interface for the Laravel [Chat-Api](https://github.com/Hamdi-Jarban/Chat-Api). The application supports public chat, direct conversations, comments/emoji, blocking, and optional Reverb updates.

## Local setup

Requirements: Node.js 22.12+ (Vite 8), npm, and a running Chat-Api instance.

```powershell
npm ci
Copy-Item .env.example .env.local
npm run dev
```

Set `VITE_API_BASE_URL` in `.env.local` to the API base URL, for example `http://localhost:8000/api`. Restart Vite after changing environment variables. Run `npm run test`, `npm run build`, and `npm run lint` before deployment.

## Google OAuth configuration

Google redirects to the **backend callback**, then the backend redirects to the frontend callback with a short-lived one-time code. Google must not redirect directly to Vite.

For local development, configure the backend `.env` with the exact callback URLs and the frontend origin:

```dotenv
APP_URL=http://localhost:8000
GOOGLE_REDIRECT_URI=http://localhost:8000/api/auth/google/callback
FRONTEND_AUTH_CALLBACK_URL=http://localhost:5173/auth/callback
CORS_ALLOWED_ORIGINS=http://localhost:5173
SESSION_DRIVER=database
```

Set the exact `GOOGLE_REDIRECT_URI` as an authorized redirect URI in Google Cloud Console. Keep Google client secrets only in the backend environment. The frontend bootstrap consumes the callback fragment and removes it from browser history before rendering, then exchanges the one-time code with the API. The code is valid once for two minutes and only its SHA-256 digest is stored by the backend.

Treat the returned Sanctum bearer token as a credential. Do not expose it in URLs, logs, analytics, or persistent browser storage. The current application persists it in `localStorage`; that behavior is marked for removal and must be fixed before production use. Use HTTPS in deployed environments and configure CORS with exact trusted frontend origins.

Expired temporary codes are pruned by Laravel's scheduled `model:prune` task; ensure Laravel's scheduler runs in production.

## Integration details

Conversation and comment endpoints may return Laravel paginator envelopes. Items remain under `data`; metadata includes page and total information. Public typing events use per-recipient private channels (`private-chat.user.{recipient_id}`) so the backend can apply block visibility. Ensure Chat-Api is configured to authorize these channels and deliver typing events only to eligible recipients.
