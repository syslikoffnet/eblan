 /* Астероиды */
import { M, Sound } from '../engine.js';

export default {
  init(api) {
    let ship, rocks, shots, ufo, ufoShots, particles2, score, lives, wave, dead, respawn, invuln, hyperT;

    function reset() {
      const W = api.W, H = api.H;
      ship = { x: W / 2, y: H / 2, vx: 0, vy: 0, a: -Math.PI / 2, cool: 0, thrust: 0 };
      rocks = []; shots = []; ufoShots = []; ufo = null;
      score = 0; lives = 3; wave = 0; dead = false; respawn = 0; invuln = 2; hyperT = 0;
      api.score(0);
      nextWave();
    }

    function nextWave() {
      wave++;
      const W = api.W, H = api.H;
      const n = 3 + wave;
      for (let i = 0; i < n; i++) {
        let x, y;
        do { x = M.rand(0, W); y = M.rand(0, H); } while (M.dist(x, y, ship.x, ship.y) < Math.min(W, H) * 0.3);
        rocks.push(makeRock(x, y, 3));
      }
      Sound.power();
    }

    function makeRock(x, y, size) {
      const W = api.W;
      const r = W * (size === 3 ? 0.075 : size === 2 ? 0.045 : 0.026);
      const a = M.rand(0, Math.PI * 2);
      const sp = W * (0.06 + (4 - size) * 0.045 + wave * 0.006) * M.rand(0.7, 1.3);
      const shape = [];
      const pts = 9;
      for (let i = 0; i < pts; i++) shape.push(0.72 + Math.random() * 0.5);
      return { x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, r, size, shape, rot: M.rand(0, 7), vr: M.rand(-1.2, 1.2) };
    }

    function wrap(o) {
      const W = api.W, H = api.H, m = 30;
      if (o.x < -m) o.x = W + m; if (o.x > W + m) o.x = -m;
      if (o.y < -m) o.y = H + m; if (o.y > H + m) o.y = -m;
    }

    function fire() {
      if (ship.cool > 0 || dead || shots.length > 5) return;
      shots.push({
        x: ship.x + Math.cos(ship.a) * 14, y: ship.y + Math.sin(ship.a) * 14,
        vx: Math.cos(ship.a) * api.W * 1.1 + ship.vx, vy: Math.sin(ship.a) * api.W * 1.1 + ship.vy, t: 1.1,
      });
      ship.cool = 0.24; Sound.blip(760);
    }

    function hyper() {
      if (dead || hyperT > 0) return;
      hyperT = 1.2;
      ship.x = M.rand(40, api.W - 40); ship.y = M.rand(60, api.H - 40);
      ship.vx = ship.vy = 0; invuln = 1.6; Sound.power();
      api.emit(ship.x, ship.y, { n: 24, color: '#8fd3ff', speedMax: 320, life: 0.7 });
    }

    function killShip() {
      if (invuln > 0 || dead) return;
      lives--; dead = true; respawn = 1.6;
      Sound.boom(); api.shake(16, 0.5);
      api.emit(ship.x, ship.y, { n: 46, color: '#8fd3ff', speedMax: 420, life: 1.1 });
      if (lives <= 0) setTimeout(() => api.over(score), 1200);
    }

    function update(dt) {
      const W = api.W, H = api.H;
      const i = api.input;
      hyperT = Math.max(0, hyperT - dt);
      invuln = Math.max(0, invuln - dt);

      if (dead) {
        respawn -= dt;
        if (respawn <= 0 && lives > 0) {
          dead = false; ship.x = W / 2; ship.y = H / 2; ship.vx = ship.vy = 0;
          ship.a = -Math.PI / 2; invuln = 2.4;
        }
      } else {
        if (i.held.left) ship.a -= 3.6 * dt;
        if (i.held.right) ship.a += 3.6 * dt;
        if (i.held.up) {
          ship.vx += Math.cos(ship.a) * W * 0.62 * dt;
          ship.vy += Math.sin(ship.a) * W * 0.62 * dt;
          ship.thrust = 1;
          if (M.chance(dt * 40)) api.emit(ship.x - Math.cos(ship.a) * 12, ship.y - Math.sin(ship.a) * 12,
            { n: 1, color: '#ffb020', speedMax: 60, life: 0.3, dir: ship.a + Math.PI, spread: 0.5, g: 0 });
        } else ship.thrust = 0;
        if (i.pressed.a) fire();
        if (i.pressed.b) hyper();
        ship.cool = Math.max(0, ship.cool - dt);
        ship.vx *= Math.pow(0.55, dt); ship.vy *= Math.pow(0.55, dt);
        const sp = Math.hypot(ship.vx, ship.vy), maxSp = W * 0.62;
        if (sp > maxSp) { ship.vx *= maxSp / sp; ship.vy *= maxSp / sp; }
        ship.x += ship.vx * dt; ship.y += ship.vy * dt;
        wrap(ship);
      }

      for (const r of rocks) {
        r.x += r.vx * dt; r.y += r.vy * dt; r.rot += r.vr * dt; wrap(r);
      }
      for (let s = shots.length - 1; s >= 0; s--) {
        const b = shots[s]; b.x += b.vx * dt; b.y += b.vy * dt; b.t -= dt; wrap(b);
        if (b.t <= 0) { shots.splice(s, 1); continue; }
        for (let k = rocks.length - 1; k >= 0; k--) {
          const r = rocks[k];
          if (M.dist(b.x, b.y, r.x, r.y) < r.r) {
            rocks.splice(k, 1); shots.splice(s, 1);
            score += [100, 50, 20][r.size - 1]; api.score(score);
            Sound.hit(); api.shake(4, 0.12);
            api.emit(r.x, r.y, { n: 16, color: '#cfd8ff', speedMax: 260, life: 0.6 });
            if (r.size > 1) for (let q = 0; q < 2; q++) rocks.push(makeRock(r.x, r.y, r.size - 1));
            break;
          }
        }
      }

      // НЛО
      if (!ufo && wave >= 2 && M.chance(dt * 0.09)) {
        const small = M.chance(0.35);
        ufo = { x: M.chance(0.5) ? -30 : W + 30, y: M.rand(H * 0.15, H * 0.7), vx: 0, r: W * (small ? 0.03 : 0.05), small, cool: 1.4, t: 0 };
        ufo.vx = ufo.x < 0 ? W * 0.22 : -W * 0.22;
      }
      if (ufo) {
        ufo.x += ufo.vx * dt; ufo.t += dt; ufo.cool -= dt;
        ufo.y += Math.sin(ufo.t * 2) * H * 0.1 * dt;
        if (ufo.cool <= 0 && !dead) {
          ufo.cool = ufo.small ? 1.1 : 1.8;
          const a = ufo.small ? Math.atan2(ship.y - ufo.y, ship.x - ufo.x) + M.rand(-0.12, 0.12) : M.rand(0, 7);
          ufoShots.push({ x: ufo.x, y: ufo.y, vx: Math.cos(a) * W * 0.5, vy: Math.sin(a) * W * 0.5, t: 3 });
          Sound.blip(220);
        }
        if (ufo.x < -50 || ufo.x > W + 50) ufo = null;
      }
      for (let s = ufoShots.length - 1; s >= 0; s--) {
        const b = ufoShots[s]; b.x += b.vx * dt; b.y += b.vy * dt; b.t -= dt;
        if (b.t <= 0 || b.x < -20 || b.x > W + 20 || b.y < -20 || b.y > H + 20) { ufoShots.splice(s, 1); continue; }
        if (!dead && M.dist(b.x, b.y, ship.x, ship.y) < 12) { ufoShots.splice(s, 1); killShip(); }
      }
      if (ufo) {
        for (let s = shots.length - 1; s >= 0; s--) {
          if (M.dist(shots[s].x, shots[s].y, ufo.x, ufo.y) < ufo.r + 4) {
            score += ufo.small ? 1000 : 250; api.score(score);
            Sound.power(); api.emit(ufo.x, ufo.y, { n: 30, color: '#ff7ab8', speedMax: 340, life: 0.9 });
            shots.splice(s, 1); ufo = null; break;
          }
        }
      }

      if (!dead) for (const r of rocks) if (M.dist(r.x, r.y, ship.x, ship.y) < r.r + 9) killShip();
      if (!rocks.length && !dead) { score += 250 * wave; api.score(score); nextWave(); }

      api.setHud(`❤ ${lives} · волна <b style="color:#8fd3ff">${wave}</b> · камней ${rocks.length}`);
    }

    function draw(c) {
      const W = api.W, H = api.H;
      c.fillStyle = '#07070f'; c.fillRect(0, 0, W, H);
      c.fillStyle = 'rgba(255,255,255,.45)';
      for (let i = 0; i < 70; i++) c.fillRect((i * 89.7) % W, (i * 149.3) % H, i % 9 ? 1 : 2, 1);

      c.strokeStyle = '#cfd8ff'; c.lineWidth = 2;
      for (const r of rocks) {
        c.beginPath();
        r.shape.forEach((k, idx) => {
          const a = r.rot + idx / r.shape.length * Math.PI * 2;
          const x = r.x + Math.cos(a) * r.r * k, y = r.y + Math.sin(a) * r.r * k;
          idx ? c.lineTo(x, y) : c.moveTo(x, y);
        });
        c.closePath(); c.stroke();
        c.fillStyle = 'rgba(140,160,220,.12)'; c.fill();
      }

      if (ufo) {
        c.strokeStyle = '#ff7ab8'; c.lineWidth = 2;
        c.beginPath(); c.ellipse(ufo.x, ufo.y, ufo.r, ufo.r * 0.4, 0, 0, 7); c.stroke();
        c.beginPath(); c.arc(ufo.x, ufo.y - ufo.r * 0.3, ufo.r * 0.45, Math.PI, 0); c.stroke();
      }
      c.fillStyle = '#ff9f68';
      for (const b of ufoShots) c.fillRect(b.x - 2, b.y - 2, 4, 4);
      c.fillStyle = '#fff';
      for (const b of shots) { c.beginPath(); c.arc(b.x, b.y, 2.4, 0, 7); c.fill(); }

      if (!dead) {
        const blink = invuln > 0 && Math.floor(api.t * 12) % 2 === 0;
        if (!blink) {
          c.save(); c.translate(ship.x, ship.y); c.rotate(ship.a);
          c.strokeStyle = '#eaf2ff'; c.lineWidth = 2; c.shadowColor = '#8fd3ff'; c.shadowBlur = 10;
          c.beginPath(); c.moveTo(14, 0); c.lineTo(-10, 8); c.lineTo(-5, 0); c.lineTo(-10, -8); c.closePath();
          c.stroke(); c.shadowBlur = 0;
          if (ship.thrust) {
            c.strokeStyle = '#ffb020';
            c.beginPath(); c.moveTo(-6, 4); c.lineTo(-14 - Math.random() * 8, 0); c.lineTo(-6, -4); c.stroke();
          }
          c.restore();
        }
      }
    }

    return { reset, update, draw };
  },
};
