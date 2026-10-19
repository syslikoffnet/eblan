 /* Пузыри (Bubble Shooter) */
import { M, Sound } from '../engine.js';

const COLORS = ['#ff4d6d', '#ffb020', '#ffd43b', '#7CFC00', '#4dabf7', '#b06bff'];
const COLS = 11;

export default {
  init(api) {
    let grid, r, ox, oy, rowsN, cur, next, flying, aim, shots, score, dead, falling, ceilRow, over, rowShift;

    function layout() {
      r = Math.floor(api.W / (COLS * 2 + 1));
      ox = (api.W - r * 2 * COLS) / 2 + r;
      oy = 44;
      rowsN = Math.max(8, Math.floor((api.H - 150) / (r * 1.73)));
    }

    function pos(row, col) {
      return [ox + col * r * 2 + (row % 2 ? r : 0), oy + row * r * 1.73];
    }

    function neighbors(row, col) {
      const odd = row % 2 === 1;
      const d = odd
        ? [[-1, 0], [-1, 1], [0, -1], [0, 1], [1, 0], [1, 1]]
        : [[-1, -1], [-1, 0], [0, -1], [0, 1], [1, -1], [1, 0]];
      return d.map(([dr, dc]) => [row + dr, col + dc]).filter(([rr, cc]) => rr >= 0 && cc >= 0 && cc < COLS);
    }

    function build() {
      grid = [];
      const startRows = 5;
      for (let row = 0; row < startRows; row++) {
        const arr = [];
        for (let c = 0; c < COLS; c++) arr.push(M.rint(0, COLORS.length - 1));
        grid.push(arr);
      }
      ceilRow = 0;
    }

    function activeColors() {
      const set = new Set();
      grid.forEach(row => row.forEach(v => { if (v !== null && v !== undefined) set.add(v); }));
      return [...set];
    }

    function newBubble() {
      const cols = activeColors();
      return cols.length ? M.pick(cols) : M.rint(0, COLORS.length - 1);
    }

    function reset() {
      layout();
      build();
      cur = newBubble(); next = newBubble();
      flying = null; aim = -Math.PI / 2; shots = 0; score = 0; dead = false; falling = [];
      over = false; rowShift = 0;
      api.score(0);
    }

    function shoot() {
      if (flying || over) return;
      const sp = api.H * 1.5;
      flying = { x: api.W / 2, y: api.H - 90, vx: Math.cos(aim) * sp, vy: Math.sin(aim) * sp, color: cur };
      cur = next; next = newBubble();
      shots++;
      Sound.blip(620);
      if (shots % 8 === 0) addRow();
    }

    function addRow() {
      const arr = [];
      for (let c = 0; c < COLS; c++) arr.push(M.rint(0, COLORS.length - 1));
      grid.unshift(arr);
      rowShift++;
      Sound.hit();
      const maxY = maxYOfBubbles();
      if (maxY > api.H - 130) lose();
    }

    function maxYOfBubbles() {
      let m = 0;
      grid.forEach((row, ri) => row.forEach((v, ci) => {
        if (v === null || v === undefined) return;
        const [x, y] = pos(ri, ci); void x;
        m = Math.max(m, y);
      }));
      return m;
    }

    function snap(x, y, color) {
      // ближайшая свободная ячейка
      let bestCell = null, bestD = Infinity;
      const rowGuess = M.clamp(Math.round((y - oy) / (r * 1.73)), 0, grid.length);
      for (let row = Math.max(0, rowGuess - 2); row <= Math.min(grid.length, rowGuess + 2); row++) {
        const n = COLS;
        if (!grid[row]) grid[row] = [];
        for (let c = 0; c < n; c++) {
          if (grid[row][c] !== null && grid[row][c] !== undefined) continue;
          const [px, py] = pos(row, c);
          const d = Math.hypot(px - x, py - y);
          if (d < bestD) { bestD = d; bestCell = [row, c]; }
        }
      }
      if (!bestCell) { bestCell = [grid.length, 0]; grid.push([color]); return; }
      grid[bestCell[0]][bestCell[1]] = color;
      return bestCell;
    }

    function cluster(row, col) {
      const color = grid[row][col];
      const seen = new Set([row + ',' + col]);
      const q = [[row, col]];
      const out = [[row, col]];
      while (q.length) {
        const [rr, cc] = q.shift();
        for (const [nr, nc] of neighbors(rr, cc)) {
          const k = nr + ',' + nc;
          if (seen.has(k)) continue;
          if (!grid[nr] || grid[nr][nc] !== color) continue;
          seen.add(k); q.push([nr, nc]); out.push([nr, nc]);
        }
      }
      return out;
    }

    function floating() {
      const attached = new Set();
      const q = [];
      (grid[0] || []).forEach((v, c) => { if (v !== null && v !== undefined) { q.push([0, c]); attached.add('0,' + c); } });
      while (q.length) {
        const [rr, cc] = q.shift();
        for (const [nr, nc] of neighbors(rr, cc)) {
          const k = nr + ',' + nc;
          if (attached.has(k)) continue;
          if (!grid[nr] || grid[nr][nc] === null || grid[nr][nc] === undefined) continue;
          attached.add(k); q.push([nr, nc]);
        }
      }
      const out = [];
      grid.forEach((row, ri) => row.forEach((v, ci) => {
        if (v === null || v === undefined) return;
        if (!attached.has(ri + ',' + ci)) out.push([ri, ci]);
      }));
      return out;
    }

    function popCells(cells, mult = 1) {
      for (const [rr, cc] of cells) {
        const v = grid[rr][cc];
        if (v === null || v === undefined) continue;
        const [x, y] = pos(rr, cc);
        falling.push({ x, y, vx: M.rand(-90, 90), vy: M.rand(-60, 40), color: v, t: 1.1, rr: 0 });
        grid[rr][cc] = null;
        score += Math.round(20 * mult);
      }
      api.score(score);
    }

    function lose() {
      if (over) return;
      over = true; Sound.boom(); api.shake(14, 0.5);
      setTimeout(() => api.over(score), 900);
    }

    function update(dt) {
      if (over) { falling.forEach(f => { f.vy += 900 * dt; f.x += f.vx * dt; f.y += f.vy * dt; f.rr += dt * 6; }); return; }
      const i = api.input;
      const p = i.pointer;
      if (p.down) {
        const sx = api.W / 2, sy = api.H - 90;
        let a = Math.atan2(p.y - sy, p.x - sx);
        a = M.clamp(a, -Math.PI + 0.22, -0.22);
        aim = a;
      }
      if (i.pressed.left) aim = M.clamp(aim - 1.8 * dt * 10, -Math.PI + 0.22, -0.22);
      if (i.pressed.right) aim = M.clamp(aim + 1.8 * dt * 10, -Math.PI + 0.22, -0.22);
      if (i.pressed.a && !p.down) shoot();
      if (i.events.some(e => e.type === 'up')) shoot();   // отпустил палец — выстрел

      // полёт
      if (flying) {
        const steps = 4;
        for (let s = 0; s < steps && flying; s++) {
          flying.x += flying.vx * dt / steps;
          flying.y += flying.vy * dt / steps;
          if (flying.x < r) { flying.x = r; flying.vx = Math.abs(flying.vx); Sound.blip(300); }
          if (flying.x > api.W - r) { flying.x = api.W - r; flying.vx = -Math.abs(flying.vx); Sound.blip(300); }
          let stuck = flying.y <= oy + r * 0.6;
          if (!stuck) {
            for (let ri = 0; ri < grid.length && !stuck; ri++) {
              for (let ci = 0; ci < (grid[ri] ? grid[ri].length : 0); ci++) {
                const v = grid[ri][ci];
                if (v === null || v === undefined) continue;
                const [bx, by] = pos(ri, ci);
                if (Math.hypot(bx - flying.x, by - flying.y) < r * 1.7) { stuck = true; break; }
              }
            }
          }
          if (stuck) {
            const cell = snap(flying.x, flying.y, flying.color);
            flying = null;
            Sound.hit();
            if (cell) {
              const cl = cluster(cell[0], cell[1]);
              if (cl.length >= 3) {
                Sound.coin(); api.shake(4, 0.15);
                popCells(cl, 1);
                const fl = floating();
                if (fl.length) { Sound.power(); popCells(fl, 2.5); }
                if (!activeColors().length) {
                  score += 1500; api.score(score); Sound.win();
                  api.emit(api.W / 2, api.H / 2, { n: 60, color: '#ffd43b', speedMax: 460, life: 1.3 });
                  setTimeout(() => { if (!over) { build(); reset(); } }, 900);
                }
              }
            }
            if (maxYOfBubbles() > api.H - 128) lose();
          }
        }
      }

      for (let k = falling.length - 1; k >= 0; k--) {
        const f = falling[k];
        f.vy += 1200 * dt; f.x += f.vx * dt; f.y += f.vy * dt; f.rr += dt * 7; f.t -= dt;
        if (f.t <= 0 || f.y > api.H + 40) falling.splice(k, 1);
      }
      api.setHud(`пузырей <b style="color:#7ad7ff">${grid.flat().filter(v => v !== null && v !== undefined).length}</b> · выстрелов ${shots} · ряд ${grid.length}`);
    }

    function bubble(c, x, y, color, rad = r, alpha = 1) {
      c.globalAlpha = alpha;
      const g = c.createRadialGradient(x - rad * 0.3, y - rad * 0.35, rad * 0.1, x, y, rad);
      g.addColorStop(0, '#fff');
      g.addColorStop(0.25, COLORS[color]);
      g.addColorStop(1, COLORS[color]);
      c.fillStyle = g;
      c.beginPath(); c.arc(x, y, rad * 0.94, 0, 7); c.fill();
      c.fillStyle = 'rgba(255,255,255,.65)';
      c.beginPath(); c.ellipse(x - rad * 0.3, y - rad * 0.35, rad * 0.22, rad * 0.14, -0.6, 0, 7); c.fill();
      c.globalAlpha = 1;
    }

    function draw(c) {
      const W = api.W, H = api.H;
      const g = c.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, '#1a2a5a'); g.addColorStop(1, '#080c1c');
      c.fillStyle = g; c.fillRect(0, 0, W, H);
      c.fillStyle = 'rgba(255,255,255,.05)';
      for (let i = 0; i < 30; i++) c.fillRect((i * 97) % W, (i * 151) % H, 2, 2);

      // линия поражения
      c.strokeStyle = 'rgba(255,77,109,.5)'; c.lineWidth = 2; c.setLineDash([8, 8]);
      c.beginPath(); c.moveTo(0, H - 128); c.lineTo(W, H - 128); c.stroke(); c.setLineDash([]);

      grid.forEach((row, ri) => row.forEach((v, ci) => {
        if (v === null || v === undefined) return;
        const [x, y] = pos(ri, ci);
        if (y > H + r) return;
        bubble(c, x, y, v);
      }));

      for (const f of falling) bubble(c, f.x, f.y, f.color, r * M.clamp(f.t, 0.3, 1), M.clamp(f.t, 0, 1));

      // прицел
      const sx = W / 2, sy = H - 90;
      c.strokeStyle = 'rgba(255,255,255,.22)'; c.lineWidth = 2; c.setLineDash([4, 10]);
      let ax = sx, ay = sy, avx = Math.cos(aim), avy = Math.sin(aim);
      c.beginPath(); c.moveTo(ax, ay);
      for (let k = 0; k < 220; k++) {
        ax += avx * 6; ay += avy * 6;
        if (ax < r || ax > W - r) avx *= -1;
        if (ay < oy) break;
        let hitB = false;
        for (let ri = 0; ri < grid.length && !hitB; ri++) for (let ci = 0; ci < grid[ri].length; ci++) {
          const v = grid[ri][ci]; if (v === null || v === undefined) continue;
          const [bx, by] = pos(ri, ci);
          if (Math.hypot(bx - ax, by - ay) < r * 1.7) { hitB = true; break; }
        }
        if (hitB) break;
        c.lineTo(ax, ay);
      }
      c.stroke(); c.setLineDash([]);

      if (flying) bubble(c, flying.x, flying.y, flying.color);
      bubble(c, sx, sy, cur, r * 1.05);
      bubble(c, sx - r * 2.6, sy + r * 0.7, next, r * 0.7);
      c.fillStyle = 'rgba(255,255,255,.5)'; c.textAlign = 'center';
      c.font = `700 ${Math.round(W * 0.032)}px system-ui`;
      c.fillText('дальше', sx - r * 2.6, sy + r * 2.1);
      // пушка
      c.fillStyle = '#2a3a6a';
      M.roundRect(c, sx - r * 1.5, sy + r * 0.6, r * 3, r * 1.5, 8); c.fill();
    }

    return { reset, update, draw, resize: () => layout() };
  },
};
