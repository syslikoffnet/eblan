/* ==========================================================================
   EBLAN BOX — общий движок для всех мини-игр
   Каждая игра = модуль, экспортирующий объект-описание:
   {
     id, title, sub, emoji, palette:[c1,c2], tags:[..], controls:'tap|drag|dpad|lr|ab|swipe|none',
     hint:'как играть',
     init(api) -> { reset(), update(dt), draw(ctx), resize?(), onEvent?(e) }
   }
   ========================================================================== */

/* ---------- хранилище ---------- */
export const Store = {
  get(k, d = null) {
    try {
      const v = localStorage.getItem('eb_' + k);
      return v === null ? d : JSON.parse(v);
    } catch { return d; }
  },
  set(k, v) { try { localStorage.setItem('eb_' + k, JSON.stringify(v)); } catch {} },
  best(id) { return Store.get('best_' + id, 0); },
  setBest(id, v) {
    const cur = Store.best(id);
    if (v > cur) { Store.set('best_' + id, v); return true; }
    return false;
  },
  plays(id) { Store.set('plays_' + id, (Store.get('plays_' + id, 0) + 1)); },
};

/* ---------- звук (WebAudio, без файлов) ---------- */
export const Sound = (() => {
  let ac = null, muted = Store.get('muted', false);
  const ctx = () => {
    if (!ac) { try { ac = new (window.AudioContext || window.webkitAudioContext)(); } catch {} }
    if (ac && ac.state === 'suspended') ac.resume().catch(() => {});
    return ac;
  };
  function tone(freq, dur = 0.08, type = 'square', vol = 0.16, slide = 0) {
    if (muted) return;
    const a = ctx(); if (!a) return;
    const o = a.createOscillator(), g = a.createGain();
    o.type = type; o.frequency.value = freq;
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), a.currentTime + dur);
    g.gain.value = vol;
    g.gain.exponentialRampToValueAtTime(0.0001, a.currentTime + dur);
    o.connect(g); g.connect(a.destination);
    o.start(); o.stop(a.currentTime + dur + 0.02);
  }
  function noise(dur = 0.18, vol = 0.2) {
    if (muted) return;
    const a = ctx(); if (!a) return;
    const n = Math.floor(a.sampleRate * dur);
    const buf = a.createBuffer(1, n, a.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
    const s = a.createBufferSource(); s.buffer = buf;
    const g = a.createGain(); g.gain.value = vol;
    const f = a.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 1200;
    s.connect(f); f.connect(g); g.connect(a.destination); s.start();
  }
  return {
    unlock() { ctx(); },
    tone, noise,
    blip: (f = 660) => tone(f, 0.06, 'square', 0.12),
    coin: () => { tone(880, 0.06, 'square', 0.14); setTimeout(() => tone(1320, 0.09, 'square', 0.12), 55); },
    jump: () => tone(320, 0.14, 'square', 0.14, 420),
    hit: () => tone(180, 0.1, 'sawtooth', 0.16, -80),
    boom: () => { noise(0.3, 0.24); tone(90, 0.25, 'sawtooth', 0.14, -50); },
    power: () => { [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => tone(f, 0.09, 'triangle', 0.14), i * 60)); },
    bad: () => { tone(220, 0.25, 'sawtooth', 0.16, -140); },
    win: () => { [523, 659, 784, 1046, 1318].forEach((f, i) => setTimeout(() => tone(f, 0.12, 'triangle', 0.15), i * 90)); },
    click: () => tone(440, 0.03, 'sine', 0.08),
    get muted() { return muted; },
    toggle() { muted = !muted; Store.set('muted', muted); if (!muted) this.blip(); return muted; },
  };
})();

/* ---------- математика / рандом ---------- */
export const M = {
  clamp: (v, a, b) => v < a ? a : v > b ? b : v,
  lerp: (a, b, t) => a + (b - a) * t,
  rand: (a = 1, b) => b === undefined ? Math.random() * a : a + Math.random() * (b - a),
  rint: (a, b) => Math.floor(a + Math.random() * (b - a + 1)),
  pick: arr => arr[Math.floor(Math.random() * arr.length)],
  chance: p => Math.random() < p,
  dist: (x1, y1, x2, y2) => Math.hypot(x2 - x1, y2 - y1),
  hit: (ax, ay, aw, ah, bx, by, bw, bh) =>
    ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by,
  shuffle(a) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1));[a[i], a[j]] = [a[j], a[i]]; } return a; },
  roundRect(ctx, x, y, w, h, r) {
    r = Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  },
};

