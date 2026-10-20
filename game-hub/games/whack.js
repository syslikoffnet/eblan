 /* Прибей крота (Whack-a-Mole) */
import { M, Sound } from '../engine.js';

const TIME = 30;

export default {
  init(api) {
    let holes, time, score, combo, bestCombo, hits, misses, spawnT, over, popFx, cs, ox, oy, shakeBad;

    function layout() {
      cs = Math.min(api.W * 0.86, api.H * 0.6) / 3;
      ox = (api.W - cs * 3) / 2;
      oy = (api.H - cs * 3) / 2 + 10;
      holes = [];
      for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) {
        holes.push({ x: ox + (c + 0.5) * cs, y: oy + (r + 0.5) * cs, kind: null, t: 0, life: 0, up: 0 });
      }
    }

    function reset() {
      layout();
      time = TIME; score = 0; combo = 0; bestCombo = 0; hits = 0; misses = 0;
      spawnT = 0.3; over = false; popFx = 0; shakeBad = 0;
      api.score(0);
    }

    function spawn() {
      const free = holes.filter(h => !h.kind);
      if (!free.length) return;
      const k = time < 12 ? 2 : time < 22 ? 1 : 1;
      for (let i = 0; i < k; i++) {
        const pool = free.filter(h => !h.kind);
        if (!pool.length) break;
        const h = M.pick(pool);
        const r = Math.random();
        const p = TIME - time;
        h.kind = r < 0.14 + p * 0.004 ? 'bomb' : r < 0.2 ? 'gold' : 'mole';
        h.life = M.clamp(1.5 - p * 0.028, 0.55, 1.5);
        h.t = 0; h.up = 0;
      }
    }

    function whack(x, y) {
      if (over) return;
      let hitAny = false;
      for (const h of holes) {
        if (!h.kind || h.up < 0.35) continue;
        if (Math.hypot(x - h.x, y - h.y) < cs * 0.42) {
          hitAny = true;
          if (h.kind === 'bomb') {
            score = Math.max(0, score - 60); combo = 0; shakeBad = 0.4;
            Sound.boom(); api.shake(16, 0.4);
            api.emit(h.x, h.y, { n: 34, color: '#ff4d6d', speedMax: 400, life: 0.9 });
          } else if (h.kind === 'gold') {
            combo++; score += 150 + combo * 10; Sound.power();
            api.emit(h.x, h.y, { n: 28, color: '#ffd43b', speedMax: 340, life: 0.9 });
          } else {
            combo++; hits++; score += 20 + Math.min(60, combo * 4);
            Sound.coin();
            api.emit(h.x, h.y, { n: 12, color: '#a56a3a', speedMax: 240, life: 0.5 });
          }
          bestCombo = Math.max(bestCombo, combo);
          api.score(score);
          h.kind = null; h.up = 0;
          break;
        }
      }
      if (!hitAny) {
        misses++; combo = 0; score = Math.max(0, score - 5); api.score(score);
        Sound.blip(150);
        api.emit(x, y, { n: 4, color: '#888', speedMax: 90, life: 0.3 });
      }
    }

    function update(dt) {
      if (over) return;
      time -= dt;
      popFx += dt; shakeBad = Math.max(0, shakeBad - dt);
      spawnT -= dt;
      const rate = M.clamp(0.62 - (TIME - time) * 0.016, 0.2, 0.62);
      if (spawnT <= 0) { spawn(); spawnT = rate; }
      for (const h of holes) {
        if (!h.kind) { h.up = Math.max(0, h.up - dt * 5); continue; }
        h.t += dt;
        h.up = M.clamp(h.t * 7, 0, 1);
        if (h.t > h.life) {
          if (h.kind !== 'bomb') { combo = 0; misses++; }
          h.kind = null; h.t = 0;
        }
      }
      const i = api.input;
      for (const e of i.events) if (e.type === 'tap') whack(e.x, e.y);
      if (i.pressed.a) { const p = i.pointer; if (p.x !== undefined) whack(p.x, p.y); }
      if (time <= 0) {
        over = true; time = 0;
        const acc = hits + misses ? Math.round(hits / (hits + misses) * 100) : 0;
        score += acc + bestCombo * 15;
        api.score(score);
        Sound.win();
        setTimeout(() => api.over(score), 900);
      }
      api.setHud(`⏱ <b style="color:${time < 6 ? '#ff4d6d' : '#8ee06b'}">${time.toFixed(1)}</b> · комбо ${combo} · точность ${hits + misses ? Math.round(hits / (hits + misses) * 100) : 0}%`);
    }

    function hole(c, h) {
      const r = cs * 0.42;
      // яма
      c.fillStyle = '#241a0e';
      c.beginPath(); c.ellipse(h.x, h.y + r * 0.32, r * 1.02, r * 0.42, 0, 0, 7); c.fill();
      c.fillStyle = '#120c06';
      c.beginPath(); c.ellipse(h.x, h.y + r * 0.3, r * 0.86, r * 0.3, 0, 0, 7); c.fill();
      if (!h.kind || h.up <= 0.01) return;
      const k = h.up;
      const yy = h.y + r * 0.3 - r * 0.95 * k;
      c.save();
      c.beginPath(); c.rect(h.x - r * 1.2, h.y - r * 1.6, r * 2.4, r * 1.9); c.clip();
      if (h.kind === 'bomb') {
        c.fillStyle = '#2b2b2b';
        c.beginPath(); c.arc(h.x, yy, r * 0.62, 0, 7); c.fill();
        c.strokeStyle = '#a56a3a'; c.lineWidth = 3;
        c.beginPath(); c.moveTo(h.x, yy - r * 0.6); c.quadraticCurveTo(h.x + r * 0.3, yy - r, h.x + r * 0.1, yy - r * 1.1); c.stroke();
        const f = 0.6 + Math.sin(popFx * 20) * 0.4;
        c.fillStyle = `rgba(255,${Math.round(120 * f)},40,${f})`;
        c.beginPath(); c.arc(h.x + r * 0.1, yy - r * 1.15, r * 0.16 * f, 0, 7); c.fill();
      } else {
        const gold = h.kind === 'gold';
        c.fillStyle = gold ? '#ffd43b' : '#a56a3a';
        c.beginPath(); c.ellipse(h.x, yy, r * 0.56, r * 0.62, 0, 0, 7); c.fill();
        c.fillStyle = gold ? '#ffe9a8' : '#d8a878';
        c.beginPath(); c.ellipse(h.x, yy + r * 0.18, r * 0.38, r * 0.32, 0, 0, 7); c.fill();
        c.fillStyle = gold ? '#a8801a' : '#6b4423';
        c.beginPath(); c.arc(h.x - r * 0.2, yy - r * 0.12, r * 0.07, 0, 7); c.fill();
        c.beginPath(); c.arc(h.x + r * 0.2, yy - r * 0.12, r * 0.07, 0, 7); c.fill();
        c.beginPath(); c.arc(h.x, yy + r * 0.12, r * 0.08, 0, 7); c.fill();
        // уши
        c.fillStyle = gold ? '#ffd43b' : '#a56a3a';
        c.beginPath(); c.arc(h.x - r * 0.42, yy - r * 0.42, r * 0.17, 0, 7); c.fill();
        c.beginPath(); c.arc(h.x + r * 0.42, yy - r * 0.42, r * 0.17, 0, 7); c.fill();
        if (gold) {
          c.font = `${Math.round(r * 0.4)}px system-ui`; c.textAlign = 'center';
          c.fillText('👑', h.x, yy - r * 0.6);
        }
      }
      c.restore();
    }

    function draw(c) {
      const W = api.W, H = api.H;
      const g = c.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, '#2f6b2f'); g.addColorStop(1, '#14331a');
      c.fillStyle = g; c.fillRect(0, 0, W, H);
      c.fillStyle = 'rgba(0,0,0,.12)';
      for (let i = 0; i < 40; i++) {
        const x = (i * 97) % W, y = (i * 61) % H;
        c.fillRect(x, y, 3, 8);
      }
      holes.forEach(h => hole(c, h));
      if (shakeBad > 0) { c.fillStyle = `rgba(255,0,50,${shakeBad * 0.4})`; c.fillRect(0, 0, W, H); }
      // таймер-полоса
      c.fillStyle = 'rgba(0,0,0,.35)';
      c.fillRect(W * 0.08, H - 26, W * 0.84, 8);
      c.fillStyle = time < 6 ? '#ff4d6d' : '#8ee06b';
      c.fillRect(W * 0.08, H - 26, W * 0.84 * (time / TIME), 8);
    }

    return { reset, update, draw, resize: () => layout() };
  },
};
