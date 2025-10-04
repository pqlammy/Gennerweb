const dotenv = require('dotenv');

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const morgan = require('morgan');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const fs = require('fs');
const { execFile } = require('child_process');
const path = require('path');
let nodemailer;
try {
  nodemailer = require('nodemailer');
} catch (error) {
  console.warn('nodemailer not installed – email confirmations will be disabled until the package is available.');
}
const { Pool } = require('pg');

const envCandidates = new Set();
const registerEnvCandidate = (value) => {
  if (!value) {
    return;
  }
  envCandidates.add(path.resolve(value));
};

registerEnvCandidate(path.join(process.cwd(), '.env'));
registerEnvCandidate(path.join(__dirname, '.env'));
registerEnvCandidate(path.join(__dirname, '..', '.env'));
registerEnvCandidate(path.join(__dirname, '..', '..', '.env'));
registerEnvCandidate(path.join(process.cwd(), '..', '.env'));

const additionalEnv = process.env.ADDITIONAL_ENV_PATHS || process.env.DOTENV_PATHS;
if (additionalEnv) {
  additionalEnv
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean)
    .forEach((entry) => registerEnvCandidate(entry));
}

const execCommand = (command, args = [], options = {}) =>
  new Promise((resolve, reject) => {
    execFile(command, args, options, (error, stdout, stderr) => {
      if (error) {
        const wrapped = new Error(`Command failed: ${command} ${args.join(' ')}\n${stderr || error.message}`);
        wrapped.original = error;
        wrapped.stdout = stdout;
        wrapped.stderr = stderr;
        return reject(wrapped);
      }
      resolve({ stdout, stderr });
    });
  });

const envScanResults = [];
const loadedEnvFiles = new Set();

for (const candidate of envCandidates) {
  const exists = fs.existsSync(candidate);
  const scanInfo = { path: candidate, exists, loaded: false };
  envScanResults.push(scanInfo);

  if (!exists) {
    continue;
  }

  const result = dotenv.config({ path: candidate, override: true });
  if (result.error) {
    console.warn(`Failed to load env file ${candidate}:`, result.error.message);
  } else {
    loadedEnvFiles.add(candidate);
    scanInfo.loaded = true;
  }
}

if (envScanResults.length > 0) {
  console.info(
    `Environment file scan: ${envScanResults
      .map((item) => `${item.path} (${item.exists ? (item.loaded ? 'loaded' : 'exists') : 'missing'})`)
      .join('; ')}`
  );
}

if (loadedEnvFiles.size === 0) {
  console.info('No .env file loaded from disk – relying on process environment variables only.');
} else {
  console.info(`Loaded environment files: ${Array.from(loadedEnvFiles).join(', ')}`);
}

console.info(`Process cwd: ${process.cwd()} | Backend directory: ${__dirname}`);

const readEnvChain = (...keys) => {
  for (const key of keys) {
    const value = process.env[key];
    if (typeof value === 'string' && value.trim() !== '') {
      return value.trim();
    }
  }
  return null;
};

const decodeBase64EnvValue = (...keys) => {
  const raw = readEnvChain(...keys);
  if (!raw) {
    return null;
  }

  try {
    const buffer = Buffer.from(raw, 'base64');
    // Guard against accidental binary blobs – only accept if decoding yields printable text
    const decoded = buffer.toString('utf8');
    return decoded;
  } catch (error) {
    console.warn(`Failed to decode base64 environment variable for keys ${keys.join(', ')}`);
    return null;
  }
};

const resolveTrustProxySetting = () => {
  const raw = readEnvChain('TRUST_PROXY', 'EXPRESS_TRUST_PROXY');
  if (!raw) {
    return ['loopback', 'linklocal', 'uniquelocal'];
  }

  const lower = raw.toLowerCase();
  if (lower === 'false' || lower === '0' || lower === 'off') {
    return false;
  }

  if (/^\d+$/.test(raw)) {
    return Number.parseInt(raw, 10);
  }

  if (lower === 'true' || lower === 'on') {
    return 1;
  }

  return raw;
};

const app = express();
const trustProxySetting = resolveTrustProxySetting();
app.set('trust proxy', trustProxySetting);

const requiredEnvVars = ['DATABASE_URL', 'JWT_SECRET', 'ENCRYPTION_KEY'];
for (const key of requiredEnvVars) {
  if (!process.env[key] || process.env[key].trim() === '') {
    throw new Error(`Missing required environment variable: ${key}`);
  }
}

const ensureSecretStrength = (value, label, minLength) => {
  if (!value || value.trim().length < minLength) {
    throw new Error(`${label} must be at least ${minLength} characters long.`);
  }
};

ensureSecretStrength(process.env.JWT_SECRET, 'JWT_SECRET', 32);

const resolveEncryptionKey = (value, label = 'ENCRYPTION_KEY') => {
  if (!value || value.trim() === '') {
    throw new Error(`Missing required environment variable: ${label}`);
  }

  const trimmed = value.trim();
  let keyBuffer = Buffer.from(trimmed, 'utf8');

  const hexPattern = /^[0-9a-fA-F]+$/;
  if (hexPattern.test(trimmed) && keyBuffer.length !== 32 && trimmed.length % 2 === 0) {
    keyBuffer = Buffer.from(trimmed, 'hex');
  }

  if (keyBuffer.length !== 32) {
    throw new Error(`${label} must resolve to exactly 32 bytes. Use e.g. "openssl rand -hex 32" or a 32-character ASCII secret.`);
  }

  return keyBuffer;
};

const ENCRYPTION_KEY = resolveEncryptionKey(process.env.ENCRYPTION_KEY);

const port = Number.parseInt(process.env.PORT, 10) || 3001;

const poolConfig = {
  connectionString: process.env.DATABASE_URL
};

if (process.env.DB_SSL === 'true') {
  poolConfig.ssl = { rejectUnauthorized: false };
}

const pool = new Pool(poolConfig);

pool.on('error', (err) => {
  console.error('Unexpected error on idle client', err);
});

const IV_LENGTH = 12; // AES-GCM IV length in bytes

const encryptText = (value) => {
  if (value === null || value === undefined) {
    return null;
  }

  const plain = String(value);
  if (!plain) {
    return plain;
  }

  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv('aes-256-gcm', ENCRYPTION_KEY, iv);
  const encrypted = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted.toString('hex')}`;
};

const decryptText = (value) => {
  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value !== 'string' || value.trim() === '') {
    return value;
  }

  const [ivHex, tagHex, encryptedHex] = value.split(':');

  if (!ivHex || !tagHex || !encryptedHex) {
    // Value is not encrypted (legacy data); return as-is
    return value;
  }

  try {
    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(tagHex, 'hex');
    const encrypted = Buffer.from(encryptedHex, 'hex');

    const decipher = crypto.createDecipheriv('aes-256-gcm', ENCRYPTION_KEY, iv);
    decipher.setAuthTag(authTag);

    const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
    return decrypted.toString('utf8');
  } catch (error) {
    console.error('Decryption error:', error);
    // Return the original value so that legacy data still displays
    return value;
  }
};

const emailTemplatePath = path.join(__dirname, 'templates', 'contribution-confirmation.html');
let cachedEmailTemplate = null;
let emailTransporter = null;
let warnedAboutMailConfig = false;

const mailConfig = (() => {
  const host = readEnvChain('MAIL_SMTP_HOST', 'SMTP_HOST', 'MAIL_HOST');
  const portRaw = readEnvChain('MAIL_SMTP_PORT', 'SMTP_PORT', 'MAIL_PORT');
  const parsedPort = portRaw ? Number.parseInt(portRaw, 10) : Number.NaN;
  const port = Number.isFinite(parsedPort) ? parsedPort : 465;
  const userPlain = readEnvChain('MAIL_SMTP_USER', 'SMTP_USER', 'MAIL_USER');
  const passPlain = readEnvChain('MAIL_SMTP_PASS', 'SMTP_PASSWORD', 'MAIL_PASSWORD');
  const userDecoded = decodeBase64EnvValue(
    'MAIL_SMTP_USER_BASE64',
    'SMTP_USER_BASE64',
    'MAIL_USER_BASE64'
  );
  const passDecoded = decodeBase64EnvValue(
    'MAIL_SMTP_PASS_BASE64',
    'SMTP_PASSWORD_BASE64',
    'MAIL_PASSWORD_BASE64'
  );
  const secureRaw = readEnvChain('MAIL_SMTP_SECURE', 'SMTP_SECURE');
  const enabledRaw = readEnvChain('ENABLE_OUTBOUND_MAIL');
  const authMethodRaw = readEnvChain('MAIL_SMTP_AUTH', 'SMTP_AUTH_METHOD');
  const tlsRejectRaw = readEnvChain('MAIL_SMTP_TLS_REJECT_UNAUTHORIZED', 'SMTP_TLS_REJECT_UNAUTHORIZED');

  const normalizedAuthMethod = authMethodRaw
    ? authMethodRaw.trim().toUpperCase()
    : undefined;

  const normalizedTlsReject = (() => {
    if (!tlsRejectRaw) {
      return true;
    }
    const lowered = tlsRejectRaw.trim().toLowerCase();
    return !['false', '0', 'off', 'no'].includes(lowered);
  })();

  return {
    host,
    port,
    rawPort: portRaw,
    portWasFallback: Boolean(portRaw) && !Number.isFinite(parsedPort),
    user: (userDecoded ?? userPlain) || null,
    pass: (passDecoded ?? passPlain) || null,
    from: readEnvChain('MAIL_FROM', 'MAIL_SMTP_FROM', 'SMTP_FROM'),
    secure: secureRaw ? secureRaw.toLowerCase() !== 'false' : true,
    enabled: enabledRaw ? enabledRaw.toLowerCase() !== 'false' : true,
    authMethod: normalizedAuthMethod,
    tlsRejectUnauthorized: normalizedTlsReject
  };
})();

const hasMailCredentials = Boolean(
  nodemailer
  && mailConfig.host
  && Number.isFinite(mailConfig.port)
  && mailConfig.user
  && mailConfig.pass
);

if (mailConfig.portWasFallback) {
  console.warn(`SMTP port "${mailConfig.rawPort ?? ''}" ist ungültig – verwende 465 als Standard.`);
}

console.info(
  `SMTP config detected (host=${mailConfig.host ?? 'n/a'}, user=${mailConfig.user ? '<set>' : 'missing'}, from=${mailConfig.from ?? 'n/a'}, secure=${mailConfig.secure}, auth=${mailConfig.authMethod ?? 'auto'})`
);

if (mailConfig.enabled && !hasMailCredentials) {
  const missingParts = [
    mailConfig.host ? null : 'SMTP_HOST',
    mailConfig.user ? null : 'SMTP_USER',
    mailConfig.pass ? null : 'SMTP_PASSWORD'
  ].filter(Boolean);
  console.warn(
    `Outbound mail disabled: SMTP credentials missing (${missingParts.length > 0 ? missingParts.join(', ') : 'check host/port/user/password'}).`
  );
} else if (mailConfig.enabled && hasMailCredentials && !warnedAboutMailConfig) {
  console.info(`SMTP transport ready for ${mailConfig.user} @ ${mailConfig.host}:${mailConfig.port}`);
}

const loadEmailTemplate = () => {
  if (cachedEmailTemplate !== null) {
    return cachedEmailTemplate;
  }

  try {
    const template = fs.readFileSync(emailTemplatePath, 'utf8');
    cachedEmailTemplate = template;
    return template;
  } catch (error) {
    console.warn('Email template missing, falling back to default message');
    cachedEmailTemplate = null;
    return null;
  }
};

const renderTemplate = (template, variables) => {
  if (!template) {
    return null;
  }

  return template.replace(/{{\s*(\w+)\s*}}/g, (_, key) => {
    const value = variables[key];
    return value === undefined || value === null ? '' : String(value);
  });
};

const looksLikeFullHtmlDocument = (markup) => /<!DOCTYPE/i.test(markup) || /<html/i.test(markup);

const wrapUserTemplate = (markup, settings) => {
  const trimmed = markup.trim();
  if (trimmed.length === 0) {
    return null;
  }

  if (looksLikeFullHtmlDocument(trimmed)) {
    return trimmed;
  }

  const primaryColor = settings.primaryColor || defaultSiteSettings.primaryColor;
  const accentColor = settings.accentColor || defaultSiteSettings.accentColor;

  return `<!DOCTYPE html>
<html lang="de">
  <head>
    <meta charset="utf-8" />
    <title>${settings.autoMailSubject || defaultSiteSettings.autoMailSubject}</title>
    <style>
      body {
        font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
        background-color: #f4f4f5;
        color: #111827;
        margin: 0;
        padding: 0;
      }
      .email-wrapper {
        width: 100%;
        padding: 24px 0;
      }
      .email-container {
        width: 100%;
        max-width: 560px;
        margin: 0 auto;
        background: #ffffff;
        border-radius: 20px;
        box-shadow: 0 24px 48px rgba(15, 23, 42, 0.14);
        overflow: hidden;
      }
      .email-header {
        border-bottom: 4px solid ${accentColor};
        background: ${primaryColor};
        background-color: ${primaryColor};
        background-image: linear-gradient(135deg, ${primaryColor}, ${accentColor});
        background-repeat: no-repeat;
        background-size: cover;
        color: #ffffff;
        padding: 24px;
        text-align: center;
      }
      .email-header h1 {
        margin: 0;
        font-size: 24px;
        letter-spacing: 0.02em;
      }
      .email-content {
        padding: 32px 28px;
      }
      .email-content p {
        margin: 0 0 16px 0;
        line-height: 1.6;
      }
      .email-footer {
        padding: 20px 28px 28px;
        background: #f8fafc;
        color: #475569;
        font-size: 12px;
        text-align: center;
      }
      .email-footer p {
        margin: 6px 0;
      }
      .button {
        display: inline-block;
        background: ${accentColor};
        color: #ffffff !important;
        text-decoration: none;
        padding: 12px 20px;
        border-radius: 999px;
        font-weight: 600;
      }
      @media (max-width: 600px) {
        .email-content {
          padding: 24px 20px;
        }
      }
    </style>
  </head>
  <body>
    <div class="email-wrapper">
      <div class="email-container">
        <div class="email-header" style="background-color: ${primaryColor}; border-bottom: 4px solid ${accentColor}; background-image: linear-gradient(135deg, ${primaryColor}, ${accentColor}); background-repeat: no-repeat; background-size: cover;">
          <!--[if mso]>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:${primaryColor};" bgcolor="${primaryColor}">
            <tr>
              <td align="center" style="padding:24px;">
          <![endif]-->
          <h1>${settings.autoMailSubject || 'Genner Gibelguuger'}</h1>
          <!--[if mso]>
              </td>
            </tr>
          </table>
          <![endif]-->
        </div>
        <div class="email-content">
          ${trimmed}
        </div>
        <div class="email-footer">
          <p>Diese Nachricht wurde automatisch generiert.</p>
          <p>Bitte antworte nicht auf dieses E-Mail.</p>
        </div>
      </div>
    </div>
  </body>
