 /* Frogger */
import { M, Sound } from '../engine.js';

export default {
  init(api) {
    const COLS = 13;
    let rowsN, cs, ox, oy, lanes, p, lives, score, homes, dead, deadT, timer, level, splash;

    function layout() {
      cs = Math.floor(Math.min(api.W * 0.96 / COLS, (api.H - 90) / 15));
      rowsN = 15;
      ox = Math.floor((api.W - COLS * cs) / 2);
      oy = Math.floor((api.H - rowsN * cs) / 2) + 12;
    }

    function buildLanes() {
      lanes = [];
      // 0 — дом, 1..5 — река, 6 — остров, 7..12 — дорога, 13 — старт, 14 — низ
      const spd = cs * (1.5 + level * 0.28);
      lanes.push({ type: 'home' });
      for (let i = 1; i <= 5; i++) {
        const dir = i % 2 ? 1 : -1;
        const kind = i % 2 ? 'log' : 'turtle';
        const len = kind === 'log' ? M.rint(2, 4) : M.rint(2, 3);
        const items = [];
        const gap = COLS / 2.4;
        for (let k = 0; k < 3; k++) items.push({ x: k * gap * cs * 1.1, len, sink: 0 });
        lanes.push({ type: kind, dir, speed: spd * M.rand(0.6, 1.05) * (kind === 'turtle' ? 0.8 : 1), items });
      }
      lanes.push({ type: 'safe' });
      for (let i = 7; i <= 12; i++) {
        const dir = i % 2 ? -1 : 1;
        const items = [];
        const n = M.rint(2, 3);
        for (let k = 0; k < n; k++) items.push({ x: k * (COLS * cs / n) + M.rand(0, 30), w: cs * M.rand(1.2, 1.9) });
        lanes.push({ type: 'car', dir, speed: spd * M.rand(0.85, 1.5), items, col: M.pick(['#ff4d6d', '#ffd43b', '#7ad7ff', '#b06bff', '#8ee06b']) });
      }
      lanes.push({ type: 'safe' });
      lanes.push({ type: 'safe' });
    }

    function reset() {
      layout();
      level = 1; lives = 3; score = 0; dead = false; deadT = 0; timer = 45; splash = 0;
      homes = [false, false, false, false, false];
      p = { gx: Math.floor(COLS / 2), gy: rowsN - 2, x: 0, y: 0, t: 0, dir: 0 };
      buildLanes();
      place();
      api.score(0);
    }

    function place() {
      p.x = ox + (p.gx + 0.5) * cs; p.y = oy + (p.gy + 0.5) * cs;
      timer = 45;
    }

    function hop(dx, dy) {
      if (dead) return;
      const nx = p.gx + dx, ny = p.gy + dy;
      if (nx < 0 || nx >= COLS || ny < 0 || ny >= rowsN - 1) return;
      p.gx = nx; p.gy = ny; p.t = 0.16; p.dir = dx ? (dx > 0 ? 1 : 3) : (dy > 0 ? 2 : 0);
      Sound.blip(430);
      if (dy < 0) { score += 10; api.score(score); }
      if (ny === 0) reachHome();
    }

    function reachHome() {
      const idx = Math.round((p.gx - 1) / ((COLS - 2) / 5));
      if (idx >= 0 && idx < 5 && !homes[idx]) {
        homes[idx] = true; score += 200 + Math.floor(timer) * 5; api.score(score);
        Sound.power();
        api.emit(p.x, p.y, { n: 26, color: '#8ee06b', speedMax: 300, life: 0.8 });
      } else score = Math.max(0, score - 50), api.score(score), Sound.bad();
      if (homes.every(Boolean)) {
        score += 1000; api.score(score); level++; homes = [false, false, false, false, false];
        buildLanes(); Sound.win();
      }
      p.gx = Math.floor(COLS / 2); p.gy = rowsN - 2; place();
    }

    function die(reason) {
      if (dead) return;
      dead = true; deadT = 0; splash = reason;
      Sound.boom(); api.shake(10, 0.35);
      api.emit(p.x, p.y, { n: 26, color: reason === 'water' ? '#7ad7ff' : '#ff4d6d', speedMax: 300, life: 0.8 });
      lives--;
      if (lives <= 0) setTimeout(() => api.over(score), 900);
      else setTimeout(() => { dead = false; p.gx = Math.floor(COLS / 2); p.gy = rowsN - 2; place(); }, 900);
    }

    function update(dt) {
      const i = api.input;
      if (dead) { deadT += dt; return; }
      timer -= dt;
      if (timer <= 0) return die('time');
      splash = Math.max(0, splash - dt);

      const sw = i.swipes[i.swipes.length - 1];
      if (sw) hop(sw.dir === 'left' ? -1 : sw.dir === 'right' ? 1 : 0, sw.dir === 'up' ? -1 : sw.dir === 'down' ? 1 : 0);
      else if (i.pressed.left) hop(-1, 0);
      else if (i.pressed.right) hop(1, 0);
      else if (i.pressed.up) hop(0, -1);
      else if (i.pressed.down) hop(0, 1);

      p.t = Math.max(0, p.t - dt);
      const k = 1 - p.t / 0.16;
      p.x = M.lerp(p.x, ox + (p.gx + 0.5) * cs, Math.min(1, dt * 18));
      p.y = M.lerp(p.y, oy + (p.gy + 0.5) * cs, Math.min(1, dt * 18));
      void k;

      const lane = lanes[p.gy];
      let riding = null;
      for (const L of lanes) {
        if (!L.items) continue;
        for (const it of L.items) {
          it.x += L.dir * L.speed * dt;
          const w = L.type === 'car' ? it.w : it.len * cs;
          const span = COLS * cs + w * 2;
          if (it.x > span) it.x = -w;
          if (it.x < -w * 1.5) it.x = span - w;
          if (L === lane) {
            const lx = ox + it.x, ly = oy + p.gy * cs;
            if (p.x > lx - cs * 0.1 && p.x < lx + w + cs * 0.1) riding = { L, it, w };
          }
        }
      }

      if (lane && lane.type === 'car' && riding) return die('car');
      if (lane && (lane.type === 'log' || lane.type === 'turtle')) {
        if (!riding) return die('water');
        if (lane.type === 'turtle') {
          riding.it.sink = (riding.it.sink || 0) + dt;
          if (Math.sin(api.t * 1.6 + riding.it.x * 0.01) < -0.75) return die('water');
        }
        p.x += riding.L.dir * riding.L.speed * dt;
        p.gx = M.clamp(Math.floor((p.x - ox) / cs), -1, COLS);
        if (p.x < ox - cs * 0.4 || p.x > ox + COLS * cs + cs * 0.4) return die('water');
      }
      api.setHud(`❤ ${lives} · ⏱ <b style="color:${timer < 10 ? '#ff4d6d' : '#8ee06b'}">${Math.ceil(timer)}</b> · домов ${homes.filter(Boolean).length}/5 · ур. ${level}`);
    }

    function draw(c) {
      const W = api.W, H = api.H;
      c.fillStyle = '#0a1420'; c.fillRect(0, 0, W, H);
      lanes.forEach((L, y) => {
        const py = oy + y * cs;
        if (L.type === 'home') {
          c.fillStyle = '#123a5a'; c.fillRect(ox, py, COLS * cs, cs);
          for (let k = 0; k < 5; k++) {
            const hx = ox + (1 + k * (COLS - 2) / 5 + (COLS - 2) / 10 - 0.5) * cs;
            c.fillStyle = homes[k] ? '#8ee06b' : '#0d2338';
            c.fillRect(hx - cs * 0.4, py + cs * 0.15, cs * 0.8, cs * 0.7);
            c.strokeStyle = '#2a6a9a'; c.lineWidth = 2; c.strokeRect(hx - cs * 0.4, py + cs * 0.15, cs * 0.8, cs * 0.7);
            if (homes[k]) { c.font = `${Math.round(cs * 0.6)}px system-ui`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('🐸', hx, py + cs * 0.55); c.textBaseline = 'alphabetic'; }
          }
        } else if (L.type === 'car') {
          c.fillStyle = '#1b1b2a'; c.fillRect(ox, py, COLS * cs, cs);
          c.strokeStyle = 'rgba(255,255,255,.18)'; c.lineWidth = 2; c.setLineDash([8, 10]);
          c.beginPath(); c.moveTo(ox, py + cs / 2); c.lineTo(ox + COLS * cs, py + cs / 2); c.stroke(); c.setLineDash([]);
          for (const it of L.items) {
            const x = ox + it.x;
            c.fillStyle = L.col;
            M.roundRect(c, x, py + cs * 0.18, it.w, cs * 0.64, 5); c.fill();
            c.fillStyle = 'rgba(0,0,0,.35)';
            c.fillRect(x + it.w * 0.22, py + cs * 0.3, it.w * 0.5, cs * 0.24);
          }
        } else if (L.type === 'log' || L.type === 'turtle') {
          c.fillStyle = '#0d2338'; c.fillRect(ox, py, COLS * cs, cs);
          c.fillStyle = 'rgba(122,215,255,.07)';
          for (let x = 0; x < COLS; x++) c.fillRect(ox + x * cs + ((api.t * 20) % cs), py + cs * 0.4, cs * 0.3, 2);
          for (const it of L.items) {
            const x = ox + it.x, w = it.len * cs;
            if (L.type === 'log') {
              c.fillStyle = '#8a5a2b'; M.roundRect(c, x, py + cs * 0.22, w, cs * 0.56, cs * 0.26); c.fill();
              c.fillStyle = 'rgba(255,255,255,.12)'; c.fillRect(x + 6, py + cs * 0.3, w - 12, 3);
            } else {
              for (let k = 0; k < it.len; k++) {
                const sink = Math.sin(api.t * 1.6 + (x + k * cs) * 0.01) < -0.75;
                c.globalAlpha = sink ? 0.25 : 1;
                c.fillStyle = '#4a9e5a';
                c.beginPath(); c.arc(x + k * cs + cs * 0.5, py + cs * 0.5, cs * 0.36, 0, 7); c.fill();
                c.fillStyle = '#2f6b3a';
                c.beginPath(); c.arc(x + k * cs + cs * 0.5, py + cs * 0.5, cs * 0.2, 0, 7); c.fill();
                c.globalAlpha = 1;
              }
            }
          }
        } else {
          c.fillStyle = '#16301c'; c.fillRect(ox, py, COLS * cs, cs);
        }
      });

      // лягушка
      const jumpK = p.t > 0 ? Math.sin((1 - p.t / 0.16) * Math.PI) : 0;
      c.save();
      c.translate(p.x, p.y - jumpK * cs * 0.4);
      c.rotate(p.dir * Math.PI / 2);
      if (dead && deadT > 0.1) c.globalAlpha = 0.4;
      c.fillStyle = '#8ee06b';
      c.beginPath(); c.ellipse(0, 0, cs * 0.34, cs * 0.38, 0, 0, 7); c.fill();
      c.fillStyle = '#6bbf4a';
      c.beginPath(); c.ellipse(-cs * 0.3, cs * 0.16, cs * 0.14, cs * 0.2, -0.5, 0, 7); c.fill();
      c.beginPath(); c.ellipse(cs * 0.3, cs * 0.16, cs * 0.14, cs * 0.2, 0.5, 0, 7); c.fill();
      c.fillStyle = '#fff';
      c.beginPath(); c.arc(-cs * 0.14, -cs * 0.26, cs * 0.1, 0, 7); c.fill();
      c.beginPath(); c.arc(cs * 0.14, -cs * 0.26, cs * 0.1, 0, 7); c.fill();
      c.fillStyle = '#111';
      c.beginPath(); c.arc(-cs * 0.14, -cs * 0.28, cs * 0.05, 0, 7); c.fill();
      c.beginPath(); c.arc(cs * 0.14, -cs * 0.28, cs * 0.05, 0, 7); c.fill();
      c.globalAlpha = 1;
      c.restore();
    }

    return { reset, update, draw, resize: () => { layout(); buildLanes(); place(); } };
  },
};
