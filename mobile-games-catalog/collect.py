#!/usr/bin/env python3
"""
Harvester of open-source MOBILE games from GitHub.

Phases
  A. search       - many keyword/topic/language queries -> raw repo metadata (search API)
  B. awesomelists - parse curated "awesome ... games" lists for extra repo links (core API)
  C. readmes      - fetch README of every repo (core API), extract screenshots + tags
  D. images       - download real screenshot files via Contents API (base64) for top repos
  E. dump         - write catalog.json / catalog.csv

Everything is checkpointed to JSONL, so the script can be restarted safely.
"""
import base64
import csv
import json
import os
import re
import subprocess
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

ROOT = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(ROOT, "data")
IMG = os.path.join(DATA, "images")
os.makedirs(IMG, exist_ok=True)

API = "https://api.github.com"

RAW_HITS = os.path.join(DATA, "hits.jsonl")
REPOS = os.path.join(DATA, "repos.json")
READMES = os.path.join(DATA, "readmes.jsonl")
STATE = os.path.join(DATA, "state.json")
LOG = os.path.join(DATA, "collect.log")


def log(*a):
    line = " ".join(str(x) for x in a)
    stamp = time.strftime("%H:%M:%S")
    print(f"[{stamp}] {line}", flush=True)
    with open(LOG, "a", encoding="utf-8") as f:
        f.write(f"[{stamp}] {line}\n")


# --------------------------------------------------------------------------- auth
def token():
    t = os.environ.get("GH_TOKEN") or os.environ.get("GITHUB_TOKEN")
    if t:
        return t.strip()
    try:
        return subprocess.run(["gh", "auth", "token"], capture_output=True, text=True,
                              timeout=20).stdout.strip()
    except Exception:
        return ""


TOKEN = token()
HDRS = {
    "Accept": "application/vnd.github+json",
    "User-Agent": "mobile-game-harvester",
    "X-GitHub-Api-Version": "2022-11-28",
}
if TOKEN:
    HDRS["Authorization"] = "Bearer " + TOKEN


class Rate(Exception):
    pass


def gh(path, raw=False, accept=None, timeout=40):
    """GET from api.github.com. Returns dict/list/bytes or None on 404."""
    url = path if path.startswith("http") else API + path
    h = dict(HDRS)
    if accept:
        h["Accept"] = accept
    for attempt in range(6):
        try:
            req = urllib.request.Request(url, headers=h)
            with urllib.request.urlopen(req, timeout=timeout) as r:
                body = r.read()
                rem = r.headers.get("X-RateLimit-Remaining")
                if rem is not None and int(rem) < 4:
                    reset = int(r.headers.get("X-RateLimit-Reset", time.time() + 60))
                    raise Rate(max(1, reset - int(time.time())))
                return body if raw else json.loads(body)
        except Rate as e:
            wait = min(int(e.args[0]) + 1, 900)
            log(f"  rate-limit wall, sleeping {wait}s")
            time.sleep(wait)
        except urllib.error.HTTPError as e:
            if e.code in (403, 429):
                ra = e.headers.get("Retry-After")
                if ra:
                    time.sleep(min(int(ra) + 1, 900))
                    continue
                reset = e.headers.get("X-RateLimit-Reset")
                if reset and e.headers.get("X-RateLimit-Remaining") == "0":
                    wait = min(max(1, int(reset) - int(time.time())) + 1, 900)
                    log(f"  rate limited, sleeping {wait}s")
                    time.sleep(wait)
                    continue
                log(f"  HTTP {e.code} blocked on {url[:90]}")
                time.sleep(3 + 3 * attempt)
                continue
            if e.code in (404, 451, 422, 409, 401, 413):
                return None
            time.sleep(1.5 * (attempt + 1))
        except Exception as ex:
            time.sleep(1.0 + attempt)
            if attempt == 5:
                log(f"  give up {url[:90]}: {ex}")
    return None


