#!/usr/bin/env python3
"""Собирает data/sources.json для приложения EBLAN BOX из базы,
которую наharvest'ил mobile-games-catalog/collect.py.

- берёт catalog.json (если есть — там описания из README, жанры, движки, скриншоты),
  иначе repos.json (только метаданные из поиска);
- фильтрует «похоже на игру»;
- гарантирует, что для каждой игры хаба (srcKeywords) найдутся исходники;
- копирует скачанные скриншоты в data/shots/;
- пишет компактный sources.json + статистику.

usage: python3 tools/build_sources.py [--limit 1500] [--shots 400] [--mb 40]
"""
import json
import os
import re
import shutil
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))          # game-hub
REPO = os.path.dirname(ROOT)                                                # eblan
CAT_DIR = os.path.join(REPO, "mobile-games-catalog", "data")
OUT = os.path.join(ROOT, "data", "sources.json")
SHOTS = os.path.join(ROOT, "data", "shots")

GAME_RX = re.compile(
    r"game|gaming|arcade|puzzle|platformer|shooter|clone|remake|player|play\b|"
    r"android|ios|mobile|unity|godot|libgdx|cocos|spritekit|flame|tetris|snake|"
    r"chess|sudoku|minesweeper|pacman|flappy|2048|minecraft|runner|jump|ball|"
    r"card|board|rpg|racing|sports|wordle|sokoban|frogger|asteroids|pong|breakout",
    re.I)

args = sys.argv[1:]
def opt(name, default):
    return int(args[args.index(name) + 1]) if name in args else default

LIMIT = opt("--limit", 1500)
MAX_SHOTS = opt("--shots", 400)
MAX_MB = opt("--mb", 45)


def load():
    cat = os.path.join(CAT_DIR, "catalog.json")
    if os.path.exists(cat):
        with open(cat, encoding="utf-8") as f:
            return json.load(f), "catalog.json"
    rep = os.path.join(CAT_DIR, "repos.json")
    if os.path.exists(rep):
        with open(rep, encoding="utf-8") as f:
            d = json.load(f)
            return list(d.values()), "repos.json"
    return [], "нет данных"


def compact(r, shot=None):
    return {
        "full_name": r.get("full_name"),
        "url": r.get("url") or f"https://github.com/{r.get('full_name')}",
        "description": (r.get("description") or "").strip()[:400],
        "blurb": (r.get("blurb") or "")[:220],
        "stars": r.get("stars", 0),
        "forks": r.get("forks", 0),
        "language": r.get("language"),
        "license": r.get("license"),
        "topics": (r.get("topics") or [])[:8],
        "genres": (r.get("genres") or [])[:5],
        "engines": (r.get("engines") or [])[:3],
        "images": (r.get("images") or [])[:3],
        "shot": shot,
        "created": r.get("created"),
        "pushed": r.get("pushed"),
        "homepage": r.get("homepage") or "",
        "archived": bool(r.get("archived")),
        "fork": bool(r.get("fork")),
        "mobile": bool(r.get("mobile", True)),
        "buildable_hint": bool(r.get("buildable_hint")),
        "play_store": (r.get("play_store") or [])[:1],
        "apk_links": (r.get("apk_links") or [])[:1],
    }


def main():
    rows, src = load()
    print(f"источник: {src}, записей: {len(rows)}")
    if not rows:
        print("нечего собирать — сначала запусти collect.py")
        return

    games_manifest = os.path.join(ROOT, "games", "index.js")
    keywords = []
    if os.path.exists(games_manifest):
        txt = open(games_manifest, encoding="utf-8").read()
        for m in re.finditer(r"srcKeywords:\s*\[([^\]]*)\]", txt):
            keywords += [k.strip().strip("'\"").lower() for k in m.group(1).split(",") if k.strip()]
    keywords = list(dict.fromkeys(keywords))

    def blob(r):
        return " ".join([
            r.get("full_name") or "", r.get("description") or "",
            " ".join(r.get("topics") or []), " ".join(r.get("genres") or []),
            " ".join(r.get("engines") or []), r.get("language") or "",
        ]).lower()

    def is_game(r):
        if r.get("fork") and (r.get("stars") or 0) < 30:
            return False
        b = blob(r)
        if not GAME_RX.search(b):
            return False
        # отсекаем откровенно неигровое
        if re.search(r"\b(awesome|list of|collection of|course|tutorial|book|resume|portfolio)\b", b) \
                and not re.search(r"game|clone|arcade|puzzle", b):
            return False
        return True

    pool = [r for r in rows if is_game(r)]
    pool.sort(key=lambda r: (-(r.get("stars") or 0)))
    print(f"похоже на игры: {len(pool)}")

    chosen, seen = [], set()
    # 1) гарантия покрытия по ключевым словам игр хаба
    for kw in keywords:
        cnt = 0
        for r in pool:
            if r["full_name"] in seen:
                continue
            if kw in blob(r):
                chosen.append(r); seen.add(r["full_name"]); cnt += 1
                if cnt >= 12:
                    break
    # 2) топ по звёздам
    for r in pool:
        if len(chosen) >= LIMIT:
            break
        if r["full_name"] in seen:
            continue
        chosen.append(r); seen.add(r["full_name"])
    chosen.sort(key=lambda r: -(r.get("stars") or 0))

    # скриншоты
    os.makedirs(SHOTS, exist_ok=True)
    for f in os.listdir(SHOTS):
        os.remove(os.path.join(SHOTS, f))
    shots_dir = os.path.join(CAT_DIR, "images")
    copied, mb = 0, 0.0
    out = []
    for r in chosen:
        shot = None
        for rel in (r.get("local_images") or []):
            name = os.path.basename(rel).lower()
            if re.search(r"logo|icon|badge|avatar|mascot", name):
                continue
            name = os.path.basename(rel)
            sp = os.path.join(shots_dir, name)
            if not os.path.exists(sp):
                continue
            size = os.path.getsize(sp) / 1e6
            if copied >= MAX_SHOTS or mb + size > MAX_MB:
                break
            shutil.copyfile(sp, os.path.join(SHOTS, name))
            shot = name; copied += 1; mb += size
            break
        out.append(compact(r, shot))

    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, separators=(",", ":"))

    langs = {}
    for r in out:
        if r["language"]:
            langs[r["language"]] = langs.get(r["language"], 0) + 1
    top = sorted(langs.items(), key=lambda kv: -kv[1])[:8]
    print(f"sources.json: {len(out)} репозиториев, {os.path.getsize(OUT)/1e6:.1f} МБ")
    print(f"скриншотов скопировано: {copied} ({mb:.1f} МБ)")
    print("языки: " + ", ".join(f"{l} {n}" for l, n in top))
    covered = sum(1 for kw in keywords if any(kw in blob(r) for r in out))
    print(f"ключевых слов игр покрыто: {covered}/{len(keywords)}")


if __name__ == "__main__":
    main()
