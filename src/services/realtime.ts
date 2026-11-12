import { useEffect, useRef } from 'react'
import Echo from 'laravel-echo'
import Pusher from 'pusher-js'
import { REVERB_CHANNELS, REVERB_EVENTS } from '../types/api'
import type { DirectMessageEvent, MessageIdEvent, TypingEvent } from '../types/api'

export type RealtimeSignal =
  | { type: 'public-message'; payload: MessageIdEvent }
  | { type: 'public-comments'; payload: MessageIdEvent }
  | { type: 'public-typing'; payload: TypingEvent }
  | { type: 'direct-message'; payload: DirectMessageEvent }
  | { type: 'direct-typing'; payload: TypingEvent }

interface RealtimeOptions {
  token: string
  userId: number
  conversationId: number | null
  onSignal: (signal: RealtimeSignal) => void
}

const apiBase = (import.meta.env.VITE_API_BASE_URL ?? import.meta.env.VITE_API_URL ?? '/api').replace(/\/$/, '')

function broadcastingAuthUrl(): string {
  const explicit = import.meta.env.VITE_REVERB_AUTH_URL
  if (explicit) return explicit
  const api = new URL(apiBase, window.location.origin)
  const apiPath = api.pathname.replace(/\/api\/?$/, '')
  return `${api.origin}${apiPath}/broadcasting/auth`
}

/** Opens only server-authorized private channels; Laravel adds the `private-` wire prefix. */
export function subscribeRealtime({ token, userId, conversationId, onSignal }: RealtimeOptions): (() => void) | null {
  const key = import.meta.env.VITE_REVERB_APP_KEY
  const host = import.meta.env.VITE_REVERB_HOST
  const scheme = import.meta.env.VITE_REVERB_SCHEME ?? 'https'
  const port = Number(import.meta.env.VITE_REVERB_PORT ?? (scheme === 'https' ? 443 : 8080))
  if (!key || !host || !token) return null

  const echo = new Echo({
    broadcaster: 'reverb',
    key,
    Pusher,
    wsHost: host,
    wsPort: port,
    wssPort: port,
    forceTLS: scheme === 'https',
    enabledTransports: scheme === 'https' ? ['wss'] : ['ws', 'wss'],
    authEndpoint: broadcastingAuthUrl(),
    auth: { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' } },
  })

  echo.private(REVERB_CHANNELS.chat)
    .listen(`.${REVERB_EVENTS.messageCreated}`, (payload: MessageIdEvent) => onSignal({ type: 'public-message', payload }))
    .listen(`.${REVERB_EVENTS.messageUpdated}`, (payload: MessageIdEvent) => onSignal({ type: 'public-message', payload }))
    .listen(`.${REVERB_EVENTS.messageDeleted}`, (payload: MessageIdEvent) => onSignal({ type: 'public-message', payload }))
    .listen(`.${REVERB_EVENTS.messageCommentsUpdated}`, (payload: MessageIdEvent) => onSignal({ type: 'public-comments', payload }))

  // Typing uses a per-recipient channel so users excluded by block rules never receive it.
  echo.private(REVERB_CHANNELS.chatUser(userId))
    .listen(`.${REVERB_EVENTS.userTyping}`, (payload: TypingEvent) => onSignal({ type: 'public-typing', payload }))

  if (conversationId !== null) {
    echo.private(REVERB_CHANNELS.directChat(conversationId))
      .listen(`.${REVERB_EVENTS.directMessageCreated}`, (payload: DirectMessageEvent) => onSignal({ type: 'direct-message', payload }))
      .listen(`.${REVERB_EVENTS.directMessageDeleted}`, (payload: DirectMessageEvent) => onSignal({ type: 'direct-message', payload }))
      .listen(`.${REVERB_EVENTS.directUserTyping}`, (payload: TypingEvent) => onSignal({ type: 'direct-typing', payload }))
  }

  return () => echo.disconnect()
}

export function useRealtime(
  token: string | null,
  userId: number | null,
  conversationId: number | null,
  onSignal: (signal: RealtimeSignal) => void,
): void {
  const callbackRef = useRef(onSignal)

  useEffect(() => {
    callbackRef.current = onSignal
  }, [onSignal])

  useEffect(() => {
    if (!token || userId === null) return
    return subscribeRealtime({ token, userId, conversationId, onSignal: (signal) => callbackRef.current(signal) }) ?? undefined
  }, [token, userId, conversationId])
}
