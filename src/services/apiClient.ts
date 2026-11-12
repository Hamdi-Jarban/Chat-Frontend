import type {
  ApiErrorPayload,
  ApiRequestConfig,
  ApiRequestOptions,
  AuthTokenResponse,
  ChatSummary,
  Comment,
  CommentInput,
  CreateConversationInput,
  DataResponse,
  DirectConversation,
  DirectMessage,
  EmojiCommentInput,
  LaravelPagination,
  MessageFilters,
  MessageInput,
  MessageResponse,
  PageQuery,
  PublicMessage,
  TypingInput,
  User,
  UserSummary,
} from '../types/api';

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? import.meta.env.VITE_API_URL ?? '/api').replace(/\/$/, '');

type AuthenticatedOptions = ApiRequestOptions & { token: string };

export class ApiError extends Error {
  readonly status: number;
  readonly errors: Record<string, string[]>;
  readonly payload: unknown;

  constructor(status: number, message: string, errors: Record<string, string[]> = {}, payload?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.errors = errors;
    this.payload = payload;
  }

  get isUnauthorized(): boolean {
    return this.status === 401;
  }

  get isValidationError(): boolean {
    return this.status === 422;
  }

  get isForbidden(): boolean {
    return this.status === 403;
  }

  get isRateLimited(): boolean {
    return this.status === 429;
  }

  get validationMessages(): string[] {
    return Object.values(this.errors).flat();
  }

  messagesFor(field: string): string[] {
    return this.errors[field] ?? [];
  }
}

export function isApiError(error: unknown): error is ApiError {
  return error instanceof ApiError;
}

export function isUnauthorizedError(error: unknown): error is ApiError {
  return isApiError(error) && error.isUnauthorized;
}

export function isValidationError(error: unknown): error is ApiError {
  return isApiError(error) && error.isValidationError;
}

function isErrorPayload(value: unknown): value is ApiErrorPayload {
  return typeof value === 'object' && value !== null;
}

function extractErrors(payload: unknown): Record<string, string[]> {
  if (!isErrorPayload(payload) || !payload.errors || typeof payload.errors !== 'object') return {};
  return Object.fromEntries(
    Object.entries(payload.errors).map(([field, messages]) => [
      field,
      Array.isArray(messages) ? messages.filter((item): item is string => typeof item === 'string') : [],
    ]),
  );
}

function extractMessage(payload: unknown, status: number, statusText: string): string {
  if (isErrorPayload(payload) && typeof payload.message === 'string' && payload.message.trim()) {
    return payload.message;
  }
  const validationMessages = Object.values(extractErrors(payload)).flat();
  if (validationMessages.length > 0) return validationMessages.join(' ');
  return statusText || `Request failed (${status}).`;
}

function buildUrl(path: string, query?: ApiRequestConfig['query']): string {
  const url = new URL(`${API_BASE_URL}${path}`, window.location.origin);
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value !== undefined && value !== null && value !== '') url.searchParams.set(key, String(value));
  }
  return url.toString();
}

async function request<T>(path: string, config: ApiRequestConfig = {}): Promise<T> {
  const headers = new Headers({ Accept: 'application/json' });
  if (config.token) headers.set('Authorization', `Bearer ${config.token}`);
  if (config.body !== undefined) headers.set('Content-Type', 'application/json');

  const response = await fetch(buildUrl(path, config.query), {
    method: config.method ?? 'GET',
    headers,
    body: config.body === undefined ? undefined : JSON.stringify(config.body),
    signal: config.signal,
  });

  const contentType = response.headers.get('content-type') ?? '';
  let payload: unknown;
  if (response.status !== 204) {
    if (contentType.includes('application/json')) {
      try {
        payload = await response.json();
      } catch {
        payload = undefined;
      }
    } else {
      const text = await response.text();
      payload = text ? { message: text } : undefined;
    }
  }

  if (!response.ok) {
    throw new ApiError(
      response.status,
      extractMessage(payload, response.status, response.statusText),
      extractErrors(payload),
      payload,
    );
  }
  return payload as T;
}

function auth(options: AuthenticatedOptions): ApiRequestOptions {
  return { token: options.token, signal: options.signal };
}

function query(options?: PageQuery | MessageFilters): Record<string, string | number | boolean | null | undefined> | undefined {
  if (!options) return undefined;
  const entries = Object.entries(options).filter(([, value]) => value !== undefined && value !== null && value !== '');
  if (entries.length === 0) return undefined;
  return Object.fromEntries(entries) as Record<string, string | number | boolean | null | undefined>;
}

