 /* Aim-тренажёр: реакция и точность */
import { M, Sound } from '../engine.js';

const TIME = 30;

export default {
  init(api) {
    let targets, time, score, hits, shots, combo, best, spawnT, over, react, lastSpawn;

    function reset() {
      targets = []; time = TIME; score = 0; hits = 0; shots = 0; combo = 0; best = 0;
      spawnT = 0; over = false; react = []; lastSpawn = 0;
      api.score(0);
      for (let i = 0; i < 2; i++) spawn();
    }

    function spawn() {
      const W = api.W, H = api.H;
      const p = TIME - time;
      const r = M.rand(Math.max(16, W * 0.085 - p * 0.9), Math.max(26, W * 0.14 - p * 0.6));
      for (let tries = 0; tries < 20; tries++) {
        const x = M.rand(r + 8, W - r - 8), y = M.rand(H * 0.12 + r, H * 0.88 - r);
        if (targets.every(t => M.dist(t.x, t.y, x, y) > t.r + r + 12)) {
          targets.push({
            x, y, r, born: api.t, life: M.clamp(2.1 - p * 0.035, 0.85, 2.1),
            gold: M.chance(0.1), vx: p > 12 ? M.rand(-1, 1) * W * 0.08 : 0, vy: 0, pop: 0,
          });
          lastSpawn = api.t;
          return;
        }
      }
    }

    function shoot(x, y) {
      if (over) return;
      shots++;
      let hitIdx = -1;
      for (let i = targets.length - 1; i >= 0; i--) {
        const t = targets[i];
        if (M.dist(x, y, t.x, t.y) < t.r) { hitIdx = i; break; }
      }
      if (hitIdx < 0) {
        combo = 0; score = Math.max(0, score - 15); api.score(score);
        Sound.blip(150);
        api.emit(x, y, { n: 5, color: '#ff4d6d', speedMax: 110, life: 0.3 });
        return;
      }
      const t = targets[hitIdx];
      targets.splice(hitIdx, 1);
      hits++; combo++;
      const rt = api.t - t.born;
      react.push(rt);
      if (react.length > 8) react.shift();
      const speedBonus = Math.max(0, Math.round((t.life - rt) * 60));
      const centerBonus = Math.round((1 - M.dist(x, y, t.x, t.y) / t.r) * 30);
      const gain = (t.gold ? 150 : 50) + speedBonus + centerBonus + Math.min(100, combo * 6);
      score += gain; api.score(score);
      best = Math.max(best, combo);
      Sound[t.gold ? 'power' : 'coin']();
      api.emit(t.x, t.y, { n: t.gold ? 30 : 16, color: t.gold ? '#ffd43b' : '#7ad7ff', speedMax: 320, life: 0.6 });
      api.setHud(hudText());
    }

    function hudText() {
      const avg = react.length ? (react.reduce((a, b) => a + b, 0) / react.length * 1000) : 0;
      return `⏱ <b style="color:${time < 6 ? '#ff4d6d' : '#8ee06b'}">${time.toFixed(1)}</b> · комбо ${combo} · реакция ${avg ? Math.round(avg) + 'мс' : '—'} · точность ${shots ? Math.round(hits / shots * 100) : 0}%`;
    }

    function update(dt) {
      if (over) return;
      time -= dt;
      const p = TIME - time;
      spawnT -= dt;
      const want = p > 20 ? 2 : p > 10 ? 3 : 4;
      if (spawnT <= 0 || targets.length < want) {
        if (targets.length < want + 1) spawn();
        spawnT = M.clamp(0.75 - p * 0.014, 0.28, 0.75);
      }
      for (let i = targets.length - 1; i >= 0; i--) {
        const t = targets[i];
        t.x += t.vx * dt; t.y += t.vy * dt;
        if (t.x < t.r || t.x > api.W - t.r) t.vx *= -1;
        if (api.t - t.born > t.life) {
          targets.splice(i, 1); combo = 0;
          score = Math.max(0, score - 25); api.score(score);
          Sound.blip(190);
          api.emit(t.x, t.y, { n: 6, color: '#888', speedMax: 120, life: 0.4 });
        }
      }
      const i = api.input;
      for (const e of i.events) if (e.type === 'tap') shoot(e.x, e.y);
      if (i.pressed.a) shoot(i.pointer.x, i.pointer.y);
      if (time <= 0) {
        over = true; time = 0;
        const acc = shots ? hits / shots : 0;
        score += Math.round(acc * 400 + best * 25);
        api.score(score); Sound.win();
        setTimeout(() => api.over(score), 900);
      }
      api.setHud(hudText());
    }

    function draw(c) {
      const W = api.W, H = api.H;
      const g = c.createRadialGradient(W / 2, H / 2, 30, W / 2, H / 2, H);
      g.addColorStop(0, '#2a1010'); g.addColorStop(1, '#0b0708');
      c.fillStyle = g; c.fillRect(0, 0, W, H);
      c.strokeStyle = 'rgba(255,255,255,.05)'; c.lineWidth = 1;
      for (let x = 0; x < W; x += 34) { c.beginPath(); c.moveTo(x, 0); c.lineTo(x, H); c.stroke(); }
      for (let y = 0; y < H; y += 34) { c.beginPath(); c.moveTo(0, y); c.lineTo(W, y); c.stroke(); }

      for (const t of targets) {
        const age = (api.t - t.born) / t.life;
        const k = age > 0.75 ? 0.5 + 0.5 * Math.abs(Math.sin(age * 22)) : 1;
        c.globalAlpha = M.clamp(k, 0.25, 1);
        const col = t.gold ? '#ffd43b' : '#ff4d4d';
        c.fillStyle = col; c.beginPath(); c.arc(t.x, t.y, t.r, 0, 7); c.fill();
        c.fillStyle = '#fff'; c.beginPath(); c.arc(t.x, t.y, t.r * 0.66, 0, 7); c.fill();
        c.fillStyle = col; c.beginPath(); c.arc(t.x, t.y, t.r * 0.4, 0, 7); c.fill();
        c.fillStyle = '#fff'; c.beginPath(); c.arc(t.x, t.y, t.r * 0.14, 0, 7); c.fill();
        // полоска времени
        c.globalAlpha = 0.8;
        c.strokeStyle = 'rgba(0,0,0,.45)'; c.lineWidth = 3;
        c.beginPath(); c.arc(t.x, t.y, t.r + 6, -Math.PI / 2, -Math.PI / 2 + (1 - age) * Math.PI * 2); c.stroke();
        c.globalAlpha = 1;
        void t.pop;
      }
      // таймер
      c.fillStyle = 'rgba(0,0,0,.4)';
      c.fillRect(W * 0.06, 40, W * 0.88, 7);
      c.fillStyle = time < 6 ? '#ff4d6d' : '#ffd400';
      c.fillRect(W * 0.06, 40, W * 0.88 * (time / TIME), 7);
      if (combo > 2) {
        c.fillStyle = 'rgba(255,212,59,.9)'; c.textAlign = 'center';
        c.font = `900 ${Math.round(W * 0.07)}px system-ui`;
        c.fillText(`x${combo}`, W / 2, H * 0.14);
      }
    }

    return { reset, update, draw };
  },
};
