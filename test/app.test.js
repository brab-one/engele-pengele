import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { createApp, cleanEmail, cleanName } from '../src/app.js';
import { drawPairs } from '../src/draw.js';
import { html } from '../src/html.js';

const PASSWORD = 'test-passwort-123';

// --- Hilfen -----------------------------------------------------------------

function fakeSmtp() {
  const mails = [];
  const server = net.createServer((sock) => {
    sock.write('220 fake ESMTP\r\n');
    let buf = '';
    let inData = false;
    let msg = '';
    let rcpt = '';
    sock.on('data', (chunk) => {
      buf += chunk;
      let i;
      while ((i = buf.indexOf('\r\n')) >= 0) {
        const line = buf.slice(0, i);
        buf = buf.slice(i + 2);
        if (inData) {
          if (line === '.') {
            inData = false;
            const [head, body] = msg.split('\r\n\r\n');
            mails.push({ to: rcpt, head, text: Buffer.from(body.replace(/\r\n/g, ''), 'base64').toString('utf8') });
            msg = '';
            sock.write('250 ok\r\n');
          } else msg += `${line}\r\n`;
          continue;
        }
        const cmd = line.slice(0, 4).toUpperCase();
        if (cmd === 'EHLO') sock.write('250-fake\r\n250 AUTH PLAIN LOGIN\r\n');
        else if (cmd === 'AUTH') sock.write('235 ok\r\n');
        else if (cmd === 'RCPT') { rcpt = /<(.*)>/.exec(line)[1]; sock.write('250 ok\r\n'); }
        else if (cmd === 'DATA') { inData = true; sock.write('354 go\r\n'); }
        else if (cmd === 'QUIT') sock.end('221 bye\r\n');
        else sock.write('250 ok\r\n');
      }
    });
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve({ server, mails, port: server.address().port })));
}

function request(port, method, url, { form, headers = {}, cookie } = {}) {
  return new Promise((resolve, reject) => {
    const body = form ? new URLSearchParams(form).toString() : null;
    const h = { ...headers };
    if (body !== null) h['Content-Type'] = 'application/x-www-form-urlencoded';
    if (cookie) h.Cookie = cookie;
    const req = http.request({ host: '127.0.0.1', port, method, path: url, headers: h }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks).toString('utf8') }));
    });
    req.on('error', reject);
    req.end(body);
  });
}

async function startApp(extra = {}) {
  const smtp = await fakeSmtp();
  const dataDir = mkdtempSync(path.join(os.tmpdir(), 'engele-test-'));
  const app = await createApp({
    port: 0,
    host: '127.0.0.1',
    baseUrl: 'http://localhost:8787',
    dataDir,
    adminPassword: PASSWORD,
    trustProxy: false,
    smtp: { host: '127.0.0.1', port: smtp.port, secure: 'none', user: 'u', pass: 'p', from: 'Pengele Engele <wichteln@example.at>' },
    ...extra,
  });
  await new Promise((r) => app.server.listen(0, '127.0.0.1', r));
  return { app, smtp, dataDir, port: app.server.address().port };
}

const register = (port, name, email, headers) => request(port, 'POST', '/anmelden', { form: { name, email }, headers });
const tokenFrom = (res) => /^\/p\/([A-Za-z0-9_-]{43})\?neu$/.exec(res.headers.location)?.[1];

async function login(port) {
  const res = await request(port, 'POST', '/admin/login', { form: { password: PASSWORD } });
  assert.equal(res.status, 303);
  return res.headers['set-cookie'][0].split(';')[0];
}

// --- Einzelteile --------------------------------------------------------------

test('Ziehung: niemand zieht sich selbst, alle sind in einem einzigen Kreis', () => {
  for (let n = 3; n <= 15; n++) {
    for (let run = 0; run < 100; run++) {
      const ids = Array.from({ length: n }, (_, i) => `p${i}`);
      const pairs = drawPairs(ids);
      assert.deepEqual([...pairs.values()].sort(), [...ids].sort());
      let cur = ids[0];
      const seen = new Set();
      do {
        assert.notEqual(pairs.get(cur), cur);
        seen.add(cur);
        cur = pairs.get(cur);
      } while (cur !== ids[0]);
      assert.equal(seen.size, n);
    }
  }
});