</html>`;
};

const stripHtmlToText = (markup) => markup
  .replace(/\r?\n+/g, ' ')
  .replace(/<\/?p>/gi, '\n')
  .replace(/<br\s*\/?\s*>/gi, '\n')
  .replace(/<[^>]+>/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();

const getEmailTransporter = () => {
  if (!mailConfig.enabled || !hasMailCredentials) {
    if (!warnedAboutMailConfig) {
      warnedAboutMailConfig = true;
      const reason = !mailConfig.enabled
        ? 'disabled via ENABLE_OUTBOUND_MAIL'
        : 'missing SMTP credentials';
      console.warn(`Confirmation emails skipped: SMTP transport ${reason}.`);
    }
    return null;
  }

  if (!emailTransporter) {
    emailTransporter = nodemailer.createTransport({
      host: mailConfig.host,
      port: mailConfig.port,
      secure: mailConfig.secure,
      auth: {
        user: mailConfig.user,
        pass: mailConfig.pass
      },
      authMethod: mailConfig.authMethod,
      tls: {
        rejectUnauthorized: mailConfig.tlsRejectUnauthorized
      }
    });

    if (typeof emailTransporter.verify === 'function') {
      emailTransporter.verify().catch((error) => {
        console.error('SMTP verification failed:', error);
      });
    }
  }

  return emailTransporter;
};

const sendContributionConfirmationEmail = async (contribution) => {
  const transporter = getEmailTransporter();
  if (!transporter) {
    return;
  }

  let settings = defaultSiteSettings;
  try {
    settings = await getSiteSettings();
  } catch (error) {
    console.error('Failed to load site settings for email dispatch:', error);
  }

  const customTemplate = settings.autoMailTemplate && settings.autoMailTemplate.trim().length > 0
    ? wrapUserTemplate(settings.autoMailTemplate, settings)
    : null;

  const template = customTemplate || loadEmailTemplate();
  const variables = {
    firstName: contribution.first_name,
    lastName: contribution.last_name,
    amount: contribution.amount.toFixed(2),
    paymentMethod: contribution.payment_method === 'cash' ? 'Bargeld' : 'TWINT',
    gennervogt: contribution.gennervogt_username || 'deinem Gennervogt',
    createdAt: new Date(contribution.created_at).toLocaleString('de-CH'),
    targetAmount: settings.targetAmount,
    successMessage: settings.successMessage
  };

  const subjectTemplate = settings.autoMailSubject || defaultSiteSettings.autoMailSubject;
  const renderedSubject = renderTemplate(subjectTemplate, variables) || defaultSiteSettings.autoMailSubject;

  const bodyTemplate = settings.autoMailBody || null;
  let renderedTextBody = bodyTemplate ? renderTemplate(bodyTemplate, variables) : null;

  if (renderedTextBody) {
    renderedTextBody = renderedTextBody.replace(/\r\n/g, '\n');
  }

  if (!renderedTextBody || renderedTextBody.trim() === '') {
    renderedTextBody = `Hallo ${variables.firstName} ${variables.lastName},\n\n` +
      `Vielen Dank für deinen Beitrag an den Genner. ` +
      `Wir haben CHF ${variables.amount} via ${variables.paymentMethod} erhalten.` +
      `\n\nMit freundlichen Grüssen\nDein Genner-Team`;
  }

  let renderedHtmlBody = renderedTextBody
    ? renderedTextBody.split('\n').map((line) => line.trim()).join('<br />')
    : null;

  if (template) {
    renderedHtmlBody = renderTemplate(template, variables) || renderedHtmlBody;
  }

  if (process.env.LOG_MAIL_TEMPLATE_USAGE === 'true') {
    console.info(`Mail template source: ${customTemplate ? 'custom' : template ? 'default-file' : 'text-only'}`);
  }

  if ((!settings.autoMailBody || settings.autoMailBody.trim().length === 0) && renderedHtmlBody) {
    renderedTextBody = stripHtmlToText(renderedHtmlBody);
  }

  try {
    await transporter.sendMail({
      from: mailConfig.from || mailConfig.user,
      to: contribution.email,
      subject: renderedSubject,
      text: renderedTextBody,
      html: renderedHtmlBody || undefined
    });
  } catch (error) {
    console.error('Failed to send confirmation email:', error);
  }
};

const allowedPaymentStatuses = new Set([
  'unpaid',
  'twint_pending',
  'cash_pending',
  'twint_paid',
  'cash_paid'
]);

const allowedPaymentMethods = new Set(['twint', 'cash']);

const sanitizeContributionInput = (payload, options = {}) => {
  const {
    allowStatus = false,
    allowSettlement = false,
    formConfig = defaultSiteSettings.formConfiguration || defaultFormConfiguration
  } = options;

  const fieldConfig = formConfig?.fields ?? defaultFormConfiguration.fields;

  const normalizeField = (fieldName, mode, toLower = false) => {
    if (mode === 'hidden') {
      return '';
    }

    const raw = payload[fieldName];
    if (typeof raw !== 'string') {
      if (mode === 'required') {
        throw new Error(`Field "${fieldName}" is required`);
      }
      return '';
    }

    const trimmed = raw.trim();
    if (mode === 'required' && trimmed.length === 0) {
      throw new Error(`Field "${fieldName}" is required`);
    }

    return toLower ? trimmed.toLowerCase() : trimmed;
  };

  const {
    amount,
    first_name,
    last_name,
    gennervogt_id,
    paid,
    payment_method,
    payment_status,
    settlement_code
  } = payload;

  const normalizedAmount = Number(amount);

  if (!Number.isFinite(normalizedAmount) || normalizedAmount <= 0) {
    throw new Error('Amount must be a positive number');
  }

  const requiredStrings = {
    first_name,
    last_name
  };

  for (const [field, value] of Object.entries(requiredStrings)) {
    if (typeof value !== 'string' || value.trim() === '') {
      throw new Error(`Field "${field}" is required`);
    }
  }

  const normalizedEmail = normalizeField('email', fieldConfig.email, true);
  const normalizedAddress = normalizeField('address', fieldConfig.address);
  const normalizedCity = normalizeField('city', fieldConfig.city);
  const normalizedPostalCode = normalizeField('postal_code', fieldConfig.postal_code);
  const normalizedPhone = normalizeField('phone', fieldConfig.phone);

  if (formConfig?.consentRequired) {
    const consentRaw = payload?.consentAccepted;
    const consentTruthy = consentRaw === true
      || consentRaw === 'true'
      || consentRaw === '1'
      || consentRaw === 1;
    if (!consentTruthy) {
      throw new Error('Zustimmung ist erforderlich');
    }
  }

  const normalizedGennervogtId = typeof gennervogt_id === 'string' && gennervogt_id.trim() !== ''
    ? gennervogt_id.trim()
    : null;

  const allowManualPaid = allowStatus === true;

  let normalizedPaid = false;
  if (allowManualPaid) {
    if (typeof paid === 'boolean') {
      normalizedPaid = paid;
    } else if (typeof paid === 'string') {
      const trimmed = paid.trim().toLowerCase();
      normalizedPaid = trimmed === 'true' || trimmed === '1' || trimmed === 'yes';
    } else if (typeof paid === 'number') {
      normalizedPaid = paid > 0;
    }
  }

  let normalizedMethod = 'twint';
  if (typeof payment_method === 'string') {
    const trimmed = payment_method.trim().toLowerCase();
    if (allowedPaymentMethods.has(trimmed)) {
      normalizedMethod = trimmed;
    }
  }

  let normalizedStatus = 'unpaid';
  if (allowStatus && typeof payment_status === 'string') {
    const candidate = payment_status.trim().toLowerCase();
    if (allowedPaymentStatuses.has(candidate)) {
      normalizedStatus = candidate;
    }
  }

  if (normalizedStatus.endsWith('_paid')) {
    normalizedPaid = true;
  } else if (normalizedStatus === 'unpaid' || normalizedStatus.endsWith('_pending')) {
    normalizedPaid = false;
  }

  let normalizedSettlementCode = null;
  if (allowSettlement && typeof settlement_code === 'string' && settlement_code.trim() !== '') {
    const candidate = settlement_code.trim();
    if (candidate.length > 32) {
      throw new Error('Settlement code must not exceed 32 characters');
    }
    normalizedSettlementCode = candidate;
  }

  return {
    amount: normalizedAmount,
    first_name: encryptText(first_name?.trim() ?? ''),
    last_name: encryptText(last_name?.trim() ?? ''),
    email: encryptText(normalizedEmail ?? ''),
    address: encryptText(normalizedAddress ?? ''),
    city: encryptText(normalizedCity ?? ''),
    postal_code: encryptText(normalizedPostalCode ?? ''),
    phone: encryptText(normalizedPhone ?? ''),
    gennervogt_id: normalizedGennervogtId,
    paid: normalizedPaid,
    payment_method: normalizedMethod,
    payment_status: normalizedStatus,
    settlement_code: normalizedSettlementCode
  };
};

const sanitizeContributionForInsert = (payload, userId, options = {}) => {
  const fields = sanitizeContributionInput(payload, options);
  return [
    userId,
    fields.amount,
    fields.first_name,
    fields.last_name,
    fields.email,
    fields.address,
    fields.city,
    fields.postal_code,
    fields.phone,
    fields.gennervogt_id,
    fields.paid,
    fields.payment_method,
    fields.payment_status,
    fields.settlement_code
  ];
};

const sanitizeContributionForUpdate = (payload, options = {}) => sanitizeContributionInput(payload, {
  allowStatus: true,
  allowSettlement: true,
  formConfig: options.formConfig || defaultSiteSettings.formConfiguration
});

const decryptContribution = (row) => {
  const parsedAmount = typeof row.amount === 'string'
    ? Number.parseFloat(row.amount)
    : Number(row.amount);

  return {
    ...row,
    amount: Number.isFinite(parsedAmount) ? parsedAmount : 0,
    first_name: decryptText(row.first_name) ?? '',
    last_name: decryptText(row.last_name) ?? '',
    email: decryptText(row.email) ?? '',
    address: decryptText(row.address) ?? '',
    city: decryptText(row.city) ?? '',
    postal_code: decryptText(row.postal_code) ?? '',
    phone: (() => {
      const decrypted = decryptText(row.phone) ?? '';
      const trimmed = typeof decrypted === 'string' ? decrypted.trim() : '';
      return trimmed.length > 0 ? trimmed : null;
    })(),
    payment_method: row.payment_method || 'twint',
    payment_status: row.payment_status || 'unpaid',
    settlement_code: row.settlement_code || null,
    gennervogt_username: row.gennervogt_username ?? null
  };
};

const selectContributionById = async (db, id) => {
  const result = await db.query(
    'SELECT c.*, gv.username AS gennervogt_username FROM contributions c LEFT JOIN users gv ON gv.id = c.gennervogt_id WHERE c.id = $1',
    [id]
  );

  return result.rows[0] ? decryptContribution(result.rows[0]) : null;
};

const parseUpdateLog = (value) => {
  if (!value) {
    return [];
  }

  try {
    const parsed = Array.isArray(value) ? value : JSON.parse(value);
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed
      .map((entry) => {
        if (!entry || typeof entry !== 'object') {
          return null;
        }

        const version = typeof entry.version === 'string' ? entry.version.trim() : '';
        const date = typeof entry.date === 'string' ? entry.date.trim() : null;
        const changes = Array.isArray(entry.changes)
          ? entry.changes
              .map((item) => (typeof item === 'string' ? item.trim() : ''))
              .filter((item) => item.length > 0)
          : [];

        if (!version) {
          return null;
        }

        return {
          version,
          date,
          changes
        };
      })
      .filter(Boolean);
  } catch (error) {
    console.warn('Failed to parse update log payload:', error);
    return [];
  }
};

const DEFAULT_PRIVACY_POLICY = `# Datenschutzerklärung

## 1. Einleitung
Diese Datenschutzerklärung informiert dich darüber, wie wir personenbezogene Daten im Rahmen des Genner Gibelguuger Portals erheben, speichern, bearbeiten und schützen. Wir halten uns an das revidierte Schweizer Datenschutzgesetz (revDSG) sowie, sofern anwendbar, an die Datenschutz-Grundverordnung (DSGVO) der EU.

## 2. Verantwortliche Stelle
Mingverse Inc.
Postfach 42
6000 Luzern
privacy@mingverse.ch

## 3. Welche Daten wir bearbeiten
- Stammdaten wie Vorname, Nachname, Adresse, PLZ/Ort
- Kontaktangaben (E-Mail-Adresse und optional Telefonnummer)
- Beitragsinformationen (Betrag, Zahlungsmethode, Status, Zeitpunkt)
- Zuordnung zum verantwortlichen Gennervogt
- Systemprotokolle (Login-Versuche, technische Metadaten) zur Gewährleistung der Sicherheit

## 4. Zweck der Datenbearbeitung
Wir verwenden deine Daten ausschliesslich für:
- Erfassung und Verwaltung der eingegangenen Beiträge
- Nachweis der Zahlungen gegenüber dem Verein
- Auswertung im Admin-Bereich (anonymisierte Statistiken)
- Versand automatischer Bestätigungs-E-Mails nach erfolgreicher Erfassung
- Support und Rückfragen zu einzelnen Beiträgen

