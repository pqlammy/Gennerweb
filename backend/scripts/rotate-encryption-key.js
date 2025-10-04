#!/usr/bin/env node

require('dotenv').config();

const { Pool } = require('pg');
const crypto = require('crypto');

const oldKeyRaw = process.env.OLD_ENCRYPTION_KEY;
const newKeyRaw = process.env.NEW_ENCRYPTION_KEY;

if (!oldKeyRaw || !newKeyRaw) {
  console.error('ERROR: Please provide OLD_ENCRYPTION_KEY and NEW_ENCRYPTION_KEY in the environment.');
  process.exit(1);
}

const resolveKey = (value, label) => {
  const trimmed = value.trim();
  let buffer = Buffer.from(trimmed, 'utf8');
  const hexPattern = /^[0-9a-fA-F]+$/;
  if (hexPattern.test(trimmed) && trimmed.length % 2 === 0 && buffer.length !== 32) {
    buffer = Buffer.from(trimmed, 'hex');
  }
  if (buffer.length !== 32) {
    console.error(`ERROR: ${label} must resolve to exactly 32 bytes. Use e.g. "openssl rand -hex 32" or supply a 32-character ASCII secret.`);
    process.exit(1);
  }
  return buffer;
};

const oldKey = resolveKey(oldKeyRaw, 'OLD_ENCRYPTION_KEY');
const newKey = resolveKey(newKeyRaw, 'NEW_ENCRYPTION_KEY');

const poolConfig = {
  connectionString: process.env.DATABASE_URL
};

if (process.env.DB_SSL === 'true') {
  poolConfig.ssl = { rejectUnauthorized: false };
}

const pool = new Pool(poolConfig);

const IV_LENGTH = 12;

const decryptWithKey = (value, key) => {
  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value !== 'string' || value.trim() === '') {
    return value;
  }

  const segments = value.split(':');
  if (segments.length !== 3) {
    return value;
  }

  const [ivHex, tagHex, encryptedHex] = segments;

  try {
    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(tagHex, 'hex');
    const encrypted = Buffer.from(encryptedHex, 'hex');

    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(authTag);

    const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
    return decrypted.toString('utf8');
  } catch (error) {
    throw new Error(`Failed to decrypt value. Ensure OLD_ENCRYPTION_KEY is correct. Root cause: ${error.message}`);
  }
};

const encryptWithKey = (value, key) => {
  if (value === null || value === undefined) {
    return null;
  }

  const plain = String(value);
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted.toString('hex')}`;
};

const processTable = async (client, query, updater) => {
  const { rows } = await client.query(query);
  for (const row of rows) {
    await updater(row, client);
  }
};

const rotateContributions = async (client) => {
  await processTable(
    client,
    'SELECT id, first_name, last_name, email, address, city, postal_code FROM contributions',
    async (row, tx) => {
      const decrypted = {
        first_name: decryptWithKey(row.first_name, oldKey),
        last_name: decryptWithKey(row.last_name, oldKey),
        email: decryptWithKey(row.email, oldKey),
        address: decryptWithKey(row.address, oldKey),
        city: decryptWithKey(row.city, oldKey),
        postal_code: decryptWithKey(row.postal_code, oldKey)
      };

      await tx.query(
        `UPDATE contributions
         SET first_name = $1,
             last_name = $2,
             email = $3,
             address = $4,
             city = $5,
             postal_code = $6
         WHERE id = $7`,
        [
          encryptWithKey(decrypted.first_name, newKey),
          encryptWithKey(decrypted.last_name, newKey),
          encryptWithKey(decrypted.email, newKey),
          encryptWithKey(decrypted.address, newKey),
          encryptWithKey(decrypted.city, newKey),
          encryptWithKey(decrypted.postal_code, newKey),
          row.id
        ]
      );
    }
  );
};

const rotateLoginLogs = async (client) => {
  await processTable(
    client,
    'SELECT id, ip_address FROM login_logs',
    async (row, tx) => {
      const decryptedIp = decryptWithKey(row.ip_address, oldKey);
      await tx.query('UPDATE login_logs SET ip_address = $1 WHERE id = $2', [
        encryptWithKey(decryptedIp, newKey),
        row.id
      ]);
    }
  );
};

(async () => {
  const client = await pool.connect();
  try {
    console.log('Starting encryption key rotation...');
    await client.query('BEGIN');
    await rotateContributions(client);
    await rotateLoginLogs(client);
    await client.query('COMMIT');
    console.log('Encryption key rotation complete. Please update ENCRYPTION_KEY and redeploy.');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Rotation failed. Database changes were reverted.');
    console.error(error);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
})();
