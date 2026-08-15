/**
 * API Client with Automatic Bearer Token Injection and 401 Session Handling
 */

const TOKEN_KEY = 'voicecart_token';
const USER_KEY = 'voicecart_user';

export function getStoredToken() {
  return localStorage.getItem(TOKEN_KEY);
}

export function getStoredUser() {
  try {
    const raw = localStorage.getItem(USER_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function saveSession(token, user) {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USER_KEY, JSON.stringify(user));
  window.dispatchEvent(new Event('voicecart_auth_change'));
}

export function clearSession() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
  window.dispatchEvent(new Event('voicecart_auth_change'));
}

export async function login(email, password) {
  const res = await fetch('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error?.message || data.error || 'Authentication failed');
  }

  saveSession(data.token, data.user);
  return data;
}

export async function apiFetch(path, options = {}) {
  const token = getStoredToken();
  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {}),
  };

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const res = await fetch(path, {
    ...options,
    headers,
  });

  if (res.status === 401) {
    // If not on login route, session is invalid/expired
    if (!path.includes('/api/auth/login')) {
      console.warn('[ApiClient] 401 Unauthorized, clearing session.');
      clearSession();
    }
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error?.message || data.error || `HTTP ${res.status}`);
  }

  return data;
}
