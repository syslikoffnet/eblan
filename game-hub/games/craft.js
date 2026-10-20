 /* Копатель 2D — minecraft-лайт: генерация мира, добыча, стройка */
import { M, Sound } from '../engine.js';

const WCOLS = 80, WROWS = 46;
const T = {
  AIR: 0, GRASS: 1, DIRT: 2, STONE: 3, WOOD: 4, LEAVES: 5, SAND: 6,
  COAL: 7, IRON: 8, GOLD: 9, DIAMOND: 10, BEDROCK: 11, LAVA: 12, PLANK: 13, BRICK: 14,
};
const TILE = {
  [T.GRASS]: { c: '#5fa83c', top: '#7cc751', score: 4, name: 'трава' },
  [T.DIRT]: { c: '#7a5230', top: '#8a6039', score: 4, name: 'земля' },
  [T.STONE]: { c: '#7d7d85', top: '#93939c', score: 6, name: 'камень' },
  [T.WOOD]: { c: '#7a5a2e', top: '#8d6a37', score: 8, name: 'дерево' },
  [T.LEAVES]: { c: '#3f8f3a', top: '#4faa45', score: 2, name: 'листва' },
  [T.SAND]: { c: '#dcd08a', top: '#eae0a4', score: 3, name: 'песок' },
  [T.COAL]: { c: '#5a5a62', top: '#33333a', score: 40, name: 'уголь' },
  [T.IRON]: { c: '#8a7a6a', top: '#c8a882', score: 70, name: 'железо' },
  [T.GOLD]: { c: '#8d8455', top: '#ffd43b', score: 120, name: 'золото' },
  [T.DIAMOND]: { c: '#6f8f9a', top: '#7ad7ff', score: 220, name: 'алмаз' },
  [T.BEDROCK]: { c: '#2a2a30', top: '#3a3a44', score: 0, name: 'бедрок' },
  [T.LAVA]: { c: '#ff5a1f', top: '#ffb020', score: 0, name: 'лава' },
  [T.PLANK]: { c: '#a3793f', top: '#b98c4c', score: 5, name: 'доски' },
  [T.BRICK]: { c: '#9c4b3a', top: '#b45a45', score: 5, name: 'кирпич' },
};
const SOLID = new Set([T.GRASS, T.DIRT, T.STONE, T.WOOD, T.LEAVES, T.SAND, T.COAL, T.IRON, T.GOLD, T.DIAMOND, T.BEDROCK, T.PLANK, T.BRICK]);
const PLACEABLE = [T.DIRT, T.STONE, T.PLANK, T.BRICK, T.WOOD, T.SAND, T.LEAVES, T.COAL];

