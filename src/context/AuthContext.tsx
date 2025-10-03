import React, { createContext, useContext, useState, useEffect } from 'react';
import { api } from '../lib/api';
import type { User } from '../types';

type AuthContextType = {
  user: User | null;
  loading: boolean;
  signIn: (username: string, password: string) => Promise<{
    data: { user: User | null } | null;
    error: Error | null;
  }>;
  signOut: () => Promise<void>;
  signUp: (username: string, password: string, email?: string) => Promise<void>;
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Check for stored token
    const token = localStorage.getItem('token');
    if (token) {
      try {
        const payload = JSON.parse(atob(token.split('.')[1]));
        setUser({
          id: payload.userId,
          username: payload.username,
          role: payload.role,
          email: payload.email ?? null
        });
      } catch (error) {
        localStorage.removeItem('token');
      }
    }
    setLoading(false);
  }, []);

  const signIn = async (username: string, password: string) => {
    try {
      const data = await api.login(username, password);
      localStorage.setItem('token', data.token);
      setUser(data.user);
      return { data: { user: data.user }, error: null };
    } catch (error) {
      return { data: null, error: error as Error };
    }
  };

  const signUp = async (username: string, password: string, email?: string) => {
    const data = await api.register(username, password, email);
    localStorage.setItem('token', data.token);
    setUser(data.user);
  };

  const signOut = async () => {
    localStorage.removeItem('token');
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, loading, signIn, signOut, signUp }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
