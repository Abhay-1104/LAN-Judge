import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import api from '../api/client';

const AuthContext = createContext(null);

// Quick-switch accounts are stored as { id, name, email, role, avatar_color, token }.
// This is a convenience for a shared lab machine where several students/
// faculty log in over the course of a day — it is NOT a security boundary:
// anyone with access to the browser's localStorage already has these
// tokens. Treat it the same as "remember me", nothing more sensitive.
function loadSavedAccounts() {
  try {
    return JSON.parse(localStorage.getItem('lj_accounts') || '[]');
  } catch {
    return [];
  }
}

function saveSavedAccounts(accounts) {
  localStorage.setItem('lj_accounts', JSON.stringify(accounts));
}

function upsertAccount(user, token) {
  const accounts = loadSavedAccounts().filter((a) => a.id !== user.id);
  accounts.unshift({ id: user.id, name: user.name, email: user.email, role: user.role, avatar_color: user.avatar_color, token });
  saveSavedAccounts(accounts.slice(0, 6)); // keep it small — this is a convenience list, not an account manager
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    const raw = localStorage.getItem('lj_user');
    return raw ? JSON.parse(raw) : null;
  });
  const [ready, setReady] = useState(false);
  const [savedAccounts, setSavedAccounts] = useState(loadSavedAccounts);

  useEffect(() => {
    const token = localStorage.getItem('lj_token');
    if (!token) {
      setReady(true);
      return;
    }
    api
      .get('/auth/me')
      .then(({ data }) => {
        setUser(data.user);
        localStorage.setItem('lj_user', JSON.stringify(data.user));
      })
      .catch(() => {
        localStorage.removeItem('lj_token');
        localStorage.removeItem('lj_user');
        setUser(null);
      })
      .finally(() => setReady(true));
  }, []);

  const login = useCallback(async (email, password) => {
    const { data } = await api.post('/auth/login', { email, password });
    localStorage.setItem('lj_token', data.token);
    localStorage.setItem('lj_user', JSON.stringify(data.user));
    upsertAccount(data.user, data.token);
    setSavedAccounts(loadSavedAccounts());
    setUser(data.user);
    return data.user;
  }, []);

  const register = useCallback(async (payload) => {
    const { data } = await api.post('/auth/register', payload);
    localStorage.setItem('lj_token', data.token);
    localStorage.setItem('lj_user', JSON.stringify(data.user));
    upsertAccount(data.user, data.token);
    setSavedAccounts(loadSavedAccounts());
    setUser(data.user);
    return data;
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem('lj_token');
    localStorage.removeItem('lj_user');
    setUser(null);
  }, []);

  // Switch to a previously-logged-in account instantly, no password needed
  // — the token was already saved from that account's earlier login. If the
  // token has since expired, /auth/me will reject it on the next request and
  // the person just logs in again normally.
  const switchAccount = useCallback(async (accountId) => {
    const account = loadSavedAccounts().find((a) => a.id === accountId);
    if (!account) return false;
    localStorage.setItem('lj_token', account.token);
    try {
      const { data } = await api.get('/auth/me');
      localStorage.setItem('lj_user', JSON.stringify(data.user));
      setUser(data.user);
      return true;
    } catch {
      // Saved token expired/invalid — drop it from the quick-switch list and
      // let the person sign in with a password instead.
      const remaining = loadSavedAccounts().filter((a) => a.id !== accountId);
      saveSavedAccounts(remaining);
      setSavedAccounts(remaining);
      localStorage.removeItem('lj_token');
      return false;
    }
  }, []);

  const removeSavedAccount = useCallback((accountId) => {
    const remaining = loadSavedAccounts().filter((a) => a.id !== accountId);
    saveSavedAccounts(remaining);
    setSavedAccounts(remaining);
  }, []);

  return (
    <AuthContext.Provider value={{ user, ready, login, register, logout, setUser, savedAccounts, switchAccount, removeSavedAccount }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
