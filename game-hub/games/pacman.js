 /* Пакмен: процедурный лабиринт + призраки на BFS */
import { M, Sound } from '../engine.js';

const COLS = 15, ROWS = 17;
const GHOST_COLORS = ['#ff4d6d', '#ff9ecb', '#7ad7ff', '#ffb020'];

export default {
  init(api) {
    let grid, dots, cs, ox, oy, pac, ghosts, score, lives, level, dead, deadT,
      frightT, eatenCombo, field, fieldT, totalDots, fruit, fruitT, lvlT, mouth;

    function layout() {
      cs = Math.floor(Math.min(api.W * 0.96 / COLS, (api.H - 60) / ROWS));
      ox = Math.floor((api.W - COLS * cs) / 2);
      oy = Math.floor((api.H - ROWS * cs) / 2) + 6;
    }

    function genMaze() {
      const g = Array.from({ length: ROWS }, () => Array(COLS).fill(0));
      const st = [[1, 1]]; g[1][1] = 1;
      while (st.length) {
        const [x, y] = st[st.length - 1];
        const dirs = M.shuffle([[0, -2], [0, 2], [-2, 0], [2, 0]]);
        let carved = false;
        for (const [dx, dy] of dirs) {
          const nx = x + dx, ny = y + dy;
          if (nx > 0 && ny > 0 && nx < COLS - 1 && ny < ROWS - 1 && !g[ny][nx]) {
            g[y + dy / 2][x + dx / 2] = 1; g[ny][nx] = 1; st.push([nx, ny]); carved = true; break;
          }
        }
        if (!carved) st.pop();
      }
      // «брейдинг»: убираем часть тупиков, чтобы были петли
      for (let y = 1; y < ROWS - 1; y++) for (let x = 1; x < COLS - 1; x++) {
        if (!g[y][x]) continue;
        const walls = [[0, -1], [0, 1], [-1, 0], [1, 0]].filter(([dx, dy]) => !g[y + dy][x + dx]);
        if (walls.length === 3 && M.chance(0.55)) {
          const [dx, dy] = M.pick(walls);
          if (g[y + dy * 2] && g[y + dy * 2][x + dx * 2] === 0 && y + dy * 2 < ROWS - 1 && x + dx * 2 < COLS - 1) {
            g[y + dy][x + dx] = 1;
          } else g[y + dy][x + dx] = 1;
        }
      }
      // туннель
      const mid = Math.floor(ROWS / 2);
      g[mid][0] = 1; g[mid][COLS - 1] = 1;
      g[mid][1] = 1; g[mid][COLS - 2] = 1;
      // дом призраков
      const cy = Math.floor(ROWS / 2), cx = Math.floor(COLS / 2);
      for (let dy = -1; dy <= 1; dy++) for (let dx = -2; dx <= 2; dx++) g[cy + dy][cx + dx] = 1;
      g[cy - 2][cx] = 1; g[cy + 2][cx] = 1;
      return g;
    }

    function buildDots() {
      dots = Array.from({ length: ROWS }, () => Array(COLS).fill(0));
      const cy = Math.floor(ROWS / 2), cx = Math.floor(COLS / 2);
      const corners = [[1, 1], [COLS - 2, 1], [1, ROWS - 2], [COLS - 2, ROWS - 2]];
      for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) {
        if (!grid[y][x]) continue;
        if (Math.abs(y - cy) <= 1 && Math.abs(x - cx) <= 2) continue;
        dots[y][x] = corners.some(([cxx, cyy]) => cxx === x && cyy === y) ? 2 : 1;
      }
      totalDots = dots.flat().filter(v => v).length;
    }

    const cx = Math.floor(COLS / 2), cy = Math.floor(ROWS / 2);

    function spawnPositions() {
      pac = { gx: cx, gy: cy + 3, x: 0, y: 0, dir: { dx: -1, dy: 0 }, want: null };
      ghosts = GHOST_COLORS.map((col, i) => ({
        gx: cx + (i % 2 ? 1 : -1) * (i < 2 ? 1 : 0), gy: cy + (i < 2 ? 0 : 1),
        x: 0, y: 0, dir: { dx: i % 2 ? 1 : -1, dy: 0 }, want: null,
        col, mode: 'scatter', home: i, out: i === 0, inHouse: i !== 0, t: i * 1.6,
      }));
      [pac, ...ghosts].forEach(e => { const c = center(e.gx, e.gy); e.x = c[0]; e.y = c[1]; });
      frightT = 0; eatenCombo = 0;
    }

    function center(gx, gy) { return [ox + (gx + 0.5) * cs, oy + (gy + 0.5) * cs]; }
    function isWall(gx, gy) {
      if (gy < 0 || gy >= ROWS) return true;
      const x = ((gx % COLS) + COLS) % COLS;
      return !grid[gy][x];
    }

    function bfs() {
      const d = Array.from({ length: ROWS }, () => Array(COLS).fill(-1));
      const q = [[pac.gx, pac.gy]]; d[pac.gy][((pac.gx % COLS) + COLS) % COLS] = 0;
      while (q.length) {
        const [x, y] = q.shift();
        for (const [dx, dy] of [[0, -1], [0, 1], [-1, 0], [1, 0]]) {
          const nx = x + dx, ny = y + dy;
          if (ny < 0 || ny >= ROWS || nx < 0 || nx >= COLS) continue;
          if (!grid[ny][nx] || d[ny][nx] !== -1) continue;
          d[ny][nx] = d[x][y] + 1; q.push([nx, ny]);
        }
      }
      field = d;
    }

    function step(e, dt, spd) {
      const c = center(e.gx, e.gy);
      const near = Math.abs(e.x - c[0]) < spd * dt + 0.6 && Math.abs(e.y - c[1]) < spd * dt + 0.6;
      if (near) {
        e.x = c[0]; e.y = c[1];
        if (e.want && !isWall(e.gx + e.want.dx, e.gy + e.want.dy)) { e.dir = e.want; e.want = null; }
        if (isWall(e.gx + e.dir.dx, e.gy + e.dir.dy)) e.dir = { dx: 0, dy: 0 };
        if (e.dir.dx || e.dir.dy) {
          e.gx = ((e.gx + e.dir.dx) % COLS + COLS) % COLS;
          e.gy += e.dir.dy;
        }
      }
      const t = center(e.gx, e.gy);
      const ddx = t[0] - e.x, ddy = t[1] - e.y, dd = Math.hypot(ddx, ddy);
      if (dd > 0.05) { const k = Math.min(1, spd * dt / dd); e.x += ddx * k; e.y += ddy * k; }
    }

    function ghostThink(g) {
      const opts = [[0, -1], [0, 1], [-1, 0], [1, 0]]
        .map(([dx, dy]) => ({ dx, dy }))
        .filter(d => !isWall(g.gx + d.dx, g.gy + d.dy) && !(d.dx === -g.dir.dx && d.dy === -g.dir.dy));
      const list = opts.length ? opts : [{ dx: -g.dir.dx, dy: -g.dir.dy }];
      if (frightT > 0) { g.dir = M.pick(list); return; }
      const tx = g.mode === 'scatter' ? (g.home % 2 ? COLS - 2 : 1) : pac.gx;
      const ty = g.mode === 'scatter' ? (g.home < 2 ? 1 : ROWS - 2) : pac.gy;
      let bestD = Infinity, pick = list[0];
      for (const d of list) {
        const nx = g.gx + d.dx, ny = g.gy + d.dy;
        const base = (field && field[ny] && field[ny][nx] >= 0) ? field[ny][nx] : M.dist(nx, ny, tx, ty);
        const v = g.mode === 'scatter' ? -base + M.dist(nx, ny, tx, ty) * 0.2 : base;
        if (v < bestD) { bestD = v; pick = d; }
      }
      g.dir = pick;
    }

    function reset() {
      layout();
      grid = genMaze(); buildDots();
      score = 0; lives = 3; level = 1; dead = false; deadT = 0; fruit = null; fruitT = 0; lvlT = 0; mouth = 0;
      field = null; fieldT = 0;
      spawnPositions();
      api.score(0);
    }

    function nextLevel() {
      level++; Sound.win();
      grid = genMaze(); buildDots(); spawnPositions();
      api.emit(api.W / 2, api.H / 2, { n: 40, color: '#ffd400', speedMax: 400, life: 1 });
    }

    function killPac() {
      lives--; dead = true; deadT = 0; Sound.boom(); api.shake(14, 0.5);
      api.emit(pac.x, pac.y, { n: 34, color: '#ffd400', speedMax: 320, life: 0.9 });
      if (lives <= 0) setTimeout(() => api.over(score), 1100);
      else setTimeout(() => { dead = false; spawnPositions(); }, 1100);
    }

    function update(dt) {
      if (dead) { deadT += dt; return; }
      const W = api.W;
      const i = api.input;
      const sw = i.swipes[i.swipes.length - 1];
      if (sw) pac.want = sw.dir === 'left' ? { dx: -1, dy: 0 } : sw.dir === 'right' ? { dx: 1, dy: 0 }
        : sw.dir === 'up' ? { dx: 0, dy: -1 } : { dx: 0, dy: 1 };
      if (i.pressed.left) pac.want = { dx: -1, dy: 0 };
      if (i.pressed.right) pac.want = { dx: 1, dy: 0 };
      if (i.pressed.up) pac.want = { dx: 0, dy: -1 };
      if (i.pressed.down) pac.want = { dx: 0, dy: 1 };
      if (i.held.left) pac.want = { dx: -1, dy: 0 };
      if (i.held.right) pac.want = { dx: 1, dy: 0 };
      if (i.held.up) pac.want = { dx: 0, dy: -1 };
      if (i.held.down) pac.want = { dx: 0, dy: 1 };

      const pspd = cs * (5.4 + level * 0.16);
      step(pac, dt, pspd);
      mouth += dt * 9;

      // точки
      const d = dots[pac.gy] && dots[pac.gy][pac.gx];
      if (d) {
        dots[pac.gy][pac.gx] = 0; totalDots--;
        if (d === 2) {
          score += 50; frightT = Math.max(3, 7.5 - level * 0.4); eatenCombo = 0;
          Sound.power(); api.shake(5, 0.2);
          api.emit(pac.x, pac.y, { n: 22, color: '#7ad7ff', speedMax: 260, life: 0.7 });
        } else { score += 10; Sound.blip(600 + Math.random() * 80); }
        api.score(score);
      }
      if (!totalDots) { score += 300; api.score(score); nextLevel(); return; }

      // фрукт
      fruitT -= dt;
      if (!fruit && fruitT <= 0 && totalDots < 0.66 * dots.flat().length) {
        fruit = { gx: Math.floor(COLS / 2), gy: Math.floor(ROWS / 2) + 2, t: 9 };
        fruitT = 20;
      }
      if (fruit) {
        fruit.t -= dt;
        if (fruit.t <= 0) fruit = null;
        else if (pac.gx === fruit.gx && pac.gy === fruit.gy) {
          score += 200 * level; api.score(score); Sound.coin();
          api.emit(pac.x, pac.y, { n: 20, color: '#ff7ab8', speedMax: 260, life: 0.8 });
          fruit = null;
        }
      }

      fieldT -= dt;
      if (fieldT <= 0) { bfs(); fieldT = 0.22; }
      if (frightT > 0) frightT -= dt;
      lvlT += dt;

      const gspd = cs * (4.2 + level * 0.22) * (frightT > 0 ? 0.6 : 1);
      for (const g of ghosts) {
        if (g.inHouse) {
          g.t -= dt;
          if (g.t <= 0) { g.inHouse = false; g.gx = Math.floor(COLS / 2); g.gy = Math.floor(ROWS / 2) - 2; const c = center(g.gx, g.gy); g.x = c[0]; g.y = c[1]; }
          continue;
        }
        const c = center(g.gx, g.gy);
        if (Math.abs(g.x - c[0]) < gspd * dt + 0.6 && Math.abs(g.y - c[1]) < gspd * dt + 0.6) {
          g.mode = (Math.floor(lvlT / 6) % 2 === 0) ? 'chase' : 'scatter';
          ghostThink(g);
        }
        step(g, dt, gspd);
        if (M.dist(g.x, g.y, pac.x, pac.y) < cs * 0.62) {
          if (frightT > 0) {
            eatenCombo++;
            score += 200 * Math.pow(2, eatenCombo - 1); api.score(score);
            Sound.power(); g.inHouse = true; g.t = 2.2;
            const cc = center(Math.floor(COLS / 2), Math.floor(ROWS / 2));
            g.x = cc[0]; g.y = cc[1]; g.gx = Math.floor(COLS / 2); g.gy = Math.floor(ROWS / 2);
            api.emit(pac.x, pac.y, { n: 26, color: g.col, speedMax: 300, life: 0.8 });
          } else killPac();
        }
      }
      api.setHud(`❤ ${lives} · ур. <b style="color:#ffd400">${level}</b> · точек ${totalDots}${frightT > 0 ? ' · <b style="color:#7ad7ff">ЖРИ!</b>' : ''}`);
    }

    function draw(c) {
      const W = api.W, H = api.H;
      c.fillStyle = '#05050f'; c.fillRect(0, 0, W, H);
      // стены
      for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) {
        if (!grid[y][x]) continue;
        const px = ox + x * cs, py = oy + y * cs;
        c.fillStyle = '#141438';
        c.fillRect(px, py, cs, cs);
        c.strokeStyle = 'rgba(90,120,255,.55)'; c.lineWidth = 1.6;
        const nb = (dx, dy) => { const yy = y + dy, xx = ((x + dx) % COLS + COLS) % COLS; return yy < 0 || yy >= ROWS || !grid[yy][xx]; };
        c.beginPath();
        if (nb(0, -1)) { c.moveTo(px, py + 1); c.lineTo(px + cs, py + 1); }
        if (nb(0, 1)) { c.moveTo(px, py + cs - 1); c.lineTo(px + cs, py + cs - 1); }
        if (nb(-1, 0)) { c.moveTo(px + 1, py); c.lineTo(px + 1, py + cs); }
        if (nb(1, 0)) { c.moveTo(px + cs - 1, py); c.lineTo(px + cs - 1, py + cs); }
        c.stroke();
      }
      // точки
      for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) {
        const v = dots[y] && dots[y][x]; if (!v) continue;
        const px = ox + (x + 0.5) * cs, py = oy + (y + 0.5) * cs;
        if (v === 2) {
          c.fillStyle = '#ffd400'; c.globalAlpha = 0.55 + 0.45 * Math.sin(api.t * 7);
          c.beginPath(); c.arc(px, py, cs * 0.3, 0, 7); c.fill(); c.globalAlpha = 1;
        } else {
          c.fillStyle = '#ffe9a8';
          c.beginPath(); c.arc(px, py, Math.max(1.6, cs * 0.09), 0, 7); c.fill();
        }
      }
      if (fruit) {
        const px = ox + (fruit.gx + 0.5) * cs, py = oy + (fruit.gy + 0.5) * cs;
        c.font = `${Math.round(cs * 0.9)}px system-ui`; c.textAlign = 'center'; c.textBaseline = 'middle';
        c.fillText('🍒', px, py); c.textBaseline = 'alphabetic';
      }
      // призраки
      for (const g of ghosts) {
        const r = cs * 0.46;
        c.fillStyle = frightT > 0 ? (frightT < 1.6 && Math.floor(api.t * 8) % 2 ? '#fff' : '#3b5bff') : g.col;
        c.beginPath();
        c.arc(g.x, g.y - r * 0.15, r, Math.PI, 0);
        c.lineTo(g.x + r, g.y + r * 0.8);
        for (let k = 0; k < 3; k++) c.lineTo(g.x + r - (k + 0.5) * (2 * r / 3), g.y + r * 0.55);
        c.lineTo(g.x - r, g.y + r * 0.8);
        c.closePath(); c.fill();
        c.fillStyle = '#fff';
        c.beginPath(); c.arc(g.x - r * 0.33, g.y - r * 0.25, r * 0.26, 0, 7); c.fill();
        c.beginPath(); c.arc(g.x + r * 0.33, g.y - r * 0.25, r * 0.26, 0, 7); c.fill();
        c.fillStyle = frightT > 0 ? '#ff4d6d' : '#1a1a4a';
        c.beginPath(); c.arc(g.x - r * 0.33 + g.dir.dx * r * 0.1, g.y - r * 0.25 + g.dir.dy * r * 0.1, r * 0.13, 0, 7); c.fill();
        c.beginPath(); c.arc(g.x + r * 0.33 + g.dir.dx * r * 0.1, g.y - r * 0.25 + g.dir.dy * r * 0.1, r * 0.13, 0, 7); c.fill();
      }
      // пакмен
      if (!dead || deadT < 0.6) {
        const r = cs * 0.48;
        const open = dead ? Math.min(1, deadT * 2) * Math.PI : (0.16 + 0.2 * Math.abs(Math.sin(mouth))) * Math.PI;
        const ang = Math.atan2(pac.dir.dy, pac.dir.dx) || 0;
        c.fillStyle = '#ffd400'; c.shadowColor = '#ffd400'; c.shadowBlur = 14;
        c.beginPath();
        c.moveTo(pac.x, pac.y);
        c.arc(pac.x, pac.y, r, ang + open / 2, ang - open / 2 + Math.PI * 2);
        c.closePath(); c.fill(); c.shadowBlur = 0;
      }
    }

    return { reset, update, draw, resize: () => { layout(); [pac, ...(ghosts || [])].forEach(e => { if (e) { const c = center(e.gx, e.gy); e.x = c[0]; e.y = c[1]; } }); } };
  },
};
