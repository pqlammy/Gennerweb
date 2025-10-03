import React, { useEffect, useState } from 'react';
import { X, Loader2 } from 'lucide-react';
import type { Contribution, User } from '../types';
import { api } from '../lib/api';

type EditContributionModalProps = {
  contribution: Contribution | null;
  onClose: () => void;
  onSave: (contribution: Contribution) => void;
};

type EditableContribution = {
  amount: string;
  first_name: string;
  last_name: string;
  email: string;
  address: string;
  city: string;
  postal_code: string;
  gennervogt_id: string;
  paid: boolean;
  payment_method: Contribution['payment_method'];
  payment_status: Contribution['payment_status'];
};

const toEditable = (contribution: Contribution): EditableContribution => ({
  amount: contribution.amount.toString(),
  first_name: contribution.first_name,
  last_name: contribution.last_name,
  email: contribution.email,
  address: contribution.address,
  city: contribution.city,
  postal_code: contribution.postal_code,
  gennervogt_id: contribution.gennervogt_id ?? '',
  paid: contribution.paid,
  payment_method: contribution.payment_method,
  payment_status: contribution.payment_status
});

export function EditContributionModal({ contribution, onClose, onSave }: EditContributionModalProps) {
  const [form, setForm] = useState<EditableContribution | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [users, setUsers] = useState<Pick<User, 'id' | 'username' | 'email' | 'role'>[]>([]);
  const isOpen = Boolean(contribution);

  useEffect(() => {
    if (contribution) {
      setForm(toEditable(contribution));
    } else {
      setForm(null);
    }
  }, [contribution]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    let isMounted = true;

    async function loadUsers() {
      try {
        const data = await api.getUsers();
        if (isMounted) {
          setUsers(data);
        }
      } catch (err) {
        console.error('Failed to load users for contribution edit', err);
      }
    }

    loadUsers();

    return () => {
      isMounted = false;
    };
  }, [isOpen]);

  const handleChange = (field: keyof EditableContribution, value: string | boolean) => {
    if (!form) return;
    setForm({ ...form, [field]: value });
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!contribution || !form) {
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const payload = {
        amount: Number.parseFloat(form.amount),
        first_name: form.first_name,
        last_name: form.last_name,
        email: form.email,
        address: form.address,
        city: form.city,
        postal_code: form.postal_code,
        gennervogt_id: form.gennervogt_id || null,
        paid: form.payment_status.endsWith('_paid'),
        payment_method: form.payment_method,
        payment_status: form.payment_status
      };

      if (!Number.isFinite(payload.amount) || payload.amount <= 0) {
        throw new Error('Bitte einen gültigen Betrag angeben');
      }

      const updated = await api.updateContributionDetails(contribution.id, payload);
      onSave(updated);
      onClose();
    } catch (err) {
      console.error('Failed to update contribution', err);
      setError(err instanceof Error ? err.message : 'Änderungen konnten nicht gespeichert werden');
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen || !form) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4">
      <div className="relative w-full max-w-2xl bg-slate-900 text-white rounded-lg shadow-xl">
        <button
          type="button"
          onClick={onClose}
          className="absolute top-4 right-4 text-gray-400 hover:text-white"
          aria-label="Schließen"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="p-6 border-b border-white/10">
          <h2 className="text-2xl font-semibold">Beitrag bearbeiten</h2>
          <p className="text-sm text-gray-300 mt-1">Passe die Details des Beitrags an und speichere deine Änderungen.</p>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="bg-red-500/20 border border-red-500/40 text-red-200 rounded-lg p-3 text-sm">
              {error}
            </div>
          )}

          <div className="grid md:grid-cols-3 gap-4">
            <label className="flex flex-col text-sm text-gray-300">
              Betrag (CHF)
              <input
                type="number"
                step="0.05"
                min="0"
                value={form.amount}
                onChange={(event) => handleChange('amount', event.target.value)}
                className="mt-1 px-3 py-2 rounded bg-black/40 border border-white/10 text-white focus:outline-none focus:ring-2 focus:ring-red-500"
                required
              />
            </label>

            <label className="flex flex-col text-sm text-gray-300">
              Zahlungsstatus
              <select
                value={form.payment_status}
                onChange={(event) => {
                  const nextStatus = event.target.value as Contribution['payment_status'];
                  handleChange('payment_status', nextStatus);
                  handleChange('paid', nextStatus.endsWith('_paid'));
                }}
                className="mt-1 px-3 py-2 rounded bg-black/40 border border-white/10 text-white focus:outline-none focus:ring-2 focus:ring-red-500"
              >
                <option value="unpaid">Offen</option>
                <option value="twint_pending">TWINT gemeldet</option>
                <option value="cash_pending">Bargeld gemeldet</option>
                <option value="twint_paid">Bezahlt (TWINT)</option>
                <option value="cash_paid">Bezahlt (Bargeld)</option>
              </select>
            </label>
            <label className="flex flex-col text-sm text-gray-300">
              Zahlungsmethode
              <select
                value={form.payment_method}
                onChange={(event) => handleChange('payment_method', event.target.value)}
                className="mt-1 px-3 py-2 rounded bg-black/40 border border-white/10 text-white focus:outline-none focus:ring-2 focus:ring-red-500"
              >
                <option value="twint">TWINT</option>
                <option value="cash">Bargeld</option>
              </select>
            </label>
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            <label className="flex flex-col text-sm text-gray-300">
              Vorname
              <input
                type="text"
                value={form.first_name}
                onChange={(event) => handleChange('first_name', event.target.value)}
                className="mt-1 px-3 py-2 rounded bg-black/40 border border-white/10 text-white focus:outline-none focus:ring-2 focus:ring-red-500"
                required
              />
            </label>

            <label className="flex flex-col text-sm text-gray-300">
              Nachname
              <input
                type="text"
                value={form.last_name}
                onChange={(event) => handleChange('last_name', event.target.value)}
                className="mt-1 px-3 py-2 rounded bg-black/40 border border-white/10 text-white focus:outline-none focus:ring-2 focus:ring-red-500"
                required
              />
            </label>
          </div>

          <label className="flex flex-col text-sm text-gray-300">
            E-Mail
            <input
              type="email"
              value={form.email}
              onChange={(event) => handleChange('email', event.target.value)}
              className="mt-1 px-3 py-2 rounded bg-black/40 border border-white/10 text-white focus:outline-none focus:ring-2 focus:ring-red-500"
              required
            />
          </label>

          <label className="flex flex-col text-sm text-gray-300">
            Adresse
            <input
              type="text"
              value={form.address}
              onChange={(event) => handleChange('address', event.target.value)}
              className="mt-1 px-3 py-2 rounded bg-black/40 border border-white/10 text-white focus:outline-none focus:ring-2 focus:ring-red-500"
              required
            />
          </label>

          <div className="grid md:grid-cols-3 gap-4">
            <label className="flex flex-col text-sm text-gray-300 md:col-span-2">
              Stadt
              <input
                type="text"
                value={form.city}
                onChange={(event) => handleChange('city', event.target.value)}
                className="mt-1 px-3 py-2 rounded bg-black/40 border border-white/10 text-white focus:outline-none focus:ring-2 focus:ring-red-500"
                required
              />
            </label>
            <label className="flex flex-col text-sm text-gray-300">
              PLZ
              <input
                type="text"
                value={form.postal_code}
                onChange={(event) => handleChange('postal_code', event.target.value)}
                className="mt-1 px-3 py-2 rounded bg-black/40 border border-white/10 text-white focus:outline-none focus:ring-2 focus:ring-red-500"
                required
              />
            </label>
          </div>

          <label className="flex flex-col text-sm text-gray-300">
            Verantwortlicher Gennervogt
            <select
              value={form.gennervogt_id}
              onChange={(event) => handleChange('gennervogt_id', event.target.value)}
              className="mt-1 px-3 py-2 rounded bg-black/40 border border-white/10 text-white focus:outline-none focus:ring-2 focus:ring-red-500"
            >
              <option value="">Nicht zugewiesen</option>
              {users.map((user) => (
                <option key={user.id} value={user.id}>
                  {user.username}
                  {user.email ? ` (${user.email})` : ''} ({user.role})
                </option>
              ))}
            </select>
          </label>

          <div className="flex justify-end space-x-3 pt-4 border-t border-white/10">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-gray-300 hover:text-white"
            >
              Abbrechen
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 transition-colors disabled:opacity-60 flex items-center"
            >
              {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />} Speichern
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
