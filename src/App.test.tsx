import { cleanup, fireEvent, render, screen } from '@testing-library/react';
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

  it('renders the Google-only authentication screen without exposing a bearer token input', () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'English' }));
    expect(screen.getByRole('heading', { name: /space for/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /continue with google/i })).toBeInTheDocument();
    expect(screen.queryByRole('textbox', { name: 'Bearer access token' })).not.toBeInTheDocument();
  });

  it('restores a valid token from localStorage after a page refresh', async () => {
    const token = 'stored-sanctum-token';
    const user = { id: 8, name: 'Stored User', email: 'stored@example.test', avatar_url: null };
    localStorage.setItem('sawalf_access_token', token);
    const fetchMock = vi.fn<typeof fetch>().mockImplementation(async input => {
      const path = new URL(String(input)).pathname;
      if (path === '/api/auth/me') return new Response(JSON.stringify({ data: user }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      return new Response(JSON.stringify({ data: [], last_page: 1, current_page: 1, total: 0, per_page: 10 }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<App />);

    expect(await screen.findByText('stored@example.test')).toBeInTheDocument();
    const meRequest = fetchMock.mock.calls.find(([input]) => new URL(String(input)).pathname === '/api/auth/me');
    expect(meRequest).toBeDefined();
    expect(new Headers(meRequest?.[1]?.headers).get('Authorization')).toBe(`Bearer ${token}`);
  });

  it('keeps the stored token when the session check fails because the API is unavailable', async () => {
    const token = 'stored-sanctum-token';
    localStorage.setItem('sawalf_access_token', token);
    vi.stubGlobal('fetch', vi.fn<typeof fetch>().mockRejectedValue(new TypeError('Failed to fetch')));

    render(<App />);

    expect(await screen.findByText(/تعذر الاتصال بالخادم|check your network connection/i)).toBeInTheDocument();
    expect(localStorage.getItem('sawalf_access_token')).toBe(token);
    expect(screen.queryByRole('link', { name: /continue with google/i })).not.toBeInTheDocument();
  });
});
