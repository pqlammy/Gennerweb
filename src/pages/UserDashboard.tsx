import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { api } from '../lib/api';
import {
  LogOut,
  User,
  CreditCard,
  Clock,
  TrendingUp,
  AlertTriangle,
  Check,
  Clipboard,
  Pencil,
  Trophy,
  Loader2
} from 'lucide-react';
import type { Contribution, LeaderboardEntry, PaymentStatus } from '../types';
import { useSettings } from '../context/SettingsContext';
import { EditPersonalContributionModal } from '../components/EditPersonalContributionModal';

const statusStyles: Record<PaymentStatus, { label: string; badge: string }> = {
  unpaid: {
    label: 'Offen',
    badge: 'bg-yellow-500/20 text-yellow-300'
  },
  twint_pending: {
    label: 'TWINT gemeldet',
    badge: 'bg-blue-500/20 text-blue-300'
  },
  cash_pending: {
    label: 'Bargeld gemeldet',
    badge: 'bg-orange-500/20 text-orange-300'
  },
  twint_paid: {
    label: 'Bezahlt (TWINT)',
    badge: 'bg-green-500/20 text-green-400'
  },
  cash_paid: {
    label: 'Bezahlt (Bargeld)',
    badge: 'bg-green-500/20 text-green-400'
  }
};