test('HTML wird immer escaped', () => {
  assert.equal(String(html`<p>${'<script>"&\''}</p>`), '<p>&lt;script&gt;&quot;&amp;&#39;</p>');
  assert.equal(String(html`<b>${html`<i>${'<x>'}</i>`}</b>`), '<b><i>&lt;x&gt;</i></b>');
});

test('Namen und E-Mail-Adressen werden geprüft', () => {
  assert.equal(cleanName('  Rudi   der   Rentier '), 'Rudi der Rentier');
  assert.equal(cleanName('a‮b​c'), 'abc');
  assert.equal(cleanName(''), null);
  assert.equal(cleanName('x'.repeat(41)), null);
  assert.equal(cleanEmail(' Max@Example.AT '), 'max@example.at');
  assert.equal(cleanEmail('max@example'), null);
  assert.equal(cleanEmail('max@example.at\r\nBcc: x@y.z'), null);
  assert.equal(cleanEmail('a b@example.at'), null);
});

// --- Gesamter Ablauf ------------------------------------------------------------

let t;
before(async () => { t = await startApp(); });
after(async () => {
  await t.app.close();
  t.smtp.server.close();
  rmSync(t.dataDir, { recursive: true, force: true });
});

test('Startseite mit Sicherheits-Headern', async () => {
  const res = await request(t.port, 'GET', '/');
  assert.equal(res.status, 200);
  assert.match(res.headers['content-security-policy'], /default-src 'none'/);
  assert.equal(res.headers['x-frame-options'], 'DENY');
  assert.equal(res.headers['x-content-type-options'], 'nosniff');
  assert.match(res.body, /name="email"/);
  const css = await request(t.port, 'GET', '/style.css?v=1');
  assert.equal(css.status, 200);
  assert.match(css.headers['cache-control'], /immutable/);
});

test('Keine Dateien außerhalb von public/', async () => {
  for (const p of ['/../package.json', '/%2e%2e/package.json', '/src/app.js', '/..%2fserver.js', '//etc/passwd']) {
    const res = await request(t.port, 'GET', p);
    assert.notEqual(res.status, 200, p);
    assert.doesNotMatch(res.body, /"engele-pengele"|createApp/, p);
  }
});

test('Formulare von fremden Seiten werden abgewiesen', async () => {
  const a = await register(t.port, 'Fremd', 'fremd@example.at', { 'Sec-Fetch-Site': 'cross-site' });
  assert.equal(a.status, 403);
  const b = await register(t.port, 'Fremd', 'fremd@example.at', { Origin: 'https://evil.example' });
  assert.equal(b.status, 403);
  const big = await request(t.port, 'POST', '/anmelden', { form: { name: 'x'.repeat(20000), email: 'a@b.at' } });
  assert.equal(big.status, 413);
  assert.equal(t.app.store.get().participants.length, 0);
});

