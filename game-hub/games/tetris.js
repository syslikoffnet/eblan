 /* Тетрис */
import { M, Sound } from '../engine.js';

const SHAPES = {
  I: { n: 4, cells: [[0, 1], [1, 1], [2, 1], [3, 1]], color: '#00e5c0' },
  O: { n: 4, cells: [[1, 0], [2, 0], [1, 1], [2, 1]], color: '#ffd400' },
  T: { n: 3, cells: [[1, 0], [0, 1], [1, 1], [2, 1]], color: '#b06bff' },
  S: { n: 3, cells: [[1, 0], [2, 0], [0, 1], [1, 1]], color: '#7CFC00' },
  Z: { n: 3, cells: [[0, 0], [1, 0], [1, 1], [2, 1]], color: '#ff4d6d' },
  J: { n: 3, cells: [[0, 0], [0, 1], [1, 1], [2, 1]], color: '#5b8def' },
  L: { n: 3, cells: [[2, 0], [0, 1], [1, 1], [2, 1]], color: '#ff9f1c' },
};
const KEYS = Object.keys(SHAPES);

export default {
  init(api) {
    const COLS = 10;
    let rows, cs, ox, oy, board, cur, next, bag, x, y, rot, fallT, fallInt,
      level, lines, score, dead, clearing, clearT, lockT, combo, das, dasDelay;

    function layout() {
      cs = Math.floor(Math.min(api.W * 0.86 / COLS, (api.H - 84) / 19));
      rows = Math.floor((api.H - 84) / cs);
      ox = Math.floor((api.W - COLS * cs) / 2);
      oy = Math.floor((api.H - rows * cs) / 2) + 8;
    }

    const cell = (k, r) => {
      const s = SHAPES[k];
      let cells = s.cells;
      for (let i = 0; i < r; i++) cells = cells.map(([cx, cy]) => [s.n - 1 - cy, cx]);
      return cells;
    };

    function fromBag() {
      if (!bag.length) bag = M.shuffle(KEYS.slice());
      return bag.pop();
    }

    function spawn() {
      const k = next || fromBag();
      next = fromBag();
      cur = k; rot = 0;
      x = Math.floor((COLS - SHAPES[k].n) / 2); y = -1;
      lockT = 0;
      if (collides(x, y, rot)) { die(); }
    }

    function collides(nx, ny, nrot, k = cur) {
      for (const [cx, cy] of cell(k, nrot)) {
        const bx = nx + cx, by = ny + cy;
        if (bx < 0 || bx >= COLS || by >= rows) return true;
        if (by >= 0 && board[by][bx]) return true;
      }
      return false;
    }

    function move(dx) {
      if (!collides(x + dx, y, rot)) { x += dx; Sound.blip(240); lockT = 0; }
    }
    function rotate() {
      const nr = (rot + 1) % 4;
      for (const k of [0, -1, 1, -2, 2]) {
        if (!collides(x + k, y, nr)) { rot = nr; x += k; Sound.blip(520); lockT = 0; return; }
        if (!collides(x + k, y - 1, nr)) { rot = nr; x += k; y -= 1; Sound.blip(520); lockT = 0; return; }
      }
    }
    function softDrop() {
      if (!collides(x, y + 1, rot)) { y++; score += 1; api.score(score); fallT = 0; }
      else lockT += 0.05;
    }
    function hardDrop() {
      let d = 0;
      while (!collides(x, y + 1, rot)) { y++; d++; }
      score += d * 2; api.score(score);
      Sound.hit(); api.shake(4, 0.1);
      for (const [cx, cy] of cell(cur, rot))
        api.emit(ox + (x + cx + 0.5) * cs, oy + (y + cy + 0.5) * cs, { n: 2, color: SHAPES[cur].color, speedMax: 90, life: 0.3 });
      lock();
    }

    function lock() {
      for (const [cx, cy] of cell(cur, rot)) {
        const bx = x + cx, by = y + cy;
        if (by >= 0 && by < rows) board[by][bx] = SHAPES[cur].color;
      }
      // линии
      const full = [];
      for (let r = 0; r < rows; r++) if (board[r].every(v => v)) full.push(r);
      if (full.length) {
        clearing = full; clearT = 0.28; combo++;
        const pts = [0, 100, 300, 500, 800][full.length] * level + (combo > 1 ? 50 * combo : 0);
        score += pts; api.score(score);
        lines += full.length;
        level = 1 + Math.floor(lines / 10);
        fallInt = Math.max(0.06, 0.85 * Math.pow(0.86, level - 1));
        Sound.power(); api.shake(6, 0.2);
        full.forEach(r => {
          for (let cx = 0; cx < COLS; cx++)
            api.emit(ox + (cx + 0.5) * cs, oy + (r + 0.5) * cs, { n: 3, color: '#fff', speedMax: 220, life: 0.5 });
        });
      } else { combo = 0; Sound.blip(180); }
      cur = null;
      if (!clearing) spawn();
    }

    function die() {
      dead = true; Sound.boom(); api.shake(12, 0.4);
      setTimeout(() => api.over(score), 600);
    }

    function reset() {
      layout();
      board = Array.from({ length: rows }, () => Array(COLS).fill(null));
      bag = []; next = null; cur = null;
      level = 1; lines = 0; score = 0; combo = 0;
      fallT = 0; fallInt = 0.85; dead = false; clearing = null; clearT = 0; lockT = 0; das = 0; dasDelay = 0.17;
      api.score(0);
      spawn();
    }

    function update(dt) {
      if (dead) return;
      const i = api.input;
      if (clearing) {
        clearT -= dt;
        if (clearT <= 0) {
          clearing.sort((a, b) => a - b).forEach(r => { board.splice(r, 1); board.unshift(Array(COLS).fill(null)); });
          clearing = null; spawn();
        }
        return;
      }
      if (i.pressed.left) { move(-1); das = dasDelay = 0.17; }
      if (i.pressed.right) { move(1); das = dasDelay = 0.17; }
      if (i.pressed.up || i.pressed.a) rotate();
      if (i.pressed.b) hardDrop();
      const sw = i.swipes[i.swipes.length - 1];
      if (sw) {
        if (sw.dir === 'left') move(-1);
        else if (sw.dir === 'right') move(1);
        else if (sw.dir === 'down') hardDrop();
        else rotate();
      }
      das -= dt;
      if ((i.held.left || i.held.right) && das <= 0) {
        move(i.held.left ? -1 : 1); das = 0.05;
      }
      fallT += dt;
      if (i.held.down) fallT += dt * 8;
      while (fallT >= fallInt) {
        fallT -= fallInt;
        if (!collides(x, y + 1, rot)) { y++; lockT = 0; if (i.held.down) { score++; api.score(score); } }
        else {
          lockT += fallInt;
          if (lockT > 0.4) { lock(); break; }
        }
      }
      api.setHud(`ур. <b style="color:#00e5c0">${level}</b> · линий ${lines} · след. <b>${next}</b>`);
    }

    function block(c, px, py, color, ghost) {
      c.fillStyle = color;
      c.globalAlpha = ghost ? 0.22 : 1;
      M.roundRect(c, px + 1, py + 1, cs - 2, cs - 2, Math.max(2, cs * 0.16));
      c.fill();
      if (!ghost) {
        c.fillStyle = 'rgba(255,255,255,.25)';
        c.fillRect(px + 2, py + 2, cs - 4, Math.max(2, cs * 0.14));
        c.fillStyle = 'rgba(0,0,0,.22)';
        c.fillRect(px + 2, py + cs - 4, cs - 4, 2);
      }
      c.globalAlpha = 1;
    }

    function draw(c) {
      const W = api.W, H = api.H;
      c.fillStyle = '#0a0a16'; c.fillRect(0, 0, W, H);
      // поле
      c.fillStyle = '#101022';
      c.fillRect(ox, oy, COLS * cs, rows * cs);
      c.strokeStyle = 'rgba(255,255,255,.05)'; c.lineWidth = 1;
      for (let r = 0; r <= rows; r++) { c.beginPath(); c.moveTo(ox, oy + r * cs); c.lineTo(ox + COLS * cs, oy + r * cs); c.stroke(); }
      for (let k = 0; k <= COLS; k++) { c.beginPath(); c.moveTo(ox + k * cs, oy); c.lineTo(ox + k * cs, oy + rows * cs); c.stroke(); }

      for (let r = 0; r < rows; r++) for (let k = 0; k < COLS; k++) {
        if (!board[r][k]) continue;
        if (clearing && clearing.includes(r)) {
          c.globalAlpha = 0.3 + 0.7 * Math.abs(Math.sin(api.t * 30));
          block(c, ox + k * cs, oy + r * cs, '#fff');
          c.globalAlpha = 1;
        } else block(c, ox + k * cs, oy + r * cs, board[r][k]);
      }

      if (cur && !dead) {
        // призрак
        let gy = y;
        while (!collides(x, gy + 1, rot)) gy++;
        for (const [cx, cy] of cell(cur, rot)) {
          const by = gy + cy; if (by < 0) continue;
          block(c, ox + (x + cx) * cs, oy + by * cs, SHAPES[cur].color, true);
        }
        for (const [cx, cy] of cell(cur, rot)) {
          const by = y + cy; if (by < 0) continue;
          block(c, ox + (x + cx) * cs, oy + by * cs, SHAPES[cur].color);
        }
      }
      c.strokeStyle = 'rgba(124,92,255,.5)'; c.lineWidth = 2;
      c.strokeRect(ox - 2, oy - 2, COLS * cs + 4, rows * cs + 4);
    }

    return { reset, update, draw, resize: () => { const s = board; layout(); if (s) { while (s.length < rows) s.unshift(Array(COLS).fill(null)); } } };
  },
};