/* ---------- частицы ---------- */
export class Particles {
  constructor(max = 400) { this.p = []; this.max = max; }
  spawn(x, y, o = {}) {
    if (this.p.length > this.max) return;
    const n = o.n || 1;
    for (let i = 0; i < n; i++) {
      const a = o.dir !== undefined ? o.dir + M.rand(-(o.spread || 0.6), (o.spread || 0.6)) : M.rand(0, Math.PI * 2);
      const sp = M.rand(o.speedMin ?? 40, o.speedMax ?? 220);
      this.p.push({
        x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
        life: o.life ?? M.rand(0.3, 0.8), t: 0,
        size: o.size ?? M.rand(2, 5), color: o.color || '#fff',
        g: o.g ?? 220, shape: o.shape || 'rect',
      });
    }
  }
  update(dt) {
    for (let i = this.p.length - 1; i >= 0; i--) {
      const q = this.p[i];
      q.t += dt; if (q.t >= q.life) { this.p.splice(i, 1); continue; }
      q.vy += q.g * dt; q.x += q.vx * dt; q.y += q.vy * dt;
    }
  }
  draw(ctx) {
    for (const q of this.p) {
      const k = 1 - q.t / q.life;
      ctx.globalAlpha = Math.max(0, k);
      ctx.fillStyle = q.color;
      const s = q.size * (0.4 + k * 0.6);
      if (q.shape === 'circle') { ctx.beginPath(); ctx.arc(q.x, q.y, s, 0, 7); ctx.fill(); }
      else ctx.fillRect(q.x - s / 2, q.y - s / 2, s, s);
    }
    ctx.globalAlpha = 1;
  }
  clear() { this.p.length = 0; }
}

/* ---------- виртуальные кнопки ---------- */
const KEYMAP = {
  ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right',
  ArrowUp: 'up', KeyW: 'up', ArrowDown: 'down', KeyS: 'down',
  Space: 'a', Enter: 'a', KeyZ: 'a', KeyJ: 'a', KeyX: 'b', KeyK: 'b', Escape: 'esc', KeyP: 'esc',
};

const CONTROL_SETS = {
  none: [], tap: [], drag: [], swipe: [],
  lr: ['left', 'right'],
  ab: ['a', 'b'],
  lrab: ['left', 'right', 'a'],
  dpad: ['left', 'right', 'up', 'down'],
  dpada: ['left', 'right', 'up', 'down', 'a'],
  full: ['left', 'right', 'up', 'down', 'a', 'b'],
};
const BTN_LABEL = { left: '◀', right: '▶', up: '▲', down: '▼', a: 'A', b: 'B' };

/* ---------- оболочка игры ---------- */
export class Shell {
  constructor(host, def, hooks = {}) {
    this.host = host; this.def = def; this.hooks = hooks;
    host.innerHTML = '';
    host.classList.add('shell');

    this.canvas = document.createElement('canvas');
    this.canvas.className = 'game-canvas';
    host.appendChild(this.canvas);
    this.ctx = this.canvas.getContext('2d');

    this.hud = document.createElement('div');
    this.hud.className = 'hud';
    this.hud.innerHTML = `<div class="hud-l"><span class="hud-score">0</span><small>очки</small></div>
      <div class="hud-m"></div>
      <div class="hud-r"><span class="hud-best">${Store.best(def.id)}</span><small>рекорд</small></div>
      <button class="hud-btn pause" title="пауза">II</button>
      <button class="hud-btn mute" title="звук">${Sound.muted ? '🔇' : '🔊'}</button>`;
    host.appendChild(this.hud);
    this.hudScore = this.hud.querySelector('.hud-score');
    this.hudBest = this.hud.querySelector('.hud-best');
    this.hudMid = this.hud.querySelector('.hud-m');

    this.pad = document.createElement('div');
    this.pad.className = 'pad pad-' + (def.controls || 'none');
    host.appendChild(this.pad);

    this.overlay = document.createElement('div');
    this.overlay.className = 'ov';
    host.appendChild(this.overlay);

    this.state = 'ready';   // ready | run | pause | over
    this.score = 0; this.best = Store.best(def.id);
    this.t = 0; this.acc = 0; this.last = 0; this.raf = 0;
    this.shakeT = 0; this.shakeMag = 0;
    this.particles = new Particles();

    this.input = {
      held: {}, pressed: {}, released: {},
      pointer: { x: 0, y: 0, px: 0, py: 0, down: false, pressed: false, released: false, dx: 0, dy: 0, id: null },
      swipes: [], events: [],
    };

    this.api = this._buildApi();
    this._buildPad();
    this._bind();

    this._resize();
    this.game = def.init(this.api);
    this.game.reset();
    this.showStart();
  }

