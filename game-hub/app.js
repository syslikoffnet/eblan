/* ===================== EBLAN BOX — хаб ===================== */
import { GAMES, TAGS, AKA } from './games/index.js';
import { Shell, Store, Sound } from './engine.js';

const $ = s => document.querySelector(s);

/* транслитерация: ищем и «флаппи», и «flappy» */
const TR = { 'а': 'a', 'б': 'b', 'в': 'v', 'г': 'g', 'д': 'd', 'е': 'e', 'ё': 'e', 'ж': 'zh', 'з': 'z',
  'и': 'i', 'й': 'y', 'к': 'k', 'л': 'l', 'м': 'm', 'н': 'n', 'о': 'o', 'п': 'p', 'р': 'r', 'с': 's',
  'т': 't', 'у': 'u', 'ф': 'f', 'х': 'h', 'ц': 'c', 'ч': 'ch', 'ш': 'sh', 'щ': 'sch', 'ъ': '', 'ы': 'y',
  'ь': '', 'э': 'e', 'ю': 'yu', 'я': 'ya', 'і': 'i', 'ї': 'i', 'є': 'e', 'ґ': 'g' };
const tr = s => [...String(s).toLowerCase()].map(ch => (ch in TR ? TR[ch] : ch)).join('');
const fuzzy = (blob, q) => {
  const b = blob.toLowerCase(), n = q.toLowerCase();
  return b.includes(n) || tr(b).includes(tr(n)) || tr(b).includes(n) || b.includes(tr(n));
};
const $$ = s => [...document.querySelectorAll(s)];
const el = (t, c, h) => { const e = document.createElement(t); if (c) e.className = c; if (h != null) e.innerHTML = h; return e; };

let SOURCES = null, sourcesFilter = 'stars', sourcesQuery = '', sourcesShown = 60, activeTag = null;
let shell = null, currentGame = null;

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
    if (tab === 'src') { $('#view-src').hidden = false; loadSources(); }
    else if (tab === 'about') { $('#view-about').hidden = false; renderAbout(); }
    else { $('#view-home').hidden = false; }
  }
  window.scrollTo({ top: 0, behavior: 'instant' });
}
window.addEventListener('hashchange', route);

