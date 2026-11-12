export interface UserSummary {
  id: number;
  name: string | null;
  avatar_url: string | null;
}

export interface User extends UserSummary {
  email: string;
}

export interface AuthTokenResponse {
  token_type: 'Bearer' | string;
  access_token: string;
  user: User;
}

export interface DataResponse<T> {
  data: T;
}

/** Laravel resource responses keep items in `data` and add these fields when paginated. */
export interface LaravelPagination<T> extends DataResponse<T[]> {
  current_page: number;
  from?: number | null;
  last_page: number;
  last_page_url?: string | null;
  links?: Array<{ url: string | null; label: string; active: boolean }>;
  next_page_url?: string | null;
  path?: string;
  per_page: number;
  prev_page_url?: string | null;
  to?: number | null;
  total: number;
}

/** Supports both the legacy `{data: [...]}` response and Laravel's paginator envelope. */
export type ListResponse<T> = DataResponse<T[]> & Partial<Omit<LaravelPagination<T>, 'data'>>;

export interface MessageResponse {
  message: string;
}

export interface ChatSummary {
  participants: UserSummary[];
  participant_count: number;
}

export interface PublicMessage {
  id: number;
  user_id: number;
  content: string;
  user: UserSummary;
  comments_count?: number;
  created_at: string;
  updated_at: string;
}

export interface DirectMessage {
  id: number;
  direct_conversation_id: number;
  user_id: number;
  content: string;
  user: UserSummary;
  created_at: string;
  updated_at: string;
}

export interface DirectConversation {
  id: number;
  other_user: UserSummary;
  latest_message: DirectMessage | null;
  created_at: string;
  updated_at: string;
}

export interface Comment {
  id: number;
  message_id: number;
  user_id: number;
  content: string;
  user: UserSummary;
  created_at: string;
  updated_at: string;
}

export type MessageSort = 'newest' | 'oldest' | 'name_asc' | 'name_desc';
export type MessageRange = 'all' | 'today' | 'week';

export interface MessageFilters {
  page?: number;
  user_id?: number;
  search?: string;
  sort?: MessageSort;
  range?: MessageRange;
}

export interface PageQuery {
  page?: number;
}

export interface CreateConversationInput {
  user_id: number;
}

export interface MessageInput {
  content: string;
}

export interface CommentInput {
  content: string;
}

export interface EmojiCommentInput {
  emoji: string;
}

export interface TypingInput {
  is_typing: boolean;
}

export interface ApiErrorPayload {
  message?: string;
  errors?: Record<string, string[]>;
}

export interface ApiRequestOptions {
  /** Sanctum bearer token for this request; omit only for public OAuth redirect. */
  token?: string;
  signal?: AbortSignal;
}

export interface ApiRequestConfig extends ApiRequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  query?: Record<string, string | number | boolean | null | undefined>;
  body?: unknown;
}

export interface ReverbEvent<TPayload> {
  channel: string;
  name: string;
  payload: TPayload;
}

export interface MessageIdEvent {
  message_id: number;
}

export interface TypingEvent {
  user_id: number;
  user_name: string;
  is_typing: boolean;
}

export interface DirectMessageEvent extends MessageIdEvent {
  conversation_id: number;
}

export const REVERB_CHANNELS = {
  /** Laravel channel name; Echo adds the private-channel wire prefix. */
  chat: 'chat',
  /** Per-recipient channel used to enforce block visibility for typing signals. */
  chatUser: (recipientId: number) => `chat.user.${recipientId}`,
  directChat: (conversationId: number) => `direct-chat.${conversationId}`,
} as const;

export const REVERB_EVENTS = {
  messageCreated: 'message.created',
  messageUpdated: 'message.updated',
  messageDeleted: 'message.deleted',
  messageCommentsUpdated: 'message.comments.updated',
  userTyping: 'user.typing',
  directMessageCreated: 'direct.message.created',
  directMessageDeleted: 'direct.message.deleted',
  directUserTyping: 'direct.user.typing',
} as const;
