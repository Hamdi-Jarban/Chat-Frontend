import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import App from './App';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  localStorage.clear();
});

describe('App authentication screen', () => {
  it('authenticates automatically from the exchanged Google callback and never renders the access token', async () => {
    const accessToken = 'private-sanctum-token';
    const user = { id: 4, name: 'Google User', email: 'google@example.test', avatar_url: null };
    const fetchMock = vi.fn<typeof fetch>().mockImplementation(async (input) => {
      const path = new URL(String(input)).pathname;
      if (path === '/api/chat') return new Response(JSON.stringify({ data: { participants: [], participant_count: 0 } }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      if (path === '/api/messages') return new Response(JSON.stringify({ data: [], last_page: 1, current_page: 1, total: 0, per_page: 10 }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      return new Response(JSON.stringify({ data: [] }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<App
      oauthCallback={{ code: 'a'.repeat(64) }}
      oauthExchange={Promise.resolve({ token_type: 'Bearer', access_token: accessToken, user })}
    />);

    expect(await screen.findByText('google@example.test')).toBeInTheDocument();
    expect(screen.queryByText(accessToken)).not.toBeInTheDocument();
  });

  it('renders the app, submits a bearer token, and shows the API 401 response', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response(
      JSON.stringify({ message: 'Unauthenticated.' }),
      { status: 401, headers: { 'Content-Type': 'application/json' } },
    ));
    vi.stubGlobal('fetch', fetchMock);

    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'English' }));
    expect(screen.getByRole('heading', { name: /a space for/i })).toBeInTheDocument();
    fireEvent.change(screen.getByRole('textbox', { name: 'Bearer access token' }), {
      target: { value: 'Bearer invalid-token' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Verify' }));

    await waitFor(() => expect(screen.getByText(/انتهت صلاحية الجلسة أو أن الرمز غير صالح/)).toBeInTheDocument());
    const [input, init] = fetchMock.mock.calls[0]!;
    expect(new URL(String(input)).pathname).toBe('/api/auth/me');
    expect(new Headers(init?.headers).get('Authorization')).toBe('Bearer invalid-token');
  });
});
