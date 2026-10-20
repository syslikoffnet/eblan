 /* Словодел — русская версия Wordle */
import { M, Sound } from '../engine.js';

const WORDS = [
  'арбуз', 'банан', 'барон', 'вагон', 'венок', 'ветер', 'вилка', 'вирус', 'волна', 'ворон',
  'вулкан', 'выбор', 'гараж', 'гиена', 'глина', 'город', 'гость', 'грибы', 'гроза', 'двери',
  'девиз', 'дворец', 'диван', 'диета', 'дождь', 'доска', 'дрова', 'дятел', 'ельник', 'жабра',
  'жесть', 'жетон', 'жизнь', 'зебра', 'зерно', 'зрачок', 'игрок', 'искра', 'исток', 'кабан',
  'казан', 'капля', 'карта', 'катер', 'кисть', 'класс', 'книга', 'кобра', 'козёл', 'кокон',
  'комар', 'котик', 'кочан', 'крыло', 'крыша', 'кубок', 'кукла', 'кулак', 'купол', 'курок',
  'лампа', 'лапша', 'ласка', 'леска', 'лимон', 'линза', 'лодка', 'локон', 'лужок', 'лучик',
  'магия', 'майка', 'марка', 'масло', 'мафия', 'мачта', 'мешок', 'миска', 'молот', 'мороз',
  'мотор', 'музей', 'мышка', 'навес', 'народ', 'наука', 'невод', 'нерпа', 'нитка', 'ножка',
  'носок', 'ночка', 'обувь', 'овраг', 'огонь', 'озеро', 'окунь', 'олень', 'опора', 'осина',
  'осень', 'отбор', 'ответ', 'отец', 'палец', 'парус', 'паста', 'песня', 'пиала', 'пилот',
  'пицца', 'пламя', 'плита', 'повар', 'поезд', 'пожар', 'полка', 'порог', 'почта', 'право',
  'пружина', 'пудра', 'пчела', 'разум', 'ранец', 'рукав', 'рубин', 'ружьё', 'рулон', 'ручка',
  'салат', 'санки', 'сахар', 'свеча', 'сетка', 'сироп', 'скала', 'склад', 'слива', 'слово',
  'смола', 'сокол', 'сосна', 'спорт', 'среда', 'сталь', 'стена', 'столб', 'стопа', 'струя',
  'судак', 'сумка', 'сушка', 'табак', 'тайна', 'танец', 'ткань', 'товар', 'трава', 'тропа',
  'труба', 'туфля', 'тыква', 'улица', 'ужин', 'факел', 'фишка', 'флора', 'фляга', 'фокус',
  'форма', 'фрукт', 'халат', 'хвост', 'химия', 'хобот', 'холод', 'хомяк', 'цапля', 'цена',
  'чайка', 'число', 'чулок', 'шапка', 'шарик', 'шахта', 'шкаф', 'шквал', 'шорох', 'щенок',
  'экран', 'эпоха', 'юноша', 'ягода', 'якорь', 'ясень',
].filter(w => w.length === 5);

const KEYS = ['йцукенгшщзхъ', 'фывапролджэ', 'ячсмитьбю'];
const norm = s => s.toLowerCase().replace(/ё/g, 'е').trim();
const DICT = [...new Set(WORDS.map(norm))].filter(w => /^[а-я]{5}$/.test(w));

