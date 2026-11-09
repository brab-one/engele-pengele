// Erzeugt die Pixel-Grafiken in public/img aus ASCII-Vorlagen.
// Aufruf: npm run sprites
import { mkdirSync, writeFileSync } from 'node:fs';

const OUT = new URL('../public/img/', import.meta.url);

const PAL = {
  y: '#fee761', Y: '#feae34', o: '#f77622',          // Gold
  R: '#e43b44', r: '#a22633',                        // Rot
  G: '#3e8948', g: '#265c42',                        // Grün
  S: '#ead4aa', s: '#e4a672', H: '#c28569',          // Haut, Haar
  K: '#181425',                                      // Augen
  W: '#ffffff', w: '#c0cbdc', C: '#f4ecd8',          // Weiß, Creme
  B: '#2ce8f5', b: '#0099db',                        // Eisblau
  T: '#733e39',                                      // Stamm
  N: '#dfe8f5',                                      // Schnee am Boden
  O: '#4b1d2a', D: '#03040c',                        // Logo-Kontur, Schatten
  F: '#6b3e2e', f: '#9a5a3c', h: '#e8d6b0', E: '#ff2a2a', // Krampus: Fell, Hörner, Augen
  M: '#5a6988', m: '#8b9bb4', X: '#262b44',          // Engels-Blaster
  A: '#6b7d33', a: '#3f4a1d',                        // Stahlhelm
  P: '#c4302b', V: '#68386c',                        // Satan: Haut, Anzug
};

function toSvg(rows, scale = 4) {
  const w = rows[0].length;
  const h = rows.length;
  const paths = new Map();
  rows.forEach((row, y) => {
    if (row.length !== w) throw new Error(`Zeile ${y} ist ${row.length} breit statt ${w}: "${row}"`);
    for (let x = 0; x < w;) {
      const c = row[x];
      if (c === '.') { x++; continue; }
      if (!PAL[c]) throw new Error(`Unbekannte Farbe "${c}" in Zeile ${y}`);
      let end = x;
      while (end < w && row[end] === c) end++;
      const d = paths.get(c) ?? [];
      d.push(`M${x} ${y}h${end - x}v1h-${end - x}z`);
      paths.set(c, d);
      x = end;
    }
  });
  const body = [...paths].map(([c, d]) => `<path fill="${PAL[c]}" d="${d.join('')}"/>`).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w * scale}" height="${h * scale}" shape-rendering="crispEdges">${body}</svg>\n`;
}

// --- Sprites ---------------------------------------------------------------

const angel = [
  '................',
  '.....yYYYYy.....',
  '....Y......Y....',
  '.....YYYYYY.....',
  '......HHHH......',
  '.....HSSSSH.....',
  '.....HKSSKH.....',
  '......SssS......',
  '.WW....RR....WW.',
  'WWWW..RRRR..WWWW',
  'wWWWWRRRRRRWWWWw',
  '.wWWRRRRRRRRWWw.',
  '..wwRRRYYRRRww..',
  '....RRRRRRRR....',
  '...rRRRRRRRRr...',
  '...rrrrrrrrrr...',
];

// Die Engel oben gibt es in drei Zuständen, alle 20×16, damit sie beim Wechsel nicht springen:
// friedlich → Helm auf → Blaster gezogen (Mündung: Spalte 19, Zeile 10; Helm: Spalten 4–11, Zeilen 3–5)
const angelCalm = angel.map((row) => `${row}....`);

const helmetHead = [
  '.....yYYYYy.........',
  '....Y......Y........',
  '.....YYYYYY.........',
  '......AAAA..........',
  '.....AAAAAA.........',
  '....aaaaaaaa........',
  '.....HSKSKH.........',
  '......SssS..........',
];

const angelHelmet = [
  ...helmetHead,
  '.WW....RR....WW.....',
  'WWWW..RRRR..WWWW....',
  'wWWWWRRRRRRWWWWw....',
  '.wWWRRRRRRRRWWw.....',
  '..wwRRRYYRRRww......',
  '....RRRRRRRR........',
  '...rRRRRRRRRr.......',
  '...rrrrrrrrrr.......',
];

const angelGun = [
  ...helmetHead,
  '.WW....RR....WW.....',
  'WWWW..RRRR..WWWWmmm.',
  'wWWWWRRRRRRSSMMMMMMX',
  '.wWWRRRRRRRRWMMw....',
  '..wwRRRYYRRRwMM.....',
  '....RRRRRRRR........',
  '...rRRRRRRRRr.......',
  '...rrrrrrrrrr.......',
];

// Scharfschützengewehr, zeigt nach rechts (Mündung: Spalte 17, Zeile 2)
const sniper = [
  '......XmmmmX......',
  '.......X..X.......',
  'TTTTMMMMMMMMMMMMMX',
  'TTT..MM...........',
  'TT...M............',
];

