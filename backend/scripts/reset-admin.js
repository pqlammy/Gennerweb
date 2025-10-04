#!/usr/bin/env node

/**
 * Resets or creates the primary admin account using the current DATABASE_URL env.
 *
 * Usage:
 *   ADMIN_RESET_USERNAME=admin ADMIN_RESET_PASSWORD='Genner!2025' node scripts/reset-admin.js
 */

require('dotenv').config({ path: require('path').resolve(__dirname, '../..', '.env') });

const { Pool } = require('pg');
const bcrypt = require('bcryptjs');

const username = (process.env.ADMIN_RESET_USERNAME || 'admin').trim().toLowerCase();
const password = process.env.ADMIN_RESET_PASSWORD || 'Genner!2025';
const email = process.env.ADMIN_RESET_EMAIL && process.env.ADMIN_RESET_EMAIL.trim() !== ''
  ? process.env.ADMIN_RESET_EMAIL.trim().toLowerCase()
  : null;

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL is not set. Please export it before running this script.');
  process.exit(1);
}

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });

  try {
    const client = await pool.connect();
    try {
      const passwordHash = await bcrypt.hash(password, 12);
      const existing = await client.query('SELECT id FROM users WHERE username = $1', [username]);

      if (existing.rowCount === 0) {
        await client.query(
          'INSERT INTO users (username, email, password_hash, role) VALUES ($1, $2, $3, $4)',
          [username, email, passwordHash, 'admin']
        );
        console.log(`Admin Benutzer angelegt: ${username}`);
      } else {
        await client.query(
          'UPDATE users SET password_hash = $1, email = $2, role = $3 WHERE username = $4',
          [passwordHash, email, 'admin', username]
        );
        console.log(`Admin Zugang zurückgesetzt für Benutzer ${username}`);
      }

      console.log('\nNeue Zugangsdaten:');
      console.log(`  Benutzername: ${username}`);
      if (email) {
        console.log(`  E-Mail:      ${email}`);
      }
      console.log(`  Passwort:    ${password}`);
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Admin reset failed:', error.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

main();