test('Anmelden, Ziehung, Lose per Mail und auf der persönlichen Seite', async () => {
  const people = [
    ['Anna', 'anna@example.at'],
    ['Bernhard', 'bernhard@example.at'],
    ['Cilli', 'cilli@example.at'],
    ['<script>alert(1)</script>', 'xss@example.at'],
  ];
  const tokens = {};
  for (const [name, email] of people) {
    const res = await register(t.port, name, email, { Origin: 'http://localhost:8787' });
    assert.equal(res.status, 303, name);
    tokens[email] = tokenFrom(res);
    assert.ok(tokens[email], name);
  }

  // Doppelte E-Mail / doppelter Name
  const dupMail = await register(t.port, 'Anna 2', 'ANNA@example.at');
  assert.equal(dupMail.status, 422);
  assert.match(dupMail.body, /schon angemeldet/);
  const dupName = await register(t.port, 'anna', 'anna2@example.at');
  assert.equal(dupName.status, 422);
  const badMail = await register(t.port, 'Dora', 'kein-mail');
  assert.equal(badMail.status, 422);

  // Honigtopf: wird still verworfen
  const bot = await request(t.port, 'POST', '/anmelden', { form: { name: 'Bot', email: 'bot@example.at', website: 'spam' } });
  assert.equal(bot.status, 303);
  assert.equal(t.app.store.get().participants.length, 4);

  // Daten: Datei nur für den Server lesbar, Token nur als Hash
  const file = path.join(t.dataDir, 'engele.json');
  assert.equal(statSync(file).mode & 0o077, 0);
  const saved = readFileSync(file, 'utf8');
  for (const token of Object.values(tokens)) assert.ok(!saved.includes(token));

  // Willkommens-Mails mit persönlichem Link
  await t.app.idle();
  assert.equal(t.smtp.mails.length, 4);
  const annaWelcome = t.smtp.mails.find((m) => m.to === 'anna@example.at');
  assert.ok(annaWelcome.text.includes(`http://localhost:8787/p/${tokens['anna@example.at']}`));
  assert.match(annaWelcome.head, /Subject: =\?UTF-8\?B\?/);

  // Persönliche Seite vor der Ziehung; Name ist escaped
  const xssPage = await request(t.port, 'GET', `/p/${tokens['xss@example.at']}?neu`);
  assert.equal(xssPage.status, 200);
  assert.ok(!xssPage.body.includes('<script>alert'));
  assert.ok(xssPage.body.includes('&lt;script&gt;alert(1)&lt;/script&gt;'));
  assert.match(xssPage.body, /Ziehung war noch nicht/);
  assert.equal(xssPage.headers['x-robots-tag'], 'noindex, nofollow');
  assert.equal((await request(t.port, 'GET', '/p/falschertokenfalschertokenfalschertokenxyz')).status, 404);

  // Orga: ohne Login keine Aktion
  const noAuth = await request(t.port, 'POST', '/admin/draw', { form: { sure: 'on' } });
  assert.equal(noAuth.status, 303);
  assert.equal(t.app.store.get().drawnAt, null);
  const wrong = await request(t.port, 'POST', '/admin/login', { form: { password: 'falsch' } });
  assert.equal(wrong.status, 401);

  const cookie = await login(t.port);
  assert.match((await request(t.port, 'GET', '/admin', { cookie })).body, /Jetzt auslosen/);

  const notSure = await request(t.port, 'POST', '/admin/draw', { form: {}, cookie });
  assert.equal(notSure.headers.location, '/admin?m=sure');
  const draw = await request(t.port, 'POST', '/admin/draw', { form: { sure: 'on' }, cookie });
  assert.equal(draw.headers.location, '/admin?m=drawn');

  // Los-Mails: jede Person genau eine, niemand sich selbst
  await t.app.idle();
  const drawMails = t.smtp.mails.slice(4);
  assert.equal(drawMails.length, 4);
  const names = Object.fromEntries(people.map(([n, e]) => [e, n]));
  for (const mail of drawMails) {
    const receiver = /★ (.+) ★/.exec(mail.text)[1];
    assert.notEqual(receiver, names[mail.to]);
    // Die persönliche Seite zeigt dieselbe Person
    const page = await request(t.port, 'GET', `/p/${tokens[mail.to]}`);
    const shown = /<p class="receiver">(.*?)<\/p>/.exec(page.body)[1];
    assert.equal(shown.replaceAll('&lt;', '<').replaceAll('&gt;', '>'), receiver);
  }
  assert.equal(new Set(drawMails.map((m) => /★ (.+) ★/.exec(m.text)[1])).size, 4);
  assert.ok(t.app.store.get().participants.every((p) => p.mailedAt));

  // Nach der Ziehung: keine Anmeldung, kein Abmelden
  assert.equal((await register(t.port, 'Spät', 'spaet@example.at')).status, 422);
  const leave = await request(t.port, 'POST', '/abmelden', { form: { token: tokens['anna@example.at'] } });
  assert.equal(leave.status, 409);

  // Zurücksetzen, dann abmelden
  await request(t.port, 'POST', '/admin/reset', { form: { sure: 'on' }, cookie });
  assert.equal(t.app.store.get().drawnAt, null);
  const left = await request(t.port, 'POST', '/abmelden', { form: { token: tokens['anna@example.at'] } });
  assert.equal(left.status, 200);
  assert.equal(t.app.store.get().participants.length, 3);

  // Link verloren: neuer Link per Mail, alter Link ungültig
  const before = t.smtp.mails.length;
  await request(t.port, 'POST', '/link', { form: { email: 'cilli@example.at' } });
  await t.app.idle();
  assert.equal(t.smtp.mails.length, before + 1);
  const fresh = /\/p\/([A-Za-z0-9_-]{43})/.exec(t.smtp.mails.at(-1).text)[1];
  assert.equal((await request(t.port, 'GET', `/p/${tokens['cilli@example.at']}`)).status, 404);
  assert.equal((await request(t.port, 'GET', `/p/${fresh}`)).status, 200);

  // Unbekannte Adresse: gleiche Antwort, keine Mail
  const unknown = await request(t.port, 'POST', '/link', { form: { email: 'niemand@example.at' } });
  assert.equal(unknown.status, 200);
  await t.app.idle();
  assert.equal(t.smtp.mails.length, before + 1);

  // Alles löschen
  await request(t.port, 'POST', '/admin/wipe', { form: { sure: 'on' }, cookie });
  assert.equal(t.app.store.get().participants.length, 0);

  // Ausloggen beendet die Sitzung
  await request(t.port, 'POST', '/admin/logout', { form: {}, cookie });
  assert.match((await request(t.port, 'GET', '/admin', { cookie })).body, /name="password"/);
});

