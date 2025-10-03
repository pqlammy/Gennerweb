// Centralized API helper (no Supabase)

import type { Contribution, LeaderboardResponse, PaymentMethod, PublicSiteSettings, SiteSettings, User } from '../types';

const resolveDefaultApiBase = () => {
  if (typeof window === 'undefined') {
    return 'http://localhost:3001';
  }

  const { protocol, hostname, port } = window.location;

  if (port && ['5173', '4173'].includes(port)) {
    return `${protocol}//${hostname}:3001`;
  }

  return `${protocol}//${hostname}`;
};

const API_BASE = (() => {
  const base = import.meta.env.VITE_API_BASE_URL?.trim() || resolveDefaultApiBase();
  return base.endsWith('/') ? base.slice(0, -1) : base;
})();

type RequestOptions = {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  body?: unknown;
  auth?: boolean;
};

const request = async <T>(path: string, { method = 'GET', body, auth = true }: RequestOptions = {}): Promise<T> => {
  const headers = new Headers();

  let payload: BodyInit | undefined;
  if (body !== undefined) {
    headers.set('Content-Type', 'application/json');
    payload = typeof body === 'string' ? (body as string) : JSON.stringify(body);
  }

  if (auth) {
    const token = localStorage.getItem('token');
    if (!token) {
      throw new Error('Authentication required');
    }
    headers.set('Authorization', `Bearer ${token}`);
  }

  const response = await fetch(`${API_BASE}${path}`, {
    method,
    headers,
    body: payload,
    credentials: 'include'
  });

  const contentType = response.headers.get('content-type');
  const hasJson = contentType && contentType.includes('application/json');
  const data = hasJson ? await response.json() : null;

  if (!response.ok) {
    const message = (data && (data.error || data.message)) || response.statusText || 'Request failed';
    throw new Error(message);
  }

  return (data ?? {}) as T;
};

export const api = {
  login(username: string, password: string) {
    return request<{ token: string; user: { id: string; username: string; role: string; email?: string | null } }>(
      '/auth/login',
      { method: 'POST', body: { username, password }, auth: false }
    );
  },

  register(username: string, password: string, email?: string) {
    return request<{ token: string; user: { id: string; username: string; role: string; email?: string | null } }>(
      '/auth/register',
      { method: 'POST', body: { username, password, email }, auth: false }
    );
  },

  getContributions() {
    return request<Contribution[]>('/api/contributions');
  },

  createContribution(data: unknown) {
    return request<Contribution>('/api/contributions', { method: 'POST', body: data });
  },

  updateContributionContact(id: string, data: {
    first_name: string;
    last_name: string;
    email: string;
    address: string;
    city: string;
    postal_code: string;
  }) {
    return request<Contribution>(`/api/contributions/${id}/contact`, { method: 'PUT', body: data });
  },

  updateContribution(id: string, data: unknown) {
    return request<Contribution>(`/api/contributions/${id}`, { method: 'PUT', body: data });
  },

  getUsers() {
    return request<Array<Pick<User, 'id' | 'username' | 'email' | 'role'>>>('/api/users');
  },

  getGennervogts() {
    return request<Array<Pick<User, 'id' | 'username' | 'email' | 'role'>>>('/api/gennervogts');
  },

  createUserAccount(data: { username: string; password: string; email?: string; role?: 'user' | 'admin' }) {
    return request<Pick<User, 'id' | 'username' | 'email' | 'role'>>('/api/admin/users', {
      method: 'POST',
      body: data
    });
  },

  updateUserAccount(id: string, data: { username: string; email?: string | null; role: 'user' | 'admin' }) {
    return request<Pick<User, 'id' | 'username' | 'email' | 'role'>>(`/api/admin/users/${id}`, {
      method: 'PUT',
      body: data
    });
  },

  resetUserPassword(id: string, password: string) {
    return request<Pick<User, 'id' | 'username' | 'email' | 'role'>>(`/api/admin/users/${id}/reset-password`, {
      method: 'POST',
      body: { password }
    });
  },

  changeOwnPassword(currentPassword: string, newPassword: string) {
    return request<{ success: boolean }>('/api/profile/change-password', {
      method: 'POST',
      body: { currentPassword, newPassword }
    });
  },

  updateContributionDetails(id: string, data: Record<string, unknown>) {
    return request<Contribution>(`/api/admin/contributions/${id}`, {
      method: 'PUT',
      body: data
    });
  },

  deleteContribution(id: string) {
    return request<{ success: boolean }>(`/api/contributions/${id}`, { method: 'DELETE' });
  },

  importContributions(data: unknown[]) {
    return request<{ count: number; contributions: Contribution[] }>(
      '/api/admin/contributions/import',
      { method: 'POST', body: data }
    );
  },

  markContributionsPaid(ids: string[]) {
    return request<{ contributions: Contribution[] }>('/api/admin/contributions/mark-paid', {
      method: 'POST',
      body: { ids }
    });
  },

  async exportContributions(): Promise<Blob> {
    const token = localStorage.getItem('token');
    if (!token) {
      throw new Error('Authentication required');
    }

    const response = await fetch(`${API_BASE}/api/admin/contributions/export`, {
      headers: {
        Authorization: `Bearer ${token}`
      },
      credentials: 'include'
    });

    if (!response.ok) {
      const message = await response.text();
      throw new Error(message || 'Failed to export contributions');
    }

    return response.blob();
  },

  async exportContributionsJson(): Promise<Blob> {
    const token = localStorage.getItem('token');
    if (!token) {
      throw new Error('Authentication required');
    }

    const response = await fetch(`${API_BASE}/api/admin/contributions/export.json`, {
      headers: {
        Authorization: `Bearer ${token}`
      },
      credentials: 'include'
    });

    if (!response.ok) {
      const message = await response.text();
      throw new Error(message || 'Failed to export contributions');
    }

    return response.blob();
  },

  createSettlement(payload: { contributionIds: string[]; paymentMethod: PaymentMethod }) {
    return request<{ settlementCode: string; contributions: Contribution[] }>(
      '/api/contributions/settlements',
      { method: 'POST', body: payload }
    );
  },

  getPublicSettings() {
    return request<PublicSiteSettings>('/api/settings/public', { auth: false });
  },

  getAdminSettings() {
    return request<SiteSettings>('/api/admin/settings');
  },

  updateSiteSettings(payload: Partial<SiteSettings>) {
    return request<SiteSettings>('/api/admin/settings', { method: 'PUT', body: payload });
  },

  getHealth() {
    return request<{ status: string; timestamp: string; uptimeSeconds: number; database: { status: string; latencyMs: number | null }; cache: { status: string; ageMs: number | null } }>('/api/admin/health');
  },

  getLeaderboard() {
    return request<LeaderboardResponse>('/api/stats/leaderboard');
  },

  checkUpdates() {
    type UpdateResponse = {
      branch: string;
      updateAvailable: boolean;
      ahead: number;
      behind: number;
      localCommit: string;
      remoteCommit: string;
      instructions: string;
      lastCheckedAt: string;
    };
    return request<UpdateResponse>('/api/admin/update/check');
  }
};
