 /* Сокобан */
import { M, Sound } from '../engine.js';

const LEVELS = [
  ['#######', '#     #', '#.$@$.#', '#     #', '#######'],
  ['########', '#  ..  #', '#  $$  #', '#  @   #', '#      #', '########'],
  ['#########', '#       #', '# .$ $ .#', '#   @   #', '#       #', '#########'],
  ['########', '# ...  #', '# $$$  #', '#  @   #', '#      #', '########'],
  ['#######', '#  .  #', '# $@$ #', '#  .  #', '#######'],
  ['#########', '#. $ $ .#', '#   @   #', '#. $ $ .#', '#########'],
  ['#########', '#  ...  #', '#  $$$  #', '##  @  ##', '#  $$$  #', '#  ...  #', '#########'],
  ['##########', '#        #', '# .$  $. #', '# $ .. $ #', '#        #', '#    @   #', '##########'],
];

export default {
  winTitle: 'Все уровни пройдены!',
  init(api) {
    let lvl, walls, goals, boxes, player, cs, ox, oy, moves, pushes, hist, done, doneT, score, total;

    function parse(n) {
      const raw = LEVELS[n % LEVELS.length];
      walls = new Set(); goals = new Set(); boxes = new Set();
      let w = 0;
      raw.forEach(r => w = Math.max(w, r.length));
      const h = raw.length;
      raw.forEach((row, y) => {
        for (let x = 0; x < row.length; x++) {
          const ch = row[x], k = x + ',' + y;
          if (ch === '#') walls.add(k);
          if (ch === '.' || ch === '+' || ch === '*') goals.add(k);
          if (ch === '$' || ch === '*') boxes.add(k);
          if (ch === '@' || ch === '+') player = { x, y };
        }
      });
      cs = Math.floor(Math.min(api.W * 0.9 / w, (api.H - 110) / h));
      ox = Math.floor((api.W - w * cs) / 2);
      oy = Math.floor((api.H - h * cs) / 2) + 10;
      total = { w, h };
    }

    function reset() {
      lvl = api.Store.get('sokoban_lvl', 0) || 0;
      score = 0; moves = 0; pushes = 0; hist = []; done = false; doneT = 0;
      player = { x: 1, y: 1 };
      parse(lvl);
      api.score(0);
    }

    const key = (x, y) => x + ',' + y;

    function move(dx, dy) {
      if (done) return;
      const nx = player.x + dx, ny = player.y + dy;
      if (walls.has(key(nx, ny))) { Sound.blip(140); return; }
      const bk = key(nx, ny);
      if (boxes.has(bk)) {
        const bx = nx + dx, by = ny + dy;
        if (walls.has(key(bx, by)) || boxes.has(key(bx, by))) { Sound.blip(160); return; }
        hist.push({ p: { ...player }, b: bk, nb: key(bx, by) });
        boxes.delete(bk); boxes.add(key(bx, by));
        pushes++; Sound.hit();
        api.emit(ox + (bx + 0.5) * cs, oy + (by + 0.5) * cs, { n: 5, color: '#d8a24a', speedMax: 120, life: 0.35 });
      } else hist.push({ p: { ...player }, b: null });
      player.x = nx; player.y = ny; moves++;
      Sound.blip(300);
      if ([...goals].every(g => boxes.has(g))) winLevel();
    }

    function winLevel() {
      done = true; doneT = 0;
      const gained = Math.max(100, 1000 - moves * 8 - pushes * 4);
      score += gained; api.score(score);
      Sound.win(); api.shake(6, 0.3);
      boxes.forEach(b => {
        const [x, y] = b.split(',').map(Number);
        api.emit(ox + (x + 0.5) * cs, oy + (y + 0.5) * cs, { n: 16, color: '#ffd43b', speedMax: 260, life: 0.8 });
      });
      lvl++; api.Store.set('sokoban_lvl', lvl);
      setTimeout(() => {
        if (lvl >= LEVELS.length) { api.win(score); return; }
        done = false; moves = 0; pushes = 0; hist = []; parse(lvl);
      }, 1200);
    }

    function undo() {
      if (!hist.length || done) return;
      const h = hist.pop();
      player = h.p;
      if (h.b) { boxes.delete(h.nb); boxes.add(h.b); pushes = Math.max(0, pushes - 1); }
      moves = Math.max(0, moves - 1);
      Sound.blip(420);
    }

    function update(dt) {
      if (done) { doneT += dt; return; }
      const i = api.input;
      const sw = i.swipes[i.swipes.length - 1];
      if (sw) move(sw.dir === 'left' ? -1 : sw.dir === 'right' ? 1 : 0, sw.dir === 'up' ? -1 : sw.dir === 'down' ? 1 : 0);
      else if (i.pressed.left) move(-1, 0);
      else if (i.pressed.right) move(1, 0);
      else if (i.pressed.up) move(0, -1);
      else if (i.pressed.down) move(0, 1);
      else if (i.pressed.a) undo();
      else if (i.pressed.b) { hist = []; moves = 0; pushes = 0; parse(lvl); Sound.click(); }
      // долгое нажатие = рестарт уровня
      const p = i.pointer;
      if (p.down) { this._pt = (this._pt || 0) + dt; if (this._pt > 0.6) { this._pt = -99; hist = []; parse(lvl); moves = 0; Sound.click(); } }
      else this._pt = 0;
      api.setHud(`уровень <b style="color:#d8a24a">${(lvl % LEVELS.length) + 1}/${LEVELS.length}</b> · ходов ${moves} · тап — отмена`);
    }

    function draw(c) {
      const W = api.W, H = api.H;
      c.fillStyle = '#120d07'; c.fillRect(0, 0, W, H);
      const { w, h } = total;
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const px = ox + x * cs, py = oy + y * cs, k = key(x, y);
        if (walls.has(k)) {
          const g = c.createLinearGradient(px, py, px, py + cs);
          g.addColorStop(0, '#6b4f2a'); g.addColorStop(1, '#3a2a12');
          c.fillStyle = g; M.roundRect(c, px + 1, py + 1, cs - 2, cs - 2, 4); c.fill();
          c.fillStyle = 'rgba(255,255,255,.09)'; c.fillRect(px + 2, py + 2, cs - 4, 2);
        } else if (goals.has(k) || boxes.has(k) || (player.x === x && player.y === y)) {
          c.fillStyle = '#1d160d'; c.fillRect(px + 1, py + 1, cs - 2, cs - 2);
        }
        if (goals.has(k) && !boxes.has(k)) {
          c.strokeStyle = 'rgba(255,212,59,.85)'; c.lineWidth = 2;
          c.beginPath(); c.arc(px + cs / 2, py + cs / 2, cs * 0.16, 0, 7); c.stroke();
        }
      }
      boxes.forEach(b => {
        const [x, y] = b.split(',').map(Number);
        const on = goals.has(b);
        const px = ox + x * cs, py = oy + y * cs;
        c.fillStyle = on ? '#8ee06b' : '#d8a24a';
        if (on) { c.shadowColor = '#8ee06b'; c.shadowBlur = 16; }
        M.roundRect(c, px + 3, py + 3, cs - 6, cs - 6, 6); c.fill(); c.shadowBlur = 0;
        c.strokeStyle = 'rgba(0,0,0,.35)'; c.lineWidth = 2;
        c.beginPath(); c.moveTo(px + 5, py + 5); c.lineTo(px + cs - 5, py + cs - 5);
        c.moveTo(px + cs - 5, py + 5); c.lineTo(px + 5, py + cs - 5); c.stroke();
      });
      const px = ox + player.x * cs, py = oy + player.y * cs;
      c.fillStyle = '#ffd93d'; c.beginPath(); c.arc(px + cs / 2, py + cs / 2, cs * 0.32, 0, 7); c.fill();
      c.fillStyle = '#120d07';
      c.beginPath(); c.arc(px + cs * 0.4, py + cs * 0.44, cs * 0.05, 0, 7); c.fill();
      c.beginPath(); c.arc(px + cs * 0.6, py + cs * 0.44, cs * 0.05, 0, 7); c.fill();
      if (done) {
        c.globalAlpha = M.clamp(1.4 - doneT, 0, 1);
        c.fillStyle = '#8ee06b'; c.textAlign = 'center';
        c.font = `900 ${Math.round(W * 0.09)}px system-ui`;
        c.fillText('УРОВЕНЬ ПРОЙДЕН', W / 2, H * 0.5);
        c.globalAlpha = 1;
      }
    }

    return { reset, update, draw };
  },
};
