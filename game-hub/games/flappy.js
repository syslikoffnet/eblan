/* Flappy Bird clone */
import { M, Sound } from '../engine.js';

export default {
  init(api) {
    let bird, pipes, clouds, dist, spawnIn, speed, started, dead, deathT, flash, gH;

    function reset() {
      const W = api.W, H = api.H;
      gH = H * 0.11;
      bird = { x: W * 0.3, y: H * 0.45, vy: 0, r: Math.max(11, W * 0.032), rot: 0, wing: 0 };
      pipes = []; clouds = [];
      for (let i = 0; i < 5; i++) clouds.push({ x: M.rand(0, W), y: M.rand(H * 0.05, H * 0.5), s: M.rand(0.4, 1), w: M.rand(50, 120) });
      dist = 0; spawnIn = W * 0.5; started = false; dead = false; deathT = 0; flash = 0;
      speed = W * 0.32;
      api.score(0); api.setHud('');
    }

    function spawnPipe() {
      const W = api.W, H = api.H;
      const gap = Math.max(110, H * 0.25 - dist * 0.004);
      const top = M.rand(H * 0.08, H - gH - gap - H * 0.08);
      pipes.push({ x: W + 20, top, gap, w: Math.max(46, W * 0.15), scored: false });
    }

    function flap() {
      if (dead) return;
      started = true;
      bird.vy = -api.H * 0.62;
      bird.wing = 1;
      Sound.jump();
      api.emit(bird.x - bird.r, bird.y + bird.r * 0.6, { n: 4, color: '#fff8dc', speedMax: 90, life: 0.35, g: 60 });
    }

    function die() {
      if (dead) return;
      dead = true; deathT = 0; flash = 1;
      Sound.boom(); api.shake(12, 0.4);
      api.emit(bird.x, bird.y, { n: 26, color: '#ffd93d', speedMax: 320, life: 0.9 });
      setTimeout(() => api.over(), 700);
    }

    function update(dt) {
      const W = api.W, H = api.H;
      if (api.input.pressed.a || api.input.pressed.up) flap();
      clouds.forEach(c => { c.x -= speed * 0.18 * c.s * dt; if (c.x < -c.w) { c.x = W + c.w; c.y = M.rand(H * 0.05, H * 0.5); } });

      if (!started) { bird.y = H * 0.45 + Math.sin(api.t * 3) * 8; bird.rot = 0; return; }

      if (!dead) {
        speed = W * (0.32 + Math.min(0.22, dist / 9000));
        bird.vy += H * 2.15 * dt;
        bird.vy = M.clamp(bird.vy, -H * 0.9, H * 0.95);
        bird.y += bird.vy * dt;
        bird.rot = M.clamp(bird.vy / (H * 0.7), -0.5, 1.3);
        bird.wing = Math.max(0, bird.wing - dt * 3);
        dist += speed * dt;

        spawnIn -= speed * dt;
        if (spawnIn <= 0) { spawnPipe(); spawnIn = W * M.rand(0.48, 0.6); }

        for (const p of pipes) p.x -= speed * dt;
        pipes = pipes.filter(p => p.x + p.w > -10);

        if (bird.y + bird.r > H - gH) { bird.y = H - gH - bird.r; die(); }
        if (bird.y - bird.r < 0) { bird.y = bird.r; bird.vy = 20; }

        for (const p of pipes) {
          const inX = bird.x + bird.r * 0.7 > p.x && bird.x - bird.r * 0.7 < p.x + p.w;
          if (inX && (bird.y - bird.r * 0.75 < p.top || bird.y + bird.r * 0.75 > p.top + p.gap)) die();
          if (!p.scored && p.x + p.w < bird.x) {
            p.scored = true; api.addScore(1); Sound.coin(); flash = 0.35;
            api.emit(bird.x, bird.y - 30, { n: 8, color: '#7CFC00', speedMax: 150, life: 0.5, g: -40 });
          }
        }
      } else {
        deathT += dt;
        bird.vy += H * 2.4 * dt; bird.y += bird.vy * dt;
        bird.rot = Math.min(1.6, bird.rot + dt * 5);
        if (bird.y > H - gH - bird.r) { bird.y = H - gH - bird.r; bird.vy = 0; }
      }
      flash = Math.max(0, flash - dt * 2.5);
    }

    function draw(c) {
      const W = api.W, H = api.H;
      const sky = c.createLinearGradient(0, 0, 0, H);
      sky.addColorStop(0, '#4ec0ca'); sky.addColorStop(0.7, '#8fe3d8'); sky.addColorStop(1, '#dff7e3');
      c.fillStyle = sky; c.fillRect(0, 0, W, H);

      c.fillStyle = 'rgba(255,255,255,.55)';
      for (const cl of clouds) {
        c.beginPath();
        c.ellipse(cl.x, cl.y, cl.w * 0.5 * cl.s, cl.w * 0.18 * cl.s, 0, 0, 7);
        c.ellipse(cl.x + cl.w * 0.25, cl.y - cl.w * 0.08, cl.w * 0.32 * cl.s, cl.w * 0.16 * cl.s, 0, 0, 7);
        c.fill();
      }

      // трубы
      for (const p of pipes) {
        const grad = c.createLinearGradient(p.x, 0, p.x + p.w, 0);
        grad.addColorStop(0, '#5aa02c'); grad.addColorStop(0.4, '#8ede4f'); grad.addColorStop(1, '#3d7a1c');
        c.fillStyle = grad;
        c.fillRect(p.x, 0, p.w, p.top);
        c.fillRect(p.x, p.top + p.gap, p.w, H - gH - p.top - p.gap);
        c.fillStyle = '#74c93f';
        c.fillRect(p.x - 4, p.top - 22, p.w + 8, 22);
        c.fillRect(p.x - 4, p.top + p.gap, p.w + 8, 22);
        c.strokeStyle = 'rgba(0,0,0,.25)'; c.lineWidth = 2;
        c.strokeRect(p.x - 4, p.top - 22, p.w + 8, 22);
        c.strokeRect(p.x - 4, p.top + p.gap, p.w + 8, 22);
      }

      // земля
      c.fillStyle = '#ded895'; c.fillRect(0, H - gH, W, gH);
      c.fillStyle = '#7ec850'; c.fillRect(0, H - gH, W, Math.max(6, gH * 0.22));
      c.strokeStyle = 'rgba(0,0,0,.12)'; c.lineWidth = 2;
      const off = (dist * 0.6) % 24;
      for (let x = -off; x < W; x += 24) {
        c.beginPath(); c.moveTo(x, H - gH * 0.5); c.lineTo(x + 12, H - gH * 0.2); c.stroke();
      }

      // птица
      c.save();
      c.translate(bird.x, bird.y); c.rotate(bird.rot);
      const r = bird.r;
      c.fillStyle = '#ffd93d'; c.beginPath(); c.ellipse(0, 0, r * 1.2, r, 0, 0, 7); c.fill();
      c.strokeStyle = 'rgba(0,0,0,.3)'; c.lineWidth = 1.5; c.stroke();
      c.fillStyle = '#f5f5f5'; c.beginPath(); c.arc(r * 0.5, -r * 0.3, r * 0.38, 0, 7); c.fill();
      c.fillStyle = '#222'; c.beginPath(); c.arc(r * 0.62, -r * 0.3, r * 0.17, 0, 7); c.fill();
      c.fillStyle = '#ff9f1c';
      c.beginPath(); c.moveTo(r * 0.9, 0); c.lineTo(r * 1.7, r * 0.12); c.lineTo(r * 0.9, r * 0.42); c.closePath(); c.fill();
      c.fillStyle = '#f7b733';
      const wy = Math.sin(bird.wing * 6) * r * 0.5 - r * 0.1;
      c.beginPath(); c.ellipse(-r * 0.25, wy, r * 0.55, r * 0.34, -0.4, 0, 7); c.fill();
      c.restore();

      if (flash > 0) { c.fillStyle = `rgba(255,255,255,${flash * 0.5})`; c.fillRect(0, 0, W, H); }
      if (!started && !dead) {
        c.fillStyle = 'rgba(0,0,0,.35)';
        c.font = `800 ${Math.round(W * 0.055)}px system-ui`; c.textAlign = 'center';
        c.fillText('ТАП — взмах', W / 2, H * 0.22);
      }
      if (dead) {
        c.fillStyle = 'rgba(255,0,60,.12)'; c.fillRect(0, 0, W, H);
      }
    }

    return { reset, update, draw };
  },
};
