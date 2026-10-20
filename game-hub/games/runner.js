 /* Geometry Dash / Dino runner */
import { M, Sound } from '../engine.js';

export default {
  init(api) {
    let p, obs, coins, speed, dist, dead, groundY, jumpHold, tSpawn, tCoin, attempt, bg, rot;

    function reset() {
      const W = api.W, H = api.H;
      groundY = H * 0.78;
      p = { x: W * 0.26, y: groundY, vy: 0, s: Math.max(20, W * 0.062), onGround: true };
      obs = []; coins = []; speed = W * 0.52; dist = 0; dead = false;
      tSpawn = 0.9; tCoin = 1.4; attempt = (api.Store.get('attempt_runner', 0) || 0) + 1;
      api.Store.set('attempt_runner', attempt);
      bg = { off: 0 }; rot = 0; jumpHold = 0;
      api.score(0);
    }

    function jump() {
      if (dead) return;
      if (p.onGround) {
        p.vy = -api.H * 0.92; p.onGround = false; jumpHold = 0.16;
        Sound.jump();
        api.emit(p.x, groundY, { n: 6, color: '#ff9f68', speedMax: 140, life: 0.35, dir: Math.PI / 2, spread: 1 });
      }
    }

    function addObs() {
      const W = api.W, H = api.H;
      const r = Math.random();
      const base = { x: W + 40, passed: false };
      if (r < 0.42) obs.push({ ...base, type: 'spike', w: p.s * 0.95, h: p.s * 0.95 });
      else if (r < 0.62) obs.push({ ...base, type: 'spike3', w: p.s * 2.6, h: p.s * 0.95 });
      else if (r < 0.82) {
        const h = p.s * M.rand(1.1, 2.0);
        obs.push({ ...base, type: 'block', w: p.s * 1.1, h });
      } else {
        const h = p.s * M.rand(1.6, 2.4);
        obs.push({ ...base, type: 'block', w: p.s * 1.1, h });
        obs.push({ x: W + 40 + p.s * 3.2, type: 'spike', w: p.s * 0.95, h: p.s * 0.95, passed: false });
      }
    }

    function update(dt) {
      const W = api.W, H = api.H;
      if (dead) { rot += dt * 6; return; }
      if (api.input.pressed.a || api.input.pressed.up) jump();
      if (api.input.held.a && p.onGround) jump();   // «держи — прыгай серией»

      speed = W * (0.52 + Math.min(0.42, dist / 6000));
      dist += speed * dt;
      api.score(Math.floor(dist / 12));
      bg.off = (bg.off + speed * 0.25 * dt) % 200;

      // физика
      if (jumpHold > 0 && api.input.held.a) { jumpHold -= dt; p.vy -= H * 1.2 * dt; }
      p.vy += H * 2.9 * dt;
      p.y += p.vy * dt;
      if (!p.onGround) rot += dt * 7.2;
      let landY = groundY;

      tSpawn -= dt; tCoin -= dt;
      if (tSpawn <= 0) { addObs(); tSpawn = M.rand(0.75, 1.5) * (W * 0.52 / speed) + 0.25; }
      if (tCoin <= 0) {
        coins.push({ x: W + 30, y: groundY - p.s * M.rand(1.2, 3.2), r: p.s * 0.32, t: 0 });
        tCoin = M.rand(1.1, 2.4);
      }

      for (const o of obs) o.x -= speed * dt;
      for (const cn of coins) cn.x -= speed * dt;
      obs = obs.filter(o => o.x + o.w > -30);
      coins = coins.filter(c2 => c2.x > -30);

      // приземление на блоки
      for (const o of obs) {
        if (o.type !== 'block') continue;
        const top = groundY - o.h;
        if (p.x + p.s * 0.4 > o.x && p.x - p.s * 0.4 < o.x + o.w) {
          if (p.y >= top - 2 && p.y <= top + Math.max(16, p.vy * dt + 8) && p.vy >= 0) {
            landY = Math.min(landY, top);
          } else if (p.y - p.s > top && p.x + p.s * 0.45 > o.x && p.x - p.s * 0.45 < o.x + o.w) {
            return die();
          } else if (p.y < top + o.h && p.y > top && p.x + p.s * 0.4 > o.x && p.x - p.s * 0.2 < o.x) {
            return die();
          }
        }
      }

      if (p.y >= landY) {
        if (!p.onGround) { Sound.blip(200); rot = Math.round(rot / (Math.PI / 2)) * (Math.PI / 2); }
        p.y = landY; p.vy = 0; p.onGround = true;
      } else p.onGround = false;

      // шипы
      for (const o of obs) {
        if (o.type === 'block') continue;
        const n = o.type === 'spike3' ? 3 : 1;
        for (let k = 0; k < n; k++) {
          const sx = o.x + k * (o.w / (n === 3 ? 3 : 1)) * (n === 3 ? 1 : 1);
          const sw = n === 3 ? o.w / 3 : o.w;
          if (M.hit(p.x - p.s * 0.34, p.y - p.s * 0.92, p.s * 0.68, p.s * 0.9,
            sx + sw * 0.18, groundY - o.h * 0.9, sw * 0.64, o.h * 0.9)) return die();
        }
      }

      for (let i = coins.length - 1; i >= 0; i--) {
        const cn = coins[i];
        if (M.dist(p.x, p.y - p.s * 0.5, cn.x, cn.y) < cn.r + p.s * 0.5) {
          coins.splice(i, 1); api.addScore(25); Sound.coin();
          api.emit(cn.x, cn.y, { n: 12, color: '#ffd43b', speedMax: 200, life: 0.5 });
        }
      }
      api.setHud(`попытка №${attempt} · <b style="color:#ff5e9c">${Math.floor(dist / 12)} м</b>`);
    }

    function die() {
      dead = true; Sound.boom(); api.shake(14, 0.4);
      api.emit(p.x, p.y - p.s / 2, { n: 34, color: '#ff5e9c', speedMax: 380, life: 0.9 });
      setTimeout(() => api.over(Math.floor(dist / 12)), 750);
    }

    function draw(c) {
      const W = api.W, H = api.H;
      const g = c.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, '#2b1b4d'); g.addColorStop(0.6, '#5b2a6e'); g.addColorStop(1, '#1a0f2e');
      c.fillStyle = g; c.fillRect(0, 0, W, H);

      // фон-сетка
      c.strokeStyle = 'rgba(255,255,255,.06)'; c.lineWidth = 2;
      for (let x = -bg.off; x < W; x += 66) { c.beginPath(); c.moveTo(x, 0); c.lineTo(x, groundY); c.stroke(); }
      for (let y = groundY - 66; y > 0; y -= 66) { c.beginPath(); c.moveTo(0, y); c.lineTo(W, y); c.stroke(); }

      // земля
      c.fillStyle = '#12081f'; c.fillRect(0, groundY, W, H - groundY);
      c.fillStyle = '#ff5e9c'; c.fillRect(0, groundY - 3, W, 3);
      c.strokeStyle = 'rgba(255,94,156,.25)'; c.lineWidth = 2;
      const off = (dist * 0.6) % 40;
      for (let x = -off; x < W; x += 40) {
        c.beginPath(); c.moveTo(x, groundY + 6); c.lineTo(x - 20, H); c.stroke();
      }

      // препятствия
      for (const o of obs) {
        if (o.type === 'block') {
          c.fillStyle = '#3ad0ff';
          M.roundRect(c, o.x, groundY - o.h, o.w, o.h, 4); c.fill();
          c.fillStyle = 'rgba(255,255,255,.25)'; c.fillRect(o.x, groundY - o.h, o.w, 4);
        } else {
          const n = o.type === 'spike3' ? 3 : 1;
          const sw = o.w / n;
          for (let k = 0; k < n; k++) {
            c.fillStyle = '#ff9f68';
            c.beginPath();
            c.moveTo(o.x + k * sw, groundY);
            c.lineTo(o.x + k * sw + sw / 2, groundY - o.h);
            c.lineTo(o.x + (k + 1) * sw, groundY);
            c.closePath(); c.fill();
            c.strokeStyle = 'rgba(0,0,0,.3)'; c.lineWidth = 1.5; c.stroke();
          }
        }
      }
      // монеты
      for (const cn of coins) {
        c.save(); c.translate(cn.x, cn.y);
        const sc = Math.abs(Math.cos(api.t * 4 + cn.x * 0.02));
        c.scale(sc * 0.6 + 0.4, 1);
        c.fillStyle = '#ffd43b'; c.beginPath(); c.arc(0, 0, cn.r, 0, 7); c.fill();
        c.fillStyle = 'rgba(255,255,255,.6)'; c.beginPath(); c.arc(-cn.r * 0.25, -cn.r * 0.25, cn.r * 0.3, 0, 7); c.fill();
        c.restore();
      }

      // куб
      c.save();
      c.translate(p.x, p.y - p.s / 2); c.rotate(rot);
      c.fillStyle = '#ffe14d'; c.shadowColor = '#ff5e9c'; c.shadowBlur = 16;
      M.roundRect(c, -p.s / 2, -p.s / 2, p.s, p.s, 5); c.fill(); c.shadowBlur = 0;
      c.fillStyle = '#2b1b4d';
      c.fillRect(-p.s * 0.26, -p.s * 0.16, p.s * 0.2, p.s * 0.2);
      c.fillRect(p.s * 0.08, -p.s * 0.16, p.s * 0.2, p.s * 0.2);
      c.fillRect(-p.s * 0.2, p.s * 0.14, p.s * 0.4, p.s * 0.08);
      c.restore();
      if (dead) { c.fillStyle = 'rgba(255,0,80,.18)'; c.fillRect(0, 0, W, H); }
    }

    return { reset, update, draw };
  },
};
