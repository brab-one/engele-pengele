// Schlanker SMTP-Client ohne Abhängigkeiten: TLS (465) oder STARTTLS (587),
// Zertifikate werden immer geprüft. Unverschlüsselt nur zu einem Mailserver auf localhost.
import net from 'node:net';
import tls from 'node:tls';
import { randomUUID } from 'node:crypto';

const TIMEOUT = 20_000;
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1']);
const ADDRESS_RE = /^[^\s@<>()[\]\\,;:"]+@[^\s@<>()[\]\\,;:"]+$/;

export function parseFrom(from) {
  const m = /^\s*(.*?)\s*<([^<>]+)>\s*$/.exec(from);
  const name = m ? m[1].replace(/^"|"$/g, '') : '';
  const address = (m ? m[2] : from).trim();
  if (!ADDRESS_RE.test(address) || /[\r\n]/.test(name)) throw new Error(`MAIL_FROM ist ungültig: "${from}"`);
  return { name, address };
}

export function createMailer(smtp, baseUrl) {
  if (!smtp.host) return null;
  if (!smtp.from) throw new Error('MAIL_FROM fehlt (z. B. MAIL_FROM="Pengele Engele <wichteln@example.at>").');
  const secure = smtp.secure || (smtp.port === 465 ? 'tls' : 'starttls');
  if (!['tls', 'starttls', 'none'].includes(secure)) throw new Error('SMTP_SECURE muss tls, starttls oder none sein.');
  if (secure === 'none' && !LOCAL_HOSTS.has(smtp.host)) {
    throw new Error('SMTP_SECURE=none ist nur für einen Mailserver auf localhost erlaubt.');
  }
  const port = smtp.port || { tls: 465, starttls: 587, none: 25 }[secure];
  const from = parseFrom(smtp.from);
  const domain = new URL(baseUrl).hostname || 'localhost';
  const cfg = { ...smtp, secure, port, from, domain };
  return {
    describe: `${smtp.host}:${port} (${secure === 'none' ? 'unverschlüsselt, lokal' : secure.toUpperCase()}) · Absender ${from.address}`,
    send: (msg) => sendMail(cfg, msg),
  };
}

class Conversation {
  #buf = '';
  #lines = [];
  #replies = [];
  #waiting = null;
  #error = null;