## 5. Rechtsgrundlagen
Die Bearbeitung basiert auf deiner Einwilligung (Art. 6 Abs. 1 lit. a DSGVO) sowie auf unserem berechtigten Interesse an einer effizienten Abwicklung des Beitragswesens gemäss revDSG. Für Mitgliederbeiträge stützen wir uns zudem auf die Vertragserfüllung (Art. 6 Abs. 1 lit. b DSGVO).

## 6. Aufbewahrung & Löschung
Sämtliche Beitragsdaten werden verschlüsselt gespeichert. Wir bewahren sie mindestens ein Jahr sicher auf, um Rückfragen beantworten und Revisionen durchführen zu können. Nach Ablauf der gesetzlichen Aufbewahrungsfrist werden die Datensätze automatisiert gelöscht oder unwiderruflich anonymisiert. Individuelle Löschgesuche erfüllen wir – sofern keine gesetzlichen Pflichten entgegenstehen – innert 30 Tagen.

## 7. Datensicherheit
Die Plattform wird ausschliesslich über HTTPS (TLS) betrieben. Content-Security-Policies, zusätzliche Sicherheitsheader sowie Verschlüsselung (AES-256-GCM) schützen vor gängigen Web-Angriffen. Zugriff haben nur berechtigte Administratoren. Zusätzlich schützen Rate-Limiting und automatische Überwachungsmechanismen vor DDoS- und Brute-Force-Angriffen.

## 8. Weitergabe an Dritte
Eine Weitergabe an Drittanbieter erfolgt nicht, ausser es besteht eine gesetzliche Verpflichtung oder es ist für den Vereinsabschluss zwingend (z.\u00a0B. Treuhänder oder Revision). In solchen Fällen stellen wir sicher, dass die Empfänger ebenfalls den Datenschutz wahren.

## 9. Automatisierte Benachrichtigungen
Nach Erfassung eines Beitrags versenden wir eine Bestätigungs-E-Mail. Der Inhalt dieser Nachricht kann im Admin-Portal angepasst werden. Die E-Mails werden über einen TLS-gesicherten SMTP-Dienst versendet.

## 10. Deine Rechte
Du hast jederzeit das Recht auf:
- Auskunft über die gespeicherten Daten
- Berichtigung unrichtiger Angaben
- Löschung oder Anonymisierung (sofern keine gesetzlichen Pflichten entgegenstehen)
- Einschränkung der Bearbeitung und Datenübertragbarkeit
- Widerspruch gegen bestimmte Bearbeitungen

## 11. Kontakt für Datenschutzanfragen
Mingverse Inc.
Postfach 42
6000 Luzern
privacy@mingverse.ch

Bitte reiche dein Gesuch schriftlich ein. Wir benötigen einen Identitätsnachweis (z.\u00a0B. Kopie eines offiziellen Ausweises), um Auskünfte nur an berechtigte Personen zu erteilen.

