 /* Doodle Jump */
import { M, Sound } from '../engine.js';

export default {
  init(api) {
    let p, plats, camY, score, dead, height, springs, shootT, bullets, monsters;

    const PH = () => Math.max(12, api.H * 0.02);

    function reset() {
      const W = api.W, H = api.H;
      p = { x: W / 2, y: H - 90, vx: 0, vy: 0, r: Math.max(14, W * 0.045), face: 1 };
      plats = []; camY = 0; score = 0; dead = false; height = 0; bullets = []; monsters = [];
      plats.push({ x: W / 2 - 34, y: H - 60, w: 68, h: PH(), type: 'normal', hp: 1 });
      let y = H - 60;
      while (y > -H * 2) { y -= M.rand(H * 0.07, H * 0.13); y -= 0; addPlat(y); }
      p.vy = -H * 0.9;
      api.score(0);
    }

    function addPlat(y) {
      const W = api.W, H = api.H;
      const diff = M.clamp(-y / (H * 6), 0, 1);
      const w = M.lerp(76, 48, diff);
      let type = 'normal';
      const r = Math.random();
      if (r < 0.07 + diff * 0.05) type = 'moving';
      else if (r < 0.12 + diff * 0.12) type = 'break';
      else if (r < 0.16) type = 'spring';
      const pl = { x: M.rand(6, W - w - 6), y, w, h: PH(), type, hp: 1, dir: M.chance(0.5) ? 1 : -1, spd: W * M.rand(0.25, 0.5), spring: false };
      if (type === 'spring') pl.spring = true;
      plats.push(pl);
      if (type === 'moving') pl.vx = pl.spd * pl.dir;
    }

    function jump(mult = 1) {
      p.vy = -api.H * 0.78 * mult;
      Sound.jump();
      api.emit(p.x, p.y + p.r, { n: 5, color: '#8ee06b', speedMax: 110, life: 0.35, dir: Math.PI / 2, spread: 0.8 });
    }

    function update(dt) {
      const W = api.W, H = api.H;
      if (dead) {
        p.vy += H * 1.9 * dt; p.y += p.vy * dt; p.rot = (p.rot || 0) + dt * 8;
        return;
      }
      // управление: палец тянет, кнопки тоже
      const i = api.input;
      let target = null;
      if (i.pointer.down) target = i.pointer.x;
      const mv = (i.held.left ? -1 : 0) + (i.held.right ? 1 : 0);
      if (mv) { p.vx = M.clamp(p.vx + mv * W * 5 * dt, -W * 1.05, W * 1.05); }
      else if (target !== null) {
        p.vx = M.clamp((target - p.x) * 7, -W * 1.2, W * 1.2);
      } else p.vx *= 0.9;
      p.x += p.vx * dt;
      if (p.x < -p.r) p.x = W + p.r;
      if (p.x > W + p.r) p.x = -p.r;
      if (p.vx > 10) p.face = 1; else if (p.vx < -10) p.face = -1;

      p.vy += H * 1.9 * dt;
      p.y += p.vy * dt;

      if (i.pressed.a || i.pressed.up) {
        bullets.push({ x: p.x, y: p.y - p.r, vy: -H * 1.5, t: 1.2 });
        Sound.blip(700);
      }
      bullets.forEach(b => { b.y += b.vy * dt; b.t -= dt; });
      bullets = bullets.filter(b => b.t > 0 && b.y > camY - 20);

      // платформы
      for (const pl of plats) {
        if (pl.type === 'moving') {
          pl.x += pl.vx * dt;
          if (pl.x < 0) { pl.x = 0; pl.vx = Math.abs(pl.vx); }
          if (pl.x + pl.w > W) { pl.x = W - pl.w; pl.vx = -Math.abs(pl.vx); }
        }
      }

      if (p.vy > 0) {
        for (const pl of plats) {
          if (pl.hp <= 0) continue;
          if (p.x + p.r * 0.6 > pl.x && p.x - p.r * 0.6 < pl.x + pl.w &&
            p.y + p.r > pl.y && p.y + p.r < pl.y + pl.h + Math.max(14, p.vy * dt + 6)) {
            if (pl.type === 'break') {
              pl.hp = 0; Sound.hit();
              api.emit(pl.x + pl.w / 2, pl.y, { n: 12, color: '#a56a3a', speedMax: 200, life: 0.6 });
              continue;
            }
            p.y = pl.y - p.r;
            jump(pl.spring ? 1.85 : 1);
            if (pl.spring) { Sound.power(); pl.spring = false; pl.used = true; }
          }
        }
      }

      // камера
      const follow = H * 0.45;
      if (p.y - camY < follow) {
        const d = follow - (p.y - camY);
        camY -= d;
        height += d;
        score = Math.max(score, Math.floor(height / 10));
        api.score(score);
      }

      // генерация сверху, чистка снизу
      const topY = camY - H * 0.5;
      let minY = Math.min(...plats.map(pl => pl.y));
      while (minY > topY) {
        const gap = M.rand(H * 0.065, H * 0.135) * (1 + M.clamp(score / 400, 0, 0.7));
        minY -= gap;
        addPlat(minY);
      }
      plats = plats.filter(pl => pl.y < camY + H * 1.4 && pl.hp > 0);

      // смерть
      if (p.y - camY > H + 40) {
        dead = true; Sound.boom(); api.shake(10, 0.35); p.vy = -H * 0.3;
        setTimeout(() => api.over(score), 800);
      }
      api.setHud(`высота <b style="color:#8ee06b">${score} м</b>`);
    }

    function draw(c) {
      const W = api.W, H = api.H;
      const k = M.clamp(score / 500, 0, 1);
      const g = c.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, `rgb(${Math.round(20 + 10 * k)},${Math.round(30 + 40 * (1 - k))},${Math.round(60 + 60 * k)})`);
      g.addColorStop(1, '#0e1a2a');
      c.fillStyle = g; c.fillRect(0, 0, W, H);
      c.fillStyle = 'rgba(255,255,255,.35)';
      for (let i = 0; i < 30; i++) {
        const sx = (i * 137.5) % W;
        const sy = ((i * 89.3 - camY * 0.3) % H + H) % H;
        c.fillRect(sx, sy, 2, 2);
      }

      c.save(); c.translate(0, -camY);
      for (const pl of plats) {
        if (pl.y < camY - 30 || pl.y > camY + H + 30) continue;
        const col = pl.type === 'break' ? '#a56a3a' : pl.type === 'moving' ? '#7ad7ff' : '#8ee06b';
        c.fillStyle = col;
        M.roundRect(c, pl.x, pl.y, pl.w, pl.h, 5); c.fill();
        c.fillStyle = 'rgba(0,0,0,.18)'; c.fillRect(pl.x, pl.y + pl.h - 3, pl.w, 3);
        if (pl.spring && !pl.used) {
          c.fillStyle = '#ffd43b';
          c.fillRect(pl.x + pl.w / 2 - 4, pl.y - 9, 8, 9);
          c.fillStyle = '#ff4d6d'; c.fillRect(pl.x + pl.w / 2 - 6, pl.y - 12, 12, 4);
        }
      }
      c.fillStyle = '#fff';
      for (const b of bullets) { c.beginPath(); c.arc(b.x, b.y, 3.5, 0, 7); c.fill(); }

      // герой
      c.save();
      c.translate(p.x, p.y); c.rotate(p.rot || 0); c.scale(p.face, 1);
      const r = p.r;
      c.fillStyle = '#8ee06b'; c.beginPath(); c.ellipse(0, 0, r, r * 0.92, 0, 0, 7); c.fill();
      c.strokeStyle = 'rgba(0,0,0,.3)'; c.lineWidth = 2; c.stroke();
      c.fillStyle = '#fff'; c.beginPath(); c.arc(r * 0.35, -r * 0.25, r * 0.3, 0, 7); c.fill();
      c.fillStyle = '#222'; c.beginPath(); c.arc(r * 0.45, -r * 0.25, r * 0.14, 0, 7); c.fill();
      c.fillStyle = '#f5a623';
      c.beginPath(); c.moveTo(r * 0.7, r * 0.05); c.lineTo(r * 1.25, r * 0.18); c.lineTo(r * 0.7, r * 0.35); c.closePath(); c.fill();
      c.restore();
      c.restore();

      if (score < 3 && !dead) {
        c.fillStyle = 'rgba(255,255,255,.55)'; c.textAlign = 'center';
        c.font = `700 ${Math.round(W * 0.042)}px system-ui`;
        c.fillText('води пальцем — прыгун летит за ним', W / 2, H * 0.16);
      }
    }

    return { reset, update, draw };
  },
};
