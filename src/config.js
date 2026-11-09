import path from 'node:path';

const yes = (v) => /^(1|true|yes|ja)$/i.test(v ?? '');

export function loadConfig(env) {
  // Zeitzone für Anmeldeschluss und Datumsanzeige
  process.env.TZ = env.TZ || 'Europe/Vienna';

  const port = Number(env.PORT || 8787);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT muss eine Zahl zwischen 1 und 65535 sein.');

  const baseUrl = (env.BASE_URL || `http://localhost:${port}`).replace(/\/+$/, '');
  const parsed = new URL(baseUrl);
  if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('BASE_URL muss mit http:// oder https:// beginnen.');

  const adminPassword = env.ADMIN_PASSWORD || '';
  if (adminPassword && adminPassword.length < 10) throw new Error('ADMIN_PASSWORD muss mindestens 10 Zeichen lang sein.');

  return {
    port,
    host: env.HOST || '127.0.0.1',
    baseUrl,
    dataDir: path.resolve(env.DATA_DIR || 'data'),
    adminPassword,
    trustProxy: yes(env.TRUST_PROXY),
    smtp: {
      host: env.SMTP_HOST || '',
      port: env.SMTP_PORT ? Number(env.SMTP_PORT) : undefined,
      secure: env.SMTP_SECURE || '',
      user: env.SMTP_USER || '',
      pass: env.SMTP_PASS || '',
      from: env.MAIL_FROM || '',
    },
  };
}