test('Gleichzeitige Anmeldungen gehen nicht verloren', async () => {
  const { app, smtp, dataDir, port } = await startApp();
  try {
    const results = await Promise.all(Array.from({ length: 30 }, (_, i) => register(port, `Engele ${i}`, `e${i}@example.at`)));
    assert.ok(results.every((r) => r.status === 303));
    assert.equal(JSON.parse(readFileSync(path.join(dataDir, 'engele.json'), 'utf8')).participants.length, 30);
    await app.idle();
  } finally {
    await app.close();
    smtp.server.close();
    rmSync(dataDir, { recursive: true, force: true });
  }
});

test('Seiten-Passwort vor der Anmeldung und Login-Bremse', async () => {
  const { app, smtp, dataDir, port } = await startApp();
  try {
    const cookie = await login(port);
    const tooShort = await request(port, 'POST', '/admin/sitepassword', { form: { sitePassword: 'abc' }, cookie });
    assert.equal(tooShort.status, 422);
    await request(port, 'POST', '/admin/sitepassword', { form: { sitePassword: 'Lebkuchen24' }, cookie });
    assert.match((await request(port, 'GET', '/admin', { cookie })).body, /Seiten-Passwort<\/span><b>An/);
    assert.ok(!readFileSync(path.join(dataDir, 'engele.json'), 'utf8').includes('Lebkuchen24'));

    // Ohne Passwort: nur die Eintritts-Seite, keine Anmeldung
    const gate = await request(port, 'GET', '/');
    assert.match(gate.body, /action="\/eintritt"/);
    assert.doesNotMatch(gate.body, /name="email"/);
    assert.match((await request(port, 'GET', '/link')).body, /action="\/eintritt"/);
    const sneaky = await register(port, 'Ohne', 'ohne@example.at');
    assert.equal(sneaky.headers.location, '/');
    assert.equal(app.store.get().participants.length, 0);

    // Falsches, dann richtiges Passwort
    assert.equal((await request(port, 'POST', '/eintritt', { form: { password: 'falsch' } })).status, 401);
    const ok = await request(port, 'POST', '/eintritt', { form: { password: ' Lebkuchen24 ' } });
    assert.equal(ok.status, 303);
    const site = ok.headers['set-cookie'][0].split(';')[0];
    assert.match(ok.headers['set-cookie'][0], /HttpOnly; SameSite=Lax/);
    assert.match((await request(port, 'GET', '/', { cookie: site })).body, /name="email"/);
    const joined = await request(port, 'POST', '/anmelden', { form: { name: 'Mit', email: 'mit@example.at' }, cookie: site });
    assert.equal(joined.status, 303);

    // Persönlicher Link geht auch ohne Seiten-Passwort
    assert.equal((await request(port, 'GET', joined.headers.location)).status, 200);

    // Neues Passwort: altes Cookie gilt nicht mehr; entfernen: Seite wieder offen
    await request(port, 'POST', '/admin/sitepassword', { form: { sitePassword: 'Zimtstern' }, cookie });
    assert.match((await request(port, 'GET', '/', { cookie: site })).body, /action="\/eintritt"/);
    await request(port, 'POST', '/admin/sitepassword', { form: { remove: '1' }, cookie });
    assert.match((await request(port, 'GET', '/')).body, /name="email"/);

    let last;
    for (let i = 0; i < 11; i++) last = await request(port, 'POST', '/admin/login', { form: { password: 'falsch' } });
    assert.equal(last.status, 429);
    await app.idle();
  } finally {
    await app.close();
    smtp.server.close();
    rmSync(dataDir, { recursive: true, force: true });
  }
});

