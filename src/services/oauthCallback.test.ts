import { afterEach, describe, expect, it } from 'vitest';
import { consumeOAuthCallback } from './oauthCallback';

afterEach(() => {
  window.history.replaceState(null, document.title, '/');
});

describe('consumeOAuthCallback', () => {
  it('reads a temporary code from the fragment and removes it from the URL', () => {
    window.history.replaceState(null, document.title, '/auth/callback?state=ignored#code=abc123');

    expect(consumeOAuthCallback()).toEqual({ code: 'abc123', error: undefined });
    expect(window.location.pathname).toBe('/');
    expect(window.location.search).toBe('');
    expect(window.location.hash).toBe('');
  });

  it('does not treat an unrelated route fragment as an OAuth callback', () => {
    window.history.replaceState(null, document.title, '/#code=not-oauth');

    expect(consumeOAuthCallback()).toBeNull();
    expect(window.location.hash).toBe('#code=not-oauth');
  });
});
