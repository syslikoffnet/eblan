# EBLAN BOX → настоящий APK

Веб-приложение (30 игр + каталог исходников) лежит в `../game-hub`.
Здесь — упаковка в Android APK через **Capacitor**. В песочнице, где это собиралось,
нет JDK/Android SDK (и `dl.google.com` закрыт), поэтому сборка APK делается на твоей машине.

## Что нужно один раз
- Node.js 18+ (`node -v`)
- JDK 17 (`java -version`)
- Android Studio + Android SDK (или просто `sdkmanager` + `ANDROID_HOME`)

## Сборка (5 команд)
```bash
cd android-pack
npm install
npm run add:android      # копирует game-hub → www/ и создаёт нативный проект android/
npx cap open android     # откроет Android Studio
```
В Android Studio: **Build → Build Bundle(s)/APK(s) → Build APK(s)**.
Готовый файл: `android/app/build/outputs/apk/debug/app-debug.apk` — ставится на телефон напрямую.

### Без Android Studio, из консоли
```bash
npm run apk:debug        # → android/app/build/outputs/apk/debug/app-debug.apk
```

### Релизный APK (подпись своим ключом)
```bash
keytool -genkey -v -keystore eblan.keystore -alias eblan -keyalg RSA -keysize 2048 -validity 10000
npm run apk:release      #签名 настраивается в android/app/build.gradle
```

## Что внутри APK
- `www/index.html` — хаб: витрина 30 игр, поиск, вкладки «Исходники» и «О проекте»
- `www/games/*.js` — сами игры (чистый JS + Canvas, без зависимостей)
- `www/engine.js` — общий движок: цикл, ввод (тач/клавиатура), звук на WebAudio, частицы, рекорды
- `www/data/sources.json` — база открытых исходников игр с GitHub
- `www/sw.js` — офлайн-кэш (игры работают без интернета)

## Обновить игры в APK
```bash
npm run prepare:all      # пересобрать www/ и синхронизировать нативный проект
```

## Альтернатива без APK — PWA
`game-hub` уже является устанавливаемым приложением: открой его по HTTPS
(или на `localhost`) → меню браузера → «Установить приложение» / «На экран Домой».
Иконка на рабочем столе, запуск в полноэкранном режиме, работа офлайн — тот же опыт, что и APK.

## Смена имени пакета / иконки
- `capacitor.config.json` → `appId`, `appName`
- иконки: `android/app/src/main/res/mipmap-*/` (или `npm i -D @capacitor/assets` и `npx capacitor-assets generate --android`)