  /* --- API, который видят игры --- */
  _buildApi() {
    const self = this;
    const api = {
      def: this.def,
      get W() { return self.W; }, get H() { return self.H; },
      get ctx() { return self.ctx; },
      get t() { return self.t; },
      get dt() { return self.dt; },
      input: this.input,
      M, Sound, Store,
      particles: this.particles,
      rand: M.rand, rint: M.rint, pick: M.pick,
      score(n) { self.setScore(n); },
      addScore(n) { self.setScore(self.score + n); },
      setHud(txt) { self.hudMid.innerHTML = txt || ''; },
      over(finalScore) { self.gameOver(finalScore); },
      win(finalScore) { self.gameWin(finalScore); },
      shake(mag = 8, t = 0.25) { self.shakeMag = Math.max(self.shakeMag, mag); self.shakeT = Math.max(self.shakeT, t); },
      emit(x, y, o) { self.particles.spawn(x, y, o); },
    };
    return api;
  }

  _buildPad() {
    const names = CONTROL_SETS[this.def.controls] || [];
    if (!names.length) { this.pad.style.display = 'none'; return; }
    const mk = (n) => {
      const b = document.createElement('button');
      b.className = 'pbtn p-' + n; b.textContent = BTN_LABEL[n]; b.dataset.btn = n;
      const on = e => { e.preventDefault(); this._setBtn(n, true); };
      const off = e => { e.preventDefault(); this._setBtn(n, false); };
      b.addEventListener('pointerdown', on);
      b.addEventListener('pointerup', off);
      b.addEventListener('pointercancel', off);
      b.addEventListener('pointerleave', off);
      this.pad.appendChild(b);
    };
    names.forEach(mk);
  }

  _setBtn(n, down) {
    const i = this.input;
    if (down && !i.held[n]) { i.pressed[n] = true; i.events.push({ type: 'btn', name: n }); }
    if (!down && i.held[n]) i.released[n] = true;
    i.held[n] = down;
    if (down) { Sound.unlock(); if (this.state === 'ready') this.start(); }
  }

