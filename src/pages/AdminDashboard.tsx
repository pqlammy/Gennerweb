import React, { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useSettings } from '../context/SettingsContext';
import { api } from '../lib/api';
import {
  Users,
  Check,
  Search,
  Filter,
  Upload,
  Trash2,
  Pencil,
  Download,
  ArrowUpDown,
  RefreshCw,
  Clipboard,
  Coins,
  Loader2,
  Trophy,
  Activity,
  AlertTriangle
} from 'lucide-react';
import type { Contribution, LeaderboardEntry, PaymentStatus } from '../types';
import { EditContributionModal } from '../components/EditContributionModal';

const PAYMENT_LABELS: Record<Contribution['payment_method'], string> = {
  twint: 'TWINT',
  cash: 'Bargeld'
};

const formatPaymentMethod = (method: Contribution['payment_method']) =>
  PAYMENT_LABELS[method] ?? method;

const PAYMENT_STATUS_LABELS: Record<PaymentStatus, string> = {
  unpaid: 'Offen',
  twint_pending: 'TWINT gemeldet',
  cash_pending: 'Bargeld gemeldet',
  twint_paid: 'Bezahlt (TWINT)',
  cash_paid: 'Bezahlt (Bargeld)'
};

const PAYMENT_STATUS_BADGES: Record<PaymentStatus, string> = {
  unpaid: 'bg-yellow-500/20 text-yellow-300',
  twint_pending: 'bg-blue-500/20 text-blue-300',
  cash_pending: 'bg-orange-500/20 text-orange-300',
  twint_paid: 'bg-green-500/20 text-green-400',
  cash_paid: 'bg-green-500/20 text-green-400'
};

