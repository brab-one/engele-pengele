// Kleine Extras – die Seite funktioniert auch ohne JavaScript.

// --- Link kopieren -------------------------------------------------------------

for (const btn of document.querySelectorAll('[data-copy]')) {
  btn.hidden = false;
  btn.addEventListener('click', async () => {
    const field = document.getElementById(btn.dataset.copy);
    try {
      await navigator.clipboard.writeText(field.value);
    } catch {
      field.select();
      document.execCommand('copy');
    }
    btn.textContent = 'Kopiert ✓';
    setTimeout(() => { btn.textContent = 'Kopieren'; }, 2000);
  });
}

// --- Rückfragen vor dem Abschicken -------------------------------------------------

document.addEventListener('submit', (event) => {
  const question = event.target.dataset.confirm;
  if (question && !window.confirm(question)) event.preventDefault();
});

// --- Countdown bis zur Ziehung ------------------------------------------------------

{
  const pad = (n) => String(n).padStart(2, '0');
  const counters = [...document.querySelectorAll('[data-countdown]')];
  const tick = () => {
    for (const el of counters) {
      let s = Math.max(0, Math.floor((Date.parse(el.dataset.countdown) - Date.now()) / 1000));
      if (s === 0) { el.textContent = 'Jetzt!'; continue; }
      const days = Math.floor(s / 86400);
      s %= 86400;
      const time = `${pad(Math.floor(s / 3600))}:${pad(Math.floor(s / 60) % 60)}:${pad(s % 60)}`;
      el.textContent = days ? `${days}T ${time}` : time;
    }
  };
  if (counters.length) { tick(); setInterval(tick, 1000); }
}

// --- Krampus-Jagd, Weihnachtsmann und Boss-Krampus -------------------------------------
// Ab und zu passiert eine von drei Szenen:
//   1. Ein Krampus fliegt vorbei – der Engel oben setzt den Helm auf, zieht den Blaster und schießt.
//   2. Der Weihnachtsmann fliegt vorbei, quatscht, wird zwischendurch zu Satan und bombardiert den Wald.
//   3. Ein großer Boss-Krampus – der Engel holt das Scharfschützengewehr, und man darf mitschießen.
// Reine Deko: nur der Boss fängt Klicks ab. Im Fußbereich abschaltbar, bei "weniger Bewegung" aus.
// Zum Ausprobieren: Adresse mit #krampus, #santa oder #boss öffnen.

