// Mini-Templating: alles, was in html`...` eingesetzt wird, ist automatisch escaped.
const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

export class Raw {
  constructor(value) { this.value = value; }
  toString() { return this.value; }
}

export const escape = (s) => String(s).replace(/[&<>"']/g, (c) => ESC[c]);
export const raw = (s) => new Raw(String(s));

function render(v) {
  if (v == null || v === false) return '';
  if (v instanceof Raw) return v.value;
  if (Array.isArray(v)) return v.map(render).join('');
  return escape(v);
}

export function html(strings, ...values) {
  let out = strings[0];
  values.forEach((v, i) => { out += render(v) + strings[i + 1]; });
  return new Raw(out);
}