// der Helm, der von oben auf den Kopf fällt
const helmet = [
  '..AAAA..',
  '.AAAAAA.',
  'aaaaaaaa',
];

const krampus = [
  'h..............h',
  'hh............hh',
  '.hh..........hh.',
  '..hhFFFFFFFFhh..',
  '...FFFFFFFFFF...',
  '..FFfFFFFFFfFF..',
  '..FFEEFFFFEEFF..',
  '..FFFFFFFFFFFF..',
  '..FfFWKKKKWFfF..',
  '...FFKRRRRKFF...',
  '..FFFFFRRFFFFF..',
  '.FFFFFFRRFFFFFF.',
  'FFFFFFFRrFFFFFFF',
  'FF.FFFFFFFFFF.FF',
  '...FFF....FFF...',
  '...KKK....KKK...',
];

const boom = [
  '......y.........',
  '...y..Y...y.....',
  '....YyYYyY...y..',
  '.y..YoooooY.....',
  '..YYoRRRRRoYY...',
  '...YoRRWWRRoY.y.',
  'yYYoRRWWWWRRoYYy',
  '..YoRRWWWWWRRoY.',
  '..YoRRWWWWRRoY..',
  '.YYoRRRWWRRRoYY.',
  '...YoRRRRRRoY...',
  '..y.YooooooY.y..',
  '....YYyYYyYY....',
  '..y...Y..Y...y..',
  '......y.........',
  '................',
];

// Weihnachtsmann im Schlitten, fliegt nach rechts
const santa = [
  '........RRRR............',
  '.......RRRRRW...........',
  '......RRRRRRR...........',
  '......WWWWWWW...........',
  '......SSSKSSS...........',
  '.....WWSSSSSWW..........',
  '....RWWWWWWWWWR.........',
  '...RRRWWWWWWWRRRS.......',
  'Y..RRRRWWWWWRRRR........',
  `RY.${'R'.repeat(17)}.RR.`,
  `.${'R'.repeat(22)}.`,
  `..RR${'Y'.repeat(15)}RRR..`,
  `...${'r'.repeat(18)}...`,
  `.${'Y'.repeat(23)}`,
];

// …und so sieht er aus, wenn er Bomben wirft
const satan = [
  '.....h.....h............',
  '.....hh...hh............',
  '......PPPPPP............',
  '.....PPPPPPPP...........',
  '.....PPPyPPyP...........',
  '.....PPPPPPPP...........',
  '.....PPKWWWKP...........',
  '....VVPKKKKPVV..........',
  'o..VVVVVVVVVVVP.........',
  `oo.${'r'.repeat(17)}.rr.`,
  `.${'r'.repeat(22)}.`,
  `..rr${'o'.repeat(15)}rrr..`,
  `...${'R'.repeat(18)}...`,
  `.${'o'.repeat(23)}`,
];

const bomb = [
  '......yo',
  '.....Y..',
  '..XXXX..',
  '.XMMMMX.',
  '.XmMMMX.',
  '.XMMMMX.',
  '.XMMMMX.',
  '..XXXX..',
];

const stump = [
  ...Array(9).fill('................'),
  '.......w........',
  '......w.w.......',
  '.......w........',
  '......XTTX......',
  '.......TT.......',
  '.....XTTTTX.....',
  '....XXTTTTXX....',
];

const gift = [
  '................',
  '...yy......yy...',
  '..Y..Y....Y..Y..',
  '..Y...Y..Y...Y..',
  '...YY..YY..YY...',
  '.....YYYYYY.....',
  '.RRRRRRYYRRRRRR.',
  '.RRRRRRYYRRRRRR.',
  '.rrrrrrYYrrrrrr.',
  '..GGGGGYYGGGGG..',
  '..GGGGGYYGGGGG..',
  '..GGGGGYYGGGGG..',
  '..GGGGGYYGGGGG..',
  '..GGGGGYYGGGGG..',
  '..gggggYYggggg..',
  '................',
];

const tree = [
  '.......yy.......',
  '......yYYy......',
  '.......GG.......',
  '......GGGg......',
  '.....GGRGGg.....',
  '....GGGGGYGg....',
  '.....GGGGGg.....',
  '....GGYGGGGg....',
  '...GGGGGGRGGg...',
  '....GGGGGGGg....',
  '...GGRGGGGGGg...',
  '..GGGGGGGYGGGg..',
  '.GGGYGGGGGGGRGg.',
  '.......TT.......',
  '.......TT.......',
  '......TTTT......',
];