# --------------------------------------------------------------------------- queries
QUERIES = [
    # ---- famous clones first (user priority) ----
    "flappy bird", "2048 game", "snake game", "tetris", "pacman game", "minecraft clone",
    "angry birds clone", "doodle jump", "crossy road clone", "candy crush", "geometry dash",
    "chess game", "sudoku", "minesweeper", "breakout game", "pong game", "space invaders",
    "frogger", "asteroids game", "sokoban", "whack a mole", "super mario clone",
    "pokemon clone", "tower defense", "match-3", "endless runner", "simon says game",
    "memory game", "tic tac toe", "connect four", "solitaire", "air hockey", "pinball",
    "sudoku android", "tetris android", "snake android", "chess android", "2048 android",
    "clash of clans clone", "plants vs zombies clone", "temple run clone",
    "fruit ninja clone", "cut the rope clone", "wormate clone", "agar io clone",
    "slither io clone", "among us clone", "wordle clone", "quiz game",
    # topics
    "topic:android-game", "topic:ios-game", "topic:mobile-game", "topic:mobile-game-dev",
    "topic:android topic:game", "topic:ios topic:game", "topic:game topic:android",
    "topic:gamedev topic:android", "topic:game-development topic:android",
    "topic:android-app topic:game", "topic:swift topic:game", "topic:kotlin topic:game",
    "topic:flutter topic:game", "topic:react-native topic:game",
    "topic:libgdx", "topic:cocos2d", "topic:cocos2d-x", "topic:godot topic:android",
    "topic:unity topic:android", "topic:unity3d topic:mobile", "topic:spritekit",
    "topic:andengine", "topic:defold", "topic:solar2d", "topic:corona-sdk",
    "topic:flame topic:flutter", "topic:arcade topic:android", "topic:puzzle topic:android",
    "topic:platformer topic:android", "topic:apk topic:game",
    # engines / stacks
    "libgdx game", "libgdx android", "cocos2d-x game", "cocos2d-swift", "andengine game",
    "spritekit game ios", "unity3d android game", "godot mobile game", "defold game",
    "solar2d game", "corona sdk game", "flutter game flame", "flame engine game",
    "react-native game", "opengl es android game", "vulkan android game",
    "mono game android", "unreal engine mobile game", "cocos creator game",
    "java android game", "kotlin android game", "swift ios game", "objective-c ios game",
    "dart game mobile", "lua mobile game", "javascript mobile game",
    # genres / clones
    "android arcade game", "android puzzle game", "android platformer game",
    "endless runner android", "tower defense android", "match-3 game",
    "match3 puzzle game", "card game android", "board game android", "chess android",
    "sudoku android", "tetris android", "snake game android", "2048 game android",
    "flappy bird clone", "pacman android game", "space invaders android",
    "breakout game android", "pong game android", "maze game android",
    "quiz game android", "word game android", "rhythm game mobile", "racing game android",
    "shooter game android", "rpg game android", "adventure game android",
    "strategy game android", "sports game android", "puzzle game ios",
    "arcade game ios", "platformer ios game", "hypercasual game", "casual game mobile",
    "multiplayer game android", "multiplayer mobile game", "arcore game android",
    "augmented reality game mobile", "vr game android", "whack a mole game",
    "brick breaker game", "doodle jump clone", "angry birds clone", "candy crush clone",
    "crossy road clone", "geometry dash clone", "minecraft clone android",
    "pokemon clone game", "zelda like game mobile", "roguelike mobile game",
    "game clone android studio", "simple android game source code",
    "mobile game source code", "android game source code", "ios game source code",
    "open source android game", "open source mobile game", "open source ios game",
    "unity mobile game open source", "flutter game open source", "godot android game",
    "game jam mobile", "touch screen game android", "gyroscope game android",
]

AWESOME_SEARCHES = [
    "awesome android games in:name,description,readme",
    "awesome ios games in:name,description",
    "awesome mobile games in:name,description",
    "awesome games list in:name",
    "awesome gamedev in:name",
    "open source games list in:name,description",
]

BADGE_HINTS = (
    "shields.io", "badge", "travis-ci", "codecov", "coveralls", "circleci",
    "appveyor", "github.com/actions/workflow", "actions/workflow/badge",
    "workflows/", "hit-count", "visitors", "visitor-", "star-history",
    "opencollective", "buymeacoffee", "patreon", "paypal", "sponsor",
    "follow-", "twitter.com/", "discord", "license", "release-", "download",
    "codacy", "sonarcloud", "dependabot", "renovate", "lgtm.com", "deepsource",
    "codebeat", "goreportcard", "godoc", "pub.dev/packages/badges",
)

