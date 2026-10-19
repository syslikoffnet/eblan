/* Копирует веб-приложение ../game-hub в www/ для Capacitor.
   Пропускает служебные файлы (tools, node_modules, тесты). */
import fs from 'node:fs';
import path from 'node:path';

const SRC = path.resolve(import.meta.dirname, '../../game-hub');
const DST = path.resolve(import.meta.dirname, '../www');
const SKIP = new Set(['tools', 'node_modules', 'package.json', 'package-lock.json', '.git']);

fs.rmSync(DST, { recursive: true, force: true });
fs.mkdirSync(DST, { recursive: true });

let files = 0, bytes = 0;
function walk(dir, rel = '') {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP.has(e.name)) continue;
    const from = path.join(dir, e.name);
    const to = path.join(DST, rel, e.name);
    if (e.isDirectory()) { fs.mkdirSync(to, { recursive: true }); walk(from, path.join(rel, e.name)); }
    else {
      fs.copyFileSync(from, to);
      files++; bytes += fs.statSync(to).size;
    }
  }
}
walk(SRC);
console.log(`скопировано ${files} файлов (${(bytes / 1e6).toFixed(1)} МБ) в ${DST}`);
