import { html, raw } from './html.js';

let asset = (p) => p;
export const setAssetUrl = (fn) => { asset = fn; };

const sprite = (name, w, h, cls = '') =>
  html`<img class="sprite ${cls}" src="${asset(`/img/${name}.svg`)}" width="${w}" height="${h}" alt="">`;

const dateTime = (iso) => new Date(iso).toLocaleString('de-AT', { dateStyle: 'medium', timeStyle: 'short' });
const shortDateTime = (iso) => `${new Date(iso).toLocaleString('de-AT', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })} Uhr`;
const pad = (n) => String(n).padStart(2, '0');
// Wert für <input type="datetime-local"> in Ortszeit
const localInput = (iso) => {
  if (!iso) return '';
  const t = new Date(iso);
  return `${t.getFullYear()}-${pad(t.getMonth() + 1)}-${pad(t.getDate())}T${pad(t.getHours())}:${pad(t.getMinutes())}`;
};
const plural = (n) => (n === 1 ? 'ist' : 'sind');
const future = (iso) => Boolean(iso) && Date.parse(iso) > Date.now();

// Restzeit bis zur Ziehung, z. B. "3T 04:12:55" – app.js zählt im Browser jede Sekunde weiter
function countdownText(iso) {
  let s = Math.max(0, Math.floor((Date.parse(iso) - Date.now()) / 1000));
  const days = Math.floor(s / 86400);
  s %= 86400;
  const time = `${pad(Math.floor(s / 3600))}:${pad(Math.floor(s / 60) % 60)}:${pad(s % 60)}`;
  return days ? `${days}T ${time}` : time;
}
const countdown = (iso) => html`<b class="countdown" data-countdown="${iso}">${countdownText(iso)}</b>`;

// --- Grundgerüst -------------------------------------------------------------

function layout({ title, body, bigHeader = false }) {
  return html`<!doctype html>
<html lang="de">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title ? `${title} · Pengele Engele` : 'Pengele Engele – geheimes Wichteln'}</title>
<meta name="description" content="Pengele Engele: geheimes Wichteln. Anmelden, Los ziehen, heimlich schenken.">
<meta name="theme-color" content="#060920">
<link rel="icon" type="image/svg+xml" href="${asset('/img/gift.svg')}">
<link rel="stylesheet" href="${asset('/style.css')}">
<script src="${asset('/app.js')}" defer></script>
</head>
<body>
<div class="snow" aria-hidden="true"></div>
${bigHeader ? '' : html`<header class="topbar"><a href="/"><img class="logo small" src="${asset('/img/logo.svg')}" width="264" height="120" alt="Pengele Engele – zur Startseite"></a></header>`}
<main class="wrap">
${body}
</main>
<footer class="ground">
  <div class="forest" aria-hidden="true"></div>
  <div class="snowcap" aria-hidden="true"></div>
  <div class="snowfield">
    <p><b>Pengele Engele</b> · geheimes Wichteln</p>
    <p class="small">Gespeichert werden nur Name und E-Mail-Adresse, ausschließlich für die Ziehung. Nach dem Fest löscht die Orga alles. · <a href="/admin">Orga</a></p>
  </div>
</footer>
</body>
</html>`;
}

const panel = (title, body, cls = '') => html`<section class="panel ${cls}"><h2>${title}</h2>${body}</section>`;
const alert = (text, ok = false) => html`<p class="flash ${ok ? 'ok' : 'err'}" role="${ok ? 'status' : 'alert'}">${text}</p>`;

function facts(info) {
  if (!info.eventDate && !info.budget) return '';
  return html`<dl class="facts">
    ${info.eventDate ? html`<dt>Bescherung</dt><dd>${info.eventDate}</dd>` : ''}
    ${info.budget ? html`<dt>Budget</dt><dd>${info.budget}</dd>` : ''}
  </dl>`;
}

const copyBox = (id, value) => html`<div class="copy">
  <input id="${id}" type="text" readonly value="${value}" aria-label="Dein persönlicher Link">
  <button class="btn small" type="button" data-copy="${id}" hidden>Kopieren</button>
</div>`;

// --- Startseite --------------------------------------------------------------