## 12. Änderungen
Wir können diese Datenschutzerklärung bei Bedarf anpassen. Es gilt jeweils die hier veröffentlichte Version. Grössere Änderungen kommunizieren wir über das Portal.`;

const sqlEscapeLiteral = (value) => String(value).replace(/'/g, "''");

const defaultFormConfiguration = {
  fields: {
    email: 'required',
    address: 'required',
    city: 'required',
    postal_code: 'required',
    phone: 'optional'
  },
  consentText: null,
  consentRequired: false,
  amountPresets: [20, 40]
};

const defaultBackgroundStyle = {
  gradient: 'linear-gradient(135deg, rgba(220,38,38,0.92) 0%, rgba(17,24,39,0.94) 65%)',
  imageUrl: null,
  overlayColor: 'rgba(0,0,0,0.6)',
  overlayOpacity: 0.65
};

const defaultFeatureFlags = {
  leaderboard: false,
  healthMonitor: false
};

const defaultSiteSettings = {
  id: null,
  primaryColor: '#dc2626',
  primaryColorDark: '#b91c1c',
  accentColor: '#f97316',
  loginLogoColor: '#dc2626',
  brandMotto: 'Mit Leidenschaft für unseren Verein.',
  navTitle: 'Genner Gibelguuger',
  navSubtitle: 'Mitgliederbereich',
  targetAmount: 100,
  goalDeadline: null,
  welcomeMessage: 'Herzlich willkommen beim Genner Gibelguuger!',
  successMessage: 'Danke für deinen Beitrag! Gemeinsam erreichen wir unser Ziel.',
  autoMailSubject: 'Bestätigung deines Beitrags',
  autoMailBody: 'Hallo {{firstName}} {{lastName}},\n\nVielen Dank für deinen Beitrag von CHF {{amount}} via {{paymentMethod}}.\n\nGenner Gibelguuger',
  autoMailTemplate: null,
  versionLabel: 'v1.0.0',
  updateLog: [],
  legalContact: '',
  privacyPolicy: DEFAULT_PRIVACY_POLICY,
  loginLogo: null,
  loginLogoSize: 96,
  landingCtaTitle: 'Jetzt Beitrag erfassen',
  landingCtaBody: 'Unterstütze unser gemeinsames Ziel und erfasse deinen Beitrag in wenigen Schritten.',
  landingCtaButtonLabel: 'Beitrag sammeln',
  landingCtaButtonUrl: '/dashboard/collect',
  footerText: '© {{year}} Genner Gibelguuger. Alle Rechte vorbehalten.',
  footerLinks: [],
  socialLinks: [],
  formConfiguration: defaultFormConfiguration,
  backgroundStyle: defaultBackgroundStyle,
  featureFlags: defaultFeatureFlags,
  updatedAt: null
};

let cachedSiteSettings = null;
let cachedSiteSettingsFetchedAt = 0;
const SETTINGS_CACHE_MS = 60 * 1000;

const safeJsonParse = (value, fallback) => {
  try {
    return JSON.parse(value);
  } catch (error) {
    return fallback;
  }
};

const normalizeFieldMode = (value, fallback) => {
  const allowed = new Set(['required', 'optional', 'hidden']);
  if (typeof value === 'string' && allowed.has(value)) {
    return value;
  }
  return fallback;
};

const normalizeLinkArray = (value, fallback = []) => {
  const raw = value && typeof value === 'string' ? safeJsonParse(value, []) : value;
  if (!Array.isArray(raw)) {
    return Array.isArray(fallback) ? fallback : [];
  }

  const normalized = raw
    .map((entry) => {
      if (!entry || typeof entry !== 'object') {
        return null;
      }
      const label = typeof entry.label === 'string' ? entry.label.trim() : '';
      const url = typeof entry.url === 'string' ? entry.url.trim() : '';
      const icon = typeof entry.icon === 'string' ? entry.icon.trim() : null;
      if (!label || !url || label.length > 80 || url.length > 512) {
        return null;
      }
      return { label, url, icon };
    })
    .filter(Boolean)
    .slice(0, 12);

  return normalized.length > 0 ? normalized : Array.isArray(fallback) ? fallback : [];
};

const normalizeFormConfigurationInput = (value) => {
  const raw = value && typeof value === 'string' ? safeJsonParse(value, null) : value;
  const fieldsInput = raw && typeof raw === 'object' && raw !== null ? raw.fields : null;
  const defaults = defaultFormConfiguration.fields;
  const normalizedFields = {
    email: normalizeFieldMode(fieldsInput?.email, defaults.email),
    address: normalizeFieldMode(fieldsInput?.address, defaults.address),
    city: normalizeFieldMode(fieldsInput?.city, defaults.city),
    postal_code: normalizeFieldMode(fieldsInput?.postal_code, defaults.postal_code),
    phone: normalizeFieldMode(fieldsInput?.phone, defaults.phone)
  };

  const rawConsent = raw && typeof raw === 'object' ? raw.consentText : null;
  const consentText = typeof rawConsent === 'string' && rawConsent.trim().length > 0
    ? rawConsent.trim().slice(0, 500)
    : null;

  const consentRequired = Boolean(raw && typeof raw === 'object' && raw.consentRequired);

  const amountPresetsRaw = raw && Array.isArray(raw.amountPresets) ? raw.amountPresets : defaultFormConfiguration.amountPresets;
  const amountPresets = amountPresetsRaw
    .map((entry) => Number(entry))
    .filter((num) => Number.isFinite(num) && num > 0 && num <= 100000)
    .slice(0, 8);

  return {
    fields: normalizedFields,
    consentText,
    consentRequired,
    amountPresets: amountPresets.length > 0 ? amountPresets : defaultFormConfiguration.amountPresets
  };
};

const normalizeBackgroundStyleInput = (value) => {
  const raw = value && typeof value === 'string' ? safeJsonParse(value, null) : value;
  if (!raw || typeof raw !== 'object') {
    return { ...defaultBackgroundStyle };
  }
  const gradient = typeof raw.gradient === 'string' && raw.gradient.trim().length > 0
    ? raw.gradient.trim()
    : defaultBackgroundStyle.gradient;
  const imageUrl = typeof raw.imageUrl === 'string' && raw.imageUrl.trim().length > 0
    ? raw.imageUrl.trim()
    : null;
  const overlayColor = typeof raw.overlayColor === 'string' && raw.overlayColor.trim().length > 0
    ? raw.overlayColor.trim()
    : defaultBackgroundStyle.overlayColor;
  const overlayOpacity = Number(raw.overlayOpacity);
  const safeOpacity = Number.isFinite(overlayOpacity) ? Math.min(Math.max(overlayOpacity, 0), 1) : defaultBackgroundStyle.overlayOpacity;

  return {
    gradient,
    imageUrl,
    overlayColor,
    overlayOpacity: safeOpacity
  };
};

const normalizeFeatureFlagsInput = (value) => {
  const raw = value && typeof value === 'string' ? safeJsonParse(value, null) : value;
  const fallback = defaultFeatureFlags;
  const safeBoolean = (input, key) => {
    if (typeof input === 'boolean') {
      return input;
    }
    if (typeof input === 'string') {
      const normalized = input.trim().toLowerCase();
      if (['true', '1', 'yes', 'on'].includes(normalized)) {
        return true;
      }
      if (['false', '0', 'no', 'off'].includes(normalized)) {
        return false;
      }
    }
    return fallback[key];
  };

  return {
    leaderboard: safeBoolean(raw?.leaderboard, 'leaderboard'),
    healthMonitor: safeBoolean(raw?.healthMonitor, 'healthMonitor')
  };
};

const mapSettingsRow = (row) => {
  if (!row) {
    return { ...defaultSiteSettings };
  }

  const numericTarget = typeof row.target_amount === 'string'
    ? Number.parseFloat(row.target_amount)
    : Number(row.target_amount);

  const footerLinks = normalizeLinkArray(row.footer_links, defaultSiteSettings.footerLinks);
  const socialLinks = normalizeLinkArray(row.social_links, defaultSiteSettings.socialLinks);
  const formConfiguration = normalizeFormConfigurationInput(row.form_configuration);
  const backgroundStyle = normalizeBackgroundStyleInput(row.background_style);
  const featureFlags = normalizeFeatureFlagsInput(row.feature_flags);

  return {
    id: row.id,
    primaryColor: row.primary_color || defaultSiteSettings.primaryColor,
    primaryColorDark: row.primary_color_dark || defaultSiteSettings.primaryColorDark,
    accentColor: row.accent_color || defaultSiteSettings.accentColor,
    brandMotto: row.brand_motto || defaultSiteSettings.brandMotto,
    navTitle: row.nav_title || defaultSiteSettings.navTitle,
    navSubtitle: row.nav_subtitle || defaultSiteSettings.navSubtitle,
    targetAmount: Number.isFinite(numericTarget) ? numericTarget : defaultSiteSettings.targetAmount,
    goalDeadline: row.goal_deadline ? new Date(row.goal_deadline).toISOString() : null,
    welcomeMessage: row.welcome_message || defaultSiteSettings.welcomeMessage,
    successMessage: row.success_message || defaultSiteSettings.successMessage,
    autoMailSubject: row.auto_mail_subject || defaultSiteSettings.autoMailSubject,
    autoMailBody: row.auto_mail_body || defaultSiteSettings.autoMailBody,
    autoMailTemplate: typeof row.auto_mail_template === 'string' && row.auto_mail_template.trim().length > 0
      ? row.auto_mail_template
      : defaultSiteSettings.autoMailTemplate,
    versionLabel: row.version_label || defaultSiteSettings.versionLabel,
    updateLog: parseUpdateLog(row.update_log),
    legalContact: row.legal_contact || defaultSiteSettings.legalContact,
    privacyPolicy: row.privacy_policy || defaultSiteSettings.privacyPolicy,
    loginLogo: row.login_logo_svg && row.login_logo_svg.trim().length > 0
      ? row.login_logo_svg
      : defaultSiteSettings.loginLogo,
    loginLogoColor: row.login_logo_color || defaultSiteSettings.loginLogoColor,
    loginLogoSize: Number.isFinite(row.login_logo_size)
      ? Number(row.login_logo_size)
      : defaultSiteSettings.loginLogoSize,
    landingCtaTitle: row.landing_cta_title || defaultSiteSettings.landingCtaTitle,
    landingCtaBody: row.landing_cta_body || defaultSiteSettings.landingCtaBody,
    landingCtaButtonLabel: row.landing_cta_button_label || defaultSiteSettings.landingCtaButtonLabel,
    landingCtaButtonUrl: row.landing_cta_button_url || defaultSiteSettings.landingCtaButtonUrl,
    footerText: row.footer_text || defaultSiteSettings.footerText,
    footerLinks,
    socialLinks,
    formConfiguration,
    backgroundStyle,
    featureFlags,
    updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : null
  };
};

const invalidateSiteSettingsCache = () => {
  cachedSiteSettings = null;
  cachedSiteSettingsFetchedAt = 0;
};

const getSiteSettings = async ({ fresh = false } = {}) => {
  const now = Date.now();
  if (!fresh && cachedSiteSettings && now - cachedSiteSettingsFetchedAt < SETTINGS_CACHE_MS) {
    return cachedSiteSettings;
  }

  const result = await pool.query('SELECT * FROM site_settings ORDER BY created_at ASC LIMIT 1');
  let settingsRow = result.rows[0];

  if (!settingsRow) {
    const inserted = await pool.query(
      'INSERT INTO site_settings DEFAULT VALUES RETURNING *'
    );
    settingsRow = inserted.rows[0];
  }

  const mapped = mapSettingsRow(settingsRow);
  cachedSiteSettings = mapped;
  cachedSiteSettingsFetchedAt = now;
  return mapped;
};

const sanitizeSettingsForPublic = (settings) => ({
  primaryColor: settings.primaryColor,
  primaryColorDark: settings.primaryColorDark,
  accentColor: settings.accentColor,
  brandMotto: settings.brandMotto,
  navTitle: settings.navTitle,
  navSubtitle: settings.navSubtitle,
  targetAmount: settings.targetAmount,
  goalDeadline: settings.goalDeadline,
  welcomeMessage: settings.welcomeMessage,
  successMessage: settings.successMessage,
  versionLabel: settings.versionLabel,
  updateLog: settings.updateLog,
  legalContact: settings.legalContact,
  privacyPolicy: settings.privacyPolicy,
  loginLogo: settings.loginLogo,
  loginLogoColor: settings.loginLogoColor,
  loginLogoSize: settings.loginLogoSize,
  landingCtaTitle: settings.landingCtaTitle,
  landingCtaBody: settings.landingCtaBody,
  landingCtaButtonLabel: settings.landingCtaButtonLabel,
  landingCtaButtonUrl: settings.landingCtaButtonUrl,
  footerText: settings.footerText,
  footerLinks: settings.footerLinks,
  socialLinks: settings.socialLinks,
  formConfiguration: settings.formConfiguration,
  backgroundStyle: settings.backgroundStyle,
  featureFlags: settings.featureFlags
});

const isStrongPassword = (password) =>
  typeof password === 'string'
  && password.length >= 8
  && /[A-Z]/.test(password)
  && /[a-z]/.test(password)
  && /[0-9]/.test(password);

const normalizeUsername = (value) => (typeof value === 'string' ? value.trim().toLowerCase() : '');

const isValidUsername = (value) => /^[a-z0-9_.-]{3,30}$/.test(value);

const getClientIp = (req) => {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.length > 0) {
    return forwarded.split(',')[0].trim();
  }

  if (Array.isArray(forwarded) && forwarded.length > 0) {
    return forwarded[0];
  }

  return req.socket?.remoteAddress || req.ip || 'unknown';
};

const logLoginAttempt = async ({ userId, ip, success }) => {
  try {
    await pool.query(
      'INSERT INTO login_logs (user_id, ip_address, success) VALUES ($1, $2, $3)',
      [userId ?? null, encryptText(ip), success]
    );
  } catch (error) {
    console.error('Failed to log login attempt:', error);
  }
};

const MAX_FAILED_ATTEMPTS = Number.parseInt(process.env.LOGIN_FAIL_THRESHOLD || '5', 10);
const LOCKOUT_WINDOW_MS = Number.parseInt(process.env.LOGIN_FAIL_WINDOW_MS || String(15 * 60 * 1000), 10);
const LOCKOUT_DURATION_MS = Number.parseInt(process.env.LOGIN_FAIL_LOCKOUT_MS || String(15 * 60 * 1000), 10);
const failedLoginAttempts = new Map();

const failureMapKey = (username, ip) => `${username || 'unknown'}|${ip || 'unknown'}`;

const scheduleFailureCleanup = (key, ttl) => {
  const timer = setTimeout(() => {
    const record = failedLoginAttempts.get(key);
    if (!record) {
      return;
    }
    const now = Date.now();
    const windowExpired = record.firstFailedAt + LOCKOUT_WINDOW_MS <= now;
    const lockExpired = !record.lockUntil || record.lockUntil <= now;
    if (windowExpired && lockExpired) {
      failedLoginAttempts.delete(key);
    }
  }, ttl);
  if (typeof timer.unref === 'function') {
    timer.unref();
  }
};

const getLockoutStatus = (username, ip) => {
  if (MAX_FAILED_ATTEMPTS <= 0) {
    return { locked: false };
  }

  const key = failureMapKey(username, ip);
  const record = failedLoginAttempts.get(key);
  if (!record) {
    return { locked: false };
  }

  const now = Date.now();

  if (record.lockUntil && record.lockUntil > now) {
    return { locked: true, retryAfterMs: record.lockUntil - now };
  }

  if (record.firstFailedAt + LOCKOUT_WINDOW_MS <= now) {
    failedLoginAttempts.delete(key);
  }

  return { locked: false };
};

const registerFailedLogin = (username, ip) => {
  if (MAX_FAILED_ATTEMPTS <= 0) {
    return;
  }

  const key = failureMapKey(username, ip);
  const now = Date.now();
  const existing = failedLoginAttempts.get(key);

  let nextRecord;
  if (existing && existing.firstFailedAt + LOCKOUT_WINDOW_MS > now) {
    nextRecord = { ...existing, count: existing.count + 1 };
  } else {
    nextRecord = { count: 1, firstFailedAt: now, lockUntil: null };
  }

  if (nextRecord.count >= MAX_FAILED_ATTEMPTS) {
    nextRecord.lockUntil = now + LOCKOUT_DURATION_MS;
    nextRecord.count = 0;
    nextRecord.firstFailedAt = now;
  }

  failedLoginAttempts.set(key, nextRecord);
  scheduleFailureCleanup(key, Math.max(LOCKOUT_WINDOW_MS, LOCKOUT_DURATION_MS));
};

const clearFailedLogins = (username, ip) => {
  if (MAX_FAILED_ATTEMPTS <= 0) {
    return;
  }
  failedLoginAttempts.delete(failureMapKey(username, ip));
};

const basicFirewallPatterns = [
  /<script/i,
  /javascript:/i,
  /onerror=/i,
  /onload=/i,
  /union\s+select/i,
  /drop\s+table/i
];

const basicRequestFirewall = (req, res, next) => {
  try {
    const serialized = [
      req.originalUrl,
      JSON.stringify(req.query ?? {}),
      JSON.stringify(req.body ?? {})
    ].join(' ');

    if (basicFirewallPatterns.some((pattern) => pattern.test(serialized))) {
      return res.status(400).json({ error: 'Request rejected' });
    }
  } catch (error) {
    console.error('Firewall inspection failed:', error);
  }

  return next();
};

const initializeDatabase = async () => {
  await pool.query('CREATE EXTENSION IF NOT EXISTS "pgcrypto";');

  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      username varchar(150) UNIQUE NOT NULL,
      email varchar(255),
      password_hash varchar(255) NOT NULL,
      role varchar(50) DEFAULT 'user',
      created_at timestamptz DEFAULT now()
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS contributions (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id uuid REFERENCES users(id) ON DELETE CASCADE,
      amount numeric NOT NULL CHECK (amount > 0),
      first_name text NOT NULL,
      last_name text NOT NULL,
      email text NOT NULL,
      address text NOT NULL,
      city text NOT NULL,
      postal_code text NOT NULL,
      gennervogt_id uuid REFERENCES users(id) ON DELETE SET NULL,
      paid boolean DEFAULT false,
      payment_method varchar(20) DEFAULT 'twint' NOT NULL,
      payment_status varchar(30) DEFAULT 'unpaid' NOT NULL,
      settlement_code varchar(32),
      created_at timestamptz DEFAULT now()
    );
  `);

  await pool.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS username varchar(150);');
  await pool.query("UPDATE users SET username = LOWER(email) WHERE (username IS NULL OR TRIM(username) = '') AND email IS NOT NULL;");
  try {
    await pool.query('ALTER TABLE users ALTER COLUMN username SET NOT NULL;');
  } catch (error) {
    console.warn('Unable to enforce NOT NULL on username – please ensure all users have a username.');
  }
  try {
    await pool.query('ALTER TABLE users ALTER COLUMN email DROP NOT NULL;');
  } catch (error) {
    // Column was already nullable
  }
  const constraintCheck = await pool.query(`
    SELECT 1
    FROM information_schema.table_constraints
    WHERE constraint_schema = 'public'
      AND table_name = 'users'
      AND constraint_name = 'users_username_key'
    LIMIT 1;
  `);

  if (constraintCheck.rowCount === 0) {
    await pool.query('ALTER TABLE users ADD CONSTRAINT users_username_key UNIQUE (username);');
  }

  await pool.query('ALTER TABLE contributions ADD COLUMN IF NOT EXISTS payment_method varchar(20) DEFAULT \'twint\';');
  await pool.query("UPDATE contributions SET payment_method = 'twint' WHERE payment_method IS NULL OR payment_method = '';" );
  try {
    await pool.query('ALTER TABLE contributions ALTER COLUMN payment_method SET NOT NULL;');
  } catch (error) {
    console.warn('Unable to enforce NOT NULL on payment_method.');
  }

  await pool.query('ALTER TABLE contributions ADD COLUMN IF NOT EXISTS payment_status varchar(30) DEFAULT \'unpaid\';');
  await pool.query("UPDATE contributions SET payment_status = 'unpaid' WHERE payment_status IS NULL OR payment_status = '';" );
  try {
    await pool.query('ALTER TABLE contributions ALTER COLUMN payment_status SET NOT NULL;');
  } catch (error) {
    console.warn('Unable to enforce NOT NULL on payment_status.');
  }

  await pool.query('ALTER TABLE contributions ADD COLUMN IF NOT EXISTS settlement_code varchar(32);');
  await pool.query('ALTER TABLE contributions ADD COLUMN IF NOT EXISTS phone text');
  await pool.query('DROP INDEX IF EXISTS idx_contributions_settlement_code;');
  await pool.query('CREATE INDEX IF NOT EXISTS idx_contributions_settlement_code ON contributions(settlement_code);');

  await pool.query(`
    CREATE TABLE IF NOT EXISTS login_logs (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id uuid REFERENCES users(id) ON DELETE SET NULL,
      ip_address text NOT NULL,
      success boolean NOT NULL,
      created_at timestamptz DEFAULT now()
    );
  `);

  await pool.query('CREATE INDEX IF NOT EXISTS idx_contributions_user_id ON contributions(user_id);');
  await pool.query('CREATE INDEX IF NOT EXISTS idx_contributions_gennervogt_id ON contributions(gennervogt_id);');
  await pool.query('CREATE INDEX IF NOT EXISTS idx_login_logs_user_id ON login_logs(user_id);');

  await pool.query(`
    CREATE TABLE IF NOT EXISTS site_settings (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      primary_color text NOT NULL DEFAULT '#dc2626',
      primary_color_dark text NOT NULL DEFAULT '#b91c1c',
      accent_color text NOT NULL DEFAULT '#f97316',
      target_amount numeric DEFAULT 100,
      goal_deadline date,
      welcome_message text DEFAULT 'Herzlich willkommen beim Genner Gibelguuger!',
      success_message text DEFAULT 'Danke für deinen Beitrag! Gemeinsam erreichen wir unser Ziel.',
      auto_mail_subject text DEFAULT 'Bestätigung deines Beitrags',
      auto_mail_body text DEFAULT 'Hallo {{firstName}} {{lastName}},\n\nVielen Dank für deinen Beitrag von CHF {{amount}} via {{paymentMethod}}.\n\nGenner Gibelguuger',
      auto_mail_template text,
      version_label text DEFAULT 'v1.0.0',
      update_log jsonb DEFAULT '[]'::jsonb,
      legal_contact text DEFAULT '',
      privacy_policy text DEFAULT '',
      login_logo_svg text,
      login_logo_color text DEFAULT '#dc2626',
      login_logo_size integer DEFAULT 96,
      created_at timestamptz DEFAULT now(),
      updated_at timestamptz DEFAULT now()
    );
  `);

  await pool.query('ALTER TABLE site_settings ADD COLUMN IF NOT EXISTS privacy_policy text');
  await pool.query('ALTER TABLE site_settings ADD COLUMN IF NOT EXISTS login_logo_svg text');
  await pool.query("ALTER TABLE site_settings ADD COLUMN IF NOT EXISTS login_logo_color text DEFAULT '#dc2626'");
  await pool.query('ALTER TABLE site_settings ADD COLUMN IF NOT EXISTS login_logo_size integer DEFAULT 96');
  await pool.query('ALTER TABLE site_settings ADD COLUMN IF NOT EXISTS auto_mail_template text');
  await pool.query('ALTER TABLE site_settings ADD COLUMN IF NOT EXISTS brand_motto text');
  await pool.query('ALTER TABLE site_settings ADD COLUMN IF NOT EXISTS nav_title text');
  await pool.query('ALTER TABLE site_settings ADD COLUMN IF NOT EXISTS nav_subtitle text');
  await pool.query('ALTER TABLE site_settings ADD COLUMN IF NOT EXISTS landing_cta_title text');
  await pool.query('ALTER TABLE site_settings ADD COLUMN IF NOT EXISTS landing_cta_body text');
  await pool.query('ALTER TABLE site_settings ADD COLUMN IF NOT EXISTS landing_cta_button_label text');
  await pool.query('ALTER TABLE site_settings ADD COLUMN IF NOT EXISTS landing_cta_button_url text');
  await pool.query('ALTER TABLE site_settings ADD COLUMN IF NOT EXISTS footer_text text');
  await pool.query("ALTER TABLE site_settings ADD COLUMN IF NOT EXISTS footer_links jsonb DEFAULT '[]'::jsonb");
  await pool.query("ALTER TABLE site_settings ADD COLUMN IF NOT EXISTS social_links jsonb DEFAULT '[]'::jsonb");
  await pool.query("ALTER TABLE site_settings ADD COLUMN IF NOT EXISTS form_configuration jsonb DEFAULT '{}'::jsonb");
  await pool.query("ALTER TABLE site_settings ADD COLUMN IF NOT EXISTS background_style jsonb DEFAULT '{}'::jsonb");
  await pool.query("ALTER TABLE site_settings ADD COLUMN IF NOT EXISTS feature_flags jsonb DEFAULT '{}'::jsonb");

  await pool.query(`
    INSERT INTO site_settings (primary_color, primary_color_dark, accent_color, target_amount, welcome_message, success_message, auto_mail_subject, auto_mail_body, version_label, update_log, privacy_policy)
    SELECT '#dc2626', '#b91c1c', '#f97316', 100, 'Herzlich willkommen beim Genner Gibelguuger!', 'Danke für deinen Beitrag! Gemeinsam erreichen wir unser Ziel.', 'Bestätigung deines Beitrags', 'Hallo {{firstName}} {{lastName}},\n\nVielen Dank für deinen Beitrag von CHF {{amount}} via {{paymentMethod}}.\n\nGenner Gibelguuger', 'v1.0.0', '[]'::jsonb, $1
    WHERE NOT EXISTS (SELECT 1 FROM site_settings);
  `, [DEFAULT_PRIVACY_POLICY]);

  await pool.query(
    `UPDATE site_settings SET
       brand_motto = COALESCE(NULLIF(brand_motto, ''), $1),
       nav_title = COALESCE(NULLIF(nav_title, ''), $2),
       nav_subtitle = COALESCE(NULLIF(nav_subtitle, ''), $3),
       landing_cta_title = COALESCE(NULLIF(landing_cta_title, ''), $4),
       landing_cta_body = COALESCE(NULLIF(landing_cta_body, ''), $5),
       landing_cta_button_label = COALESCE(NULLIF(landing_cta_button_label, ''), $6),
       landing_cta_button_url = COALESCE(NULLIF(landing_cta_button_url, ''), $7),
       footer_text = COALESCE(NULLIF(footer_text, ''), $8)
     WHERE brand_motto IS NULL
        OR nav_title IS NULL
        OR nav_subtitle IS NULL
        OR landing_cta_title IS NULL
        OR landing_cta_body IS NULL
        OR landing_cta_button_label IS NULL
        OR landing_cta_button_url IS NULL
        OR footer_text IS NULL`,
    [
      defaultSiteSettings.brandMotto,
      defaultSiteSettings.navTitle,
      defaultSiteSettings.navSubtitle,
      defaultSiteSettings.landingCtaTitle,
      defaultSiteSettings.landingCtaBody,
      defaultSiteSettings.landingCtaButtonLabel,
      defaultSiteSettings.landingCtaButtonUrl,
      defaultSiteSettings.footerText
    ]
  );

  await pool.query(
    `UPDATE site_settings
     SET footer_links = '[]'::jsonb
     WHERE footer_links IS NULL`
  );

  await pool.query(
    `UPDATE site_settings
     SET social_links = '[]'::jsonb
     WHERE social_links IS NULL`
  );

  await pool.query(
    `UPDATE site_settings
     SET form_configuration = $1::jsonb
     WHERE form_configuration IS NULL OR jsonb_typeof(form_configuration) <> 'object'`,
    [JSON.stringify(defaultFormConfiguration)]
  );

  await pool.query(
    `UPDATE site_settings
     SET background_style = $1::jsonb
     WHERE background_style IS NULL OR jsonb_typeof(background_style) <> 'object'`,
    [JSON.stringify(defaultBackgroundStyle)]
  );

  await pool.query(
    `UPDATE site_settings
     SET feature_flags = $1::jsonb
     WHERE feature_flags IS NULL OR jsonb_typeof(feature_flags) <> 'object'`,
    [JSON.stringify(defaultFeatureFlags)]
  );

  const defaultPrivacyLiteral = sqlEscapeLiteral(DEFAULT_PRIVACY_POLICY);
  await pool.query(
    `ALTER TABLE site_settings ALTER COLUMN privacy_policy SET DEFAULT '${defaultPrivacyLiteral}'`
  );
  await pool.query("UPDATE site_settings SET privacy_policy = $1 WHERE privacy_policy IS NULL OR TRIM(privacy_policy) = ''", [DEFAULT_PRIVACY_POLICY]);

  const adminUsername = (process.env.ADMIN_USERNAME || 'admin').trim().toLowerCase();
  const adminEmailEnv = process.env.ADMIN_EMAIL ? process.env.ADMIN_EMAIL.trim().toLowerCase() : null;
  const adminPassword = process.env.ADMIN_PASSWORD || 'Admin!2345';

  let existingAdmin = await pool.query('SELECT id, password_hash, role, email FROM users WHERE username = $1', [adminUsername]);

  if (existingAdmin.rowCount === 0 && adminEmailEnv) {
    const legacyAdmin = await pool.query('SELECT id FROM users WHERE email = $1', [adminEmailEnv]);
    if (legacyAdmin.rowCount > 0) {
      await pool.query('UPDATE users SET username = $1 WHERE id = $2', [adminUsername, legacyAdmin.rows[0].id]);
      existingAdmin = await pool.query('SELECT id, password_hash, role, email FROM users WHERE username = $1', [adminUsername]);
    }
  }

  if (existingAdmin.rowCount === 0) {
    const passwordHash = await bcrypt.hash(adminPassword, 12);
    await pool.query(
      'INSERT INTO users (username, email, password_hash, role) VALUES ($1, $2, $3, $4)',
      [adminUsername, adminEmailEnv, passwordHash, 'admin']
    );
    console.log(`Admin user created with username ${adminUsername}`);
  } else {
    const adminRow = existingAdmin.rows[0];
    const passwordLooksValid = typeof adminRow.password_hash === 'string' && adminRow.password_hash.length >= 60;
    const roleNeedsUpdate = adminRow.role !== 'admin';
    const emailNeedsUpdate = adminEmailEnv && adminRow.email !== adminEmailEnv;

    if (!passwordLooksValid || roleNeedsUpdate || emailNeedsUpdate || process.env.FORCE_ADMIN_PASSWORD_RESET === 'true') {
      const nextPasswordHash = await bcrypt.hash(adminPassword, 12);
      await pool.query(
        'UPDATE users SET password_hash = $1, role = $2, email = $3 WHERE username = $4',
        [nextPasswordHash, 'admin', adminEmailEnv, adminUsername]
      );
      console.log(`Admin user credentials refreshed for ${adminUsername}`);
    }
  }
};

