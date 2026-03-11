'use client';

import { createContext, useContext, useEffect, useState, useCallback } from 'react';

export interface User {
  id: string;
  name: string;
  email: string;
  token: string;
  role: string;
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<string | null>;
  register: (name: string, email: string, password: string) => Promise<string | null>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | null>(null);

const API = process.env.NEXT_PUBLIC_API_URL?.replace('/chat', '') ?? 'https://sleocl2mk5.execute-api.eu-north-1.amazonaws.com/Prod';

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    try {
      const stored = localStorage.getItem('mg_user');
      if (stored) setUser(JSON.parse(stored));
    } catch {}
    setLoading(false);
  }, []);

  const login = useCallback(async (email: string, password: string): Promise<string | null> => {
    try {
      const res = await fetch(`${API}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) return data.error || 'Login failed';
      const u: User = { id: data.user_id, name: data.name, email: data.email, token: data.token, role: data.role || 'user' };
      setUser(u);
      localStorage.setItem('mg_user', JSON.stringify(u));
      return null;
    } catch {
      return 'Network error. Please try again.';
    }
  }, []);

  const register = useCallback(async (name: string, email: string, password: string): Promise<string | null> => {
    try {
      const res = await fetch(`${API}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, password }),
      });
      const data = await res.json();
      if (!res.ok) return data.error || 'Registration failed';
      const u: User = { id: data.user_id, name: data.name, email: data.email, token: data.token, role: data.role || 'user' };
      setUser(u);
      localStorage.setItem('mg_user', JSON.stringify(u));
      return null;
    } catch {
      return 'Network error. Please try again.';
    }
  }, []);

  const logout = useCallback(() => {
    setUser(null);
    localStorage.removeItem('mg_user');
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
