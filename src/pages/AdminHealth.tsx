import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Activity, AlertTriangle, CheckCircle2, RefreshCw, Clock, ServerCrash, Database } from 'lucide-react';
import { api } from '../lib/api';
import { useSettings } from '../context/SettingsContext';

const formatDuration = (seconds: number | null | undefined) => {
  if (!Number.isFinite(seconds ?? NaN)) {
    return '–';
  }
  const total = Math.floor(seconds ?? 0);
  const days = Math.floor(total / 86400);
  const hours = Math.floor((total % 86400) / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  if (days > 0) {
    return `${days}d ${hours}h`;
  }
  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  return `${minutes}m`;
};

type HealthSnapshot = {
  status: string;
  timestamp: string;
  uptimeSeconds: number;
  database: { status: string; latencyMs: number | null };
  cache: { status: string; ageMs: number | null };
};

export function AdminHealth() {
  const { settings } = useSettings();
  const navigate = useNavigate();
  const featureEnabled = Boolean(settings.featureFlags?.healthMonitor);

  const [snapshot, setSnapshot] = useState<HealthSnapshot | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchHealth = useCallback(async () => {
    if (!featureEnabled) {
      return;
    }
    setLoading(true);
    try {
      const data = await api.getHealth();
      const safeSnapshot: HealthSnapshot = {
        status: data?.status ?? 'UNKNOWN',
        timestamp: data?.timestamp ?? new Date().toISOString(),
        uptimeSeconds: data?.uptimeSeconds ?? 0,
        database: {
          status: data?.database?.status ?? 'UNKNOWN',
          latencyMs: data?.database?.latencyMs ?? null
        },
        cache: {
          status: data?.cache?.status ?? 'UNKNOWN',
          ageMs: data?.cache?.ageMs ?? null
        }
      };
      setSnapshot(safeSnapshot);
      setError(null);
    } catch (err) {
      console.error('Health monitor request failed', err);
      setError('Status konnte nicht geladen werden');
    } finally {
      setLoading(false);
    }
  }, [featureEnabled]);

  useEffect(() => {
    if (!featureEnabled) {
      return;
    }
    fetchHealth();
    const interval = window.setInterval(fetchHealth, 30000);
    return () => window.clearInterval(interval);
  }, [fetchHealth, featureEnabled]);

  const statusBadge = useMemo(() => {
    const status = snapshot?.status ?? (error ? 'DEGRADED' : '—');
    if (status === 'OK') {
      return { label: 'Stabil', className: 'text-green-300', icon: CheckCircle2 };
    }
    if (status === 'DEGRADED') {
      return { label: 'Teilweise verfügbar', className: 'text-yellow-300', icon: AlertTriangle };
    }
    return { label: status ?? 'Unbekannt', className: 'text-gray-300', icon: AlertTriangle };
  }, [snapshot?.status, error]);

  if (!featureEnabled) {
    return (
      <div className="max-w-5xl mx-auto space-y-6 py-10">
        <div className="rounded-xl border border-white/10 bg-black/40 p-8 text-sm text-gray-300">
          <h1 className="mb-3 flex items-center gap-3 text-2xl font-semibold text-white">
            <Activity className="h-7 w-7 text-[var(--accent-color)]" />
            Health Monitor deaktiviert
          </h1>
          <p>
            Der Health Monitor ist aktuell ausgeschaltet. Aktiviere ihn unter <strong>Einstellungen → Module & Monitoring</strong>,
            um Systemmetriken anzuzeigen.
          </p>
          <button
            type="button"
            onClick={() => navigate('/admin/settings')}
            className="mt-4 inline-flex items-center gap-2 rounded-md bg-white/10 px-4 py-2 text-xs text-gray-200 transition-colors hover:bg-white/20"
          >
            Zu den Einstellungen
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto space-y-8 py-10">
      <header className="flex flex-col gap-4 rounded-xl border border-white/10 bg-black/40 p-8 text-white sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-3 text-2xl font-semibold">
            <Activity className="h-7 w-7 text-[var(--accent-color)]" />
            Health Monitor
          </div>
          <p className="mt-2 text-sm text-gray-300">
            Live-Überblick über Datenbank, Caching und Laufzeit der Anwendung. Aktualisiert sich alle 30 Sekunden.
          </p>
        </div>
        <button
          type="button"
          onClick={fetchHealth}
          disabled={loading}
          className="inline-flex items-center gap-2 rounded-md bg-white/10 px-4 py-2 text-xs text-gray-200 transition-colors hover:bg-white/20 disabled:opacity-60"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          Jetzt aktualisieren
        </button>
      </header>

      {error && (
        <div className="flex items-center gap-3 rounded-md border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-200">
          <AlertTriangle className="h-5 w-5" />
          <span>{error}</span>
        </div>
      )}

      <section className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-lg border border-white/10 bg-black/30 p-5">
          <p className="text-xs uppercase tracking-widest text-gray-400">Gesamtzustand</p>
          <div className="mt-2 flex items-center gap-2 text-lg font-semibold text-white">
            {React.createElement(statusBadge.icon, { className: `h-5 w-5 ${statusBadge.className}` })}
            <span className={statusBadge.className}>{statusBadge.label}</span>
          </div>
          <p className="mt-3 text-xs text-gray-500">
            {snapshot ? `Zuletzt aktualisiert um ${new Date(snapshot.timestamp).toLocaleTimeString('de-CH')}` : 'Warten auf erste Daten…'}
          </p>
        </div>

        <div className="rounded-lg border border-white/10 bg-black/30 p-5">
          <p className="text-xs uppercase tracking-widest text-gray-400">Uptime</p>
          <div className="mt-2 flex items-center gap-2 text-lg font-semibold text-white">
            <Clock className="h-5 w-5 text-[var(--accent-color)]" />
            {formatDuration(snapshot?.uptimeSeconds)}
          </div>
          <p className="mt-3 text-xs text-gray-500">Seit dem letzten Neustart der Anwendung.</p>
        </div>

        <div className="rounded-lg border border-white/10 bg-black/30 p-5">
          <p className="text-xs uppercase tracking-widest text-gray-400">Datenbank</p>
          <div className="mt-2 flex items-center gap-2 text-lg font-semibold text-white">
            <Database className="h-5 w-5 text-[var(--accent-color)]" />
            {snapshot?.database?.status ?? '—'}
          </div>
          <p className="mt-3 text-xs text-gray-500">
            Latenz: {snapshot?.database?.latencyMs != null ? `${snapshot.database.latencyMs.toFixed(1)} ms` : '–'}
          </p>
        </div>

        <div className="rounded-lg border border-white/10 bg-black/30 p-5">
          <p className="text-xs uppercase tracking-widest text-gray-400">Cache</p>
          <div className="mt-2 flex items-center gap-2 text-lg font-semibold text-white">
            <ServerCrash className="h-5 w-5 text-[var(--accent-color)]" />
            {snapshot?.cache?.status ?? '—'}
          </div>
          <p className="mt-3 text-xs text-gray-500">
            Alter: {snapshot?.cache?.ageMs != null ? `${Math.round(snapshot.cache.ageMs / 1000)}s` : '–'}
          </p>
        </div>
      </section>

      <section className="rounded-lg border border-white/10 bg-black/30 p-6 text-sm text-gray-200">
        <h2 className="flex items-center gap-2 text-lg font-semibold text-white">
          <Activity className="h-5 w-5 text-[var(--accent-color)]" />
          Details
        </h2>
        {snapshot ? (
          <div className="mt-4 space-y-3 font-mono text-xs text-gray-300">
            <div className="flex flex-col gap-1 rounded-md bg-black/40 p-4">
              <span className="text-[11px] uppercase tracking-widest text-gray-500">Rohdaten</span>
              <pre className="overflow-auto">{JSON.stringify(snapshot, null, 2)}</pre>
            </div>
          </div>
        ) : (
          <p className="mt-4 text-xs text-gray-400">Noch keine Daten verfügbar.</p>
        )}
      </section>
    </div>
  );
}