// Middleware
const corsOrigins = (process.env.CORS_ORIGINS || 'http://localhost:5173,http://localhost:3000,http://localhost')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

if (process.env.SITE_URL) {
  corsOrigins.push(process.env.SITE_URL);
}

const allowedOrigins = [...new Set(corsOrigins)];

app.disable('x-powered-by');

const enforceHttps = process.env.REQUIRE_HTTPS === 'true';
if (enforceHttps) {
  app.use((req, res, next) => {
    const forwardedProto = req.headers['x-forwarded-proto'];
    if (forwardedProto && forwardedProto !== 'https') {
      const host = req.headers.host ?? '';
      return res.redirect(301, `https://${host}${req.originalUrl}`);
    }
    return next();
  });
}

if (process.env.NODE_ENV !== 'test') {
  const logFormat = process.env.NODE_ENV === 'production' ? 'combined' : 'dev';
  app.use(morgan(logFormat));
}

const additionalConnectSources = (process.env.CSP_CONNECT_SRC || '')
  .split(',')
  .map((value) => value.trim())
  .filter(Boolean);

const cspDisabled = process.env.DISABLE_CSP === 'true';

app.use(
  helmet({
    crossOriginResourcePolicy: false,
    crossOriginEmbedderPolicy: false,
    crossOriginOpenerPolicy: { policy: 'same-origin' },
    frameguard: { action: 'deny' },
    dnsPrefetchControl: { allow: false },
    originAgentCluster: true,
    referrerPolicy: { policy: 'no-referrer' },
    hsts: {
      maxAge: 60 * 60 * 24 * 365,
      includeSubDomains: true,
      preload: true
    },
    permittedCrossDomainPolicies: { permittedPolicies: 'none' },
    contentSecurityPolicy: cspDisabled
      ? false
      : {
          directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'"],
            imgSrc: ["'self'", 'data:'],
            fontSrc: ["'self'", 'data:'],
            connectSrc: ["'self'", ...additionalConnectSources],
            baseUri: ["'self'"],
            formAction: ["'self'"],
            frameAncestors: ["'none'"]
          }
        }
  })
);

if (!cspDisabled) {
  const connectSrc = ["'self'", ...additionalConnectSources].join(' ');
  const cspHeaderValue = [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data:",
    "font-src 'self' data:",
    `connect-src ${connectSrc}`,
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'"
  ].join('; ');

  app.use((req, res, next) => {
    res.setHeader('Content-Security-Policy', cspHeaderValue);
    next();
  });
}

app.use((req, res, next) => {
  res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
  next();
});

const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: Number.parseInt(process.env.RATE_LIMIT_MAX || '200', 10),
  standardHeaders: true,
  legacyHeaders: false
});

app.use(globalLimiter);

app.use(cors({
  origin: allowedOrigins,
  credentials: true
}));
app.use(express.json({ limit: process.env.JSON_BODY_LIMIT || '1mb' }));
app.use(express.urlencoded({ extended: false, limit: process.env.URLENCODED_BODY_LIMIT || '64kb' }));

const sanitizePayload = (input) => {
  if (!input || typeof input !== 'object') {
    return input;
  }

  if (Array.isArray(input)) {
    return input.map(sanitizePayload);
  }

  // Remove prototype pollution vectors
  delete input.__proto__;
  delete input.constructor;

  for (const key of Object.keys(input)) {
    input[key] = sanitizePayload(input[key]);
  }

  return input;
};

app.use((req, res, next) => {
  if (req.body && typeof req.body === 'object') {
    sanitizePayload(req.body);
  }
  next();
});
app.use(basicRequestFirewall);

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: Number.parseInt(process.env.AUTH_RATE_LIMIT_MAX || '10', 10),
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many login attempts. Please try again later.' }
});

// Auth Middleware
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.sendStatus(401);
  }

  jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
    if (err) return res.sendStatus(403);
    req.user = user;
    next();
  });
};

const requireAdmin = (req, res, next) => {
  if (!req.user || req.user.role !== 'admin') {
    return res.sendStatus(403);
  }
  next();
};