export const apiClient = {
  /** URL to navigate to for the backend's GET /auth/google/redirect (302 to Google). */
  googleRedirectUrl(): string {
    return import.meta.env.VITE_GOOGLE_AUTH_URL ?? buildUrl('/auth/google/redirect');
  },

  /** Exchange the backend-issued, short-lived, single-use OAuth code for a Sanctum token. */
  exchangeGoogleCode(code: string): Promise<AuthTokenResponse> {
    return request('/auth/exchange', { method: 'POST', body: { code } });
  },

  getMe(options: AuthenticatedOptions): Promise<DataResponse<User>> {
    return request('/auth/me', auth(options));
  },

  logout(options: AuthenticatedOptions): Promise<MessageResponse> {
    return request('/auth/logout', { ...auth(options), method: 'POST' });
  },

  getChat(options: AuthenticatedOptions): Promise<DataResponse<ChatSummary>> {
    return request('/chat', auth(options));
  },

  listDirectConversations(options: AuthenticatedOptions): Promise<DataResponse<DirectConversation[]>> {
    return request('/direct-conversations', auth(options));
  },

  createDirectConversation(input: CreateConversationInput, options: AuthenticatedOptions): Promise<DataResponse<DirectConversation>> {
    return request('/direct-conversations', { ...auth(options), method: 'POST', body: input });
  },

  listDirectMessages(
    conversationId: number,
    page: PageQuery | undefined,
    options: AuthenticatedOptions,
  ): Promise<LaravelPagination<DirectMessage>> {
    return request(`/direct-conversations/${conversationId}/messages`, { ...auth(options), query: query(page) });
  },

  sendDirectMessage(
    conversationId: number,
    input: MessageInput,
    options: AuthenticatedOptions,
  ): Promise<DataResponse<DirectMessage>> {
    return request(`/direct-conversations/${conversationId}/messages`, {
      ...auth(options), method: 'POST', body: input,
    });
  },

  deleteDirectMessage(messageId: number, options: AuthenticatedOptions): Promise<MessageResponse> {
    return request(`/direct-messages/${messageId}`, { ...auth(options), method: 'DELETE' });
  },

  listMessages(filters: MessageFilters | undefined, options: AuthenticatedOptions): Promise<LaravelPagination<PublicMessage>> {
    return request('/messages', { ...auth(options), query: query(filters) });
  },

  createMessage(input: MessageInput, options: AuthenticatedOptions): Promise<DataResponse<PublicMessage>> {
    return request('/messages', { ...auth(options), method: 'POST', body: input });
  },

  updateMessage(messageId: number, input: MessageInput, options: AuthenticatedOptions): Promise<DataResponse<PublicMessage>> {
    return request(`/messages/${messageId}`, { ...auth(options), method: 'PATCH', body: input });
  },

  deleteMessage(messageId: number, options: AuthenticatedOptions): Promise<MessageResponse> {
    return request(`/messages/${messageId}`, { ...auth(options), method: 'DELETE' });
  },

  listComments(messageId: number, options: AuthenticatedOptions): Promise<DataResponse<Comment[]>> {
    return request(`/messages/${messageId}/comments`, auth(options));
  },

  createComment(messageId: number, input: CommentInput, options: AuthenticatedOptions): Promise<DataResponse<Comment>> {
    return request(`/messages/${messageId}/comments`, { ...auth(options), method: 'POST', body: input });
  },

  createEmojiComment(messageId: number, input: EmojiCommentInput, options: AuthenticatedOptions): Promise<DataResponse<Comment>> {
    return request(`/messages/${messageId}/emoji-comments`, { ...auth(options), method: 'POST', body: input });
  },

  deleteComment(commentId: number, options: AuthenticatedOptions): Promise<MessageResponse> {
    return request(`/comments/${commentId}`, { ...auth(options), method: 'DELETE' });
  },

  listBlockedUsers(options: AuthenticatedOptions): Promise<DataResponse<UserSummary[]>> {
    return request('/users/blocked', auth(options));
  },

  blockUser(userId: number, options: AuthenticatedOptions): Promise<MessageResponse> {
    return request(`/users/${userId}/block`, { ...auth(options), method: 'POST' });
  },

  unblockUser(userId: number, options: AuthenticatedOptions): Promise<MessageResponse> {
    return request(`/users/${userId}/block`, { ...auth(options), method: 'DELETE' });
  },

  updateTyping(input: TypingInput, options: AuthenticatedOptions): Promise<TypingInput> {
    return request('/typing', { ...auth(options), method: 'POST', body: input });
  },

  updateDirectTyping(conversationId: number, input: TypingInput, options: AuthenticatedOptions): Promise<TypingInput> {
    return request(`/direct-conversations/${conversationId}/typing`, { ...auth(options), method: 'POST', body: input });
  },
};

export type { AuthenticatedOptions, AuthTokenResponse };