GENRE_RULES = [
    ("puzzle", r"\bpuzzl|match[- ]?3|sudoku|crossword|word\s?game|logic game|2048|minesweeper|slide puzzle"),
    ("arcade", r"\barcade|retro|pixel[- ]art|8[- ]?bit\b|hypercasual|hyper[- ]casual|casual game|score attack"),
    ("platformer", r"\bplatformer|jump and run|run(ner)? game|endless runner|doodle jump|geometry dash"),
    ("shooter", r"\bshoot|shmup|space shooter|fps\b|bullet hell|gun\b|sniper"),
    ("rpg", r"\brpg\b|role[- ]playing|jrpg|dungeon crawl"),
    ("strategy", r"\bstrategy|tower defense|td game|rts\b|4x\b|civilization"),
    ("card", r"\bcard game|poker|blackjack|solitaire|hearthstone|tcg\b|ccg\b"),
    ("board", r"\bboard game|chess|checkers|go\b|reversi|mahjong|backgammon|ludo|dice"),
    ("racing", r"\bracing|rally|drift|kart|formula|car game"),
    ("sports", r"\bsoccer|football|basketball|tennis|golf|cricket|baseball|volleyball|hockey"),
    ("rhythm", r"\brhythm|music game|beat\b|osu!|guitar hero|piano tiles"),
    ("adventure", r"\badventure|point and click|visual novel|escape room|story[- ]driven"),
    ("sim", r"\bsimulat|tycoon|farm(ing)? game|city build|life sim"),
    ("horror", r"\bhorror|scary|zombie|survival horror"),
    ("multiplayer", r"\bmultiplayer|multi[- ]player|online pvp|\bpvp\b|co[- ]?op|leaderboard"),
    ("educational", r"\beducat|learning|math game|kids game|children|quiz|trivia|alphabet"),
    ("ar-vr", r"\barcore|augmented reality|\bvr\b|virtual reality|gyroscope"),
    ("clone", r"\bclone\b|\bremake\b|\breimplementation|inspired by|like (flappy|angry|mario)"),
    ("3d", r"\b3d\b|three\.?js|opengl|vulkan|unity|unreal|godot|model|mesh"),
    ("2d", r"\b2d\b|sprite|tilemap|pixel"),
    ("engine", r"\bengine\b|framework|game engine|library for games"),
]

ENGINE_RULES = [
    ("libGDX", r"libgdx"),
    ("Unity", r"\bunity3?\b|unity engine|csharp unity"),
    ("Godot", r"\bgodot\b"),
    ("Unreal", r"unreal engine|\bue4\b|\bue5\b"),
    ("Cocos2d-x", r"cocos2d-x|cocos creator|cocos2d"),
    ("SpriteKit", r"spritekit|scene ?kit|gameplaykit"),
    ("AndEngine", r"andengine"),
    ("Flutter/Flame", r"\bflutter\b|\bflame engine\b|\bflame\b.*dart|dart.*\bflame\b"),
    ("React Native", r"react[- ]native|expo"),
    ("Defold", r"\bdefold\b"),
    ("Solar2D/Corona", r"solar2d|corona sdk|coronasdk"),
    ("MonoGame", r"monogame|xna"),
    ("OpenGL ES", r"opengl ?es|glsurfaceview|gles"),
    ("Vulkan", r"\bvulkan\b"),
    ("LÖVE", r"\bl[oö]ve2?d\b"),
    ("Phaser/JS", r"\bphaser\b|pixi\.?js|three\.?js|melonjs|babylon\.?js"),
    ("Android SDK", r"android sdk|java android|kotlin android|android studio"),
    ("SwiftUI/UIKit", r"\bswiftui\b|\buikit\b"),
]

MD_IMG = re.compile(r"!\[[^\]]*\]\(\s*([^)\s]+)(?:\s+[\"'][^\"']*[\"'])?\s*\)")
HTML_IMG = re.compile(r"<img[^>]+?src\s*=\s*[\"']([^\"']+)[\"']", re.I)
GH_LINK = re.compile(r"https?://github\.com/([A-Za-z0-9_.\-]+)/([A-Za-z0-9_.\-]+)")
PLAY_LINK = re.compile(r"https?://play\.google\.com/store/apps/details\?id=([A-Za-z0-9_.]+)")
APK_LINK = re.compile(r"https?://\S+?\.apk\b", re.I)


