 /* Четыре в ряд */
import { M, Sound } from '../engine.js';

const COLS = 7, ROWS = 6;

export default {
  winTitle: 'Матч выигран!',
  init(api) {
    let board, turn, cs, ox, oy, wins, losses, round, over, winLine, aiT, drop, score, hard;

    function layout() {
      cs = Math.floor(Math.min(api.W * 0.92 / COLS, (api.H - 130) / (ROWS + 1)));
      ox = Math.floor((api.W - COLS * cs) / 2);
      oy = Math.floor((api.H - ROWS * cs) / 2) + 22;
    }

    function reset() {
      layout();
      hard = api.Store.get('c4_hard', 1);
      board = Array.from({ length: ROWS }, () => Array(COLS).fill(0));
      turn = 1; wins = 0; losses = 0; round = 1; over = 0; winLine = null; aiT = 0;
      drop = null; score = 0;
      api.score(0);
    }

    function canPlay(b, c) { return b[0][c] === 0; }
    function playCol(b, c, who) {
      for (let r = ROWS - 1; r >= 0; r--) if (!b[r][c]) { b[r][c] = who; return r; }
      return -1;
    }
    function undoCol(b, c, r) { b[r][c] = 0; }

    function findWin(b, who) {
      const dirs = [[1, 0], [0, 1], [1, 1], [1, -1]];
      for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
        if (b[r][c] !== who) continue;
        for (const [dr, dc] of dirs) {
          const cells = [[r, c]];
          for (let k = 1; k < 4; k++) {
            const rr = r + dr * k, cc = c + dc * k;
            if (rr < 0 || cc < 0 || rr >= ROWS || cc >= COLS || b[rr][cc] !== who) break;
            cells.push([rr, cc]);
          }
          if (cells.length === 4) return cells;
        }
      }
      return null;
    }

        function evalBoard(b) {
      let v = 0;
      const scan = (cells) => {
        let me = 0, op = 0;
        for (const [r, c] of cells) { const w = b[r][c]; if (w === 2) me++; else if (w === 1) op++; }
        if (me && op) return 0;
        if (me === 4) return 10000; if (me === 3) return 60; if (me === 2) return 8;
        if (op === 4) return -9000; if (op === 3) return -70; if (op === 2) return -8;
        return 0;
      };
      for (let r = 0; r < ROWS; r++) for (let c = 0; c <= COLS - 4; c++)
        v += scan([[r, c], [r, c + 1], [r, c + 2], [r, c + 3]]);
      for (let c = 0; c < COLS; c++) for (let r = 0; r <= ROWS - 4; r++)
        v += scan([[r, c], [r + 1, c], [r + 2, c], [r + 3, c]]);
      for (let r = 0; r <= ROWS - 4; r++) for (let c = 0; c <= COLS - 4; c++)
        v += scan([[r, c], [r + 1, c + 1], [r + 2, c + 2], [r + 3, c + 3]]);
      for (let r = 3; r < ROWS; r++) for (let c = 0; c <= COLS - 4; c++)
        v += scan([[r, c], [r - 1, c + 1], [r - 2, c + 2], [r - 3, c + 3]]);
      for (let c = 2; c < COLS - 2; c++) if (b[3][c] === 2) v += 6; else if (b[3][c] === 1) v -= 6;
      return v;
    }

    function minimax(b, depth, alpha, beta, maximizing) {
      const w2 = findWin(b, 2), w1 = findWin(b, 1);
      if (w2) return 100000 + depth;
      if (w1) return -100000 - depth;
      if (depth === 0 || b[0].every(v => v)) return evalBoard(b);
      const order = [3, 2, 4, 1, 5, 0, 6].filter(c => canPlay(b, c));
      if (maximizing) {
        let best = -Infinity;
        for (const c of order) {
          const r = playCol(b, c, 2);
          best = Math.max(best, minimax(b, depth - 1, alpha, beta, false));
          undoCol(b, c, r);
          alpha = Math.max(alpha, best);
          if (alpha >= beta) break;
        }
        return best;
      }
      let best = Infinity;
      for (const c of order) {
        const r = playCol(b, c, 1);
        best = Math.min(best, minimax(b, depth - 1, alpha, beta, true));
        undoCol(b, c, r);
        beta = Math.min(beta, best);
        if (alpha >= beta) break;
      }
      return best;
    }

    function aiMove() {
      const cols = [3, 2, 4, 1, 5, 0, 6].filter(c => canPlay(board, c));
      if (!cols.length) return;
      let pick;
      if (!hard && M.chance(0.3)) pick = M.pick(cols);
      else {
        const depth = hard ? 5 : 3;
        let best = -Infinity; const eq = [];
        for (const c of cols) {
          const r = playCol(board, c, 2);
          const v = minimax(board, depth - 1, -Infinity, Infinity, false) + M.rand(0, 2);
          undoCol(board, c, r);
          if (v > best + 0.5) { best = v; eq.length = 0; eq.push(c); }
          else if (Math.abs(v - best) <= 0.5) eq.push(c);
        }
        pick = eq.length ? eq[0] : cols[0];
      }
      doMove(pick, 2);
    }

    function doMove(c, who) {
      if (over) return false;
      const r = playCol(board, c, who);
      if (r < 0) { Sound.blip(140); return false; }
      drop = { c, r, y: -cs, t: 0 };
      Sound.blip(who === 1 ? 520 : 340);
      const w = findWin(board, who);
      if (w) {
        over = who; winLine = w;
        if (who === 1) {
          wins++; score += 200; Sound.win();
          w.forEach(([rr, cc]) => api.emit(ox + (cc + 0.5) * cs, oy + (rr + 0.5) * cs, { n: 12, color: '#ff4d6d', speedMax: 260, life: 0.8 }));
        } else { losses++; Sound.bad(); api.shake(10, 0.35); }
        api.score(score);
        setTimeout(nextRound, 1400);
      } else if (board[0].every(v => v)) {
        over = -1; score += 50; api.score(score); Sound.coin();
        setTimeout(nextRound, 1200);
      } else turn = 3 - who;
      if (turn === 2 && !over) aiT = 0.45;
      return true;
    }

    function nextRound() {
      if (wins >= 3) { api.win(score); return; }
      if (losses >= 3) { api.over(score); return; }
      round++;
      board = Array.from({ length: ROWS }, () => Array(COLS).fill(0));
      over = 0; winLine = null; drop = null; turn = round % 2 ? 1 : 2;
      if (turn === 2) aiT = 0.5;
    }

    function update(dt) {
      if (drop) { drop.t += dt; drop.y = M.lerp(drop.y, oy + drop.r * cs, Math.min(1, dt * 14)); }
      const i = api.input;
      if (turn === 1 && !over) {
        for (const e of i.events) if (e.type === 'tap' || e.type === 'down') {
          const c = Math.floor((e.x - ox) / cs);
          if (c >= 0 && c < COLS) doMove(c, 1);
        }
        if (i.pressed.left) { this._cur = M.clamp((this._cur ?? 3) - 1, 0, COLS - 1); Sound.click(); }
        if (i.pressed.right) { this._cur = M.clamp((this._cur ?? 3) + 1, 0, COLS - 1); Sound.click(); }
        if (i.pressed.a || i.pressed.down) doMove(this._cur ?? 3, 1);
      }
      if (turn === 2 && !over) { aiT -= dt; if (aiT <= 0) { aiT = 99; aiMove(); } }
      const p = i.pointer;
      if (p.down) { this._pt = (this._pt || 0) + dt; if (this._pt > 0.6) { this._pt = -99; hard = hard ? 0 : 1; api.Store.set('c4_hard', hard); Sound.click(); } }
      else this._pt = 0;
      api.setHud(`${hard ? 'сильный ИИ' : 'лёгкий ИИ'} · раунд ${round} · <b style="color:#ff4d6d">${wins}</b>:<b style="color:#ffd43b">${losses}</b> (до 3)`);
    }

    function draw(c) {
      const W = api.W, H = api.H;
      c.fillStyle = '#0d1030'; c.fillRect(0, 0, W, H);
      c.fillStyle = '#1a3a8a';
      M.roundRect(c, ox - 8, oy - 8, COLS * cs + 16, ROWS * cs + 16, 14); c.fill();
      for (let r = 0; r < ROWS; r++) for (let col = 0; col < COLS; col++) {
        const x = ox + col * cs, y = oy + r * cs;
        c.fillStyle = '#0a0d22';
        c.beginPath(); c.arc(x + cs / 2, y + cs / 2, cs * 0.42, 0, 7); c.fill();
        const v = board[r][col];
        if (v) {
          const isDrop = drop && drop.c === col && drop.r === r;
          const yy = isDrop ? drop.y + cs / 2 : y + cs / 2;
          const g = c.createRadialGradient(x + cs * 0.35, yy - cs * 0.15, cs * 0.05, x + cs / 2, yy, cs * 0.42);
          if (v === 1) { g.addColorStop(0, '#ff8fa3'); g.addColorStop(1, '#d61f45'); }
          else { g.addColorStop(0, '#ffe9a8'); g.addColorStop(1, '#e0a100'); }
          c.fillStyle = g;
          c.beginPath(); c.arc(x + cs / 2, yy, cs * 0.4, 0, 7); c.fill();
          c.strokeStyle = 'rgba(0,0,0,.25)'; c.lineWidth = 2; c.stroke();
        }
      }
      if (winLine) {
        c.strokeStyle = '#8ee06b'; c.lineWidth = 5; c.globalAlpha = 0.9;
        const [r1, c1] = winLine[0], [r2, c2] = winLine[3];
        c.beginPath();
        c.moveTo(ox + (c1 + 0.5) * cs, oy + (r1 + 0.5) * cs);
        c.lineTo(ox + (c2 + 0.5) * cs, oy + (r2 + 0.5) * cs);
        c.stroke(); c.globalAlpha = 1;
      }
      // указатель колонки
      if (turn === 1 && !over) {
        const cur = this._cur ?? Math.floor((api.input.pointer.x - ox) / cs);
        if (cur >= 0 && cur < COLS) {
          c.fillStyle = 'rgba(255,77,109,.8)';
          const x = ox + cur * cs + cs / 2, y = oy - 20;
          c.beginPath(); c.moveTo(x - 9, y - 10); c.lineTo(x + 9, y - 10); c.lineTo(x, y + 4); c.closePath(); c.fill();
        }
      }
      c.textAlign = 'center'; c.font = `900 ${Math.round(W * 0.05)}px system-ui`;
      c.fillStyle = over === 1 ? '#8ee06b' : over === 2 ? '#ff4d6d' : over === -1 ? '#b06bff' : 'rgba(255,255,255,.35)';
      c.fillText(over === 1 ? 'ТЫ ВЫИГРАЛ!' : over === 2 ? 'ИИ ВЫИГРАЛ' : over === -1 ? 'НИЧЬЯ' :
        (turn === 1 ? 'твой ход — тап по колонке' : 'ИИ думает…'), W / 2, oy + ROWS * cs + 34);
    }

    return { reset, update, draw, resize: () => layout() };
  },
};
