/**
 * API Client with Automatic Refresh Token Rotation, WS Ticket Acquisition, and 401 Session Handling
 */

const TOKEN_KEY = 'voicecart_token';
const REFRESH_TOKEN_KEY = 'voicecart_refresh_token';
const USER_KEY = 'voicecart_user';

export function getStoredToken() {
  return localStorage.getItem(TOKEN_KEY);
}

export function getStoredRefreshToken() {
  return localStorage.getItem(REFRESH_TOKEN_KEY);
}

export function getStoredUser() {
  try {
    const raw = localStorage.getItem(USER_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function saveSession(token, user, refreshToken = null) {
  localStorage.setItem(TOKEN_KEY, token);
  if (refreshToken) {
    localStorage.setItem(REFRESH_TOKEN_KEY, refreshToken);
  }
  localStorage.setItem(USER_KEY, JSON.stringify(user));
  window.dispatchEvent(new Event('voicecart_auth_change'));
}

export function clearSession() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(REFRESH_TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
  window.dispatchEvent(new Event('voicecart_auth_change'));
}

export async function login(email, password) {
  const res = await fetch('/api/v1/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error?.message || data.error || 'Authentication failed');
  }

  saveSession(data.token || data.accessToken, data.user, data.refreshToken);
  return data;
}

export async function getWsTicket() {
  try {
    const data = await apiFetch('/api/v1/auth/ws-ticket', { method: 'POST' });
    return data.ticket;
  } catch (err) {
    console.warn('[ApiClient] Could not acquire WS ticket:', err.message);
    return null;
  }
}

export async function apiFetch(path, options = {}) {
  let token = getStoredToken();
  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {}),
  };

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  // Normalize /api/ paths to /api/v1/
  const targetUrl = path.startsWith('/api/') && !path.startsWith('/api/v1/')
    ? path.replace('/api/', '/api/v1/')
    : path;

  let res = await fetch(targetUrl, {
    ...options,
    headers,
  });

  // Handle Token Expiry & Automatic Refresh Rotation
  if (res.status === 401 && !targetUrl.includes('/auth/login') && !targetUrl.includes('/auth/refresh')) {
    const refreshToken = getStoredRefreshToken();
    if (refreshToken) {
      try {
        const refreshRes = await fetch('/api/v1/auth/refresh', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refreshToken }),
        });

        if (refreshRes.ok) {
          const tokenData = await refreshRes.json();
          saveSession(tokenData.accessToken, getStoredUser(), tokenData.refreshToken);

          // Retry original request with new token
          headers.Authorization = `Bearer ${tokenData.accessToken}`;
          res = await fetch(targetUrl, {
            ...options,
            headers,
          });
        } else {
          clearSession();
        }
      } catch {
        clearSession();
      }
    } else {
      clearSession();
    }
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error?.message || data.error || `HTTP ${res.status}`);
  }

  return data;
}
