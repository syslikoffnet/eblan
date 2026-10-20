# 🎮 EBLAN BOX — куча игр в одном приложении + гора исходников с GitHub

Две большие вещи в одном репозитории:

| папка | что это |
|---|---|
| **`game-hub/`** | готовое приложение: **30 игр** в одном хабе (PWA, офлайн, ставится на телефон одним тапом) + встроенный каталог открытых исходников |
| **`mobile-games-catalog/`** | сборщик и база: **36 381 репозиторий** мобильных игр с GitHub: описания, звёзды, языки, лицензии, темы, жанры и движки из README, **3 558 ссылок на скриншоты**, скачанные файлы скриншотов, ссылки на Play Market и APK |
| `android-pack/` | упаковка `game-hub` в настоящий **Android APK** через Capacitor |
| `BlockDashLite.apk`, `_handsgod.mp3` | то, что уже лежало в репозитории |

---

## 1. Приложение: 30 игр, один файл-хаб

Чистый **JS + Canvas 2D**, ноль зависимостей, ноль сборки. Общий движок (`game-hub/engine.js`):
игровой цикл с фиксированным шагом, ввод (палец/свайп/клавиатура + экранные кнопки),
звук на WebAudio (без аудиофайлов), частицы, тряска экрана, рекорды в localStorage.
Каждая игра — один модуль в `game-hub/games/` (150–350 строк).

**Витрина:** `flappy` (Flappy Bird) · `snake` · `tetris` · `2048` · `breakout` (Арканоид) · `pong` ·
`invaders` (Space Invaders) · `pacman` (процедурный лабиринт + призраки на BFS) · `miner` (Сапёр) ·
`sudoku` (генератор с единственным решением) · `runner` (Geometry Dash/Dino) · `jumper` (Doodle Jump) ·
`asteroids` · `frogger` · `sokoban` (уровни проверены решателем) · `memory` · `simon` ·
`tictactoe` (минимакс) · `connect4` (минимакс, глубина 5) · `whack` · `match3` (Candy Crush: каскады, спец-конфеты) ·
`reversi` (Othello, минимакс) · `blackjack` · `bubble` (Bubble Shooter) · `wordle` (по-русски, 150 слов) ·
`stack` (Stack Tower) · `knife` (Knife Hit) · `aim` · `craft` (2D-Minecraft: генерация мира, руда, стройка) ·
`tank` (Battle City: ИИ врагов, бонусы, защита базы)

### Запуск
```bash
cd game-hub && python3 -m http.server 8080
# открой http://localhost:8080
```
На телефоне: открой адрес по HTTPS → меню браузера → **«Установить приложение» / «На экран Домой»**
(на iPhone: Поделиться → На экран Домой). `sw.js` кэширует всё — дальше работает офлайн.

### Тесты (без браузера)
```bash
cd game-hub
node tools/smoke.mjs              # гоняет каждую игру на 3 размерах экрана со случайным вводом, ловит NaN/исключения
FRAMES=40000 node tools/smoke.mjs # длинный фазз-прогон
```
Плюс DOM-тест на jsdom (витрина, поиск, вкладки, запуск всех 30 игр, пауза/выход) — `android-pack/README.md` описывает сборку APK.

---

## 2. Каталог исходников: 36 381 репозиторий

`mobile-games-catalog/collect.py` — сборщик на GitHub API (поиск по темам/движкам/жанрам/клонам,
разбор README на скриншоты и признаки, скачивание картинок через Contents API в base64).

```bash
cd mobile-games-catalog
python3 collect.py A 45     # поиск: 45 запросов за раз (чекпоинт в data/state.json)
python3 collect.py B        # добрать репозитории из awesome-списков
python3 collect.py C 2600   # README'ы: описания, скриншоты, жанры, движки, Play Market/APK
python3 collect.py D 240    # скачать сами файлы скриншотов (data/images/)
python3 collect.py E        # собрать data/catalog.json + catalog.csv
```

Результат — `data/catalog.json` / `data/catalog.csv`: имя, URL, описание, звёзды, вилки, язык,
лицензия, темы, даты, жанры, движки, признаки «собирается ли» (gradle/Unity/Xcode/Godot),
ссылки на скриншоты, Play Market и APK, короткая выжимка из README.

В приложение это попадает так:
```bash
cd game-hub && python3 tools/build_sources.py --limit 1500 --shots 400 --mb 40
# → data/sources.json (1500 топовых репо) + data/shots/*.png (122 скрина локально)
#    вкладка «Исходники» и панель «исходники этой игры» у каждой игры
```