  use(socket) {
    if (this.socket) {
      this.socket.removeAllListeners('data');
      this.socket.removeAllListeners('close');
      this.socket.removeAllListeners('error');
      this.socket.on('error', () => {});
      this.socket.setTimeout(0);
    }
    this.socket = socket;
    socket.on('data', (chunk) => this.#onData(chunk));
    socket.on('error', (e) => this.#fail(e));
    socket.on('close', () => this.#fail(new Error('Verbindung zum Mailserver wurde geschlossen.')));
    socket.setTimeout(TIMEOUT, () => socket.destroy(new Error('Mailserver antwortet nicht (Timeout).')));
  }

  #onData(chunk) {
    this.#buf += chunk.toString('utf8');
    let i;
    while ((i = this.#buf.indexOf('\n')) >= 0) {
      const line = this.#buf.slice(0, i).replace(/\r$/, '');
      this.#buf = this.#buf.slice(i + 1);
      this.#lines.push(line);
      if (!/^\d{3}-/.test(line)) {
        this.#replies.push({ code: parseInt(line, 10) || 0, lines: this.#lines });
        this.#lines = [];
      }
    }
    this.#pump();
  }

  #fail(e) {
    if (!this.#error) this.#error = e;
    this.#pump();
  }

  #pump() {
    if (!this.#waiting) return;
    const w = this.#waiting;
    if (this.#replies.length) { this.#waiting = null; w.resolve(this.#replies.shift()); }
    else if (this.#error) { this.#waiting = null; w.reject(this.#error); }
  }

  async expect(codes, step) {
    const reply = await new Promise((resolve, reject) => { this.#waiting = { resolve, reject }; this.#pump(); });
    if (!codes.includes(reply.code)) throw new Error(`Mailserver lehnt ${step} ab: ${reply.lines.join(' ').slice(0, 300)}`);
    return reply;
  }

  send(line, codes, step) {
    this.socket.write(`${line}\r\n`);
    return this.expect(codes, step);
  }
}

const encodeWord = (s) => (/^[\x20-\x7e]*$/.test(s) ? s : `=?UTF-8?B?${Buffer.from(s).toString('base64')}?=`);
const quoteName = (s) => (/^[\x20-\x7e]*$/.test(s) ? `"${s.replace(/["\\]/g, '')}"` : encodeWord(s));

export function buildMessage({ from, to, subject, text, domain }) {
  if (!ADDRESS_RE.test(to)) throw new Error('Ungültige Empfängeradresse.');
  const headers = [
    `From: ${from.name ? `${quoteName(from.name)} <${from.address}>` : from.address}`,
    `To: <${to}>`,
    `Subject: ${encodeWord(subject)}`,
    `Date: ${new Date().toUTCString().replace('GMT', '+0000')}`,
    `Message-ID: <${randomUUID()}@${domain}>`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=utf-8',
    'Content-Transfer-Encoding: base64',
    'Auto-Submitted: auto-generated',
  ];
  const body = Buffer.from(text.replace(/\r?\n/g, '\r\n')).toString('base64').replace(/.{76}(?=.)/g, '$&\r\n');
  return `${headers.join('\r\n')}\r\n\r\n${body}`;
}

async function sendMail(cfg, { to, subject, text }) {
  const message = buildMessage({ from: cfg.from, to, subject, text, domain: cfg.domain });
  const servername = net.isIP(cfg.host) ? undefined : cfg.host;
  const c = new Conversation();
  const raw = cfg.secure === 'tls'
    ? tls.connect({ host: cfg.host, port: cfg.port, servername, minVersion: 'TLSv1.2' })
    : net.connect({ host: cfg.host, port: cfg.port });
  c.use(raw);
  try {
    await c.expect([220], 'die Verbindung');
    let ehlo = await c.send(`EHLO ${cfg.domain}`, [250], 'EHLO');
    if (cfg.secure === 'starttls') {
      if (!ehlo.lines.some((l) => /^250[ -]STARTTLS\b/i.test(l))) throw new Error('Mailserver bietet kein STARTTLS an.');
      await c.send('STARTTLS', [220], 'STARTTLS');
      c.use(tls.connect({ socket: raw, servername, minVersion: 'TLSv1.2' }));
      ehlo = await c.send(`EHLO ${cfg.domain}`, [250], 'EHLO');
    }
    if (cfg.user) {
      const auth = ehlo.lines.find((l) => /^250[ -]AUTH\b/i.test(l))?.toUpperCase() ?? '';
      if (/\bPLAIN\b/.test(auth)) {
        await c.send(`AUTH PLAIN ${Buffer.from(`\0${cfg.user}\0${cfg.pass}`).toString('base64')}`, [235], 'die Anmeldung');
      } else if (/\bLOGIN\b/.test(auth)) {
        await c.send('AUTH LOGIN', [334], 'die Anmeldung');
        await c.send(Buffer.from(cfg.user).toString('base64'), [334], 'den Benutzernamen');
        await c.send(Buffer.from(cfg.pass).toString('base64'), [235], 'die Anmeldung');
      } else {
        throw new Error('Mailserver bietet keine Anmeldung (AUTH PLAIN/LOGIN) an.');
      }
    }
    await c.send(`MAIL FROM:<${cfg.from.address}>`, [250], 'den Absender');
    await c.send(`RCPT TO:<${to}>`, [250, 251], 'den Empfänger');
    await c.send('DATA', [354], 'DATA');
    await c.send(`${message}\r\n.`, [250], 'die Nachricht');
    await c.send('QUIT', [221], 'QUIT').catch(() => {});
  } finally {
    c.socket.destroy();
  }
}