const star = [
  '.......y.......',
  '......yYo......',
  '......yYo......',
  '.....yYYYo.....',
  'yyyyyYYYYYYoooo',
  '.yYYYYYYYYYYYo.',
  '..yYYYYYYYYYo..',
  '...yYYYYYYYo...',
  '...yYYYYYYYo...',
  '..yYYYo.yYYYo..',
  '..yYYo...yYYo..',
  '.yYo.......yYo.',
  '.yo.........yo.',
];

const letter = [
  'CCCCCCCCCCCCCCCC',
  'wCCCCCCCCCCCCCCw',
  'CwCCCCCCCCCCCCwC',
  'CCwCCCCCCCCCCwCC',
  'CCCwCCCCCCCCwCCC',
  'CCCCwCCCCCCwCCCC',
  'CCCCCwCRRCwCCCCC',
  'CCCCCCwRRwCCCCCC',
  'CCCCCCCCCCCCCCCC',
  'CCCCCCCCCCCCCCCC',
  'CCCCCCCCCCCCCCCC',
  'wwwwwwwwwwwwwwww',
];

const snowcap = [
  '......NNN.......',
  '..NNNNNNNNN...NN',
  'NNNNNNNNNNNNNNNN',
  'NNNNNNNNNNNNNNNN',
];

// --- Logo aus einer 5×7-Pixelschrift -----------------------------------------

const FONT = {
  E: ['#####', '#....', '#....', '####.', '#....', '#....', '#####'],
  N: ['#...#', '#...#', '##..#', '#.#.#', '#..##', '#...#', '#...#'],
  G: ['.###.', '#...#', '#....', '#.###', '#...#', '#...#', '.###.'],
  L: ['#....', '#....', '#....', '#....', '#....', '#....', '#####'],
  P: ['####.', '#...#', '#...#', '####.', '#....', '#....', '#....'],
};

function logo() {
  const word = (text) => FONT.E.map((_, y) => [...text].map((ch) => FONT[ch][y]).join('.'));
  const lines = [
    { mask: word('PENGELE'), colors: 'yyYYYoo' },
    { mask: word('ENGELE'), colors: 'WWBBBbb' },
  ];
  const inner = Math.max(...lines.map((l) => l.mask[0].length));
  const gap = 3;
  const width = inner + 3;
  const height = 7 * lines.length + gap * (lines.length - 1) + 3;
  const grid = Array.from({ length: height }, () => Array(width).fill('.'));
  const lit = [];
  lines.forEach((l, i) => {
    const ox = 1 + Math.floor((inner - l.mask[0].length) / 2);
    const oy = 1 + i * (7 + gap);
    l.mask.forEach((row, y) => [...row].forEach((c, x) => {
      if (c === '#') lit.push([ox + x, oy + y, l.colors[y]]);
    }));
  });
  const ring = (fn) => { for (const [x, y] of lit) for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) fn(x + dx, y + dy); };
  const set = (x, y, c) => { if (x >= 0 && y >= 0 && x < width && y < height) grid[y][x] = c; };
  ring((x, y) => set(x + 1, y + 1, 'D')); // Schlagschatten
  ring((x, y) => set(x, y, 'O'));         // Kontur
  for (const [x, y, c] of lit) set(x, y, c);
  return grid.map((r) => r.join(''));
}

// --- Kacheln für Sternenhimmel und Schneefall -------------------------------

function mulberry32(seed) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function scatter(size, count, seed, pick) {
  const rnd = mulberry32(seed);
  const grid = Array.from({ length: size }, () => Array(size).fill('.'));
  for (let i = 0; i < count; i++) {
    const x = Math.floor(rnd() * size);
    const y = Math.floor(rnd() * size);
    const { color, big } = pick(rnd);
    grid[y][x] = color;
    if (big) {
      grid[y][(x + 1) % size] = color;
      grid[(y + 1) % size][x] = color;
      grid[(y + 1) % size][(x + 1) % size] = color;
    }
  }
  return grid.map((r) => r.join(''));
}

const stars = scatter(48, 16, 7, (rnd) => {
  const r = rnd();
  return { color: r < 0.7 ? 'C' : r < 0.88 ? 'y' : 'B', big: false };
});

const snow = scatter(64, 14, 2026, (rnd) => ({ color: rnd() < 0.6 ? 'W' : 'w', big: rnd() < 0.12 }));

// --- Ausgabe ----------------------------------------------------------------

mkdirSync(OUT, { recursive: true });
const files = { angel, 'angel-calm': angelCalm, 'angel-helmet': angelHelmet, 'angel-gun': angelGun, helmet, sniper, krampus, boom, santa, satan, bomb, stump, gift, tree, star, letter, snowcap, logo: logo(), stars, snow };
for (const [name, rows] of Object.entries(files)) {
  writeFileSync(new URL(`${name}.svg`, OUT), toSvg(rows));
  console.log(`public/img/${name}.svg  ${rows[0].length}×${rows.length}`);
}
