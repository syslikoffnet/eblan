 /* Крестики-нолики с минимаксом */
import { M, Sound } from '../engine.js';

const MODES = ['лёгкий', 'средний', 'непобедимый', '2 игрока'];

export default {
  winTitle: 'Матч выигран!',
  init(api) {
    let board, turn, mode, wins, losses, draws, cellSize, ox, oy, over, line, animT, aiT, mark, score, round;

    function layout() {
      cellSize = Math.floor(Math.min(api.W * 0.78, api.H * 0.5) / 3);
      ox = Math.floor((api.W - cellSize * 3) / 2);
      oy = Math.floor((api.H - cellSize * 3) / 2) + 10;
    }

    function reset() {
      layout();
      board = Array(9).fill(0);
      turn = 1; mode = api.Store.get('ttt_mode', 2); wins = 0; losses = 0; draws = 0;
      over = 0; line = null; animT = 0; aiT = 0; mark = 0; score = 0; round = 1;
      api.score(0);
    }

    function winner(b) {
      const L = [[0, 1, 2], [3, 4, 5], [6, 7, 8], [0, 3, 6], [1, 4, 7], [2, 5, 8], [0, 4, 8], [2, 4, 6]];
      for (const [x, y, z] of L) if (b[x] && b[x] === b[y] && b[y] === b[z]) return { w: b[x], line: [x, y, z] };
      return b.every(v => v) ? { w: -1 } : null;
    }

    function minimax(b, player, depth, alpha, beta) {
      const r = winner(b);
      if (r) return r.w === 2 ? 10 - depth : r.w === 1 ? depth - 10 : 0;
      let best = player === 2 ? -Infinity : Infinity;
      for (let i = 0; i < 9; i++) {
        if (b[i]) continue;
        b[i] = player;
        const v = minimax(b, 3 - player, depth + 1, alpha, beta);
        b[i] = 0;
        if (player === 2) { best = Math.max(best, v); alpha = Math.max(alpha, v); }
        else { best = Math.min(best, v); beta = Math.min(beta, v); }
        if (beta <= alpha) break;
      }
      return best;
    }

    function aiMove() {
      const empty = board.map((v, i) => v ? -1 : i).filter(i => i >= 0);
      if (!empty.length) return;
      let pick;
      if (mode === 0 && M.chance(0.55)) pick = M.pick(empty);
      else if (mode === 1 && M.chance(0.2)) pick = M.pick(empty);
      else {
        let bestV = -Infinity; const best = [];
        for (const i of empty) {
          board[i] = 2;
          const v = minimax(board, 1, 1, -Infinity, Infinity);
          board[i] = 0;
          if (v > bestV) { bestV = v; best.length = 0; best.push(i); }
          else if (v === bestV) best.push(i);
        }
        pick = M.pick(best);
      }
      put(pick, 2);
    }

    function put(i, who) {
      if (board[i] || over) return false;
      board[i] = who; mark++; animT = 0.22;
      Sound.blip(who === 1 ? 620 : 380);
      const r = winner(board);
      if (r) {
        over = r.w; line = r.line || null;
        if (r.w === 1) { wins++; score += 100; Sound.win(); api.emit(api.W / 2, api.H / 2, { n: 30, color: '#7ad7ff', speedMax: 320, life: 0.9 }); }
        else if (r.w === 2) { losses++; Sound.bad(); api.shake(9, 0.3); }
        else { draws++; score += 30; Sound.coin(); }
        api.score(score);
        setTimeout(nextRound, 1200);
      } else turn = 3 - who;
      return true;
    }

    function nextRound() {
      if (wins >= 3) { api.win(score); return; }
      if (losses >= 3) { api.over(score); return; }
      round++;
      board = Array(9).fill(0); over = 0; line = null; turn = round % 2 ? 1 : 2; aiT = 0.3;
    }

    function tapAt(x, y) {
      const cx = Math.floor((x - ox) / cellSize), cy = Math.floor((y - oy) / cellSize);
      if (cx < 0 || cy < 0 || cx > 2 || cy > 2) return;
      const i = cy * 3 + cx;
      if (over || board[i]) { Sound.blip(140); return; }
      if (mode === 3) { put(i, turn); return; }
      if (turn !== 1) return;
      if (put(i, 1) && !over) { aiT = 0.32; }
    }

    function update(dt) {
      animT = Math.max(0, animT - dt);
      if (mode !== 3 && turn === 2 && !over) {
        aiT -= dt;
        if (aiT <= 0) { aiMove(); aiT = 99; }
      }
      const i = api.input;
      for (const e of i.events) if (e.type === 'tap') tapAt(e.x, e.y);
      // долгое нажатие — смена режима
      const p = i.pointer;
      if (p.down) { this._pt = (this._pt || 0) + dt; if (this._pt > 0.55) { this._pt = -99; mode = (mode + 1) % 4; api.Store.set('ttt_mode', mode); Sound.click(); reset(); } }
      else this._pt = 0;
      api.setHud(`${MODES[mode]} · раунд ${round} · <b style="color:#7ad7ff">${wins}</b>:<b style="color:#ff4d6d">${losses}</b> (до 3) · долгое нажатие — режим`);
    }

    function draw(c) {
      const W = api.W, H = api.H;
      const g = c.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, '#161633'); g.addColorStop(1, '#0a0a16');
      c.fillStyle = g; c.fillRect(0, 0, W, H);
      c.strokeStyle = 'rgba(255,255,255,.22)'; c.lineWidth = 3; c.lineCap = 'round';
      for (let k = 1; k < 3; k++) {
        c.beginPath(); c.moveTo(ox + k * cellSize, oy + 6); c.lineTo(ox + k * cellSize, oy + cellSize * 3 - 6); c.stroke();
        c.beginPath(); c.moveTo(ox + 6, oy + k * cellSize); c.lineTo(ox + cellSize * 3 - 6, oy + k * cellSize); c.stroke();
      }
      const s = cellSize * 0.3 * (animT > 0 ? 1.15 : 1);
      board.forEach((v, i) => {
        if (!v) return;
        const x = ox + (i % 3 + 0.5) * cellSize, y = oy + (Math.floor(i / 3) + 0.5) * cellSize;
        if (v === 1) {
          c.strokeStyle = '#7ad7ff'; c.lineWidth = 6; c.shadowColor = '#7ad7ff'; c.shadowBlur = 12;
          c.beginPath(); c.moveTo(x - s, y - s); c.lineTo(x + s, y + s);
          c.moveTo(x + s, y - s); c.lineTo(x - s, y + s); c.stroke();
        } else {
          c.strokeStyle = '#ff8fa3'; c.lineWidth = 6; c.shadowColor = '#ff4d6d'; c.shadowBlur = 12;
          c.beginPath(); c.arc(x, y, s * 1.15, 0, 7); c.stroke();
        }
        c.shadowBlur = 0;
      });
      c.lineCap = 'butt';
      if (line) {
        const a = line[0], b = line[2];
        const ax = ox + (a % 3 + 0.5) * cellSize, ay = oy + (Math.floor(a / 3) + 0.5) * cellSize;
        const bx = ox + (b % 3 + 0.5) * cellSize, by = oy + (Math.floor(b / 3) + 0.5) * cellSize;
        c.strokeStyle = over === 1 ? '#8ee06b' : over === 2 ? '#ffd43b' : '#b06bff';
        c.lineWidth = 7; c.globalAlpha = 0.85;
        c.beginPath(); c.moveTo(ax, ay); c.lineTo(bx, by); c.stroke(); c.globalAlpha = 1;
      }
      c.textAlign = 'center'; c.font = `900 ${Math.round(W * 0.055)}px system-ui`;
      c.fillStyle = over === 1 ? '#8ee06b' : over === 2 ? '#ff4d6d' : over === -1 ? '#b06bff' : 'rgba(255,255,255,.35)';
      const txt = over === 1 ? 'ТЫ ВЫИГРАЛ' : over === 2 ? (mode === 3 ? 'НОЛИКИ' : 'ИИ ВЫИГРАЛ') : over === -1 ? 'НИЧЬЯ' :
        (mode === 3 ? (turn === 1 ? 'ход крестиков' : 'ход ноликов') : (turn === 1 ? 'твой ход' : 'думает ИИ…'));
      c.fillText(txt, W / 2, oy - 18);
    }

    return { reset, update, draw, resize: () => layout() };
  },
};