export default {
  winTitle: 'Слово угадано!',
  init(api) {
    let target, tries, guesses, states, cur, keys, over, won, revealRow, revealT, shakeT, streak, cellS, bx, by, kbY, kbH;

    function layout() {
      cellS = Math.floor(Math.min(api.W * 0.16, (api.H - 210) / 6.6));
      bx = (api.W - cellS * 5 - 4 * 6) / 2;
      by = 34;
      kbH = Math.min(52, api.H * 0.075);
      kbY = api.H - kbH * 3 - 26;
      keys = [];
      KEYS.forEach((row, ri) => {
        const n = row.length;
        const w = (api.W - 16) / n;
        [...row].forEach((ch, ci) => keys.push({ ch, x: 8 + ci * w, y: kbY + ri * kbH, w, h: kbH - 5, row: ri }));
      });
      keys.push({ ch: '⌫', x: api.W - 8 - ((api.W - 16) / KEYS[2].length) * 1.4, y: kbY + 2 * kbH, w: ((api.W - 16) / KEYS[2].length) * 1.4, h: kbH - 5, special: 'del' });
      keys.push({ ch: '➜', x: 8, y: kbY + 2 * kbH, w: ((api.W - 16) / KEYS[2].length) * 1.4, h: kbH - 5, special: 'enter' });
      // подвинуть последний ряд, чтобы кнопки влезли
      const w3 = (api.W - 16 - 2 * ((api.W - 16) / KEYS[2].length) * 1.4) / KEYS[2].length;
      keys.filter(k => k.row === 2 && !k.special).forEach((k, i) => {
        k.x = 8 + ((api.W - 16) / KEYS[2].length) * 1.4 + i * w3; k.w = w3;
      });
    }

    function reset() {
      layout();
      target = norm(M.pick(DICT));
      tries = 0; guesses = []; states = []; cur = '';
      over = false; won = false; revealRow = -1; revealT = 0; shakeT = 0;
      streak = api.Store.get('wordle_streak', 0) || 0;
      api.score(0);
    }

    function grade(guess) {
      const res = Array(5).fill(0);
      const t = [...target], g = [...guess];
      for (let i = 0; i < 5; i++) if (g[i] === t[i]) { res[i] = 2; t[i] = null; g[i] = '*'; }
      for (let i = 0; i < 5; i++) {
        if (g[i] === '*') continue;
        const k = t.indexOf(g[i]);
        if (k >= 0) { res[i] = 1; t[k] = null; }
      }
      return res;
    }

    function submit() {
      if (over) return;
      if (cur.length < 5) { shakeT = 0.4; Sound.blip(150); return; }
      if (!DICT.includes(cur)) { shakeT = 0.4; Sound.bad(); return; }
      const st = grade(cur);
      guesses.push(cur); states.push(st);
      revealRow = tries; revealT = 0;
      tries++;
      cur = '';
      Sound.blip(460);
    }

    function finishRow() {
      const st = states[revealRow];
      const won_ = st.every(v => v === 2);
      st.forEach((v, i) => {
        if (v === 2) Sound.tone(500 + i * 90, 0.09, 'triangle', 0.14);
        const [x, y] = cellPos(revealRow, i);
        api.emit(x + cellS / 2, y + cellS / 2, { n: v ? 8 : 2, color: v === 2 ? '#5a9e4b' : v === 1 ? '#b59a2a' : '#555', speedMax: 170, life: 0.5 });
      });
      if (won_) {
        won = true; over = true;
        streak++; api.Store.set('wordle_streak', streak);
        api.Store.set('wordle_wins', (api.Store.get('wordle_wins', 0) || 0) + 1);
        const s = (7 - tries) * 150 + streak * 40;
        api.score(s); Sound.win();
        setTimeout(() => api.win(s), 900);
      } else if (tries >= 6) {
        over = true; streak = 0; api.Store.set('wordle_streak', 0);
        Sound.bad();
        setTimeout(() => api.over(0), 900);
      }
      revealRow = -1;
    }

    function cellPos(row, i) {
      return [bx + i * (cellS + 6), by + row * (cellS + 6)];
    }

    function tapAt(x, y) {
      if (over) return;
      for (const k of keys) {
        if (x >= k.x && x <= k.x + k.w && y >= k.y && y <= k.y + k.h) {
          if (k.special === 'del') { cur = cur.slice(0, -1); Sound.click(); }
          else if (k.special === 'enter') submit();
          else if (cur.length < 5) { cur += k.ch; Sound.blip(600); }
          return;
        }
      }
      // тап по полю = ввод буквы? нет — просто отклик
    }

    function update(dt) {
      shakeT = Math.max(0, shakeT - dt);
      if (revealRow >= 0) {
        revealT += dt;
        if (revealT > 0.16 * 5 + 0.25) finishRow();
      }
      const i = api.input;
      for (const e of i.events) if (e.type === 'tap') tapAt(e.x, e.y);
      if (i.pressed.b) submit();
      api.setHud(`попытка <b style="color:#5a9e4b">${Math.min(tries + (cur ? 1 : 0), 6)}</b>/6 · серия 🔥${streak} · слов в словаре ${DICT.length}`);
    }

    function draw(c) {
      const W = api.W, H = api.H;
      c.fillStyle = '#141428'; c.fillRect(0, 0, W, H);
      c.textAlign = 'center';
      c.fillStyle = '#eaeaff'; c.font = `900 ${Math.round(W * 0.05)}px system-ui`;
      c.fillText('СЛОВОДЕЛ', W / 2, 24);

      const shakeX = shakeT > 0 ? Math.sin(shakeT * 60) * 6 : 0;
      for (let row = 0; row < 6; row++) {
        for (let i = 0; i < 5; i++) {
          const [x0, y0] = cellPos(row, i);
          const x = x0 + (row === tries && shakeT > 0 ? shakeX : 0), y = y0;
          let bg = 'transparent', fg = '#eaeaff', ch = '';
          const done = row < states.length;
          if (done) {
            const st = states[row][i];
            bg = st === 2 ? '#5a9e4b' : st === 1 ? '#b59a2a' : '#3a3a4a';
            ch = guesses[row][i];
            if (revealRow === row) {
              const k = M.clamp((revealT - i * 0.16) / 0.25, 0, 1);
              c.save();
              c.translate(x + cellS / 2, y + cellS / 2);
              c.scale(1, Math.abs(Math.cos(k * Math.PI / 2)) || 0.02);
              c.translate(-(x + cellS / 2), -(y + cellS / 2));
              drawCell(c, x, y, bg, fg, ch);
              c.restore();
              continue;
            }
          } else if (row === tries) {
            ch = cur[i] || '';
            bg = ch ? '#2a2a4a' : 'transparent';
          }
          drawCell(c, x, y, bg, fg, ch);
        }
      }

      // клавиатура
      const used = {};
      states.forEach((st, ri) => st.forEach((v, i) => {
        const ch = guesses[ri][i];
        used[ch] = Math.max(used[ch] || 0, v);
      }));
      for (const k of keys) {
        const st = k.special ? null : used[k.ch];
        const bg = k.special ? '#2a2a4a' : st === 2 ? '#5a9e4b' : st === 1 ? '#b59a2a' : st === 0 ? '#26262e' : '#3a3a55';
        c.fillStyle = bg;
        M.roundRect(c, k.x + 1.5, k.y, k.w - 3, k.h, 6); c.fill();
        c.fillStyle = st === 0 ? '#777' : '#fff';
        c.font = `${k.special ? 700 : 800} ${Math.round(k.h * (k.special ? 0.4 : 0.46))}px system-ui`;
        c.textAlign = 'center'; c.textBaseline = 'middle';
        c.fillText(k.ch.toUpperCase(), k.x + k.w / 2, k.y + k.h / 2 + 1);
      }
      c.textBaseline = 'alphabetic';
      if (over) {
        c.fillStyle = 'rgba(0,0,0,.45)'; c.fillRect(0, 0, W, by + 6 * (cellS + 6) + 10);
        c.fillStyle = won ? '#8ee06b' : '#ff8fa3';
        c.font = `900 ${Math.round(W * 0.06)}px system-ui`; c.textAlign = 'center';
        c.fillText(won ? 'УГАДАЛ!' : `было слово «${target.toUpperCase()}»`, W / 2, by + 3 * (cellS + 6));
      }
    }

    function drawCell(c, x, y, bg, fg, ch) {
      if (bg !== 'transparent') {
        c.fillStyle = bg;
        M.roundRect(c, x, y, cellS, cellS, 8); c.fill();
      }
      c.strokeStyle = 'rgba(255,255,255,.22)'; c.lineWidth = 2;
      M.roundRect(c, x, y, cellS, cellS, 8); c.stroke();
      if (ch) {
        c.fillStyle = fg;
        c.font = `900 ${Math.round(cellS * 0.56)}px system-ui`;
        c.textAlign = 'center'; c.textBaseline = 'middle';
        c.fillText(ch.toUpperCase(), x + cellS / 2, y + cellS / 2 + 1);
        c.textBaseline = 'alphabetic';
      }
    }

    return { reset, update, draw, resize: () => layout() };
  },
};