export function UserDashboard() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const { settings } = useSettings();
  const [contributions, setContributions] = useState<Contribution[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copyFeedback, setCopyFeedback] = useState<string | null>(null);
  const [editingContribution, setEditingContribution] = useState<Contribution | null>(null);
  const leaderboardEnabled = Boolean(settings.featureFlags?.leaderboard);
  const [leaderboardEntries, setLeaderboardEntries] = useState<LeaderboardEntry[]>([]);
  const [leaderboardError, setLeaderboardError] = useState<string | null>(null);
  const [leaderboardLoading, setLeaderboardLoading] = useState(false);

  useEffect(() => {
    async function fetchContributions() {
      try {
        if (!user) return;

        const data = await api.getContributions();
        setContributions(data);
      } catch (err) {
        setError('Beiträge konnten nicht geladen werden');
        console.error('Error fetching contributions:', err);
      } finally {
        setLoading(false);
      }
    }

    if (user) {
      fetchContributions();
    }
  }, [user]);

  const targetAmount = settings?.targetAmount ?? 100;
  const totalAmount = useMemo(
    () => contributions.reduce((sum, contribution) => sum + Number(contribution.amount), 0),
    [contributions]
  );
  const difference = totalAmount - targetAmount;
  const hasReachedTarget = totalAmount >= targetAmount;

  const handleCopyCode = async (code: string | null) => {
    if (!code) return;
    try {
      await navigator.clipboard.writeText(code);
      setCopyFeedback('Abrechnungscode kopiert!');
      setTimeout(() => setCopyFeedback(null), 2000);
    } catch (err) {
      console.error('Copy failed', err);
      setCopyFeedback('Konnte nicht kopiert werden');
      setTimeout(() => setCopyFeedback(null), 2000);
    }
  };

  const handleContributionUpdated = (updated: Contribution) => {
    setContributions((prev) => prev.map((entry) => (entry.id === updated.id ? updated : entry)));
  };

  const landingCtaTitle = settings?.landingCtaTitle?.trim() || 'Jetzt Beitrag erfassen';
  const landingCtaBody = settings?.landingCtaBody?.trim() || '';
  const landingCtaButtonLabel = settings?.landingCtaButtonLabel?.trim() || 'Los geht’s';
  const landingCtaButtonUrl = settings?.landingCtaButtonUrl?.trim() || '/dashboard/collect';

  const handleCtaClick = () => {
    if (!landingCtaButtonUrl) {
      return;
    }
    if (/^https?:/i.test(landingCtaButtonUrl)) {
      window.open(landingCtaButtonUrl, '_blank', 'noopener');
      return;
    }
    navigate(landingCtaButtonUrl);
  };

  useEffect(() => {
    if (!leaderboardEnabled) {
      setLeaderboardEntries([]);
      setLeaderboardError(null);
      return;
    }

    let isMounted = true;
    const loadLeaderboard = async () => {
      try {
        setLeaderboardLoading(true);
        const data = await api.getLeaderboard();
        if (!isMounted) {
          return;
        }
        setLeaderboardEntries(data.entries);
        setLeaderboardError(null);
      } catch (err) {
        console.error('Leaderboard fetch failed', err);
        if (isMounted) {
          setLeaderboardError('Leaderboard konnte nicht geladen werden');
        }
      } finally {
        if (isMounted) {
          setLeaderboardLoading(false);
        }
      }
    };

    loadLeaderboard();

    return () => {
      isMounted = false;
    };
  }, [leaderboardEnabled]);

  if (!user) {
    return null;
  }

  let contributionsContent: React.ReactNode;
  if (loading) {
    contributionsContent = (
      <div className="flex justify-center py-8">
        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-red-500"></div>
      </div>
    );
  } else if (error) {
    contributionsContent = <div className="text-red-400 text-center py-4">{error}</div>;
  } else if (contributions.length === 0) {
    contributionsContent = (
      <div className="text-center py-8">
        <Clock className="w-12 h-12 text-gray-500 mx-auto mb-3" />
        <p className="text-gray-400">Noch keine Beiträge erfasst</p>
      </div>
    );
  } else {
    contributionsContent = (
      <div className="space-y-4">
        {contributions.map((contribution) => (
          <div
            key={contribution.id}
            className="bg-white/5 rounded-lg p-4 hover:bg-white/10 transition-colors space-y-3"
          >
            <div className="flex justify-between items-start gap-6">
              <div>
                <h3 className="text-lg font-medium text-white">
                  {contribution.first_name} {contribution.last_name}
                </h3>
                <p className="text-gray-400">{contribution.email}</p>
                <p className="text-sm text-gray-500 mt-1">
                  {contribution.address}, {contribution.city} {contribution.postal_code}
                </p>
                <p className="text-sm text-gray-400 mt-2">
                  Zahlungsmethode{' '}
                  <span className="font-medium text-white">
                    {contribution.payment_method === 'cash' ? 'Bargeld' : 'TWINT'}
                  </span>
                </p>
                {contribution.gennervogt_username && (
                  <p className="text-xs text-gray-500 mt-1">
                    Erfasst durch: {contribution.gennervogt_username}
                  </p>
                )}
              </div>
              <div className="text-right space-y-2">
                <p className="text-xl font-bold text-white">
                  CHF {contribution.amount.toFixed(2)}
                </p>
                <span
                  className={`inline-block px-2 py-1 text-xs rounded ${
                    statusStyles[contribution.payment_status]?.badge ?? 'bg-yellow-500/20 text-yellow-400'
                  }`}
                >
                  {statusStyles[contribution.payment_status]?.label ?? 'Offen'}
                </span>
                {contribution.settlement_code && (
                  <button
                    type="button"
                    onClick={() => handleCopyCode(contribution.settlement_code)}
                    className="flex items-center justify-end text-xs text-gray-300 hover:text-white"
                  >
                    <Clipboard className="w-4 h-4 mr-1" />
                    {contribution.settlement_code}
                  </button>
                )}
              </div>
            </div>
            <p className="text-xs text-gray-500">
              Erfasst am: {new Date(contribution.created_at).toLocaleDateString('de-CH')}
            </p>
            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => setEditingContribution(contribution)}
                className="inline-flex items-center px-3 py-1 text-xs sm:text-sm rounded-md bg-white/10 text-white hover:bg-white/20"
              >
                <Pencil className="w-4 h-4 mr-1" /> Bearbeiten
              </button>
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-8 pb-10">
      <div className="bg-white/10 backdrop-blur-lg rounded-lg p-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-4">
            <div className="rounded-full bg-[var(--primary-color)] p-3">
              <User className="h-6 w-6 text-white" />
            </div>
            <div>
              <h2 className="text-xl font-semibold text-white">{user.username}</h2>
              <p className="text-sm text-gray-300">{user.role === 'admin' ? 'Administrator' : 'Mitglied'}</p>
              {user.email && <p className="mt-1 text-xs text-gray-400">{user.email}</p>}
              {settings?.welcomeMessage && (
                <p className="mt-3 max-w-md text-xs leading-relaxed text-gray-300">
                  {settings.welcomeMessage}
                </p>
              )}
            </div>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row">
            <button
              onClick={signOut}
              className="flex items-center justify-center rounded-lg bg-[var(--primary-color)] px-4 py-2 text-white transition-colors hover:bg-[var(--primary-color-dark)]"
            >
              <LogOut className="mr-2 h-5 w-5" />
              Abmelden
            </button>
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-white/10 bg-black/40 p-6 shadow-lg backdrop-blur">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="space-y-2">
            <p className="text-xs uppercase tracking-widest text-[var(--accent-color)]">Call to Action</p>
            <h3 className="text-2xl font-semibold text-white">{landingCtaTitle}</h3>
            {landingCtaBody && <p className="text-sm text-gray-200 max-w-2xl">{landingCtaBody}</p>}
          </div>
          <button
            type="button"
            onClick={handleCtaClick}
            className="inline-flex items-center justify-center rounded-full bg-[var(--accent-color)] px-6 py-2 text-sm font-semibold text-white shadow-lg transition-transform hover:-translate-y-0.5 hover:bg-[var(--primary-color)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-color)] focus:ring-offset-2 focus:ring-offset-black/30"
          >
            {landingCtaButtonLabel}
          </button>
        </div>
      </div>

      {leaderboardEnabled && (
        <div className="rounded-xl border border-white/10 bg-black/30 p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm font-semibold text-white">
              <Trophy className="h-5 w-5 text-[var(--accent-color)]" />
              <span>Top Sammler:innen</span>
            </div>
            {leaderboardLoading && <Loader2 className="h-4 w-4 animate-spin text-gray-300" />}
          </div>

          {leaderboardError && (
            <p className="rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-200">
              {leaderboardError}
            </p>
          )}

          {!leaderboardError && leaderboardEntries.slice(0, 3).map((entry, index) => (
            <div key={`${entry.userId ?? 'none'}-${index}`} className="flex items-center justify-between rounded-lg bg-white/5 px-3 py-2 text-sm text-gray-100">
              <div className="flex items-center gap-3">
                <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-white/10 text-xs font-semibold text-white">
                  {index + 1}
                </span>
                <div>
                  <p className="font-semibold text-white">{entry.username}</p>
                  <p className="text-xs text-gray-300">
                    {entry.contributions} Beiträge · CHF {entry.totalAmount.toLocaleString('de-CH', {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2
                    })}
                  </p>
                </div>
              </div>
            </div>
          ))}

          {!leaderboardError && leaderboardEntries.length === 0 && !leaderboardLoading && (
            <p className="text-xs text-gray-400">Sobald die ersten Beiträge erfasst sind, erscheint hier die Rangliste.</p>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
        <div className="rounded-lg bg-white/10 p-6 backdrop-blur-lg">
          <div className="flex items-center justify-between">
            <h3 className="text-gray-400">Gesammelt</h3>
            <CreditCard className="h-5 w-5 text-[var(--accent-color)]" />
          </div>
          <p className="mt-2 text-2xl font-bold text-white">CHF {totalAmount.toFixed(2)}</p>
        </div>

        <div className="rounded-lg bg-white/10 p-6 backdrop-blur-lg">
          <div className="flex items-center justify-between">
            <h3 className="text-gray-400">Zielbetrag</h3>
            <TrendingUp className="h-5 w-5 text-[var(--accent-color)]" />
          </div>
          <p className="mt-2 text-2xl font-bold text-white">CHF {targetAmount.toFixed(2)}</p>
          {settings?.goalDeadline && (
            <p className="mt-2 text-xs text-gray-400">
              Ziel bis {new Date(settings.goalDeadline).toLocaleDateString('de-CH')}
            </p>
          )}
        </div>

        <div
          className={`rounded-lg border-2 bg-white/10 p-6 backdrop-blur-lg ${
            hasReachedTarget ? 'border-green-500/50' : 'border-red-500/50'
          }`}
        >
          <div className="flex items-center justify-between">
            <h3 className="text-gray-400">Differenz</h3>
            {hasReachedTarget ? (
              <Check className="h-5 w-5 text-green-500" />
            ) : (
              <AlertTriangle className="h-5 w-5 text-red-500" />
            )}
          </div>
          <p
            className={`mt-2 text-2xl font-bold ${
              hasReachedTarget ? 'text-green-500' : 'text-red-500'
            }`}
          >
            CHF {Math.abs(difference).toFixed(2)} {hasReachedTarget ? 'über dem Ziel' : 'unter dem Ziel'}
          </p>
        </div>
      </div>

      {user.role === 'admin' && (
        <div className="rounded-lg bg-white/10 p-6 backdrop-blur-lg">
          <h3 className="mb-4 text-xl font-semibold text-white">Admin Aktionen</h3>
          <button
            onClick={() => navigate('/admin')}
            className="rounded-lg bg-[var(--primary-color)] px-6 py-3 text-white transition-colors hover:bg-[var(--primary-color-dark)]"
          >
            Zum Admin Dashboard
          </button>
        </div>
      )}

      <div className="rounded-lg bg-white/10 p-6 backdrop-blur-lg">
        <div className="mb-6 flex items-center">
          <CreditCard className="mr-2 h-6 w-6 text-[var(--accent-color)]" />
          <h2 className="text-2xl font-semibold text-white">Deine Beiträge</h2>
        </div>

        {copyFeedback && (
          <div className="mb-4 rounded-lg border border-green-500/40 bg-green-500/20 p-3 text-sm text-green-200">
            {copyFeedback}
          </div>
        )}

        {contributionsContent}
      </div>

      {editingContribution && (
        <EditPersonalContributionModal
          contribution={editingContribution}
          onClose={() => setEditingContribution(null)}
          onSave={handleContributionUpdated}
        />
      )}
    </div>
  );
}
