import React, { useState } from 'react';
import { User, Mail, Lock } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { api } from '../lib/api';

export function UserProfile() {
  const { user } = useAuth();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!user) {
    return null;
  }

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setSuccess(null);

    if (newPassword !== confirmPassword) {
      setError('Die neuen Passwörter stimmen nicht überein');
      return;
    }

    try {
      setSaving(true);
      await api.changeOwnPassword(currentPassword, newPassword);
      setSuccess('Passwort wurde geändert');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err) {
      console.error('Failed to change password', err);
      setError(err instanceof Error ? err.message : 'Passwort konnte nicht geändert werden');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-8">
      <div className="bg-white/10 backdrop-blur-lg rounded-lg p-6 flex items-center space-x-4">
        <div className="p-4 bg-red-600/60 rounded-full">
          <User className="w-10 h-10 text-white" />
        </div>
        <div>
          <h1 className="text-3xl font-bold text-white">Profil</h1>
          <p className="text-gray-300">Deine Zugangsdaten im Überblick.</p>
        </div>
      </div>

      <div className="bg-white/10 backdrop-blur-lg rounded-lg p-6 space-y-6">
        <div>
          <p className="text-sm text-gray-400 uppercase tracking-wide">Benutzername</p>
          <div className="flex items-center mt-2 space-x-3 text-white">
            <User className="w-5 h-5 text-gray-300" />
            <span>{user.username}</span>
          </div>
        </div>
        <div>
          <p className="text-sm text-gray-400 uppercase tracking-wide">E-Mail</p>
          <div className="flex items-center mt-2 space-x-3 text-white">
            <Mail className="w-5 h-5 text-gray-300" />
            <span>{user.email ?? 'Keine E-Mail hinterlegt'}</span>
          </div>
        </div>

        <div>
          <p className="text-sm text-gray-400 uppercase tracking-wide">Rolle</p>
          <p className="text-white mt-2">{user.role}</p>
        </div>

        <div>
          <p className="text-sm text-gray-400 uppercase tracking-wide mb-3 flex items-center">
            <Lock className="w-4 h-4 mr-2" /> Passwort ändern
          </p>

          {success && (
            <div className="mb-4 bg-green-500/20 border border-green-500/40 text-green-200 rounded-lg p-3 text-sm">
              {success}
            </div>
          )}

          {error && (
            <div className="mb-4 bg-red-500/20 border border-red-500/40 text-red-200 rounded-lg p-3 text-sm">
              {error}
            </div>
          )}

          <form className="grid gap-4 md:grid-cols-2" onSubmit={handleSubmit}>
            <label className="flex flex-col text-sm text-gray-300 md:col-span-2">
              Aktuelles Passwort
              <input
                type="password"
                required
                value={currentPassword}
                onChange={(event) => setCurrentPassword(event.target.value)}
                className="mt-1 px-3 py-2 rounded bg-black/40 border border-white/10 text-white focus:outline-none focus:ring-2 focus:ring-red-500"
              />
            </label>

            <label className="flex flex-col text-sm text-gray-300">
              Neues Passwort
              <input
                type="password"
                required
                minLength={8}
                value={newPassword}
                onChange={(event) => setNewPassword(event.target.value)}
                className="mt-1 px-3 py-2 rounded bg-black/40 border border-white/10 text-white focus:outline-none focus:ring-2 focus:ring-red-500"
              />
            </label>

            <label className="flex flex-col text-sm text-gray-300">
              Neues Passwort bestätigen
              <input
                type="password"
                required
                minLength={8}
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                className="mt-1 px-3 py-2 rounded bg-black/40 border border-white/10 text-white focus:outline-none focus:ring-2 focus:ring-red-500"
              />
            </label>

            <div className="md:col-span-2 flex justify-end">
              <button
                type="submit"
                disabled={saving}
                className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 transition-colors disabled:opacity-60"
              >
                {saving ? 'Speichern...' : 'Passwort aktualisieren'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