**Топ базы:** `lichess-org/lila` (18.8k★) · `gabrielecirulli/2048` (13.4k★) · `fogleman/Craft` (Minecraft-клон, 11.1k★) ·
`newlinedotco/FlappySwift` (9.7k★) · `chvin/react-tetris` (8.7k★) · `yenchenlin/DeepLearningFlappyBird` (6.8k★) …

---

## 3. Настоящий APK

В песочнице нет JDK/Android SDK, поэтому APK собирается на твоей машине — всё приготовлено в `android-pack/`:
```bash
cd android-pack && npm install && npm run add:android && npm run apk:debug
# → android/app/build/outputs/apk/debug/app-debug.apk
```
Подробности и релизная подпись — в [`android-pack/README.md`](android-pack/README.md).

---

## Структура
```
game-hub/
  index.html  app.css  app.js        # хаб: витрина, роутинг, вкладки
  engine.js                          # общий движок игр
  manifest.webmanifest  sw.js        # PWA: установка на телефон + офлайн
  games/                             # 30 игр + index.js (манифест и синонимы для поиска)
  data/sources.json  data/shots/     # база исходников для вкладки «Исходники»
  tools/smoke.mjs                    # смоук-тест игр
  tools/build_sources.py             # catalog.json → sources.json
mobile-games-catalog/
  collect.py                         # сборщик GitHub (фазы A–E, чекпоинты)
  data/repos.json readmes.jsonl catalog.json catalog.csv images/
android-pack/                        # Capacitor-проект для сборки APK
```## 1) Приложение-хаб `game-hub/` — только игры

Одно PWA-приложение: **30 играбельных игр** (клоны знаменитых: Flappy Bird, Змейка, 2048,
Тетрис, Пакман, Сапёр, Судоку, Wordle, Minecraft-2D, Танчики и др.). Никаких ссылок на
источники и лишних страниц — витрина, поиск по-русски, теги жанров, рекорды и сами игры.
Работает офлайн (service worker), ставится на телефон как приложение.

**Игра по сети** (крестики-нолики, Connect 4, реверси): кнопка 🌐 в игре → ник настраивается
один раз, дальше комнаты по коду из 4 символов (WebRTC через PeerJS, без своего сервера):
один создаёт комнату и диктует код, второй вводит его — и играют вдвоём.

```bash
cd game-hub && python3 -m http.server 8080 --bind 0.0.0.0   # или любой статик-хостинг
# тесты: node tools/smoke.mjs   (плюс DOM-тест из истории коммитов)
```

## 3) Настоящий APK — собирается автоматически в GitHub Actions

Файл `.github/workflows/apk.yml` при каждом пуше собирает debug APK из `android-pack/`
(Capacitor 6 + Gradle) и выкладывает его в релиз с тегом `apk`:

**→ https://github.com/syslikoffnet/eblan/releases/download/apk/app-debug.apk**

Страница сборки: `https://github.com/syslikoffnet/eblan/actions/workflows/apk.yml`.
Собрать вручную у себя: `cd android-pack && npm install && npm run add:android && npm run apk:debug`
(подробности в `android-pack/README.md`).

## 1. Приложение: 30 игр, один файл-хаб

Чистый **JS + Canvas 2D**, ноль зависимостей, ноль сборки. Общий движок (`game-hub/engine.js`):
игровой цикл с фиксированным шагом, ввод (палец/свайп/клавиатура + экранные кнопки),
звук на WebAudio (без аудиофайлов), частицы, тряска экрана, рекорды в localStorage.
Каждая игра — один модуль в `game-hub/games/` (150–350 строк).

**Витрина:** `flappy` (Flappy Bird) · `snake` · `tetris` · `2048` · `breakout` (Арканоид) · `pong` ·
`invaders` (Space Invaders) · `pacman` (процедурный лабиринт + призраки на BFS) · `miner` (Сапёр) ·
`sudoku` (генератор с единственным решением) · `runner` (Geometry Dash/Dino) · `jumper` (Doodle Jump) ·
`asteroids` · `frogger` · `sokoban` (уровни проверены решателем) · `memory` · `simon` ·
`tictactoe` (минимакс) · `connect4` (минимакс, глубина 5) · `whack` · `match3` (Candy Crush: каскады, спец-конфеты) ·
`reversi` (Othello, минимакс) · `blackjack` · `bubble` (Bubble Shooter) · `wordle` (по-русски, 150 слов) ·
`stack` (Stack Tower) · `knife` (Knife Hit) · `aim` · `craft` (2D-Minecraft: генерация мира, руда, стройка) ·
`tank` (Battle City: ИИ врагов, бонусы, защита базы)

