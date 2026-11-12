import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { apiClient } from './services/apiClient'
import { consumeOAuthCallback } from './services/oauthCallback'

const oauthCallback = consumeOAuthCallback()
const oauthExchange = oauthCallback?.code
  ? apiClient.exchangeGoogleCode(oauthCallback.code)
  : null
// Attach a handler immediately; App also observes the same promise to show a useful error.
if (oauthExchange) void oauthExchange.catch(() => undefined)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App oauthCallback={oauthCallback} oauthExchange={oauthExchange} />
  </StrictMode>,
)