const hero = () => html`<header class="hero">
  <div class="hero-row">
    ${sprite('angel-calm', 80, 64, 'bob gunner flip')}
    <h1><img class="logo" src="${asset('/img/logo.svg')}" width="528" height="240" alt="Pengele Engele"></h1>
    ${sprite('angel-calm', 80, 64, 'bob gunner')}
  </div>
  <p class="tagline">Geheimes Wichteln: Alle ziehen ein Los und beschenken heimlich jemanden – niemand weiß, von wem das eigene Geschenk kommt.</p>
</header>`;

// Passwort-Seite vor der Anmeldung
export function gate({ error = null }) {
  return layout({
    bigHeader: true,
    body: html`
${hero()}
${panel('Eintritt', html`<form class="form" method="post" action="/eintritt">
  ${error ? alert(error) : ''}
  <p>Hier wird nur mit Einladung gewichtelt. Das Passwort steht in deiner Einladung.</p>
  <label for="password">Passwort</label>
  <input id="password" name="password" type="password" required maxlength="100" autocomplete="current-password" autofocus>
  <button class="btn" type="submit">▶ Eintreten</button>
</form>`)}`,
  });
}

function registerForm(s, values, error, lostLink) {
  return html`<form class="form" method="post" action="/anmelden#anmelden">
  ${error ? html`<p class="flash err" role="alert">${error}${lostLink ? html` <a href="/link">Link verloren?</a>` : ''}</p>` : ''}
  <label for="name">Name</label>
  <input id="name" name="name" type="text" required maxlength="40" autocomplete="name" value="${values.name ?? ''}">
  <small>So steht es auf dem Los der Person, die dich zieht.</small>

  <label for="email">E-Mail</label>
  <input id="email" name="email" type="email" required maxlength="254" autocomplete="email" value="${values.email ?? ''}">
  <small>${s.mail ? 'Hierhin kommt dein Los.' : 'Damit die Orga dich erreicht.'} Wird an niemanden weitergegeben.</small>

  <div class="hp" aria-hidden="true">
    <label for="website">Website (bitte leer lassen)</label>
    <input id="website" name="website" type="text" tabindex="-1" autocomplete="off">
  </div>
  ${s.info.deadline ? html`<p class="note">Anmeldeschluss: ${shortDateTime(s.info.deadline)} – dann wird automatisch gelost${s.mail ? ' und alle bekommen ihr Los per E-Mail' : ''}.</p>` : ''}
  <button class="btn" type="submit">▶ Mitmachen</button>
</form>
${s.mail ? html`<p class="small muted">Schon dabei und den Link verloren? <a href="/link">Neuen Link anfordern</a></p>` : ''}`;
}

export function home(s, { values = {}, error = null, lostLink = false } = {}) {
  let join;
  if (s.drawn) join = html`<p class="status">${sprite('star', 30, 26, 'inline')} Die Ziehung ist gelaufen – die Anmeldung ist geschlossen. Dein Los findest du über deinen persönlichen Link.</p>`;
  else if (s.deadlinePassed) join = html`<p class="status">Der Anmeldeschluss ist vorbei – gleich wird gelost.</p>`;
  else if (!s.open) join = html`<p class="status">Die Anmeldung ist gerade geschlossen. Schau später nochmal vorbei.</p>`;
  else join = registerForm(s, values, error, lostLink);

  return layout({
    bigHeader: true,
    body: html`
${hero()}

<ul class="hud" aria-label="Überblick">
  <li><span>Engele dabei</span><b>${s.count}</b></li>
  ${future(s.info.deadline) && !s.drawn ? html`<li class="hud-countdown"><span>Ziehung in</span>${countdown(s.info.deadline)}</li>` : ''}
  ${s.info.eventDate ? html`<li><span>Bescherung</span><b>${s.info.eventDate}</b></li>` : ''}
  ${s.info.budget ? html`<li><span>Budget</span><b>${s.info.budget}</b></li>` : ''}
  <li><span>Status</span><b>${s.drawn ? 'Gezogen' : s.open ? 'Anmeldung offen' : s.deadlinePassed ? 'Anmeldung vorbei' : 'Pause'}</b></li>
</ul>

${s.info.info ? panel('Infos von der Orga', html`<p class="pre">${s.info.info}</p>`) : ''}

${panel('So geht’s', html`<ol class="steps">
  <li>${sprite('letter', 64, 48)}<div><b>1 · Anmelden</b><p>Name und E-Mail eintragen. Fertig.</p></div></li>
  <li>${sprite('star', 60, 52)}<div><b>2 · Ziehung</b><p>${s.info.deadline ? 'Nach dem Anmeldeschluss wird automatisch gelost.' : 'Sind alle dabei, wird gelost.'} ${s.mail ? 'Per E-Mail' : 'Über deinen Link'} erfährst du, wen du beschenkst.</p></div></li>
  <li>${sprite('gift', 64, 64)}<div><b>3 · Schenken</b><p>Geschenk besorgen, nichts verraten, bei der Bescherung staunen.</p></div></li>
</ol>`)}

<section class="panel" id="anmelden">
  <h2>Mitmachen</h2>
  ${join}
</section>`,
  });
}

