import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError, apiClient } from './apiClient';

const token = 'test-access-token';
const jsonResponse = (status: number, body: unknown) => new Response(JSON.stringify(body), {
  status,
  headers: { 'Content-Type': 'application/json' },
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('apiClient', () => {
  it('sends bearer Authorization and JSON Accept headers on authenticated requests', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse(200, { data: { id: 1 } }));
    vi.stubGlobal('fetch', fetchMock);

    await apiClient.getMe({ token });

    const [, init] = fetchMock.mock.calls[0]!;
    const headers = new Headers(init?.headers);
    expect(headers.get('Authorization')).toBe(`Bearer ${token}`);
    expect(headers.get('Accept')).toBe('application/json');
  });

  it('creates a public message with POST /messages and the documented content body', async () => {
    const responseBody = { data: { id: 7, content: 'Hello community' } };
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse(201, responseBody));
    vi.stubGlobal('fetch', fetchMock);

    const result = await apiClient.createMessage({ content: 'Hello community' }, { token });

    const [input, init] = fetchMock.mock.calls[0]!;
    expect(new URL(String(input)).pathname).toBe('/api/messages');
    expect(init?.method).toBe('POST');
    expect(init?.body).toBe(JSON.stringify({ content: 'Hello community' }));
    expect(result).toEqual(responseBody);
  });

  it.each([
    { status: 401, body: { message: 'Unauthenticated.' }, flag: 'isUnauthorized' as const },
    { status: 422, body: { message: 'The content field is required.', errors: { content: ['The content field is required.'] } }, flag: 'isValidationError' as const },
    { status: 429, body: { message: 'Too many requests.' }, flag: 'isRateLimited' as const },
  ])('preserves structured $status API errors', async ({ status, body, flag }) => {
    vi.stubGlobal('fetch', vi.fn<typeof fetch>().mockResolvedValue(jsonResponse(status, body)));

    let caught: unknown;
    try {
      await apiClient.getMe({ token });
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(ApiError);
    const error = caught as ApiError;
    expect(error.status).toBe(status);
    expect(error.message).toBe(body.message);
    expect(error.payload).toEqual(body);
    expect(error[flag]).toBe(true);
    if (status === 422) {
      expect(error.messagesFor('content')).toEqual(['The content field is required.']);
      expect(error.validationMessages).toEqual(['The content field is required.']);
    }
  });
});
