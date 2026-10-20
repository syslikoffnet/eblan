 /* Арканоид / Breakout */
import { M, Sound } from '../engine.js';

const COLORS = ['#ff4d6d', '#ff9f1c', '#ffd400', '#7CFC00', '#00e5c0', '#7ad7ff', '#b06bff', '#ff7ab8'];

export default {
  init(api) {
    let paddle, balls, bricks, level, lives, launched, dead, msg, msgT, powerups, score, combo;

    function layout() {
      paddle.w = M.clamp(api.W * 0.24, 60, 150);
      paddle.y = api.H - 46;
    }

    function buildLevel(n) {
      const W = api.W;
      const cols = 8, rows = Math.min(9, 4 + n);
      const bw = (W - 24) / cols, bh = Math.max(14, api.H * 0.028);
      bricks = [];
      for (let r = 0; r < rows; r++) for (let cI = 0; cI < cols; cI++) {
        if (n > 2 && M.chance(0.08)) continue;
        const hp = r < 1 && n > 1 ? 2 : 1;
        bricks.push({ x: 12 + cI * bw, y: 70 + r * (bh + 4), w: bw - 4, h: bh, hp, max: hp, color: COLORS[r % COLORS.length] });
      }
    }

    function reset() {
      paddle = { x: api.W / 2, w: 100, h: 13, y: api.H - 46 };
      layout();
      balls = []; powerups = [];
      level = 1; lives = 3; score = 0; combo = 0; launched = false; dead = false; msg = ''; msgT = 0;
      buildLevel(1);
      newBall();
      api.score(0);
    }

    function newBall() {
      balls = [{ x: paddle.x, y: paddle.y - 12, vx: 0, vy: 0, r: 7, stuck: true }];
      launched = false;
    }

    function launch() {
      for (const b of balls) if (b.stuck) {
        b.stuck = false;
        const sp = api.H * 0.55;
        const a = M.rand(-Math.PI / 2 - 0.5, -Math.PI / 2 + 0.5);
        b.vx = Math.cos(a) * sp; b.vy = Math.sin(a) * sp;
      }
      launched = true; Sound.blip(500);
    }

    function say(t) { msg = t; msgT = 1.6; }

    function update(dt) {
      const W = api.W, H = api.H;
      if (dead) return;
      // управление
      const p = api.input.pointer;
      if (p.down) paddle.x = M.clamp(p.x, paddle.w / 2, W - paddle.w / 2);
      const mv = (api.input.held.left ? -1 : 0) + (api.input.held.right ? 1 : 0);
      if (mv) paddle.x = M.clamp(paddle.x + mv * W * 0.9 * dt, paddle.w / 2, W - paddle.w / 2);
      if (api.input.pressed.a && !launched) launch();

      for (const b of balls) {
        if (b.stuck) { b.x = paddle.x; b.y = paddle.y - 12; continue; }
        b.x += b.vx * dt; b.y += b.vy * dt;
        if (b.x - b.r < 0) { b.x = b.r; b.vx = Math.abs(b.vx); Sound.blip(300); }
        if (b.x + b.r > W) { b.x = W - b.r; b.vx = -Math.abs(b.vx); Sound.blip(300); }
        if (b.y - b.r < 34) { b.y = 34 + b.r; b.vy = Math.abs(b.vy); Sound.blip(300); }

        // платформа
        if (b.vy > 0 && M.hit(b.x - b.r, b.y - b.r, b.r * 2, b.r * 2, paddle.x - paddle.w / 2, paddle.y, paddle.w, paddle.h)) {
          const rel = (b.x - paddle.x) / (paddle.w / 2);
          const sp = Math.hypot(b.vx, b.vy) * 1.015;
          const a = -Math.PI / 2 + M.clamp(rel, -1, 1) * 1.05;
          b.vx = Math.cos(a) * sp; b.vy = Math.sin(a) * sp;
          b.y = paddle.y - b.r;
          combo = 0; Sound.blip(420);
          api.emit(b.x, paddle.y, { n: 4, color: '#7ad7ff', speedMax: 120, life: 0.25 });
        }

        // кирпичи
        for (let i = bricks.length - 1; i >= 0; i--) {
          const br = bricks[i];
          if (!M.hit(b.x - b.r, b.y - b.r, b.r * 2, b.r * 2, br.x, br.y, br.w, br.h)) continue;
          const px = Math.min(Math.abs(b.x - br.x), Math.abs(b.x - (br.x + br.w)));
          const py = Math.min(Math.abs(b.y - br.y), Math.abs(b.y - (br.y + br.h)));
          if (px < py) b.vx = -b.vx; else b.vy = -b.vy;
          br.hp--;
          if (br.hp <= 0) {
            bricks.splice(i, 1);
            combo++;
            score += 10 + combo * 2; api.score(score);
            Sound.coin();
            api.emit(br.x + br.w / 2, br.y + br.h / 2, { n: 10, color: br.color, speedMax: 220, life: 0.5 });
            if (M.chance(0.14)) {
              const kind = M.pick(['wide', 'multi', 'slow', 'life']);
              powerups.push({ x: br.x + br.w / 2, y: br.y, vy: H * 0.22, kind, r: 11 });
            }
          } else { Sound.hit(); api.emit(b.x, b.y, { n: 5, color: '#fff', speedMax: 140, life: 0.3 }); }
          break;
        }
      }

      // бонусы
      for (let i = powerups.length - 1; i >= 0; i--) {
        const u = powerups[i]; u.y += u.vy * dt;
        if (M.hit(u.x - u.r, u.y - u.r, u.r * 2, u.r * 2, paddle.x - paddle.w / 2, paddle.y, paddle.w, paddle.h)) {
          powerups.splice(i, 1); Sound.power();
          if (u.kind === 'wide') { paddle.w = Math.min(240, paddle.w * 1.5); say('Широкая платформа!'); }
          if (u.kind === 'slow') { balls.forEach(b => { b.vx *= 0.7; b.vy *= 0.7; }); say('Медленный мяч'); }
          if (u.kind === 'life') { lives++; say('+1 жизнь'); }
          if (u.kind === 'multi') {
            const src = balls[0];
            for (let k = 0; k < 2 && balls.length < 6; k++) {
              const a = M.rand(0, Math.PI * 2), sp = Math.hypot(src.vx, src.vy) || api.H * 0.5;
              balls.push({ x: src.x, y: src.y, vx: Math.cos(a) * sp, vy: -Math.abs(Math.sin(a) * sp), r: 7, stuck: false });
            }
            say('Мульти-мяч!');
          }
          continue;
        }
        if (u.y > H + 20) powerups.splice(i, 1);
      }

      // мячи улетели
      balls = balls.filter(b => b.y - b.r < H + 20);
      if (!balls.length) {
        lives--;
        api.shake(9, 0.3); Sound.bad();
        if (lives <= 0) {
          dead = true;
          setTimeout(() => api.over(score), 600);
        } else { say(`Жизней: ${lives}`); newBall(); }
      }

      if (!bricks.length) {
        level++; score += 100; api.score(score);
        Sound.win(); say(`Уровень ${level}!`);
        paddle.w = M.clamp(api.W * 0.24, 60, 150);
        buildLevel(level); newBall();
      }

      msgT = Math.max(0, msgT - dt);
      api.setHud(`❤ ${lives} &nbsp;·&nbsp; ур. ${level} &nbsp;·&nbsp; 🧱 ${bricks.length}`);
    }

    function draw(c) {
      const W = api.W, H = api.H;
      const g = c.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, '#16162e'); g.addColorStop(1, '#0a0a16');
      c.fillStyle = g; c.fillRect(0, 0, W, H);

      for (const br of bricks) {
        c.fillStyle = br.color;
        c.globalAlpha = br.hp < br.max ? 0.55 : 1;
        M.roundRect(c, br.x, br.y, br.w, br.h, 4); c.fill();
        c.globalAlpha = 1;
        c.fillStyle = 'rgba(255,255,255,.22)';
        c.fillRect(br.x + 2, br.y + 2, br.w - 4, 2);
      }

      for (const u of powerups) {
        c.fillStyle = { wide: '#00e5c0', multi: '#ff7ab8', slow: '#7ad7ff', life: '#ff4d6d' }[u.kind];
        c.beginPath(); c.arc(u.x, u.y, u.r, 0, 7); c.fill();
        c.fillStyle = '#0a0a16'; c.font = '800 12px system-ui'; c.textAlign = 'center'; c.textBaseline = 'middle';
        c.fillText({ wide: 'W', multi: 'M', slow: 'S', life: '+' }[u.kind], u.x, u.y + 1);
      }

      // платформа
      const pg = c.createLinearGradient(0, paddle.y, 0, paddle.y + paddle.h);
      pg.addColorStop(0, '#fff'); pg.addColorStop(1, '#9ab0ff');
      c.fillStyle = pg;
      M.roundRect(c, paddle.x - paddle.w / 2, paddle.y, paddle.w, paddle.h, 6); c.fill();

      for (const b of balls) {
        c.fillStyle = '#fff'; c.shadowColor = '#7ad7ff'; c.shadowBlur = 14;
        c.beginPath(); c.arc(b.x, b.y, b.r, 0, 7); c.fill(); c.shadowBlur = 0;
      }

      c.textBaseline = 'alphabetic'; c.textAlign = 'center';
      if (!launched) {
        c.fillStyle = 'rgba(255,255,255,.6)'; c.font = `600 ${Math.round(W * 0.04)}px system-ui`;
        c.fillText('тап — запуск мяча', W / 2, H * 0.62);
      }
      if (msgT > 0) {
        c.globalAlpha = M.clamp(msgT, 0, 1);
        c.fillStyle = '#ffd400'; c.font = `900 ${Math.round(W * 0.06)}px system-ui`;
        c.fillText(msg, W / 2, H * 0.3);
        c.globalAlpha = 1;
      }
    }

    return { reset, update, draw, resize: () => { layout(); paddle.y = api.H - 46; } };
  },
};
