 /* Саймон говорит */
import { M, Sound } from '../engine.js';

const PADS = [
  { c: '#ff4d6d', f: 329.6 },
  { c: '#7CFC00', f: 415.3 },
  { c: '#ffd400', f: 493.9 },
  { c: '#4dabf7', f: 587.3 },
];

export default {
  init(api) {
    let seq, pos, phase, flash, flashIdx, timer, score, dead, round, speed, inputLock;

    function reset() {
      seq = []; pos = 0; phase = 'show'; flash = 0; flashIdx = -1; timer = 0;
      score = 0; dead = false; round = 0; speed = 0.62; inputLock = 0;
      api.score(0);
      next();
    }

    function next() {
      round++;
      seq.push(M.rint(0, 3));
      pos = 0; phase = 'show'; timer = 0.55;
      speed = Math.max(0.22, 0.62 - round * 0.02);
      inputLock = seq.length * speed + 0.6;
    }

    function light(i, dur = 0.3) {
      if (i < 0 || i > 3) return;
      flashIdx = i; flash = dur;
      Sound.tone(PADS[i].f, dur * 0.9, 'sine', 0.2);
    }

    function fail() {
      dead = true; Sound.bad(); api.shake(12, 0.4);
      setTimeout(() => api.over(score), 800);
    }

    function padAt(px, py) {
      const W = api.W, H = api.H;
      const R = Math.min(W, H) * 0.36;
      const cx = W / 2, cy = H / 2 + 10;
      const dx = px - cx, dy = py - cy;
      const rad = Math.hypot(dx, dy);
      if (rad > R || rad < R * 0.24) return -1;
      let a = Math.atan2(dy, dx) + Math.PI / 2;      // 0 = верх, по часовой
      if (a < 0) a += Math.PI * 2;
      return Math.min(3, Math.floor(a / (Math.PI / 2)));
    }

    function press(i) {
      if (i === undefined || i < 0 || i > 3) return;
      if (phase !== 'input' || inputLock > 0 || dead) return;
      light(i, 0.22);
      if (i === seq[pos]) {
        pos++;
        score += 10; api.score(score);
        if (pos >= seq.length) {
          score += round * 5; api.score(score);
          Sound.coin();
          setTimeout(() => { if (!dead) next(); }, 650);
          phase = 'wait';
        }
      } else fail();
    }

    function update(dt) {
      if (dead) return;
      flash = Math.max(0, flash - dt);
      inputLock = Math.max(0, inputLock - dt);

      if (phase === 'show') {
        timer -= dt;
        if (timer <= 0) {
          if (pos < seq.length) { light(seq[pos], speed * 0.6); pos++; timer = speed; }
          else { phase = 'input'; pos = 0; }
        }
      }
      const i = api.input;
      if (phase === 'input') {
        for (const e of i.events) {
          if (e.type === 'tap') press(padAt(e.x, e.y));
        }
        if (i.pressed.a) press(0);
        if (i.pressed.b) press(2);
        if (i.pressed.up) press(1);
        if (i.pressed.down) press(3);
      }
      api.setHud(`раунд <b style="color:#ff4d6d">${round}</b> · ${phase === 'show' ? 'смотри…' : phase === 'input' ? 'повторяй!' : '…'} · длина ${seq.length}`);
    }

    function draw(c) {
      const W = api.W, H = api.H;
      const g = c.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, '#141428'); g.addColorStop(1, '#08080f');
      c.fillStyle = g; c.fillRect(0, 0, W, H);

      const R = Math.min(W, H) * 0.36;
      const cx = W / 2, cy = H / 2 + 10;
      for (let i = 0; i < 4; i++) {
        const a0 = -Math.PI / 2 + i * Math.PI / 2 + 0.045;
        const a1 = a0 + Math.PI / 2 - 0.09;
        const on = flashIdx === i && flash > 0;
        c.beginPath();
        c.moveTo(cx, cy);
        c.arc(cx, cy, R, a0, a1);
        c.closePath();
        c.fillStyle = PADS[i].c;
        c.globalAlpha = on ? 1 : 0.34;
        if (on) { c.shadowColor = PADS[i].c; c.shadowBlur = 30; }
        c.fill();
        c.shadowBlur = 0; c.globalAlpha = 1;
        c.strokeStyle = 'rgba(0,0,0,.5)'; c.lineWidth = 3; c.stroke();
      }
      c.fillStyle = '#0b0b16';
      c.beginPath(); c.arc(cx, cy, R * 0.24, 0, 7); c.fill();
      c.fillStyle = '#eaeaff'; c.textAlign = 'center'; c.textBaseline = 'middle';
      c.font = `900 ${Math.round(R * 0.22)}px system-ui`;
      c.fillText(phase === 'show' ? '👀' : dead ? '💀' : round, cx, cy);
      c.textBaseline = 'alphabetic';

      if (round === 1 && phase === 'show') {
        c.fillStyle = 'rgba(255,255,255,.55)'; c.font = `700 ${Math.round(W * 0.04)}px system-ui`;
        c.fillText('запомни порядок цветов', W / 2, cy - R - 24);
      }
    }

    return { reset, update, draw };
  },
};
