 /* Змейка (Nokia style) */
import { M, Sound } from '../engine.js';

export default {
  init(api) {
    let cols, rows, cs, snake, dir, queue, food, bonus, bonusT, step, stepT, dead, grow, ox, oy, score;

    function layout() {
      const W = api.W, H = api.H;
      cols = 17;
      cs = Math.floor(W / cols);
      rows = Math.max(12, Math.floor((H - 40) / cs));
      ox = Math.floor((W - cols * cs) / 2);
      oy = Math.floor((H - rows * cs) / 2) + 10;
    }

    function freeCell() {
      for (let i = 0; i < 400; i++) {
        const x = M.rint(0, cols - 1), y = M.rint(0, rows - 1);
        if (!snake.some(s => s.x === x && s.y === y)) return { x, y };
      }
      return { x: 0, y: 0 };
    }

    function reset() {
      layout();
      const cx = Math.floor(cols / 2), cy = Math.floor(rows / 2);
      snake = [{ x: cx, y: cy }, { x: cx - 1, y: cy }, { x: cx - 2, y: cy }];
      dir = { x: 1, y: 0 }; queue = [];
      food = freeCell(); bonus = null; bonusT = M.rand(6, 10);
      step = 0.145; stepT = 0; dead = false; grow = 0; score = 0;
      api.score(0); api.setHud('');
    }

    function push(d) {
      const last = queue.length ? queue[queue.length - 1] : dir;
      if (d.x === -last.x && d.y === -last.y) return;
      if (d.x === last.x && d.y === last.y) return;
      if (queue.length < 3) queue.push(d);
    }

    function readInput() {
      const i = api.input;
      const sw = i.swipes[i.swipes.length - 1];
      if (sw) {
        push(sw.dir === 'left' ? { x: -1, y: 0 } : sw.dir === 'right' ? { x: 1, y: 0 }
          : sw.dir === 'up' ? { x: 0, y: -1 } : { x: 0, y: 1 });
      }
      if (i.pressed.left) push({ x: -1, y: 0 });
      if (i.pressed.right) push({ x: 1, y: 0 });
      if (i.pressed.up) push({ x: 0, y: -1 });
      if (i.pressed.down) push({ x: 0, y: 1 });
    }

    function update(dt) {
      if (dead) return;
      readInput();
      stepT += dt;
      bonusT -= dt;
      if (!bonus && bonusT <= 0 && snake.length > 4) {
        bonus = freeCell(); bonus.life = 7;
      }
      if (bonus) {
        bonus.life -= dt;
        if (bonus.life <= 0) { bonus = null; bonusT = M.rand(7, 12); }
      }
      while (stepT >= step) {
        stepT -= step;
        tick();
        if (dead) break;
      }
      api.setHud(`<b style="color:#8ee06b">длина ${snake.length}</b>`);
    }

    function tick() {
      if (queue.length) dir = queue.shift();
      const h = { x: snake[0].x + dir.x, y: snake[0].y + dir.y };
      if (h.x < 0 || h.y < 0 || h.x >= cols || h.y >= rows) return kill();
      if (snake.some((s, i) => i < snake.length - 1 && s.x === h.x && s.y === h.y)) return kill();
      snake.unshift(h);
      if (h.x === food.x && h.y === food.y) {
        score += 10; api.score(score); Sound.coin(); grow += 1;
        step = Math.max(0.055, step * 0.985);
        api.emit(ox + (h.x + 0.5) * cs, oy + (h.y + 0.5) * cs, { n: 12, color: '#ff4d6d', speedMax: 200, life: 0.5 });
        food = freeCell();
      } else if (bonus && h.x === bonus.x && h.y === bonus.y) {
        score += 50; api.score(score); Sound.power(); grow += 3;
        api.emit(ox + (h.x + 0.5) * cs, oy + (h.y + 0.5) * cs, { n: 24, color: '#ffd400', speedMax: 280, life: 0.8 });
        bonus = null; bonusT = M.rand(8, 14);
      }
      if (grow > 0) grow--; else snake.pop();
    }

    function kill() {
      dead = true; Sound.boom(); api.shake(10, 0.3);
      const h = snake[0];
      api.emit(ox + (h.x + 0.5) * cs, oy + (h.y + 0.5) * cs, { n: 30, color: '#8ee06b', speedMax: 300, life: 0.9 });
      setTimeout(() => api.over(score), 500);
    }

    function draw(c) {
      const W = api.W, H = api.H;
      c.fillStyle = '#0b1a12'; c.fillRect(0, 0, W, H);
      c.strokeStyle = 'rgba(140,224,107,.07)'; c.lineWidth = 1;
      for (let x = 0; x <= cols; x++) { c.beginPath(); c.moveTo(ox + x * cs, oy); c.lineTo(ox + x * cs, oy + rows * cs); c.stroke(); }
      for (let y = 0; y <= rows; y++) { c.beginPath(); c.moveTo(ox, oy + y * cs); c.lineTo(ox + cols * cs, oy + y * cs); c.stroke(); }
      c.strokeStyle = 'rgba(140,224,107,.35)'; c.lineWidth = 2;
      c.strokeRect(ox - 1, oy - 1, cols * cs + 2, rows * cs + 2);

      // еда
      const fx = ox + (food.x + 0.5) * cs, fy = oy + (food.y + 0.5) * cs;
      const pulse = 1 + Math.sin(api.t * 6) * 0.08;
      c.fillStyle = '#ff4d6d'; c.beginPath(); c.arc(fx, fy, cs * 0.34 * pulse, 0, 7); c.fill();
      c.fillStyle = '#8ee06b'; c.fillRect(fx - 1, fy - cs * 0.45, 2, cs * 0.16);
      if (bonus) {
        const bx = ox + (bonus.x + 0.5) * cs, by = oy + (bonus.y + 0.5) * cs;
        const a = M.clamp(bonus.life, 0, 1);
        c.globalAlpha = 0.4 + 0.6 * Math.abs(Math.sin(api.t * 8));
        c.fillStyle = '#ffd400'; c.beginPath();
        for (let i = 0; i < 10; i++) {
          const r = i % 2 ? cs * 0.18 : cs * 0.42, ang = i * Math.PI / 5 - Math.PI / 2;
          c[i ? 'lineTo' : 'moveTo'](bx + Math.cos(ang) * r, by + Math.sin(ang) * r);
        }
        c.closePath(); c.fill(); c.globalAlpha = a > 0.3 ? 1 : a; c.globalAlpha = 1;
      }

      // змея
      for (let i = snake.length - 1; i >= 0; i--) {
        const s = snake[i];
        const k = 1 - i / Math.max(snake.length, 8);
        c.fillStyle = i === 0 ? '#d6ff9e' : `rgba(${Math.round(70 + 70 * k)},${Math.round(170 + 60 * k)},${Math.round(60 + 40 * k)},1)`;
        const pad = i === 0 ? 1 : 2;
        M.roundRect(c, ox + s.x * cs + pad, oy + s.y * cs + pad, cs - pad * 2, cs - pad * 2, cs * 0.3);
        c.fill();
      }
      const h = snake[0];
      const hx = ox + h.x * cs, hy = oy + h.y * cs;
      c.fillStyle = '#0b1a12';
      const ex = dir.y === 0 ? dir.x * cs * 0.18 : 0, ey = dir.x === 0 ? dir.y * cs * 0.18 : 0;
      const px = dir.x !== 0 ? cs * 0.2 : cs * 0.22, py = dir.y !== 0 ? cs * 0.2 : cs * 0.22;
      c.beginPath(); c.arc(hx + cs / 2 + ex - px * 0.5, hy + cs / 2 + ey - py * 0.5, cs * 0.09, 0, 7); c.fill();
      c.beginPath(); c.arc(hx + cs / 2 + ex + px * 0.5, hy + cs / 2 + ey + py * 0.5, cs * 0.09, 0, 7); c.fill();
      if (dead) { c.fillStyle = 'rgba(255,0,60,.15)'; c.fillRect(0, 0, W, H); }
    }

    return { reset, update, draw, resize: () => layout() };
  },
};
