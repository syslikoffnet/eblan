 /* Блэкджек (21) */
import { M, Sound } from '../engine.js';

const SUITS = ['♠', '♥', '♦', '♣'];
const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];

export default {
  winTitle: 'Блэкджек!',
  init(api) {
    let deck, player, dealer, phase, cash, bet, msg, msgT, deal, cw, ch, hands, wins, dead;

    function buildDeck() {
      deck = [];
      for (let d = 0; d < 4; d++) for (const s of SUITS) for (const r of RANKS) {
        deck.push({ s, r, v: r === 'A' ? 11 : ['J', 'Q', 'K'].includes(r) ? 10 : +r });
      }
      M.shuffle(deck);
    }

    function val(hand) {
      let sum = hand.reduce((a, c) => a + c.v, 0);
      let aces = hand.filter(c => c.r === 'A').length;
      while (sum > 21 && aces > 0) { sum -= 10; aces--; }
      return sum;
    }

    function reset() {
      buildDeck();
      cash = 500; bet = 25; hands = 0; wins = 0; dead = false;
      cw = Math.min(api.W * 0.2, 84); ch = cw * 1.42;
      newHand();
      api.score(cash);
    }

    function newHand() {
      player = []; dealer = []; phase = 'bet'; msg = 'ставь и жми «раздать»'; msgT = 99;
      deal = 0;
      api.setHud(`фишки <b style="color:#ffd43b">${cash}</b> · ставка ${bet} · побед ${wins}/${hands}`);
    }

    function draw_() {
      if (deck.length < 15) buildDeck();
      return deck.pop();
    }

    function startDeal() {
      if (cash < bet) { bet = Math.max(10, cash); }
      if (cash < 10) { dead = true; setTimeout(() => api.over(cash), 800); return; }
      cash -= bet; api.score(cash);
      hands++;
      player = [draw_(), draw_()]; dealer = [draw_(), draw_()];
      phase = 'deal'; deal = 0;
      Sound.blip(500);
      if (val(player) === 21) {
        msg = 'БЛЭКДЖЕК! 3:2'; Sound.power();
        phase = 'pay'; cash += Math.round(bet * 2.5); wins++;
        api.score(cash);
        setTimeout(() => { Sound.win(); api.win(cash); }, 1400);
        return;
      }
      setTimeout(() => { phase = 'player'; msg = 'ещё или хватит?'; }, 500);
    }

    function hit() {
      if (phase !== 'player') return;
      player.push(draw_()); Sound.blip(620);
      const v = val(player);
      if (v > 21) { msg = 'перебор!'; phase = 'pay'; Sound.bad(); api.shake(8, 0.3); settle(); }
      else if (v === 21) stand();
    }

    function stand() {
      if (phase !== 'player') return;
      phase = 'dealer'; Sound.blip(400);
      setTimeout(dealerPlay, 450);
    }

    function dealerPlay() {
      while (val(dealer) < 17) { dealer.push(draw_()); Sound.blip(340); }
      settle();
    }

    function settle() {
      const p = val(player), d = val(dealer);
      phase = 'pay';
      if (p > 21) { msg = `ты перебрал (${p})`; }
      else if (d > 21) { msg = `дилер перебрал (${d}) — ты выиграл!`; cash += bet * 2; wins++; Sound.coin(); }
      else if (p > d) { msg = `${p} против ${d} — победа!`; cash += bet * 2; wins++; Sound.coin(); }
      else if (p === d) { msg = `пуш (${p}) — ставка назад`; cash += bet; Sound.blip(420); }
      else { msg = `${p} против ${d} — дилер забрал`; Sound.bad(); }
      api.score(cash);
      msgT = 3;
      setTimeout(() => {
        if (cash < 10) { dead = true; api.over(cash); }
        else newHand();
      }, 2200);
    }

    function tapAt(x, y) {
      const W = api.W, H = api.H;
      if (phase !== 'bet') return;
      // фишки ставок внизу
      const chips = [10, 25, 50, 100];
      const cw2 = W / (chips.length + 1);
      chips.forEach((v, i) => {
        const cxp = cw2 * (i + 0.75), cyp = H - 46;
        if (Math.hypot(x - cxp, y - cyp) < cw2 * 0.42 && cash >= v) {
          bet = Math.min(v, cash); Sound.click();
          msg = `ставка ${bet}`;
        }
      });
      // кнопка «раздать»
      if (y > H * 0.62 && y < H * 0.8 && Math.abs(x - W / 2) < W * 0.3) startDeal();
    }

    function update(dt) {
      msgT = Math.max(0, msgT - dt);
      const i = api.input;
      for (const e of i.events) if (e.type === 'tap') tapAt(e.x, e.y);
      if (i.pressed.a) { if (phase === 'bet') startDeal(); else if (phase === 'player') hit(); }
      if (i.pressed.b) {
        if (phase === 'player') stand();
        else if (phase === 'bet') { bet = Math.min(cash, bet * 2); msg = `ставка ${bet}`; Sound.click(); }
      }
      api.setHud(`фишки <b style="color:#ffd43b">${cash}</b> · ставка ${bet} · A/тап — ещё · B — хватит`);
    }

    function card(c, cd, x, y, hidden, k = 1) {
      c.save(); c.translate(x, y); c.scale(k, k);
      c.shadowColor = 'rgba(0,0,0,.5)'; c.shadowBlur = 12; c.shadowOffsetY = 4;
      c.fillStyle = hidden ? '#7c5cff' : '#fdfdf7';
      M.roundRect(c, -cw / 2, -ch / 2, cw, ch, 8); c.fill();
      c.shadowBlur = 0; c.shadowOffsetY = 0;
      c.strokeStyle = 'rgba(0,0,0,.25)'; c.lineWidth = 2; c.stroke();
      if (hidden) {
        c.strokeStyle = 'rgba(255,255,255,.35)'; c.lineWidth = 2;
        for (let i = -3; i < 4; i++) { c.beginPath(); c.moveTo(i * 8 - 12, -ch / 2 + 6); c.lineTo(i * 8 + 12, ch / 2 - 6); c.stroke(); }
      } else {
        const red = cd.s === '♥' || cd.s === '♦';
        c.fillStyle = red ? '#d61f45' : '#1a1a2e';
        c.textAlign = 'left'; c.font = `900 ${Math.round(cw * 0.26)}px system-ui`;
        c.fillText(cd.r, -cw / 2 + 8, -ch / 2 + cw * 0.3);
        c.font = `${Math.round(cw * 0.26)}px system-ui`;
        c.fillText(cd.s, -cw / 2 + 8, -ch / 2 + cw * 0.56);
        c.textAlign = 'center'; c.font = `${Math.round(cw * 0.55)}px system-ui`;
        c.fillText(cd.s, 0, ch * 0.16);
      }
      c.restore();
    }

    function hand(c, hand_, cx, cy, hideFirst) {
      const step = cw * 0.42;
      const total = (hand_.length - 1) * step;
      hand_.forEach((cd, i) => {
        card(c, cd, cx - total / 2 + i * step, cy + i * 4, hideFirst && i === 1);
      });
    }

    function draw(c) {
      const W = api.W, H = api.H;
      const g = c.createRadialGradient(W / 2, H * 0.45, 20, W / 2, H * 0.5, H * 0.8);
      g.addColorStop(0, '#1f7a4d'); g.addColorStop(1, '#08210f');
      c.fillStyle = g; c.fillRect(0, 0, W, H);
      c.strokeStyle = 'rgba(255,255,255,.12)'; c.lineWidth = 6;
      c.beginPath(); c.arc(W / 2, H * 0.5, Math.min(W, H) * 0.46, 0, 7); c.stroke();

      c.textAlign = 'center';
      c.fillStyle = 'rgba(255,255,255,.6)'; c.font = `700 ${Math.round(W * 0.035)}px system-ui`;
      c.fillText('ДИЛЕР', W / 2, H * 0.17);
      if (dealer.length) {
        c.fillStyle = '#ffd43b'; c.font = `900 ${Math.round(W * 0.05)}px system-ui`;
        const show = phase === 'pay' || phase === 'dealer' ? val(dealer) : val([dealer[0]]);
        c.fillText(show, W / 2, H * 0.22);
        hand(c, dealer, W / 2, H * 0.32, phase === 'player' || phase === 'bet' || phase === 'deal');
      }
      c.fillStyle = 'rgba(255,255,255,.6)'; c.font = `700 ${Math.round(W * 0.035)}px system-ui`;
      c.fillText('ТЫ', W / 2, H * 0.46);
      if (player.length) {
        const v = val(player);
        c.fillStyle = v > 21 ? '#ff4d6d' : '#8ee06b'; c.font = `900 ${Math.round(W * 0.05)}px system-ui`;
        c.fillText(v, W / 2, H * 0.51);
        hand(c, player, W / 2, H * 0.61, false);
      }

      if (phase === 'bet') {
        c.fillStyle = 'rgba(0,0,0,.35)';
        M.roundRect(c, W * 0.2, H * 0.68, W * 0.6, H * 0.08, 12); c.fill();
        c.fillStyle = '#fff'; c.font = `900 ${Math.round(W * 0.05)}px system-ui`;
        c.fillText(`РАЗДАТЬ  (${bet})`, W / 2, H * 0.735);
        const chips = [10, 25, 50, 100];
        const cols = ['#e5e5e5', '#4dabf7', '#8ee06b', '#2b2b52'];
        const cw2 = W / (chips.length + 1);
        chips.forEach((v, i) => {
          const cxp = cw2 * (i + 0.75), cyp = H - 46;
          c.fillStyle = cash >= v ? cols[i] : 'rgba(255,255,255,.2)';
          c.beginPath(); c.arc(cxp, cyp, cw2 * 0.34, 0, 7); c.fill();
          c.strokeStyle = 'rgba(0,0,0,.3)'; c.lineWidth = 3;
          c.setLineDash([5, 5]); c.stroke(); c.setLineDash([]);
          c.fillStyle = cash >= v ? '#12240f' : '#888';
          c.font = `900 ${Math.round(cw2 * 0.24)}px system-ui`;
          c.fillText(v, cxp, cyp + cw2 * 0.09);
        });
      }
      if (msgT > 0 || phase === 'pay') {
        c.fillStyle = '#fff'; c.font = `900 ${Math.round(W * 0.052)}px system-ui`;
        c.textAlign = 'center';
        c.fillText(msg, W / 2, H * 0.86);
      }
    }

    return { reset, update, draw };
  },
};