def norm_repo_meta(item, query=None):
    lic = (item.get("license") or {}).get("spdx_id")
    return {
        "full_name": item["full_name"],
        "name": item.get("name"),
        "owner": (item.get("owner") or {}).get("login"),
        "url": item.get("html_url"),
        "description": (item.get("description") or "").strip(),
        "stars": item.get("stargazers_count", 0),
        "forks": item.get("forks_count", 0),
        "language": item.get("language"),
        "topics": item.get("topics") or [],
        "license": None if lic in (None, "NOASSERTION") else lic,
        "created": (item.get("created_at") or "")[:10],
        "pushed": (item.get("pushed_at") or "")[:10],
        "homepage": item.get("homepage") or "",
        "size_kb": item.get("size", 0),
        "archived": bool(item.get("archived")),
        "fork": bool(item.get("fork")),
        "branch": item.get("default_branch", "main"),
        "issues": item.get("open_issues_count", 0),
        "queries": [query] if query else [],
    }


# --------------------------------------------------------------------------- phase A
def phase_a(max_queries=0):
    seen = {}
    if os.path.exists(REPOS):
        try:
            seen = json.load(open(REPOS, encoding="utf-8"))
            log(f"A: resume with {len(seen)} repos")
        except Exception:
            seen = {}
    done = set()
    if os.path.exists(STATE):
        try:
            done = set(json.load(open(STATE)).get("queries_done", []))
        except Exception:
            done = set()

    todo = [q for q in QUERIES if q not in done]
    if max_queries:
        todo = todo[:max_queries]
    log(f"A: {len(todo)} queries to run ({len(done)} already done)")
    for qi, q in enumerate(todo, 1):
        pages = 0
        for page in range(1, 11):
            qs = urllib.parse.urlencode({
                "q": q, "sort": "stars", "order": "desc",
                "per_page": 100, "page": page,
            })
            res = gh(f"/search/repositories?{qs}")
            if not res or not isinstance(res, dict):
                break
            items = res.get("items") or []
            if not items:
                break
            new = 0
            for it in items:
                fn = it.get("full_name")
                if not fn:
                    continue
                if fn in seen:
                    if q not in seen[fn]["queries"]:
                        seen[fn]["queries"].append(q)
                else:
                    seen[fn] = norm_repo_meta(it, q)
                    new += 1
            pages += 1
            total = res.get("total_count", 0)
            if page * 100 >= total or len(items) < 100:
                break
            time.sleep(2.2)  # search rate: 30/min
        done.add(q)
        log(f"A[{qi}/{len(todo)}] '{q}' -> {pages}p, +new, total unique {len(seen)}")
        json.dump(seen, open(REPOS, "w", encoding="utf-8"))
        st = json.load(open(STATE)) if os.path.exists(STATE) else {}
        st["queries_done"] = sorted(done)
        json.dump(st, open(STATE, "w", encoding="utf-8"))
        time.sleep(2.2)

    json.dump(seen, open(REPOS, "w", encoding="utf-8"))
    log(f"A: DONE unique repos = {len(seen)}")
    return seen


# --------------------------------------------------------------------------- phase B
def phase_b(seen):
    st = json.load(open(STATE)) if os.path.exists(STATE) else {}
    if st.get("awesome_done"):
        log("B: already done")
        return seen
    extra = set()
    for q in AWESOME_SEARCHES:
        qs = urllib.parse.urlencode({"q": q, "sort": "stars", "order": "desc",
                                     "per_page": 10, "page": 1})
        res = gh(f"/search/repositories?{qs}")
        for it in (res or {}).get("items", [])[:8]:
            fn = it["full_name"]
            body = gh(f"/repos/{fn}/readme", raw=True,
                      accept="application/vnd.github.raw")
            if not body:
                continue
            text = body.decode("utf-8", "ignore")
            found = 0
            for m in GH_LINK.finditer(text):
                owner, name = m.group(1), m.group(2).rstrip(").,;:'\"")
                if owner.lower() in ("github", "shields", "img", "raw", "camo"):
                    continue
                extra.add(f"{owner}/{name}")
                found += 1
            log(f"B: {fn} -> {found} links")
            time.sleep(0.4)
        time.sleep(2.2)

    log(f"B: {len(extra)} candidate links from awesome lists")
    added = 0
    for fn in sorted(extra):
        if fn in seen:
            continue
        if added >= 900:
            break
        meta = gh(f"/repos/{urllib.parse.quote(fn, safe='/')}")
        if not meta or not isinstance(meta, dict) or "full_name" not in meta:
            continue
        rec = norm_repo_meta(meta, "awesome-list")
        # keep only plausible games
        blob = (rec["description"] + " " + " ".join(rec["topics"])).lower()
        if not re.search(r"game|play|arcade|puzzle|android|ios|mobile|clone", blob):
            continue
        seen[rec["full_name"]] = rec
        added += 1
        if added % 100 == 0:
            json.dump(seen, open(REPOS, "w", encoding="utf-8"))
            log(f"B: +{added}")
        time.sleep(0.15)
    json.dump(seen, open(REPOS, "w", encoding="utf-8"))
    st["awesome_done"] = True
    json.dump(st, open(STATE, "w", encoding="utf-8"))
    log(f"B: DONE (+{added}) unique repos = {len(seen)}")
    return seen


