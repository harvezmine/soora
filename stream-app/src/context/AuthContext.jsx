import { createContext, useContext, useState, useEffect, useCallback } from 'react';

const AuthContext = createContext(null);

const API_BASE = import.meta.env.VITE_API_URL || '/api';
const TOKEN_KEY = 'soora_token';
const USER_KEY = 'soora_user';

async function authFetch(path, { method = 'GET', body, token } = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(null);
  const [loading, setLoading] = useState(true);

  // Restore session + validate token against backend
  useEffect(() => {
    const t = localStorage.getItem(TOKEN_KEY);
    const cachedUser = localStorage.getItem(USER_KEY);
    if (cachedUser) { try { setUser(JSON.parse(cachedUser)); } catch { /* ignore */ } }
    if (!t) { setLoading(false); return; }
    setToken(t);
    authFetch('/auth/me', { token: t })
      .then((d) => { setUser(d.user); localStorage.setItem(USER_KEY, JSON.stringify(d.user)); })
      .catch(() => { localStorage.removeItem(TOKEN_KEY); localStorage.removeItem(USER_KEY); setToken(null); setUser(null); })
      .finally(() => setLoading(false));
  }, []);

  const persist = useCallback((tok, usr) => {
    setToken(tok); setUser(usr);
    localStorage.setItem(TOKEN_KEY, tok);
    localStorage.setItem(USER_KEY, JSON.stringify(usr));
  }, []);

  const login = useCallback(async (email, password) => {
    try {
      const d = await authFetch('/auth/login', { method: 'POST', body: { email, password } });
      persist(d.token, d.user);
      return { success: true };
    } catch (e) { return { success: false, error: e.message }; }
  }, [persist]);

  const register = useCallback(async (name, email, password) => {
    try {
      const d = await authFetch('/auth/register', { method: 'POST', body: { name, email, password } });
      persist(d.token, d.user);
      return { success: true };
    } catch (e) { return { success: false, error: e.message }; }
  }, [persist]);

  const loginGoogle = useCallback(async (idToken) => {
    try {
      const d = await authFetch('/auth/google', { method: 'POST', body: { idToken } });
      persist(d.token, d.user);
      return { success: true };
    } catch (e) { return { success: false, error: e.message }; }
  }, [persist]);

  const logout = useCallback(() => {
    setUser(null); setToken(null);
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
  }, []);

  // Authed helper for user-data calls (progress/history/mylist/prefs)
  const apiAuthed = useCallback((path, opts = {}) => authFetch(path, { ...opts, token }), [token]);

  return (
    <AuthContext.Provider value={{ user, token, loading, login, register, loginGoogle, logout, apiAuthed }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