export function AdminDashboard() {
  const { user } = useAuth();
  const { settings } = useSettings();
  const navigate = useNavigate();
  const [contributions, setContributions] = useState<Contribution[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [updateLoading, setUpdateLoading] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState<'all' | 'paid' | 'pending'>('all');
  const [sortOption, setSortOption] = useState<'date_desc' | 'date_asc' | 'amount_desc' | 'amount_asc' | 'name_asc'>(
    'date_desc'
  );
  const [minAmount, setMinAmount] = useState('');
  const [maxAmount, setMaxAmount] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [gennervogtFilter, setGennervogtFilter] = useState<'all' | 'unassigned' | string>('all');
  const [editingContribution, setEditingContribution] = useState<Contribution | null>(null);
  const [exporting, setExporting] = useState(false);
  const [copyMessage, setCopyMessage] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [importMessage, setImportMessage] = useState<string | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [exportingJson, setExportingJson] = useState(false);
  const [settlementFilter, setSettlementFilter] = useState('');
  const [bulkMarking, setBulkMarking] = useState(false);
  const [bulkMessage, setBulkMessage] = useState<string | null>(null);
  const [deleteAllLoading, setDeleteAllLoading] = useState(false);
  const featureFlags = settings?.featureFlags ?? { leaderboard: false, healthMonitor: false };

  const deferredSearchTerm = useDeferredValue(searchTerm);
  const deferredSettlementFilter = useDeferredValue(settlementFilter);

  const [leaderboardEntries, setLeaderboardEntries] = useState<LeaderboardEntry[]>([]);
  const [leaderboardGeneratedAt, setLeaderboardGeneratedAt] = useState<string | null>(null);
  const [leaderboardError, setLeaderboardError] = useState<string | null>(null);
  const [leaderboardLoading, setLeaderboardLoading] = useState<boolean>(false);

  const healthEnabled = Boolean(featureFlags.healthMonitor);
  const leaderboardEnabled = Boolean(featureFlags.leaderboard);

  const loadLeaderboard = useCallback(async () => {
    if (!leaderboardEnabled) {
      return;
    }
    setLeaderboardLoading(true);
    try {
      const data = await api.getLeaderboard();
      setLeaderboardEntries(data.entries);
      setLeaderboardGeneratedAt(data.generatedAt);
      setLeaderboardError(null);
    } catch (err) {
      console.error('Failed to fetch leaderboard:', err);
      setLeaderboardError('Leaderboard konnte nicht geladen werden');
    } finally {
      setLeaderboardLoading(false);
    }
  }, [leaderboardEnabled]);

  const computeNextStatus = (entry: Contribution): PaymentStatus => {
    switch (entry.payment_status) {
      case 'twint_pending':
        return 'twint_paid';
      case 'cash_pending':
        return 'cash_paid';
      case 'twint_paid':
      case 'cash_paid':
        return 'unpaid';
      default:
        return entry.payment_method === 'cash' ? 'cash_paid' : 'twint_paid';
    }
  };

  const handleCopySettlementCode = async (code: string | null) => {
    if (!code) {
      return;
    }
    try {
      await navigator.clipboard.writeText(code);
      setCopyMessage('Abrechnungscode kopiert');
      setTimeout(() => setCopyMessage(null), 2000);
    } catch (err) {
      console.error('Copy to clipboard failed', err);
      setCopyMessage('Konnte nicht kopiert werden');
      setTimeout(() => setCopyMessage(null), 2000);
    }
  };

  const loadContributions = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await api.getContributions();
      setContributions(data);
    } catch (err) {
      console.error('Error fetching data:', err);
      setError('Failed to load data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadContributions();
  }, [loadContributions]);

  useEffect(() => {
    if (!leaderboardEnabled) {
      setLeaderboardEntries([]);
      setLeaderboardGeneratedAt(null);
      setLeaderboardError(null);
      return;
    }
    loadLeaderboard();
  }, [leaderboardEnabled, loadLeaderboard]);

  const handlePaymentStatusChange = async (entry: Contribution) => {
    try {
      setUpdateLoading(entry.id);
      setError(null);

      const nextStatus = computeNextStatus(entry);
      const nextMethod = nextStatus.startsWith('cash') ? 'cash' : entry.payment_method;
      const payload: Partial<Contribution> & { payment_status: PaymentStatus; payment_method: Contribution['payment_method'] } = {
        payment_status: nextStatus,
        payment_method: nextMethod
      };

      if (nextStatus === 'unpaid') {
        (payload as Record<string, unknown>).settlement_code = null;
      }

      const updated = await api.updateContribution(entry.id, payload);

      setContributions((prevContributions) =>
        prevContributions.map((contribution) =>
          contribution.id === entry.id ? updated : contribution
        )
      );
    } catch (err) {
      console.error('Error updating payment status:', err);
      setError('Status konnte nicht aktualisiert werden');
    } finally {
      setUpdateLoading(null);
    }
  };

  const handleDelete = async (id: string) => {
    const confirmed = window.confirm('Möchtest du diesen Beitrag wirklich löschen?');
    if (!confirmed) {
      return;
    }

    try {
      await api.deleteContribution(id);
      setContributions((prev) => prev.filter((entry) => entry.id !== id));
    } catch (err) {
      console.error('Failed to delete contribution', err);
      setError('Beitrag konnte nicht gelöscht werden');
    }
  };

  const handleDeleteAllContributions = async () => {
    const confirmed = window.confirm(
      'Möchtest du wirklich alle Beiträge unwiderruflich löschen? Dieser Vorgang kann nicht rückgängig gemacht werden.'
    );
    if (!confirmed) {
      return;
    }

    try {
      setDeleteAllLoading(true);
      setError(null);
      setBulkMessage(null);
      const result = await api.deleteAllContributions();
      setContributions([]);
      const deletedCount = result.deletedCount ?? 0;
      const message =
        deletedCount > 0
          ? `${deletedCount} Beiträge gelöscht.`
          : 'Es waren keine Beiträge zum Löschen vorhanden.';
      setBulkMessage(message);
      setTimeout(() => setBulkMessage(null), 3000);
    } catch (err) {
      console.error('Failed to delete all contributions', err);
      setError(
        err instanceof Error ? err.message : 'Alle Beiträge konnten nicht gelöscht werden'
      );
    } finally {
      setDeleteAllLoading(false);
    }
  };

  const handleExport = async () => {
    try {
      setExporting(true);
      const blob = await api.exportContributions();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      const timestamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
      link.download = `contributions-${timestamp}.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Failed to export contributions', err);
      setError('Export fehlgeschlagen');
    } finally {
      setExporting(false);
    }
  };

  const handleExportJson = async () => {
    try {
      setExportingJson(true);
      const blob = await api.exportContributionsJson();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      const timestamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
      link.download = `contributions-${timestamp}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Failed to export contributions as JSON', err);
      setError('JSON Export fehlgeschlagen');
    } finally {
      setExportingJson(false);
    }
  };

  const handleImportFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    setImporting(true);
    setImportError(null);
    setImportMessage(null);

    try {
      const text = await file.text();
      const payload = JSON.parse(text);

      if (!Array.isArray(payload)) {
        throw new Error('Die Importdatei muss ein Array von Beiträgen enthalten');
      }

      const result = await api.importContributions(payload);
      setImportMessage(`${result.count} Beiträge importiert`);
      await loadContributions();
    } catch (err) {
      console.error('Failed to import contributions', err);
      setImportError(
        err instanceof Error
          ? err.message
          : 'Import fehlgeschlagen – bitte gültige JSON-Datei verwenden'
      );
    } finally {
      setImporting(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleMarkFilteredAsPaid = async () => {
    const targetIds = filteredContributions
      .filter((entry) => !entry.payment_status.endsWith('_paid'))
      .map((entry) => entry.id);

    if (targetIds.length === 0) {
      setBulkMessage('Alle gefilterten Beiträge sind bereits bezahlt.');
      setTimeout(() => setBulkMessage(null), 2500);
      return;
    }

    try {
      setBulkMarking(true);
      setError(null);
      const response = await api.markContributionsPaid(targetIds);
      const updatedMap = new Map(response.contributions.map((entry) => [entry.id, entry]));
      setContributions((prev) =>
        prev.map((entry) => updatedMap.get(entry.id) ?? entry)
      );
      setBulkMessage(`${response.contributions.length} Beiträge als bezahlt markiert.`);
      setTimeout(() => setBulkMessage(null), 3000);
    } catch (err) {
      console.error('Bulk mark paid failed', err);
      setError(err instanceof Error ? err.message : 'Beiträge konnten nicht aktualisiert werden');
    } finally {
      setBulkMarking(false);
    }
  };

  const gennervogtOptions = useMemo(() => {
    const map = new Map<string, string>();
    contributions.forEach((entry) => {
      if (entry.gennervogt_id) {
        map.set(entry.gennervogt_id, entry.gennervogt_username ?? entry.gennervogt_id);
      }
    });

    return Array.from(map.entries()).map(([id, label]) => ({ id, label }));
  }, [contributions]);

  const filteredContributions = useMemo(() => {
    const searchLower = deferredSearchTerm.toLowerCase();
    const minAmountValue = Number.parseFloat(minAmount);
    const maxAmountValue = Number.parseFloat(maxAmount);
    const start = startDate ? new Date(startDate) : null;
    const end = endDate ? new Date(endDate) : null;
    const settlementFilterLower = deferredSettlementFilter.trim().toLowerCase();

    let entries = contributions.filter((contribution) => {
      const matchesSearch =
        deferredSearchTerm === '' ||
        contribution.first_name.toLowerCase().includes(searchLower) ||
        contribution.last_name.toLowerCase().includes(searchLower) ||
        contribution.email.toLowerCase().includes(searchLower) ||
        contribution.address.toLowerCase().includes(searchLower) ||
        contribution.city.toLowerCase().includes(searchLower) ||
        contribution.postal_code.toLowerCase().includes(searchLower) ||
        contribution.payment_method.toLowerCase().includes(searchLower) ||
        formatPaymentMethod(contribution.payment_method).toLowerCase().includes(searchLower) ||
        PAYMENT_STATUS_LABELS[contribution.payment_status]?.toLowerCase().includes(searchLower) ||
        (contribution.settlement_code ?? '').toLowerCase().includes(searchLower);

      const matchesStatus =
        filterStatus === 'all' ||
        (filterStatus === 'paid' && contribution.paid) ||
        (filterStatus === 'pending' && !contribution.paid);

      const matchesGennervogt =
        gennervogtFilter === 'all' ||
        (gennervogtFilter === 'unassigned' && !contribution.gennervogt_id) ||
        contribution.gennervogt_id === gennervogtFilter;

      const matchesSettlement =
        settlementFilterLower === '' ||
        (contribution.settlement_code ?? '').toLowerCase().includes(settlementFilterLower);

      const contributionDate = new Date(contribution.created_at);
      const matchesStart = !start || contributionDate >= start;
      const matchesEnd = !end || contributionDate <= end;

      const matchesMin =
        Number.isNaN(minAmountValue) || contribution.amount >= minAmountValue;
      const matchesMax =
        Number.isNaN(maxAmountValue) || contribution.amount <= maxAmountValue;

      return (
        matchesSearch &&
        matchesStatus &&
        matchesGennervogt &&
        matchesSettlement &&
        matchesStart &&
        matchesEnd &&
        matchesMin &&
        matchesMax
      );
    });

    entries = entries.slice().sort((a, b) => {
      switch (sortOption) {
        case 'date_asc':
          return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
        case 'amount_desc':
          return b.amount - a.amount;
        case 'amount_asc':
          return a.amount - b.amount;
        case 'name_asc':
          return `${a.last_name} ${a.first_name}`.localeCompare(
            `${b.last_name} ${b.first_name}`,
            'de'
          );
        case 'date_desc':
        default:
          return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      }
    });

    return entries;
  }, [
    contributions,
    endDate,
    filterStatus,
    maxAmount,
    minAmount,
    deferredSearchTerm,
    sortOption,
    startDate,
    gennervogtFilter,
    deferredSettlementFilter
  ]);

  const filteredTotalAmount = useMemo(
    () =>
      filteredContributions.reduce((sum, entry) => sum + Number(entry.amount ?? 0), 0),
    [filteredContributions]
  );

  const filteredUnpaidCount = useMemo(
    () =>
      filteredContributions.filter((entry) => !entry.payment_status.endsWith('_paid')).length,
    [filteredContributions]
  );

  if (!user || user.role !== 'admin') {
    return (
      <div className="flex min-h-[40vh] items-center justify-center text-white">
        <div className="text-2xl">Access Denied</div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <div className="h-12 w-12 animate-spin rounded-full border-b-2 border-t-2 border-[var(--primary-color)]"></div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="max-w-7xl mx-auto space-y-8">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center">
            <Users className="mr-3 h-8 w-8 text-[var(--accent-color)]" />
            <h1 className="text-3xl font-bold text-white">Admin Dashboard</h1>
          </div>
          <div className="flex flex-wrap items-center gap-3 w-full sm:w-auto">
            <button
              onClick={handleExport}
              disabled={exporting}
              className="inline-flex items-center justify-center px-4 py-2 rounded-md bg-black/40 text-gray-200 hover:bg-black/50 disabled:opacity-60 w-full sm:w-auto"
            >
              <Download className="w-4 h-4 mr-2" />
              {exporting ? 'Exportiere...' : 'Export CSV'}
            </button>
            <button
              onClick={handleExportJson}
              disabled={exportingJson}
              className="inline-flex items-center justify-center px-4 py-2 rounded-md bg-black/40 text-gray-200 hover:bg-black/50 disabled:opacity-60 w-full sm:w-auto"
            >
              <Download className="w-4 h-4 mr-2" />
              {exportingJson ? 'Exportiere...' : 'Export JSON'}
            </button>
            <button
              onClick={() => fileInputRef.current?.click()}
              className="inline-flex items-center justify-center px-4 py-2 rounded-md bg-[var(--primary-color)] text-white hover:bg-[var(--primary-color-dark)] disabled:opacity-60 w-full sm:w-auto"
              disabled={importing}
            >
              <Upload className="w-4 h-4 mr-2" />
              {importing ? 'Importiere...' : 'Importieren'}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="application/json"
              onChange={handleImportFile}
              className="hidden"
            />
            <button
              onClick={loadContributions}
              className="inline-flex items-center justify-center px-3 py-2 rounded-md bg-black/40 text-gray-200 hover:bg-black/50 w-full sm:w-auto"
            >
              <RefreshCw className="w-4 h-4 mr-2" />
              Aktualisieren
            </button>
            <button
              onClick={handleDeleteAllContributions}
              disabled={deleteAllLoading}
              className="inline-flex items-center justify-center px-4 py-2 rounded-md bg-red-600/80 text-white hover:bg-red-600 disabled:opacity-60 w-full sm:w-auto"
            >
              {deleteAllLoading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Lösche...
                </>
              ) : (
                <>
                  <Trash2 className="w-4 h-4 mr-2" />
                  Alle Einträge löschen
                </>
              )}
            </button>
          </div>
        </div>

        {(healthEnabled || leaderboardEnabled) && (
          <div className="grid gap-4 lg:grid-cols-2">
            {healthEnabled && (
              <div className="rounded-lg border border-white/10 bg-black/30 p-5 space-y-3">
                <div className="flex items-center gap-2 text-sm font-semibold text-white">
                  <Activity className="h-5 w-5 text-[var(--accent-color)]" />
                  <span>Health Monitor</span>
                </div>
                <p className="text-xs text-gray-400">
                  Behalte Verfügbarkeit und Performance des Systems im Blick.
                </p>
                <button
                  type="button"
                  onClick={() => navigate('/admin/health')}
                  className="inline-flex items-center gap-2 rounded-md bg-white/10 px-3 py-2 text-xs text-gray-200 transition-colors hover:bg-white/20"
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                  Health Monitor öffnen
                </button>
              </div>
            )}

            {leaderboardEnabled && (
              <div className="rounded-lg border border-white/10 bg-black/30 p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-sm font-semibold text-white">
                    <Trophy className="h-5 w-5 text-[var(--accent-color)]" />
                    <span>Leaderboard</span>
                  </div>
                  <button
                    type="button"
                    onClick={loadLeaderboard}
                    disabled={leaderboardLoading}
                    className="inline-flex items-center gap-2 rounded-md bg-white/10 px-3 py-1 text-xs text-gray-200 transition-colors hover:bg-white/20 disabled:opacity-60"
                  >
                    <RefreshCw className={`h-3.5 w-3.5 ${leaderboardLoading ? 'animate-spin' : ''}`} />
                    Reload
                  </button>
                </div>

                {leaderboardError && (
                  <div className="flex items-center gap-2 rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-200">
                    <AlertTriangle className="h-4 w-4" />
                    <span>{leaderboardError}</span>
                  </div>
                )}

                <div className="space-y-3">
                  {leaderboardEntries.slice(0, 5).map((entry, index) => (
                    <div key={`${entry.userId ?? 'none'}-${index}`} className="flex items-center justify-between rounded-md bg-black/20 px-3 py-2 text-sm text-gray-200">
                      <div className="flex items-center gap-3">
                        <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-white/10 text-xs font-semibold text-white">
                          {index + 1}
                        </span>
                        <div>
                          <p className="font-semibold text-white">{entry.username}</p>
                          <p className="text-xs text-gray-400">
                            {entry.contributions} Beiträge · CHF {entry.totalAmount.toLocaleString('de-CH', {
                              minimumFractionDigits: 2,
                              maximumFractionDigits: 2
                            })}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
                  {leaderboardEntries.length === 0 && !leaderboardError && (
                    <p className="text-xs text-gray-400">Noch keine Beiträge erfasst – sobald Daten vorliegen erscheint hier die Rangliste.</p>
                  )}
                </div>
                {leaderboardGeneratedAt && (
                  <p className="text-right text-[11px] text-gray-500">
                    Stand: {new Date(leaderboardGeneratedAt).toLocaleTimeString('de-CH')}
                  </p>
                )}
              </div>
            )}
          </div>
        )}

        <div className="bg-white/10 backdrop-blur-lg rounded-lg p-6 space-y-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search contributions..."
              className="w-full pl-10 pr-4 py-2 bg-white/5 border border-white/20 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-red-500"
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
            <label className="flex flex-col text-sm text-gray-300">
              Status
              <div className="relative">
                <Filter className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <select
                  value={filterStatus}
                  onChange={(event) => setFilterStatus(event.target.value as typeof filterStatus)}
                  className="mt-1 w-full pl-10 pr-3 py-2 bg-white/5 border border-white/20 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-red-500"
                >
                  <option value="all">Alle</option>
                  <option value="paid">Bezahlt</option>
                  <option value="pending">Ausstehend</option>
                </select>
              </div>
            </label>

            <label className="flex flex-col text-sm text-gray-300">
              Sortierung
              <div className="relative">
                <ArrowUpDown className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <select
                  value={sortOption}
                  onChange={(event) => setSortOption(event.target.value as typeof sortOption)}
                  className="mt-1 w-full pl-10 pr-3 py-2 bg-white/5 border border-white/20 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-red-500"
                >
                  <option value="date_desc">Neueste zuerst</option>
                  <option value="date_asc">Älteste zuerst</option>
                  <option value="amount_desc">Betrag absteigend</option>
                  <option value="amount_asc">Betrag aufsteigend</option>
                  <option value="name_asc">Name A-Z</option>
                </select>
              </div>
            </label>

            <label className="flex flex-col text-sm text-gray-300">
              Betrag von
              <input
                type="number"
                min="0"
                value={minAmount}
                onChange={(event) => setMinAmount(event.target.value)}
                className="mt-1 px-3 py-2 rounded bg-white/5 border border-white/20 text-white focus:outline-none focus:ring-2 focus:ring-red-500"
                placeholder="Min"
              />
            </label>

            <label className="flex flex-col text-sm text-gray-300">
              Betrag bis
              <input
                type="number"
                min="0"
                value={maxAmount}
                onChange={(event) => setMaxAmount(event.target.value)}
                className="mt-1 px-3 py-2 rounded bg-white/5 border border-white/20 text-white focus:outline-none focus:ring-2 focus:ring-red-500"
                placeholder="Max"
              />
            </label>

            <label className="flex flex-col text-sm text-gray-300">
              Abrechnungscode
              <input
                type="text"
                value={settlementFilter}
                onChange={(event) => setSettlementFilter(event.target.value)}
                className="mt-1 px-3 py-2 rounded bg-white/5 border border-white/20 text-white focus:outline-none focus:ring-2 focus:ring-red-500"
                placeholder="z. B. GIBEL123"
              />
            </label>

            <label className="flex flex-col text-sm text-gray-300">
              Von Datum
              <input
                type="date"
                value={startDate}
                onChange={(event) => setStartDate(event.target.value)}
                className="mt-1 px-3 py-2 rounded bg-white/5 border border-white/20 text-white focus:outline-none focus:ring-2 focus:ring-red-500"
              />
            </label>

            <label className="flex flex-col text-sm text-gray-300">
              Bis Datum
              <input
                type="date"
                value={endDate}
                onChange={(event) => setEndDate(event.target.value)}
                className="mt-1 px-3 py-2 rounded bg-white/5 border border-white/20 text-white focus:outline-none focus:ring-2 focus:ring-red-500"
              />
            </label>

            <label className="flex flex-col text-sm text-gray-300">
              Gennervogt
              <div className="relative">
                <Filter className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <select
                  value={gennervogtFilter}
                  onChange={(event) => setGennervogtFilter(event.target.value as typeof gennervogtFilter)}
                  className="mt-1 w-full pl-10 pr-3 py-2 bg-white/5 border border-white/20 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-red-500"
                >
                  <option value="all">Alle</option>
                  <option value="unassigned">Nicht zugewiesen</option>
                  {gennervogtOptions.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
            </label>
          </div>
        </div>

        {importMessage && (
          <div className="bg-green-500/20 border border-green-500/40 text-green-200 rounded-lg p-4">
            {importMessage}
          </div>
        )}

        {(error || importError) && (
          <div className="bg-red-500/10 border border-red-500 rounded-lg p-4">
            <p className="text-red-500">{error || importError}</p>
          </div>
        )}

        {copyMessage && (
          <div className="bg-white/10 border border-white/20 text-gray-200 rounded-lg p-3 text-sm">
            {copyMessage}
          </div>
        )}

        {bulkMessage && (
          <div className="bg-green-500/20 border border-green-500/40 text-green-200 rounded-lg p-3 text-sm">
            {bulkMessage}
          </div>
        )}

        <div className="bg-white/10 backdrop-blur-lg rounded-lg p-4 flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-4 text-sm text-gray-300">
            <span>
              Gefiltert:{' '}
              <span className="text-white font-semibold">{filteredContributions.length}</span>{' '}
              von {contributions.length}
            </span>
            <span className="flex items-center gap-2">
              <Coins className="w-4 h-4 text-yellow-300" />
              Summe:
              <span className="text-white font-semibold">
                CHF {filteredTotalAmount.toFixed(2)}
              </span>
            </span>
            <span>
              Offen:{' '}
              <span
                className={`${
                  filteredUnpaidCount > 0 ? 'text-yellow-300' : 'text-green-400'
                } font-semibold`}
              >
                {filteredUnpaidCount}
              </span>
            </span>
          </div>
          <button
            type="button"
            onClick={handleMarkFilteredAsPaid}
            disabled={bulkMarking || filteredUnpaidCount === 0}
            className="inline-flex items-center px-4 py-2 rounded-md bg-[var(--primary-color)] text-white hover:bg-[var(--primary-color-dark)] disabled:opacity-60"
          >
            {bulkMarking ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Markiere...
              </>
            ) : (
              <>
                <Check className="w-4 h-4 mr-2" />
                Alle als bezahlt markieren
              </>
            )}
          </button>
        </div>

        <div className="bg-white/10 backdrop-blur-lg rounded-lg overflow-hidden">
          <div className="overflow-x-auto hidden md:block">
            <table className="w-full">
              <thead>
                <tr className="bg-black/20">
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                    Name
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                    Kontakt
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                    Adresse
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                    Gennervogt
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                    Zahlungsmethode
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                    Abrechnungscode
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                    Betrag
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                    Datum
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-300 uppercase tracking-wider">
                    Aktionen
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/10">
                {filteredContributions.map((contribution) => (
                  <tr key={contribution.id} className="hover:bg-white/5">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-white">
                        {contribution.first_name} {contribution.last_name}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-white">{contribution.email}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-white">
                        {contribution.address}, {contribution.postal_code} {contribution.city}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-white">
                        {contribution.gennervogt_username ?? 'Nicht zugewiesen'}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-white">
                        {formatPaymentMethod(contribution.payment_method)}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {contribution.settlement_code ? (
                        <button
                          type="button"
                          onClick={() => handleCopySettlementCode(contribution.settlement_code)}
                          className="inline-flex items-center text-sm text-gray-200 hover:text-white"
                        >
                          <Clipboard className="w-4 h-4 mr-2" />
                          {contribution.settlement_code}
                        </button>
                      ) : (
                        <span className="text-sm text-gray-400">–</span>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-medium text-white">
                        CHF {contribution.amount.toFixed(2)}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-300">
                        {new Date(contribution.created_at).toLocaleDateString('de-CH')}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <button
                        onClick={() => handlePaymentStatusChange(contribution)}
                        disabled={updateLoading === contribution.id}
                        className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${
                          PAYMENT_STATUS_BADGES[contribution.payment_status] ?? 'bg-yellow-500/20 text-yellow-400'
                        } hover:bg-opacity-75 transition-colors`}
                      >
                        {updateLoading === contribution.id ? (
                          <div className="animate-spin rounded-full h-4 w-4 border-t-2 border-b-2 border-current"></div>
                        ) : (
                          <>
                            {contribution.payment_status.endsWith('_paid') && (
                              <Check className="w-4 h-4 mr-1" />
                            )}
                            {PAYMENT_STATUS_LABELS[contribution.payment_status] ?? 'Offen'}
                          </>
                        )}
                      </button>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right space-x-2">
                      <button
                        onClick={() => setEditingContribution(contribution)}
                        className="inline-flex items-center px-3 py-1 text-sm rounded-md bg-black/40 text-gray-200 hover:bg-black/50"
                      >
                        <Pencil className="w-4 h-4 mr-1" /> Bearbeiten
                      </button>
                      <button
                        onClick={() => handleDelete(contribution.id)}
                        className="inline-flex items-center px-3 py-1 text-sm rounded-md bg-red-600/80 text-white hover:bg-red-700"
                      >
                        <Trash2 className="w-4 h-4 mr-1" /> Löschen
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="md:hidden divide-y divide-white/10">
            {filteredContributions.map((contribution) => (
              <div key={contribution.id} className="p-4 space-y-3">
                <div className="flex justify-between items-start">
                  <div>
                    <p className="text-white font-semibold">
                      {contribution.first_name} {contribution.last_name}
                    </p>
                    <p className="text-xs text-gray-300">{contribution.email}</p>
                    <p className="text-xs text-gray-400 mt-1">
                      {contribution.address}, {contribution.postal_code} {contribution.city}
                    </p>
                    <p className="text-xs text-gray-400 mt-1">
                      Gennervogt: {contribution.gennervogt_username ?? 'Nicht zugewiesen'}
                    </p>
                    <p className="text-xs text-gray-400 mt-1">
                      Zahlungsmethode: {formatPaymentMethod(contribution.payment_method)}
                    </p>
                    {contribution.settlement_code && (
                      <button
                        type="button"
                        onClick={() => handleCopySettlementCode(contribution.settlement_code)}
                        className="mt-1 inline-flex items-center text-xs text-gray-300 hover:text-white"
                      >
                        <Clipboard className="w-4 h-4 mr-1" />
                        {contribution.settlement_code}
                      </button>
                    )}
                  </div>
                  <div className="text-right">
                    <p className="text-white font-bold">CHF {contribution.amount.toFixed(2)}</p>
                    <p className="text-xs text-gray-400">
                      {new Date(contribution.created_at).toLocaleDateString('de-CH')}
                    </p>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={() => handlePaymentStatusChange(contribution)}
                    disabled={updateLoading === contribution.id}
                    className={`flex-1 min-w-[140px] inline-flex items-center justify-center px-3 py-1 rounded-full text-sm font-medium ${
                      PAYMENT_STATUS_BADGES[contribution.payment_status] ?? 'bg-yellow-500/20 text-yellow-400'
                    }`}
                  >
                    {updateLoading === contribution.id ? (
                      <div className="animate-spin rounded-full h-4 w-4 border-t-2 border-b-2 border-current"></div>
                    ) : (
                      PAYMENT_STATUS_LABELS[contribution.payment_status] ?? 'Offen'
                    )}
                  </button>
                  <button
                    onClick={() => setEditingContribution(contribution)}
                    className="flex-1 min-w-[140px] inline-flex items-center justify-center px-3 py-1 text-sm rounded-md bg-black/40 text-gray-200 hover:bg-black/50"
                  >
                    <Pencil className="w-4 h-4 mr-1" /> Bearbeiten
                  </button>
                  <button
                    onClick={() => handleDelete(contribution.id)}
                    className="flex-1 min-w-[140px] inline-flex items-center justify-center px-3 py-1 text-sm rounded-md bg-red-600/80 text-white hover:bg-red-700"
                  >
                    <Trash2 className="w-4 h-4 mr-1" /> Löschen
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {editingContribution && (
        <EditContributionModal
          contribution={editingContribution}
          onClose={() => setEditingContribution(null)}
          onSave={(updated) =>
            setContributions((prev) =>
              prev.map((entry) => (entry.id === updated.id ? updated : entry))
            )
          }
        />
      )}
    </div>
  );
}