  _bind() {
    const c = this.canvas;
    const pos = (e) => {
      const r = c.getBoundingClientRect();
      return { x: (e.clientX - r.left) * (this.W / r.width), y: (e.clientY - r.top) * (this.H / r.height) };
    };
    c.addEventListener('pointerdown', e => {
      e.preventDefault(); Sound.unlock();
      const p = pos(e); const i = this.input.pointer;
      i.x = i.px = p.x; i.y = i.py = p.y; i.down = true; i.pressed = true; i.id = e.pointerId;
      i.dx = i.dy = 0; i.startX = p.x; i.startY = p.y; i.startT = performance.now();
      this.input.pressed.a = true; this.input.held.a = true;
      this.input.events.push({ type: 'down', x: p.x, y: p.y });
      if (this.state === 'ready') this.start();
      try { c.setPointerCapture(e.pointerId); } catch {}
    });
    c.addEventListener('pointermove', e => {
      const i = this.input.pointer; if (!i.down) { const p = pos(e); i.x = p.x; i.y = p.y; return; }
      const p = pos(e);
      i.dx = p.x - i.x; i.dy = p.y - i.y; i.px = i.x; i.py = i.y; i.x = p.x; i.y = p.y;
      this.input.events.push({ type: 'move', x: p.x, y: p.y, dx: i.dx, dy: i.dy });
    });
    const up = e => {
      const i = this.input.pointer; if (!i.down) return;
      i.down = false; i.released = true;
      const dt = performance.now() - (i.startT || 0);
      const dx = i.x - (i.startX ?? i.x), dy = i.y - (i.startY ?? i.y);
      const d = Math.hypot(dx, dy);
      if (d > 28 && dt < 700) {
        const dir = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up');
        this.input.swipes.push({ dir, dx, dy, x: i.x, y: i.y });
        this.input.events.push({ type: 'swipe', dir, dx, dy });
      } else if (d < 16) {
        this.input.events.push({ type: 'tap', x: i.x, y: i.y });
      }
      this.input.held.a = false;
      this.input.events.push({ type: 'up', x: i.x, y: i.y });
    };
    c.addEventListener('pointerup', up);
    c.addEventListener('pointercancel', up);

    this._key = e => {
      const n = KEYMAP[e.code]; if (!n) return;
      e.preventDefault();
      if (n === 'esc') { this.togglePause(); return; }
      if (e.type === 'keydown') {
        if (e.repeat) { this.input.held[n] = true; return; }
        Sound.unlock();
        if (!this.input.held[n]) this.input.pressed[n] = true;
        this.input.held[n] = true;
        this.input.events.push({ type: 'key', name: n });
        if (this.state === 'ready') this.start();
      } else {
        this.input.held[n] = false; this.input.released[n] = true;
      }
    };
    window.addEventListener('keydown', this._key, { passive: false });
    window.addEventListener('keyup', this._key, { passive: false });

    this._onResize = () => this._resize();
    window.addEventListener('resize', this._onResize);
    window.addEventListener('orientationchange', this._onResize);

    this._onVis = () => { if (document.hidden && this.state === 'run') this.pause(); };
    document.addEventListener('visibilitychange', this._onVis);

    this.hud.querySelector('.pause').onclick = () => { Sound.click(); this.togglePause(); };
    this.hud.querySelector('.mute').onclick = (e) => {
      const m = Sound.toggle(); e.target.textContent = m ? '🔇' : '🔊';
    };
  }

  _resize() {
    const host = this.host;
    const r = host.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.W = Math.max(200, Math.round(r.width));
    this.H = Math.max(200, Math.round(r.height));
    this.canvas.width = Math.round(this.W * dpr);
    this.canvas.height = Math.round(this.H * dpr);
    this.canvas.style.width = this.W + 'px';
    this.canvas.style.height = this.H + 'px';
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (this.game && this.game.resize) this.game.resize(this.W, this.H);
  }

  setScore(n) {
    this.score = Math.max(0, Math.round(n));
    this.hudScore.textContent = this.score;
  }

  /* --- состояния / оверлеи --- */
  showStart() {
    const d = this.def;
    this.state = 'ready';
    this.overlay.className = 'ov show';
    this.overlay.innerHTML = `
      <div class="ov-card">
        <div class="ov-emoji">${d.emoji || '🎮'}</div>
        <h2>${d.title}</h2>
        ${d.sub ? `<p class="ov-sub">${d.sub}</p>` : ''}
        <p class="ov-hint">${d.hint || ''}</p>
        <div class="ov-best">рекорд: <b>${Store.best(d.id)}</b></div>
        <button class="btn primary big" data-act="start">▶ Играть</button>
        <button class="btn ghost" data-act="exit">← В меню</button>
      </div>`;
    this._wireOverlay();
  }

  pause() {
    if (this.state !== 'run') return;
    this.state = 'pause';
    this.overlay.className = 'ov show';
    this.overlay.innerHTML = `<div class="ov-card">
      <h2>Пауза</h2>
      <div class="ov-best">очки: <b>${this.score}</b></div>
      <button class="btn primary big" data-act="resume">▶ Продолжить</button>
      <button class="btn ghost" data-act="restart">↻ Заново</button>
      <button class="btn ghost" data-act="exit">← В меню</button>
    </div>`;
    this._wireOverlay();
  }

  resume() {
    if (this.state !== 'pause') return;
    this.overlay.className = 'ov';
    this.state = 'run'; this.last = performance.now(); this.acc = 0;
  }

  togglePause() { this.state === 'run' ? this.pause() : this.state === 'pause' && this.resume(); }