function destroyShell() { if (shell) { shell.destroy(); shell = null; currentGame = null; } }

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
    <span class="stat">новых рекордов <b>${totalRec}</b></span>
    <span class="stat">исходников в базе <b id="stat-src">…</b></span>`;
  ensureSources().then(d => { const e = $('#stat-src'); if (e) e.textContent = d.length; });
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
async function showPlay(id) {
  const meta = GAMES.find(g => g.id === id);
  if (!meta) { go('home'); return; }
  $('#view-play').hidden = false;
  $('#play-title').textContent = `${meta.emoji} ${meta.title}`;
  $('#play-info').hidden = true;
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
    onEnd: () => { renderGrid(); renderStats(); renderSourcesFor(meta); },
  });
  currentGame = meta;
  renderSourcesFor(meta);
}

async function renderSourcesFor(meta) {
  const box = $('#play-info');
  const data = await ensureSources();
  const kws = (meta.srcKeywords || [meta.title]).map(s => s.toLowerCase());
  const found = (data || []).filter(r => {
    const blob = ((r.description || '') + ' ' + r.full_name + ' ' + (r.topics || []).join(' ')).toLowerCase();
    return kws.some(k => blob.includes(k));
  }).slice(0, 5);
  let html = `<h3>${meta.emoji} ${meta.title}</h3><p>${meta.desc || meta.sub}</p>`;
  html += `<p style="margin-bottom:4px"><b style="color:var(--txt)">Управление:</b> ${meta.hint || ''}</p>`;
  if (found.length) {
    html += `<h3 style="margin-top:14px">📦 Открытые исходники этой игры</h3>`;
    html += found.map(r => {
      const img = r.shot ? `data/shots/${r.shot}` : (r.images && r.images[0]);
      return `<div class="src-mini">
        ${img ? `<img src="${img}" alt="" loading="lazy" onerror="this.remove()">` : ''}
        <div>
          <a href="${r.url}" target="_blank" rel="noopener">${r.full_name}</a>
          <span class="badge">★ ${r.stars}</span> ${r.language ? `<span class="badge">${r.language}</span>` : ''}
          <p>${escapeHtml(r.description || '')}</p>
        </div>
      </div>`;
    }).join('');
  } else {
    html += `<p style="margin-top:10px">📦 Исходники: открой вкладку «Исходники» — там ${(data || []).length} репозиториев с GitHub.</p>`;
  }
  box.innerHTML = html;
  box.hidden = false;
}
$('#btn-info').onclick = () => {
  const b = $('#play-info'); b.hidden = !b.hidden;
  if (!b.hidden) b.scrollIntoView({ behavior: 'smooth', block: 'start' });
};
$('#btn-back').onclick = () => go('home');

/* ---------- исходники с GitHub ---------- */
async function ensureSources() {
  if (SOURCES) return SOURCES;
  try {
    const r = await fetch('data/sources.json');
    if (!r.ok) throw 0;
    SOURCES = await r.json();
  } catch { SOURCES = []; }
  return SOURCES;
}

function escapeHtml(s) {
  return (s || '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

async function loadSources() {
  const data = await ensureSources();
  const box = $('#src-list');
  if (!data.length) {
    box.innerHTML = '';
    $('#src-stats').textContent = '';
    box.appendChild(el('div', 'ov-card', `<div class="ov-emoji">📡</div>
      <h2 style="font-size:18px">База исходников ещё не подложена</h2>
      <p class="ov-sub">Запусти сборщик: <code>python3 mobile-games-catalog/collect.py</code>,
      затем <code>python3 game-hub/tools/build_sources.py</code></p>`));
    return;
  }
  const q = ($('#sq').value || '').trim().toLowerCase();
  let list = data.filter(r => {
    if (q) {
      const blob = r.full_name + ' ' + (r.description || '') + ' ' + (r.topics || []).join(' ') +
        ' ' + (r.genres || []).join(' ') + ' ' + (r.engines || []).join(' ') + ' ' + (r.language || '');
      if (!fuzzy(blob, q)) return false;
    }
    if (sourcesFilter === 'apk') return (r.apk_links || []).length || (r.play_store || []).length;
    if (sourcesFilter === 'shots') return (r.images || []).length || r.shot;
    if (sourcesFilter === 'build') return r.buildable_hint;
    if (sourcesFilter === 'fresh') return r.pushed >= '2024-01-01';
    return true;
  });
  if (sourcesFilter === 'fresh') list = list.sort((a, b) => (b.pushed || '').localeCompare(a.pushed || ''));
  else list = list.sort((a, b) => b.stars - a.stars);

  const langs = {};
  list.forEach(r => { if (r.language) langs[r.language] = (langs[r.language] || 0) + 1; });
  const topLangs = Object.entries(langs).sort((a, b) => b[1] - a[1]).slice(0, 6);
  $('#src-stats').innerHTML =
    `Найдено <b style="color:var(--acc2)">${list.length}</b> репозиториев · ` +
    `в базе всего <b>${data.length}</b> · со скринами <b>${data.filter(r => r.images?.length || r.shot).length}</b> · ` +
    `языки: ${topLangs.map(([l, n]) => `${l} ${n}`).join(', ')}`;

  box.innerHTML = '';
  list.slice(0, sourcesShown).forEach(r => box.appendChild(repoCard(r)));
  $('#src-more').hidden = list.length <= sourcesShown;
  $('#src-more').onclick = () => { sourcesShown += 60; loadSources(); };
}

function repoCard(r) {
  const img = r.shot ? `data/shots/${r.shot}` : (r.images && r.images[0]);
  const c = el('div', 'rcard');
  const tags = [...(r.genres || []).slice(0, 3), ...(r.engines || []).slice(0, 2)]
    .map(t => `<span class="tag g">${escapeHtml(t)}</span>`).join('');
  c.innerHTML = `
    ${img
      ? `<img class="rshot" src="${img}" alt="" loading="lazy" onerror="this.outerHTML='<div class=\\'rshot ph\\'>🎮</div>'">`
      : `<div class="rshot ph">🎮</div>`}
    <div class="rbody">
      <a class="rname" href="${r.url}" target="_blank" rel="noopener">${escapeHtml(r.full_name)}</a>
      <p class="rdesc">${escapeHtml(r.description || '— без описания —')}</p>
      ${r.blurb ? `<p class="rdesc" style="opacity:.75">${escapeHtml(r.blurb.slice(0, 180))}</p>` : ''}
      <div class="rmeta">
        <span class="badge hot">★ ${r.stars}</span>
        ${r.language ? `<span class="badge l">${escapeHtml(r.language)}</span>` : ''}
        ${r.license ? `<span class="badge">${escapeHtml(r.license)}</span>` : ''}
        ${r.buildable_hint ? '<span class="badge new">🔧 собирается</span>' : ''}
        ${(r.play_store || []).length ? '<span class="badge new">▶ Play Market</span>' : ''}
        ${(r.apk_links || []).length ? '<span class="badge new">📦 APK</span>' : ''}
        ${r.archived ? '<span class="badge">🗄 архив</span>' : ''}
        <span class="badge">${(r.pushed || '').slice(0, 7)}</span>
      </div>
      <div class="rtags">${tags}</div>
      ${r.play_store?.length ? `<a class="badge" style="color:var(--acc2);text-decoration:none" target="_blank" rel="noopener" href="https://play.google.com/store/apps/details?id=${r.play_store[0]}">открыть в Play Market</a>` : ''}
    </div>`;
  return c;
}

function renderSrcChips() {
  const box = $('#src-chips'); box.innerHTML = '';
  const presets = [
    ['Все', ''], ['Клоны', 'clone'], ['Головоломки', 'puzzle'], ['Аркады', 'arcade'],
    ['Android', 'android'], ['iOS', 'ios'], ['Unity', 'unity'], ['libGDX', 'libgdx'],
    ['Godot', 'godot'], ['Flutter', 'flutter'], ['Kotlin', 'kotlin'], ['Java', 'java'],
    ['Swift', 'swift'], ['C++', 'c++'], ['Python', 'python'], ['JS', 'javascript'],
  ];
  presets.forEach(([label, kw]) => {
    const c = el('button', 'chip', label);
    c.onclick = () => { $('#sq').value = kw; sourcesShown = 60; loadSources(); Sound.click(); };
    box.appendChild(c);
  });
}

/* ---------- о проекте ---------- */
function renderAbout() {
  const done = GAMES.filter(g => LOADED.has(g.file)).length;
  $('#about-body').innerHTML = `
    <h3>Что это</h3>
    <p><b style="color:var(--txt)">EBLAN BOX</b> — ${GAMES.length} мобильных игр в одном приложении.
    Никаких сторов: открыл → играешь. Всё офлайн, прогресс и рекорды хранятся на устройстве.</p>
    <h3>Как поставить на телефон (1 минута)</h3>
    <ul>
      <li><b>Android/Chrome:</b> открой ссылку-превью → меню ⋮ → «Установить приложение» / «Добавить на главный экран». Появится иконка, запуск в полноэкранном режиме.</li>
      <li><b>iPhone/Safari:</b> «Поделиться» → «На экран Домой».</li>
      <li>После первой загрузки работает без интернета (service worker кэширует всё).</li>
    </ul>
    <h3>Настоящий APK одной командой</h3>
    <p>В песочнице нет JDK/Android SDK, поэтому APK собирается у тебя на машине. Всё уже приготовлено в
    <code>android-pack/</code>:</p>
    <pre>npm i -g @capacitor/cli