# --------------------------------------------------------------------------- phase C
def rank_images(urls, owner, repo, branch):
    out = []
    for u in urls:
        u = u.strip()
        u = u.split("#")[0]
        if not u or u.startswith("data:"):
            continue
        low = u.lower()
        if any(b in low for b in BADGE_HINTS):
            continue
        if low.endswith((".svg",)) and "screen" not in low:
            continue
        if not re.search(r"\.(png|jpe?g|gif|webp)(\?.*)?$", low) and not low.startswith("http"):
            # relative path without extension -> probably a link, skip
            if not re.search(r"/(screenshots?|images?|img|assets|docs|media|gifs?)/", low):
                continue
        if u.startswith(("http://", "https://")):
            url = u
        else:
            path = u.lstrip("./").lstrip("/")
            url = f"https://github.com/{owner}/{repo}/raw/{branch}/{path}"
        score = 0
        s = low
        if re.search(r"screen|shot|gameplay|preview|demo|photo|ui[_-]|menu|level|banner", s):
            score += 5
        if s.endswith(".gif"):
            score += 3
        if re.search(r"logo|icon|avatar|mascot|banner_", s):
            score -= 4
        if "raw.githubusercontent" in s or "/raw/" in s:
            score += 1
        out.append({"url": url, "score": score})
    out.sort(key=lambda d: -d["score"])
    # dedupe
    seen, res = set(), []
    for o in out:
        if o["url"] in seen:
            continue
        seen.add(o["url"])
        res.append(o["url"])
    return res[:8]


def readme_rel_paths(md):
    """raw relative paths (for Contents API downloads)"""
    paths = []
    for u in MD_IMG.findall(md) + HTML_IMG.findall(md):
        u = u.strip().split("#")[0]
        low = u.lower()
        if not re.search(r"\.(png|jpe?g|gif|webp)$", low):
            continue
        if u.startswith(("http://", "https://")):
            continue
        if any(b in low for b in BADGE_HINTS):
            continue
        paths.append(u.lstrip("./").lstrip("/"))
    return paths


