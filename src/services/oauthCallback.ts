export interface OAuthCallbackResult {
  code?: string;
  error?: string;
}

/**
 * Read the one-time OAuth code from the callback URL fragment and immediately
 * remove the code and callback query from browser history.
 */
export function consumeOAuthCallback(): OAuthCallbackResult | null {
  const path = window.location.pathname.replace(/\/+$/, '');
  if (!path.endsWith('/auth/callback')) return null;

  const fragment = new URLSearchParams(window.location.hash.slice(1));
  const code = fragment.get('code') ?? undefined;
  const error = fragment.get('error') ?? undefined;
  const cleanPath = window.location.pathname.replace(/auth\/callback\/?$/, '') || '/';
  window.history.replaceState(null, document.title, cleanPath);

  return { code, error };
}
