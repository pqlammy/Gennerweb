import React, { useEffect, useMemo, useState } from 'react';
import { Clipboard, CreditCard, Loader2, Wallet } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { api } from '../lib/api';
import type { Contribution, PaymentMethod, PaymentStatus } from '../types';

const statusLabels: Record<PaymentStatus, string> = {
  unpaid: 'Offen',
  twint_pending: 'TWINT gemeldet',
  cash_pending: 'Bargeld gemeldet',
  twint_paid: 'Bezahlt (TWINT)',
  cash_paid: 'Bezahlt (Bargeld)'
};

const statusBadge: Record<PaymentStatus, string> = {
  unpaid: 'bg-yellow-500/20 text-yellow-300',
  twint_pending: 'bg-blue-500/20 text-blue-300',
  cash_pending: 'bg-orange-500/20 text-orange-300',
  twint_paid: 'bg-green-500/20 text-green-400',
  cash_paid: 'bg-green-500/20 text-green-400'
};

const paymentMethodLabel: Record<PaymentMethod, string> = {
  twint: 'TWINT',
  cash: 'Bargeld'
};

export function UserSettlement() {
  const { user } = useAuth();
  const [contributions, setContributions] = useState<Contribution[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [selectedMethod, setSelectedMethod] = useState<PaymentMethod | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successCode, setSuccessCode] = useState<string | null>(null);
  const [copyMessage, setCopyMessage] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        setLoading(true);
        const data = await api.getContributions();
        setContributions(data);
      } catch (err) {
        console.error('Failed to load contributions', err);
        setError('Beiträge konnten nicht geladen werden');
      } finally {
        setLoading(false);
      }
    }

    load();
  }, []);

  const unpaidContributions = useMemo(
    () => contributions.filter((entry) => entry.payment_status === 'unpaid'),
    [contributions]
  );

  const hasSelection = selectedIds.size > 0 && selectedMethod !== null;
  const totalSelected = useMemo(() => {
    return unpaidContributions
      .filter((entry) => selectedIds.has(entry.id))
      .reduce((sum, entry) => sum + Number(entry.amount), 0);
  }, [unpaidContributions, selectedIds]);

  const toggleSelection = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const toggleAll = () => {
    if (selectedIds.size === unpaidContributions.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(unpaidContributions.map((entry) => entry.id)));
    }
  };

  const handleCopyCode = async (code: string) => {
    try {
      await navigator.clipboard.writeText(code);
      setCopyMessage('Abrechnungscode kopiert');
      setTimeout(() => setCopyMessage(null), 2000);
    } catch (err) {
      console.error('Clipboard copy failed', err);
      setCopyMessage('Konnte nicht kopiert werden');
      setTimeout(() => setCopyMessage(null), 2000);
    }
  };

  const refreshContributions = async () => {
    try {
      const data = await api.getContributions();
      setContributions(data);
    } catch (err) {
      console.error('Failed to refresh contributions', err);
    }
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedMethod || selectedIds.size === 0) {
      setError('Bitte wähle mindestens einen Beitrag und eine Zahlungsmethode aus.');
      return;
    }

    try {
      setSubmitting(true);
      setError(null);
      const response = await api.createSettlement({
        contributionIds: Array.from(selectedIds),
        paymentMethod: selectedMethod
      });
      setSuccessCode(response.settlementCode);
      setSelectedIds(new Set());
      setSelectedMethod(null);
      await refreshContributions();
    } catch (err) {
      console.error('Failed to create settlement', err);
      setError(err instanceof Error ? err.message : 'Abrechnung konnte nicht erstellt werden');
    } finally {
      setSubmitting(false);
    }
  };

  if (!user) {
    return null;
  }

  return (
    <div className="space-y-8">
      <header className="bg-white/10 backdrop-blur-lg rounded-lg p-6 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-3xl font-bold text-white">Abrechnung erstellen</h1>
          <p className="text-gray-300 mt-2">
            Wähle offene Beiträge aus, melde sie als bezahlt und teile den generierten Abrechnungscode mit dem Admin-Team.
          </p>
        </div>
        <div className="flex gap-3">
          {(['twint', 'cash'] as PaymentMethod[]).map((method) => (
            <button
              key={method}
              type="button"
              onClick={() => setSelectedMethod(method)}
              className={`flex items-center px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                selectedMethod === method
                  ? 'bg-[var(--primary-color)] text-white'
                  : 'bg-black/40 text-gray-200 hover:bg-primary-soft hover:text-white'
              }`}
            >
              {method === 'twint' ? <CreditCard className="w-4 h-4 mr-2" /> : <Wallet className="w-4 h-4 mr-2" />}
              {paymentMethodLabel[method]}
            </button>
          ))}
        </div>
      </header>

      {error && (
        <div className="bg-red-500/10 border border-red-500/40 text-red-200 rounded-lg p-3 text-sm">
          {error}
        </div>
      )}

      {successCode && (
        <div className="bg-green-500/20 border border-green-500/40 text-green-100 rounded-lg p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">Abrechnungscode erstellt</h2>
            <p className="text-sm text-green-100/80">Teile diesen Code mit dem Admin, damit die Zahlung verbucht werden kann.</p>
          </div>
          <button
            type="button"
            onClick={() => handleCopyCode(successCode)}
            className="inline-flex items-center px-4 py-2 rounded-md bg-black/30 hover:bg-black/50 text-white text-sm"
          >
            <Clipboard className="w-4 h-4 mr-2" />
            {successCode}
          </button>
        </div>
      )}

      {copyMessage && (
        <div className="bg-white/10 border border-white/20 text-gray-200 rounded-lg p-3 text-sm">
          {copyMessage}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="bg-white/10 backdrop-blur-lg rounded-lg overflow-hidden">
          <div className="flex items-center justify-between px-6 py-4 border-b border-white/10">
            <div>
              <h2 className="text-white text-lg font-semibold">Offene Beiträge</h2>
              <p className="text-sm text-gray-400">
                {unpaidContributions.length === 0
                  ? 'Alle Beiträge sind bereits gemeldet oder bezahlt.'
                  : `${unpaidContributions.length} Beitrag/Beiträge offen`}
              </p>
            </div>
            {unpaidContributions.length > 0 && (
              <button
                type="button"
                onClick={toggleAll}
                className="text-sm text-gray-200 hover:text-white"
              >
                {selectedIds.size === unpaidContributions.length ? 'Auswahl aufheben' : 'Alle auswählen'}
              </button>
            )}
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-red-500" />
            </div>
          ) : unpaidContributions.length === 0 ? (
            <div className="py-12 text-center text-gray-400">Keine offenen Beiträge vorhanden.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-gray-200">
                <thead className="bg-black/40 text-xs uppercase tracking-wide">
                  <tr>
                    <th className="px-4 py-3 text-left">
                      <span className="sr-only">Auswählen</span>
                    </th>
                    <th className="px-4 py-3 text-left">Name</th>
                    <th className="px-4 py-3 text-left">Kontakt</th>
                    <th className="px-4 py-3 text-left">Betrag</th>
                    <th className="px-4 py-3 text-left">Erfasst am</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/10">
                  {unpaidContributions.map((entry) => (
                    <tr key={entry.id} className="hover:bg-white/5">
                      <td className="px-4 py-3 align-middle">
                        <input
                          type="checkbox"
                          className="h-4 w-4 rounded border-white/20 bg-black/20 text-red-500 focus:ring-red-500"
                          checked={selectedIds.has(entry.id)}
                          onChange={() => toggleSelection(entry.id)}
                        />
                      </td>
                      <td className="px-4 py-3 align-middle text-white">
                        <div className="font-medium">{entry.first_name} {entry.last_name}</div>
                        <div className="text-xs text-gray-400">{entry.address}, {entry.city}</div>
                      </td>
                      <td className="px-4 py-3 align-middle text-gray-300">
                        <div>{entry.email}</div>
                      </td>
                      <td className="px-4 py-3 align-middle text-white font-semibold">
                        CHF {Number(entry.amount).toFixed(2)}
                      </td>
                      <td className="px-4 py-3 align-middle text-gray-400">
                        {new Date(entry.created_at).toLocaleDateString('de-CH')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="bg-white/10 backdrop-blur-lg rounded-lg p-6 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-sm text-gray-300">Ausgewählte Beiträge</p>
              <p className="text-lg text-white font-semibold">
                {selectedIds.size} {selectedIds.size === 1 ? 'Beitrag' : 'Beiträge'}
              </p>
            </div>
            <div>
              <p className="text-sm text-gray-300">Summe</p>
              <p className="text-lg text-white font-semibold">CHF {totalSelected.toFixed(2)}</p>
            </div>
            <div>
              <p className="text-sm text-gray-300">Zahlungsmethode</p>
              <p className="text-lg text-white font-semibold">
                {selectedMethod ? paymentMethodLabel[selectedMethod] : '–'}
              </p>
            </div>
          </div>

          <button
            type="submit"
            disabled={!hasSelection || submitting}
            className="w-full inline-flex items-center justify-center px-4 py-3 rounded-md bg-[var(--primary-color)] text-white text-sm font-medium hover:bg-[var(--primary-color-dark)] disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {submitting ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Melde Beiträge...
              </>
            ) : (
              'Bezahlen melden'
            )}
          </button>
        </div>
      </form>

      <div className="bg-white/10 backdrop-blur-lg rounded-lg p-6">
        <h2 className="text-lg font-semibold text-white mb-4">Letzte Zahlungen</h2>
        <div className="grid gap-3">
          {contributions
            .filter((entry) => entry.payment_status !== 'unpaid')
            .slice(0, 6)
            .map((entry) => (
              <div key={entry.id} className="bg-white/5 rounded-lg px-4 py-3 flex flex-col md:flex-row md:items-center md:justify-between gap-2">
                <div>
                  <p className="text-white font-semibold">
                    {entry.first_name} {entry.last_name}
                  </p>
                  <p className="text-xs text-gray-400">
                    CHF {Number(entry.amount).toFixed(2)} · {statusLabels[entry.payment_status]}
                  </p>
                  {entry.settlement_code && (
                    <button
                      type="button"
                      onClick={() => handleCopyCode(entry.settlement_code!)}
                      className="mt-1 inline-flex items-center text-xs text-gray-300 hover:text-white"
                    >
                      <Clipboard className="w-4 h-4 mr-1" />
                      {entry.settlement_code}
                    </button>
                  )}
                </div>
                <span className={`inline-flex items-center px-2 py-1 rounded text-xs ${statusBadge[entry.payment_status]}`}>
                  {statusLabels[entry.payment_status]}
                </span>
              </div>
            ))}
          {contributions.filter((entry) => entry.payment_status !== 'unpaid').length === 0 && (
            <p className="text-sm text-gray-400">Noch keine gemeldeten Beiträge.</p>
          )}
        </div>
      </div>
    </div>
  );
}
