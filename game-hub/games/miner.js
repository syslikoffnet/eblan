 /* Сапёр */
import { M, Sound } from '../engine.js';

const NUM = ['', '#4dabf7', '#51cf66', '#ff6b6b', '#b197fc', '#ffd43b', '#38d9a9', '#ff9f1c', '#e599f7'];

export default {
  winTitle: 'Поле разминировано!',
  init(api) {
    let cols, rows, cs, ox, oy, cells, mines, opened, flagged, started, dead, won, time, pressT, pressCell, first;

    function layout() {
      cols = 9;
      cs = Math.floor(Math.min(api.W * 0.94 / cols, (api.H - 120) / 14));
      rows = Math.max(9, Math.floor((api.H - 110) / cs));
      ox = Math.floor((api.W - cols * cs) / 2);
      oy = Math.floor((api.H - rows * cs) / 2) + 14;
      mines = Math.round(cols * rows * 0.13);
    }

    function reset() {
      layout();
      cells = Array.from({ length: rows }, () => Array.from({ length: cols }, () => ({ m: false, n: 0, o: false, f: false })));
      opened = 0; flagged = 0; started = false; dead = false; won = false; time = 0;
      pressT = 0; pressCell = null; first = null;
      api.score(0);
    }

    function plant(sx, sy) {
      let placed = 0, guard = 0;
      while (placed < mines && guard++ < 5000) {
        const x = M.rint(0, cols - 1), y = M.rint(0, rows - 1);
        if (cells[y][x].m) continue;
        if (Math.abs(x - sx) <= 1 && Math.abs(y - sy) <= 1) continue;
        cells[y][x].m = true; placed++;
      }
      for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
        let n = 0;
        each(x, y, (nx, ny) => { if (cells[ny][nx].m) n++; });
        cells[y][x].n = n;
      }
      started = true;
    }

    function each(x, y, fn) {
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        const nx = x + dx, ny = y + dy;
        if (nx >= 0 && ny >= 0 && nx < cols && ny < rows) fn(nx, ny);
      }
    }

    function cellAt(px, py) {
      const x = Math.floor((px - ox) / cs), y = Math.floor((py - oy) / cs);
      if (x < 0 || y < 0 || x >= cols || y >= rows) return null;
      return { x, y };
    }

    function reveal(x, y) {
      const c = cells[y][x];
      if (c.o || c.f) return;
      c.o = true; opened++;
      api.addScore(5);
      if (c.m) return boom(x, y);
      if (c.n === 0) {
        Sound.blip(520);
        each(x, y, (nx, ny) => reveal(nx, ny));
      } else Sound.blip(360 + c.n * 40);
      checkWin();
    }

    function chord(x, y) {
      const c = cells[y][x];
      if (!c.o || !c.n) return;
      let f = 0;
      each(x, y, (nx, ny) => { if (cells[ny][nx].f) f++; });
      if (f === c.n) each(x, y, (nx, ny) => { if (!cells[ny][nx].f) reveal(nx, ny); });
    }

    function flag(x, y) {
      const c = cells[y][x];
      if (c.o) return;
      c.f = !c.f; flagged += c.f ? 1 : -1;
      Sound.blip(c.f ? 700 : 300);
    }

    function boom(x, y) {
      dead = true; Sound.boom(); api.shake(16, 0.5);
      cells.forEach(row => row.forEach(c => { if (c.m) c.o = true; }));
      api.emit(ox + (x + 0.5) * cs, oy + (y + 0.5) * cs, { n: 40, color: '#ff4d6d', speedMax: 420, life: 1 });
      setTimeout(() => api.over(), 800);
    }

    function checkWin() {
      if (won || dead) return;
      if (opened >= cols * rows - mines) {
        won = true;
        const bonus = Math.max(0, Math.round(900 - time * 6));
        api.addScore(bonus);
        cells.forEach(row => row.forEach(c => { if (c.m) c.f = true; }));
        Sound.win();
        setTimeout(() => api.win(), 700);
      }
    }

    function update(dt) {
      if (dead || won) return;
      if (started) time += dt;
      const i = api.input;
      const p = i.pointer;

      if (p.down) {
        const c = cellAt(p.x, p.y);
        if (c && (!pressCell || pressCell.x !== c.x || pressCell.y !== c.y)) { pressCell = c; pressT = 0; }
        else if (c) pressT += dt;
      }
      const released = i.events.find(e => e.type === 'up');
      if (released && pressCell) {
        const { x, y } = pressCell;
        if (pressT > 0.4) { flag(x, y); }
        else {
          if (!started) plant(x, y);
          if (cells[y][x].o) chord(x, y); else reveal(x, y);
        }
      }
      if (!p.down) { pressCell = null; pressT = 0; }
      if (i.pressed.a && !started) { /* тап без координат — игнор */ }

      api.setHud(`💣 ${mines - flagged} · ⏱ ${Math.floor(time)}с · открыто ${opened}/${cols * rows - mines}`);
    }

    function draw(c) {
      const W = api.W, H = api.H;
      const g = c.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, '#1a1a30'); g.addColorStop(1, '#0b0b16');
      c.fillStyle = g; c.fillRect(0, 0, W, H);

      for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
        const cell = cells[y][x];
        const px = ox + x * cs, py = oy + y * cs;
        if (cell.o) {
          c.fillStyle = cell.m ? '#3a1020' : '#12121f';
          c.fillRect(px + 1, py + 1, cs - 2, cs - 2);
          if (cell.m) {
            c.font = `${Math.round(cs * 0.66)}px system-ui`; c.textAlign = 'center'; c.textBaseline = 'middle';
            c.fillText('💣', px + cs / 2, py + cs / 2 + 1);
          } else if (cell.n) {
            c.fillStyle = NUM[cell.n]; c.font = `900 ${Math.round(cs * 0.5)}px system-ui`;
            c.textAlign = 'center'; c.textBaseline = 'middle';
            c.fillText(cell.n, px + cs / 2, py + cs / 2 + 1);
          }
        } else {
          const gr = c.createLinearGradient(px, py, px, py + cs);
          gr.addColorStop(0, '#3a3a63'); gr.addColorStop(1, '#26264a');
          c.fillStyle = gr;
          M.roundRect(c, px + 1, py + 1, cs - 2, cs - 2, 4); c.fill();
          c.fillStyle = 'rgba(255,255,255,.14)'; c.fillRect(px + 2, py + 2, cs - 4, 2);
          if (cell.f) {
            c.font = `${Math.round(cs * 0.58)}px system-ui`; c.textAlign = 'center'; c.textBaseline = 'middle';
            c.fillText('🚩', px + cs / 2, py + cs / 2 + 1);
          }
          if (pressCell && pressCell.x === x && pressCell.y === y && pressT > 0.05) {
            c.strokeStyle = '#ffd43b'; c.lineWidth = 2;
            M.roundRect(c, px + 2, py + 2, cs - 4, cs - 4, 4); c.stroke();
          }
        }
      }
      c.textBaseline = 'alphabetic';
      if (!started) {
        c.fillStyle = 'rgba(255,255,255,.5)'; c.textAlign = 'center';
        c.font = `700 ${Math.round(W * 0.038)}px system-ui`;
        c.fillText('тап — открыть · держи — флажок', W / 2, oy + rows * cs + 26);
      }
    }

    return { reset, update, draw, resize: () => layout() };
  },
};
