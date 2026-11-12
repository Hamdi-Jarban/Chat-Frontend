# TODO

- [x] Build Google OAuth and Sanctum token sign-in.
- [x] Build responsive RTL layout with public, direct, and blocked sections.
- [x] Connect account, conversation, public-message, comments, blocking, and typing API operations.
- [x] Add loading/error/empty states and polling fallback.
- [x] Support paginated conversation and comment API response envelopes and page parameters in the client.
- [x] Subscribe to per-recipient public typing channels to match block-aware backend delivery.
- [ ] Keep the Sanctum token in memory only; remove the `localStorage` read/write in `App.tsx` and update refresh behavior.
- [ ] Add UI pagination controls for conversations and comments, including loading older comment pages.
- [ ] Add request cancellation/debouncing and stale-response guards for search, comments, and polling.
- [ ] Refresh public feed and reconcile conversations immediately after block/unblock actions.
- [ ] Display the public typing signal in the intended public-chat context.
- [ ] Replace manual user-ID conversation creation with a user search/selection flow when the API supports it.
- [ ] Add browser end-to-end coverage and verify the backend/Reverb integration in a deployment-like environment.
