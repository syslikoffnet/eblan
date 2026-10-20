/* Смоук-тест игровых модулей без браузера.
   usage: node tools/smoke.mjs [game1 game2 ...]
   Гоняет каждую игру ~90 "секунд" со случайным вводом и ловит исключения. */
import { M, Particles } from '../engine.js';

/* ---- стабы ---- */
const store = new Map();
globalThis.localStorage = {
  getItem: k => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: k => store.delete(k),
};
const grad = { addColorStop() {} };
const ctxStub = new Proxy({}, {
  get(_, p) {
    if (p === 'createLinearGradient' || p === 'createRadialGradient') return () => grad;
    if (p === 'createPattern') return () => ({ setTransform() {} });
    if (p === 'measureText') return () => ({ width: 10 });
    if (p === 'getImageData') return () => ({ data: new Uint8ClampedArray(4) });
    if (p === 'canvas') return { width: 390, height: 700 };
    if (typeof p === 'string' && ['fillStyle', 'strokeStyle', 'lineWidth', 'font', 'globalAlpha',
      'textAlign', 'textBaseline', 'shadowBlur', 'shadowColor', 'lineCap', 'lineJoin',
      'imageSmoothingEnabled', 'filter', 'globalCompositeOperation'].includes(p)) return '#000';
    return (...a) => {
      for (const v of a) if (typeof v === 'number' && !Number.isFinite(v)) throw new Error('NaN в аргументе ctx.' + String(p) + ': ' + a.join(','));
      return undefined;
    };
  },
  set() { return true; },
});

const Sound = {
  unlock() {}, tone() {}, noise() {}, blip() {}, coin() {}, jump() {}, hit() {},
  boom() {}, power() {}, bad() {}, win() {}, click() {}, muted: false, toggle() { return false; },
};
const Store = {
  get: (k, d) => d, set() {}, best: () => 0, setBest: () => false, plays() {},
};

function makeApi(W, H) {
  const particles = new Particles();
  const input = {
    held: {}, pressed: {}, released: {},
    pointer: { x: W / 2, y: H / 2, px: W / 2, py: H / 2, down: false, pressed: false, released: false, dx: 0, dy: 0 },
    swipes: [], events: [],
  };
  const api = {
    W, H, t: 0, dt: 1 / 60,
    get ctx() { return ctxStub; },
    input, M, Sound, Store, particles,
    rand: M.rand, rint: M.rint, pick: M.pick,
    emit: (x, y, o) => particles.spawn(x, y, o),
    shake() {}, score(n) { api._score = n; if (!Number.isFinite(n)) throw new Error('score NaN'); },
    addScore(n) { api.score((api._score || 0) + n); },
    setHud(s) { api._hud = s; },
    over(s) { api._over = s ?? api._score; api._ended = 'over'; },
    win(s) { api._over = s ?? api._score; api._ended = 'win'; },
  };
  return api;
}

const rnd = (a, b) => a + Math.random() * (b - a);

/* setTimeout в играх используется для задержки «game over» после смерти —
   в тесте вызываем сразу, чтобы проверялся путь смерть -> over -> reset */
globalThis.setTimeout = (fn) => { try { fn(); } catch (e) { throw e; } return 0; };
globalThis.clearTimeout = () => {};

async function test(file, opts = {}) {
  const mod = await import('../games/' + file);
  const def = mod.default;
  if (!def || typeof def.init !== 'function') throw new Error('нет init()');
  const sizes = opts.sizes || [[390, 700], [430, 900], [900, 420]];
  const frames = opts.frames || (process.env.FRAMES ? +process.env.FRAMES : 25 * 60);
  let ends = 0;
  for (const [W, H] of sizes) {
    const api = makeApi(W, H);
    const g = def.init(api);
    if (!g || typeof g.update !== 'function' || typeof g.draw !== 'function') throw new Error('нет update/draw');
    g.reset();
    g.draw(ctxStub);
    for (let f = 0; f < frames; f++) {
      api.t += 1 / 60;
      // случайный ввод
      const i = api.input;
      for (const k of ['left', 'right', 'up', 'down', 'a', 'b']) i.pressed[k] = false;
      i.swipes.length = 0; i.events.length = 0;
      if (Math.random() < 0.06) {
        const k = ['left', 'right', 'up', 'down', 'a', 'b'][Math.floor(Math.random() * 6)];
        i.pressed[k] = true; i.held[k] = true;
        setTimeout(() => { }, 0);
        if (Math.random() < 0.5) i.held[k] = false;
      }
      if (Math.random() < 0.02) {
        i.pointer.down = true;
        i.pointer.x = rnd(0, W); i.pointer.y = rnd(0, H);
      } else if (i.pointer.down && Math.random() < 0.3) { i.pointer.down = false; }
      if (Math.random() < 0.008) {
        i.swipes.push({ dir: ['left', 'right', 'up', 'down'][Math.floor(Math.random() * 4)], dx: 40, dy: 0 });
      }
      if (Math.random() < 0.05) { i.pointer.dx = rnd(-20, 20); i.pointer.dy = rnd(-20, 20); }

      try {
        g.update(1 / 60);
        api.particles.update(1 / 60);
        g.draw(ctxStub);
        api.particles.draw(ctxStub);
      } catch (e) {
        throw new Error(`${W}x${H} кадр ${f}: ${e.message}`);
      }

      if (api._ended) {
        ends++;
        // перезапуск как по кнопке «ещё раз»
        api._ended = null; api._score = 0; api.particles.clear();
        g.reset();
        if (g.resize) g.resize(W, H);
      }
      if (f === Math.floor(frames / 2) && g.resize) g.resize(Math.round(W * 0.9), Math.round(H * 1.05));
    }
    // проверка состояния на NaN
    const blob = JSON.stringify({ s: api._score, hud: api._hud });
    if (blob.includes('NaN') || blob.includes('null')) {
      if (blob.includes('NaN')) throw new Error('NaN в состоянии: ' + blob);
    }
  }
  return { file, ends, sizes: sizes.length };
}

const args = process.argv.slice(2);
let files = args;
if (!files.length) {
  const fs = await import('node:fs');
  files = fs.readdirSync(new URL('../games', import.meta.url).pathname)
    .filter(f => f.endsWith('.js') && f !== 'index.js');
}
let fail = 0;
for (const f of files) {
  const t0 = Date.now();
  try {
    const r = await test(f);
    console.log(`✅ ${f.padEnd(16)} ${r.sizes} размеров, ${r.ends} завершений, ${Date.now() - t0}ms`);
  } catch (e) {
    fail++;
    console.log(`❌ ${f.padEnd(16)} ${e.message}`);
    console.log(String(e.stack).split('\n').slice(1, 4).join('\n'));
  }
}
console.log(fail ? `\n${fail} ошибок` : '\nвсё чисто');
process.exit(fail ? 1 : 0);