def mine_readme(md, rec):
    low = md.lower()
    owner, repo, branch = rec["owner"], rec["name"], rec["branch"]
    imgs = rank_images(MD_IMG.findall(md) + HTML_IMG.findall(md), owner, repo, branch)
    blob = " ".join([rec["description"], " ".join(rec["topics"]), md[:12000]]).lower()
    genres = sorted({g for g, rx in GENRE_RULES if re.search(rx, blob)})
    engines = sorted({e for e, rx in ENGINE_RULES if re.search(rx, low)})
    play = PLAY_LINK.findall(md)
    apk = APK_LINK.findall(md)
    # short prose blurb: first non-heading, non-badge paragraph
    blurb = ""
    for para in re.split(r"\n\s*\n", md):
        p = para.strip()
        if not p or p.startswith(("!", "[![", "<p align", "#", "|", "---", "```", "<img", "<a ", "<div")):
            continue
        p = re.sub(r"\[!\[[^\]]*\]\([^)]*\)\]\([^)]*\)", "", p)
        p = re.sub(r"!\[[^\]]*\]\([^)]*\)", "", p)
        p = re.sub(r"<[^>]+>", "", p)
        p = re.sub(r"\[([^\]]+)\]\([^)]+\)", r"\1", p)
        p = re.sub(r"[*_`>#]+", "", p).strip()
        if len(p) > 40:
            blurb = p[:600]
            break
    feats = []
    for line in md.splitlines():
        m = re.match(r"\s*[-*]\s+(.{10,120})$", line)
        if m and not m.group(1).startswith(("!", "[")):
            t = re.sub(r"\[([^\]]+)\]\([^)]+\)", r"\1", m.group(1)).strip(" *`")
            if t and not re.search(r"http|badge|license|shields", t, re.I):
                feats.append(t)
        if len(feats) >= 6:
            break
    return {
        "full_name": rec["full_name"],
        "images": imgs,
        "readme_files": readme_rel_paths(md)[:8],
        "genres": genres,
        "engines": engines,
        "play_store": play[:2],
        "apk_links": apk[:2],
        "blurb": blurb,
        "features": feats,
        "readme_len": len(md),
        "has_gradle": bool(re.search(r"build\.gradle|androidmanifest|gradlew", low)),
        "has_xcode": bool(re.search(r"\.xcodeproj|xcodeproj|info\.plist|podfile", low)),
        "has_unity": bool(re.search(r"unity|\.meta\b|assets/scripts", low)),
        "has_godot": bool(re.search(r"project\.godot|\.tscn\b", low)),
        "how_to_run": bool(re.search(r"how to run|getting started|build(ing)? (the|instructions)|setup|install", low)),
    }


def phase_c(seen, budget=4600):
    done = set()
    if os.path.exists(READMES):
        with open(READMES, encoding="utf-8") as f:
            for line in f:
                try:
                    done.add(json.loads(line)["full_name"])
                except Exception:
                    pass
    order = sorted(seen.values(), key=lambda r: (-r["stars"], r["full_name"]))
    todo = [r for r in order if r["full_name"] not in done]
    log(f"C: {len(todo)} readmes to fetch ({len(done)} done)")
    n = 0
    with open(READMES, "a", encoding="utf-8") as out:
        for r in todo:
            if n >= budget:
                log(f"C: budget {budget} reached, stopping")
                break
            body = gh(f"/repos/{urllib.parse.quote(r['full_name'], safe='/')}/readme",
                      raw=True, accept="application/vnd.github.raw")
            n += 1
            if body:
                try:
                    md = body.decode("utf-8", "ignore")
                except Exception:
                    md = ""
                if md:
                    out.write(json.dumps(mine_readme(md, r), ensure_ascii=False) + "\n")
                    out.flush()
            if n % 100 == 0:
                log(f"C: {n}/{len(todo)} readmes mined")
            time.sleep(0.35)
    log(f"C: DONE fetched {n} readmes")


# --------------------------------------------------------------------------- phase D
def phase_d(seen, rd, max_images=260, max_total_mb=26.0):
    st = json.load(open(STATE)) if os.path.exists(STATE) else {}
    already = set(st.get("images_done", []))
    total = sum(os.path.getsize(os.path.join(IMG, f)) for f in os.listdir(IMG)) / 1e6
    order = sorted(seen.values(), key=lambda r: -r["stars"])
    made = 0
    for r in order:
        if total > max_total_mb or made >= max_images:
            break
        info = rd.get(r["full_name"])
        if not info or not info.get("readme_files"):
            continue
        picked = 0
        for p in info["readme_files"][:2]:
            if made >= max_images or total > max_total_mb:
                break
            key = f"{r['full_name']}::{p}"
            if key in already:
                continue
            res = gh(f"/repos/{urllib.parse.quote(r['full_name'], safe='/')}/contents/"
                     f"{urllib.parse.quote(p)}?ref={r['branch']}")
            made += 1
            already.add(key)
            if not isinstance(res, dict) or not res.get("content"):
                continue
            if res.get("size", 0) > 600_000:
                continue
            try:
                blob = base64.b64decode(res["content"])
            except Exception:
                continue
            ext = os.path.splitext(p)[1].lower() or ".png"
            if ext not in (".png", ".jpg", ".jpeg", ".gif", ".webp"):
                continue
            safe = re.sub(r"[^A-Za-z0-9._-]", "_", r["full_name"]) + "_" + \
                re.sub(r"[^A-Za-z0-9._-]", "_", os.path.basename(p))
            with open(os.path.join(IMG, safe), "wb") as f:
                f.write(blob)
            total += len(blob) / 1e6
            picked += 1
            time.sleep(0.2)
        if picked:
            st["images_done"] = sorted(already)[-4000:]
            json.dump(st, open(STATE, "w", encoding="utf-8"))
    log(f"D: DONE {made} api calls, images dir {total:.1f} MB")


