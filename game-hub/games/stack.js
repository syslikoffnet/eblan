 /* Stack Tower */
import { M, Sound } from '../engine.js';

const PAL = ['#ff6b6b', '#ffa94d', '#ffd43b', '#a9e34b', '#38d9a9', '#4dabf7', '#748ffc', '#b197fc', '#f783ac'];

export default {
  init(api) {
    let stack, moving, dirN, speed, dead, perfect, perfectT, camY, score, hue;

    function reset() {
      const W = api.W, H = api.H;
      const bw = W * 0.52, bh = Math.max(18, H * 0.038);
      stack = [{ x: W / 2 - bw / 2, y: H - bh - 30, w: bw, h: bh }];
      moving = null; dirN = 1; speed = W * 0.45; dead = false; perfect = 0; perfectT = 0;
      camY = 0; score = 0; hue = 0;
      spawn();
      api.score(0);
    }

    function spawn() {
      const top = stack[stack.length - 1];
      moving = { x: -top.w, y: top.y - top.h, w: top.w, h: top.h, dir: 1 };
      speed = api.W * (0.42 + Math.min(0.5, stack.length * 0.018));
      dirN = M.chance(0.5) ? 1 : -1;
      moving.x = dirN > 0 ? -moving.w : api.W;
    }

    function drop() {
      if (!moving || dead) return;
      const top = stack[stack.length - 1];
      const left = Math.max(moving.x, top.x);
      const right = Math.min(moving.x + moving.w, top.x + top.w);
      const overlap = right - left;
      if (overlap <= 1) {
        dead = true; Sound.bad(); api.shake(12, 0.4);
        api.emit(moving.x + moving.w / 2, moving.y, { n: 30, color: PAL[stack.length % PAL.length], speedMax: 320, life: 1 });
        setTimeout(() => api.over(score), 600);
        return;
      }
      const off = Math.abs((moving.x + moving.w / 2) - (top.x + top.w / 2));
      let nx = left, nw = overlap;
      if (off < api.W * 0.012) {           // идеально
        nx = top.x; nw = top.w; perfect++; perfectT = 1.2;
        score += 2 + perfect; Sound.power();
        api.emit(top.x + top.w / 2, moving.y + moving.h, { n: 18, color: '#fff', speedMax: 260, life: 0.6 });
        if (nw < api.W * 0.5) nw = Math.min(api.W * 0.52, nw + api.W * 0.02);
      } else {
        perfect = 0; score += 1; Sound.blip(360 + Math.min(500, stack.length * 12));
        // обрезок падает
        const cx = moving.x < top.x ? moving.x : right;
        const cw = moving.w - overlap;
        if (cw > 1) api.emit(cx + cw / 2, moving.y + moving.h / 2,
          { n: 6, color: PAL[stack.length % PAL.length], speedMax: 150, life: 0.7 });
      }
      stack.push({ x: nx, y: moving.y, w: nw, h: moving.h, c: PAL[stack.length % PAL.length] });
      api.score(score);
      moving = null;
      setTimeout(() => { if (!dead) spawn(); }, 60);
    }

    function update(dt) {
      const W = api.W;
      if (api.input.pressed.a) drop();
      perfectT = Math.max(0, perfectT - dt);
      if (moving && !dead) {
        moving.x += dirN * speed * dt;
        if (moving.x > W) { moving.x = W; dirN = -1; }
        if (moving.x + moving.w < 0) { moving.x = -moving.w; dirN = 1; }
      }
      // камера
      const H = api.H;
      const topY = stack[stack.length - 1].y - camY;
      if (topY < H * 0.42) camY -= (H * 0.42 - topY);
      api.setHud(perfect > 1 ? `<b style="color:#ffd43b">COMBO x${perfect} 🔥</b>` : '');
    }

    function draw(c) {
      const W = api.W, H = api.H;
      const g = c.createLinearGradient(0, 0, 0, H);
      const k = M.clamp(stack.length / 60, 0, 1);
      g.addColorStop(0, `rgb(${Math.round(20 + 60 * k)},${Math.round(10 + 20 * k)},${Math.round(45 + 60 * k)})`);
      g.addColorStop(1, '#07070f');
      c.fillStyle = g; c.fillRect(0, 0, W, H);

      // звёзды
      c.fillStyle = 'rgba(255,255,255,.5)';
      for (let i = 0; i < 40; i++) {
        const sx = (i * 97.3) % W, sy = ((i * 57.7 + camY * 0.25) % H + H) % H;
        c.fillRect(sx, sy, 2, 2);
      }

      c.save(); c.translate(0, -camY);
      stack.forEach((b, i) => {
        c.fillStyle = b.c || '#3a3a6a';
        M.roundRect(c, b.x, b.y, b.w, b.h, 3); c.fill();
        c.fillStyle = 'rgba(255,255,255,.18)';
        c.fillRect(b.x, b.y, b.w, 3);
        c.fillStyle = 'rgba(0,0,0,.22)';
        c.fillRect(b.x, b.y + b.h - 3, b.w, 3);
      });
      if (moving) {
        c.fillStyle = PAL[stack.length % PAL.length];
        c.globalAlpha = 0.95;
        M.roundRect(c, moving.x, moving.y, moving.w, moving.h, 3); c.fill();
        c.globalAlpha = 1;
        c.strokeStyle = 'rgba(255,255,255,.35)'; c.lineWidth = 1.5;
        c.strokeRect(moving.x, moving.y, moving.w, moving.h);
      }
      c.restore();

      if (perfectT > 0) {
        c.globalAlpha = M.clamp(perfectT, 0, 1);
        c.fillStyle = '#ffd43b'; c.textAlign = 'center';
        c.font = `900 ${Math.round(W * 0.09)}px system-ui`;
        c.fillText('ИДЕАЛЬНО!', W / 2, H * 0.24);
        c.globalAlpha = 1;
      }
      if (stack.length === 1) {
        c.fillStyle = 'rgba(255,255,255,.6)'; c.textAlign = 'center';
        c.font = `700 ${Math.round(W * 0.045)}px system-ui`;
        c.fillText('тап — уронить блок', W / 2, H * 0.2);
      }
    }

    return { reset, update, draw };
  },
};
