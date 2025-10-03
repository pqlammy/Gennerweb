import React, { useEffect, useState } from 'react';
import { X, Loader2 } from 'lucide-react';
import type { Contribution } from '../types';
import { api } from '../lib/api';

type EditPersonalContributionModalProps = {
  contribution: Contribution | null;
  onClose: () => void;
  onSave: (contribution: Contribution) => void;
};

type PersonalDetails = {
  first_name: string;
  last_name: string;
  email: string;
  address: string;
  city: string;
  postal_code: string;
};

const toPersonalDetails = (contribution: Contribution): PersonalDetails => ({
  first_name: contribution.first_name,
  last_name: contribution.last_name,
  email: contribution.email,
  address: contribution.address,
  city: contribution.city,
  postal_code: contribution.postal_code
});

export function EditPersonalContributionModal({ contribution, onClose, onSave }: EditPersonalContributionModalProps) {
  const [form, setForm] = useState<PersonalDetails | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isOpen = Boolean(contribution);

  useEffect(() => {
    if (contribution) {
      setForm(toPersonalDetails(contribution));
    } else {
      setForm(null);
    }
  }, [contribution]);

  if (!isOpen || !form) {
    return null;
  }

  const handleChange = (field: keyof PersonalDetails, value: string) => {
    setForm((prev) => (prev ? { ...prev, [field]: value } : prev));
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!contribution) {
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const payload = {
        first_name: form.first_name.trim(),
        last_name: form.last_name.trim(),
        email: form.email.trim(),
        address: form.address.trim(),
        city: form.city.trim(),
        postal_code: form.postal_code.trim()
      };

      const updated = await api.updateContributionContact(contribution.id, payload);
      onSave(updated);
      onClose();
    } catch (err) {
      console.error('Failed to update contribution details', err);
      setError(err instanceof Error ? err.message : 'Änderungen konnten nicht gespeichert werden');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4">
      <div className="relative w-full max-w-lg bg-slate-900 text-white rounded-lg shadow-xl">
        <button
          type="button"
          onClick={onClose}
          className="absolute top-4 right-4 text-gray-400 hover:text-white"
          aria-label="Schließen"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="p-6 border-b border-white/10">
          <h2 className="text-2xl font-semibold">Kontaktdaten bearbeiten</h2>
          <p className="text-sm text-gray-300 mt-1">Passe die Angaben des Beitrags ohne Statusänderung an.</p>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="bg-red-500/20 border border-red-500/40 text-red-200 rounded-lg p-3 text-sm">
              {error}
            </div>
          )}

          <div className="grid md:grid-cols-2 gap-4">
            <label className="flex flex-col text-sm text-gray-300">
              Vorname
              <input
                type="text"
                value={form.first_name}
                onChange={(event) => handleChange('first_name', event.target.value)}
                className="mt-1 px-3 py-2 rounded bg-black/40 border border-white/10 text-white focus:outline-none focus:ring-2 focus:ring-[var(--primary-color)]"
                required
              />
            </label>
            <label className="flex flex-col text-sm text-gray-300">
              Nachname
              <input
                type="text"
                value={form.last_name}
                onChange={(event) => handleChange('last_name', event.target.value)}
                className="mt-1 px-3 py-2 rounded bg-black/40 border border-white/10 text-white focus:outline-none focus:ring-2 focus:ring-[var(--primary-color)]"
                required
              />
            </label>
          </div>

          <label className="flex flex-col text-sm text-gray-300">
            E-Mail-Adresse
            <input
              type="email"
              value={form.email}
              onChange={(event) => handleChange('email', event.target.value)}
              className="mt-1 px-3 py-2 rounded bg-black/40 border border-white/10 text-white focus:outline-none focus:ring-2 focus:ring-[var(--primary-color)]"
              required
            />
          </label>

          <label className="flex flex-col text-sm text-gray-300">
            Adresse
            <input
              type="text"
              value={form.address}
              onChange={(event) => handleChange('address', event.target.value)}
              className="mt-1 px-3 py-2 rounded bg-black/40 border border-white/10 text-white focus:outline-none focus:ring-2 focus:ring-[var(--primary-color)]"
              required
            />
          </label>

          <div className="grid md:grid-cols-2 gap-4">
            <label className="flex flex-col text-sm text-gray-300">
              Ort
              <input
                type="text"
                value={form.city}
                onChange={(event) => handleChange('city', event.target.value)}
                className="mt-1 px-3 py-2 rounded bg-black/40 border border-white/10 text-white focus:outline-none focus:ring-2 focus:ring-[var(--primary-color)]"
                required
              />
            </label>
            <label className="flex flex-col text-sm text-gray-300">
              PLZ
              <input
                type="text"
                value={form.postal_code}
                onChange={(event) => handleChange('postal_code', event.target.value)}
                className="mt-1 px-3 py-2 rounded bg-black/40 border border-white/10 text-white focus:outline-none focus:ring-2 focus:ring-[var(--primary-color)]"
                required
              />
            </label>
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-md bg-white/10 text-white hover:bg-white/20"
            >
              Abbrechen
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-5 py-2 rounded-md bg-[var(--primary-color)] text-white hover:bg-[var(--primary-color-dark)] disabled:opacity-60 inline-flex items-center"
            >
              {saving ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" /> Speichere...
                </>
              ) : (
                'Speichern'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
