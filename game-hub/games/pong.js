 /* Понг против ИИ */
import { M, Sound } from '../engine.js';

export default {
  winTitle: 'Ты победил!',
  init(api) {
    let me, ai, ball, myScore, aiScore, dead, rally, serveT, diff, trails;

    function reset() {
      const W = api.W, H = api.H;
      me = { x: 18, y: H / 2, w: 11, h: H * 0.17 };
      ai = { x: W - 29, y: H / 2, w: 11, h: H * 0.17 };
      trails = [];
      myScore = 0; aiScore = 0; rally = 0; dead = false; diff = 0.62;
      api.score(0);
      serve(1);
    }

    function serve(dirTo) {
      const W = api.W, H = api.H;
      ball = { x: W / 2, y: H / 2, r: 8, vx: 0, vy: 0 };
      serveT = 0.7;
      const sp = W * 0.42;
      const a = M.rand(-0.45, 0.45);
      ball.vx = Math.cos(a) * sp * (dirTo || (M.chance(0.5) ? 1 : -1));
      ball.vy = Math.sin(a) * sp;
      ball.pending = true;
      rally = 0;
    }

    function update(dt) {
      const W = api.W, H = api.H;
      if (dead) return;

      // своя ракетка
      const p = api.input.pointer;
      if (p.down) me.y = M.clamp(p.y, me.h / 2 + 30, H - me.h / 2);
      const mv = (api.input.held.up ? -1 : 0) + (api.input.held.down ? 1 : 0);
      if (mv) me.y = M.clamp(me.y + mv * H * 1.05 * dt, me.h / 2 + 30, H - me.h / 2);

      if (ball.pending) {
        serveT -= dt;
        ball.x = W / 2; ball.y = H / 2;
        if (serveT <= 0) ball.pending = false;
      } else {
        ball.x += ball.vx * dt; ball.y += ball.vy * dt;
      }
      trails.push({ x: ball.x, y: ball.y, t: 0.25 });
      for (let i = trails.length - 1; i >= 0; i--) { trails[i].t -= dt; if (trails[i].t <= 0) trails.splice(i, 1); }

      if (ball.y - ball.r < 34) { ball.y = 34 + ball.r; ball.vy = Math.abs(ball.vy); Sound.blip(280); }
      if (ball.y + ball.r > H) { ball.y = H - ball.r; ball.vy = -Math.abs(ball.vy); Sound.blip(280); }

      // ИИ
      const target = ball.vx > 0 ? ball.y + M.rand(-1, 1) * ai.h * (1.35 - diff) : H / 2;
      const spd = H * (0.5 + diff * 0.75);
      ai.y += M.clamp(target - ai.y, -spd * dt, spd * dt);
      ai.y = M.clamp(ai.y, ai.h / 2 + 30, H - ai.h / 2);

      // удары
      const hitPad = (pad, side) => {
        if (Math.abs(ball.x - (pad.x + side * pad.w / 2)) < ball.r + 6 &&
          ball.y > pad.y - pad.h / 2 - ball.r && ball.y < pad.y + pad.h / 2 + ball.r &&
          Math.sign(ball.vx) === -side) {
          const rel = M.clamp((ball.y - pad.y) / (pad.h / 2), -1, 1);
          const sp = Math.min(W * 1.1, Math.hypot(ball.vx, ball.vy) * 1.06);
          const a = rel * 0.9;
          ball.vx = Math.cos(a) * sp * -side;
          ball.vy = Math.sin(a) * sp;
          ball.x = pad.x + side * (pad.w / 2 + ball.r + 1);
          rally++;
          diff = M.clamp(0.6 + rally * 0.012 + myScore * 0.02, 0.6, 0.98);
          Sound.blip(side < 0 ? 620 : 420);
          api.emit(ball.x, ball.y, { n: 6, color: '#7ad7ff', speedMax: 180, life: 0.3 });
          api.shake(3, 0.08);
        }
      };
      hitPad(me, 1); hitPad(ai, -1);

      if (ball.x < -20) { aiScore++; Sound.bad(); api.shake(7, 0.2); checkEnd(); serve(-1); }
      if (ball.x > W + 20) { myScore++; Sound.coin(); api.score(myScore); checkEnd(); serve(1); }

      api.setHud(`<b style="color:#7ad7ff">${myScore}</b> : <b style="color:#ff4d6d">${aiScore}</b> &nbsp;·&nbsp; до 7`);
    }

    function checkEnd() {
      if (myScore >= 7) { dead = true; setTimeout(() => api.win(myScore * 100 + rally * 5), 500); }
      else if (aiScore >= 7) { dead = true; setTimeout(() => api.over(myScore * 100), 500); }
    }

    function draw(c) {
      const W = api.W, H = api.H;
      c.fillStyle = '#07070f'; c.fillRect(0, 0, W, H);
      c.strokeStyle = 'rgba(124,92,255,.35)'; c.lineWidth = 3; c.setLineDash([10, 14]);
      c.beginPath(); c.moveTo(W / 2, 30); c.lineTo(W / 2, H); c.stroke(); c.setLineDash([]);

      c.textAlign = 'center';
      c.font = `900 ${Math.round(Math.min(W, H) * 0.16)}px system-ui`;
      c.fillStyle = 'rgba(122,215,255,.13)'; c.fillText(myScore, W * 0.27, H * 0.3);
      c.fillStyle = 'rgba(255,77,109,.13)'; c.fillText(aiScore, W * 0.73, H * 0.3);

      for (const t of trails) {
        c.globalAlpha = t.t * 1.6;
        c.fillStyle = '#4a6cff';
        c.beginPath(); c.arc(t.x, t.y, ball.r * t.t * 3, 0, 7); c.fill();
      }
      c.globalAlpha = 1;

      const pad = (p, col) => {
        c.fillStyle = col; c.shadowColor = col; c.shadowBlur = 18;
        M.roundRect(c, p.x - p.w / 2, p.y - p.h / 2, p.w, p.h, 6); c.fill(); c.shadowBlur = 0;
      };
      pad(me, '#eaf2ff'); pad(ai, '#ff8fa3');

      c.fillStyle = '#fff'; c.shadowColor = '#fff'; c.shadowBlur = 20;
      c.beginPath(); c.arc(ball.x, ball.y, ball.r, 0, 7); c.fill(); c.shadowBlur = 0;

      if (ball.pending) {
        c.fillStyle = 'rgba(255,255,255,.55)'; c.font = `700 ${Math.round(W * 0.045)}px system-ui`;
        c.fillText('готовься…', W / 2, H * 0.55);
      }
    }

    return { reset, update, draw };
  },
};
