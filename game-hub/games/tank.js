 /* Танчики — Battle City */
import { M, Sound } from '../engine.js';

const N = 13;                       // 13x13 тайлов
const TL = { EMPTY: 0, BRICK: 1, STEEL: 2, WATER: 3, TREE: 4, BASE: 5 };
const DIRS = [[0, -1], [1, 0], [0, 1], [-1, 0]];   // up,right,down,left
const ETYPES = [
  { hp: 1, speed: 2.3, bs: 6.5, score: 100, c: '#c9c9d6' },
  { hp: 1, speed: 3.6, bs: 6.5, score: 200, c: '#8fd3ff' },
  { hp: 1, speed: 2.6, bs: 9.5, score: 300, c: '#ffd43b' },
  { hp: 4, speed: 2.0, bs: 6.5, score: 400, c: '#8ee06b' },
];
const POWERS = ['star', 'helmet', 'grenade', 'shovel', 'tank', 'timer'];
const POWER_ICON = { star: '★', helmet: '⛨', grenade: '💣', shovel: '⛏', tank: '🛡', timer: '⏱' };

export default {
  init(api) {
    let map, cs, ox, oy, player, enemies, bullets, spawns, explosions, power,
      level, score, lives, leftToSpawn, over, freezeT, baseSteelT, shieldT, starT, aiT;

    function layout() {
      cs = Math.floor(Math.min(api.W * 0.96 / N, (api.H - 90) / N));
      ox = Math.floor((api.W - cs * N) / 2);
      oy = Math.floor((api.H - cs * N) / 2) + 8;
    }

    function genMap() {
      map = Array.from({ length: N }, () => Array(N).fill(TL.EMPTY));
      // кирпичные «домики»
      const blocks = [[2, 2], [6, 2], [10, 2], [2, 6], [10, 6], [4, 8], [8, 8], [6, 5]];
      blocks.forEach(([bx, by], i) => {
        for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) {
          const x = bx + dx, y = by + dy;
          if (x < 1 || y < 1 || x > N - 2 || y > N - 3) continue;
          map[y][x] = i % 3 === 2 && level > 1 ? TL.STEEL : TL.BRICK;
        }
      });
      // случайные кирпичи
      for (let k = 0; k < 12 + level * 3; k++) {
        const x = M.rint(1, N - 2), y = M.rint(1, N - 3);
        if (map[y][x] === TL.EMPTY) map[y][x] = M.chance(0.12 + level * 0.02) ? TL.STEEL : TL.BRICK;
      }
      // вода и лес
      for (let k = 0; k < 2 + (level > 2 ? 1 : 0); k++) {
        const y = M.rint(3, N - 4);
        for (let x = M.rint(1, 4); x < M.rint(6, N - 2); x++) if (map[y][x] === TL.EMPTY && M.chance(0.7)) map[y][x] = TL.WATER;
      }
      for (let k = 0; k < 6; k++) {
        const x = M.rint(1, N - 2), y = M.rint(2, N - 3);
        if (map[y][x] === TL.EMPTY) map[y][x] = TL.TREE;
      }
      // база и защита
      const bxp = 6, byp = N - 2;
      map[byp][bxp] = TL.BASE;
      for (const [dx, dy] of [[-1, 0], [1, 0], [-1, -1], [0, -1], [1, -1]]) {
        if (map[byp + dy] && map[byp + dy][bxp + dx] !== undefined) map[byp + dy][bxp + dx] = TL.BRICK;
      }
      // очистить спавны
      [[0, 0], [6, 0], [12, 0], [4, N - 2], [8, N - 2]].forEach(([x, y]) => { if (map[y]) map[y][x] = TL.EMPTY; });
    }

    function newTank(dir, x, y, isPlayer) {
      return {
        x, y, dir, speed: isPlayer ? 3.4 : 2.3, cool: 0, hp: 1, star: 1,
        shield: isPlayer ? 3 : 0, anim: 0, ai: { t: 0, dir }, player: !!isPlayer,
      };
    }

    function startLevel() {
      genMap();
      enemies = []; bullets = []; spawns = []; explosions = []; power = null;
      leftToSpawn = Math.min(20, 10 + level * 2);
      freezeT = 0; baseSteelT = 0; aiT = 0;
      player = newTank(0, 4.5, N - 1.5, true);
      player.star = Math.min(3, api.Store.get('tank_star', 1) || 1);
      shieldT = 3;
      queueSpawns();
    }

    function queueSpawns() {
      const spots = [[0.5, 0.5], [6.5, 0.5], [12.5, 0.5]];
      let k = 0;
      while (spawns.length + enemies.length < 4 && leftToSpawn > 0) {
        const s = spots[k % 3]; k++;
        leftToSpawn--;
        const tIdx = Math.min(3, Math.floor(M.rand(0, Math.min(4, 1 + level * 0.6))));
        spawns.push({ x: s[0], y: s[1], t: 0.9, type: tIdx, flash: (leftToSpawn % 4 === 0) });
      }
    }

    function reset() {
      layout();
      level = 1; score = 0; lives = 3; over = false;
      startLevel();
      api.score(0);
    }

    function tileBlocked(x, y, forBullet) {
      const tx = Math.floor(x), ty = Math.floor(y);
      if (tx < 0 || ty < 0 || tx >= N || ty >= N) return true;
      const t = map[ty][tx];
      if (forBullet) return t === TL.BRICK || t === TL.STEEL || t === TL.BASE;
      return t === TL.BRICK || t === TL.STEEL || t === TL.WATER || t === TL.BASE;
    }

    function tankCanMove(tk, nx, ny) {
      const s = 0.44;
      for (const [dx, dy] of [[-s, -s], [s, -s], [-s, s], [s, s], [0, 0]]) {
        if (tileBlocked(nx + dx, ny + dy, false)) return false;
      }
      if (nx < 0.5 || ny < 0.5 || nx > N - 0.5 || ny > N - 0.5) return false;
      const others = tk.player ? enemies : [player, ...enemies.filter(e => e !== tk)];
      for (const o of others) {
        if (!o || o === tk || o.dead) continue;
        if (Math.abs(o.x - nx) < 0.9 && Math.abs(o.y - ny) < 0.9) return false;
      }
      return true;
    }

    function moveTank(tk, dt) {
      const [dx, dy] = DIRS[tk.dir];
      const sp = tk.speed * dt;
      let nx = tk.x + dx * sp, ny = tk.y + dy * sp;
      if (tankCanMove(tk, nx, ny)) {
        // выравнивание по сетке для управляемости
        if (dx) ny = M.lerp(tk.y, Math.round(tk.y - 0.5) + 0.5, Math.min(1, dt * 10));
        else nx = M.lerp(tk.x, Math.round(tk.x - 0.5) + 0.5, Math.min(1, dt * 10));
        tk.x = nx; tk.y = ny; tk.anim += dt * 8;
      }
      tk.cool = Math.max(0, tk.cool - dt);
      tk.shield = Math.max(0, tk.shield - dt);
    }

    function fire(tk) {
      if (tk.cool > 0) return;
      const maxB = tk.player ? (tk.star >= 2 ? 2 : 1) : 1;
      if (bullets.filter(b => b.owner === tk).length >= maxB) return;
      const [dx, dy] = DIRS[tk.dir];
      const spd = (tk.player ? 8 + tk.star * 1.5 : ETYPES[tk.type || 0].bs) * 1;
      bullets.push({ x: tk.x + dx * 0.5, y: tk.y + dy * 0.5, dx, dy, speed: spd, owner: tk, power: tk.player && tk.star >= 3 ? 2 : 1 });
      tk.cool = tk.player ? 0.28 : 0.7;
      Sound.blip(tk.player ? 720 : 380);
    }

    function boom(x, y, big) {
      explosions.push({ x, y, t: big ? 0.55 : 0.3, big });
      api.emit(ox + x * cs, oy + y * cs, { n: big ? 30 : 14, color: big ? '#ffb020' : '#ffd43b', speedMax: big ? 380 : 220, life: big ? 0.8 : 0.5 });
    }

    function killPlayer() {
      lives--; boom(player.x, player.y, true); Sound.boom(); api.shake(16, 0.5);
      if (lives <= 0) { over = true; setTimeout(() => api.over(score), 1000); return; }
      setTimeout(() => {
        if (over) return;
        player = newTank(0, 4.5, N - 1.5, true);
        player.star = 1; api.Store.set('tank_star', 1); shieldT = 3;
      }, 900);
      player.dead = true;
    }

    function hitMap(x, y, b) {
      const tx = Math.floor(x), ty = Math.floor(y);
      if (tx < 0 || ty < 0 || tx >= N || ty >= N) return true;
      const t = map[ty][tx];
      if (t === TL.BRICK) {
        map[ty][tx] = TL.EMPTY;
        // сносим соседний тайл по оси выстрела
        if (b.dx && map[ty][tx + (b.dx > 0 ? 1 : -1)] === TL.BRICK && M.chance(0.5)) map[ty][tx + (b.dx > 0 ? 1 : -1)] = TL.EMPTY;
        boom(x, y, false); Sound.hit();
        return true;
      }
      if (t === TL.STEEL) {
        if (b.power >= 2) { map[ty][tx] = TL.EMPTY; boom(x, y, false); }
        Sound.blip(200);
        return true;
      }
      if (t === TL.BASE) {
        map[ty][tx] = TL.EMPTY;
        boom(tx + 0.5, ty + 0.5, true);
        Sound.boom(); api.shake(20, 0.7);
        over = true;
        setTimeout(() => api.over(score), 1200);
        return true;
      }
      return false;
    }

    function dropPower() {
      const x = M.rint(1, N - 2) + 0.5, y = M.rint(1, N - 3) + 0.5;
      power = { x, y, kind: M.pick(POWERS), t: 14 };
      Sound.power();
    }

    function takePower() {
      if (!power) return;
      if (Math.abs(power.x - player.x) < 0.8 && Math.abs(power.y - player.y) < 0.8) {
        const k = power.kind;
        Sound.coin();
        api.emit(ox + power.x * cs, oy + power.y * cs, { n: 26, color: '#ffd43b', speedMax: 300, life: 0.8 });
        if (k === 'star') { player.star = Math.min(3, player.star + 1); api.Store.set('tank_star', player.star); }
        if (k === 'helmet') shieldT = 10;
        if (k === 'grenade') { enemies.forEach(e => { score += 100; boom(e.x, e.y, true); }); enemies = []; }
        if (k === 'shovel') baseSteelT = 15;
        if (k === 'tank') { lives++; }
        if (k === 'timer') freezeT = 6;
        score += 500; api.score(score);
        power = null;
      }
    }

    function update(dt) {
      if (over) { explosions.forEach(e => e.t -= dt); return; }
      const i = api.input;
      freezeT = Math.max(0, freezeT - dt);
      shieldT = Math.max(0, shieldT - dt);
      if (baseSteelT > 0) {
        baseSteelT -= dt;
        const b = findBase();
        if (b) map[b[1]][b[0]] = TL.STEEL;
        if (baseSteelT <= 0 && b) map[b[1]][b[0]] = TL.BASE;
      }
      function findBase() {
        for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) if (map[y][x] === TL.BASE || (baseSteelT > 0 && map[y][x] === TL.STEEL && y === N - 2 && x === 6)) return [x, y];
        return null;
      }

      // игрок
      if (!player.dead) {
        let d = -1;
        if (i.held.up) d = 0; else if (i.held.right) d = 1; else if (i.held.down) d = 2; else if (i.held.left) d = 3;
        const sw = i.swipes[i.swipes.length - 1];
        if (sw) d = sw.dir === 'up' ? 0 : sw.dir === 'right' ? 1 : sw.dir === 'down' ? 2 : 3;
        if (d >= 0) player.dir = d;
        if (d >= 0 || i.pressed.up || i.pressed.down || i.pressed.left || i.pressed.right) moveTank(player, dt);
        if (i.pressed.a) fire(player);
        player.shield = Math.max(player.shield, shieldT);
        takePower();
      }

      // спавны
      for (let k = spawns.length - 1; k >= 0; k--) {
        const s = spawns[k]; s.t -= dt;
        if (s.t <= 0) {
          const t = newTank(2, s.x, s.y, false);
          t.type = s.type; t.hp = ETYPES[s.type].hp; t.speed = ETYPES[s.type].speed;
          t.flash = s.flash; t.color = ETYPES[s.type].c;
          enemies.push(t);
          spawns.splice(k, 1);
        }
      }

      // враги
      if (freezeT <= 0) {
        aiT -= dt;
        for (const e of enemies) {
          if (aiT <= 0 || e.ai.t <= 0) {
            e.ai.t = M.rand(0.5, 1.6);
            if (M.chance(0.42)) {
              const toward = M.chance(0.5);
              e.dir = toward ? (player.y > e.y ? 2 : player.y < e.y - 0.4 ? 0 : (player.x > e.x ? 1 : 3)) : M.rint(0, 3);
            } else e.dir = M.rint(0, 3);
          }
          e.ai.t -= dt;
          moveTank(e, dt);
          if (M.chance(dt * (0.5 + level * 0.07))) fire(e);
        }
        if (aiT <= 0) aiT = 0.25;
      }

      // пули
      for (let k = bullets.length - 1; k >= 0; k--) {
        const b = bullets[k];
        const steps = 3;
        let gone = false;
        for (let s = 0; s < steps && !gone; s++) {
          b.x += b.dx * b.speed * dt / steps;
          b.y += b.dy * b.speed * dt / steps;
          if (b.x < 0 || b.y < 0 || b.x > N || b.y > N) { boom(b.x, b.y, false); gone = true; break; }
          if (hitMap(b.x, b.y, b)) { gone = true; break; }
          // по танкам
          if (b.owner.player) {
            for (let ei = enemies.length - 1; ei >= 0; ei--) {
              const e = enemies[ei];
              if (Math.abs(e.x - b.x) < 0.45 && Math.abs(e.y - b.y) < 0.45) {
                gone = true;
                e.hp--;
                if (e.hp <= 0) {
                  enemies.splice(ei, 1);
                  score += ETYPES[e.type].score; api.score(score);
                  boom(e.x, e.y, true); Sound.boom(); api.shake(5, 0.15);
                  if (e.flash) dropPower();
                } else { Sound.hit(); boom(b.x, b.y, false); }
                break;
              }
            }
          } else if (!player.dead && Math.abs(player.x - b.x) < 0.45 && Math.abs(player.y - b.y) < 0.45) {
            gone = true;
            if (player.shield <= 0) killPlayer();
            else { Sound.blip(900); boom(b.x, b.y, false); }
          }
          // пуля в пулю
          for (let j = bullets.length - 1; j >= 0; j--) {
            if (j === k) continue;
            const o = bullets[j];
            if (o.owner.player !== b.owner.player && Math.abs(o.x - b.x) < 0.3 && Math.abs(o.y - b.y) < 0.3) {
              bullets.splice(Math.max(j, k), 1); bullets.splice(Math.min(j, k), 1);
              gone = true; break;
            }
          }
        }
        if (gone) { const idx = bullets.indexOf(b); if (idx >= 0) bullets.splice(idx, 1); }
      }

      explosions.forEach(e => e.t -= dt);
      explosions = explosions.filter(e => e.t > 0);
      if (power) { power.t -= dt; if (power.t <= 0) power = null; }

      if (!enemies.length && !spawns.length && !leftToSpawn && !over) {
        score += 500 * level; api.score(score); level++;
        Sound.win();
        api.emit(api.W / 2, api.H / 2, { n: 50, color: '#8ee06b', speedMax: 420, life: 1.2 });
        setTimeout(() => { if (!over) startLevel(); }, 900);
        leftToSpawn = 999; // защита от повторного запуска до setTimeout
      } else queueSpawns();

      api.setHud(`❤ ${lives} · уровень <b style="color:#ffd43b">${level}</b> · врагов ${enemies.length + spawns.length + (leftToSpawn === 999 ? 0 : leftToSpawn)} · ★${player.star}${freezeT > 0 ? ' · ❄' : ''}`);
    }

    function tank(c, tk, col) {
      const x = ox + tk.x * cs, y = oy + tk.y * cs, s = cs * 0.44;
      c.save(); c.translate(x, y); c.rotate(tk.dir * Math.PI / 2);
      c.fillStyle = col;
      c.fillRect(-s, -s * 0.85, s * 0.4, s * 1.7);
      c.fillRect(s * 0.6, -s * 0.85, s * 0.4, s * 1.7);
      c.fillStyle = 'rgba(0,0,0,.3)';
      for (let k = -2; k <= 2; k++) {
        const off = ((tk.anim * 6 + k * 5) % 10) - 5;
        c.fillRect(-s, off + k * 4, s * 0.4, 2);
        c.fillRect(s * 0.6, off + k * 4, s * 0.4, 2);
      }
      c.fillStyle = col;
      M.roundRect(c, -s * 0.62, -s * 0.7, s * 1.24, s * 1.4, 4); c.fill();
      c.fillStyle = 'rgba(255,255,255,.2)';
      c.fillRect(-s * 0.62, -s * 0.7, s * 1.24, s * 0.3);
      c.fillStyle = '#2b2b33';
      c.fillRect(-s * 0.1, -s * 1.35, s * 0.2, s * 0.9);
      c.restore();
      if (tk.shield > 0) {
        c.strokeStyle = `rgba(143,211,255,${0.4 + 0.4 * Math.sin(api.t * 16)})`;
        c.lineWidth = 2.5;
        c.beginPath(); c.arc(x, y, s * 1.35, 0, 7); c.stroke();
      }
    }

    function draw(c) {
      const W = api.W, H = api.H;
      c.fillStyle = '#0c0c08'; c.fillRect(0, 0, W, H);
      c.fillStyle = '#16160e'; c.fillRect(ox, oy, cs * N, cs * N);
      const trees = [];
      for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
        const t = map[y][x];
        const px = ox + x * cs, py = oy + y * cs;
        if (t === TL.BRICK) {
          c.fillStyle = '#9c4b3a'; c.fillRect(px, py, cs, cs);
          c.strokeStyle = 'rgba(0,0,0,.4)'; c.lineWidth = 1;
          for (let k = 0; k < 2; k++) {
            c.strokeRect(px + 0.5, py + k * cs / 2 + 0.5, cs / 2, cs / 2);
            c.strokeRect(px + cs / 2 + 0.5, py + k * cs / 2 + 0.5, cs / 2, cs / 2);
          }
        } else if (t === TL.STEEL) {
          c.fillStyle = '#b9b9c6'; c.fillRect(px, py, cs, cs);
          c.fillStyle = 'rgba(255,255,255,.35)'; c.fillRect(px + 2, py + 2, cs - 4, cs * 0.22);
          c.strokeStyle = 'rgba(0,0,0,.35)'; c.lineWidth = 1.5; c.strokeRect(px + 1, py + 1, cs - 2, cs - 2);
        } else if (t === TL.WATER) {
          c.fillStyle = '#1d5fa8'; c.fillRect(px, py, cs, cs);
          c.strokeStyle = 'rgba(255,255,255,.28)'; c.lineWidth = 2;
          const off = Math.sin(api.t * 2 + x) * 3;
          c.beginPath(); c.moveTo(px + 3, py + cs * 0.4 + off); c.lineTo(px + cs - 3, py + cs * 0.4 + off); c.stroke();
          c.beginPath(); c.moveTo(px + 3, py + cs * 0.7 - off); c.lineTo(px + cs - 3, py + cs * 0.7 - off); c.stroke();
        } else if (t === TL.TREE) trees.push([px, py]);
        else if (t === TL.BASE) {
          c.fillStyle = '#2a2a1a'; c.fillRect(px, py, cs, cs);
          c.font = `${Math.round(cs * 0.8)}px system-ui`; c.textAlign = 'center'; c.textBaseline = 'middle';
          c.fillText('🦅', px + cs / 2, py + cs / 2); c.textBaseline = 'alphabetic';
        }
      }

      for (const s of spawns) {
        const x = ox + s.x * cs, y = oy + s.y * cs;
        c.strokeStyle = `rgba(255,212,59,${0.4 + 0.6 * Math.abs(Math.sin(s.t * 22))})`;
        c.lineWidth = 3;
        c.beginPath();
        for (let k = 0; k < 4; k++) {
          const a = k * Math.PI / 2 + s.t * 6;
          c.moveTo(x + Math.cos(a) * cs * 0.15, y + Math.sin(a) * cs * 0.15);
          c.lineTo(x + Math.cos(a) * cs * 0.45, y + Math.sin(a) * cs * 0.45);
        }
        c.stroke();
      }

      for (const e of enemies) {
        const col = e.flash && Math.floor(api.t * 6) % 2 ? '#ff4d6d' : (e.color || '#c9c9d6');
        tank(c, e, col);
        if (e.hp > 1) {
          c.fillStyle = 'rgba(0,0,0,.5)';
          c.fillRect(ox + e.x * cs - cs * 0.3, oy + e.y * cs - cs * 0.62, cs * 0.6, 4);
          c.fillStyle = '#8ee06b';
          c.fillRect(ox + e.x * cs - cs * 0.3, oy + e.y * cs - cs * 0.62, cs * 0.6 * (e.hp / 4), 4);
        }
      }
      if (!player.dead) tank(c, player, '#ffd43b');

      for (const b of bullets) {
        c.fillStyle = b.owner.player ? '#fff' : '#ff9f68';
        c.shadowColor = c.fillStyle; c.shadowBlur = 8;
        c.beginPath(); c.arc(ox + b.x * cs, oy + b.y * cs, cs * 0.11, 0, 7); c.fill();
        c.shadowBlur = 0;
      }

      if (power) {
        const x = ox + power.x * cs, y = oy + power.y * cs;
        c.globalAlpha = power.t < 4 ? (Math.floor(api.t * 8) % 2 ? 0.35 : 1) : 1;
        c.fillStyle = '#ff4d6d';
        M.roundRect(c, x - cs * 0.42, y - cs * 0.42, cs * 0.84, cs * 0.84, 6); c.fill();
        c.fillStyle = '#fff'; c.font = `900 ${Math.round(cs * 0.5)}px system-ui`;
        c.textAlign = 'center'; c.textBaseline = 'middle';
        c.fillText(POWER_ICON[power.kind], x, y + 1);
        c.textBaseline = 'alphabetic'; c.globalAlpha = 1;
      }

      // деревья поверх танков
      for (const [px, py] of trees) {
        c.fillStyle = '#2f7a2f';
        for (let k = 0; k < 5; k++) {
          const a = k / 5 * Math.PI * 2 + 0.4;
          c.beginPath();
          c.arc(px + cs / 2 + Math.cos(a) * cs * 0.22, py + cs / 2 + Math.sin(a) * cs * 0.22, cs * 0.26, 0, 7);
          c.fill();
        }
      }

      for (const e of explosions) {
        const k = e.big ? e.t / 0.55 : e.t / 0.3;
        const r = (e.big ? cs * 0.9 : cs * 0.5) * (1.25 - k);
        c.globalAlpha = k;
        c.fillStyle = '#ffb020';
        c.beginPath(); c.arc(ox + e.x * cs, oy + e.y * cs, r, 0, 7); c.fill();
        c.fillStyle = '#fff3b0';
        c.beginPath(); c.arc(ox + e.x * cs, oy + e.y * cs, r * 0.5, 0, 7); c.fill();
        c.globalAlpha = 1;
      }
      if (freezeT > 0) { c.fillStyle = 'rgba(143,211,255,.1)'; c.fillRect(0, 0, W, H); }
      if (over) { c.fillStyle = 'rgba(120,0,0,.2)'; c.fillRect(0, 0, W, H); }
    }

    return { reset, update, draw, resize: () => layout() };
  },
};