// Auth Routes
app.post('/auth/login', authLimiter, async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required' });
    }

    const normalizedUsername = normalizeUsername(username);
    const clientIp = getClientIp(req);

    const lockStatus = getLockoutStatus(normalizedUsername, clientIp);
    if (lockStatus.locked) {
      const retryAfterSeconds = Math.max(1, Math.ceil((lockStatus.retryAfterMs || 0) / 1000));
      res.setHeader('Retry-After', String(retryAfterSeconds));
      return res.status(429).json({
        error: 'Zu viele fehlgeschlagene Anmeldeversuche. Bitte versuche es später erneut.',
        retryAfterSeconds
      });
    }

    if (!isValidUsername(normalizedUsername)) {
      return res.status(400).json({ error: 'Invalid username format' });
    }

    // Find user
    const result = await pool.query('SELECT * FROM users WHERE username = $1', [normalizedUsername]);
    const user = result.rows[0];

    const passwordMatches = user ? await bcrypt.compare(password, user.password_hash) : false;

    if (!user || !passwordMatches) {
      await logLoginAttempt({
        userId: user ? user.id : null,
        ip: clientIp,
        success: false
      });
      registerFailedLogin(normalizedUsername, clientIp);
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Create JWT
    const token = jwt.sign(
      { userId: user.id, username: user.username, role: user.role, email: user.email ?? null },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );

    await logLoginAttempt({
      userId: user.id,
      ip: clientIp,
      success: true
    });

    clearFailedLogins(normalizedUsername, clientIp);

    res.json({
      token,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        role: user.role
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/auth/register', authLimiter, async (req, res) => {
  try {
    const { username, password, email } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required' });
    }

    const normalizedUsername = normalizeUsername(username);
    if (!isValidUsername(normalizedUsername)) {
      return res.status(400).json({ error: 'Der Benutzername muss 3-30 Zeichen lang sein und darf nur Buchstaben, Zahlen sowie ._- enthalten.' });
    }

    if (!isStrongPassword(password)) {
      return res.status(400).json({ error: 'Password must contain uppercase, lowercase letters and a number, min. 8 Zeichen' });
    }

    const normalizedEmail = typeof email === 'string' && email.trim() !== ''
      ? email.trim().toLowerCase()
      : null;

    // Ensure username is unique
    const existingUser = await pool.query('SELECT id FROM users WHERE username = $1', [normalizedUsername]);
    if (existingUser.rowCount > 0) {
      return res.status(409).json({ error: 'Username already exists' });
    }

    if (normalizedEmail) {
      const existingEmail = await pool.query('SELECT id FROM users WHERE email = $1', [normalizedEmail]);
      if (existingEmail.rowCount > 0) {
        return res.status(409).json({ error: 'Email already exists' });
      }
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, 12);

    // Create user
    const result = await pool.query(
      'INSERT INTO users (username, email, password_hash) VALUES ($1, $2, $3) RETURNING id, username, email, role',
      [normalizedUsername, normalizedEmail, passwordHash]
    );

    const user = result.rows[0];

    // Create JWT
    const token = jwt.sign(
      { userId: user.id, username: user.username, role: user.role, email: user.email ?? null },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );

    res.json({ token, user });
  } catch (error) {
    console.error('Register error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Contributions Routes
app.get('/api/contributions', authenticateToken, async (req, res) => {
  try {
    let result;
    if (req.user.role === 'admin') {
      result = await pool.query(
        'SELECT c.*, gv.username AS gennervogt_username FROM contributions c LEFT JOIN users gv ON gv.id = c.gennervogt_id ORDER BY c.created_at DESC'
      );
    } else {
      result = await pool.query(
        'SELECT c.*, gv.username AS gennervogt_username FROM contributions c LEFT JOIN users gv ON gv.id = c.gennervogt_id WHERE c.user_id = $1 ORDER BY c.created_at DESC',
        [req.user.userId]
      );
    }
    const contributions = result.rows.map(decryptContribution);
    res.json(contributions);
  } catch (error) {
    console.error('Get contributions error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/api/contributions', authenticateToken, async (req, res) => {
  try {
    const settings = await getSiteSettings();
    let insertValues;
    try {
      insertValues = sanitizeContributionForInsert(req.body, req.user.userId, {
        formConfig: settings.formConfiguration
      });
    } catch (validationError) {
      return res.status(400).json({
        error: validationError instanceof Error ? validationError.message : 'Invalid payload'
      });
    }

    const result = await pool.query(
      'INSERT INTO contributions (user_id, amount, first_name, last_name, email, address, city, postal_code, phone, gennervogt_id, paid, payment_method, payment_status, settlement_code) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14) RETURNING *',
      insertValues
    );

    const insertedRow = result.rows[0];
    const saved = insertedRow ? await selectContributionById(pool, insertedRow.id) : null;
    const responsePayload = saved ?? decryptContribution(insertedRow);

    const plainEmail = typeof responsePayload.email === 'string' ? responsePayload.email.trim() : '';
    if (plainEmail.length > 0) {
      sendContributionConfirmationEmail(responsePayload).catch((error) => {
        console.error('Async email dispatch failed:', error);
      });
    }

    res.json(responsePayload);
  } catch (error) {
    console.error('Create contribution error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

const allowedMethods = new Set(['twint', 'cash']);

const determineNextStatus = (currentStatus, method, explicitPaid) => {
  if (typeof explicitPaid === 'boolean') {
    if (explicitPaid) {
      return method === 'cash' ? 'cash_paid' : 'twint_paid';
    }
    return 'unpaid';
  }

  switch (currentStatus) {
    case 'twint_pending':
      return 'twint_paid';
    case 'cash_pending':
      return 'cash_paid';
    case 'twint_paid':
    case 'cash_paid':
      return 'unpaid';
    default:
      return method === 'cash' ? 'cash_paid' : 'twint_paid';
  }
};

app.put('/api/contributions/:id', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const existing = await selectContributionById(pool, id);

    if (!existing) {
      return res.status(404).json({ error: 'Contribution not found' });
    }

    const requestedStatusRaw = typeof req.body.payment_status === 'string' ? req.body.payment_status.trim().toLowerCase() : null;
    const requestedMethodRaw = typeof req.body.payment_method === 'string' ? req.body.payment_method.trim().toLowerCase() : null;
    const requestedPaid = typeof req.body.paid === 'boolean' ? req.body.paid : null;
    const requestedSettlementCode = Object.prototype.hasOwnProperty.call(req.body, 'settlement_code')
      ? typeof req.body.settlement_code === 'string' ? req.body.settlement_code.trim() : null
      : undefined;

    let nextMethod = allowedPaymentMethods.has(requestedMethodRaw ?? '') ? requestedMethodRaw : existing.payment_method;
    if (!allowedPaymentMethods.has(nextMethod)) {
      nextMethod = 'twint';
    }

    let nextStatus = existing.payment_status;
    if (requestedStatusRaw) {
      if (!allowedPaymentStatuses.has(requestedStatusRaw)) {
        return res.status(400).json({ error: 'Invalid payment status' });
      }
      nextStatus = requestedStatusRaw;
    } else {
      nextStatus = determineNextStatus(existing.payment_status, nextMethod, requestedPaid);
    }

    let nextSettlementCode = existing.settlement_code;
    if (requestedSettlementCode !== undefined) {
      if (!requestedSettlementCode) {
        nextSettlementCode = null;
      } else if (requestedSettlementCode.length <= 32) {
        nextSettlementCode = requestedSettlementCode;
      } else {
        return res.status(400).json({ error: 'Settlement code must not exceed 32 characters' });
      }
    }

    if (nextStatus === 'unpaid') {
      nextSettlementCode = null;
    }

    const nextPaid = nextStatus.endsWith('_paid');

    await pool.query(
      'UPDATE contributions SET paid = $1, payment_method = $2, payment_status = $3, settlement_code = $4 WHERE id = $5',
      [nextPaid, nextMethod, nextStatus, nextSettlementCode, id]
    );

    const saved = await selectContributionById(pool, id);
    res.json(saved);
  } catch (error) {
    console.error('Update contribution error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.put('/api/contributions/:id/contact', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const existing = await selectContributionById(pool, id);

    if (!existing) {
      return res.status(404).json({ error: 'Contribution not found' });
    }

    if (req.user.role !== 'admin' && existing.user_id !== req.user.userId) {
      return res.status(403).json({ error: 'Not allowed to modify this contribution' });
    }

    const settings = await getSiteSettings();
    const fieldConfig = settings.formConfiguration?.fields ?? defaultFormConfiguration.fields;

    const {
      first_name: firstName,
      last_name: lastName,
      email,
      address,
      city,
      postal_code: postalCode,
      phone
    } = req.body || {};

    const normalizedFirstName = typeof firstName === 'string' ? firstName.trim() : '';
    const normalizedLastName = typeof lastName === 'string' ? lastName.trim() : '';

    if (!normalizedFirstName) {
      return res.status(400).json({ error: 'Vorname darf nicht leer sein' });
    }

    if (!normalizedLastName) {
      return res.status(400).json({ error: 'Nachname darf nicht leer sein' });
    }

    const emailMode = fieldConfig.email ?? 'required';
    let normalizedEmail = '';
    if (emailMode !== 'hidden') {
      const candidate = typeof email === 'string' ? email.trim() : '';
      if (emailMode === 'required' && candidate.length === 0) {
        return res.status(400).json({ error: 'E-Mail-Adresse darf nicht leer sein' });
      }

      if (candidate.length > 0) {
        const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailPattern.test(candidate.toLowerCase())) {
          return res.status(400).json({ error: 'Bitte eine gültige E-Mail-Adresse angeben' });
        }
        normalizedEmail = candidate.toLowerCase();
      }
    }

    const normalizeOptionalField = (value, mode, label) => {
      if (mode === 'hidden') {
        return '';
      }
      const candidate = typeof value === 'string' ? value.trim() : '';
      if (mode === 'required' && candidate.length === 0) {
        throw new Error(`${label} darf nicht leer sein`);
      }
      return candidate;
    };

    let normalizedAddress;
    let normalizedCity;
    let normalizedPostalCode;
    try {
      normalizedAddress = normalizeOptionalField(address, fieldConfig.address ?? 'required', 'Adresse');
      normalizedCity = normalizeOptionalField(city, fieldConfig.city ?? 'required', 'Ort');
      normalizedPostalCode = normalizeOptionalField(postalCode, fieldConfig.postal_code ?? 'required', 'PLZ');
    } catch (validationError) {
      return res.status(400).json({
        error: validationError instanceof Error ? validationError.message : 'Ungültige Eingabe'
      });
    }

    let normalizedPhone;
    try {
      normalizedPhone = (() => {
        const mode = fieldConfig.phone ?? 'optional';
        if (mode === 'hidden') {
          return '';
        }
        const candidate = typeof phone === 'string' ? phone.trim() : '';
        if (mode === 'required' && candidate.length === 0) {
          throw new Error('Telefonnummer darf nicht leer sein');
        }
        return candidate.slice(0, 60);
      })();
    } catch (validationError) {
      return res.status(400).json({
        error: validationError instanceof Error ? validationError.message : 'Ungültige Telefonnummer'
      });
    }

    await pool.query(
      'UPDATE contributions SET first_name = $1, last_name = $2, email = $3, address = $4, city = $5, postal_code = $6, phone = $7 WHERE id = $8',
      [
        encryptText(normalizedFirstName),
        encryptText(normalizedLastName),
        encryptText(normalizedEmail),
        encryptText(normalizedAddress),
        encryptText(normalizedCity),
        encryptText(normalizedPostalCode),
        encryptText(normalizedPhone),
        id
      ]
    );

    const saved = await selectContributionById(pool, id);
    res.json(saved);
  } catch (error) {
    console.error('Update contribution contact error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

const generateSettlementCode = async () => {
  while (true) {
    const candidate = crypto.randomBytes(8).toString('base64').replace(/[^A-Z0-9]/gi, '').slice(0, 10).toUpperCase();
    if (candidate.length !== 10) {
      continue;
    }
    const exists = await pool.query('SELECT 1 FROM contributions WHERE settlement_code = $1 LIMIT 1', [candidate]);
    if (exists.rowCount === 0) {
      return candidate;
    }
  }
};

app.post('/api/contributions/settlements', authenticateToken, async (req, res) => {
  try {
    const { contributionIds, paymentMethod } = req.body || {};

    if (!Array.isArray(contributionIds) || contributionIds.length === 0) {
      return res.status(400).json({ error: 'No contributions selected' });
    }

    const normalizedMethod = paymentMethod === 'cash' ? 'cash' : 'twint';
    if (!allowedPaymentMethods.has(normalizedMethod)) {
      return res.status(400).json({ error: 'Unsupported payment method' });
    }

    const uuidPattern = /^[0-9a-fA-F-]{36}$/;
    const uniqueIds = [...new Set(contributionIds)]
      .filter((value) => typeof value === 'string' && uuidPattern.test(value));

    if (uniqueIds.length === 0) {
      return res.status(400).json({ error: 'Invalid contribution identifiers' });
    }

    const placeholders = uniqueIds;
    const matches = await pool.query(
      'SELECT id FROM contributions WHERE id = ANY($1::uuid[]) AND user_id = $2 AND payment_status = $3',
      [placeholders, req.user.userId, 'unpaid']
    );

    if (matches.rowCount !== uniqueIds.length) {
      return res.status(400).json({ error: 'Unable to prepare settlement for the selected contributions' });
    }

    const nextStatus = normalizedMethod === 'cash' ? 'cash_pending' : 'twint_pending';
    let settlementCode = null;

    for (let attempt = 0; attempt < 10; attempt += 1) {
      const candidate = await generateSettlementCode();
      try {
        await pool.query(
          'UPDATE contributions SET payment_method = $1, payment_status = $2, settlement_code = $3, paid = false WHERE id = ANY($4::uuid[])',
          [normalizedMethod, nextStatus, candidate, uniqueIds]
        );
        settlementCode = candidate;
        break;
      } catch (error) {
        if (error && typeof error === 'object' && 'code' in error && error.code === '23505') {
          // duplicate settlement code, try again
          continue;
        }
        throw error;
      }
    }

    if (!settlementCode) {
      throw new Error('Unable to generate unique settlement code');
    }

    const updated = await pool.query(
      'SELECT c.*, gv.username AS gennervogt_username FROM contributions c LEFT JOIN users gv ON gv.id = c.gennervogt_id WHERE c.id = ANY($1::uuid[])',
      [uniqueIds]
    );

    res.json({
      settlementCode,
      contributions: updated.rows.map(decryptContribution)
    });
  } catch (error) {
    console.error('Create settlement error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.put('/api/admin/contributions/:id', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;

    const settings = await getSiteSettings();
    let fields;
    try {
      fields = sanitizeContributionForUpdate(req.body, { formConfig: settings.formConfiguration });
    } catch (validationError) {
      return res.status(400).json({
        error: validationError instanceof Error ? validationError.message : 'Invalid payload'
      });
    }

    const updateValues = [
      fields.amount,
      fields.first_name,
      fields.last_name,
      fields.email,
      fields.address,
      fields.city,
      fields.postal_code,
      fields.phone,
      fields.gennervogt_id,
      fields.paid,
      fields.payment_method,
      fields.payment_status,
      fields.settlement_code,
      id
    ];

    const result = await pool.query(
      'UPDATE contributions SET amount = $1, first_name = $2, last_name = $3, email = $4, address = $5, city = $6, postal_code = $7, phone = $8, gennervogt_id = $9, paid = $10, payment_method = $11, payment_status = $12, settlement_code = $13 WHERE id = $14 RETURNING id',
      updateValues
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Contribution not found' });
    }

    const saved = await selectContributionById(pool, id);
    res.json(saved);
  } catch (error) {
    console.error('Admin update contribution error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/api/admin/contributions/mark-paid', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { ids } = req.body || {};

    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ error: 'Keine Beiträge ausgewählt' });
    }

    const uuidPattern = /^[0-9a-fA-F-]{36}$/;
    const uniqueIds = [...new Set(ids)].filter((value) => typeof value === 'string' && uuidPattern.test(value));

    if (uniqueIds.length === 0) {
      return res.status(400).json({ error: 'Ungültige Beitrag-IDs' });
    }

    await pool.query(
      `UPDATE contributions
       SET paid = true,
           payment_method = CASE
             WHEN payment_method = 'cash' OR payment_status LIKE 'cash_%' THEN 'cash'
             ELSE 'twint'
           END,
           payment_status = CASE
             WHEN payment_method = 'cash' OR payment_status LIKE 'cash_%' THEN 'cash_paid'
             ELSE 'twint_paid'
           END
       WHERE id = ANY($1::uuid[])`,
      [uniqueIds]
    );

    const refreshed = await pool.query(
      'SELECT c.*, gv.username AS gennervogt_username FROM contributions c LEFT JOIN users gv ON gv.id = c.gennervogt_id WHERE c.id = ANY($1::uuid[])',
      [uniqueIds]
    );

    res.json({ contributions: refreshed.rows.map(decryptContribution) });
  } catch (error) {
    console.error('Bulk mark paid error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.delete('/api/contributions/:id', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query('DELETE FROM contributions WHERE id = $1 RETURNING id', [id]);

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Contribution not found' });
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Delete contribution error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.delete('/api/admin/contributions', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const result = await pool.query('DELETE FROM contributions');
    res.json({ success: true, deletedCount: result.rowCount });
  } catch (error) {
    console.error('Delete all contributions error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

const escapeCsvValue = (value) => {
  const stringValue = value === null || value === undefined ? '' : String(value);
  if (/[",\n]/.test(stringValue)) {
    return `"${stringValue.replace(/"/g, '""')}"`;
  }
  return stringValue;
};

app.get('/api/admin/contributions/export', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT c.*, gv.username AS gennervogt_username FROM contributions c LEFT JOIN users gv ON gv.id = c.gennervogt_id ORDER BY c.created_at DESC'
    );
    const contributions = result.rows.map(decryptContribution);

    const header = [
      'id',
      'user_id',
      'amount',
      'first_name',
      'last_name',
      'email',
      'address',
      'city',
      'postal_code',
      'phone',
      'gennervogt_id',
      'gennervogt_username',
      'payment_status',
      'payment_method',
      'settlement_code',
      'paid',
      'created_at'
    ];

    const lines = contributions.map((entry) => header.map((key) => escapeCsvValue(entry[key] ?? '')).join(','));
    const csv = [header.join(','), ...lines].join('\n');

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="contributions.csv"');
    res.send(csv);
  } catch (error) {
    console.error('Export contributions error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/admin/contributions/export.json', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT c.*, gv.username AS gennervogt_username FROM contributions c LEFT JOIN users gv ON gv.id = c.gennervogt_id ORDER BY c.created_at DESC'
    );
    const contributions = result.rows.map(decryptContribution);

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', 'attachment; filename="contributions.json"');
    res.send(JSON.stringify(contributions, null, 2));
  } catch (error) {
    console.error('Export JSON contributions error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/api/admin/contributions/import', authenticateToken, requireAdmin, async (req, res) => {
  if (!Array.isArray(req.body)) {
    return res.status(400).json({ error: 'Expected an array of contributions' });
  }

  const settings = await getSiteSettings();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const inserted = [];

    for (const payload of req.body) {
      const normalizedPayload = { ...payload };

      if (normalizedPayload.paymentMethod && !normalizedPayload.payment_method) {
        normalizedPayload.payment_method = normalizedPayload.paymentMethod;
      }

      const missingGennervogt = !normalizedPayload.gennervogt_id || String(normalizedPayload.gennervogt_id).trim() === '';

      if (missingGennervogt) {
        if (typeof normalizedPayload.gennervogt_username === 'string') {
          const candidate = normalizedPayload.gennervogt_username.trim().toLowerCase();
          if (candidate) {
            const gvResult = await client.query('SELECT id FROM users WHERE username = $1', [candidate]);
            if (gvResult.rowCount > 0) {
              normalizedPayload.gennervogt_id = gvResult.rows[0].id;
            }
          }
        }

        if (!normalizedPayload.gennervogt_id && typeof normalizedPayload.gennervogt_email === 'string') {
          const candidate = normalizedPayload.gennervogt_email.trim().toLowerCase();
          if (candidate) {
            const gvResult = await client.query('SELECT id FROM users WHERE email = $1', [candidate]);
            if (gvResult.rowCount > 0) {
              normalizedPayload.gennervogt_id = gvResult.rows[0].id;
            }
          }
        }
      }

      const targetUserId = typeof normalizedPayload.user_id === 'string' && normalizedPayload.user_id.trim() !== ''
        ? normalizedPayload.user_id.trim()
        : req.user.userId;

      let ownerId = targetUserId;

      if (!ownerId && typeof normalizedPayload.user_username === 'string') {
        const usernameCandidate = normalizedPayload.user_username.trim().toLowerCase();
        const userResult = await client.query('SELECT id FROM users WHERE username = $1', [usernameCandidate]);
        ownerId = userResult.rows[0]?.id || req.user.userId;
      }

      if (!ownerId && typeof normalizedPayload.user_email === 'string') {
        const emailCandidate = normalizedPayload.user_email.trim().toLowerCase();
        const userResult = await client.query('SELECT id FROM users WHERE email = $1', [emailCandidate]);
        ownerId = userResult.rows[0]?.id || req.user.userId;
      }

      if (!ownerId) {
        throw new Error('Unable to determine owner for contribution import');
      }

      let insertValues;
      try {
        insertValues = sanitizeContributionForInsert(normalizedPayload, ownerId, {
          allowStatus: true,
          allowSettlement: true,
          formConfig: settings.formConfiguration
        });
      } catch (validationError) {
        throw new Error(
          validationError instanceof Error ? validationError.message : 'Invalid contribution payload'
        );
      }

      const result = await client.query(
        'INSERT INTO contributions (user_id, amount, first_name, last_name, email, address, city, postal_code, phone, gennervogt_id, paid, payment_method, payment_status, settlement_code) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14) RETURNING id',
        insertValues
      );

      const insertedId = result.rows[0]?.id;
      const saved = insertedId ? await selectContributionById(client, insertedId) : null;
      if (saved) {
        inserted.push(saved);
      }
    }

    await client.query('COMMIT');
    const cleaned = inserted.filter(Boolean);
    res.json({ count: cleaned.length, contributions: cleaned });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Import contributions error:', error);
    res.status(400).json({ error: error instanceof Error ? error.message : 'Failed to import contributions' });
  } finally {
    client.release();
  }
});

// Users Routes
app.get('/api/users', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const result = await pool.query('SELECT id, username, email, role FROM users ORDER BY username');
    res.json(result.rows);
  } catch (error) {
    console.error('Get users error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/api/admin/users', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { username, email, password, role = 'user' } = req.body || {};

    if (typeof username !== 'string' || username.trim() === '') {
      return res.status(400).json({ error: 'Username is required' });
    }

    if (typeof password !== 'string' || !isStrongPassword(password)) {
      return res.status(400).json({ error: 'Password muss Gross-/Kleinbuchstaben und eine Zahl enthalten (mind. 8 Zeichen)' });
    }

    const normalizedUsername = normalizeUsername(username);
    if (!isValidUsername(normalizedUsername)) {
      return res.status(400).json({ error: 'Der Benutzername muss 3-30 Zeichen lang sein und darf nur Buchstaben, Zahlen sowie ._- enthalten.' });
    }

    const normalizedEmail = typeof email === 'string' && email.trim() !== ''
      ? email.trim().toLowerCase()
      : null;

    const allowedRoles = ['user', 'admin'];
    const normalizedRole = allowedRoles.includes(role) ? role : 'user';

    const existingUser = await pool.query('SELECT id FROM users WHERE username = $1', [normalizedUsername]);
    if (existingUser.rowCount > 0) {
      return res.status(409).json({ error: 'Username already exists' });
    }

    if (normalizedEmail) {
      const existingEmail = await pool.query('SELECT id FROM users WHERE email = $1', [normalizedEmail]);
      if (existingEmail.rowCount > 0) {
        return res.status(409).json({ error: 'Email already exists' });
      }
    }

    const passwordHash = await bcrypt.hash(password, 12);

    const result = await pool.query(
      'INSERT INTO users (username, email, password_hash, role) VALUES ($1, $2, $3, $4) RETURNING id, username, email, role',
      [normalizedUsername, normalizedEmail, passwordHash, normalizedRole]
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Create user error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/gennervogts', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query('SELECT id, username, email, role FROM users ORDER BY username');
    res.json(result.rows);
  } catch (error) {
    console.error('Get gennervogts error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.put('/api/admin/users/:id', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { username, email, role = 'user' } = req.body || {};

    if (typeof username !== 'string' || username.trim() === '') {
      return res.status(400).json({ error: 'Username is required' });
    }

    const normalizedUsername = normalizeUsername(username);
    if (!isValidUsername(normalizedUsername)) {
      return res.status(400).json({ error: 'Der Benutzername muss 3-30 Zeichen lang sein und darf nur Buchstaben, Zahlen sowie ._- enthalten.' });
    }

    const normalizedEmail = typeof email === 'string' && email.trim() !== ''
      ? email.trim().toLowerCase()
      : null;

    const allowedRoles = ['user', 'admin'];
    if (!allowedRoles.includes(role)) {
      return res.status(400).json({ error: 'Invalid role specified' });
    }

    const existingUser = await pool.query('SELECT id, role FROM users WHERE id = $1', [id]);
    if (existingUser.rowCount === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const usernameConflict = await pool.query('SELECT id FROM users WHERE username = $1 AND id <> $2', [normalizedUsername, id]);
    if (usernameConflict.rowCount > 0) {
      return res.status(409).json({ error: 'Username already exists' });
    }

    if (normalizedEmail) {
      const emailConflict = await pool.query('SELECT id FROM users WHERE email = $1 AND id <> $2', [normalizedEmail, id]);
      if (emailConflict.rowCount > 0) {
        return res.status(409).json({ error: 'Email already exists' });
      }
    }

    if (existingUser.rows[0].role === 'admin' && role !== 'admin') {
      const adminCountResult = await pool.query('SELECT COUNT(*)::int AS count FROM users WHERE role = $1', ['admin']);
      const adminCount = adminCountResult.rows[0]?.count ?? 0;
      if (adminCount <= 1) {
        return res.status(400).json({ error: 'Cannot remove the last admin role' });
      }
    }

    const result = await pool.query(
      'UPDATE users SET username = $1, email = $2, role = $3 WHERE id = $4 RETURNING id, username, email, role',
      [normalizedUsername, normalizedEmail, role, id]
    );

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Update user error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/api/admin/users/:id/reset-password', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { password } = req.body || {};

    if (typeof password !== 'string' || !isStrongPassword(password)) {
      return res.status(400).json({ error: 'Password muss Gross-/Kleinbuchstaben und eine Zahl enthalten (mind. 8 Zeichen)' });
    }

    const passwordHash = await bcrypt.hash(password, 12);

    const result = await pool.query(
      'UPDATE users SET password_hash = $1 WHERE id = $2 RETURNING id, username, email, role',
      [passwordHash, id]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Reset password error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/api/profile/change-password', authenticateToken, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body || {};

    if (typeof currentPassword !== 'string' || currentPassword.length === 0) {
      return res.status(400).json({ error: 'Current password is required' });
    }

    if (typeof newPassword !== 'string' || !isStrongPassword(newPassword)) {
      return res.status(400).json({ error: 'Neues Passwort muss Gross-/Kleinbuchstaben und eine Zahl enthalten (mind. 8 Zeichen)' });
    }

    const result = await pool.query('SELECT id, password_hash FROM users WHERE id = $1', [req.user.userId]);

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const userRow = result.rows[0];

    const passwordMatches = await bcrypt.compare(currentPassword, userRow.password_hash);
    if (!passwordMatches) {
      return res.status(401).json({ error: 'Current password is incorrect' });
    }

    const nextPasswordHash = await bcrypt.hash(newPassword, 12);
    await pool.query('UPDATE users SET password_hash = $1 WHERE id = $2', [nextPasswordHash, userRow.id]);

    res.json({ success: true });
  } catch (error) {
    console.error('Change password error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/settings/public', async (req, res) => {
  try {
    const settings = await getSiteSettings();
    res.json(sanitizeSettingsForPublic(settings));
  } catch (error) {
    console.error('Load public settings error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/admin/settings', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const settings = await getSiteSettings();
    res.json(settings);
  } catch (error) {
    console.error('Load admin settings error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.put('/api/admin/settings', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const current = await getSiteSettings();

    const {
      primaryColor = current.primaryColor,
      primaryColorDark = current.primaryColorDark,
      accentColor = current.accentColor,
      targetAmount = current.targetAmount,
      goalDeadline = current.goalDeadline,
      welcomeMessage = current.welcomeMessage,
      successMessage = current.successMessage,
      autoMailSubject = current.autoMailSubject,
      autoMailBody = current.autoMailBody,
      autoMailTemplate = current.autoMailTemplate,
      versionLabel = current.versionLabel,
      updateLog = current.updateLog,
      legalContact = current.legalContact,
      privacyPolicy = current.privacyPolicy,
      loginLogo = current.loginLogo,
      loginLogoColor = current.loginLogoColor,
      loginLogoSize = current.loginLogoSize,
      brandMotto = current.brandMotto,
      navTitle = current.navTitle,
      navSubtitle = current.navSubtitle,
      landingCtaTitle = current.landingCtaTitle,
      landingCtaBody = current.landingCtaBody,
      landingCtaButtonLabel = current.landingCtaButtonLabel,
      landingCtaButtonUrl = current.landingCtaButtonUrl,
      footerText = current.footerText,
      footerLinks = current.footerLinks,
      socialLinks = current.socialLinks,
      formConfiguration = current.formConfiguration,
      backgroundStyle = current.backgroundStyle,
      featureFlags = current.featureFlags
    } = req.body || {};

    const colorPattern = /^#[0-9a-fA-F]{6}(?:[0-9a-fA-F]{2})?$/;

    const normalizedPrimaryColor = typeof primaryColor === 'string' ? primaryColor.trim() : primaryColor;
    const normalizedPrimaryColorDark = typeof primaryColorDark === 'string' ? primaryColorDark.trim() : primaryColorDark;
    const normalizedAccentColor = typeof accentColor === 'string' ? accentColor.trim() : accentColor;
    const normalizedLoginLogoColorInput = typeof loginLogoColor === 'string' ? loginLogoColor.trim() : loginLogoColor;

    if (!colorPattern.test(normalizedPrimaryColor)) {
      return res.status(400).json({ error: 'Primärfarbe ist ungültig (erwartet Hex, z. B. #ff0000)' });
    }

    if (!colorPattern.test(normalizedPrimaryColorDark)) {
      return res.status(400).json({ error: 'Primärfarbe (Hover) ist ungültig' });
    }

    if (!colorPattern.test(normalizedAccentColor)) {
      return res.status(400).json({ error: 'Akzentfarbe ist ungültig' });
    }

    if (!colorPattern.test(normalizedLoginLogoColorInput)) {
      return res.status(400).json({ error: 'Logo-Farbe ist ungültig' });
    }

    const numericTarget = Number.parseFloat(targetAmount);
    if (!Number.isFinite(numericTarget) || numericTarget < 0) {
      return res.status(400).json({ error: 'Zielbetrag muss eine positive Zahl sein' });
    }

    let normalizedDeadline = null;
    if (goalDeadline) {
      const deadlineDate = new Date(goalDeadline);
      if (Number.isNaN(deadlineDate.getTime())) {
        return res.status(400).json({ error: 'Ungültiges Zieldatum' });
      }
      normalizedDeadline = deadlineDate.toISOString().slice(0, 10);
    }

    const normalizeText = (value, fallback = '') =>
      typeof value === 'string' ? value.trim() : fallback;

    const normalizedWelcome = normalizeText(welcomeMessage, current.welcomeMessage);
    const normalizedSuccess = normalizeText(successMessage, current.successMessage);
    const normalizedSubject = normalizeText(autoMailSubject, current.autoMailSubject);
    const normalizedBody = typeof autoMailBody === 'string' ? autoMailBody : current.autoMailBody;
    const normalizedVersion = normalizeText(versionLabel, current.versionLabel);
    const normalizedLegal = normalizeText(legalContact, current.legalContact);
    const normalizedPrivacy = typeof privacyPolicy === 'string' && privacyPolicy.trim().length > 0
      ? privacyPolicy.trim()
      : current.privacyPolicy || DEFAULT_PRIVACY_POLICY;

    const MAX_LOGO_BYTES = 120 * 1024;

    const normalizeLogo = (value) => {
      if (value === undefined) {
        return current.loginLogo;
      }
      if (value === null) {
        return null;
      }
      if (typeof value !== 'string') {
        return current.loginLogo;
      }

      const trimmed = value.trim();
      if (trimmed.length === 0) {
        return null;
      }

      if (Buffer.byteLength(trimmed, 'utf8') > MAX_LOGO_BYTES) {
        throw new Error('Login-Logo darf maximal 120 KB umfassen.');
      }

      const lowered = trimmed.toLowerCase();
      if (lowered.startsWith('<svg')) {
        if (lowered.includes('<script')) {
          throw new Error('SVG-Logos dürfen keine <script>-Tags enthalten.');
        }
        return trimmed;
      }

      if (lowered.startsWith('data:image/')) {
        const allowedFormats = ['svg+xml', 'png', 'jpeg', 'jpg', 'webp'];
        const header = trimmed.split(',', 1)[0].toLowerCase();
        const supported = allowedFormats.some((token) => header.includes(token));
        if (!supported) {
          throw new Error('Data-URLs unterstützen nur SVG, PNG, JPG oder WebP.');
        }
        return trimmed;
      }

      if (/^https?:\/\//i.test(trimmed)) {
        return trimmed;
      }

      throw new Error('Logo muss als SVG-Markup, Data-URL oder https://-Link vorliegen.');
    };

    let normalizedLogo;
    try {
      normalizedLogo = normalizeLogo(loginLogo);
    } catch (logoError) {
      const message = logoError instanceof Error ? logoError.message : 'Ungültiges Logo';
      return res.status(400).json({ error: message });
    }

    const normalizeLogoSize = (value) => {
      const MIN_SIZE = 48;
      const MAX_SIZE = 220;
      if (value === undefined || value === null) {
        return current.loginLogoSize ?? defaultSiteSettings.loginLogoSize;
      }
      const parsed = Number.parseInt(value, 10);
      if (!Number.isFinite(parsed)) {
        return current.loginLogoSize ?? defaultSiteSettings.loginLogoSize;
      }
      return Math.min(Math.max(parsed, MIN_SIZE), MAX_SIZE);
    };

    const normalizedLogoSize = normalizeLogoSize(loginLogoSize);

    const normalizedLogoColor = typeof normalizedLoginLogoColorInput === 'string'
      ? normalizedLoginLogoColorInput.slice(0, 9)
      : current.loginLogoColor;

    const normalizedBrandMotto = normalizeText(brandMotto, current.brandMotto)
      .slice(0, 180) || defaultSiteSettings.brandMotto;

    const normalizedNavTitle = normalizeText(navTitle, current.navTitle || defaultSiteSettings.navTitle)
      .slice(0, 80) || defaultSiteSettings.navTitle;

    const normalizedNavSubtitle = normalizeText(navSubtitle, current.navSubtitle || defaultSiteSettings.navSubtitle)
      .slice(0, 180);

    const landingTitleCandidate = normalizeText(landingCtaTitle, current.landingCtaTitle || defaultSiteSettings.landingCtaTitle);
    const normalizedLandingTitle = (landingTitleCandidate || defaultSiteSettings.landingCtaTitle).slice(0, 160);

    const landingBodyCandidate = typeof landingCtaBody === 'string'
      ? landingCtaBody.trim()
      : current.landingCtaBody || defaultSiteSettings.landingCtaBody;
    if (landingBodyCandidate.length > 2000) {
      return res.status(400).json({ error: 'Landing-Text darf maximal 2000 Zeichen umfassen' });
    }
    const normalizedLandingBody = landingBodyCandidate.length > 0
      ? landingBodyCandidate
      : defaultSiteSettings.landingCtaBody;

    const landingButtonLabelCandidate = typeof landingCtaButtonLabel === 'string'
      ? landingCtaButtonLabel.trim()
      : (current.landingCtaButtonLabel ?? '');
    const normalizedLandingButtonLabel = landingButtonLabelCandidate.slice(0, 80);

    const landingButtonUrlCandidate = typeof landingCtaButtonUrl === 'string'
      ? landingCtaButtonUrl.trim()
      : (current.landingCtaButtonUrl ?? '');
    if (
      landingButtonUrlCandidate
      && !/^https?:\/\//i.test(landingButtonUrlCandidate)
      && !landingButtonUrlCandidate.startsWith('/')
    ) {
      return res.status(400).json({ error: 'CTA-Link muss mit http(s):// beginnen oder ein relativer Pfad sein' });
    }
    const normalizedLandingButtonUrl = landingButtonUrlCandidate;

    const footerTextCandidate = typeof footerText === 'string'
      ? footerText.trim()
      : (current.footerText ?? defaultSiteSettings.footerText);
    const normalizedFooterText = footerTextCandidate.length > 0
      ? footerTextCandidate.slice(0, 600)
      : defaultSiteSettings.footerText;

    const normalizedFooterLinks = normalizeLinkArray(footerLinks, current.footerLinks);
    const normalizedSocialLinks = normalizeLinkArray(socialLinks, current.socialLinks);
    const normalizedFormConfig = normalizeFormConfigurationInput(formConfiguration);
    const normalizedBackgroundStyle = normalizeBackgroundStyleInput(backgroundStyle);
    const normalizedFeatureFlags = normalizeFeatureFlagsInput(featureFlags);

    const normalizeMailTemplate = (value) => {
      if (value === undefined) {
        return current.autoMailTemplate;
      }
      if (value === null) {
        return null;
      }
      if (typeof value !== 'string') {
        return current.autoMailTemplate;
      }
      const trimmed = value.trim();
      if (trimmed.length === 0) {
        return null;
      }
      const MAX_TEMPLATE_BYTES = 60 * 1024;
      if (Buffer.byteLength(trimmed, 'utf8') > MAX_TEMPLATE_BYTES) {
        throw new Error('E-Mail Vorlage darf maximal 60 KB umfassen.');
      }
      return trimmed;
    };

    let normalizedMailTemplate;
    try {
      normalizedMailTemplate = normalizeMailTemplate(autoMailTemplate);
    } catch (templateError) {
      const message = templateError instanceof Error ? templateError.message : 'Ungültige E-Mail Vorlage';
      return res.status(400).json({ error: message });
    }

    const normalizeUpdateLog = (value) => {
      if (!Array.isArray(value)) {
        return current.updateLog;
      }

      const entries = value
        .map((entry) => {
          if (!entry || typeof entry !== 'object') {
            return null;
          }

          const version = normalizeText(entry.version, '').replace(/\s+/g, ' ');
          if (!version) {
            return null;
          }

          const dateValue = normalizeText(entry.date, '');
          const dateIso = dateValue ? new Date(dateValue) : null;
          const safeDate = dateIso && !Number.isNaN(dateIso.getTime())
            ? dateIso.toISOString().slice(0, 10)
            : null;

          const changes = Array.isArray(entry.changes)
            ? entry.changes
                .map((item) => normalizeText(item, ''))
                .filter((item) => item.length > 0)
            : [];

          return {
            version,
            date: safeDate,
            changes
          };
        })
        .filter(Boolean);

      return entries;
    };

    const normalizedLog = normalizeUpdateLog(updateLog);

    await pool.query(
      `UPDATE site_settings
       SET primary_color = $1,
           primary_color_dark = $2,
           accent_color = $3,
           target_amount = $4,
           goal_deadline = $5,
           welcome_message = $6,
           success_message = $7,
           auto_mail_subject = $8,
           auto_mail_body = $9,
           auto_mail_template = $10,
           version_label = $11,
           update_log = $12::jsonb,
           login_logo_svg = $13,
           login_logo_color = $14,
           login_logo_size = $15,
           legal_contact = $16,
           privacy_policy = $17,
           brand_motto = $18,
           nav_title = $19,
           nav_subtitle = $20,
           landing_cta_title = $21,
           landing_cta_body = $22,
           landing_cta_button_label = $23,
           landing_cta_button_url = $24,
           footer_text = $25,
           footer_links = $26::jsonb,
           social_links = $27::jsonb,
           form_configuration = $28::jsonb,
           background_style = $29::jsonb,
           feature_flags = $30::jsonb,
           updated_at = now()
       WHERE id = $31`,
      [
        normalizedPrimaryColor,
        normalizedPrimaryColorDark,
        normalizedAccentColor,
        numericTarget,
        normalizedDeadline,
        normalizedWelcome,
        normalizedSuccess,
        normalizedSubject,
        normalizedBody,
        normalizedMailTemplate,
        normalizedVersion,
        JSON.stringify(normalizedLog),
        normalizedLogo,
        normalizedLogoColor,
        normalizedLogoSize,
        normalizedLegal,
        normalizedPrivacy,
        normalizedBrandMotto,
        normalizedNavTitle,
        normalizedNavSubtitle,
        normalizedLandingTitle,
        normalizedLandingBody,
        normalizedLandingButtonLabel,
        normalizedLandingButtonUrl,
        normalizedFooterText,
        JSON.stringify(normalizedFooterLinks),
        JSON.stringify(normalizedSocialLinks),
        JSON.stringify(normalizedFormConfig),
        JSON.stringify(normalizedBackgroundStyle),
        JSON.stringify(normalizedFeatureFlags),
        current.id
      ]
    );

    invalidateSiteSettingsCache();
    const updated = await getSiteSettings({ fresh: true });
    res.json(updated);
  } catch (error) {
    console.error('Update site settings error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/stats/leaderboard', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT
         COALESCE(gv.id, u.id) AS user_id,
         COALESCE(gv.username, u.username, 'Unzugeordnet') AS username,
         COUNT(*)::int AS contributions,
         COALESCE(SUM(c.amount), 0)::numeric AS total_amount
       FROM contributions c
       LEFT JOIN users gv ON gv.id = c.gennervogt_id
       LEFT JOIN users u ON u.id = c.user_id
       GROUP BY COALESCE(gv.id, u.id), COALESCE(gv.username, u.username, 'Unzugeordnet')
       ORDER BY contributions DESC, total_amount DESC
       LIMIT 20`
    );

    const leaderboard = result.rows.map((row) => ({
      userId: row.user_id,
      username: row.username,
      contributions: Number(row.contributions) || 0,
      totalAmount: Number(row.total_amount) || 0
    }));

    res.json({
      generatedAt: new Date().toISOString(),
      entries: leaderboard
    });
  } catch (error) {
    console.error('Leaderboard generation failed:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/admin/update/check', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const branch = process.env.UPDATE_BRANCH || 'main';
    const repoDir = process.cwd();

    await execCommand('git', ['fetch', 'origin', branch], { cwd: repoDir });

    const aheadResult = await execCommand('git', ['rev-list', '--count', `HEAD..origin/${branch}`], { cwd: repoDir });
    const behindResult = await execCommand('git', ['rev-list', '--count', `origin/${branch}..HEAD`], { cwd: repoDir });
    const localCommitResult = await execCommand('git', ['rev-parse', 'HEAD'], { cwd: repoDir });
    const remoteCommitResult = await execCommand('git', ['rev-parse', `origin/${branch}`], { cwd: repoDir });

    const ahead = Number.parseInt(aheadResult.stdout.trim(), 10) || 0;
    const behind = Number.parseInt(behindResult.stdout.trim(), 10) || 0;

    res.json({
      branch,
      updateAvailable: ahead > 0,
      ahead,
      behind,
      localCommit: localCommitResult.stdout.trim(),
      remoteCommit: remoteCommitResult.stdout.trim(),
      instructions: 'sudo /gennerweb/scripts/full-update.sh',
      lastCheckedAt: new Date().toISOString()
    });
  } catch (error) {
    console.error('Update check failed:', error);
    res.status(500).json({ error: 'Update check failed', details: error.message });
  }
});

const computeHealthSnapshot = async () => {
  let dbStatus = 'OK';
  let dbLatencyMs = null;

  try {
    const start = process.hrtime.bigint();
    await pool.query('SELECT 1');
    const end = process.hrtime.bigint();
    dbLatencyMs = Number(end - start) / 1_000_000;
  } catch (error) {
    dbStatus = 'ERROR';
    console.error('Health check database probe failed:', error);
  }

  return {
    status: dbStatus === 'OK' ? 'OK' : 'DEGRADED',
    timestamp: new Date().toISOString(),
    uptimeSeconds: Math.floor(process.uptime()),
    database: {
      status: dbStatus,
      latencyMs: dbLatencyMs
    },
    cache: {
      status: cachedSiteSettings ? 'WARM' : 'COLD',
      ageMs: cachedSiteSettings ? Date.now() - cachedSiteSettingsFetchedAt : null
    }
  };
};

// Health Check (public)
app.get('/health', async (req, res) => {
  const snapshot = await computeHealthSnapshot();

  if (snapshot.database.status !== 'OK') {
    return res.status(503).json(snapshot);
  }

  return res.json(snapshot);
});

// Health Check (admin dashboard)
app.get('/api/admin/health', authenticateToken, requireAdmin, async (req, res) => {
  const snapshot = await computeHealthSnapshot();
  res.json(snapshot);
});

initializeDatabase()
  .then(() => {
    app.listen(port, () => {
      console.log(`Backend running on port ${port}`);
    });
  })
  .catch((error) => {
    console.error('Failed to initialize database:', error);
    process.exit(1);
  });
