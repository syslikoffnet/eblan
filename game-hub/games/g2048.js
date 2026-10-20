 /* 2048 */
import { M, Sound } from '../engine.js';

const TILE = {
  2: ['#eee4da', '#776e65'], 4: ['#ede0c8', '#776e65'], 8: ['#f2b179', '#fff'],
  16: ['#f59563', '#fff'], 32: ['#f67c5f', '#fff'], 64: ['#f65e3b', '#fff'],
  128: ['#edcf72', '#fff'], 256: ['#edcc61', '#fff'], 512: ['#edc850', '#fff'],
  1024: ['#edc53f', '#fff'], 2048: ['#edc22e', '#fff'], 4096: ['#3c3a32', '#fff'],
};
const color = v => TILE[v] || ['#3c3a32', '#fff'];

export default {
  winTitle: '2048 собран!',
  init(api) {
    const N = 4;
    let grid, score, best, moved, won, over, undo, animT, spawnCell, mergeFx, padS, cs;

    function layout() {
      padS = Math.min(api.W * 0.92, api.H * 0.6);
      cs = padS / N;
    }
    const ox = () => (api.W - padS) / 2;
    const oy = () => (api.H - padS) / 2 + api.H * 0.02;

    function empty() {
      const e = [];
      for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) if (!grid[r][c]) e.push([r, c]);
      return e;
    }
    function addRandom() {
      const e = empty();
      if (!e.length) return null;
      const [r, c] = M.pick(e);
      grid[r][c] = M.chance(0.9) ? 2 : 4;
      spawnCell = [r, c];
      return [r, c];
    }

    function reset() {
      layout();
      grid = Array.from({ length: N }, () => Array(N).fill(0));
      score = 0; best = 0; moved = false; won = false; over = false; undo = null;
      animT = 0; mergeFx = []; spawnCell = null;
      addRandom(); addRandom();
      api.score(0);
    }

    function slide(row) {
      const vals = row.filter(v => v);
      const out = []; let gained = 0; let didMerge = false;
      for (let i = 0; i < vals.length; i++) {
        if (i + 1 < vals.length && vals[i] === vals[i + 1]) {
          out.push(vals[i] * 2); gained += vals[i] * 2; i++; didMerge = true;
          if (vals[i] * 2 > best) best = vals[i] * 2;
        } else out.push(vals[i]);
      }
      while (out.length < N) out.push(0);
      return { row: out, gained, changed: didMerge || row.some((v, i) => v !== out[i]) };
    }

    function move(dir) {
      if (over) return;
      const prev = { grid: grid.map(r => r.slice()), score };
      let gained = 0, changed = false;
      const get = (r, c) => {
        if (dir === 'left') return grid[r][c];
        if (dir === 'right') return grid[r][N - 1 - c];
        if (dir === 'up') return grid[c][r];
        return grid[N - 1 - c][r];
      };
      const set = (r, c, v) => {
        if (dir === 'left') grid[r][c] = v;
        else if (dir === 'right') grid[r][N - 1 - c] = v;
        else if (dir === 'up') grid[c][r] = v;
        else grid[N - 1 - c][r] = v;
      };
      for (let r = 0; r < N; r++) {
        const line = [];
        for (let c = 0; c < N; c++) line.push(get(r, c));
        const res = slide(line);
        for (let c = 0; c < N; c++) set(r, c, res.row[c]);
        gained += res.gained; if (res.changed) changed = true;
      }
      if (!changed) { Sound.blip(140); return; }
      undo = prev;
      score += gained;
      if (gained) { Sound.coin(); mergeFx.push({ t: 0.3 }); }
      else Sound.blip(320);
      api.score(score);
      addRandom();
      animT = 0.16;
      if (!won && grid.some(r => r.some(v => v >= 2048))) { won = true; Sound.win(); }
      if (!canMove()) { over = true; Sound.bad(); setTimeout(() => api.over(score), 700); }
    }

    function canMove() {
      if (empty().length) return true;
      for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
        const v = grid[r][c];
        if (c + 1 < N && grid[r][c + 1] === v) return true;
        if (r + 1 < N && grid[r + 1][c] === v) return true;
      }
      return false;
    }

    function doUndo() {
      if (!undo) return;
      grid = undo.grid; score = undo.score; api.score(score); undo = null; over = false;
      Sound.blip(420);
    }

    function update(dt) {
      animT = Math.max(0, animT - dt);
      mergeFx = mergeFx.filter(f => (f.t -= dt) > 0);
      const i = api.input;
      const sw = i.swipes[i.swipes.length - 1];
      if (sw) move(sw.dir);
      else if (i.pressed.left) move('left');
      else if (i.pressed.right) move('right');
      else if (i.pressed.up) move('up');
      else if (i.pressed.down) move('down');
      else if (i.pressed.a) doUndo();     // тап = отмена хода
      api.setHud(undo ? '<b style="color:#ffd43b">тап — отменить ход</b>' :
        (won ? '🏆 2048! играй дальше' : `лучшая плитка <b style="color:#00e5c0">${best || 2}</b>`));
    }

    function draw(c) {
      const W = api.W, H = api.H;
      const g = c.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, '#1b1b2f'); g.addColorStop(1, '#0b0b16');
      c.fillStyle = g; c.fillRect(0, 0, W, H);

      const X = ox(), Y = oy();
      c.fillStyle = '#bbada0';
      M.roundRect(c, X - 8, Y - 8, padS + 16, padS + 16, 14); c.fill();
      c.fillStyle = 'rgba(238,228,218,.35)';
      for (let r = 0; r < N; r++) for (let cc = 0; cc < N; cc++) {
        M.roundRect(c, X + cc * cs + 5, Y + r * cs + 5, cs - 10, cs - 10, 8); c.fill();
      }
      const k = animT > 0 ? 1 - animT / 0.16 : 1;
      for (let r = 0; r < N; r++) for (let cc = 0; cc < N; cc++) {
        const v = grid[r][cc]; if (!v) continue;
        const isNew = spawnCell && spawnCell[0] === r && spawnCell[1] === cc;
        const sc = isNew ? M.lerp(0.4, 1, k) : M.lerp(1.06, 1, k);
        const [bg, fg] = color(v);
        const w = (cs - 10) * sc, h = (cs - 10) * sc;
        const px = X + cc * cs + 5 + (cs - 10 - w) / 2, py = Y + r * cs + 5 + (cs - 10 - h) / 2;
        c.fillStyle = bg;
        if (v >= 128) { c.shadowColor = bg; c.shadowBlur = 18; }
        M.roundRect(c, px, py, w, h, 8); c.fill(); c.shadowBlur = 0;
        c.fillStyle = fg;
        const fs = Math.round(cs * (v < 100 ? 0.42 : v < 1000 ? 0.34 : 0.27));
        c.font = `900 ${fs}px system-ui`; c.textAlign = 'center'; c.textBaseline = 'middle';
        c.fillText(v, px + w / 2, py + h / 2 + 1);
      }
      c.textBaseline = 'alphabetic';
      if (over) { c.fillStyle = 'rgba(0,0,0,.45)'; c.fillRect(X - 8, Y - 8, padS + 16, padS + 16); }
    }

    return { reset, update, draw, resize: () => layout() };
  },
};
