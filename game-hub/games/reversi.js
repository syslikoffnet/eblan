 /* Реверси / Othello */
import { M, Sound } from '../engine.js';

const N = 8;
const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
const WMAP = [
  [120, -20, 20, 5, 5, 20, -20, 120],
  [-20, -40, -5, -5, -5, -5, -40, -20],
  [20, -5, 15, 3, 3, 15, -5, 20],
  [5, -5, 3, 3, 3, 3, -5, 5],
  [5, -5, 3, 3, 3, 3, -5, 5],
  [20, -5, 15, 3, 3, 15, -5, 20],
  [-20, -40, -5, -5, -5, -5, -40, -20],
  [120, -20, 20, 5, 5, 20, -20, 120],
];

export default {
  winTitle: 'Ты выиграл партию!',
  init(api) {
    let board, turn, cs, ox, oy, moves, passT, over, last, hint, anim, me, op, score;

    function layout() {
      cs = Math.floor(Math.min(api.W * 0.92 / N, (api.H - 140) / N));
      ox = Math.floor((api.W - N * cs) / 2);
      oy = Math.floor((api.H - N * cs) / 2) + 14;
    }

    function reset() {
      layout();
      board = Array.from({ length: N }, () => Array(N).fill(0));
      board[3][3] = board[4][4] = 1; board[3][4] = board[4][3] = 2;
      turn = 1; moves = 0; passT = 0; over = 0; last = null; hint = []; anim = [];
      me = 2; op = 2; score = 0;
      hint = legal(1);
      api.score(0);
    }

    function inside(x, y) { return x >= 0 && y >= 0 && x < N && y < N; }

    function flips(b, x, y, who) {
      if (b[y][x]) return [];
      const out = [];
      for (const [dx, dy] of DIRS) {
        const line = [];
        let nx = x + dx, ny = y + dy;
        while (inside(nx, ny) && b[ny][nx] === 3 - who) { line.push([nx, ny]); nx += dx; ny += dy; }
        if (line.length && inside(nx, ny) && b[ny][nx] === who) out.push(...line);
      }
      return out;
    }

    function legal(who, b = board) {
      const res = [];
      for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
        const f = flips(b, x, y, who);
        if (f.length) res.push({ x, y, f });
      }
      return res;
    }

    function applyMove(b, m, who) {
      b[m.y][m.x] = who;
      m.f.forEach(([x, y]) => { b[y][x] = who; anim.push({ x, y, t: 0.35 }); });
      return m.f.length + 1;
    }

    function count(b) {
      let a = 0, c = 0;
      for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) { if (b[y][x] === 1) a++; else if (b[y][x] === 2) c++; }
      return { a, c };
    }

    function evaluate(b) {
      let v = 0;
      for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) if (b[y][x]) v += WMAP[y][x] * (b[y][x] === 2 ? 1 : -1);
      const my = legal(2, b).length, his = legal(1, b).length;
      v += (my - his) * 8;
      const cnt = count(b);
      if (cnt.a + cnt.c > 54) v += (cnt.c - cnt.a) * 40;
      return v;
    }

    function minimax(b, depth, alpha, beta, who) {
      const ms = legal(who, b);
      if (depth === 0) return evaluate(b);
      if (!ms.length) {
        const opp = legal(3 - who, b);
        if (!opp.length) {
          const cnt = count(b);
          return cnt.c > cnt.a ? 99999 : cnt.a > cnt.c ? -99999 : 0;
        }
        return minimax(b, depth - 1, alpha, beta, 3 - who);
      }
      if (who === 2) {
        let best = -Infinity;
        for (const m of ms) {
          const cp = b.map(r => r.slice());
          cp[m.y][m.x] = 2; m.f.forEach(([x, y]) => cp[y][x] = 2);
          best = Math.max(best, minimax(cp, depth - 1, alpha, beta, 1));
          alpha = Math.max(alpha, best);
          if (alpha >= beta) break;
        }
        return best;
      }
      let best = Infinity;
      for (const m of ms) {
        const cp = b.map(r => r.slice());
        cp[m.y][m.x] = 1; m.f.forEach(([x, y]) => cp[y][x] = 1);
        best = Math.min(best, minimax(cp, depth - 1, alpha, beta, 2));
        beta = Math.min(beta, best);
        if (alpha >= beta) break;
      }
      return best;
    }

    function aiTurn() {
      const ms = legal(2);
      if (!ms.length) { passT = 1.2; turn = 1; hint = legal(1); Sound.blip(200); return; }
      const filled = count(board).a + count(board).c;
      const depth = filled > 52 ? 6 : filled > 44 ? 5 : 3;
      let best = -Infinity, pick = ms[0];
      for (const m of ms) {
        const cp = board.map(r => r.slice());
        cp[m.y][m.x] = 2; m.f.forEach(([x, y]) => cp[y][x] = 2);
        const v = minimax(cp, depth - 1, -Infinity, Infinity, 1) + M.rand(0, 3);
        if (v > best) { best = v; pick = m; }
      }
      applyMove(board, pick, 2);
      last = pick; moves++; Sound.blip(320);
      afterMove();
    }

    function afterMove() {
      hint = [];
      const opp = turn === 1 ? 2 : 1;
      if (legal(opp).length) { turn = opp; if (turn === 1) hint = legal(1); }
      else if (legal(turn).length) { passT = 1.2; Sound.blip(180); if (turn === 1) hint = legal(1); }
      else finish();
      const cnt = count(board); me = cnt.a; op = cnt.c;
      score = (op - me) * 5 + moves * 2;
      api.score(Math.max(0, score));
    }

    function finish() {
      const cnt = count(board); me = cnt.a; op = cnt.c;
      over = op > me ? 1 : op < me ? 2 : -1;
      score = Math.abs(op - me) * 20 + moves * 3;
      api.score(over === 1 ? score : Math.max(0, Math.round(score * 0.3)));
      if (over === 1) { Sound.win(); api.emit(api.W / 2, api.H / 2, { n: 40, color: '#2f9e44', speedMax: 380, life: 1 }); }
      else Sound.bad();
      setTimeout(() => over === 1 ? api.win() : api.over(), 1100);
    }

    function tapAt(x, y) {
      if (over || turn !== 1) return;
      const cx = Math.floor((x - ox) / cs), cy = Math.floor((y - oy) / cs);
      const m = hint.find(h => h.x === cx && h.y === cy);
      if (!m) { Sound.blip(140); return; }
      applyMove(board, m, 1);
      last = m; moves++; Sound.coin();
      api.emit(ox + (cx + 0.5) * cs, oy + (cy + 0.5) * cs, { n: 10, color: '#8ee06b', speedMax: 180, life: 0.5 });
      afterMove();
    }

    function update(dt) {
      passT = Math.max(0, passT - dt);
      anim.forEach(a => a.t -= dt);
      anim = anim.filter(a => a.t > 0);
      if (!over && turn === 2) aiTurn();
      const i = api.input;
      for (const e of i.events) if (e.type === 'tap') tapAt(e.x, e.y);
      if (i.pressed.b) { hint = legal(1); Sound.click(); }
      const cnt = count(board); me = cnt.a; op = cnt.c;
      api.setHud(`ты <b style="color:#8ee06b">${me}</b> : <b style="color:#ff8fa3">${op}</b> ИИ · ходов ${moves}${passT > 0 ? ' · <b style="color:#ffd43b">пас!</b>' : ''}${turn === 2 ? ' · думает…' : ''}`);
    }

    function draw(c) {
      const W = api.W, H = api.H;
      c.fillStyle = '#08130c'; c.fillRect(0, 0, W, H);
      c.fillStyle = '#2f9e44';
      M.roundRect(c, ox - 6, oy - 6, N * cs + 12, N * cs + 12, 12); c.fill();
      c.strokeStyle = 'rgba(0,0,0,.35)'; c.lineWidth = 1.5;
      for (let k = 0; k <= N; k++) {
        c.beginPath(); c.moveTo(ox + k * cs, oy); c.lineTo(ox + k * cs, oy + N * cs); c.stroke();
        c.beginPath(); c.moveTo(ox, oy + k * cs); c.lineTo(ox + N * cs, oy + k * cs); c.stroke();
      }
      [[2, 2], [6, 2], [2, 6], [6, 6]].forEach(([x, y]) => {
        c.fillStyle = 'rgba(0,0,0,.35)';
        c.beginPath(); c.arc(ox + x * cs, oy + y * cs, 3, 0, 7); c.fill();
      });
      for (const h of hint) {
        c.fillStyle = 'rgba(255,255,255,.18)';
        c.beginPath(); c.arc(ox + (h.x + 0.5) * cs, oy + (h.y + 0.5) * cs, cs * 0.16, 0, 7); c.fill();
      }
      for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
        const v = board[y][x]; if (!v) continue;
        const px = ox + (x + 0.5) * cs, py = oy + (y + 0.5) * cs;
        const a = anim.find(z => z.x === x && z.y === y);
        const k = a ? Math.abs(Math.cos((1 - a.t / 0.35) * Math.PI)) : 1;
        const r = cs * 0.4 * (a ? 1 : 1);
        c.save(); c.translate(px, py); c.scale(k || 0.08, 1);
        const g = c.createRadialGradient(-r * 0.3, -r * 0.3, r * 0.1, 0, 0, r);
        if (v === 1) { g.addColorStop(0, '#d6ffe0'); g.addColorStop(1, '#3fae5a'); }
        else { g.addColorStop(0, '#ff9eb1'); g.addColorStop(1, '#b3123a'); }
        c.fillStyle = g;
        c.beginPath(); c.arc(0, 0, r, 0, 7); c.fill();
        c.strokeStyle = 'rgba(0,0,0,.35)'; c.lineWidth = 2; c.stroke();
        c.restore();
        if (last && last.x === x && last.y === y) {
          c.strokeStyle = '#ffd43b'; c.lineWidth = 2.5;
          c.beginPath(); c.arc(px, py, cs * 0.45, 0, 7); c.stroke();
        }
      }
      c.textAlign = 'center'; c.font = `900 ${Math.round(W * 0.045)}px system-ui`;
      c.fillStyle = over ? (over === 1 ? '#8ee06b' : '#ff4d6d') : 'rgba(255,255,255,.4)';
      c.fillText(over ? (over === 1 ? 'ПОБЕДА!' : over === 2 ? 'ИИ ВЫИГРАЛ' : 'НИЧЬЯ') :
        (turn === 1 ? 'твой ход — зелёные' : 'ход ИИ…'), W / 2, oy + N * cs + 32);
    }

    return { reset, update, draw, resize: () => layout() };
  },
};
