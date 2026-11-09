import http from 'node:http';
import path from 'node:path';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { createHash, createHmac, randomBytes, randomUUID, scrypt as scryptCb, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { gzipSync } from 'node:zlib';
import { Store } from './store.js';
import { createMailer, parseFrom } from './mailer.js';
import { drawPairs } from './draw.js';
import { RateLimit } from './ratelimit.js';
import * as views from './views.js';
import * as mails from './mails.js';

const scrypt = promisify(scryptCb);
const ROOT = path.join(import.meta.dirname, '..');
const MIN = 60_000;
const HOUR = 60 * MIN;
const MAX_PARTICIPANTS = 500;
const SESSION_HOURS = 8;

const TYPES = {
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.txt': 'text/plain; charset=utf-8',
};

const SECURITY_HEADERS = {
  'Content-Security-Policy': "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'",
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'same-origin',
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Resource-Policy': 'same-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
};

const FLASH = {
  saved: [true, 'Einstellungen gespeichert.'],
  siteOn: [true, 'Seiten-Passwort gesetzt. Wer schon drin war, muss das neue Passwort eingeben.'],
  siteOff: [true, 'Seiten-Passwort entfernt – die Seite ist jetzt für alle offen.'],
  removed: [true, 'Engele entfernt.'],
  drawn: [true, 'Ausgelost! Die Mails werden jetzt verschickt.'],
  drawnNoMail: [true, 'Ausgelost! Alle sehen ihr Los über ihren persönlichen Link.'],
  reset: [true, 'Ziehung zurückgesetzt – die Anmeldung ist wieder offen. Ein abgelaufener Anmeldeschluss wurde gelöscht.'],
  wiped: [true, 'Alle Engele und die Ziehung sind gelöscht.'],
  resend: [true, 'Fehlende Mails werden erneut verschickt.'],
  need3: [false, 'Für die Ziehung braucht es mindestens 3 Engele.'],
  sure: [false, 'Bitte bestätige zuerst das Häkchen.'],
  drawnAlready: [false, 'Die Ziehung ist schon gelaufen. Setz sie zuerst zurück.'],
  notDrawn: [false, 'Es wurde noch nicht ausgelost.'],
  noMail: [false, 'Es ist noch kein Mailversand eingerichtet – siehe Einrichtung.'],
  mailOn: [true, 'Mailversand gespeichert. Schick dir zur Sicherheit eine Testmail.'],
  mailOff: [true, 'Mail-Einstellungen gelöscht.'],
};

class UserError extends Error {
  constructor(message, extra = {}) {
    super(message);
    Object.assign(this, extra);
  }
}

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

// --- kleine Helfer ------------------------------------------------------------

const sha256 = (s) => createHash('sha256').update(s).digest();
const newToken = () => randomBytes(32).toString('base64url');
const hashToken = (t) => sha256(t).toString('hex');
const TOKEN_RE = /^[A-Za-z0-9_-]{43}$/;

function safeEqual(a, b) {
  return timingSafeEqual(sha256(String(a)), sha256(String(b)));
}

export function cleanName(v) {
  const name = String(v ?? '').normalize('NFC').replace(/[\p{Cc}\p{Cf}]/gu, '').replace(/\s+/g, ' ').trim();
  const len = [...name].length;
  return len >= 1 && len <= 40 ? name : null;
}

export function cleanEmail(v) {
  const email = String(v ?? '').trim().toLowerCase();
  if (email.length > 254 || /[\p{Cc}\p{Cf}]/u.test(email)) return null;
  return /^[^\s@<>()[\]\\,;:"]+@[^\s@<>()[\]\\,;:"]+\.[^\s@<>()[\]\\,;:".]{2,}$/u.test(email) ? email : null;
}

const clip = (v, max) => String(v ?? '').replace(/\r\n?/g, '\n').replace(/[^\P{Cc}\n]/gu, '').trim().slice(0, max);
const sameName = (a, b) => a.toLocaleLowerCase('de') === b.toLocaleLowerCase('de');

async function hashPassword(password) {
  const salt = randomBytes(16);
  const hash = await scrypt(password.normalize('NFC'), salt, 32, { N: 2 ** 15, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
  return { salt: salt.toString('hex'), hash: hash.toString('hex') };
}

async function verifyPassword(password, stored) {
  const hash = await scrypt(password.normalize('NFC'), Buffer.from(stored.salt, 'hex'), 32, { N: 2 ** 15, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
  return timingSafeEqual(hash, Buffer.from(stored.hash, 'hex'));
}

function loadAssets(dir) {
  const assets = new Map();
  const walk = (d, prefix) => {
    for (const name of readdirSync(d)) {
      const full = path.join(d, name);
      if (statSync(full).isDirectory()) { walk(full, `${prefix}${name}/`); continue; }
      const type = TYPES[path.extname(name)];
      if (!type) continue;
      const body = readFileSync(full);
      const gz = gzipSync(body, { level: 9 });
      assets.set(`${prefix}${name}`, {
        body,
        gz: gz.length < body.length * 0.9 ? gz : null,
        type,
        version: sha256(body).toString('hex').slice(0, 10),
      });
    }
  };
  walk(dir, '/');
  return assets;
}

function cookies(req) {
  const out = {};
  for (const part of (req.headers.cookie || '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = part.slice(i + 1).trim();
  }
  return out;
}

const acceptsGzip = (req) => /\bgzip\b/.test(req.headers['accept-encoding'] || '');

async function readForm(req, limit = 8 * 1024) {
  const type = (req.headers['content-type'] || '').split(';')[0].trim().toLowerCase();
  if (type !== 'application/x-www-form-urlencoded') throw new HttpError(415, 'Unbekanntes Formularformat.');
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) throw new HttpError(413, 'Das Formular ist zu groß.');
    chunks.push(chunk);
  }
  return new URLSearchParams(Buffer.concat(chunks).toString('utf8'));
}

// --- App ----------------------------------------------------------------------

export async function createApp(cfg) {
  const store = new Store(cfg.dataDir);

  // Mailversand: im Orga-Bereich eingerichtet (z. B. Proton Mail) hat Vorrang vor SMTP_* aus .env.
  const envMailer = createMailer(cfg.smtp, cfg.baseUrl); // fehlerhafte .env bricht den Start ab
  let mailer = envMailer;
  function refreshMailer() {
    const m = store.get().mail;
    if (!m) { mailer = envMailer; return; }
    try {
      mailer = createMailer(m, cfg.baseUrl);
    } catch (e) {
      console.error(`[mail] Gespeicherte Mail-Einstellungen sind ungültig: ${e.message}`);
      mailer = envMailer;
    }
  }
  refreshMailer();

  const assets = loadAssets(path.join(ROOT, 'public'));
  views.setAssetUrl((p) => (assets.has(p) ? `${p}?v=${assets.get(p).version}` : p));

  const https = cfg.baseUrl.startsWith('https:');
  const baseOrigin = new URL(cfg.baseUrl).origin;
  const sessions = new Map();
  const limits = {
    register: new RateLimit(40, 15 * MIN),
    login: new RateLimit(10, 15 * MIN),
    site: new RateLimit(20, 15 * MIN),
    link: new RateLimit(10, HOUR),
    linkPerEmail: new RateLimit(3, HOUR),
    ...cfg.limits,
  };
  const sweeper = setInterval(() => {
    Object.values(limits).forEach((l) => l.sweep());
    for (const [id, exp] of sessions) if (exp < Date.now()) sessions.delete(id);
  }, 10 * MIN);
  sweeper.unref();

  const pending = new Set();
  let mailJob = null;

  // Admin-Passwort: aus ADMIN_PASSWORD, sonst beim ersten Start erzeugen und einmal anzeigen.
  let adminHash;
  if (cfg.adminPassword) {
    adminHash = await hashPassword(cfg.adminPassword);
  } else if (store.get().admin) {
    adminHash = store.get().admin;
  } else {
    const password = randomBytes(12).toString('base64url');
    adminHash = await hashPassword(password);
    await store.update((d) => { d.admin = adminHash; });
    console.log(`\n  Neues Orga-Passwort (wird nur dieses eine Mal angezeigt): ${password}\n  Eigenes Passwort: ADMIN_PASSWORD in .env setzen.\n`);
  }

  // Geheimer Schlüssel für das Eintritts-Cookie des Seiten-Passworts
  if (!store.get().secret) await store.update((d) => { d.secret = randomBytes(32).toString('hex'); });

  const linkFor = (token) => `${cfg.baseUrl}/p/${token}`;
  const clientIp = (req) => (cfg.trustProxy
    ? (req.headers['x-forwarded-for'] || '').split(',').pop().trim() || req.socket.remoteAddress
    : req.socket.remoteAddress);

  function background(promise) {
    pending.add(promise);
    promise.catch((e) => console.error('[mail]', e.message)).finally(() => pending.delete(promise));
  }

  function findByToken(token) {
    if (!TOKEN_RE.test(token)) return null;
    const h = hashToken(token);
    return store.get().participants.find((p) => p.tokenHash === h) ?? null;
  }

  function publicInfo(d = store.get()) {
    const { eventDate, budget, info, deadline } = d.settings;
    return { eventDate, budget, info, deadline };
  }

  const deadlinePassed = (d = store.get()) => Boolean(d.settings.deadline) && Date.now() >= Date.parse(d.settings.deadline);
  const registrationOpen = (d = store.get()) => d.settings.open && !d.drawnAt && !deadlinePassed(d);

  function publicState() {
    const d = store.get();
    return {
      count: d.participants.length,
      info: publicInfo(d),
      drawn: Boolean(d.drawnAt),
      open: registrationOpen(d),
      deadlinePassed: deadlinePassed(d),
      mail: Boolean(mailer),
    };
  }

  // --- Ziehung ---

  async function performDraw() {
    await store.update((d) => {
      if (d.drawnAt) throw new UserError('drawnAlready');
      if (d.participants.length < 3) throw new UserError('need3');
      const pairs = drawPairs(d.participants.map((p) => p.id));
      for (const p of d.participants) Object.assign(p, { giftsTo: pairs.get(p.id), mailedAt: null, mailError: null });
      d.drawnAt = new Date().toISOString();
      d.settings.open = false;
    });
    startDrawMails();
  }

  // Nach dem Anmeldeschluss wird automatisch gelost (auch wenn der Server zum Termin aus war).
  let warnedTooFew = false;
  async function checkDeadline() {
    const d = store.get();
    if (d.drawnAt || !deadlinePassed(d)) { warnedTooFew = false; return false; }
    if (d.participants.length < 3) {
      if (!warnedTooFew) console.warn('Anmeldeschluss vorbei, aber weniger als 3 Engele – keine automatische Ziehung.');
      warnedTooFew = true;
      return false;
    }
    try {
      await performDraw();
    } catch (e) {
      if (e instanceof UserError) return false;
      throw e;
    }
    console.log(`Anmeldeschluss erreicht – automatisch ausgelost (${d.participants.length} Engele).`);
    return true;
  }

  // --- Seiten-Passwort ---
  // Wer es einmal eingegeben hat, bekommt ein Cookie. Es gilt nur, solange das Passwort gleich bleibt.

  function siteKey() {
    const d = store.get();
    const sp = d.settings.sitePassword;
    return sp ? createHmac('sha256', d.secret).update(`site:${sp.salt}:${sp.hash}`).digest('base64url') : null;
  }

  function hasSiteAccess(req) {
    const key = siteKey();
    return !key || safeEqual(cookies(req).ep_site ?? '', key);
  }

  const siteCookie = (value, maxAge) =>
    `ep_site=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${https ? '; Secure' : ''}`;

  async function enter(req, res, f) {
    const sp = store.get().settings.sitePassword;
    if (!sp) return redirect(res, '/');
    if (!limits.site.take(clientIp(req))) {
      return sendPage(req, res, 429, views.gate({ error: 'Zu viele Versuche. Warte eine Viertelstunde.' }));
    }
    if (!(await verifyPassword((f.get('password') || '').trim(), sp))) {
      return sendPage(req, res, 401, views.gate({ error: 'Das Passwort stimmt nicht.' }));
    }
    return redirect(res, '/#anmelden', { 'Set-Cookie': siteCookie(siteKey(), 60 * 24 * 3600) });
  }

  // --- Antworten ---

  function sendPage(req, res, status, body, { secret = false } = {}) {
    let buf = Buffer.from(String(body));
    const headers = { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' };
    if (secret) headers['X-Robots-Tag'] = 'noindex, nofollow';
    // Seiten mit geheimen Links werden nicht komprimiert (BREACH).
    if (!secret && buf.length > 1024 && acceptsGzip(req)) {
      buf = gzipSync(buf);
      headers['Content-Encoding'] = 'gzip';
      headers.Vary = 'Accept-Encoding';
    }
    headers['Content-Length'] = buf.length;
    res.writeHead(status, headers);
    res.end(req.method === 'HEAD' ? undefined : buf);
  }

  function redirect(res, location, extra = {}) {
    res.writeHead(303, { Location: location, 'Cache-Control': 'no-store', 'Content-Length': 0, ...extra });
    res.end();
  }

  function serveAsset(req, res, asset, versioned) {
    const gz = asset.gz && acceptsGzip(req);
    const body = gz ? asset.gz : asset.body;
    const headers = {
      'Content-Type': asset.type,
      'Content-Length': body.length,
      'Cache-Control': versioned ? 'public, max-age=31536000, immutable' : 'public, max-age=3600',
    };
    if (asset.gz) headers.Vary = 'Accept-Encoding';
    if (gz) headers['Content-Encoding'] = 'gzip';
    res.writeHead(200, headers);
    res.end(req.method === 'HEAD' ? undefined : body);
  }

  // Formulare dürfen nur von dieser Seite selbst abgeschickt werden.
  function sameOrigin(req) {
    const site = req.headers['sec-fetch-site'];
    if (site && site !== 'same-origin' && site !== 'none') return false;
    const origin = req.headers.origin;
    if (!origin) return true;
    if (origin === baseOrigin) return true;
    try { return new URL(origin).host === req.headers.host; } catch { return false; }
  }

  // --- Mailversand nach der Ziehung (im Hintergrund) ---

  function startDrawMails() {
    if (!mailer || mailJob) return;
    mailJob = (async () => {
      for (let again = true; again;) {
        again = false;
        const drawnAt = store.get().drawnAt;
        if (!drawnAt) return;
        const todo = store.get().participants.filter((p) => p.giftsTo && !p.mailedAt).map((p) => p.id);
        for (const id of todo) {
          const d = store.get();
          if (d.drawnAt !== drawnAt) { again = true; break; }
          const me = d.participants.find((p) => p.id === id);
          const receiver = me && d.participants.find((p) => p.id === me.giftsTo);
          if (!receiver) continue;
          let error = null;
          try {
            await mailer.send(mails.drawResult(me, receiver, publicInfo(d)));
          } catch (e) {
            error = String(e.message).slice(0, 300);
            console.error(`[mail] Los-Mail an Engele ${id} fehlgeschlagen: ${error}`);
          }
          await store.update((draft) => {
            const p = draft.participants.find((x) => x.id === id);
            if (!p || draft.drawnAt !== drawnAt) return;
            p.mailedAt = error ? null : new Date().toISOString();
            p.mailError = error;
          });
        }
      }
    })().finally(() => { mailJob = null; });
    background(mailJob);
  }

  // --- Seiten ---

  async function register(req, res, f) {
    const values = { name: f.get('name') ?? '', email: f.get('email') ?? '' };
    const fail = (status, error, extra = {}) => sendPage(req, res, status, views.home(publicState(), { values, error, ...extra }));
    if (f.get('website')) return redirect(res, '/'); // Honigtopf für Bots
    if (!limits.register.take(clientIp(req))) return fail(429, 'Zu viele Anmeldungen von hier – probier es in einer Viertelstunde nochmal.');
    const name = cleanName(values.name);
    const email = cleanEmail(values.email);
    if (!name) return fail(422, 'Bitte gib einen Namen ein (höchstens 40 Zeichen).');
    if (!email) return fail(422, 'Diese E-Mail-Adresse sieht nicht richtig aus.');

    const token = newToken();
    let me;
    try {
      me = await store.update((d) => {
        if (!registrationOpen(d)) throw new UserError('Die Anmeldung ist leider geschlossen.');
        if (d.participants.some((p) => p.email === email)) throw new UserError('Diese E-Mail-Adresse ist schon angemeldet.', { lostLink: true });
        if (d.participants.some((p) => sameName(p.name, name))) {
          throw new UserError('Diesen Namen gibt es schon – ergänz z. B. den Nachnamen, damit man euch auseinanderhalten kann.');
        }
        if (d.participants.length >= MAX_PARTICIPANTS) throw new UserError('Es sind schon zu viele Engele angemeldet.');
        const p = {
          id: randomUUID(), name, email, tokenHash: hashToken(token),
          createdAt: new Date().toISOString(), giftsTo: null, mailedAt: null, mailError: null,
        };
        d.participants.push(p);
        return p;
      });
    } catch (e) {
      if (e instanceof UserError) return fail(422, e.message, { lostLink: e.lostLink });
      throw e;
    }
    if (mailer) background(mailer.send(mails.welcome(me, linkFor(token), publicInfo())));
    return redirect(res, `/p/${token}?neu`);
  }

  function personalPage(req, res, token, fresh) {
    const me = findByToken(token);
    if (!me) return sendPage(req, res, 404, views.unknownLink({ mail: Boolean(mailer) }), { secret: true });
    const d = store.get();
    const receiver = me.giftsTo ? d.participants.find((p) => p.id === me.giftsTo) : null;
    return sendPage(req, res, 200, views.personal({
      me, receiver, token, link: linkFor(token), fresh, mail: Boolean(mailer), info: publicInfo(d), drawn: Boolean(d.drawnAt),
    }), { secret: true });
  }

  async function leave(req, res, f) {
    const me = findByToken(f.get('token') || '');
    if (!me) return sendPage(req, res, 404, views.unknownLink({ mail: Boolean(mailer) }), { secret: true });
    try {
      await store.update((d) => {
        if (d.drawnAt) throw new UserError('Die Ziehung ist schon gelaufen – abmelden geht jetzt nur noch über die Orga.');
        d.participants = d.participants.filter((p) => p.id !== me.id);
      });
    } catch (e) {
      if (e instanceof UserError) return sendPage(req, res, 409, views.message({ title: 'Geht nicht mehr', text: e.message }), { secret: true });
      throw e;
    }
    return sendPage(req, res, 200, views.message({ title: 'Abgemeldet', text: 'Schade! Dein Name und deine E-Mail-Adresse sind gelöscht.' }));
  }

  async function lostLink(req, res, f) {
    const page = (status, opts) => sendPage(req, res, status, views.lostLink({ mail: Boolean(mailer), ...opts }), { secret: true });
    if (!mailer) return page(200, {});
    if (!limits.link.take(clientIp(req))) return page(429, { error: 'Zu viele Versuche – probier es später nochmal.' });
    const email = cleanEmail(f.get('email'));
    if (!email) return page(422, { error: 'Diese E-Mail-Adresse sieht nicht richtig aus.', value: f.get('email') ?? '' });
    if (limits.linkPerEmail.take(email) && store.get().participants.some((p) => p.email === email)) {
      const token = newToken();
      const me = await store.update((d) => {
        const p = d.participants.find((x) => x.email === email);
        if (p) p.tokenHash = hashToken(token);
        return p ?? null;
      });
      if (me) background(mailer.send(mails.newLink(me, linkFor(token))));
    }
    return page(200, { sent: true });
  }

  // --- Orga-Bereich ---

  const sessionCookie = (value, maxAge) =>
    `ep_admin=${value}; Path=/admin; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${https ? '; Secure' : ''}`;

  function isAdmin(req) {
    const sid = cookies(req).ep_admin;
    const exp = sid && sessions.get(sid);
    return Boolean(exp && exp > Date.now());
  }

  function adminPage(req, res, flash, status = 200) {
    if (!isAdmin(req)) return sendPage(req, res, 200, views.adminLogin({}), { secret: true });
    const d = store.get();
    return sendPage(req, res, status, views.adminDashboard({
      d, flash, mailer: mailer?.describe ?? null, mailing: Boolean(mailJob), baseUrl: cfg.baseUrl,
    }), { secret: true });
  }

  function setupPage(req, res, flash, status = 200) {
    if (!isAdmin(req)) return sendPage(req, res, 200, views.adminLogin({}), { secret: true });
    const d = store.get();
    const m = d.mail;
    const from = m ? parseFrom(m.from) : null;
    return sendPage(req, res, status, views.adminSetup({
      d,
      flash,
      tz: process.env.TZ || 'Server-Zeitzone',
      mail: {
        active: mailer?.describe ?? null,
        fromOrga: Boolean(m),
        provider: m?.provider ?? 'proton',
        address: from?.address ?? '',
        fromName: from?.name || 'Pengele Engele',
        user: m && m.user !== from?.address ? m.user : '',
        host: m?.provider === 'custom' ? m.host : '',
        port: m?.provider === 'custom' ? m.port : '',
        secure: m?.secure ?? 'starttls',
      },
    }), { secret: true });
  }

  async function login(req, res, f) {
    if (!limits.login.take(clientIp(req))) {
      return sendPage(req, res, 429, views.adminLogin({ error: 'Zu viele Versuche. Warte eine Viertelstunde.' }), { secret: true });
    }
    if (!(await verifyPassword(f.get('password') || '', adminHash))) {
      return sendPage(req, res, 401, views.adminLogin({ error: 'Falsches Passwort.' }), { secret: true });
    }
    const sid = randomBytes(32).toString('base64url');
    sessions.set(sid, Date.now() + SESSION_HOURS * HOUR);
    return redirect(res, '/admin', { 'Set-Cookie': sessionCookie(sid, SESSION_HOURS * 3600) });
  }

  const adminActions = {
    async logout(req, res) {
      sessions.delete(cookies(req).ep_admin);
      return redirect(res, '/admin', { 'Set-Cookie': sessionCookie('', 0) });
    },

    async settings(req, res, f) {
      // Anmeldeschluss kommt als Ortszeit "2026-12-01T18:00" (Zeitzone: TZ, Standard Europe/Vienna)
      let deadline = null;
      if (f.has('deadline')) {
        const raw = String(f.get('deadline')).trim();
        if (raw) {
          const at = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(raw) ? new Date(raw) : new Date(NaN);
          if (Number.isNaN(at.getTime())) return setupPage(req, res, [false, 'Der Zeitpunkt der Ziehung ist kein gültiges Datum. Nichts gespeichert.'], 422);
          if (at.getTime() <= Date.now()) return setupPage(req, res, [false, 'Der Zeitpunkt der Ziehung muss in der Zukunft liegen. Nichts gespeichert.'], 422);
          deadline = at.toISOString();
        } else {
          deadline = '';
        }
      }
      // Jedes Formular der Einrichtung schickt nur seine eigenen Felder – nur die werden geändert.
      await store.update((d) => {
        if (f.has('eventDate')) d.settings.eventDate = clip(f.get('eventDate'), 60).replace(/\n/g, ' ');
        if (f.has('budget')) d.settings.budget = clip(f.get('budget'), 30).replace(/\n/g, ' ');
        if (f.has('info')) d.settings.info = clip(f.get('info'), 600);
        if (!d.drawnAt) {
          if (f.has('openField')) d.settings.open = f.get('open') === 'on';
          if (deadline !== null) d.settings.deadline = deadline;
        }
      });
      return redirect(res, `/admin/setup?m=saved#${f.has('deadline') ? 'ziehung' : 'bescherung'}`);
    },

    async sitepassword(req, res, f) {
      if (f.get('remove') === '1') {
        await store.update((d) => { d.settings.sitePassword = null; });
        return redirect(res, '/admin/setup?m=siteOff#passwort');
      }
      const password = String(f.get('sitePassword') ?? '').trim();
      const len = [...password].length;
      if (len < 4 || len > 100) return setupPage(req, res, [false, 'Das Seiten-Passwort muss 4 bis 100 Zeichen lang sein.'], 422);
      const hashed = await hashPassword(password);
      await store.update((d) => { d.settings.sitePassword = hashed; });
      return redirect(res, '/admin/setup?m=siteOn#passwort');
    },

    // Mailversand, z. B. Proton Mail mit SMTP-Token. Der Token wird nie wieder angezeigt.
    async mail(req, res, f) {
      if (f.get('remove') === '1') {
        await store.update((d) => { d.mail = null; });
        refreshMailer();
        return redirect(res, '/admin/setup?m=mailOff#mail');
      }
      const fail = (text) => setupPage(req, res, [false, `${text} Nichts gespeichert.`], 422);
      const current = store.get().mail;
      const provider = f.get('provider') === 'custom' ? 'custom' : 'proton';
      const address = cleanEmail(f.get('address'));
      if (!address) return fail('Bitte gib die Absender-Adresse ein.');
      const fromName = clip(f.get('fromName'), 60).replace(/[\n"<>\\]/g, '') || 'Pengele Engele';
      const user = clip(f.get('user'), 254).replace(/\s/g, '') || address;
      const token = String(f.get('token') ?? '').trim() || current?.pass || '';
      if (!token) return fail('Bitte gib den SMTP-Token ein.');
      let host = 'smtp.protonmail.ch';
      let port = 587;
      let secure = 'starttls';
      if (provider === 'custom') {
        host = String(f.get('host') ?? '').trim().toLowerCase();
        if (!/^([a-z0-9.-]{1,253}|[a-f0-9:]{2,39})$/.test(host)) return fail('Der Name des Mailservers sieht nicht richtig aus.');
        secure = ['tls', 'starttls', 'none'].includes(f.get('secure')) ? f.get('secure') : 'starttls';
        port = Number(f.get('port')) || { tls: 465, starttls: 587, none: 25 }[secure];
        if (!Number.isInteger(port) || port < 1 || port > 65535) return fail('Der Port muss eine Zahl von 1 bis 65535 sein.');
      }
      const conf = { provider, host, port, secure, user, pass: token, from: `${fromName} <${address}>` };
      try {
        createMailer(conf, cfg.baseUrl);
      } catch (e) {
        return fail(e.message);
      }
      await store.update((d) => { d.mail = conf; });
      refreshMailer();
      return redirect(res, '/admin/setup?m=mailOn#mail');
    },

    async remove(req, res, f) {
      const id = f.get('id');
      try {
        await store.update((d) => {
          if (d.drawnAt) throw new UserError('drawnAlready');
          d.participants = d.participants.filter((p) => p.id !== id);
        });
      } catch (e) {
        if (e instanceof UserError) return redirect(res, `/admin?m=${e.message}`);
        throw e;
      }
      return redirect(res, '/admin?m=removed');
    },

    async draw(req, res, f) {
      if (f.get('sure') !== 'on') return redirect(res, '/admin?m=sure');
      try {
        await performDraw();
      } catch (e) {
        if (e instanceof UserError) return redirect(res, `/admin?m=${e.message}`);
        throw e;
      }
      return redirect(res, `/admin?m=${mailer ? 'drawn' : 'drawnNoMail'}`);
    },

    async resend(req, res) {
      if (!mailer) return redirect(res, '/admin?m=noMail');
      if (!store.get().drawnAt) return redirect(res, '/admin?m=notDrawn');
      startDrawMails();
      return redirect(res, '/admin?m=resend');
    },

    async reset(req, res, f) {
      if (f.get('sure') !== 'on') return redirect(res, '/admin?m=sure');
      await store.update((d) => {
        for (const p of d.participants) Object.assign(p, { giftsTo: null, mailedAt: null, mailError: null });
        d.drawnAt = null;
        d.settings.open = true;
        // sonst würde sofort wieder automatisch gelost
        if (deadlinePassed(d)) d.settings.deadline = '';
      });
      return redirect(res, '/admin?m=reset');
    },

    async wipe(req, res, f) {
      if (f.get('sure') !== 'on') return redirect(res, '/admin?m=sure');
      await store.update((d) => {
        d.participants = [];
        d.drawnAt = null;
        d.settings.open = true;
      });
      return redirect(res, '/admin?m=wiped');
    },

    async newlink(req, res, f) {
      const token = newToken();
      const me = await store.update((d) => {
        const p = d.participants.find((x) => x.id === f.get('id'));
        if (p) p.tokenHash = hashToken(token);
        return p ?? null;
      });
      if (!me) return redirect(res, '/admin');
      return sendPage(req, res, 200, views.adminNewLink({ name: me.name, link: linkFor(token) }), { secret: true });
    },

    async testmail(req, res, f) {
      if (!mailer) return redirect(res, '/admin/setup?m=noMail#mail');
      const to = cleanEmail(f.get('to'));
      if (!to) return setupPage(req, res, [false, 'Diese E-Mail-Adresse sieht nicht richtig aus.'], 422);
      try {
        await mailer.send(mails.test(to, cfg.baseUrl));
        return setupPage(req, res, [true, `Testmail an ${to} verschickt – schau in dein Postfach.`]);
      } catch (e) {
        return setupPage(req, res, [false, `Testmail fehlgeschlagen: ${e.message}`], 502);
      }
    },
  };

  // --- Router ---

  async function handle(req, res) {
    for (const [k, v] of Object.entries(SECURITY_HEADERS)) res.setHeader(k, v);
    if (https) res.setHeader('Strict-Transport-Security', 'max-age=31536000');

    let url;
    try { url = new URL(`http://x${req.url}`); } catch { throw new HttpError(400, 'Ungültige Adresse.'); }
    const p = url.pathname;

    if (req.method === 'GET' || req.method === 'HEAD') {
      const asset = assets.get(p);
      if (asset) return serveAsset(req, res, asset, url.searchParams.has('v'));
      if ((p === '/' || p === '/link') && !hasSiteAccess(req)) return sendPage(req, res, 200, views.gate({}));
      if (p === '/') return sendPage(req, res, 200, views.home(publicState()));
      if (p === '/anmelden') return redirect(res, '/#anmelden');
      if (p === '/link') return sendPage(req, res, 200, views.lostLink({ mail: Boolean(mailer) }), { secret: true });
      if (p === '/admin' || p === '/admin/setup') {
        const key = url.searchParams.get('m');
        const flash = key && Object.hasOwn(FLASH, key) ? FLASH[key] : null;
        return p === '/admin' ? adminPage(req, res, flash) : setupPage(req, res, flash);
      }
      const m = /^\/p\/([^/]+)$/.exec(p);
      if (m) return personalPage(req, res, m[1], url.searchParams.has('neu'));
      return sendPage(req, res, 404, views.notFound());
    }

    if (req.method === 'POST') {
      if (!sameOrigin(req)) throw new HttpError(403, 'Diese Anfrage kam nicht von dieser Seite.');
      const f = await readForm(req);
      if (p === '/eintritt') return enter(req, res, f);
      if ((p === '/anmelden' || p === '/link') && !hasSiteAccess(req)) return redirect(res, '/');
      if (p === '/anmelden') return register(req, res, f);
      if (p === '/abmelden') return leave(req, res, f);
      if (p === '/link') return lostLink(req, res, f);
      if (p === '/admin/login') return login(req, res, f);
      const action = /^\/admin\/([a-z]+)$/.exec(p)?.[1];
      if (action && Object.hasOwn(adminActions, action)) {
        if (!isAdmin(req)) return redirect(res, '/admin');
        return adminActions[action](req, res, f);
      }
      return sendPage(req, res, 404, views.notFound());
    }

    res.writeHead(405, { Allow: 'GET, HEAD, POST', 'Content-Length': 0 });
    res.end();
  }

  const server = http.createServer((req, res) => {
    handle(req, res).catch((err) => {
      const status = err instanceof HttpError ? err.status : 500;
      if (status === 500) console.error(err);
      if (res.headersSent) return res.destroy();
      res.setHeader('Connection', 'close');
      sendPage(req, res, status, views.message({
        title: status === 500 ? 'Hoppla' : 'Geht nicht',
        text: status === 500 ? 'Da ist etwas schiefgegangen. Bitte probier es nochmal.' : err.message,
      }));
    });
  });
  server.headersTimeout = 15_000;
  server.requestTimeout = 20_000;
  server.keepAliveTimeout = 5_000;

  const runDeadlineCheck = () => checkDeadline().catch((e) => console.error('[ziehung]', e));
  const deadlineTimer = setInterval(runDeadlineCheck, 30_000);
  deadlineTimer.unref();
  runDeadlineCheck();

  return {
    server,
    store,
    get mailer() { return mailer; },
    // wartet, bis alle Mails im Hintergrund verschickt sind (für Tests)
    checkDeadline,
    async idle() {
      while (pending.size) await Promise.allSettled([...pending]);
    },
    async close() {
      clearInterval(sweeper);
      clearInterval(deadlineTimer);
      const closed = new Promise((resolve) => server.close(resolve));
      server.closeIdleConnections();
      await closed;
    },
  };
}