// --- Persönliche Seite -------------------------------------------------------

export function personal({ me, receiver, token, link, fresh, mail, info, drawn }) {
  const welcome = fresh ? html`
    <p class="big">Du bist dabei, ${me.name}!</p>
    <p>Das ist dein persönlicher Link. Hier siehst du nach der Ziehung, wen du beschenkst.${mail ? ' Wir haben ihn dir auch per E-Mail geschickt.' : ''}</p>
    ${copyBox('mylink', link)}
    <p class="note">${mail ? 'Tipp: Leg dir trotzdem ein Lesezeichen an.' : 'Wichtig: Speichere diesen Link als Lesezeichen – ohne ihn kommst du nicht an dein Los.'}</p>`
    : html`<p class="big">Hallo ${me.name}!</p>`;

  const result = receiver
    ? html`<details class="reveal">
        <summary class="btn">▶ Los aufdecken</summary>
        <div class="reveal-body">
          ${sprite('gift', 96, 96)}
          <p>Du beschenkst</p>
          <p class="receiver">${receiver.name}</p>
          <p class="psst">Psst – nicht verraten!</p>
        </div>
      </details>
      ${facts(info)}
      ${info.info ? html`<p class="pre muted">${info.info}</p>` : ''}`
    : html`${future(info.deadline) ? html`<p class="big-countdown">Ziehung in ${countdown(info.deadline)}</p>` : ''}
      <p class="status">⧗ Die Ziehung war noch nicht.${future(info.deadline) ? ` Gelost wird automatisch am ${dateTime(info.deadline)} Uhr.` : ''} Sobald gelost ist, steht hier${mail ? ' – und in deinem Postfach –' : ''}, wen du beschenkst.</p>
      ${facts(info)}
      <p class="small muted">Angemeldet mit ${me.email}</p>`;

  return layout({
    title: 'Dein Los',
    body: html`
${panel(fresh ? 'Willkommen' : 'Dein Los', html`
  <div class="center">${sprite('angel-calm', 80, 64, 'bob gunner')}</div>
  ${welcome}
  ${result}`)}
${!drawn ? panel('Doch nicht dabei?', html`
  <form method="post" action="/abmelden" data-confirm="Wirklich abmelden? Dein Name und deine E-Mail-Adresse werden gelöscht.">
    <input type="hidden" name="token" value="${token}">
    <p>Bis zur Ziehung kannst du dich jederzeit wieder abmelden. Name und E-Mail-Adresse werden dann gelöscht.</p>
    <button class="btn ghost" type="submit">Abmelden</button>
  </form>`) : ''}`,
  });
}

export function unknownLink({ mail }) {
  return message({
    title: 'Link unbekannt',
    text: 'Diesen Link kennen wir nicht. Vielleicht wurde er durch einen neuen ersetzt oder du hast dich abgemeldet.',
    extra: mail ? html`<p><a class="btn small" href="/link">Neuen Link anfordern</a></p>` : html`<p>Frag die Orga – sie kann dir einen neuen Link geben.</p>`,
  });
}

export function lostLink({ mail, sent = false, error = null, value = '' }) {
  let body;
  if (!mail) {
    body = html`<p>Frag die Person, die das Pengele Engele organisiert. Sie kann dir einen neuen persönlichen Link geben.</p>`;
  } else if (sent) {
    body = html`${alert('Falls diese Adresse angemeldet ist, ist ein neuer Link unterwegs. Der alte Link funktioniert dann nicht mehr.', true)}
      <p><a href="/">Zur Startseite</a></p>`;
  } else {
    body = html`<form class="form" method="post" action="/link">
      ${error ? alert(error) : ''}
      <p>Gib die E-Mail-Adresse ein, mit der du dich angemeldet hast. Du bekommst einen neuen persönlichen Link.</p>
      <label for="email">E-Mail</label>
      <input id="email" name="email" type="email" required maxlength="254" autocomplete="email" value="${value}">
      <button class="btn" type="submit">▶ Link schicken</button>
    </form>`;
  }
  return layout({ title: 'Link verloren', body: panel('Link verloren?', body) });
}

