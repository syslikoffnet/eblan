 /* Судоку: генератор с единственной решением */
import { M, Sound } from '../engine.js';

const DIFF = [
  { name: 'лёгкое', clues: 42 },
  { name: 'среднее', clues: 34 },
  { name: 'сложное', clues: 28 },
];

export default {
  winTitle: 'Судоку решено!',
  init(api) {
    let cs, ox, oy, puz, sol, cur, given, notes, sel, mistakes, time, diff, hints, over, noteMode, padY, padCS;

    function shuffle(a) { return M.shuffle(a); }
    function valid(b, i, v) {
      const r = (i / 9) | 0, c = i % 9;
      const br = ((r / 3) | 0) * 3, bc = ((c / 3) | 0) * 3;
      for (let k = 0; k < 9; k++) if (b[r * 9 + k] === v || b[k * 9 + c] === v) return false;
      for (let dr = 0; dr < 3; dr++) for (let dc = 0; dc < 3; dc++) if (b[(br + dr) * 9 + bc + dc] === v) return false;
      return true;
    }
    function fill(b) {
      const i = b.indexOf(0);
      if (i < 0) return true;
      for (const v of shuffle([1, 2, 3, 4, 5, 6, 7, 8, 9])) {
        if (valid(b, i, v)) { b[i] = v; if (fill(b)) return true; b[i] = 0; }
      }
      return false;
    }
    function countSolutions(b, limit) {
      const i = b.indexOf(0);
      if (i < 0) return 1;
      let n = 0;
      for (let v = 1; v <= 9; v++) {
        if (!valid(b, i, v)) continue;
        b[i] = v; n += countSolutions(b, limit - n); b[i] = 0;
        if (n >= limit) return n;
      }
      return n;
    }
    function generate(clues) {
      const full = Array(81).fill(0);
      fill(full);
      const b = full.slice();
      const order = shuffle([...Array(81).keys()]);
      let have = 81;
      for (const i of order) {
        if (have <= clues) break;
        const save = b[i];
        b[i] = 0;
        if (countSolutions(b.slice(), 2) !== 1) b[i] = save;
        else have--;
      }
      return { puz: b, sol: full };
    }

    function layout() {
      cs = Math.floor(Math.min(api.W * 0.94 / 9, (api.H - 150) / 9));
      ox = Math.floor((api.W - cs * 9) / 2);
      oy = Math.floor((api.H - cs * 9 - 96) / 2) + 14;
      padCS = Math.min(cs * 0.86, api.W / 10.5);
      padY = oy + cs * 9 + 22;
    }

    function newPuzzle() {
      const g = generate(DIFF[diff].clues);
      puz = g.puz; sol = g.sol;
      cur = puz.slice();
      given = puz.map(v => !!v);
      notes = Array.from({ length: 81 }, () => new Set());
      sel = -1; mistakes = 0; time = 0; hints = 3; over = false; noteMode = false;
      api.score(0);
    }

    function reset() {
      layout();
      diff = M.clamp(api.Store.get('sudoku_diff', 1), 0, 2);
      newPuzzle();
    }

    function place(v) {
      if (over || sel < 0 || given[sel]) return;
      if (noteMode) {
        if (v) notes[sel].has(v) ? notes[sel].delete(v) : notes[sel].add(v);
        Sound.blip(600);
        return;
      }
      if (v === 0) { cur[sel] = 0; Sound.blip(300); return; }
      cur[sel] = v;
      notes[sel].clear();
      if (v === sol[sel]) {
        Sound.coin();
        const r = (sel / 9) | 0, c = sel % 9;
        // убрать заметки того же числа в линиях
        for (let k = 0; k < 9; k++) { notes[r * 9 + k].delete(v); notes[k * 9 + c].delete(v); }
        api.addScore(20);
        checkDone();
      } else {
        mistakes++; Sound.bad(); api.shake(8, 0.25);
        const px = ox + (c + 0.5) * cs, py = oy + (r + 0.5) * cs;
        api.emit(px, py, { n: 12, color: '#ff4d6d', speedMax: 200, life: 0.5 });
        if (mistakes >= 3) { over = true; setTimeout(() => api.over(Math.max(0, 500 - Math.floor(time) * 2)), 700); }
      }
    }

    function checkDone() {
      if (cur.every((v, i) => v === sol[i])) {
        over = true;
        const s = Math.max(100, 3000 - Math.floor(time) * 8 - mistakes * 150 + (2 - diff) * 0 + diff * 500);
        api.score(s); Sound.win();
        api.emit(api.W / 2, api.H / 2, { n: 50, color: '#5b8def', speedMax: 420, life: 1.2 });
        setTimeout(() => api.win(s), 900);
      }
    }

    function tapAt(x, y) {
      if (over) return;
      const c = Math.floor((x - ox) / cs), r = Math.floor((y - oy) / cs);
      if (c >= 0 && c < 9 && r >= 0 && r < 9) { sel = r * 9 + c; Sound.click(); return; }
      // пад
      const n = 11;
      const totalW = padCS * n;
      const startX = (api.W - totalW) / 2;
      const i = Math.floor((x - startX) / padCS);
      if (y > padY - 6 && y < padY + padCS + 6 && i >= 0 && i < n) {
        if (i === 0) place(0);
        else if (i === 9) { noteMode = !noteMode; Sound.click(); }
        else if (i === 10) {
          if (hints > 0 && sel >= 0 && cur[sel] !== sol[sel]) { hints--; place(sol[sel]); api.addScore(-60); Sound.power(); }
          else Sound.blip(160);
        } else place(i);
      }
    }

    function update(dt) {
      if (!over) time += dt;
      const i = api.input;
      for (const e of i.events) if (e.type === 'tap') tapAt(e.x, e.y);
      if (i.pressed.a) {
        // клавиатура: 1..9 через события не приходят, используем стрелки для навигации
      }
      if (i.pressed.left && sel >= 0) sel = sel % 9 === 0 ? sel : sel - 1;
      if (i.pressed.right && sel >= 0) sel = sel % 9 === 8 ? sel : sel + 1;
      if (i.pressed.up && sel >= 9) sel -= 9;
      if (i.pressed.down && sel >= 0 && sel < 72) sel += 9;
      const p = i.pointer;
      if (p.down) { this._pt = (this._pt || 0) + dt; if (this._pt > 0.7) { this._pt = -99; diff = (diff + 1) % 3; api.Store.set('sudoku_diff', diff); newPuzzle(); Sound.click(); } }
      else this._pt = 0;
      const left = cur.filter((v, k) => v !== sol[k]).length;
      api.setHud(`${DIFF[diff].name} · осталось <b style="color:#5b8def">${left}</b> · ошибок ${mistakes}/3 · ⏱ ${Math.floor(time)}с · 💡${hints}${noteMode ? ' · <b style="color:#ffd43b">заметки</b>' : ''}`);
    }

    function draw(c) {
      const W = api.W, H = api.H;
      c.fillStyle = '#0a0f1e'; c.fillRect(0, 0, W, H);
      // подложка
      c.fillStyle = '#131a30';
      M.roundRect(c, ox - 4, oy - 4, cs * 9 + 8, cs * 9 + 8, 10); c.fill();

      const selV = sel >= 0 ? cur[sel] : 0;
      for (let r = 0; r < 9; r++) for (let cc = 0; cc < 9; cc++) {
        const i = r * 9 + cc;
        const px = ox + cc * cs, py = oy + r * cs;
        const sameVal = selV && cur[i] === selV;
        const inLine = sel >= 0 && ((sel / 9 | 0) === r || sel % 9 === cc ||
          ((sel / 9 | 0) / 3 | 0) === (r / 3 | 0) && (sel % 9 / 3 | 0) === (cc / 3 | 0));
        c.fillStyle = i === sel ? 'rgba(91,141,239,.45)' : sameVal ? 'rgba(91,141,239,.2)'
          : inLine ? 'rgba(255,255,255,.045)' : ((r / 3 | 0) + (cc / 3 | 0)) % 2 ? 'rgba(255,255,255,.02)' : 'transparent';
        if (c.fillStyle !== 'transparent') c.fillRect(px, py, cs, cs);
        const v = cur[i];
        if (v) {
          const wrong = v !== sol[i];
          c.fillStyle = given[i] ? '#eaeaff' : wrong ? '#ff6b8a' : '#7ad7ff';
          c.font = `${given[i] ? 800 : 600} ${Math.round(cs * 0.58)}px system-ui`;
          c.textAlign = 'center'; c.textBaseline = 'middle';
          c.fillText(v, px + cs / 2, py + cs / 2 + 1);
        } else if (notes[i].size) {
          c.fillStyle = 'rgba(200,210,255,.5)';
          c.font = `600 ${Math.round(cs * 0.22)}px system-ui`;
          c.textAlign = 'center'; c.textBaseline = 'middle';
          [...notes[i]].forEach(nv => {
            const k = nv - 1;
            c.fillText(nv, px + cs * (0.22 + (k % 3) * 0.28), py + cs * (0.24 + ((k / 3) | 0) * 0.28));
          });
        }
      }
      c.textBaseline = 'alphabetic';
      c.strokeStyle = 'rgba(255,255,255,.14)'; c.lineWidth = 1;
      for (let k = 0; k <= 9; k++) {
        c.beginPath(); c.moveTo(ox + k * cs, oy); c.lineTo(ox + k * cs, oy + cs * 9); c.stroke();
        c.beginPath(); c.moveTo(ox, oy + k * cs); c.lineTo(ox + cs * 9, oy + k * cs); c.stroke();
      }
      c.strokeStyle = '#5b8def'; c.lineWidth = 3;
      for (let k = 0; k <= 3; k++) {
        c.beginPath(); c.moveTo(ox + k * cs * 3, oy); c.lineTo(ox + k * cs * 3, oy + cs * 9); c.stroke();
        c.beginPath(); c.moveTo(ox, oy + k * cs * 3); c.lineTo(ox + cs * 9, oy + k * cs * 3); c.stroke();
      }

      // пад
      const n = 11, totalW = padCS * n, startX = (W - totalW) / 2;
      for (let k = 0; k < n; k++) {
        const px = startX + k * padCS, py = padY;
        const label = k === 0 ? '⌫' : k === 9 ? '✎' : k === 10 ? `💡${hints}` : String(k);
        const on = (k === 9 && noteMode) || (k === 10 && hints <= 0);
        c.fillStyle = k >= 1 && k <= 8 ? '#1b2545' : on ? '#3a3a12' : '#241b3a';
        M.roundRect(c, px + 2, py, padCS - 4, padCS, 8); c.fill();
        c.strokeStyle = 'rgba(255,255,255,.12)'; c.lineWidth = 1.5; c.stroke();
        c.fillStyle = k >= 1 && k <= 8 ? '#cfe0ff' : '#ffd43b';
        c.font = `${k >= 1 && k <= 8 ? 800 : 600} ${Math.round(padCS * (k >= 1 && k <= 8 ? 0.5 : 0.34))}px system-ui`;
        c.textAlign = 'center'; c.textBaseline = 'middle';
        c.fillText(label, px + padCS / 2, py + padCS / 2 + 1);
      }
      c.textBaseline = 'alphabetic';
      if (time < 6) {
        c.fillStyle = 'rgba(255,255,255,.45)'; c.textAlign = 'center';
        c.font = `600 ${Math.round(W * 0.033)}px system-ui`;
        c.fillText('долгое нажатие — другая сложность', W / 2, padY + padCS + 24);
      }
    }

    return { reset, update, draw, resize: () => layout() };
  },
};
