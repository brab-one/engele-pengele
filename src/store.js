import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { open, rename } from 'node:fs/promises';
import path from 'node:path';

const empty = () => ({
  version: 1,
  settings: { open: true, eventDate: '', budget: '', info: '', deadline: '', sitePassword: null },
  participants: [],
  drawnAt: null,
  admin: null,
  mail: null,
  secret: null,
});

// Kleine JSON-Datenbank: alle Änderungen laufen nacheinander und werden atomar
// (temporäre Datei + rename) geschrieben, die Datei ist nur für den Server lesbar.
export class Store {
  #queue = Promise.resolve();

  constructor(dir) {
    mkdirSync(dir, { recursive: true, mode: 0o700 });
    this.file = path.join(dir, 'engele.json');
    const base = empty();
    if (existsSync(this.file)) {
      const loaded = JSON.parse(readFileSync(this.file, 'utf8'));
      this.data = { ...base, ...loaded, settings: { ...base.settings, ...loaded.settings } };
    } else {
      this.data = base;
    }
  }

  get() {
    return this.data;
  }

  // fn bekommt eine Kopie der Daten, ändert sie und darf einen Wert zurückgeben.
  // Wirft fn, bleibt alles wie es war.
  update(fn) {
    const run = this.#queue.then(async () => {
      const draft = structuredClone(this.data);
      const result = fn(draft);
      await this.#write(draft);
      this.data = draft;
      return result;
    });
    this.#queue = run.catch(() => {});
    return run;
  }

  async #write(data) {
    const tmp = `${this.file}.tmp`;
    const fh = await open(tmp, 'w', 0o600);
    try {
      await fh.writeFile(JSON.stringify(data, null, 1));
      await fh.sync();
    } finally {
      await fh.close();
    }
    await rename(tmp, this.file);
  }
}