cd android-pack
npm install
npx cap add android
npx cap sync
npx cap open android   # → Build APK в Android Studio</pre>
    <h3>Исходники игр (вкладка «Исходники»)</h3>
    <p>База собрана живьём из GitHub API: описания, звёзды, языки, лицензии, темы, скриншоты из README,
    ссылки на Play Market и APK. Файлы:
    <code>mobile-games-catalog/data/catalog.json</code> и <code>catalog.csv</code>,
    собранные скриншоты — в <code>mobile-games-catalog/data/images/</code>.</p>
    <h3>Управление</h3>
    <ul>
      <li>Палец: тап, свайп, драг — как написано в подсказке каждой игры.</li>
      <li>Клавиатура: стрелки/WASD, <code>Space</code> — действие, <code>B</code>/<code>X</code> — вторая кнопка, <code>Esc</code> — пауза.</li>
      <li>В играх с кнопками внизу экрана кнопки дублируют свайпы.</li>
    </ul>
    <h3>Стек</h3>
    <p>Чистый JS + Canvas 2D, без сборщиков и зависимостей. Общий движок —
    <code>engine.js</code> (цикл, ввод, звук на WebAudio, частицы, рекорды).
    Каждая игра — один модуль в <code>games/</code> (~150–300 строк).</p>
  `;
}
const LOADED = new Set();

/* ---------- события витрины ---------- */
$('#q').oninput = () => renderGrid();
$('#sort').onchange = () => renderGrid();
$('#sq').oninput = () => { sourcesShown = 60; loadSources(); };
$('#sfilter').onchange = e => { sourcesFilter = e.target.value; sourcesShown = 60; loadSources(); };
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
renderSrcChips();
route();
if (!location.hash) go('home');
$('#hero-sub').textContent =
  `${GAMES.length} игр, ${new Set(GAMES.flatMap(g => g.tags)).size} жанров, один файл-хаб. Офлайн, без рекламы.`;
