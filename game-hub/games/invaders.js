 /* Space Invaders */
import { M, Sound } from '../engine.js';

export default {
  init(api) {
    let ship, inv, bullets, enemyShots, walls, dirN, stepT, stepInt, dropTo,
      wave, score, lives, dead, ufo, ufoT, boomT;

    function reset() {
      const W = api.W, H = api.H;
      ship = { x: W / 2, y: H - 54, w: Math.max(28, W * 0.09), h: 18, cool: 0 };
      bullets = []; enemyShots = []; inv = []; walls = [];
      wave = 1; score = 0; lives = 3; dead = false;
      dirN = 1; stepT = 0; dropTo = 0; ufo = null; ufoT = 12; boomT = 0;
      buildWave();
      buildWalls();
      api.score(0);
    }

    function buildWave() {
      const W = api.W, H = api.H;
      inv = [];
      const cols = 8, rowsN = Math.min(6, 3 + Math.floor(wave / 2));
      const cw = W * 0.09, ch = W * 0.07;
      const startX = (W - cols * cw) / 2;
      for (let r = 0; r < rowsN; r++) for (let c = 0; c < cols; c++) {
        inv.push({
          x: startX + c * cw, y: H * 0.16 + r * ch, w: cw * 0.72, h: ch * 0.66,
          type: r === 0 ? 2 : r < 3 ? 1 : 0, alive: true, anim: 0,
        });
      }
      stepInt = Math.max(0.08, 0.62 - wave * 0.045);
    }

    function buildWalls() {
      const W = api.W, H = api.H;
      walls = [];
      const n = 4, bw = W * 0.13, bh = H * 0.05;
      for (let i = 0; i < n; i++) {
        const wx = W * (0.12 + i * 0.255);
        for (let r = 0; r < 3; r++) for (let c = 0; c < 4; c++) {
          if (r === 2 && (c === 1 || c === 2)) continue;
          walls.push({ x: wx + c * bw / 4, y: H * 0.66 + r * bh / 3, w: bw / 4, h: bh / 3, hp: 3 });
        }
      }
    }

    function shoot() {
      if (ship.cool > 0 || dead) return;
      bullets.push({ x: ship.x, y: ship.y - 12, vy: -api.H * 1.35, w: 3, h: 12 });
      ship.cool = 0.32; Sound.blip(880);
    }

    function hitWalls(x, y, w, h) {
      for (let i = walls.length - 1; i >= 0; i--) {
        const wl = walls[i];
        if (M.hit(x - w / 2, y - h / 2, w, h, wl.x, wl.y, wl.w, wl.h)) {
          wl.hp--;
          if (wl.hp <= 0) walls.splice(i, 1);
          return true;
        }
      }
      return false;
    }

    function update(dt) {
      const W = api.W, H = api.H;
      if (dead) { boomT += dt; return; }
      const i = api.input;
      const mv = (i.held.left ? -1 : 0) + (i.held.right ? 1 : 0);
      if (mv) ship.x = M.clamp(ship.x + mv * W * 0.75 * dt, ship.w / 2, W - ship.w / 2);
      if (i.pointer.down) ship.x = M.clamp(i.pointer.x, ship.w / 2, W - ship.w / 2);
      if (i.pressed.a || i.pressed.up) shoot();
      ship.cool = Math.max(0, ship.cool - dt);

      // строй
      const alive = inv.filter(v => v.alive);
      const k = M.clamp(1 - alive.length / 48, 0, 1);
      stepInt = Math.max(0.05, (0.62 - wave * 0.045) * (1 - k * 0.8));
      stepT += dt;
      while (stepT >= stepInt && alive.length) {
        stepT -= stepInt;
        const dx = W * 0.028, dy = H * 0.022;
        if (dropTo > 0) {
          inv.forEach(v => v.y += dy);
          dropTo = 0;
        } else {
          let hit = false;
          inv.forEach(v => { v.x += dx * dirN; v.anim ^= 1; });
          for (const v of alive) {
            if (v.x < 4 || v.x + v.w > W - 4) { hit = true; break; }
            if (v.y + v.h > ship.y - 10) { loseLife(true); return; }
          }
          if (hit) { dirN *= -1; dropTo = 1; inv.forEach(v => v.x += dx * dirN); }
        }
        if (M.chance(0.5)) Sound.blip(160 + k * 120);
      }

      // НЛО
      ufoT -= dt;
      if (!ufo && ufoT <= 0) {
        ufo = { x: M.chance(0.5) ? -40 : W + 40, y: H * 0.09, dir: 0, w: W * 0.1, h: 16 };
        ufo.dir = ufo.x < 0 ? 1 : -1; ufoT = M.rand(14, 24);
      }
      if (ufo) {
        ufo.x += ufo.dir * W * 0.28 * dt;
        if (ufo.x < -60 || ufo.x > W + 60) ufo = null;
      }

      // пули игрока
      for (let b = bullets.length - 1; b >= 0; b--) {
        const bl = bullets[b]; if (!bl) break;
        bl.y += bl.vy * dt;
        if (bl.y < -20) { bullets.splice(b, 1); continue; }
        if (hitWalls(bl.x, bl.y, bl.w, bl.h)) { bullets.splice(b, 1); continue; }
        if (ufo && M.hit(bl.x - 2, bl.y - 6, 4, 12, ufo.x - ufo.w / 2, ufo.y - ufo.h / 2, ufo.w, ufo.h)) {
          score += 150; api.score(score); Sound.power();
          api.emit(ufo.x, ufo.y, { n: 24, color: '#ff7ab8', speedMax: 300, life: 0.7 });
          ufo = null; bullets.splice(b, 1); continue;
        }
        for (const v of inv) {
          if (!v.alive) continue;
          if (M.hit(bl.x - bl.w / 2, bl.y - bl.h / 2, bl.w, bl.h, v.x, v.y, v.w, v.h)) {
            v.alive = false;
            const pts = [10, 20, 40][v.type] * wave;
            score += pts; api.score(score);
            Sound.coin(); api.shake(3, 0.08);
            api.emit(v.x + v.w / 2, v.y + v.h / 2, { n: 14, color: ['#8ee06b', '#7ad7ff', '#ff7ab8'][v.type], speedMax: 240, life: 0.55 });
            bullets.splice(b, 1);
            break;
          }
        }
      }

      // выстрелы пришельцев
      if (alive.length && M.chance(dt * (0.7 + wave * 0.18))) {
        const sh = M.pick(alive);
        enemyShots.push({ x: sh.x + sh.w / 2, y: sh.y + sh.h, vy: H * (0.32 + wave * 0.02), w: 3, h: 10 });
        Sound.blip(120);
      }
      for (let b = enemyShots.length - 1; b >= 0; b--) {
        const s = enemyShots[b]; if (!s) break;
        s.y += s.vy * dt;
        if (s.y > H + 20) { enemyShots.splice(b, 1); continue; }
        if (hitWalls(s.x, s.y, s.w, s.h)) { enemyShots.splice(b, 1); continue; }
        if (M.hit(s.x - 2, s.y - 5, 4, 10, ship.x - ship.w / 2, ship.y - ship.h / 2, ship.w, ship.h)) {
          enemyShots.splice(b, 1); loseLife(); break;
        }
      }

      if (!alive.length) {
        wave++; score += 200; api.score(score); Sound.win();
        buildWave(); buildWalls(); bullets.length = 0; enemyShots.length = 0;
      }
      api.setHud(`❤ ${lives} · волна <b style="color:#00e5c0">${wave}</b> · врагов ${alive.length}`);
    }

    function loseLife(invaded) {
      lives--; Sound.boom(); api.shake(14, 0.4); dead = true; boomT = 0;
      api.emit(ship.x, ship.y, { n: 40, color: '#7ad7ff', speedMax: 380, life: 1 });
      if (lives > 0 && !invaded) {
        setTimeout(() => {
          dead = false; ship.x = api.W / 2; bullets.length = 0; enemyShots.length = 0;
        }, 900);
      } else {
        setTimeout(() => api.over(score), 900);
      }
    }

    function invader(c, v) {
      const col = ['#8ee06b', '#7ad7ff', '#ff7ab8'][v.type];
      c.fillStyle = col;
      const x = v.x, y = v.y, w = v.w, h = v.h, u = w / 8;
      c.fillRect(x + u * 2, y, u * 4, h * 0.3);
      c.fillRect(x, y + h * 0.25, w, h * 0.4);
      if (v.anim) { c.fillRect(x + u, y + h * 0.65, u * 2, h * 0.3); c.fillRect(x + u * 5, y + h * 0.65, u * 2, h * 0.3); }
      else { c.fillRect(x, y + h * 0.65, u * 2, h * 0.3); c.fillRect(x + u * 6, y + h * 0.65, u * 2, h * 0.3); }
      c.fillStyle = '#0a0a16';
      c.fillRect(x + u * 2.6, y + h * 0.32, u * 0.9, h * 0.22);
      c.fillRect(x + u * 4.6, y + h * 0.32, u * 0.9, h * 0.22);
    }

    function draw(c) {
      const W = api.W, H = api.H;
      c.fillStyle = '#07070f'; c.fillRect(0, 0, W, H);
      c.fillStyle = 'rgba(255,255,255,.5)';
      for (let i = 0; i < 60; i++) {
        const sx = (i * 71.7) % W, sy = (i * 131.3) % H;
        c.fillRect(sx, sy, i % 7 ? 1 : 2, i % 7 ? 1 : 2);
      }
      for (const wl of walls) {
        c.fillStyle = `rgba(142,224,107,${0.35 + wl.hp * 0.2})`;
        c.fillRect(wl.x, wl.y, wl.w, wl.h);
      }
      for (const v of inv) if (v.alive) invader(c, v);
      if (ufo) {
        c.fillStyle = '#ff7ab8';
        c.beginPath(); c.ellipse(ufo.x, ufo.y, ufo.w / 2, ufo.h / 2, 0, 0, 7); c.fill();
        c.fillStyle = '#ffd43b';
        c.beginPath(); c.arc(ufo.x, ufo.y - 4, ufo.h * 0.4, 0, 7); c.fill();
      }
      c.fillStyle = '#7ad7ff';
      for (const b of bullets) c.fillRect(b.x - b.w / 2, b.y - b.h / 2, b.w, b.h);
      c.fillStyle = '#ff4d6d';
      for (const s of enemyShots) c.fillRect(s.x - 1.5, s.y - 5, 3, 10);

      if (!dead) {
        c.save(); c.translate(ship.x, ship.y);
        c.fillStyle = '#eaf2ff'; c.shadowColor = '#7ad7ff'; c.shadowBlur = 12;
        c.beginPath();
        c.moveTo(0, -ship.h); c.lineTo(ship.w / 2, ship.h * 0.6);
        c.lineTo(ship.w * 0.2, ship.h * 0.6); c.lineTo(0, ship.h * 0.2);
        c.lineTo(-ship.w * 0.2, ship.h * 0.6); c.lineTo(-ship.w / 2, ship.h * 0.6);
        c.closePath(); c.fill(); c.shadowBlur = 0;
        c.restore();
        c.fillStyle = 'rgba(255,180,80,.8)';
        c.fillRect(ship.x - 2, ship.y + ship.h * 0.6, 4, 6 + Math.sin(api.t * 30) * 3);
      }
      c.strokeStyle = 'rgba(142,224,107,.5)'; c.lineWidth = 2;
      c.beginPath(); c.moveTo(0, H - 24); c.lineTo(W, H - 24); c.stroke();
    }

    return { reset, update, draw };
  },
};