  _end(title, cls) {
    this.state = 'over';
    const isBest = Store.setBest(this.def.id, this.score);
    if (isBest && this.score > 0) Store.set('records', (Store.get('records', 0) || 0) + 1);
    this.hudBest.textContent = Store.best(this.def.id);
    Sound[cls === 'win' ? 'win' : 'bad']();
    this.overlay.className = 'ov show';
    this.overlay.innerHTML = `<div class="ov-card">
      <div class="ov-emoji">${cls === 'win' ? '🏆' : '💀'}</div>
      <h2>${title}</h2>
      <div class="ov-score">${this.score}</div>
      <div class="ov-best">${isBest ? '🔥 новый рекорд!' : 'рекорд: <b>' + Store.best(this.def.id) + '</b>'}</div>
      <button class="btn primary big" data-act="restart">↻ Ещё раз</button>
      <button class="btn ghost" data-act="exit">← В меню</button>
    </div>`;
    this._wireOverlay();
    this.hooks.onEnd && this.hooks.onEnd(this.def.id, this.score, isBest);
  }
  gameOver(s) { if (s !== undefined) this.setScore(s); this._end('Игра окончена', 'over'); }
  gameWin(s) { if (s !== undefined) this.setScore(s); this._end(this.def.winTitle || 'Победа!', 'win'); }

  _wireOverlay() {
    this.overlay.querySelectorAll('[data-act]').forEach(b => {
      b.onclick = () => {
        Sound.click();
        const a = b.dataset.act;
        if (a === 'start' || a === 'restart') this.start();
        else if (a === 'resume') this.resume();
        else if (a === 'exit') this.destroy(), this.hooks.onExit && this.hooks.onExit();
      };
    });
  }

  start() {
    this.score = 0; this.setScore(0); this.t = 0; this.acc = 0;
    this.particles.clear();
    this.hudBest.textContent = Store.best(this.def.id);
    this.game.reset();
    this._resize();
    this.overlay.className = 'ov';
    this.state = 'run';
    this.last = performance.now();
    Store.plays(this.def.id);
    Sound.unlock();
    if (!this.raf) this.raf = requestAnimationFrame(this._loop);
  }

  _loop = (now) => {
    this.raf = requestAnimationFrame(this._loop);
    let dt = (now - this.last) / 1000; this.last = now;
    if (!isFinite(dt) || dt < 0) dt = 0;
    dt = Math.min(dt, 0.1);

    if (this.state === 'run') {
      this.acc += dt;
      const step = 1 / 60;
      let n = 0;
      while (this.acc >= step && n < 5) {
        this.t += step; this.dt = step;
        try { this.game.update(step); } catch (e) { console.error(this.def.id, e); this.state = 'pause'; }
        this.particles.update(step);
        this.acc -= step; n++;
      }
      if (this.shakeT > 0) { this.shakeT -= dt; if (this.shakeT <= 0) this.shakeMag = 0; }
    }

    // draw
    const ctx = this.ctx;
    ctx.setTransform(Math.min(window.devicePixelRatio || 1, 2), 0, 0, Math.min(window.devicePixelRatio || 1, 2), 0, 0);
    if (this.shakeMag) ctx.translate(M.rand(-this.shakeMag, this.shakeMag), M.rand(-this.shakeMag, this.shakeMag));
    ctx.clearRect(-20, -20, this.W + 40, this.H + 40);
    try { this.game.draw(ctx); } catch (e) { console.error(this.def.id, e); }
    this.particles.draw(ctx);

    // сброс кадровых флагов ввода
    const i = this.input;
    for (const k in i.pressed) i.pressed[k] = false;
    for (const k in i.released) i.released[k] = false;
    i.pointer.pressed = false; i.pointer.released = false;
    i.pointer.dx = 0; i.pointer.dy = 0;
    i.swipes.length = 0; i.events.length = 0;
  };

  destroy() {
    cancelAnimationFrame(this.raf); this.raf = 0;
    window.removeEventListener('keydown', this._key);
    window.removeEventListener('keyup', this._key);
    window.removeEventListener('resize', this._onResize);
    window.removeEventListener('orientationchange', this._onResize);
    document.removeEventListener('visibilitychange', this._onVis);
    this.host.innerHTML = '';
    this.host.classList.remove('shell');
  }
}

/* ---------- загрузка модулей игр ---------- */
export const REGISTRY = [];
export async function loadGames(list) {
  for (const [file, meta] of list) {
    try {
      const mod = await import('./games/' + file);
      const def = mod.default;
      Object.assign(def, meta || {});
      REGISTRY.push(def);
    } catch (e) { console.error('не загрузилась игра', file, e); }
  }
  return REGISTRY;
}
