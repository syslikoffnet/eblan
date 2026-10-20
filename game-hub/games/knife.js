 /* Метатель ножей (Knife Hit) */
import { M, Sound } from '../engine.js';

const norm = a => ((a % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
const angDiff = (a, b) => { const d = Math.abs(norm(a) - norm(b)); return d > Math.PI ? Math.PI * 2 - d : d; };

export default {
  init(api) {
    let angle, speed, pattern, patT, knives, stuck, apples, thrown, needed, level, score,
      dead, fly, logR, cx, cy, lives, breakT;

    function layout() {
      logR = Math.min(api.W * 0.24, api.H * 0.16);
      cx = api.W / 2; cy = api.H * 0.33;
    }

    function buildLevel() {
      needed = 5 + Math.min(5, level);
      thrown = 0; stuck = []; apples = [];
      const nA = level > 1 ? M.rint(1, 3) : 1;
      for (let i = 0; i < nA; i++) apples.push({ a: M.rand(0, Math.PI * 2), gone: false });
      pattern = level === 1 ? 'const' : M.pick(['const', 'pulse', 'reverse', 'burst', 'sine']);
      speed = (1.1 + level * 0.16) * (M.chance(0.5) ? 1 : -1);
      patT = 0; breakT = 0;
    }

    function reset() {
      layout();
      level = 1; score = 0; dead = false; fly = null; lives = 1; angle = 0;
      buildLevel();
      api.score(0);
    }

    function throwKnife() {
      if (dead || fly || thrown >= needed) return;
      fly = { y: api.H * 0.78, t: 0 };
      thrown++;
      Sound.blip(760);
    }

    function fail() {
      dead = true; Sound.boom(); api.shake(18, 0.5);
      api.emit(cx, cy, { n: 40, color: '#c9d1ff', speedMax: 460, life: 1 });
      setTimeout(() => api.over(score), 900);
    }

    function update(dt) {
      if (dead) { angle += dt * 0.6; return; }
      patT += dt;
      let sp = speed;
      if (pattern === 'pulse') sp = speed * (Math.sin(patT * 2.2) > 0 ? 1.7 : 0.35);
      else if (pattern === 'reverse') sp = speed * (Math.floor(patT / 1.6) % 2 ? -1 : 1);
      else if (pattern === 'burst') sp = speed * (patT % 2 < 0.4 ? 2.6 : 0.7);
      else if (pattern === 'sine') sp = speed * (0.5 + Math.abs(Math.sin(patT * 1.3)) * 1.6);
      angle += sp * dt;

      if (api.input.pressed.a) throwKnife();

      if (fly) {
        fly.y -= api.H * 3.4 * dt;
        if (fly.y <= cy + logR) {
          const rel = norm(-Math.PI / 2 - angle);    // нож входит сверху
          for (const s of stuck) {
            if (angDiff(s, rel) < 0.19) { fly = null; return fail(); }
          }
          stuck.push(rel);
          fly = null;
          Sound.hit(); api.shake(4, 0.12);
          score += 10; api.score(score);
          api.emit(cx, cy - logR, { n: 8, color: '#fff', speedMax: 180, life: 0.35 });
          // яблоки
          for (const a of apples) {
            if (a.gone) continue;
            if (angDiff(a.a, rel) < 0.16) {
              a.gone = true; score += 100; api.score(score); Sound.coin();
              api.emit(cx + Math.cos(a.a + angle) * logR, cy + Math.sin(a.a + angle) * logR,
                { n: 20, color: '#8ee06b', speedMax: 300, life: 0.7 });
            }
          }
          if (stuck.length >= needed) {
            score += 100 * level; api.score(score); level++;
            Sound.win();
            api.emit(cx, cy, { n: 44, color: '#ffd43b', speedMax: 420, life: 1.1 });
            breakT = 1;
            setTimeout(() => { if (!dead) buildLevel(); }, 800);
          }
        }
      }
      breakT = Math.max(0, breakT - dt);
      api.setHud(`уровень <b style="color:#c9d1ff">${level}</b> · ножей ${needed - stuck.length} · ${pattern}`);
    }

    function draw(c) {
      const W = api.W, H = api.H;
      const g = c.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, '#23233f'); g.addColorStop(1, '#0d0d18');
      c.fillStyle = g; c.fillRect(0, 0, W, H);
      c.fillStyle = 'rgba(255,255,255,.05)';
      for (let i = 0; i < 40; i++) c.fillRect((i * 83) % W, (i * 137) % H, 2, 2);

      // бревно
      c.save(); c.translate(cx, cy); c.rotate(angle);
      const rg = c.createRadialGradient(-logR * 0.3, -logR * 0.3, logR * 0.1, 0, 0, logR);
      rg.addColorStop(0, '#8a5a2b'); rg.addColorStop(1, '#4a2f14');
      c.fillStyle = rg;
      if (breakT > 0) { c.globalAlpha = 0.5 + 0.5 * Math.abs(Math.sin(breakT * 30)); }
      c.beginPath(); c.arc(0, 0, logR, 0, 7); c.fill();
      c.globalAlpha = 1;
      c.strokeStyle = 'rgba(0,0,0,.35)'; c.lineWidth = 3;
      for (let k = 1; k <= 3; k++) { c.beginPath(); c.arc(0, 0, logR * k / 4, 0, 7); c.stroke(); }
      // яблоки
      for (const a of apples) {
        if (a.gone) continue;
        const x = Math.cos(a.a) * logR * 0.98, y = Math.sin(a.a) * logR * 0.98;
        c.fillStyle = '#ff4d4d';
        c.beginPath(); c.arc(x, y, logR * 0.14, 0, 7); c.fill();
        c.strokeStyle = '#4a2f14'; c.lineWidth = 2;
        c.beginPath(); c.moveTo(x, y - logR * 0.12); c.lineTo(x + logR * 0.05, y - logR * 0.22); c.stroke();
      }
      // воткнутые ножи
      for (const s of stuck) {
        c.save();
        c.rotate(s + Math.PI / 2);
        c.translate(0, -logR);
        knife(c, logR * 0.16);
        c.restore();
      }
      c.restore();

      // летящий нож
      if (fly) {
        c.save(); c.translate(cx, fly.y);
        knife(c, logR * 0.19);
        c.restore();
      }

      // очередь ножей внизу
      const left = needed - stuck.length - (fly ? 1 : 0);
      for (let k = 0; k < Math.max(0, left); k++) {
        c.save();
        c.translate(cx, H * 0.72 + k * logR * 0.42);
        knife(c, logR * 0.17);
        c.restore();
      }
      c.fillStyle = 'rgba(255,255,255,.35)'; c.textAlign = 'center';
      c.font = `700 ${Math.round(W * 0.035)}px system-ui`;
      if (level === 1 && stuck.length === 0) c.fillText('тап — бросок ножа', W / 2, H * 0.93);
    }

    function knife(c, s) {
      c.fillStyle = '#c9d1ff';
      c.beginPath();
      c.moveTo(0, -s * 2.4); c.lineTo(s * 0.42, -s * 0.4); c.lineTo(-s * 0.42, -s * 0.4);
      c.closePath(); c.fill();
      c.fillStyle = '#6b4423';
      M.roundRect(c, -s * 0.34, -s * 0.5, s * 0.68, s * 1.8, s * 0.3); c.fill();
      c.fillStyle = 'rgba(255,255,255,.18)';
      c.fillRect(-s * 0.34, -s * 0.1, s * 0.68, s * 0.16);
    }

    return { reset, update, draw, resize: () => layout() };
  },
};