# --------------------------------------------------------------------------- phase E
def phase_e(seen, rd):
    rows = []
    for fn, r in seen.items():
        info = rd.get(fn, {})
        imgs = list(info.get("images", []))
        local = []
        for p in info.get("readme_files", []):
            safe = re.sub(r"[^A-Za-z0-9._-]", "_", fn) + "_" + \
                re.sub(r"[^A-Za-z0-9._-]", "_", os.path.basename(p))
            fp = os.path.join(IMG, safe)
            if os.path.exists(fp):
                local.append("images/" + safe)
        blob = " ".join([r["description"], " ".join(r["topics"])]).lower()
        genres = info.get("genres") or []
        if not genres:
            genres = sorted({g for g, rx in GENRE_RULES if re.search(rx, blob)})
        engines = info.get("engines") or []
        mobile = bool(
            info.get("has_gradle") or info.get("has_xcode") or info.get("has_unity")
            or info.get("has_godot")
            or re.search(r"android|ios|iphone|ipad|mobile|apk|xcode|swift|kotlin", blob)
        )
        rows.append({
            **r,
            "mobile": mobile,
            "genres": genres,
            "engines": engines,
            "images": imgs,
            "local_images": local,
            "blurb": info.get("blurb", ""),
            "features": info.get("features", []),
            "play_store": info.get("play_store", []),
            "apk_links": info.get("apk_links", []),
            "readme_mined": bool(info),
            "buildable_hint": bool(info.get("has_gradle") or info.get("has_xcode")
                                   or info.get("has_unity") or info.get("has_godot")),
        })
    rows.sort(key=lambda x: (-x["stars"], x["full_name"]))
    json.dump(rows, open(os.path.join(DATA, "catalog.json"), "w", encoding="utf-8"),
              ensure_ascii=False)
    cols = ["full_name", "name", "owner", "url", "description", "stars", "forks",
            "language", "license", "topics", "genres", "engines", "mobile",
            "buildable_hint", "created", "pushed", "homepage", "play_store",
            "apk_links", "images", "local_images", "blurb", "readme_mined", "queries"]
    with open(os.path.join(DATA, "catalog.csv"), "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=cols, extrasaction="ignore")
        w.writeheader()
        for r in rows:
            rr = dict(r)
            for k in ("topics", "genres", "engines", "images", "local_images",
                      "play_store", "apk_links", "queries"):
                rr[k] = " | ".join(str(x) for x in (rr.get(k) or []))
            rr["features"] = ""
            w.writerow(rr)
    log(f"E: catalog.json / catalog.csv written -> {len(rows)} games, "
        f"{sum(1 for r in rows if r['readme_mined'])} with README data, "
        f"{sum(len(r['images']) for r in rows)} image URLs")


def load_rd():
    rd = {}
    if os.path.exists(READMES):
        with open(READMES, encoding="utf-8") as f:
            for line in f:
                try:
                    d = json.loads(line)
                    rd[d["full_name"]] = d
                except Exception:
                    pass
    return rd


def main(argv):
    t0 = time.time()
    st = json.load(open(STATE)) if os.path.exists(STATE) else {}
    what = (argv[0] if argv else "all").upper()
    limit = int(argv[1]) if len(argv) > 1 else 0

    if what in ("A", "ALL"):
        seen = phase_a(limit)
    else:
        seen = json.load(open(REPOS, encoding="utf-8")) if os.path.exists(REPOS) else {}
    if what in ("B", "ALL"):
        seen = phase_b(seen)
    if what in ("C", "ALL"):
        phase_c(seen, budget=limit or int(st.get("readme_budget", 3000)))
    if what in ("D", "ALL"):
        phase_d(seen, load_rd(), max_images=limit or 240)
    if what in ("E", "ALL"):
        phase_e(seen, load_rd())
    log(f"phase {what} finished in {time.time()-t0:.0f}s")


if __name__ == "__main__":
    main(sys.argv[1:])
