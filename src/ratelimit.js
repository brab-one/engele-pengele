// Einfaches Zeitfenster-Limit pro Schlüssel (z. B. IP-Adresse), nur im Speicher.
export class RateLimit {
  constructor(max, windowMs) {
    this.max = max;
    this.windowMs = windowMs;
    this.hits = new Map();
  }

  take(key) {
    const now = Date.now();
    let h = this.hits.get(key);
    if (!h || h.reset <= now) {
      h = { n: 0, reset: now + this.windowMs };
      this.hits.set(key, h);
    }
    h.n++;
    if (this.hits.size > 50_000) this.sweep();
    return h.n <= this.max;
  }

  sweep() {
    const now = Date.now();
    for (const [k, h] of this.hits) if (h.reset <= now) this.hits.delete(k);
  }
}
