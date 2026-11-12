import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import App from './App';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  localStorage.clear();
});

describe('App authentication screen', () => {
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
