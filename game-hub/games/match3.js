 /* Три в ряд (Candy Crush лайт) */
import { M, Sound } from '../engine.js';

const COLS = 8, ROWS = 8;
const COLORS = ['#ff4d6d', '#ffb020', '#ffd43b', '#7CFC00', '#4dabf7', '#b06bff'];
const SHAPES = ['circle', 'square', 'triangle', 'diamond', 'hex', 'star'];

export default {
  init(api) {
    let grid, cs, ox, oy, phase, phaseT, sel, moves, goal, score, level, cascade, chain, dragFrom, over, shuffleT, hint;

    function layout() {
      cs = Math.floor(Math.min(api.W * 0.94 / COLS, (api.H - 130) / ROWS));
      ox = Math.floor((api.W - cs * COLS) / 2);
      oy = Math.floor((api.H - cs * ROWS - 60) / 2) + 16;
    }

    function newCell(r, c, color) {
      return { color: color ?? M.rint(0, COLORS.length - 1), sp: null, oy: 0, pop: 0, sc: 1 };
    }

    function build() {
      grid = Array.from({ length: ROWS }, (_, r) => Array.from({ length: COLS }, (_, c) => newCell(r, c)));
      // убрать стартовые совпадения
      let guard = 0;
      while (matches().length && guard++ < 300) {
        for (const m of matches()) for (const [r, c] of m.cells) grid[r][c].color = M.rint(0, COLORS.length - 1);
      }
      if (!possibleMove()) reshuffle();
    }

    function matches() {
      const out = [];
      const mark = Array.from({ length: ROWS }, () => Array(COLS).fill(false));
      // горизонтали
      for (let r = 0; r < ROWS; r++) {
        let run = 1;
        for (let c = 1; c <= COLS; c++) {
          const same = c < COLS && grid[r][c] && grid[r][c - 1] && grid[r][c].color === grid[r][c - 1].color;
          if (same) run++;
          else {
            if (run >= 3) {
              const cells = [];
              for (let k = c - run; k < c; k++) { cells.push([r, k]); mark[r][k] = true; }
              out.push({ cells, dir: 'h', len: run });
            }
            run = 1;
          }
        }
      }
      for (let c = 0; c < COLS; c++) {
        let run = 1;
        for (let r = 1; r <= ROWS; r++) {
          const same = r < ROWS && grid[r] && grid[r - 1] && grid[r][c].color === grid[r - 1][c].color;
          if (same) run++;
          else {
            if (run >= 3) {
              const cells = [];
              for (let k = r - run; k < r; k++) { cells.push([k, c]); mark[k][c] = true; }
              out.push({ cells, dir: 'v', len: run });
            }
            run = 1;
          }
        }
      }
      return out;
    }

    function possibleMove() {
      for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
        for (const [dr, dc] of [[0, 1], [1, 0]]) {
          const r2 = r + dr, c2 = c + dc;
          if (r2 >= ROWS || c2 >= COLS) continue;
          swapCells(r, c, r2, c2);
          const ok = matches().length > 0;
          swapCells(r, c, r2, c2);
          if (ok) return [r, c, r2, c2];
        }
      }
      return null;
    }

    function swapCells(r, c, r2, c2) {
      const t = grid[r][c]; grid[r][c] = grid[r2][c2]; grid[r2][c2] = t;
    }

    function reshuffle() {
      const colors = grid.flat().map(g => g.color);
      M.shuffle(colors);
      grid.flat().forEach((g, i) => { g.color = colors[i]; g.oy = -1; });
      shuffleT = 0.5;
      let guard = 0;
      while ((matches().length || !possibleMove()) && guard++ < 200) {
        const cols = grid.flat().map(g => g.color);
        M.shuffle(cols);
        grid.flat().forEach((g, i) => g.color = cols[i]);
      }
    }

    function cellAt(x, y) {
      const c = Math.floor((x - ox) / cs), r = Math.floor((y - oy) / cs);
      if (c < 0 || r < 0 || c >= COLS || r >= ROWS) return null;
      return [r, c];
    }

    function trySwap(r, c, r2, c2) {
      if (phase !== 'idle' || over) return;
      if (r2 < 0 || c2 < 0 || r2 >= ROWS || c2 >= COLS) return;
      swapCells(r, c, r2, c2);
      const ms = matches();
      if (ms.length) {
        phase = 'swapAnim'; phaseT = 0.13; sel = null;
        grid[r][c].oy = (r - r2) * 0.5; grid[c2 !== undefined ? r2 : r][c2].oy = (r2 - r) * 0.5;
        Sound.blip(520);
        moves--;
      } else {
        swapCells(r, c, r2, c2);
        phase = 'deny'; phaseT = 0.2;
        Sound.blip(160);
        grid[r][c].oy = 0;
      }
    }

    function resolvePops() {
      const ms = matches();
      if (!ms.length) {
        cascade = 0;
        if (score >= goal) nextLevel();
        else if (moves <= 0) { over = true; Sound.bad(); setTimeout(() => api.over(score), 800); }
        else if (!possibleMove()) reshuffle();
        phase = 'idle';
        return;
      }
      cascade++;
      const toClear = new Set();
      const specials = [];
      for (const m of ms) {
        m.cells.forEach(([r, c]) => toClear.add(r + ',' + c));
        if (m.len >= 5) specials.push({ r: m.cells[2][0], c: m.cells[2][1], sp: 'bomb', color: grid[m.cells[2][0]][m.cells[2][1]].color });
        else if (m.len === 4) specials.push({ r: m.cells[1][0], c: m.cells[1][1], sp: m.dir === 'h' ? 'v' : 'h', color: grid[m.cells[1][0]][m.cells[1][1]].color });
      }
      // спец-конфеты активируются
      for (const key of [...toClear]) {
        const [r, c] = key.split(',').map(Number);
        const cell = grid[r][c];
        if (!cell || !cell.sp) continue;
        if (cell.sp === 'h') for (let k = 0; k < COLS; k++) toClear.add(r + ',' + k);
        if (cell.sp === 'v') for (let k = 0; k < ROWS; k++) toClear.add(k + ',' + c);
        if (cell.sp === 'bomb') {
          const col = cell.color;
          for (let rr = 0; rr < ROWS; rr++) for (let cc = 0; cc < COLS; cc++) if (grid[rr][cc].color === col) toClear.add(rr + ',' + cc);
        }
      }
      let n = 0;
      for (const key of toClear) {
        const [r, c] = key.split(',').map(Number);
        const cell = grid[r][c];
        if (!cell) continue;
        cell.pop = 0.24; n++;
        api.emit(ox + (c + 0.5) * cs, oy + (r + 0.5) * cs,
          { n: 6, color: COLORS[cell.color], speedMax: 200, life: 0.45 });
      }
      score += n * 10 * cascade;
      api.score(score);
      chain = Math.max(chain, cascade);
      Sound[cascade > 2 ? 'power' : 'coin']();
      if (cascade > 1) api.shake(3 + cascade, 0.12);
      // сохранить спецы
      for (const s of specials) {
        const cell = grid[s.r][s.c];
        cell.sp = s.sp; cell.pop = 0; cell.sc = 1.4;
        toClear.delete(s.r + ',' + s.c);
      }
      setTimeout(() => {
        for (const key of toClear) {
          const [r, c] = key.split(',').map(Number);
          grid[r][c] = null;
        }
        drop();
      }, 240);
      phase = 'pop'; phaseT = 0.26;
    }

    function drop() {
      for (let c = 0; c < COLS; c++) {
        let write = ROWS - 1;
        for (let r = ROWS - 1; r >= 0; r--) {
          if (grid[r][c]) {
            if (write !== r) {
              grid[write][c] = grid[r][c];
              grid[write][c].oy = (r - write);
              grid[r][c] = null;
            }
            write--;
          }
        }
        for (let r = write; r >= 0; r--) {
          grid[r][c] = newCell(r, c);
          grid[r][c].oy = (r - write - 1) - 1;
        }
      }
      phase = 'fall'; phaseT = 0;
      Sound.blip(300);
    }

    function nextLevel() {
      level++;
      goal = Math.round(goal * 1.55);
      moves = 22 + level * 2;
      score += 500; api.score(score);
      Sound.win();
      api.emit(api.W / 2, api.H / 2, { n: 50, color: '#ff7ab8', speedMax: 420, life: 1.1 });
      build();
    }

    function reset() {
      layout();
      level = 1; score = 0; moves = 24; goal = 1200; cascade = 0; chain = 0;
      phase = 'idle'; phaseT = 0; sel = null; dragFrom = null; over = false; shuffleT = 0; hint = null;
      build();
      api.score(0);
    }

    function update(dt) {
      if (over) return;
      shuffleT = Math.max(0, shuffleT - dt);
      // анимации ячеек
      for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
        const cell = grid[r][c]; if (!cell) continue;
        cell.oy = M.lerp(cell.oy, 0, Math.min(1, dt * (phase === 'fall' ? 16 : 22)));
        if (Math.abs(cell.oy) < 0.01) cell.oy = 0;
        cell.pop = Math.max(0, cell.pop - dt);
        cell.sc = M.lerp(cell.sc, 1, Math.min(1, dt * 8));
      }

      if (phaseT > 0) phaseT -= dt;
      if (phase === 'swapAnim' && phaseT <= 0) { phase = 'pop'; resolvePops(); }
      else if (phase === 'deny' && phaseT <= 0) phase = 'idle';
      else if (phase === 'pop' && phaseT <= 0) { /* ждём setTimeout */ }
      else if (phase === 'fall') {
        let settled = true;
        for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) if (grid[r][c] && Math.abs(grid[r][c].oy) > 0.02) settled = false;
        if (settled) { phase = 'pop'; resolvePops(); }
      }

      // ввод
      const i = api.input;
      const p = i.pointer;
      const sw = i.swipes[i.swipes.length - 1];
      if (sw) {
        const cell = cellAt(sw.x ?? p.x, sw.y ?? p.y);
        const from = dragFrom || cell;
        if (from) {
          const d = sw.dir === 'left' ? [0, -1] : sw.dir === 'right' ? [0, 1] : sw.dir === 'up' ? [-1, 0] : [1, 0];
          trySwap(from[0], from[1], from[0] + d[0], from[1] + d[1]);
        }
        dragFrom = null;
      }
      for (const e of i.events) {
        if (e.type === 'down') { const cell = cellAt(e.x, e.y); if (cell) { dragFrom = cell; if (sel && (sel[0] !== cell[0] || sel[1] !== cell[1])) { trySwap(sel[0], sel[1], cell[0], cell[1]); sel = null; } else sel = cell; } }
        else if (e.type === 'move' && dragFrom && p.down) {
          const dx = e.x - (ox + (dragFrom[1] + 0.5) * cs), dy = e.y - (oy + (dragFrom[0] + 0.5) * cs);
          if (Math.hypot(dx, dy) > cs * 0.45) {
            const d = Math.abs(dx) > Math.abs(dy) ? [0, Math.sign(dx)] : [Math.sign(dy), 0];
            trySwap(dragFrom[0], dragFrom[1], dragFrom[0] + d[0], dragFrom[1] + d[1]);
            dragFrom = null; sel = null;
          }
        }
      }
      if (i.pressed.b) { hint = possibleMove(); Sound.click(); }
      api.setHud(`цель <b style="color:#ff7ab8">${goal}</b> · ходов ${moves} · уровень ${level}${cascade > 1 ? ` · <b style="color:#ffd43b">каскад x${cascade}</b>` : ''}`);
    }

    function shape(c, kind, x, y, r) {
      c.beginPath();
      if (kind === 'circle') c.arc(x, y, r, 0, 7);
      else if (kind === 'square') { M.roundRect(c, x - r * 0.85, y - r * 0.85, r * 1.7, r * 1.7, r * 0.3); }
      else if (kind === 'triangle') { c.moveTo(x, y - r); c.lineTo(x + r * 0.95, y + r * 0.75); c.lineTo(x - r * 0.95, y + r * 0.75); c.closePath(); }
      else if (kind === 'diamond') { c.moveTo(x, y - r * 1.1); c.lineTo(x + r * 0.8, y); c.lineTo(x, y + r * 1.1); c.lineTo(x - r * 0.8, y); c.closePath(); }
      else if (kind === 'hex') { for (let k = 0; k < 6; k++) { const a = k * Math.PI / 3; c[k ? 'lineTo' : 'moveTo'](x + Math.cos(a) * r, y + Math.sin(a) * r); } c.closePath(); }
      else { for (let k = 0; k < 10; k++) { const a = k * Math.PI / 5 - Math.PI / 2, rr = k % 2 ? r * 0.45 : r; c[k ? 'lineTo' : 'moveTo'](x + Math.cos(a) * rr, y + Math.sin(a) * rr); } c.closePath(); }
    }

    function draw(c) {
      const W = api.W, H = api.H;
      const g = c.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, '#2a1040'); g.addColorStop(1, '#0d0718');
      c.fillStyle = g; c.fillRect(0, 0, W, H);
      c.fillStyle = 'rgba(0,0,0,.3)';
      M.roundRect(c, ox - 5, oy - 5, cs * COLS + 10, cs * ROWS + 10, 12); c.fill();
      for (let r = 0; r < ROWS; r++) for (let cc = 0; cc < COLS; cc++) {
        if ((r + cc) % 2) { c.fillStyle = 'rgba(255,255,255,.03)'; c.fillRect(ox + cc * cs, oy + r * cs, cs, cs); }
      }
      for (let r = 0; r < ROWS; r++) for (let cc = 0; cc < COLS; cc++) {
        const cell = grid[r][cc]; if (!cell) continue;
        const x = ox + (cc + 0.5) * cs, y = oy + (r + 0.5 + cell.oy) * cs;
        if (y < oy - cs || y > oy + cs * (ROWS + 1)) continue;
        const popK = cell.pop > 0 ? 1 + cell.pop * 2.4 : 1;
        const rad = cs * 0.36 * cell.sc * popK;
        if (cell.pop > 0) c.globalAlpha = M.clamp(cell.pop / 0.24, 0, 1);
        c.save();
        c.translate(x, y);
        if (sel && sel[0] === r && sel[1] === cc) {
          c.strokeStyle = '#fff'; c.lineWidth = 3;
          M.roundRect(c, -cs * 0.45, -cs * 0.45, cs * 0.9, cs * 0.9, 8); c.stroke();
        }
        if (hint && ((hint[0] === r && hint[1] === cc) || (hint[2] === r && hint[3] === cc))) {
          c.strokeStyle = '#ffd43b'; c.lineWidth = 3;
          c.globalAlpha = 0.4 + 0.6 * Math.abs(Math.sin(api.t * 6));
          M.roundRect(c, -cs * 0.46, -cs * 0.46, cs * 0.92, cs * 0.92, 8); c.stroke();
          c.globalAlpha = cell.pop > 0 ? M.clamp(cell.pop / 0.24, 0, 1) : 1;
        }
        c.fillStyle = COLORS[cell.color];
        c.shadowColor = COLORS[cell.color]; c.shadowBlur = cell.sp ? 20 : 8;
        shape(c, SHAPES[cell.color], 0, 0, rad);
        c.fill(); c.shadowBlur = 0;
        c.fillStyle = 'rgba(255,255,255,.35)';
        c.beginPath(); c.ellipse(-rad * 0.25, -rad * 0.3, rad * 0.32, rad * 0.2, -0.6, 0, 7); c.fill();
        if (cell.sp) {
          c.strokeStyle = '#fff'; c.lineWidth = 3;
          if (cell.sp === 'h') { c.beginPath(); c.moveTo(-rad, 0); c.lineTo(rad, 0); c.stroke(); }
          else if (cell.sp === 'v') { c.beginPath(); c.moveTo(0, -rad); c.lineTo(0, rad); c.stroke(); }
          else {
            c.beginPath(); c.arc(0, 0, rad * 0.55, 0, 7); c.stroke();
            c.fillStyle = '#fff'; c.font = `900 ${Math.round(rad)}px system-ui`;
            c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('★', 0, 1); c.textBaseline = 'alphabetic';
          }
        }
        c.restore();
        c.globalAlpha = 1;
      }
      // прогресс цели
      const pw = cs * COLS;
      c.fillStyle = 'rgba(0,0,0,.4)';
      M.roundRect(c, ox, oy + cs * ROWS + 12, pw, 10, 5); c.fill();
      c.fillStyle = '#ff7ab8';
      M.roundRect(c, ox, oy + cs * ROWS + 12, pw * M.clamp(score / goal, 0, 1), 10, 5); c.fill();
      if (shuffleT > 0) {
        c.fillStyle = 'rgba(255,255,255,.85)'; c.textAlign = 'center';
        c.font = `900 ${Math.round(W * 0.07)}px system-ui`;
        c.fillText('ПЕРЕМЕШИВАЕМ!', W / 2, H * 0.5);
      }
    }

    return { reset, update, draw, resize: () => layout() };
  },
};
