/* EBLAN BOX — витрина и запуск игр. Ничего лишнего: только игры. */
import { GAMES, TAGS, AKA } from './games/index.js';
import { Shell, Store, Sound } from './engine.js';
import { Net } from './net.js';

/* игры с сетевым режимом */
const NETGAMES = new Set(['tictactoe', 'connect4', 'reversi']);

const $ = s => document.querySelector(s);
/* транслит: понимаем и «флаппи», и «flappy» */
const TR = { а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z', и: 'i', й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'h', ц: 'c', ч: 'ch', ш: 'sh', щ: 'sch', ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya' };
const tr = s => s.split('').map(ch => TR[ch] !== undefined ? TR[ch] : ch).join('');
const fuzzy = (blob, q) => {
  const b = blob.toLowerCase(), n = q.toLowerCase();
  return b.includes(n) || tr(b).includes(tr(n)) || tr(b).includes(n) || b.includes(tr(n));
};
const $$ = s => [...document.querySelectorAll(s)];
const el = (t, c, h) => { const e = document.createElement(t); if (c) e.className = c; if (h != null) e.innerHTML = h; return e; };

let activeTag = null;
let shell = null;

/* ---------- тост ---------- */
let toastT;
function toast(msg) {
  const t = $('#toast'); t.textContent = msg; t.classList.add('show');
  clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), 2600);
}

