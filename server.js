import { createApp } from './src/app.js';
import { loadConfig } from './src/config.js';

const cfg = loadConfig(process.env);
const app = await createApp(cfg);

app.server.listen(cfg.port, cfg.host, () => {
  console.log(`Pengele Engele läuft: http://${cfg.host}:${cfg.port}  (öffentlich: ${cfg.baseUrl})`);
  console.log(`Orga-Bereich: ${cfg.baseUrl}/admin`);
  if (!app.mailer) console.log('Kein Mailserver eingerichtet – Teilnehmende sehen ihr Los nur über ihren persönlichen Link.');
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => app.close().then(() => process.exit(0)));
}
