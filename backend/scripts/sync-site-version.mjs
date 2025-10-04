#!/usr/bin/env node

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const backendDir = path.resolve(__dirname, '..');
const projectRoot = path.resolve(backendDir, '..');

const log = (message) => {
  process.stdout.write(`[sync-site-version] ${message}\n`);
};

const warn = (message) => {
  process.stderr.write(`[sync-site-version] WARN: ${message}\n`);
};

const error = (message) => {
  process.stderr.write(`[sync-site-version] ERROR: ${message}\n`);
};

const loadEnvironment = async () => {
  let loadEnv;
  try {
    ({ config: loadEnv } = await import('dotenv'));
  } catch (err) {
    warn(`dotenv nicht verfügbar – überspringe .env Ladevorgang (${err.message})`);
    return;
  }

  const envPaths = [
    path.resolve(projectRoot, '.env'),
    path.resolve(backendDir, '.env')
  ];

  let loaded = false;
  for (const envPath of envPaths) {
    try {
      const result = loadEnv({ path: envPath, override: false });
      if (!result.error) {
        loaded = true;
      }
    } catch (err) {
      warn(`Konnte ${envPath} nicht laden: ${err.message}`);
    }
  }

  if (!loaded) {
    warn('Keine .env Datei gefunden – verwende Prozess-Umgebung.');
  }
};

const parseUpdateLogMarkdown = async () => {
  const logPath = path.resolve(projectRoot, 'docs', 'update-log.md');
  let raw;
  try {
    raw = await readFile(logPath, 'utf8');
  } catch (err) {
    throw new Error(`Update-Log-Datei ${logPath} konnte nicht gelesen werden: ${err.message}`);
  }

  const lines = raw.split(/\r?\n/);
  const entries = [];
  let current = null;

  const normalizeText = (value) =>
    typeof value === 'string' ? value.trim() : '';

  const normalizeDate = (rawDate, label) => {
    const value = normalizeText(rawDate);
    if (!value) {
      return null;
    }

    const isoPattern = /^\d{4}-\d{2}-\d{2}$/;
    const euPattern = /^(\d{2})[./](\d{2})[./](\d{4})$/;

    let isoCandidate = value;
    const euMatch = value.match(euPattern);
    if (euMatch) {
      const [, day, month, year] = euMatch;
      isoCandidate = `${year}-${month}-${day}`;
    }

    if (!isoPattern.test(isoCandidate)) {
      warn(`Eintrag ${label}: Datum '${value}' nicht im Format YYYY-MM-DD – Datum wird ignoriert.`);
      return null;
    }

    const parsed = new Date(isoCandidate);
    if (Number.isNaN(parsed.getTime())) {
      warn(`Eintrag ${label}: Datum '${value}' konnte nicht geparst werden – Datum wird ignoriert.`);
      return null;
    }

    return parsed.toISOString().slice(0, 10);
  };

  const headingRegex = /^##\s+([^()]+?)(?:\s*\(([^)]+)\))?\s*$/;

  lines.forEach((line) => {
    const trimmed = line.trim();

    if (trimmed.startsWith('## ')) {
      if (current) {
        current.changes = current.changes.filter((item) => item.length > 0);
        entries.push(current);
      }

      const match = trimmed.match(headingRegex);
      if (!match) {
        warn(`Überschrift konnte nicht interpretiert werden: '${trimmed}'`);
        current = null;
        return;
      }

      const [, versionRaw, dateRaw] = match;
      const version = normalizeText(versionRaw);
      if (!version) {
        warn(`Überschrift ohne Versionsnummer gefunden: '${trimmed}'`);
        current = null;
        return;
      }

      current = {
        version,
        date: normalizeDate(dateRaw ?? '', version),
        changes: []
      };
      return;
    }

    if (!current) {
      return;
    }

    if (/^[-*•]\s+/.test(trimmed)) {
      const text = normalizeText(trimmed.replace(/^[-*•]\s+/, ''));
      if (text) {
        current.changes.push(text);
      }
    }
  });

  if (current) {
    current.changes = current.changes.filter((item) => item.length > 0);
    entries.push(current);
  }

  const sanitized = entries.filter((entry) => entry.changes.length > 0 || entry.version);

  if (sanitized.length === 0) {
    throw new Error('Update-Log-Datei enthält keine gültigen Einträge.');
  }

  return sanitized;
};

const main = async () => {
  await loadEnvironment();

  const updateLog = await parseUpdateLogMarkdown();
  const newest = updateLog[updateLog.length - 1];
  const versionLabel = newest.version;

  const dryRun = String(process.env.SYNC_SITE_VERSION_DRY_RUN || '').trim().toLowerCase() === '1';
  if (dryRun) {
    log(`Dry-Run aktiv – würde Version '${versionLabel}' mit ${updateLog.length} Einträgen schreiben.`);
    return;
  }

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error('Umgebungsvariable DATABASE_URL fehlt.');
  }

  const useSsl = String(process.env.DB_SSL || '').toLowerCase() === 'true';

  const { Pool } = await import('pg');

  const pool = new Pool({
    connectionString: databaseUrl,
    ssl: useSsl ? { rejectUnauthorized: false } : undefined
  });

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const updateResult = await client.query(
      `WITH target AS (
         SELECT id FROM site_settings ORDER BY created_at ASC LIMIT 1
       )
       UPDATE site_settings
          SET version_label = $1,
              update_log = $2::jsonb,
              updated_at = now()
        WHERE id = (SELECT id FROM target)
        RETURNING id`,
      [versionLabel, JSON.stringify(updateLog)]
    );

    if (updateResult.rowCount === 0) {
      await client.query(
        `INSERT INTO site_settings (version_label, update_log)
         VALUES ($1, $2::jsonb)`,
        [versionLabel, JSON.stringify(updateLog)]
      );
    }

    await client.query('COMMIT');
    log(`Version auf '${versionLabel}' gesetzt (${updateLog.length} Log-Einträge synchronisiert).`);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
};

main()
  .catch((err) => {
    error(err instanceof Error ? err.message : String(err));
    process.exitCode = 1;
  });