test('Anmeldeschluss: danach automatisch auslosen und Mails verschicken', async () => {
  const { app, smtp, dataDir, port } = await startApp();
  try {
    const cookie = await login(port);
    const pad = (n) => String(n).padStart(2, '0');
    const local = (t) => `${t.getFullYear()}-${pad(t.getMonth() + 1)}-${pad(t.getDate())}T${pad(t.getHours())}:${pad(t.getMinutes())}`;

    // Vergangenheit wird abgelehnt, Zukunft gespeichert
    const past = await request(port, 'POST', '/admin/settings', { form: { open: 'on', deadline: local(new Date(Date.now() - 3600_000)) }, cookie });
    assert.equal(past.status, 422);
    const future = new Date(Date.now() + 2 * 86400_000);
    future.setSeconds(0, 0);
    await request(port, 'POST', '/admin/settings', { form: { open: 'on', deadline: local(future), eventDate: '', budget: '', info: '' }, cookie });
    assert.equal(app.store.get().settings.deadline, future.toISOString());
    assert.match((await request(port, 'GET', '/')).body, /Anmeldeschluss/);

    for (const n of ['Anna', 'Bert', 'Cilli']) assert.equal((await register(port, n, `${n.toLowerCase()}@example.at`)).status, 303);
    await app.idle();
    assert.match(smtp.mails[0].text, /Anmeldeschluss ist am/);

    // Vor dem Schluss passiert nichts
    assert.equal(await app.checkDeadline(), false);
    assert.equal(app.store.get().drawnAt, null);

    // Schluss vorbei (wie nach Ablauf der Frist): Anmeldung zu, automatische Ziehung, Mails
    await app.store.update((d) => { d.settings.deadline = new Date(Date.now() - 1000).toISOString(); });
    assert.equal((await register(port, 'Spät', 'spaet@example.at')).status, 422);
    assert.equal(await app.checkDeadline(), true);
    assert.ok(app.store.get().drawnAt);
    await app.idle();
    const drawMails = smtp.mails.filter((m) => /Du beschenkst/.test(m.text));
    assert.equal(drawMails.length, 3);
    assert.equal(await app.checkDeadline(), false); // kein zweites Mal

    // Zurücksetzen löscht den abgelaufenen Schluss, damit nicht sofort neu gelost wird
    await request(port, 'POST', '/admin/reset', { form: { sure: 'on' }, cookie });
    assert.equal(app.store.get().settings.deadline, '');
    assert.equal(await app.checkDeadline(), false);
  } finally {
    await app.close();
    smtp.server.close();
    rmSync(dataDir, { recursive: true, force: true });
  }
});

