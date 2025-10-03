import React, { useEffect, useMemo, useState } from 'react';
import { TrendingUp, Activity, CheckCircle, AlertTriangle, Star, BarChart3 } from 'lucide-react';
import { api } from '../lib/api';
import type { Contribution } from '../types';

const PAYMENT_LABELS: Record<Contribution['payment_method'], string> = {
  twint: 'TWINT',
  cash: 'Bargeld'
};

const formatPaymentMethod = (method: Contribution['payment_method']) => PAYMENT_LABELS[method] ?? method;

export function AdminStats() {
  const [contributions, setContributions] = useState<Contribution[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedGennervogt, setSelectedGennervogt] = useState<'all' | 'unassigned' | string>('all');

  useEffect(() => {
    async function fetchData() {
      try {
        const data = await api.getContributions();
        setContributions(data);
      } catch (err) {
        console.error('Failed to load contributions', err);
        setError('Fehler beim Laden der Beiträge');
      } finally {
        setLoading(false);
      }
    }

    fetchData();
  }, []);

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
    if (selectedGennervogt === 'all') {
      return contributions;
    }

    if (selectedGennervogt === 'unassigned') {
      return contributions.filter((entry) => !entry.gennervogt_id);
    }

    return contributions.filter((entry) => entry.gennervogt_id === selectedGennervogt);
  }, [contributions, selectedGennervogt]);

  const stats = useMemo(() => {
    if (filteredContributions.length === 0) {
      return {
        total: 0,
        paidTotal: 0,
        pendingTotal: 0,
        average: 0,
        median: 0,
        max: 0,
        count: 0,
        paidCount: 0,
        topContributions: [] as Contribution[],
        monthly: [] as Array<{ label: string; total: number; count: number }>,
        byCity: [] as Array<{ city: string; total: number; count: number }>
      };
    }

    const amounts = filteredContributions.map((entry) => Number(entry.amount)).filter(Number.isFinite);
    const total = amounts.reduce((sum, value) => sum + value, 0);
    const paidEntries = filteredContributions.filter((entry) => entry.paid);
    const paidTotal = paidEntries.reduce((sum, entry) => sum + Number(entry.amount), 0);
    const pendingTotal = total - paidTotal;
    const average = filteredContributions.length > 0 ? total / filteredContributions.length : 0;

    const sortedAmounts = amounts.slice().sort((a, b) => a - b);
    const middle = Math.floor(sortedAmounts.length / 2);
    const median =
      sortedAmounts.length % 2 === 0
        ? (sortedAmounts[middle - 1] + sortedAmounts[middle]) / 2
        : sortedAmounts[middle];

    const sortedByAmount = filteredContributions
      .slice()
      .sort((a, b) => Number(b.amount) - Number(a.amount));
    const topContributions = sortedByAmount.slice(0, 5);
    const max = sortedAmounts[sortedAmounts.length - 1];

    const monthlyMap = new Map<string, { total: number; count: number }>();
    filteredContributions.forEach((entry) => {
      const date = new Date(entry.created_at);
      const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      const current = monthlyMap.get(key) ?? { total: 0, count: 0 };
      current.total += Number(entry.amount);
      current.count += 1;
      monthlyMap.set(key, current);
    });

    const monthly = Array.from(monthlyMap.entries())
      .sort(([a], [b]) => (a > b ? 1 : -1))
      .map(([label, value]) => ({ label, ...value }));

    const cityMap = new Map<string, { total: number; count: number }>();
    filteredContributions.forEach((entry) => {
      const cityKey = entry.city || 'Unbekannt';
      const current = cityMap.get(cityKey) ?? { total: 0, count: 0 };
      current.total += Number(entry.amount);
      current.count += 1;
      cityMap.set(cityKey, current);
    });

    const byCity = Array.from(cityMap.entries())
      .sort(([, a], [, b]) => b.total - a.total)
      .map(([city, value]) => ({ city, ...value }));

    return {
      total,
      paidTotal,
      pendingTotal,
      average,
      median,
      max,
      count: filteredContributions.length,
      paidCount: paidEntries.length,
      topContributions,
      monthly,
      byCity
    };
  }, [filteredContributions]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-white">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-red-600" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center text-red-400">
        {error}
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="bg-white/10 backdrop-blur-lg rounded-lg p-6">
        <h1 className="text-3xl font-bold text-white">Auswertung</h1>
        <p className="text-gray-300 mt-2">Überblick und Detailanalysen zu allen Beiträgen.</p>
        <div className="mt-4">
          <label className="text-sm text-gray-300 uppercase tracking-wide">Gennervogt auswählen</label>
          <div className="mt-2">
            <select
              value={selectedGennervogt}
              onChange={(event) => setSelectedGennervogt(event.target.value as typeof selectedGennervogt)}
              className="w-full md:w-64 px-3 py-2 rounded bg-white/5 border border-white/20 text-white focus:outline-none focus:ring-2 focus:ring-red-500"
            >
              <option value="all">Alle Beiträge</option>
              <option value="unassigned">Ohne Gennervogt</option>
              {gennervogtOptions.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
        <div className="bg-white/10 backdrop-blur-lg rounded-lg p-6">
          <div className="flex items-center justify-between">
            <p className="text-gray-300 text-sm uppercase tracking-wide">Gesamtsumme</p>
            <TrendingUp className="w-6 h-6 text-red-500" />
          </div>
          <p className="text-3xl font-semibold text-white mt-4">CHF {stats.total.toFixed(2)}</p>
          <p className="text-sm text-gray-400 mt-2">{stats.count} Beiträge</p>
        </div>

        <div className="bg-white/10 backdrop-blur-lg rounded-lg p-6">
          <div className="flex items-center justify-between">
            <p className="text-gray-300 text-sm uppercase tracking-wide">Bezahlt</p>
            <CheckCircle className="w-6 h-6 text-green-500" />
          </div>
          <p className="text-3xl font-semibold text-white mt-4">CHF {stats.paidTotal.toFixed(2)}</p>
          <p className="text-sm text-gray-400 mt-2">{stats.paidCount} Beiträge</p>
        </div>

        <div className="bg-white/10 backdrop-blur-lg rounded-lg p-6">
          <div className="flex items-center justify-between">
            <p className="text-gray-300 text-sm uppercase tracking-wide">Ausstehend</p>
            <AlertTriangle className="w-6 h-6 text-yellow-500" />
          </div>
          <p className="text-3xl font-semibold text-white mt-4">CHF {stats.pendingTotal.toFixed(2)}</p>
          <p className="text-sm text-gray-400 mt-2">{stats.count - stats.paidCount} Beiträge</p>
        </div>

        <div className="bg-white/10 backdrop-blur-lg rounded-lg p-6">
          <div className="flex items-center justify-between">
            <p className="text-gray-300 text-sm uppercase tracking-wide">Durchschnitt</p>
            <Activity className="w-6 h-6 text-blue-400" />
          </div>
          <p className="text-3xl font-semibold text-white mt-4">CHF {stats.average.toFixed(2)}</p>
          <p className="text-sm text-gray-400 mt-2">pro Beitrag</p>
        </div>

        <div className="bg-white/10 backdrop-blur-lg rounded-lg p-6">
          <div className="flex items-center justify-between">
            <p className="text-gray-300 text-sm uppercase tracking-wide">Median</p>
            <BarChart3 className="w-6 h-6 text-purple-400" />
          </div>
          <p className="text-3xl font-semibold text-white mt-4">CHF {stats.median.toFixed(2)}</p>
          <p className="text-sm text-gray-400 mt-2">mittlerer Beitrag</p>
        </div>

        <div className="bg-white/10 backdrop-blur-lg rounded-lg p-6">
          <div className="flex items-center justify-between">
            <p className="text-gray-300 text-sm uppercase tracking-wide">Höchster Beitrag</p>
            <Star className="w-6 h-6 text-amber-400" />
          </div>
          <p className="text-3xl font-semibold text-white mt-4">CHF {stats.max.toFixed(2)}</p>
          <p className="text-sm text-gray-400 mt-2">Top Einzelbetrag</p>
        </div>
      </div>

      <div className="bg-white/10 backdrop-blur-lg rounded-lg p-6">
        <h2 className="text-xl font-semibold text-white mb-4">Top Beiträge</h2>
        {stats.topContributions.length === 0 ? (
          <p className="text-gray-400">Keine Daten verfügbar.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-gray-200">
              <thead>
                <tr className="text-gray-400 uppercase text-xs tracking-wide">
                  <th className="text-left py-2">Name</th>
                  <th className="text-left py-2">E-Mail</th>
                  <th className="text-left py-2">Zahlungsmethode</th>
                  <th className="text-left py-2">Betrag</th>
                  <th className="text-left py-2">Status</th>
                  <th className="text-left py-2">Datum</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/10">
                {stats.topContributions.map((entry) => (
                  <tr key={entry.id}>
                    <td className="py-2">{entry.first_name} {entry.last_name}</td>
                    <td className="py-2">{entry.email}</td>
                    <td className="py-2">{formatPaymentMethod(entry.payment_method)}</td>
                    <td className="py-2 font-semibold">CHF {Number(entry.amount).toFixed(2)}</td>
                    <td className="py-2">{entry.paid ? 'Bezahlt' : 'Ausstehend'}</td>
                    <td className="py-2">{new Date(entry.created_at).toLocaleDateString('de-CH')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="bg-white/10 backdrop-blur-lg rounded-lg p-6">
          <h2 className="text-xl font-semibold text-white mb-4">Monatliche Entwicklung</h2>
          {stats.monthly.length === 0 ? (
            <p className="text-gray-400">Noch keine Beiträge vorhanden.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-gray-200">
                <thead>
                  <tr className="text-gray-400 uppercase text-xs tracking-wide">
                    <th className="text-left py-2">Monat</th>
                    <th className="text-left py-2">Anzahl</th>
                    <th className="text-left py-2">Summe</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/10">
                  {stats.monthly.map((item) => (
                    <tr key={item.label}>
                      <td className="py-2">{item.label}</td>
                      <td className="py-2">{item.count}</td>
                      <td className="py-2">CHF {item.total.toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="bg-white/10 backdrop-blur-lg rounded-lg p-6">
          <h2 className="text-xl font-semibold text-white mb-4">Beiträge nach Stadt</h2>
          {stats.byCity.length === 0 ? (
            <p className="text-gray-400">Keine Daten verfügbar.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-gray-200">
                <thead>
                  <tr className="text-gray-400 uppercase text-xs tracking-wide">
                    <th className="text-left py-2">Stadt</th>
                    <th className="text-left py-2">Anzahl</th>
                    <th className="text-left py-2">Summe</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/10">
                  {stats.byCity.map((item) => (
                    <tr key={item.city}>
                      <td className="py-2">{item.city}</td>
                      <td className="py-2">{item.count}</td>
                      <td className="py-2">CHF {item.total.toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