export default {
  init(api) {
    let world, ts, camX, camY, p, inv, invOrder, selInv, score, hearts, invuln, dead, dayT, mined, placed, sparkT;

    function layout() {
      ts = M.clamp(Math.round(api.W / 13), 16, 34);
    }

    function gen() {
      world = Array.from({ length: WROWS }, () => Array(WCOLS).fill(T.AIR));
      // рельеф
      const h = [];
      let cur = 14;
      for (let x = 0; x < WCOLS; x++) {
        cur += M.rand(-1.1, 1.1);
        const base = 14 + Math.sin(x * 0.18) * 2.2 + Math.sin(x * 0.07 + 2) * 3.1;
        cur = M.lerp(cur, base, 0.35);
        h[x] = M.clamp(Math.round(cur), 8, 22);
      }
      for (let x = 0; x < WCOLS; x++) {
        const top = h[x];
        for (let y = top; y < WROWS; y++) {
          let t;
          if (y === WROWS - 1) t = T.BEDROCK;
          else if (y === top) t = top > 18 ? T.SAND : T.GRASS;
          else if (y < top + 4) t = top > 18 ? T.SAND : T.DIRT;
          else {
            t = T.STONE;
            const d = y - top;
            const rr = Math.random();
            if (rr < 0.055) t = T.COAL;
            else if (rr < 0.055 + 0.035 && d > 5) t = T.IRON;
            else if (rr < 0.092 + 0.014 && d > 10) t = T.GOLD;
            else if (rr < 0.107 + 0.008 && d > 16) t = T.DIAMOND;
          }
          world[y][x] = t;
        }
        // пещеры
        for (let y = top + 5; y < WROWS - 2; y++) {
          const n = Math.sin(x * 0.34 + y * 0.21) * Math.cos(y * 0.17 - x * 0.09) + Math.sin((x + y) * 0.11);
          if (n > 0.92) world[y][x] = T.AIR;
        }
      }
      // лава внизу
      for (let x = 1; x < WCOLS - 1; x++) {
        if (M.chance(0.22)) {
          const y = WROWS - 2;
          if (world[y][x] !== T.AIR) world[y][x] = T.LAVA;
          if (M.chance(0.4) && world[y - 1][x] !== T.AIR) world[y - 1][x] = T.LAVA;
        }
      }
      // деревья
      for (let x = 3; x < WCOLS - 3; x++) {
        const top = h[x];
        if (world[top][x] !== T.GRASS || !M.chance(0.14)) continue;
        const th = M.rint(3, 5);
        for (let k = 1; k <= th; k++) if (world[top - k]) world[top - k][x] = T.WOOD;
        for (let dy = -2; dy <= 0; dy++) for (let dx = -2; dx <= 2; dx++) {
          if (Math.abs(dx) === 2 && dy === 0) continue;
          const yy = top - th + dy, xx = x + dx;
          if (world[yy] && world[yy][xx] === T.AIR) world[yy][xx] = T.LEAVES;
        }
        x += 2;
      }
      return h;
    }

    function reset() {
      layout();
      const h = gen();
      const sx = 6;
      p = { x: sx + 0.5, y: h[sx] - 2.2, vx: 0, vy: 0, w: 0.62, hgt: 1.75, onGround: false, face: 1 };
      inv = {}; invOrder = []; selInv = 0;
      score = 0; hearts = 3; invuln = 0; dead = false; dayT = 0; mined = 0; placed = 0; sparkT = 0;
      camX = p.x * ts - api.W / 2; camY = p.y * ts - api.H / 2;
      api.score(0);
      give(T.PLANK, 12);
    }

    function give(t, n = 1) {
      inv[t] = (inv[t] || 0) + n;
      if (!invOrder.includes(t) && PLACEABLE.includes(t)) invOrder.push(t);
      invOrder = invOrder.filter(k => inv[k] > 0);
      if (selInv >= invOrder.length) selInv = 0;
    }
    function take(t) {
      if (!inv[t]) return false;
      inv[t]--;
      if (!inv[t]) { invOrder = invOrder.filter(k => inv[k] > 0); if (selInv >= invOrder.length) selInv = 0; }
      return true;
    }

    const solidAt = (x, y) => {
      const tx = Math.floor(x), ty = Math.floor(y);
      if (tx < 0 || tx >= WCOLS || ty < 0) return true;
      if (ty >= WROWS) return true;
      return SOLID.has(world[ty][tx]);
    };

    function moveAxis(dx, dy) {
      const steps = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy)) / 0.2));
      for (let s = 0; s < steps; s++) {
        p.x += dx / steps; p.y += dy / steps;
        const l = p.x - p.w / 2, r = p.x + p.w / 2;
        const t = p.y, b = p.y + p.hgt;
        if (dx > 0 && (solidAt(r, t + 0.05) || solidAt(r, b - 0.05) || solidAt(r, (t + b) / 2))) {
          p.x = Math.floor(r) - p.w / 2 - 0.001; p.vx = 0;
          if (p.onGround && dy === 0) p.y -= 1.02; // автоподъём на блок
        } else if (dx < 0 && (solidAt(l, t + 0.05) || solidAt(l, b - 0.05) || solidAt(l, (t + b) / 2))) {
          p.x = Math.floor(l) + 1 + p.w / 2 + 0.001; p.vx = 0;
          if (p.onGround && dy === 0) p.y -= 1.02;
        }
        if (dy > 0 && (solidAt(l + 0.05, b) || solidAt(r - 0.05, b) || solidAt((l + r) / 2, b))) {
          p.y = Math.floor(b) - p.hgt - 0.001; p.vy = 0; p.onGround = true;
        } else if (dy < 0 && (solidAt(l + 0.05, t) || solidAt(r - 0.05, t) || solidAt((l + r) / 2, t))) {
          p.y = Math.floor(t) + 1 + 0.001; p.vy = 0;
        } else if (dy > 0) p.onGround = false;
      }
    }

    function tileAt(px, py) {
      const tx = Math.floor(px / ts + camX / ts), ty = Math.floor(py / ts + camY / ts);
      return { tx, ty };
    }

    function interact(px, py) {
      const { tx, ty } = tileAt(px, py);
      if (tx < 0 || ty < 0 || tx >= WCOLS || ty >= WROWS) return;
      const d = M.dist(tx + 0.5, ty + 0.5, p.x, p.y + p.hgt / 2);
      if (d > 5) { Sound.blip(150); return; }
      const cur = world[ty][tx];
      if (cur !== T.AIR && cur !== T.LAVA) {
        if (cur === T.BEDROCK) { Sound.blip(120); api.shake(3, 0.1); return; }
        world[ty][tx] = T.AIR;
        const info = TILE[cur];
        score += info.score; mined++;
        api.score(score);
        Sound[cur >= T.COAL && cur <= T.DIAMOND ? 'coin' : 'hit']();
        api.emit((tx + 0.5) * ts - camX, (ty + 0.5) * ts - camY, { n: 12, color: info.c, speedMax: 210, life: 0.55 });
        if (cur === T.GRASS) give(T.DIRT);
        else if (cur === T.STONE || cur === T.COAL || cur === T.IRON || cur === T.GOLD || cur === T.DIAMOND) give(cur === T.STONE ? T.STONE : T.STONE);
        else if (cur === T.WOOD) { give(T.WOOD); give(T.PLANK, 2); }
        else give(cur);
        if (cur >= T.IRON) api.shake(4, 0.15);
      } else if (cur === T.AIR) {
        const type = invOrder[selInv];
        if (!type || !take(type)) { Sound.blip(160); return; }
        // не ставим внутрь себя
        const l = p.x - p.w / 2, r = p.x + p.w / 2, t = p.y, b = p.y + p.hgt;
        if (tx + 1 > l && tx < r && ty + 1 > t && ty < b) { give(type); return; }
        world[ty][tx] = type;
        placed++; score += 2; api.score(score);
        Sound.blip(340);
        api.emit((tx + 0.5) * ts - camX, (ty + 0.5) * ts - camY, { n: 6, color: TILE[type].c, speedMax: 120, life: 0.35 });
      }
    }

    function hurt() {
      if (invuln > 0 || dead) return;
      hearts--; invuln = 1.4; Sound.boom(); api.shake(14, 0.4);
      p.vy = -8; p.vx = -p.face * 4;
      api.emit(api.W / 2, api.H / 2, { n: 26, color: '#ff5a1f', speedMax: 320, life: 0.8 });
      if (hearts <= 0) { dead = true; setTimeout(() => api.over(score), 1000); }
    }

    function update(dt) {
      if (dead) return;
      const i = api.input;
      layout();
      dayT += dt;
      invuln = Math.max(0, invuln - dt);

      const mv = (i.held.left ? -1 : 0) + (i.held.right ? 1 : 0);
      p.vx = M.lerp(p.vx, mv * 5.6, Math.min(1, dt * 14));
      if (mv) p.face = mv;
      const wantJump = (i.pressed.up || i.swipes.some(s => s.dir === 'up')) ||
        (i.pressed.a && !i.pointer.down);
      if (wantJump && p.onGround) { p.vy = -9.6; p.onGround = false; Sound.jump(); }
      p.vy = Math.min(p.vy + 26 * dt, 22);

      moveAxis(p.vx * dt, 0);
      moveAxis(0, p.vy * dt);
      p.x = M.clamp(p.x, 0.4, WCOLS - 0.4);

      // лава / падение
      const feet = world[Math.floor(p.y + p.hgt)] && world[Math.floor(p.y + p.hgt)][Math.floor(p.x)];
      const body = world[Math.floor(p.y + 0.8)] && world[Math.floor(p.y + 0.8)][Math.floor(p.x)];
      if (feet === T.LAVA || body === T.LAVA) hurt();
      if (p.y > WROWS + 4) { hearts = 0; dead = true; setTimeout(() => api.over(score), 600); }

      if (i.pressed.b) { selInv = invOrder.length ? (selInv + 1) % invOrder.length : 0; Sound.click(); }

      for (const e of i.events) if (e.type === 'tap' || e.type === 'down') interact(e.x, e.y);

      // камера
      const tx = p.x * ts - api.W / 2, ty = p.y * ts - api.H * 0.55;
      camX = M.lerp(camX, M.clamp(tx, -ts * 2, WCOLS * ts - api.W + ts * 2), Math.min(1, dt * 7));
      camY = M.lerp(camY, M.clamp(ty, -ts * 4, WROWS * ts - api.H + ts * 2), Math.min(1, dt * 7));
      sparkT += dt;

      const selName = invOrder[selInv] ? TILE[invOrder[selInv]].name : '—';
      api.setHud(`❤ ${hearts} · добыто <b style="color:#7cc751">${mined}</b> · поставлено ${placed} · в руке: <b style="color:#ffd43b">${selName}</b> (B — смена)`);
    }

    function draw(c) {
      const W = api.W, H = api.H;
      const day = (Math.sin(dayT * 0.08) + 1) / 2;
      const g = c.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, `rgb(${Math.round(20 + 110 * day)},${Math.round(24 + 150 * day)},${Math.round(50 + 190 * day)})`);
      g.addColorStop(1, `rgb(${Math.round(10 + 40 * day)},${Math.round(12 + 60 * day)},${Math.round(26 + 80 * day)})`);
      c.fillStyle = g; c.fillRect(0, 0, W, H);
      // солнце/луна
      c.fillStyle = day > 0.5 ? '#fff3b0' : '#cfd8ff';
      c.beginPath(); c.arc(W * (0.2 + day * 0.6), H * 0.14, 16, 0, 7); c.fill();

      const x0 = Math.max(0, Math.floor(camX / ts) - 1), x1 = Math.min(WCOLS - 1, Math.ceil((camX + W) / ts) + 1);
      const y0 = Math.max(0, Math.floor(camY / ts) - 1), y1 = Math.min(WROWS - 1, Math.ceil((camY + H) / ts) + 1);
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
        const t = world[y][x];
        if (t === T.AIR) continue;
        const info = TILE[t]; if (!info) continue;
        const px = Math.round(x * ts - camX), py = Math.round(y * ts - camY);
        c.fillStyle = info.c;
        c.fillRect(px, py, ts + 1, ts + 1);
        if (t === T.LAVA) {
          c.fillStyle = `rgba(255,220,120,${0.35 + 0.25 * Math.sin(sparkT * 4 + x)})`;
          c.fillRect(px, py, ts + 1, ts * 0.4);
        } else {
          c.fillStyle = info.top;
          c.fillRect(px, py, ts + 1, Math.max(2, ts * 0.22));
          c.fillStyle = 'rgba(0,0,0,.18)';
          c.fillRect(px, py + ts - Math.max(2, ts * 0.16), ts + 1, Math.max(2, ts * 0.16));
          if (t >= T.COAL && t <= T.DIAMOND) {
            c.fillStyle = info.top;
            const k = (x * 7 + y * 13) % 3;
            c.fillRect(px + ts * (0.2 + k * 0.12), py + ts * 0.45, ts * 0.22, ts * 0.22);
            c.fillRect(px + ts * 0.6, py + ts * (0.25 + k * 0.1), ts * 0.18, ts * 0.18);
          }
          if (t === T.WOOD) { c.fillStyle = 'rgba(0,0,0,.2)'; c.fillRect(px + ts * 0.45, py, ts * 0.1, ts); }
          if (t === T.BRICK) {
            c.strokeStyle = 'rgba(0,0,0,.28)'; c.lineWidth = 1;
            c.strokeRect(px + 0.5, py + 0.5, ts, ts / 2);
            c.beginPath(); c.moveTo(px + ts / 2, py + ts / 2); c.lineTo(px + ts / 2, py + ts); c.stroke();
          }
        }
      }

      // игрок
      const px = p.x * ts - camX, py = p.y * ts - camY;
      const blink = invuln > 0 && Math.floor(api.t * 14) % 2 === 0;
      if (!blink) {
        c.fillStyle = '#3aa0d8';
        c.fillRect(px - p.w * ts / 2, py + ts * 0.55, p.w * ts, p.hgt * ts * 0.45);   // тело
        c.fillStyle = '#2b3a6b';
        c.fillRect(px - p.w * ts / 2, py + ts * 1.0, p.w * ts * 0.42, p.hgt * ts * 0.72); // ноги
        c.fillRect(px + p.w * ts * 0.08, py + ts * 1.0, p.w * ts * 0.42, p.hgt * ts * 0.72);
        c.fillStyle = '#e8b48c';
        c.fillRect(px - p.w * ts * 0.42, py, p.w * ts * 0.84, ts * 0.6);               // голова
        c.fillStyle = '#4a2f14';
        c.fillRect(px - p.w * ts * 0.46, py - ts * 0.12, p.w * ts * 0.92, ts * 0.2);   // волосы
        c.fillStyle = '#12203a';
        c.fillRect(px + (p.face > 0 ? p.w * ts * 0.08 : -p.w * ts * 0.3), py + ts * 0.22, ts * 0.14, ts * 0.14);
      }

      // хотбар
      const n = Math.max(invOrder.length, 1);
      const bw = Math.min(46, (W - 20) / n);
      const bx = (W - bw * n) / 2, by = H - bw - 12;
      for (let k = 0; k < n; k++) {
        const t = invOrder[k];
        c.fillStyle = k === selInv ? 'rgba(255,255,255,.28)' : 'rgba(0,0,0,.4)';
        M.roundRect(c, bx + k * bw + 2, by, bw - 4, bw - 4, 6); c.fill();
        c.strokeStyle = k === selInv ? '#ffd43b' : 'rgba(255,255,255,.2)';
        c.lineWidth = 2; c.stroke();
        if (t) {
          c.fillStyle = TILE[t].c;
          c.fillRect(bx + k * bw + 8, by + 6, bw - 16, bw - 22);
          c.fillStyle = '#fff'; c.font = `800 ${Math.round(bw * 0.28)}px system-ui`;
          c.textAlign = 'center';
          c.fillText(inv[t], bx + k * bw + bw / 2, by + bw - 9);
        }
      }
      if (hearts <= 1 && invuln > 0) { c.fillStyle = 'rgba(255,0,40,.16)'; c.fillRect(0, 0, W, H); }
      if (day < 0.25) { c.fillStyle = `rgba(4,4,20,${(0.25 - day) * 1.5})`; c.fillRect(0, 0, W, H); }
    }

    return { reset, update, draw, resize: () => layout() };
  },
};