test('Anmeldeschluss mit zu wenigen Engele: keine Ziehung', async () => {
  const { app, smtp, dataDir, port } = await startApp();
  try {
    await register(port, 'Allein', 'allein@example.at');
    await app.store.update((d) => { d.settings.deadline = new Date(Date.now() - 1000).toISOString(); });
    assert.equal(await app.checkDeadline(), false);
    assert.equal(app.store.get().drawnAt, null);
    const cookie = await login(port);
    assert.match((await request(port, 'GET', '/admin', { cookie })).body, /weniger als 3 Engele/);
    await app.idle();
  } finally {
    await app.close();
    smtp.server.close();
    rmSync(dataDir, { recursive: true, force: true });
  }
});

test('Einrichtung: Proton Mail mit SMTP-Token im Orga-Bereich', async () => {
  const { app, smtp, dataDir, port } = await startApp({ smtp: { host: '' } });
  try {
    assert.equal(app.mailer, null);
    const cookie = await login(port);
    const setup = await request(port, 'GET', '/admin/setup', { cookie });
    assert.equal(setup.status, 200);
    assert.match(setup.body, /SMTP-Token/);
    assert.match((await request(port, 'GET', '/admin/setup')).body, /name="password"/); // ohne Login: Login-Seite

    // Proton-Vorgabe: smtp.protonmail.ch:587 mit STARTTLS, Token wird nie wieder angezeigt
    const proton = await request(port, 'POST', '/admin/mail', { form: { provider: 'proton', address: 'Orga@Example.at', token: 'geheim-token-123' }, cookie });
    assert.equal(proton.headers.location, '/admin/setup?m=mailOn#mail');
    assert.deepEqual(
      (({ host, port: p, secure, user }) => ({ host, port: p, secure, user }))(app.store.get().mail),
      { host: 'smtp.protonmail.ch', port: 587, secure: 'starttls', user: 'orga@example.at' },
    );
    assert.match(app.mailer.describe, /smtp\.protonmail\.ch:587/);
    assert.doesNotMatch((await request(port, 'GET', '/admin/setup', { cookie })).body, /geheim-token-123/);

    // Unverschlüsselt nur zu localhost
    const insecure = await request(port, 'POST', '/admin/mail', { form: { provider: 'custom', host: 'smtp.example.at', port: '25', secure: 'none', address: 'orga@example.at' }, cookie });
    assert.equal(insecure.status, 422);

    // Eigener Server (hier der Test-Mailserver); leerer Token = alten behalten
    await request(port, 'POST', '/admin/mail', { form: { provider: 'custom', host: '127.0.0.1', port: String(smtp.port), secure: 'none', address: 'orga@example.at' }, cookie });
    assert.equal(app.store.get().mail.pass, 'geheim-token-123');
    const test = await request(port, 'POST', '/admin/testmail', { form: { to: 'orga@example.at' }, cookie });
    assert.match(test.body, /Testmail an orga@example.at verschickt/);
    assert.equal((await register(port, 'Anna', 'anna@example.at')).status, 303);
    await app.idle();
    assert.deepEqual(smtp.mails.map((m) => m.to), ['orga@example.at', 'anna@example.at']);
    assert.match(smtp.mails[1].head, /From: "Pengele Engele" <orga@example.at>/);

    // Löschen
    await request(port, 'POST', '/admin/mail', { form: { remove: '1' }, cookie });
    assert.equal(app.mailer, null);

    // Ziehungs-Zeitpunkt auf der Einrichtungsseite ändert die anderen Felder nicht
    await request(port, 'POST', '/admin/settings', { form: { eventDate: '20.12.', budget: '15 €', info: 'Kekse' }, cookie });
    await request(port, 'POST', '/admin/settings', { form: { openField: '1', open: 'on', deadline: '' }, cookie });
    assert.equal(app.store.get().settings.budget, '15 €');
    assert.equal(app.store.get().settings.info, 'Kekse');
  } finally {
    await app.close();
    smtp.server.close();
    rmSync(dataDir, { recursive: true, force: true });
  }
});