### Запуск
```bash
cd game-hub && python3 -m http.server 8080
# открой http://localhost:8080
```
На телефоне: открой адрес по HTTPS → меню браузера → **«Установить приложение» / «На экран Домой»**
(на iPhone: Поделиться → На экран Домой). `sw.js` кэширует всё — дальше работает офлайн.

### Тесты (без браузера)
```bash
cd game-hub
node tools/smoke.mjs              # гоняет каждую игру на 3 размерах экрана со случайным вводом, ловит NaN/исключения
FRAMES=40000 node tools/smoke.mjs # длинный фазз-прогон
```
Плюс DOM-тест на jsdom (витрина, поиск, вкладки, запуск всех 30 игр, пауза/выход) — `android-pack/README.md` описывает сборку APK.

---

## 2. Каталог исходников: 36 381 репозиторий

`mobile-games-catalog/collect.py` — сборщик на GitHub API (поиск по темам/движкам/жанрам/клонам,
разбор README на скриншоты и признаки, скачивание картинок через Contents API в base64).

```bash
cd mobile-games-catalog
python3 collect.py A 45     # поиск: 45 запросов за раз (чекпоинт в data/state.json)
python3 collect.py B        # добрать репозитории из awesome-списков
python3 collect.py C 2600   # README'ы: описания, скриншоты, жанры, движки, Play Market/APK
python3 collect.py D 240    # скачать сами файлы скриншотов (data/images/)
python3 collect.py E        # собрать data/catalog.json + catalog.csv
```

Результат — `data/catalog.json` / `data/catalog.csv`: имя, URL, описание, звёзды, вилки, язык,
лицензия, темы, даты, жанры, движки, признаки «собирается ли» (gradle/Unity/Xcode/Godot),
ссылки на скриншоты, Play Market и APK, короткая выжимка из README.

В приложение это попадает так:
```bash
cd game-hub && python3 tools/build_sources.py --limit 1500 --shots 400 --mb 40
# → data/sources.json (1500 топовых репо) + data/shots/*.png (122 скрина локально)
#    вкладка «Исходники» и панель «исходники этой игры» у каждой игры
```

**Топ базы:** `lichess-org/lila` (18.8k★) · `gabrielecirulli/2048` (13.4k★) · `fogleman/Craft` (Minecraft-клон, 11.1k★) ·
`newlinedotco/FlappySwift` (9.7k★) · `chvin/react-tetris` (8.7k★) · `yenchenlin/DeepLearningFlappyBird` (6.8k★) …

---

## 3. Настоящий APK

В песочнице нет JDK/Android SDK, поэтому APK собирается на твоей машине — всё приготовлено в `android-pack/`:
```bash
cd android-pack && npm install && npm run add:android && npm run apk:debug
# → android/app/build/outputs/apk/debug/app-debug.apk
```
Подробности и релизная подпись — в [`android-pack/README.md`](android-pack/README.md).

---

## Структура
```
game-hub/
  index.html  app.css  app.js        # хаб: витрина, роутинг, вкладки
  engine.js                          # общий движок игр
  manifest.webmanifest  sw.js        # PWA: установка на телефон + офлайн
  games/                             # 30 игр + index.js (манифест и синонимы для поиска)
  data/sources.json  data/shots/     # база исходников для вкладки «Исходники»
  tools/smoke.mjs                    # смоук-тест игр
  tools/build_sources.py             # catalog.json → sources.json
mobile-games-catalog/
  collect.py                         # сборщик GitHub (фазы A–E, чекпоинты)
  data/repos.json readmes.jsonl catalog.json catalog.csv images/
android-pack/                        # Capacitor-проект для сборки APK
```## 1) Приложение-хаб `game-hub/` — только игры

Одно PWA-приложение: **30 играбельных игр** (клоны знаменитых: Flappy Bird, Змейка, 2048,
Тетрис, Пакман, Сапёр, Судоку, Wordle, Minecraft-2D, Танчики и др.). Никаких ссылок на
источники и лишних страниц — витрина, поиск по-русски, теги жанров, рекорды и сами игры.
Работает офлайн (service worker), ставится на телефон как приложение.

**Игра по сети** (крестики-нолики, Connect 4, реверси): кнопка 🌐 в игре → ник настраивается
один раз, дальше комнаты по коду из 4 символов (WebRTC через PeerJS, без своего сервера):
один создаёт комнату и диктует код, второй вводит его — и играют вдвоём.

```bash
cd game-hub && python3 -m http.server 8080 --bind 0.0.0.0   # или любой статик-хостинг
# тесты: node tools/smoke.mjs   (плюс DOM-тест из истории коммитов)
```


