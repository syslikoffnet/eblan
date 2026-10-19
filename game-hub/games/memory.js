 /* Найди пару (Memory) */
import { M, Sound } from '../engine.js';

const EMOJI = ['🍕', '🚀', '🐙', '🎧', '🍩', '🦊', '⚽', '🎲', '🌵', '🍉', '🛸', '🐸', '🍄', '💎', '🎺', '🐝', '🍿', '🧊', '🪐', '🎯'];

export default {
  winTitle: 'Все пары найдены!',
  init(api) {
    let level, pairs, cols, rowsN, cs, ox, oy, cards, first, second, lockT, moves, matched, score, combo, time;

    function build() {
      const n = pairs;
      cols = Math.ceil(Math.sqrt(n * (api.W / api.H) * 1.35));
      cols = M.clamp(cols, 3, 6);
      rowsN = Math.ceil((n * 2) / cols);
      cs = Math.floor(Math.min(api.W * 0.9 / cols, (api.H - 110) / rowsN));
      ox = Math.floor((api.W - cols * cs) / 2);
      oy = Math.floor((api.H - rowsN * cs) / 2) + 12;
      const emo = M.shuffle(EMOJI.slice()).slice(0, n);
      const deck = M.shuffle([...emo, ...emo]);
      cards = deck.map((e, i) => ({
        e, x: i % cols, y: Math.floor(i / cols),
        flip: 0, up: false, done: false, pop: 0,
      }));
      first = null; second = null; lockT = 0; matched = 0;
    }

    function reset() {
      level = 1; pairs = 6; moves = 0; score = 0; combo = 0; time = 0;
      api.score(0);
      build();
    }

    function tap(px, py) {
      if (lockT > 0) return;
      const x = Math.floor((px - ox) / cs), y = Math.floor((py - oy) / cs);
      const card = cards.find(c2 => c2.x === x && c2.y === y);
      if (!card || card.up || card.done) return;
      card.up = true; Sound.blip(520);
      if (!first) { first = card; return; }
      second = card; moves++; lockT = 0.75;
      if (first.e === second.e) {
        combo++;
        const gain = 100 * combo;
        score += gain; api.score(score);
        Sound.coin();
        first.done = second.done = true; first.pop = second.pop = 1;
        matched++;
        api.emit(ox + (x + 0.5) * cs, oy + (y + 0.5) * cs, { n: 14, color: '#b06bff', speedMax: 220, life: 0.6 });
        first = second = null; lockT = 0.25;
        if (matched === pairs) nextLevel();
      } else {
        combo = 0; Sound.bad();
      }
    }

    function nextLevel() {
      const bonus = Math.max(50, 500 - moves * 10);
      score += bonus; api.score(score);
      Sound.power();
      level++;
      if (level > 5) { setTimeout(() => api.win(score), 700); return; }
      pairs = 5 + level * 2;
      moves = 0;
      setTimeout(() => build(), 600);
    }

    function update(dt) {
      time += dt;
      lockT = Math.max(0, lockT - dt);
      cards.forEach(c2 => {
        const target = (c2.up || c2.done) ? 1 : 0;
        c2.flip = M.lerp(c2.flip, target, Math.min(1, dt * 12));
        c2.pop = Math.max(0, c2.pop - dt * 2);
      });
      if (lockT === 0 && first && second) {
        first.up = false; second.up = false;
        first = second = null;
      }
      const i = api.input;
      for (const e of i.events) if (e.type === 'tap') tap(e.x, e.y);
      api.setHud(`уровень <b style="color:#b06bff">${level}</b> · пары ${matched}/${pairs} · ходов ${moves}${combo > 1 ? ` · <b style="color:#ffd43b">комбо x${combo}</b>` : ''}`);
    }

    function card3d(c, card) {
      const px = ox + card.x * cs, py = oy + card.y * cs;
      const k = card.flip;
      const w = (cs - 8) * Math.abs(1 - 2 * k > 0 ? 1 - 2 * k * 0 : 1);
      const sc = 1 - Math.sin(k * Math.PI) * 0.08 + card.pop * 0.12;
      c.save();
      c.translate(px + cs / 2, py + cs / 2);
      c.scale(Math.max(0.05, Math.abs(Math.cos(k * Math.PI / 1)) * (k < 0.5 ? 1 : 1)) * sc, sc);
      const showFace = k > 0.5;
      const ww = cs - 8, hh = cs - 8;
      const g = c.createLinearGradient(-ww / 2, -hh / 2, ww / 2, hh / 2);
      if (showFace) {
        g.addColorStop(0, card.done ? '#2f6b3a' : '#2a2a52');
        g.addColorStop(1, card.done ? '#1d4a26' : '#171733');
      } else {
        g.addColorStop(0, '#7c5cff'); g.addColorStop(1, '#4d3bd6');
      }
      c.fillStyle = g;
      M.roundRect(c, -ww / 2, -hh / 2, ww, hh, 10); c.fill();
      c.strokeStyle = showFace ? 'rgba(255,255,255,.18)' : 'rgba(255,255,255,.35)';
      c.lineWidth = 2; c.stroke();
      if (showFace) {
        c.font = `${Math.round(cs * 0.46)}px system-ui`; c.textAlign = 'center'; c.textBaseline = 'middle';
        c.fillText(card.e, 0, 2);
      } else {
        c.fillStyle = 'rgba(255,255,255,.5)';
        c.font = `900 ${Math.round(cs * 0.3)}px system-ui`; c.textAlign = 'center'; c.textBaseline = 'middle';
        c.fillText('?', 0, 2);
      }
      c.restore();
      c.textBaseline = 'alphabetic';
      void w;
    }

    function draw(c) {
      const W = api.W, H = api.H;
      const g = c.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, '#1b1035'); g.addColorStop(1, '#0b0b16');
      c.fillStyle = g; c.fillRect(0, 0, W, H);
      cards.forEach(cd => card3d(c, cd));
    }

    return { reset, update, draw, resize: () => build() };
  },
};