export function message({ title, text, extra = '' }) {
  return layout({
    title,
    body: panel(title, html`<p>${text}</p>${extra || html`<p><a class="btn small" href="/">Zur Startseite</a></p>`}`),
  });
}

export function notFound() {
  return message({ title: 'Nix da', text: 'Diese Seite gibt es nicht. Vielleicht hat sie der Krampus geholt.' });
}

// --- Orga-Bereich ------------------------------------------------------------

export function adminLogin({ error }) {
  return layout({
    title: 'Orga',
    body: panel('Orga-Bereich', html`<form class="form" method="post" action="/admin/login">
      ${error ? alert(error) : ''}
      <label for="password">Passwort</label>
      <input id="password" name="password" type="password" required autocomplete="current-password">
      <button class="btn" type="submit">▶ Einloggen</button>
    </form>`),
  });
}

const sure = (text) => html`<label class="check"><input type="checkbox" name="sure" required> ${text}</label>`;

function mailState(p, drawn) {
  if (!drawn) return html`<span class="tag">angemeldet</span>`;
  if (p.mailedAt) return html`<span class="tag ok">Los verschickt</span>`;
  if (p.mailError) return html`<span class="tag err" title="${p.mailError}">Mail fehlgeschlagen</span>`;
  return html`<span class="tag">gezogen</span>`;
}

const adminNav = (active) => html`<nav class="admin-nav" aria-label="Orga-Bereich">
  <a href="/admin" ${active === 'dash' ? raw('aria-current="page"') : ''}>Übersicht</a>
  <a href="/admin/setup" ${active === 'setup' ? raw('aria-current="page"') : ''}>Einrichtung</a>
  <form method="post" action="/admin/logout"><button class="btn small ghost" type="submit">Ausloggen</button></form>
</nav>`;

