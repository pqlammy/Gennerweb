import React, { useEffect, useState } from 'react';
import { Users, RefreshCw, Plus, Lock } from 'lucide-react';
import { api } from '../lib/api';
import type { User } from '../types';

type ManagedUser = Pick<User, 'id' | 'username' | 'email' | 'role'>;

const initialFormState = {
  username: '',
  email: '',
  password: '',
  role: 'user' as 'user' | 'admin'
};

export function AdminMembers() {
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [createForm, setCreateForm] = useState(initialFormState);
  const [createLoading, setCreateLoading] = useState(false);
  const [resetPasswordFor, setResetPasswordFor] = useState<string | null>(null);
  const [resetPasswordValue, setResetPasswordValue] = useState('');
  const [resetLoading, setResetLoading] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [editMemberId, setEditMemberId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<{ username: string; email: string; role: 'user' | 'admin' }>({
    username: '',
    email: '',
    role: 'user'
  });
  const [editLoading, setEditLoading] = useState<string | null>(null);

  const loadUsers = async () => {
    try {
      setError(null);
      const data = await api.getUsers();
      setUsers(data);
    } catch (err) {
      console.error('Failed to load members', err);
      setError('Mitglieder konnten nicht geladen werden');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadUsers();
  }, []);

  const handleCreateUser = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setCreateLoading(true);
    setSuccessMessage(null);
    setError(null);

    try {
      const username = createForm.username.trim();

      if (username.length < 3) {
        throw new Error('Bitte einen gültigen Benutzernamen (mind. 3 Zeichen) eingeben');
      }

      await api.createUserAccount({
        username,
        password: createForm.password,
        role: createForm.role,
        email: createForm.email.trim() ? createForm.email.trim() : undefined
      });
      setSuccessMessage('Account wurde erstellt');
      setCreateForm(initialFormState);
      await loadUsers();
    } catch (err) {
      console.error('Failed to create user', err);
      setError(err instanceof Error ? err.message : 'Account konnte nicht erstellt werden');
    } finally {
      setCreateLoading(false);
    }
  };

  const handleResetPassword = async (userId: string, event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!resetPasswordValue) {
      setError('Bitte ein neues Passwort eingeben');
      return;
    }

    setResetLoading(userId);
    setSuccessMessage(null);
    setError(null);

    try {
      await api.resetUserPassword(userId, resetPasswordValue);
      setSuccessMessage('Passwort wurde aktualisiert');
      setResetPasswordValue('');
      setResetPasswordFor(null);
    } catch (err) {
      console.error('Failed to reset password', err);
      setError('Passwort konnte nicht geändert werden');
    } finally {
      setResetLoading(null);
    }
  };

  const handleEditMember = (member: ManagedUser) => {
    setEditMemberId(member.id);
    setEditForm({ username: member.username, email: member.email ?? '', role: member.role });
    setSuccessMessage(null);
    setError(null);
  };

  const handleUpdateMember = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!editMemberId) {
      return;
    }

    setEditLoading(editMemberId);
    setSuccessMessage(null);
    setError(null);

    try {
      const username = editForm.username.trim();
      if (username.length < 3) {
        throw new Error('Benutzername muss mindestens 3 Zeichen haben');
      }

      const updated = await api.updateUserAccount(editMemberId, {
        username,
        email: editForm.email.trim() ? editForm.email.trim() : null,
        role: editForm.role
      });
      setUsers((prev) => prev.map((member) => (member.id === updated.id ? updated : member)));
      setSuccessMessage('Mitglied wurde aktualisiert');
      setEditMemberId(null);
    } catch (err) {
      console.error('Failed to update user', err);
      setError(err instanceof Error ? err.message : 'Mitglied konnte nicht aktualisiert werden');
    } finally {
      setEditLoading(null);
    }
  };

  return (
    <div className="space-y-8">
      <div className="bg-white/10 backdrop-blur-lg rounded-lg p-6 flex flex-col md:flex-row md:items-center md:space-x-4 space-y-4 md:space-y-0">
        <div className="p-4 bg-red-600/60 rounded-full self-start md:self-center">
          <Users className="w-10 h-10 text-white" />
        </div>
        <div>
          <h1 className="text-3xl font-bold text-white">Mitgliederverwaltung</h1>
          <p className="text-gray-300">Erstelle neue Zugänge und setze Passwörter zurück.</p>
        </div>
      </div>

      {successMessage && (
        <div className="bg-green-500/20 border border-green-500/40 text-green-200 rounded-lg p-4">
          {successMessage}
        </div>
      )}

      {error && (
        <div className="bg-red-500/20 border border-red-500/40 text-red-200 rounded-lg p-4">
          {error}
        </div>
      )}

      <div className="bg-white/10 backdrop-blur-lg rounded-lg p-6">
        <h2 className="text-xl font-semibold text-white mb-4 flex items-center">
          <Plus className="w-5 h-5 text-red-400 mr-2" />
          Neuen Account erstellen
        </h2>
        <form className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" onSubmit={handleCreateUser}>
          <label className="flex flex-col text-sm text-gray-300">
            Benutzername
            <input
              type="text"
              required
              minLength={3}
              value={createForm.username}
              onChange={(event) => setCreateForm((prev) => ({ ...prev, username: event.target.value }))}
              className="mt-1 px-3 py-2 rounded bg-black/40 border border-white/10 text-white focus:outline-none focus:ring-2 focus:ring-red-500"
            />
          </label>

          <label className="flex flex-col text-sm text-gray-300">
            E-Mail (optional)
            <input
              type="email"
              value={createForm.email}
              onChange={(event) => setCreateForm((prev) => ({ ...prev, email: event.target.value }))}
              className="mt-1 px-3 py-2 rounded bg-black/40 border border-white/10 text-white focus:outline-none focus:ring-2 focus:ring-red-500"
            />
          </label>

          <label className="flex flex-col text-sm text-gray-300">
            Passwort
            <input
              type="password"
              required
              minLength={8}
              value={createForm.password}
              onChange={(event) => setCreateForm((prev) => ({ ...prev, password: event.target.value }))}
              className="mt-1 px-3 py-2 rounded bg-black/40 border border-white/10 text-white focus:outline-none focus:ring-2 focus:ring-red-500"
            />
          </label>

          <label className="flex flex-col text-sm text-gray-300">
            Rolle
            <select
              value={createForm.role}
              onChange={(event) =>
                setCreateForm((prev) => ({ ...prev, role: event.target.value as 'user' | 'admin' }))
              }
              className="mt-1 px-3 py-2 rounded bg-black/40 border border-white/10 text-white focus:outline-none focus:ring-2 focus:ring-red-500"
            >
              <option value="user">User</option>
              <option value="admin">Admin</option>
            </select>
          </label>

          <div className="lg:col-span-3 sm:col-span-2 flex justify-end">
            <button
              type="submit"
              disabled={createLoading}
              className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 transition-colors disabled:opacity-60 w-full sm:w-auto"
            >
              {createLoading ? 'Speichern...' : 'Account anlegen'}
            </button>
          </div>
        </form>
      </div>

      <div className="bg-white/10 backdrop-blur-lg rounded-lg p-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
          <h2 className="text-xl font-semibold text-white">Bestehende Mitglieder</h2>
          <button
            onClick={loadUsers}
            className="flex items-center justify-center px-3 py-2 text-sm text-gray-300 bg-black/30 rounded-md hover:bg-black/40"
          >
            <RefreshCw className="w-4 h-4 mr-2" />
            Aktualisieren
          </button>
        </div>

        {loading ? (
          <div className="flex justify-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-red-500" />
          </div>
        ) : (
          <>
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="text-gray-300 text-sm uppercase tracking-wide">
                    <th className="py-3">Benutzername</th>
                    <th className="py-3">E-Mail</th>
                    <th className="py-3">Rolle</th>
                    <th className="py-3">Aktionen</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/10 text-white">
                  {users.map((member) => (
                    <tr key={member.id}>
                      <td className="py-3 pr-4">{member.username}</td>
                      <td className="py-3 pr-4">{member.email ?? '–'}</td>
                      <td className="py-3 pr-4 capitalize">{member.role}</td>
                      <td className="py-3">
                        {editMemberId === member.id ? (
                          <form
                            className="flex flex-wrap items-center gap-2 mb-3"
                            onSubmit={handleUpdateMember}
                          >
                            <input
                              type="text"
                              required
                              minLength={3}
                              value={editForm.username}
                              onChange={(event) =>
                                setEditForm((prev) => ({ ...prev, username: event.target.value }))
                              }
                              className="px-3 py-2 rounded bg-black/40 border border-white/10 text-white focus:outline-none focus:ring-2 focus:ring-red-500"
                            />
                            <input
                              type="email"
                              required
                              value={editForm.email}
                              onChange={(event) =>
                                setEditForm((prev) => ({ ...prev, email: event.target.value }))
                              }
                              className="px-3 py-2 rounded bg-black/40 border border-white/10 text-white focus:outline-none focus:ring-2 focus:ring-red-500"
                            />
                            <select
                              value={editForm.role}
                              onChange={(event) =>
                                setEditForm((prev) => ({ ...prev, role: event.target.value as 'user' | 'admin' }))
                              }
                              className="px-3 py-2 rounded bg-black/40 border border-white/10 text-white focus:outline-none focus:ring-2 focus:ring-red-500"
                            >
                              <option value="user">User</option>
                              <option value="admin">Admin</option>
                            </select>
                            <button
                              type="submit"
                              disabled={editLoading === member.id}
                              className="px-3 py-2 bg-green-600 rounded text-sm hover:bg-green-700 disabled:opacity-60"
                            >
                              {editLoading === member.id ? 'Speichern...' : 'Aktualisieren'}
                            </button>
                            <button
                              type="button"
                              onClick={() => setEditMemberId(null)}
                              className="px-3 py-2 text-sm text-gray-300 hover:text-white"
                            >
                              Abbrechen
                            </button>
                          </form>
                        ) : (
                          <button
                            onClick={() => handleEditMember(member)}
                            className="flex items-center px-3 py-2 text-sm bg-black/30 rounded-md hover:bg-black/40 mb-2"
                          >
                            Benutzerdaten bearbeiten
                          </button>
                        )}

                        {resetPasswordFor === member.id ? (
                          <form
                            className="flex flex-wrap items-center gap-2"
                            onSubmit={(event) => handleResetPassword(member.id, event)}
                          >
                            <input
                              type="password"
                              minLength={8}
                              required
                              placeholder="Neues Passwort"
                              value={resetPasswordValue}
                              onChange={(event) => setResetPasswordValue(event.target.value)}
                              className="px-3 py-2 rounded bg-black/40 border border-white/10 text-white focus:outline-none focus:ring-2 focus:ring-red-500"
                            />
                            <button
                              type="submit"
                              disabled={resetLoading === member.id}
                              className="px-3 py-2 bg-red-600 rounded text-sm hover:bg-red-700 disabled:opacity-60"
                            >
                              {resetLoading === member.id ? 'Speichern...' : 'Bestätigen'}
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setResetPasswordFor(null);
                                setResetPasswordValue('');
                              }}
                              className="px-3 py-2 text-sm text-gray-300 hover:text-white"
                            >
                              Abbrechen
                            </button>
                          </form>
                        ) : (
                          <button
                            onClick={() => {
                              setResetPasswordFor(member.id);
                              setResetPasswordValue('');
                            }}
                            className="flex items-center px-3 py-2 text-sm bg-black/30 rounded-md hover:bg-black/40"
                          >
                            <Lock className="w-4 h-4 mr-2" />
                            Passwort zurücksetzen
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                  {users.length === 0 && (
                    <tr>
                      <td colSpan={4} className="py-6 text-center text-gray-400">
                        Keine Mitglieder gefunden.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="md:hidden space-y-4">
              {users.map((member) => (
                <div key={member.id} className="p-4 bg-black/30 rounded-lg space-y-3">
                  <div>
                    <p className="text-white font-semibold break-words">{member.username}</p>
                    <p className="text-xs text-gray-400 break-words">
                      {member.email ?? 'Keine E-Mail hinterlegt'}
                    </p>
                    <p className="text-xs text-gray-400 capitalize">Rolle: {member.role}</p>
                  </div>

                {editMemberId === member.id ? (
                  <form className="space-y-3" onSubmit={handleUpdateMember}>
                    <input
                      type="text"
                      required
                      minLength={3}
                      value={editForm.username}
                      onChange={(event) =>
                        setEditForm((prev) => ({ ...prev, username: event.target.value }))
                      }
                      className="w-full px-3 py-2 rounded bg-black/40 border border-white/10 text-white focus:outline-none focus:ring-2 focus:ring-red-500"
                    />
                    <input
                      type="email"
                      required
                      value={editForm.email}
                      onChange={(event) =>
                        setEditForm((prev) => ({ ...prev, email: event.target.value }))
                      }
                      className="w-full px-3 py-2 rounded bg-black/40 border border-white/10 text-white focus:outline-none focus:ring-2 focus:ring-red-500"
                    />
                    <select
                      value={editForm.role}
                      onChange={(event) =>
                        setEditForm((prev) => ({ ...prev, role: event.target.value as 'user' | 'admin' }))
                      }
                      className="w-full px-3 py-2 rounded bg-black/40 border border-white/10 text-white focus:outline-none focus:ring-2 focus:ring-red-500"
                    >
                      <option value="user">User</option>
                      <option value="admin">Admin</option>
                    </select>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="submit"
                        disabled={editLoading === member.id}
                        className="flex-1 px-3 py-2 bg-green-600 rounded text-sm hover:bg-green-700 disabled:opacity-60"
                      >
                        {editLoading === member.id ? 'Speichern...' : 'Aktualisieren'}
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditMemberId(null)}
                        className="flex-1 px-3 py-2 text-sm text-gray-300 hover:text-white"
                      >
                        Abbrechen
                      </button>
                    </div>
                  </form>
                ) : (
                  <button
                    onClick={() => handleEditMember(member)}
                    className="w-full px-3 py-2 text-sm bg-black/40 rounded-md text-gray-200 hover:bg-black/50"
                  >
                    Benutzerdaten bearbeiten
                  </button>
                )}

                  {resetPasswordFor === member.id ? (
                    <form className="space-y-3" onSubmit={(event) => handleResetPassword(member.id, event)}>
                      <input
                        type="password"
                        minLength={8}
                        required
                        placeholder="Neues Passwort"
                        value={resetPasswordValue}
                        onChange={(event) => setResetPasswordValue(event.target.value)}
                        className="w-full px-3 py-2 rounded bg-black/40 border border-white/10 text-white focus:outline-none focus:ring-2 focus:ring-red-500"
                      />
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="submit"
                          disabled={resetLoading === member.id}
                          className="flex-1 px-3 py-2 bg-red-600 rounded text-sm hover:bg-red-700 disabled:opacity-60"
                        >
                          {resetLoading === member.id ? 'Speichern...' : 'Bestätigen'}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setResetPasswordFor(null);
                            setResetPasswordValue('');
                          }}
                          className="flex-1 px-3 py-2 text-sm text-gray-300 hover:text-white"
                        >
                          Abbrechen
                        </button>
                      </div>
                    </form>
                  ) : (
                    <button
                      onClick={() => {
                        setResetPasswordFor(member.id);
                        setResetPasswordValue('');
                      }}
                      className="w-full px-3 py-2 text-sm bg-black/40 rounded-md text-gray-200 hover:bg-black/50"
                    >
                      <Lock className="w-4 h-4 mr-2 inline" /> Passwort zurücksetzen
                    </button>
                  )}
                </div>
              ))}

              {users.length === 0 && (
                <p className="text-center text-gray-400">Keine Mitglieder gefunden.</p>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