(() => {
  if (location.pathname.startsWith('/admin')) return;

  const saved = {
    get(key) { try { return localStorage.getItem(key); } catch { return null; } },
    set(key, value) { try { localStorage.setItem(key, value); } catch { /* egal */ } },
  };
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let enabled = saved.get('pe-game') ? saved.get('pe-game') === 'on' : !reduceMotion;
  const stats = { krampus: Number(saved.get('pe-krampus')) || 0, boss: Number(saved.get('pe-boss')) || 0 };

  const rand = (a, b) => a + Math.random() * (b - a);
  const pick = (list) => list[Math.floor(Math.random() * list.length)];
  const W = () => innerWidth;
  const H = () => innerHeight;

  // --- Bühne ---

  const arena = document.createElement('div');
  arena.className = 'arena';
  arena.setAttribute('aria-hidden', 'true');
  document.body.append(arena);

  function add(cls, src, w, h) {
    let el;
    if (src) {
      el = new Image(w, h);
      el.src = src;
      el.alt = '';
      el.draggable = false;
    } else {
      el = document.createElement('div');
    }
    el.className = cls;
    arena.append(el);
    return el;
  }
  const put = (el, x, y, extra = '') => { el.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)${extra}`; };

  function popup(text, x, y, cls = '') {
    const el = add(`ko ${cls}`);
    el.textContent = text;
    put(el, Math.min(Math.max(8, x), W() - 40 - text.length * 10), Math.max(8, y));
    setTimeout(() => el.remove(), 1300);
  }

  function explode(x, y, size) {
    const el = add('boom', '/img/boom.svg', size, size);
    put(el, x - size / 2, y - size / 2);
    setTimeout(() => el.remove(), 650);
  }

  // --- Der Wald unten: einzelne Bäume, damit sie getroffen werden können ---

  const forest = document.querySelector('.forest');
  const trees = [];
  function plantForest() {
    if (!forest) return;
    forest.classList.add('live');
    const need = Math.ceil(forest.clientWidth / 32) + 1; // Bäume sind 32–48 px breit
    while (trees.length < need) {
      const tree = new Image(48, 48);
      tree.src = '/img/tree.svg';
      tree.alt = '';
      forest.append(tree);
      trees.push(tree);
    }
  }
  plantForest();
  addEventListener('resize', plantForest);

  function standingTrees() {
    return trees.filter((t) => {
      const r = t.getBoundingClientRect();
      return !t.dataset.burnt && r.left > 0 && r.right < W() && r.top < H() - 16 && r.bottom > 0;
    });
  }

  // Explosion direkt auf dem Baum (scrollt mit dem Wald mit)
  function burn(tree) {
    if (tree.dataset.burnt) return;
    tree.dataset.burnt = '1';
    [[0, 96, 0], [140, 64, -16], [260, 56, 18]].forEach(([delay, size, dx]) => {
      setTimeout(() => {
        const boom = new Image(size, size);
        boom.src = '/img/boom.svg';
        boom.alt = '';
        boom.className = 'tree-boom';
        boom.style.left = `${tree.offsetLeft + tree.offsetWidth / 2 - size / 2 + dx}px`;
        boom.style.bottom = `${Math.round((tree.offsetHeight - size) / 2) + 4}px`;
        forest.append(boom);
        setTimeout(() => boom.remove(), 650);
      }, delay);
    });
    setTimeout(() => { tree.src = '/img/stump.svg'; }, 150);
    setTimeout(() => {
      tree.src = '/img/tree.svg';
      delete tree.dataset.burnt;
      tree.classList.remove('regrow');
      void tree.offsetWidth;
      tree.classList.add('regrow');
    }, rand(20000, 40000));
  }

  // --- Engel ---

  const pageAngels = [...document.querySelectorAll('.gunner')];
  for (const el of pageAngels) {
    el.dataset.calm = el.getAttribute('src');
    el.dataset.flip0 = el.classList.contains('flip') ? '1' : '0';
  }
  function restoreAngel(el) {
    el.src = el.dataset.calm;
    el.classList.toggle('flip', el.dataset.flip0 === '1');
  }
  const centerX = (el) => { const r = el.getBoundingClientRect(); return r.left + r.width / 2; };

  // Ein Engel auf der Seite …
  function pageShooter(el) {
    let restoreTimer = null;
    return {
      rect: () => el.getBoundingClientRect(),
      flipped: () => el.classList.contains('flip'),
      face(x) { el.classList.toggle('flip', x < centerX(el)); },
      sprite(name) { clearTimeout(restoreTimer); el.src = `/img/${name}.svg`; },
      ready: () => true,
      update() {},
      leave() { restoreTimer = setTimeout(() => restoreAngel(el), 1500); },
      gone: () => true,
      remove() { clearTimeout(restoreTimer); restoreAngel(el); },
    };
  }

  // … oder, wenn keiner im Bild ist, einer, der von unten hereinfliegt.
  function flyerShooter(size, fromLeft) {
    const w = size * 1.25;
    const f = {
      el: add('', '/img/angel-calm.svg', w, size),
      x: fromLeft ? rand(W() * 0.55, W() - w - 10) : rand(10, Math.max(10, W() * 0.45 - w)),
      y: H() + 10,
      targetY: H() - size - rand(H() * 0.12, H() * 0.25),
      flip: false,
      leaving: false,
    };
    return {
      rect: () => ({ left: f.x, top: f.y, width: w, height: size }),
      flipped: () => f.flip,
      face(x) { f.flip = x < f.x + w / 2; },
      sprite(name) { if (f.el) f.el.src = `/img/${name}.svg`; },
      ready: () => !f.leaving && Math.abs(f.y - f.targetY) < 8,
      update(dt) {
        if (!f.el) return;
        if (f.leaving) f.y += 320 * dt;
        else f.y += (f.targetY - f.y) * Math.min(1, dt * 5);
        put(f.el, f.x, f.y, f.flip ? ' scaleX(-1)' : '');
        if (f.leaving && f.y > H() + 20) { f.el.remove(); f.el = null; }
      },
      leave() { f.leaving = true; },
      gone: () => !f.el,
      remove() { f.el?.remove(); f.el = null; },
    };
  }

  function makeShooter(size, nearX, fromLeft) {
    const visible = pageAngels.filter((el) => {
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.bottom > 0 && r.top < H();
    });
    if (!visible.length) return flyerShooter(size, fromLeft);
    visible.sort((a, b) => Math.abs(centerX(a) - nearX) - Math.abs(centerX(b) - nearX));
    return pageShooter(visible[0]);
  }

  // Ausrüsten: "!" – Helm fällt auf den Kopf (KLONK) – Waffe ziehen.
  // Helm im Sprite: Spalten 4–11, Zeilen 3–5. Blaster-Mündung: Spalte 19, Zeile 10.
  function gearUp(shooter, weapon) {
    let t = 0;
    let alerted = false;
    let helmet = null;
    let fromY = 0;
    let landedAt = -1;
    let armed = false;
    let rifle = null;
    let aim = 0;

    // Das Gewehr dreht sich um den Griff (Spalte 5, Zeile 2.5 im 18×5-Sprite), der in der Hand
    // des Engels liegt (Spalte 11 bzw. gespiegelt 9, Zeile 10.5), und zielt direkt aufs Ziel.
    function pivot() {
      const r = shooter.rect();
      const s = r.width / 20;
      return { x: r.left + (shooter.flipped() ? 9 : 11) * s, y: r.top + 10.5 * s, s };
    }
    function placeRifle(targetX, targetY) {
      if (!rifle) return;
      const p = pivot();
      aim = Math.atan2(targetY - p.y, targetX - p.x);
      const pointsLeft = Math.abs(aim) > Math.PI / 2;
      rifle.style.transformOrigin = `${5 * p.s}px ${2.5 * p.s}px`;
      put(rifle, p.x - 5 * p.s, p.y - 2.5 * p.s, ` rotate(${aim}rad)${pointsLeft ? ' scaleY(-1)' : ''}`);
    }

    return {
      get armed() { return armed; },
      update(dt, targetX, targetY = 0) {
        if (!shooter.ready()) return;
        shooter.face(targetX);
        const r = shooter.rect();
        const s = r.width / 20;
        if (!alerted) { alerted = true; popup('!', r.left + r.width * 0.3, r.top - 34, 'alert'); }
        if (armed) { placeRifle(targetX, targetY); return; }
        t += dt;
        const hx = r.left + (shooter.flipped() ? 8 : 4) * s;
        const hy = r.top + 3 * s;
        if (t > 0.35 && landedAt < 0 && !helmet) {
          helmet = add('', '/img/helmet.svg', 8 * s, 3 * s);
          fromY = Math.max(-40, hy - 170);
        }
        if (helmet) {
          const p = Math.min(1, (t - 0.35) / 0.4);
          put(helmet, hx, fromY + (hy - fromY) * p * p);
          if (p >= 1) {
            helmet.remove();
            helmet = null;
            landedAt = t;
            shooter.sprite('angel-helmet');
            popup('KLONK!', r.left, r.top - 26, 'small');
          }
        }
        if (landedAt >= 0 && t > landedAt + 0.45) {
          armed = true;
          if (weapon === 'sniper') { rifle = add('', '/img/sniper.svg', 18 * s, 5 * s); placeRifle(targetX, targetY); }
          else shooter.sprite('angel-gun');
        }
      },
      muzzle() {
        if (weapon === 'sniper') {
          // Mündung: 12.5 Pixel vom Griff entlang der Zielrichtung
          const p = pivot();
          return { x: p.x + Math.cos(aim) * 12.5 * p.s, y: p.y + Math.sin(aim) * 12.5 * p.s };
        }
        const r = shooter.rect();
        const s = r.width / 20;
        const left = shooter.flipped();
        return { x: left ? r.left + 0.5 * s : r.left + 19.5 * s, y: r.top + 10.5 * s };
      },
      disarm() { helmet?.remove(); rifle?.remove(); helmet = null; rifle = null; },
    };
  }

  // --- Schalter im Fußbereich ---

  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.className = 'game-toggle';
  function label() {
    const parts = [`Krampus-Jagd: ${enabled ? 'an' : 'aus'}`];
    if (stats.krampus) parts.push(`${stats.krampus} Krampus${stats.krampus === 1 ? '' : 'se'}`);
    if (stats.boss) parts.push(`${stats.boss} Boss${stats.boss === 1 ? '' : 'e'}`);
    toggle.textContent = parts.join(' · ');
    toggle.setAttribute('aria-pressed', String(enabled));
  }
  label();
  toggle.addEventListener('click', () => {
    enabled = !enabled;
    saved.set('pe-game', enabled ? 'on' : 'off');
    label();
    if (enabled) schedule(1500); else stop();
  });
  const holder = document.createElement('p');
  holder.className = 'small';
  holder.append(toggle);
  document.querySelector('.snowfield')?.append(holder);

  // --- Szene 1: Krampus ---

  function krampusScene() {
    const size = W() < 600 ? 48 : 64;
    const fromLeft = Math.random() < 0.5;
    const k = {
      el: add('', '/img/krampus.svg', size, size),
      x: fromLeft ? -size : W(),
      y: rand(H() * 0.1, H() * 0.45),
      vx: (fromLeft ? 1 : -1) * rand(110, 160),
      vy: 0, rot: 0, t: 0, alive: true,
    };
    const shooter = makeShooter(size, fromLeft ? 0 : W(), fromLeft);
    const gear = gearUp(shooter, 'gun');
    const bullets = [];
    let cooldown = 0.15;
    let shots = 0;
    let after = 0;
    let gone = false;

    function fire() {
      const m = gear.muzzle();
      const speed = 720;
      let tx = k.x + size / 2;
      let ty = k.y + size / 2;
      tx += k.vx * (Math.hypot(tx - m.x, ty - m.y) / speed); // vorhalten
      if (shots === 0 && Math.random() < 0.5) ty += (Math.random() < 0.5 ? -1 : 1) * size * 1.1; // daneben!
      const angle = Math.atan2(ty - m.y, tx - m.x);
      bullets.push({ el: add('bullet'), x: m.x, y: m.y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, angle });
      shots++;
    }

    function removeBullet(b) {
      b.el.remove();
      bullets.splice(bullets.indexOf(b), 1);
    }

    return {
      update(dt) {
        if (k.el) {
          if (k.alive) {
            k.t += dt;
            k.x += k.vx * dt;
            put(k.el, k.x, k.y + (Math.floor(k.t * 5) % 2 ? -4 : 0));
            if (k.x > W() + size || k.x < -size * 2) { k.el.remove(); k.el = null; }
          } else {
            k.vy += 1100 * dt;
            k.y += k.vy * dt;
            k.x += k.vx * 0.25 * dt;
            k.rot += 600 * dt;
            put(k.el, k.x, k.y, ` rotate(${Math.round(k.rot / 45) * 45}deg)`);
            if (k.y > H() + size) { k.el.remove(); k.el = null; }
          }
        }

        shooter.update(dt);
        if (k.el && k.alive) {
          gear.update(dt, k.x + size / 2);
          cooldown -= dt;
          const inView = k.x > 0 && k.x < W() - size;
          if (gear.armed && cooldown <= 0 && inView && shots < 4) { fire(); cooldown = rand(0.45, 0.8); }
        }

        for (const b of [...bullets]) {
          b.x += b.vx * dt;
          b.y += b.vy * dt;
          put(b.el, b.x - 5, b.y - 2, ` rotate(${b.angle}rad)`);
          const pad = size * 0.18;
          if (k.el && k.alive && b.x > k.x + pad && b.x < k.x + size - pad && b.y > k.y + pad && b.y < k.y + size - pad) {
            k.alive = false;
            k.vy = -260;
            explode(b.x, b.y, size * 1.3);
            popup('K.O.!', k.x, k.y - 16);
            stats.krampus++;
            saved.set('pe-krampus', String(stats.krampus));
            label();
            removeBullet(b);
          } else if (b.x < -20 || b.x > W() + 20 || b.y < -20 || b.y > H() + 20) {
            removeBullet(b);
          }
        }

        if (!k.el || !k.alive) {
          after += dt;
          if (after > 0.8 && !gone) { gone = true; gear.disarm(); shooter.leave(); }
        }
        return Boolean(k.el || !shooter.gone() || bullets.length);
      },
      end() { gear.disarm(); bullets.forEach((b) => b.el.remove()); shooter.remove(); },
    };
  }

  // --- Szene 2: Weihnachtsmann (oder Satan?) ---

  const SANTA_LINES = [
    'HO HO HO!', 'Wer war brav?', 'Die Rentiere streiken!', 'Wo sind die Kekse?', 'Das Navi sagt: links!',
    'Zu viel Glühwein …', 'Lametta-Alarm!', 'Rudolph, Fernlicht!', 'Ich hab mich verflogen.',
    'Hat wer meine Brille gesehen?', 'Geschenke-Express!', 'Bitte lächeln, Radarkontrolle!', 'Ich seh dich, Krampus!',
  ];
  const SATAN_LINES = [
    'MUAHAHA!', 'Bescherung auf meine Art!', 'Heiß, heiß, heiß!', 'Frohe Höllenweihnacht!',
    'Wer war unartig?', 'Ich hol mir die Bäume!', 'Bratapfel-Zeit!',
  ];
  const SORRY_LINES = [
    'Ho ho … hoppla.', 'Ich war das nicht!', 'Ups, falscher Sack.', 'Das waren Wunderkerzen. Ehrlich.',
    'Was ist passiert?', 'HO HO HO! (ganz unschuldig)',
  ];

  function santaScene(targets) {
    const sw = W() < 600 ? 72 : 96;
    const sh = (sw * 14) / 24;
    const fromLeft = Math.random() < 0.5;
    const vx = (fromLeft ? 1 : -1) * rand(150, 200);
    const gravity = 900;
    const forestTop = forest ? forest.getBoundingClientRect().top : H();
    const s = {
      el: add('', '/img/santa.svg', sw, sh),
      x: fromLeft ? -sw : W(),
      y: targets.length ? Math.max(8, forestTop - rand(150, 240)) : rand(H() * 0.08, H() * 0.35),
      t: 0,
      evil: false,
    };
    const plan = targets
      .sort(() => Math.random() - 0.5)
      .slice(0, 1 + Math.floor(Math.random() * 3))
      .map((tree) => {
        const r = tree.getBoundingClientRect();
        const fall = Math.max(10, r.top + r.height * 0.45 - (s.y + sh * 0.8));
        return { tree, releaseX: r.left + r.width / 2 - vx * Math.sqrt((2 * fall) / gravity), dropped: false };
      })
      .sort((a, b) => (fromLeft ? a.releaseX - b.releaseX : b.releaseX - a.releaseX));
    const bombs = [];
    const bubble = add('bubble');
    bubble.hidden = true;
    let bubbleUntil = 0;
    let nextLine = 0.3;
    let nextFlip = rand(1.2, 3);

    function say(text, secs = 1.8) {
      bubble.textContent = text;
      bubble.classList.toggle('evil', s.evil);
      bubble.hidden = false;
      bubbleUntil = s.t + secs;
      nextLine = s.t + secs + rand(0.6, 1.4);
    }
    function become(evil) {
      if (s.evil === evil) return;
      s.evil = evil;
      s.el.src = evil ? '/img/satan.svg' : '/img/santa.svg';
      explode(s.x + sw / 2, s.y + sh / 2, sw * 0.9);
      say(pick(evil ? SATAN_LINES : SORRY_LINES));
    }

    return {
      update(dt) {
        if (s.el) {
          s.t += dt;
          s.x += vx * dt;
          const cx = s.x + sw / 2;
          const next = plan.find((p) => !p.dropped);
          const bombRun = next && (fromLeft ? cx >= next.releaseX - sw * 1.4 : cx <= next.releaseX + sw * 1.4);

          if (bombRun && !s.evil) {
            become(true); // Bomben wirft nur Satan
          } else if (!bombRun && s.t >= nextFlip) {
            become(!s.evil); // und sonst ganz zufällig
            nextFlip = s.t + rand(1.5, 3.5);
          } else if (s.t >= nextLine && s.t > bubbleUntil) {
            say(s.t < 1 ? 'HO HO HO!' : pick(s.evil ? SATAN_LINES : SANTA_LINES));
          }

          for (const p of plan) {
            if (!p.dropped && (fromLeft ? cx >= p.releaseX : cx <= p.releaseX)) {
              p.dropped = true;
              nextFlip = Math.max(nextFlip, s.t + 0.9);
              // so werfen, dass die Bombe genau auf dem Baum landet
              const r = p.tree.getBoundingClientRect();
              const by = s.y + sh * 0.8;
              const fallTime = Math.sqrt((2 * Math.max(10, r.top + r.height * 0.45 - by)) / gravity);
              bombs.push({ el: add('', '/img/bomb.svg', 24, 24), x: cx, y: by, vx: (r.left + r.width / 2 - cx) / fallTime, vy: 0, rot: 0, tree: p.tree });
            }
          }

          put(s.el, s.x, s.y + (Math.floor(s.t * 4) % 2 ? -3 : 0), fromLeft ? '' : ' scaleX(-1)');
          if (!bubble.hidden) {
            if (s.t > bubbleUntil) bubble.hidden = true;
            else put(bubble, Math.min(Math.max(8, s.x + sw * 0.2), W() - bubble.offsetWidth - 8), s.y - bubble.offsetHeight - 12);
          }
          if (s.x > W() + sw || s.x < -sw * 2) { s.el.remove(); s.el = null; bubble.remove(); }
        }

        for (const b of [...bombs]) {
          b.vy += gravity * dt;
          b.x += b.vx * dt;
          b.y += b.vy * dt;
          b.rot += 360 * dt;
          put(b.el, b.x - 12, b.y - 12, ` rotate(${Math.round(b.rot / 45) * 45}deg)`);
          const r = b.tree.getBoundingClientRect();
          if (b.y >= r.top + r.height * 0.45 || b.y > H() + 40) {
            b.el.remove();
            bombs.splice(bombs.indexOf(b), 1);
            if (b.y <= H() + 40) burn(b.tree);
          }
        }
        return Boolean(s.el || bombs.length);
      },
      end() { s.el?.remove(); bubble.remove(); bombs.forEach((b) => b.el.remove()); },
    };
  }

  // --- Szene 3: Boss-Krampus ---

  function bossScene() {
    const size = Math.max(128, Math.round(Math.min(W() * 0.42, 224) / 16) * 16);
    const boss = { el: add('boss', '/img/krampus.svg', size, size), x: W() / 2 - size / 2, y: -size - 10, t: 0, hp: 12, max: 12, state: 'enter', vy: 0, rot: 0, flash: 0 };
    const baseY = rand(H() * 0.14, H() * 0.3);
    const bar = add('hpbar');
    const fill = document.createElement('i');
    bar.append(fill);
    bar.style.width = `${Math.round(size * 0.8)}px`;
    const shooter = makeShooter(64, W() / 2, Math.random() < 0.5);
    const gear = gearUp(shooter, 'sniper');
    const laser = add('laser');
    laser.hidden = true;
    const touch = matchMedia('(pointer: coarse)').matches;
    let cooldown = 1;
    let userHits = 0;
    let after = 0;
    let left = false;

    function hit(damage, x, y, byUser) {
      if (boss.state !== 'fight') return;
      boss.hp = Math.max(0, boss.hp - damage);
      boss.flash = 0.12;
      explode(x, y, byUser ? 44 : 72);
      if (byUser) {
        userHits++;
        if (userHits === 1 || Math.random() < 0.35) popup(pick(['TREFFER!', 'Volltreffer!', 'Zack!', 'Bumm!', 'Autsch!']), x - 30, y - 44, 'small');
      }
      if (boss.hp === 0) {
        boss.state = 'dead';
        boss.vy = -220;
        bar.remove();
        laser.hidden = true;
        stats.boss++;
        saved.set('pe-boss', String(stats.boss));
        label();
        popup(userHits ? `BOSS BESIEGT! ${userHits} Treffer von dir` : 'BOSS BESIEGT!', boss.x, boss.y - 34, 'big');
        for (let i = 1; i <= 4; i++) setTimeout(() => explode(boss.x + rand(0, size), boss.y + rand(0, size), rand(60, 110)), i * 140);
      }
    }
    boss.el.addEventListener('pointerdown', (event) => {
      event.preventDefault();
      hit(1, event.clientX, event.clientY, true);
    });

    return {
      update(dt) {
        boss.t += dt;
        if (boss.state === 'enter') {
          boss.y += (baseY - boss.y) * Math.min(1, dt * 2.5);
          if (Math.abs(baseY - boss.y) < 4) {
            boss.state = 'fight';
            boss.t = 0;
            popup('GRRRAAAH!', boss.x + size * 0.15, boss.y - 34, 'big');
            setTimeout(() => { if (boss.state === 'fight') popup(touch ? 'Tipp auf ihn – schieß mit!' : 'Klick auf ihn – schieß mit!', boss.x, boss.y + size + 8, 'small'); }, 900);
          }
        } else if (boss.state === 'fight') {
          const span = Math.max(0, W() / 2 - size / 2 - 16);
          boss.x = W() / 2 - size / 2 + Math.sin(boss.t * 0.8) * span * 0.85;
          boss.y = baseY + Math.sin(boss.t * 2.3) * 12;
          if (boss.t > 22) {
            boss.state = 'escape';
            bar.remove();
            laser.hidden = true;
            popup('Er ist entkommen!', boss.x, boss.y + size + 8, 'small');
          }
        } else if (boss.state === 'escape') {
          boss.y -= 260 * dt;
          if (boss.y < -size - 20) { boss.el.remove(); boss.el = null; boss.state = 'gone'; }
        } else if (boss.state === 'dead') {
          boss.vy += 900 * dt;
          boss.y += boss.vy * dt;
          boss.rot += 300 * dt;
          if (boss.y > H() + 20) { boss.el.remove(); boss.el = null; boss.state = 'gone'; }
        }

        if (boss.el) {
          boss.flash = Math.max(0, boss.flash - dt);
          boss.el.style.filter = boss.flash > 0 ? 'brightness(2.5)' : '';
          put(boss.el, boss.x, boss.y, boss.state === 'dead' ? ` rotate(${Math.round(boss.rot / 30) * 30}deg)` : '');
        }
        if (boss.state === 'fight') {
          put(bar, boss.x + size * 0.1, boss.y - 20);
          fill.style.width = `${(boss.hp / boss.max) * 100}%`;
        }

        // der Engel mit dem Scharfschützengewehr
        shooter.update(dt);
        const fighting = boss.state === 'enter' || boss.state === 'fight';
        if (fighting) gear.update(dt, boss.x + size / 2, boss.y + size * 0.45);
        if (boss.state === 'fight' && gear.armed) {
          const m = gear.muzzle();
          const tx = boss.x + size / 2;
          const ty = boss.y + size * 0.45;
          const dist = Math.hypot(tx - m.x, ty - m.y);
          const angle = Math.atan2(ty - m.y, tx - m.x);
          laser.hidden = false;
          laser.style.width = `${Math.round(dist)}px`;
          put(laser, m.x, m.y, ` rotate(${angle}rad)`);
          cooldown -= dt;
          if (cooldown <= 0) {
            cooldown = rand(1.6, 2.4);
            const tracer = add('tracer');
            tracer.style.width = `${Math.round(dist)}px`;
            put(tracer, m.x, m.y, ` rotate(${angle}rad)`);
            setTimeout(() => tracer.remove(), 120);
            if (Math.random() < 0.4) popup('PENG!', m.x - 20, m.y - 36, 'small');
            hit(2, tx + rand(-size * 0.2, size * 0.2), ty + rand(-size * 0.15, size * 0.15), false);
          }
        }
        if (!fighting && !left) {
          after += dt;
          if (after > 0.6) { left = true; laser.remove(); gear.disarm(); shooter.leave(); }
        }
        return Boolean(boss.el || !shooter.gone());
      },
      end() { boss.el?.remove(); bar.remove(); laser.remove(); gear.disarm(); shooter.remove(); },
    };
  }

  // --- Ablauf ---

  const FORCED = ['krampus', 'santa', 'boss'].includes(location.hash.slice(1)) ? location.hash.slice(1) : null;
  let timer = null;
  let frame = null;
  let scene = null;

  function pickScene() {
    const roll = Math.random();
    // kleine Krampusse oft, Weihnachtsmann manchmal, Boss selten
    const kind = FORCED ?? (roll < 0.06 ? 'boss' : roll < 0.34 ? 'santa' : 'krampus');
    if (kind === 'boss') return bossScene();
    if (kind === 'santa') return santaScene(forest ? standingTrees() : []);
    return krampusScene();
  }

  function schedule(ms = rand(5000, 11000)) {
    clearTimeout(timer);
    if (enabled) timer = setTimeout(start, ms);
  }

  function stop() {
    clearTimeout(timer);
    cancelAnimationFrame(frame);
    scene?.end();
    scene = null;
    arena.replaceChildren();
    pageAngels.forEach(restoreAngel);
  }

  function start() {
    if (!enabled) return;
    if (document.hidden || scene) { schedule(); return; }
    scene = pickScene();
    let last = performance.now();
    const step = (now) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      if (!scene) return;
      if (scene.update(dt)) {
        frame = requestAnimationFrame(step);
      } else {
        scene.end();
        scene = null;
        schedule(FORCED ? rand(2500, 4000) : undefined);
      }
    };
    frame = requestAnimationFrame(step);
  }

  schedule(FORCED ? 800 : rand(2500, 5000));
})();