export function adminDashboard({ d, flash, mailer, mailing, baseUrl }) {
  const drawn = Boolean(d.drawnAt);
  const n = d.participants.length;
  const sent = d.participants.filter((p) => p.mailedAt).length;
  const failed = d.participants.filter((p) => p.mailError).length;
  const s = d.settings;
  const missing = [!s.deadline && !drawn && 'Zeitpunkt der Ziehung', !mailer && 'E-Mail-Versand'].filter(Boolean);

  const drawPanel = drawn
    ? html`<p>Ausgelost am <b>${dateTime(d.drawnAt)}</b>.</p>
      ${mailer ? html`<p>${sent} von ${n} Los-Mails verschickt${failed ? html`, <b class="text-err">${failed} fehlgeschlagen</b>` : ''}.${mailing ? ' Versand läuft … (Seite neu laden)' : ''}</p>`
        : html`<p>Kein Mailversand eingerichtet: Alle sehen ihr Los über ihren persönlichen Link. <a href="/admin/setup#mail">Mailversand einrichten</a> – danach kannst du die Lose hier nachschicken.</p>`}
      ${mailer && sent < n && !mailing ? html`<form method="post" action="/admin/resend"><button class="btn small" type="submit">Fehlende Mails jetzt senden</button></form>` : ''}
      <form class="form danger" method="post" action="/admin/reset">
        <p class="small muted">Zurücksetzen löscht die Ziehung und öffnet die Anmeldung wieder. Danach kann neu gelost werden – bereits verschickte Lose gelten dann nicht mehr.</p>
        ${sure('Ja, Ziehung wirklich zurücksetzen')}
        <button class="btn ghost small" type="submit">Ziehung zurücksetzen</button>
      </form>`
    : html`<p>${n < 3 ? `Für die Ziehung braucht es mindestens 3 Engele – ${n} ${plural(n)} dabei.` : `${n} Engele ${plural(n)} dabei. Die Ziehung schließt die Anmeldung${mailer ? ' und schickt allen ihr Los per E-Mail' : ''}.`}</p>
      ${s.deadline
        ? (future(s.deadline)
          ? html`<p class="big-countdown left">Automatische Ziehung in ${countdown(s.deadline)}</p><p class="small muted">am ${dateTime(s.deadline)} Uhr · <a href="/admin/setup#ziehung">ändern</a></p>`
          : html`<p class="flash err">Der Zeitpunkt der Ziehung (${dateTime(s.deadline)} Uhr) ist vorbei, aber es sind weniger als 3 Engele dabei – deshalb wurde nicht gelost. <a href="/admin/setup#ziehung">Neuen Zeitpunkt setzen</a> oder selbst auslosen.</p>`)
        : html`<p class="small muted">Tipp: <a href="/admin/setup#ziehung">Leg einen Zeitpunkt fest</a>, dann wird automatisch gelost.</p>`}
      <form class="form" method="post" action="/admin/draw">
        ${sure('Ja, jetzt sofort auslosen')}
        <button class="btn" type="submit" ${n < 3 ? 'disabled' : ''}>★ Jetzt auslosen</button>
      </form>`;

  const rows = d.participants.map((p) => html`<tr>
    <td>${p.name}</td>
    <td class="email">${p.email}</td>
    <td>${dateTime(p.createdAt)}</td>
    <td>${mailState(p, drawn)}</td>
    <td class="actions">
      <form method="post" action="/admin/newlink" data-confirm="Neuen Link für ${p.name} erzeugen? Der alte Link funktioniert dann nicht mehr. Öffne den neuen Link nicht selbst, sonst siehst du das Los.">
        <input type="hidden" name="id" value="${p.id}"><button class="btn small ghost" type="submit">Neuer Link</button>
      </form>
      ${drawn ? '' : html`<form method="post" action="/admin/remove" data-confirm="${p.name} wirklich entfernen?">
        <input type="hidden" name="id" value="${p.id}"><button class="btn small red" type="submit">Entfernen</button>
      </form>`}
    </td>
  </tr>`);

  return layout({
    title: 'Orga',
    body: html`
${panel('Orga-Bereich', html`
  ${adminNav('dash')}
  ${flash ? alert(flash[1], flash[0]) : ''}
  ${missing.length ? html`<p class="flash err">Noch nicht eingerichtet: ${missing.join(', ')}. <a href="/admin/setup">Zur Einrichtung</a></p>` : ''}
  <ul class="hud left">
    <li><span>Engele</span><b>${n}</b></li>
    <li><span>Status</span><b>${drawn ? 'Gezogen' : s.open ? 'Anmeldung offen' : 'Anmeldung zu'}</b></li>
    ${future(s.deadline) && !drawn ? html`<li class="hud-countdown"><span>Ziehung in</span>${countdown(s.deadline)}</li>` : ''}
    <li><span>Seiten-Passwort</span><b>${s.sitePassword ? 'An' : 'Aus'}</b></li>
  </ul>
  <p class="small muted">Mailversand: ${mailer ?? 'keiner'}<br>Seite: ${baseUrl}</p>`)}

${panel('Ziehung', html`${drawPanel}
  <p class="small muted">Wer wen beschenkt, siehst auch du hier nicht – so bleibt es für alle eine Überraschung.</p>`)}

${panel(`Engele (${n})`, n ? html`<div class="table-wrap"><table>
  <thead><tr><th>Name</th><th>E-Mail</th><th>Angemeldet</th><th>Status</th><th></th></tr></thead>
  <tbody>${rows}</tbody>
</table></div>` : html`<p class="muted">Noch niemand angemeldet.</p>`)}

${panel('Nach dem Fest', html`<form class="form danger" method="post" action="/admin/wipe">
  <p>Löscht alle Engele samt E-Mail-Adressen und die Ziehung. Einstellungen bleiben.</p>
  ${sure('Ja, alles löschen')}
  <button class="btn red small" type="submit">Alles löschen</button>
</form>`)}`,
  });
}

const check = (ok, text) => html`<li class="${ok ? 'done' : 'todo'}"><span aria-hidden="true">${ok ? '★' : '☆'}</span> ${text}</li>`;