/* ---------- роутер ---------- */
function go(tab, arg) {
  location.hash = arg ? `#/${tab}/${arg}` : `#/${tab}`;
}
function route() {
  const parts = location.hash.replace(/^#\//, '').split('/');
  const tab = parts[0] || 'home';
  const arg = parts[1];
  $$('.view').forEach(v => v.hidden = true);
  $$('.tab').forEach(t => t.classList.toggle('on', t.dataset.tab === tab));
  if (tab === 'play' && arg) showPlay(arg);
  else {
    destroyShell();
    $('#view-home').hidden = false;
  }
  window.scrollTo({ top: 0, behavior: 'instant' });
}
window.addEventListener('hashchange', route);

function destroyShell() { if (shell) { shell.destroy(); shell = null; } }

/* ---------- витрина игр ---------- */
function cardFor(g) {
  const best = Store.best(g.id), plays = Store.get('plays_' + g.id, 0);
  const c = el('div', 'gcard');
  c.dataset.id = g.id;
  const [c1, c2] = g.palette || ['#7c5cff', '#00e5c0'];
  c.innerHTML = `
    <div class="gcover" style="background:
      radial-gradient(120% 90% at 20% 10%, ${c1}55, transparent 60%),
      linear-gradient(150deg, ${c2}, ${c1});">
      <span>${g.emoji}</span>
    </div>
    <p class="gtitle">${g.title}</p>
    <p class="gsub">${g.sub}</p>
    <div class="gmeta">
      ${NETGAMES.has(g.id) ? '<span class="badge net">🌐 сеть</span>' : ''}
      ${g.hot ? '<span class="badge hot">ХИТ</span>' : ''}
      ${plays > 0 ? `<span class="badge">▶ ${plays}</span>` : ''}
      ${best ? `<span class="best">🏆 ${best}</span>` : ''}
    </div>`;
  c.onclick = () => { Sound.click(); go('play', g.id); };
  return c;
}

function renderGrid() {
  const q = ($('#q').value || '').trim().toLowerCase();
  const sort = $('#sort').value;
  const grid = $('#grid');
  grid.innerHTML = '';
  let list = GAMES.filter(g => {
    if (activeTag && !g.tags.includes(activeTag)) return false;
    if (!q) return true;
    return fuzzy(g.title + ' ' + g.sub + ' ' + g.tags.join(' ') + ' ' + (g.desc || '') +
      ' ' + g.id + ' ' + (AKA[g.id] || ''), q);
  });
  if (sort === 'best') list = [...list].sort((a, b) => Store.best(b.id) - Store.best(a.id));
  else if (sort === 'plays') list = [...list].sort((a, b) => Store.get('plays_' + b.id, 0) - Store.get('plays_' + a.id, 0));
  else if (sort === 'az') list = [...list].sort((a, b) => a.title.localeCompare(b.title, 'ru'));
  list.forEach(g => grid.appendChild(cardFor(g)));
  $('#empty').hidden = list.length > 0;
}

function renderStats() {
  const plays = GAMES.reduce((a, g) => a + Store.get('plays_' + g.id, 0), 0);
  const records = GAMES.filter(g => Store.best(g.id) > 0).length;
  const totalRec = Store.get('records', 0);
  $('#stats').innerHTML = `
    <span class="stat">игр в хабе <b>${GAMES.length}</b></span>
    <span class="stat">партий сыграно <b>${plays}</b></span>
    <span class="stat">игр с рекордом <b>${records}</b></span>
    <span class="stat">новых рекордов <b>${totalRec}</b></span>`;
}

function renderChips() {
  const box = $('#chips'); box.innerHTML = '';
  const mk = (label, val) => {
    const c = el('button', 'chip' + (activeTag === val ? ' on' : ''), label);
    c.onclick = () => { activeTag = activeTag === val ? null : val; renderChips(); renderGrid(); Sound.click(); };
    box.appendChild(c);
  };
  mk('Все', null);
  TAGS.forEach(t => mk(t, t));
}

/* ---------- запуск игры ---------- */
let currentNet = null;   // активная сетевая сессия
async function showPlay(id, netSession) {
  const meta = GAMES.find(g => g.id === id);
  if (!meta) { go('home'); return; }
  if (netSession !== undefined) currentNet = netSession || null;
  $('#view-play').hidden = false;
  $('#play-title').textContent = `${meta.emoji} ${meta.title}`;
  const nb = $('#btn-net');
  nb.hidden = !NETGAMES.has(id);
  nb.textContent = currentNet ? '🌐✓' : '🌐';
  const stage = $('#stage');
  destroyShell();
  stage.innerHTML = '<div class="ov show"><div class="ov-card"><div class="ov-emoji">⏳</div><h2>Загрузка…</h2></div></div>';
  let mod;
  try {
    mod = await import('./games/' + meta.file);
  } catch (e) {
    stage.innerHTML = '';
    stage.appendChild(el('div', 'ov show', `<div class="ov-card"><div class="ov-emoji">🛠️</div>
      <h2>Игра ещё не готова</h2><p class="ov-hint">${meta.title} в разработке — загляни позже.</p>
      <button class="btn primary" onclick="location.hash='#/home'">← В меню</button></div>`));
    console.error(e);
    return;
  }
  const def = { ...meta, ...(mod.default || {}) };
  def.id = meta.id;
  shell = new Shell(stage, def, {
    onExit: () => go('home'),
    onEnd: () => { renderGrid(); renderStats(); },
    net: currentNet,
  });
}
$('#btn-back').onclick = () => { if (currentNet) { currentNet.close(); currentNet = null; } go('home'); };

/* ---------- сеть: комнаты по коду ---------- */
const netModal = () => $('#net-modal');
function netOpen(gameId) {
  netModal().hidden = false;
  $('#net-code-box').hidden = true;
  $('#net-status').textContent = 'ждём соперника… дай ему этот код';
  $('#net-code-in').value = '';
  if (Net.nick()) showNetMain(); else { $('#net-nick-box').hidden = false; $('#net-main').hidden = true; }
  netModal()._game = gameId;
}
function showNetMain() {
  $('#net-nick-box').hidden = true; $('#net-main').hidden = false;
  $('#net-nick-show').textContent = Net.nick();
}
$('#net-nick-save').onclick = () => {
  const v = ($('#net-nick').value || '').trim().slice(0, 12);
  if (!v) { toast('Введи ник'); return; }
  Net.setNick(v); showNetMain(); Sound.click();
};
$('#net-nick-edit').onclick = () => { $('#net-main').hidden = true; $('#net-nick-box').hidden = false; $('#net-nick').value = Net.nick(); };
$('#net-cancel').onclick = () => { netModal().hidden = true; };
$('#btn-net').onclick = () => { Sound.click(); netOpen(currentGameId()); };
function currentGameId() {
  const m = location.hash.match(/^#\/play\/(\w+)/); return m ? m[1] : null;
}
function netFail(msg) { $('#net-status').textContent = '⚠️ ' + msg; $('#net-code-box').hidden = false; $('#net-code').textContent = '----'; }
function netConnected(sess) {
  netModal().hidden = true;
  toast(`🌐 Подключено: ${sess.peerNick} · ты ${sess.side === 'host' ? 'хост' : 'гость'}`);
  showPlay(sess.game, sess);
}
function netCb(sess) {
  return ev => {
    if (ev.st === 'wait') { $('#net-code-box').hidden = false; $('#net-code').textContent = ev.code; }
    else if (ev.st === 'ok') netConnected(sess);
    else if (ev.st === 'err') netFail(ev.msg || 'ошибка сети');
    else if (ev.st === 'bye') {
      if (currentNet === sess) {
        currentNet = null; sess.close();
        toast('😔 Соперник отключился');
        showPlay(sess.game, null);
      }
    }
  };
}
$('#net-host').onclick = async () => {
  Sound.click();
  $('#net-code-box').hidden = false; $('#net-code').textContent = '…';
  $('#net-status').textContent = 'создаём комнату…';
  let cb = () => {};
  try {
    const sess = await Net.host(currentGameId(), ev => cb(ev));
    cb = netCb(sess);
  } catch (e) { netFail(e.message); }
};
$('#net-join').onclick = async () => {
  Sound.click();
  $('#net-status').textContent = 'подключаемся…';
  let cb = () => {};
  try {
    const sess = await Net.join(currentGameId(), $('#net-code-in').value, ev => cb(ev));
    cb = netCb(sess);
  } catch (e) { netFail(e.message); }
};

/* ---------- события витрины ---------- */
$('#q').oninput = () => renderGrid();
$('#sort').onchange = () => renderGrid();
$('#btn-home').onclick = () => { Sound.click(); go('home'); };
$('#btn-random').onclick = () => {
  Sound.power();
  go('play', GAMES[Math.floor(Math.random() * GAMES.length)].id);
};
$$('.tab').forEach(t => t.onclick = () => { Sound.click(); go(t.dataset.tab); });
$('#btn-sound').onclick = e => { e.target.textContent = Sound.toggle() ? '🔇' : '🔊'; };
$('#games-count').textContent = GAMES.length + ' игр';

/* ---------- PWA ---------- */
let deferredPrompt = null;
window.addEventListener('beforeinstallprompt', e => {
  e.preventDefault(); deferredPrompt = e; $('#btn-install').hidden = false;
});
$('#btn-install').onclick = async () => {
  if (!deferredPrompt) { toast('В браузере: меню ⋮ → «Установить приложение»'); return; }
  deferredPrompt.prompt();
  const { outcome } = await deferredPrompt.userChoice;
  if (outcome === 'accepted') toast('Установлено! Ищи иконку EBLAN BOX');
  deferredPrompt = null; $('#btn-install').hidden = true;
};
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}
document.addEventListener('pointerdown', () => Sound.unlock(), { once: true });

/* ---------- старт ---------- */
renderChips();
renderStats();
renderGrid();
route();
if (!location.hash) go('home');
$('#hero-sub').textContent =
  `${GAMES.length} игр, ${new Set(GAMES.flatMap(g => g.tags)).size} жанров, один файл-хаб. Офлайн, без рекламы.`;
