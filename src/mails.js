// Texte der E-Mails (Klartext, UTF-8).
const SIGNATURE = '\n\nFrohes Schenken!\nPengele Engele\n';

function facts(s) {
  const lines = [];
  if (s.eventDate) lines.push(`Bescherung: ${s.eventDate}`);
  if (s.budget) lines.push(`Budget: ${s.budget}`);
  return lines.length ? `\n\n${lines.join('\n')}` : '';
}

const when = (iso) => `${new Date(iso).toLocaleString('de-AT', { dateStyle: 'medium', timeStyle: 'short' })} Uhr`;

export function welcome(p, link, s = {}) {
  const draw = s.deadline
    ? `Anmeldeschluss ist am ${when(s.deadline)}. Dann wird automatisch gelost und du bekommst eine E-Mail mit deinem Los.`
    : 'Sobald gelost ist, bekommst du eine E-Mail mit deinem Los.';
  return {
    to: p.email,
    subject: 'Du bist dabei – Pengele Engele',
    text: `Hallo ${p.name},

du bist beim Pengele Engele dabei!

Dein persönlicher Link:
${link}

Dort siehst du nach der Ziehung, wen du beschenkst. ${draw}

Du hast dich gar nicht angemeldet? Über den Link kannst du dich wieder abmelden.${SIGNATURE}`,
  };
}

export function drawResult(p, receiver, s) {
  return {
    to: p.email,
    subject: 'Dein Los ist gezogen – Pengele Engele',
    text: `Hallo ${p.name},

die Ziehung ist gelaufen. Du beschenkst:

    ★ ${receiver.name} ★${facts(s)}${s.info ? `\n\n${s.info}` : ''}

Dein Los steht auch hinter deinem persönlichen Link aus der Anmelde-Mail.

Psst – nicht verraten!${SIGNATURE}`,
  };
}

export function newLink(p, link) {
  return {
    to: p.email,
    subject: 'Dein neuer Link – Pengele Engele',
    text: `Hallo ${p.name},

hier ist dein neuer persönlicher Link:
${link}

Der alte Link funktioniert ab jetzt nicht mehr.

Du hast keinen neuen Link angefordert? Dann kannst du diese E-Mail ignorieren.${SIGNATURE}`,
  };
}

export function test(to, baseUrl) {
  return {
    to,
    subject: 'Testmail – Pengele Engele',
    text: `Hallo!

Wenn du das liest, funktioniert der Mailversand von ${baseUrl}.${SIGNATURE}`,
  };
}