export function adminSetup({ d, flash, tz, mail }) {
  const s = d.settings;
  const drawn = Boolean(d.drawnAt);
  const custom = mail.provider === 'custom';

  const drawForm = drawn
    ? html`<p>Schon ausgelost am <b>${dateTime(d.drawnAt)}</b>. Um neu zu losen, setz die Ziehung in der <a href="/admin">Übersicht</a> zurück.</p>`
    : html`<form class="form" method="post" action="/admin/settings">
      <input type="hidden" name="openField" value="1">
      <label for="deadline">Ziehung am</label>
      <input id="deadline" name="deadline" type="datetime-local" value="${localInput(s.deadline)}">
      <small>Bis dahin können sich alle anmelden. Dann schließt die Anmeldung, es wird automatisch gelost${mail.active ? ' und alle bekommen ihr Los per E-Mail' : ''}. Zeitzone: ${tz}. Leer lassen, wenn du lieber selbst auf „Jetzt auslosen“ drückst.</small>
      ${future(s.deadline) ? html`<p class="big-countdown left">Noch ${countdown(s.deadline)} bis zur Ziehung</p>` : ''}
      <label class="check"><input type="checkbox" name="open" ${s.open ? 'checked' : ''}> Anmeldung ist offen</label>
      <button class="btn" type="submit">Speichern</button>
    </form>`;

  return layout({
    title: 'Einrichtung',
    body: html`
${panel('Einrichtung', html`
  ${adminNav('setup')}
  ${flash ? alert(flash[1], flash[0]) : ''}
  <p>Hier stellst du alles für euer Pengele Engele ein. Jeder Abschnitt wird für sich gespeichert.</p>
  <ul class="checklist">
    ${check(Boolean(s.deadline) || drawn, html`<a href="#ziehung">Zeitpunkt der Ziehung</a>`)}
    ${check(Boolean(mail.active), html`<a href="#mail">E-Mail-Versand</a> (z. B. Proton Mail)`)}
    ${check(Boolean(s.eventDate || s.budget), html`<a href="#bescherung">Bescherung &amp; Budget</a> <small class="muted">(optional)</small>`)}
    ${check(Boolean(s.sitePassword), html`<a href="#passwort">Seiten-Passwort</a> <small class="muted">(optional)</small>`)}
  </ul>`)}

<section class="panel" id="ziehung"><h2>1 · Ziehung</h2>${drawForm}</section>

<section class="panel" id="mail"><h2>2 · E-Mail-Versand</h2>
  <p>${mail.active
    ? html`<span class="tag ok">Aktiv</span> ${mail.active}${mail.fromOrga ? '' : ' (aus der .env-Datei)'}`
    : html`<span class="tag">Aus</span> Ohne Mailversand sehen alle ihr Los nur über ihren persönlichen Link.`}</p>
  <form class="form" method="post" action="/admin/mail">
    <fieldset class="choice">
      <legend>Mailserver</legend>
      <label class="check"><input type="radio" name="provider" value="proton" ${custom ? '' : 'checked'}> Proton Mail</label>
      <label class="check"><input type="radio" name="provider" value="custom" ${custom ? 'checked' : ''}> Anderer Mailserver (unten eintragen)</label>
    </fieldset>
    <label for="address">Absender-Adresse</label>
    <input id="address" name="address" type="email" required maxlength="254" autocomplete="off" value="${mail.address}" placeholder="z. B. wichteln@deine-domain.at">
    <small>Deine Proton-Adresse, von der die Mails verschickt werden.</small>
    <label for="token">SMTP-Token</label>
    <input id="token" name="token" type="password" maxlength="200" autocomplete="new-password" ${mail.fromOrga ? '' : 'required'} placeholder="${mail.fromOrga ? 'gespeichert – leer lassen, um ihn zu behalten' : ''}">
    <small>So bekommst du ihn: Proton Mail im Browser → Einstellungen → Alle Einstellungen → Proton Mail → IMAP/SMTP → SMTP-Tokens → Token erstellen. Dein normales Proton-Passwort funktioniert hier nicht. Der Token wird nur auf dem Server gespeichert und nie wieder angezeigt.</small>
    <label for="user">SMTP-Benutzername <span class="muted">(optional)</span></label>
    <input id="user" name="user" type="text" maxlength="254" autocomplete="off" spellcheck="false" value="${mail.user}" placeholder="leer = Absender-Adresse">
    <small>Proton zeigt ihn beim Erstellen des Tokens an – meist ist es deine Adresse.</small>
    <label for="fromName">Absender-Name</label>
    <input id="fromName" name="fromName" type="text" maxlength="60" value="${mail.fromName}">
    <details class="advanced" ${custom ? 'open' : ''}>
      <summary>Anderer Mailserver</summary>
      <label for="host">Server</label>
      <input id="host" name="host" type="text" maxlength="253" spellcheck="false" value="${mail.host}" placeholder="z. B. smtp.example.at">
      <label for="port">Port</label>
      <input id="port" name="port" type="text" inputmode="numeric" maxlength="5" value="${mail.port}" placeholder="587">
      <label for="secure">Verschlüsselung</label>
      <select id="secure" name="secure">
        <option value="starttls" ${mail.secure === 'starttls' ? 'selected' : ''}>STARTTLS (meist Port 587)</option>
        <option value="tls" ${mail.secure === 'tls' ? 'selected' : ''}>TLS (meist Port 465)</option>
        <option value="none" ${mail.secure === 'none' ? 'selected' : ''}>Keine (nur Mailserver auf demselben Rechner)</option>
      </select>
    </details>
    <button class="btn" type="submit">Speichern</button>
  </form>
  <p class="small muted">Hinweis: Proton bietet SMTP-Tokens nur für Adressen mit eigener Domain in bestimmten Tarifen an.</p>
  ${mail.active ? html`<form class="form danger" method="post" action="/admin/testmail">
    <label for="to">Testmail an</label>
    <input id="to" name="to" type="email" required maxlength="254" value="${mail.address}">
    <button class="btn small" type="submit">Testmail senden</button>
  </form>` : ''}
  ${mail.fromOrga ? html`<form method="post" action="/admin/mail" data-confirm="Mail-Einstellungen samt Token löschen?">
    <input type="hidden" name="remove" value="1">
    <button class="btn small ghost" type="submit">Mail-Einstellungen löschen</button>
  </form>` : ''}
</section>

<section class="panel" id="bescherung"><h2>3 · Bescherung</h2>
  <form class="form" method="post" action="/admin/settings">
    <label for="eventDate">Bescherung (Datum, Ort)</label>
    <input id="eventDate" name="eventDate" type="text" maxlength="60" value="${s.eventDate}" placeholder="z. B. 20.12., 18 Uhr im Büro">
    <label for="budget">Budget</label>
    <input id="budget" name="budget" type="text" maxlength="30" value="${s.budget}" placeholder="z. B. 15 €">
    <label for="info">Infos für alle</label>
    <textarea id="info" name="info" rows="4" maxlength="600" placeholder="z. B. Bitte nichts Selbstgebackenes mit Nüssen.">${s.info}</textarea>
    <button class="btn" type="submit">Speichern</button>
  </form>
</section>

<section class="panel" id="passwort"><h2>4 · Seiten-Passwort</h2>
  <p>${s.sitePassword
    ? html`<span class="tag ok">An</span> Wer die Seite öffnet, gibt zuerst das Passwort ein – erst dann geht die Anmeldung.`
    : html`<span class="tag">Aus</span> Die Seite ist für alle offen, die die Adresse kennen.`}</p>
  <p class="small muted">Schick das Passwort mit der Einladung mit. Persönliche Links funktionieren auch ohne Passwort.</p>
  <form class="form" method="post" action="/admin/sitepassword">
    <label for="sitePassword">${s.sitePassword ? 'Neues Passwort' : 'Passwort'}</label>
    <input id="sitePassword" name="sitePassword" type="text" required minlength="4" maxlength="100" autocomplete="off" spellcheck="false" placeholder="z. B. Lebkuchen24">
    <button class="btn small" type="submit">${s.sitePassword ? 'Passwort ändern' : 'Passwort setzen'}</button>
  </form>
  ${s.sitePassword ? html`<form method="post" action="/admin/sitepassword" data-confirm="Seiten-Passwort entfernen? Dann kann jede Person mit der Adresse die Seite sehen.">
    <input type="hidden" name="remove" value="1">
    <button class="btn small ghost" type="submit">Passwort entfernen</button>
  </form>` : ''}
</section>`,
  });
}

export function adminNewLink({ name, link }) {
  return layout({
    title: 'Neuer Link',
    body: panel('Neuer Link', html`
      <p>Neuer persönlicher Link für <b>${name}</b>. Der alte funktioniert nicht mehr.</p>
      ${copyBox('newlink', link)}
      <p class="note">Gib den Link ungeöffnet weiter – wenn du ihn öffnest, siehst du das Los.</p>
      <p><a class="btn small" href="/admin">Zurück</a></p>`),
  });
}
