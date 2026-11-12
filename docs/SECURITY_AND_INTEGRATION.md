# Chat-Frontend: Integration and security notes

## Response pagination compatibility

Conversation and comment list requests accept an optional `page` query parameter and preserve Laravel paginator metadata (`current_page`, `last_page`, `total`, and links) while retaining the `data` array used by the UI. Older non-paginated API responses with the same `data` array remain compatible.

## Reverb typing privacy

Public-chat typing notifications must be delivered on the per-recipient private channel `chat.user.{recipient_id}` (wire name `private-chat.user.{recipient_id}`), not the shared `chat` channel. The frontend subscribes to the authenticated user's recipient channel. The backend must enforce the matching authorization callback and exclude users in either direction of a block relationship when constructing recipients. Message and comment invalidation events remain on the shared authenticated `chat` channel.

## Token storage

Treat Sanctum access tokens as credentials. The frontend should keep them in memory only; do not persist bearer tokens in `localStorage`, `sessionStorage`, URLs, analytics, or console output. A page refresh should require re-authentication unless the backend adopts a secure HttpOnly cookie-based session flow.

## Remaining release checks

Run `npm ci`, `npm test`, `npm run lint`, and `npm run build`. Then verify OAuth callback, CORS, Reverb authorization, blocked-user behavior, and pagination against the deployed API. No browser end-to-end or real backend integration tests are claimed by this document.
