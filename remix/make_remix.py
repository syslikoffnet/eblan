"""
make_remix.py — «максимальная» версия ремикса _handsgod.mp3 (150.000 BPM).

Что делает:
  1) анализ исходника (HPSS-кэш, кики, корни по тактам) — всё пересобирается автоматически;
  2) синтез: кик-слой (тюненый), клэпы/снейры/хэты/шейкеры/томы/ратчеты, саб + мид-бас-грув,
     пэды в брейкдаунах, стабы из срезов, райзеры/импакты/саб-дропы/реверс-крэши;
  3) аранжировка по структуре исходника: DJ-интро, 10 дропов, брейки, сэкшн-паузы,
     филл-ин и роллы каждые 8 тактов, аутро-луп;
  4) шинный микс: дакинг исходника под кики, карвинг середины, компрессия драм-шины,
     сатурация баса, реверб-хвосты;
  5) мастер: M/S-EQ, клей, ленточная сатурация, лимитер, LUFS-калибровка и true-peak;
  6) экспорт: мастер WAV/MP3, превью, соц-кат, стемы.
"""
from __future__ import annotations

import gc
import json
import os
import subprocess
import sys

import numpy as np
import scipy.signal as ss
from scipy.ndimage import median_filter, uniform_filter1d

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import dsp  # noqa: E402
import librosa  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC_MP3 = os.path.join(ROOT, "_handsgod.mp3")
WORK = os.path.join(ROOT, "work")
OUT_DIR = os.path.join(ROOT, "remix")
RNG = np.random.default_rng(20261016)

SR = 44100
PHI = 0.084          # фаза сетки исходника (даунбит первого такта)
T_BAR = 1.6          # 4 бита × 400 мс
T_BEAT = 0.4
T_16 = 0.1
PRE_BARS = 8         # DJ-интро
SRC_BARS_END = 106   # конец музыки исходника
EXT_BARS = 5         # аутро-луп
TARGET_LUFS = -9.5   # клубная громкость мастера

# ---------------- аранжировка (в тактах исходника) ----------------
INTRO = list(range(0, 7))
DROPS = [
    list(range(7, 23)),
    list(range(25, 31)),     # у исходника тут нет баса
    list(range(31, 41)),
    list(range(42, 48)),
    list(range(52, 55)),     # у исходника тут нет баса
    list(range(55, 64)),
    list(range(66, 73)),
    list(range(74, 88)),
    list(range(92, 95)),
    list(range(95, 104)),
]
ALL_DROPS = [b for d in DROPS for b in d]
NOBASS = list(range(25, 31)) + list(range(52, 55))
BREAKS = list(range(23, 25)) + [41] + list(range(48, 52)) + list(range(64, 66)) + [73] + list(range(88, 92))
HALF = set(BREAKS) | set(INTRO)
CLAP_BARS = set(ALL_DROPS) | set(INTRO) | set(NOBASS)
HAT8_BARS = set(range(-PRE_BARS, SRC_BARS_END))
HAT16_BARS = set(ALL_DROPS)
SHAKER_BARS = set(ALL_DROPS) | set(NOBASS)
KICK_EIGHTHS = set(ALL_DROPS) | set(NOBASS)
FILL_BARS = [14, 22, 29, 39, 46, 62, 71, 86, 102, 103]
ROLL_BARS = [24, 51, 94]
RATCHET_BARS = [15, 23, 31, 39, 47, 55, 63, 71, 79, 87, 95, 103]
DOUBLE_CLAP_BARS = [15, 23, 31, 39, 47, 55, 63, 71, 79, 87, 95, 103, 105]
RISERS = [(-2, 0), (4, 7), (23, 25), (29, 31), (40, 42), (50, 52), (63, 66), (72, 74), (89, 92), (91, 95)]
IMPACT_BARS = [7, 25, 31, 42, 52, 55, 66, 74, 92, 95, 104]
CRASH_BARS = [7, 11, 15, 19, 25, 28, 31, 35, 39, 42, 45, 52, 55, 59, 63, 66, 70, 74, 78, 82, 86, 92, 95, 99, 103]
CHOP_BARS = list(range(42, 48)) + list(range(-4, 0))
STUTTER_BARS = [24, 51, 94]
SUCTION_BARS = [25, 52, 92]          # перед этими дропами — «всасывание» (пауза 1/8)
PAD_BARS = [(23, 25), (48, 52), (64, 66), (88, 92), (104, 106)]
BASS_STAB_BARS = list(range(23, 25)) + list(range(48, 52)) + list(range(64, 66)) + list(range(88, 92))
DROPOUTS = [(23.5, 25.0), (48.0, 52.0), (88.0, 92.0)]

DT = 1.0 / SR


def bar(b: float) -> float:
    return PHI + b * T_BAR


def beat(b: float, q: float) -> float:
    return bar(b) + q * T_BEAT


def s16(b: float, k: float) -> float:
    return bar(b) + k * T_16


def rms(x):
    return float(np.sqrt(np.mean(np.asarray(x, dtype=np.float64) ** 2)))


def norm_stereo(x, peak_db):
    p = float(np.max(np.abs(x)))
    if p < 1e-9:
        return np.asarray(x, dtype=np.float32)
    return (x * (10 ** (peak_db / 20.0) / p)).astype(np.float32)


# --------------------------------------------------------------------------------------
# анализ
# --------------------------------------------------------------------------------------
def ensure_analysis():
    """Кэш HPSS в work/: если файлов нет (например, после чистого клона) — пересчитать."""
    p_perc = os.path.join(WORK, "perc.npy")
    p_harm = os.path.join(WORK, "harm.npy")
    if os.path.exists(p_perc) and os.path.exists(p_harm):
        return
    os.makedirs(WORK, exist_ok=True)
    print("[analysis] work/perc.npy и harm.npy не найдены — считаю HPSS...")
    y, _ = librosa.load(SRC_MP3, sr=22050, mono=True)
    H, P = librosa.effects.hpss(y.astype(np.float32), kernel_size=31, margin=(1.0, 5.0))
    np.save(p_harm, H.astype(np.float32))
    np.save(p_perc, P.astype(np.float32))
    print("[analysis] готово")


def load_source():
    y, _ = librosa.load(SRC_MP3, sr=SR, mono=False)
    y = np.ascontiguousarray(y.astype(np.float32))
    return dsp.eq(y, SR, [("highpass", 22.0, 0.7, 0)])


def detect_kicks():
    P = np.load(os.path.join(WORK, "perc.npy")).astype(np.float32)
    S = np.abs(librosa.stft(P, n_fft=1024, hop_length=256))
    f = librosa.fft_frequencies(sr=22050, n_fft=1024)
    low = S[(f >= 40) & (f < 110)].sum(axis=0)
    oe = librosa.onset.onset_strength(S=librosa.amplitude_to_db(np.maximum(low, 1e-9))[None, :],
                                      sr=22050, hop_length=256)
    on = librosa.onset.onset_detect(onset_envelope=oe, sr=22050, hop_length=256, backtrack=False,
                                    pre_max=3, post_max=3, pre_avg=6, post_avg=6, delta=0.05, wait=4)
    t = librosa.frames_to_time(on, sr=22050, hop_length=256)
    st = oe[on]
    t = t[st > np.percentile(st, 45)]
    print(f"[kick] исходник: {len(t)} кик-событий")
    return t


def detect_bar_roots(H):
    sos = ss.butter(4, [60 / (SR / 2), 400 / (SR / 2)], btype="band", output="sos")
    x = ss.sosfiltfilt(sos, dsp.as_mono(H)).astype(np.float32)
    c = librosa.feature.chroma_cqt(y=x, sr=SR, fmin=librosa.note_to_hz("B1"), n_octaves=3,
                                   bins_per_octave=12)
    tt = librosa.frames_to_time(np.arange(c.shape[1]), sr=SR)
    roots, conf = [], []
    for k in range(-PRE_BARS, SRC_BARS_END + EXT_BARS):
        m = (tt >= bar(k)) & (tt < bar(k + 1))
        if m.sum() < 3:
            roots.append(-1)
            conf.append(0.0)
            continue
        p = c[:, m].mean(1)
        roots.append(int(np.argmax(p)))
        conf.append(float(p.max() / (p.mean() + 1e-9)))
    roots = np.array(roots)
    conf = np.array(conf)
    good = conf > 1.35
    if good.sum() > 4:
        idx = np.where(good)[0]
        filled = np.interp(np.arange(len(roots)), idx, roots[idx]).round().astype(int)
        filled = median_filter(filled, size=3)
        roots = np.where(good, roots, filled)
    print(f"[roots] уверенных тактов: {int(good.sum())}/{len(roots)}")
    return roots, conf


def dominant_drop_pc(roots):
    """Самый частый корень в дропах — для тюнинга кика и пэдов."""
    vals = [roots[b + PRE_BARS] for b in ALL_DROPS if 0 <= b + PRE_BARS < len(roots) and roots[b + PRE_BARS] >= 0]
    if not vals:
        return 6  # F#
    counts = np.bincount(np.array(vals) % 12, minlength=12)
    print(f"[harmony] частые корни в дропах: pc={int(np.argmax(counts))} (распределение {counts.tolist()})")
    return int(np.argmax(counts))


def section_root(roots, conf, b, span=8, min_conf=1.45):
    """Устойчивый корень для бара b: мода корней соседних уверенных тактов."""
    idx = [i for i in range(b - span, b + span + 1)
           if 0 <= i + PRE_BARS < len(roots) and roots[i + PRE_BARS] >= 0
           and conf[i + PRE_BARS] >= min_conf]
    if not idx:
        idx = [i for i in range(max(-PRE_BARS, b - span), min(len(roots) - PRE_BARS, b + span + 1))
               if roots[i + PRE_BARS] >= 0]
    if not idx:
        return 6
    vals = np.array([roots[i + PRE_BARS] for i in idx]) % 12
    return int(np.bincount(vals, minlength=12).argmax())


def pc_freq(pc, target_hz=65.0, lo_midi=24, hi_midi=59):
    """Питч-класс -> частота ближайшей октавы к целевой (для баса/кика)."""
    best = None
    for m in range(lo_midi, hi_midi + 1):
        if m % 12 != pc:
            continue
        f = float(librosa.midi_to_hz(m))
        if best is None or abs(np.log2(f / target_hz)) < abs(np.log2(best / target_hz)):
            best = f
    return best if best is not None else 65.4


# --------------------------------------------------------------------------------------
# барабаны
# --------------------------------------------------------------------------------------
def render_drums(n, off, kick_src, kick_hz, roots=None, conf=None):
    buf = np.zeros((2, n), dtype=np.float32)
    kick_by_pc = {pc: dsp.kick(SR, RNG, f_start=195.0, f_end=pc_freq(pc, 48.0), pitch_decay=0.028,
                               amp_decay=0.25, click=0.40, drive=2.1, punch=3.2) for pc in range(12)}
    kits = {
        "kick": dsp.kick(SR, RNG, f_start=195.0, f_end=kick_hz, pitch_decay=0.028,
                         amp_decay=0.25, click=0.40, drive=2.1, punch=3.2),
        "kick_soft": dsp.kick(SR, RNG, f_start=170.0, f_end=kick_hz * 1.06, amp_decay=0.21, click=0.22),
        "clap": dsp.clap(SR, RNG),
        "snare": dsp.snare(SR, RNG),
        "hat": dsp.hat(SR, RNG, f_hp=8200.0, decay=0.019),
        "hat_open": dsp.openhat(SR, RNG),
        "shaker": dsp.shaker(SR, RNG),
        "rim": dsp.rim(SR, RNG),
        "crash": dsp.crash(SR, RNG),
        "rev_crash": dsp.crash(SR, RNG, dur=1.7, decay=0.42)[:, ::-1].copy(),
        "impact": dsp.impact(SR, RNG),
        "subdrop": dsp.sub_drop(SR, RNG, f_start=kick_hz * 2.2, f_end=kick_hz * 0.72),
        "tom_hi": dsp.tom(SR, RNG, 190.0),
        "tom_lo": dsp.tom(SR, RNG, 120.0),
        "down": dsp.downlifter(SR, RNG),
    }
    kicks = []

    def put(name, t, g):
        dsp.add_at(buf, t + off, kits[name], SR, g)

    def put_kick_bar(t, g, b):
        """Кик, настроенный в корень такта (если он уверен) или в корень секции."""
        if roots is not None and b in ALL_DROPS:
            i = b + PRE_BARS
            if conf is not None and conf[i] >= 1.55:
                pc = int(roots[i]) % 12
            else:
                pc = section_root(roots, conf, b)
            dsp.add_at(buf, t + off, kick_by_pc[pc], SR, g)
        else:
            dsp.add_at(buf, t + off, kits["kick"], SR, g)

    # ---------------- DJ-интро ----------------
    for b in range(-PRE_BARS, 0):
        for q in range(4):
            put("kick_soft", beat(b, q), -4.5 if b >= -4 else -7.0)
            kicks.append(beat(b, q) + off)
        for k in range(16):
            put("hat", s16(b, k), -18.0 + (2.0 if k % 4 == 0 else 0.0) - (1.5 if b < -4 else 0))
            if k % 2 and b >= -4:
                put("shaker", s16(b, k), -26.0)
        if b >= -4:
            for q in (1, 3):
                put("clap", beat(b, q), -12.5)
        if b in (-2, -1):
            put("rim", s16(b, 7), -24.0)
            put("rim", s16(b, 15), -24.0)
    for k in range(16):
        put("snare", s16(-1, k), -17.0 + 7.0 * k / 15.0)

    # ---------------- кик-слой ----------------
    src_kick = np.asarray(kick_src)
    placed = []
    for b in range(0, SRC_BARS_END):
        eighth = b in KICK_EIGHTHS
        for k in range(16 if eighth else 4):
            t = s16(b, k) if eighth else beat(b, k)
            onbeat = abs(((t - bar(b)) % T_BEAT)) < 0.05
            near = bool(np.any(np.abs(src_kick - t) < 0.06)) if src_kick.size else False
            if b in ALL_DROPS or b in NOBASS:
                g = (-5.0 if onbeat else -8.5) if near else (-9.5 if onbeat else -12.5)
                if not onbeat and ((t - bar(b)) % T_BAR) > 1.5:
                    g -= 2.5
                put_kick_bar(t, g, b)
                placed.append(t)
            elif b in INTRO or b in BREAKS:
                if k % 4 == 0:
                    put("kick_soft", t, -8.0 if b in BREAKS else -9.0)
                    placed.append(t)
            else:
                put("kick_soft", t, -9.0)
                placed.append(t)
    for t in src_kick:
        if t > bar(SRC_BARS_END):
            continue
        if not placed or not np.any(np.abs(np.array(placed) - t) < 0.04):
            put_kick_bar(t, -7.0, 0)
            placed.append(t)
    kicks.extend([t + off for t in placed])

    # ---------------- клэп/снейр ----------------
    for b in sorted(CLAP_BARS):
        if not (-PRE_BARS <= b < SRC_BARS_END):
            continue
        for q in (1, 3):
            put("clap", beat(b, q), -8.0 if b in ALL_DROPS else -11.0)
            if b in ALL_DROPS:
                put("snare", beat(b, q), -13.5)
    for b in DOUBLE_CLAP_BARS:
        put("clap", s16(b, 11), -14.0)              # форшлаг перед филлом
        put("clap", s16(b, 11.5), -11.0)

    # ---------------- хэты/шейкеры/ратчеты ----------------
    for b in range(-PRE_BARS, SRC_BARS_END):
        if b not in HAT8_BARS:
            continue
        for k in range(16):
            if k % 2 == 0:
                put("hat", s16(b, k), -16.0 + (2.5 if k % 4 == 0 else 0.0))
            elif b in HAT16_BARS:
                put("hat", s16(b, k), -22.0)
        if b in ALL_DROPS:
            put("hat_open", s16(b, 14), -18.0)
        if b in SHAKER_BARS:
            for k in range(16):
                put("shaker", s16(b, k), -26.0 + (2.0 if k % 4 == 2 else 0.0))
        if b % 4 == 3 and b in ALL_DROPS:            # 32-е ратчеты в конце 4-тактовых фраз
            dsp.add_at(buf, s16(b, 12) + off, dsp.hat_roll(SR, RNG, n_ticks=8, span=0.38,
                                                          gain_ramp=(-22.0, -12.0)), SR, 0.0)
        if b in RATCHET_BARS:
            dsp.add_at(buf, s16(b, 12) + off, dsp.hat_roll(SR, RNG, n_ticks=6, span=0.36,
                                                          gain_ramp=(-20.0, -10.0)), SR, 0.0)

    # ---------------- FX ----------------
    for b in CRASH_BARS:
        put("crash", bar(b), -13.0)
    for b in IMPACT_BARS:
        put("impact", bar(b), -7.5)
        put("subdrop", bar(b), -7.0)
        put("rev_crash", bar(b) - 1.05, -12.5)
        put("down", bar(b), -15.0)
    for (a, b) in RISERS:
        dur = bar(b) - bar(a)
        if dur <= 0.2:
            continue
        g = -11.0 if a < 0 else (-13.0 if b in (7, 25, 31, 55, 95) else -10.5)
        dsp.add_at(buf, bar(a) + off, dsp.riser(SR, RNG, dur, 220, 12000, 2.4, tonal=True), SR, g)
    for b in sorted(FILL_BARS):
        for i, k in enumerate([12, 13, 14, 15]):
            put("tom_hi" if i % 2 == 0 else "tom_lo", s16(b, k), -13.0 + i * 1.5)
            put("snare", s16(b, k), -15.5 + i * 1.5)
            if i % 2:
                put("rim", s16(b, k), -19.0)
    for b in ROLL_BARS:
        for k in range(16):
            put("snare", s16(b, k), -17.0 + 8.0 * k / 15.0)
    for k in range(16):
        put("snare", s16(94, k), -17.0 + 8.0 * k / 15.0)
    return buf, np.array(sorted(kicks)), kits


# --------------------------------------------------------------------------------------
# бас
# --------------------------------------------------------------------------------------
def render_sub_layer(H, n, off):
    """Суб-октава низа исходника + синус по f0 исходника (там, где бас есть)."""
    Hm = dsp.as_mono(H)
    sos = ss.butter(4, [45 / (SR / 2), 150 / (SR / 2)], btype="band", output="sos")
    low = ss.sosfiltfilt(sos, Hm).astype(np.float32)
    sub_oct = librosa.effects.pitch_shift(low, sr=SR, n_steps=-12, res_type="soxr_hq")
    sub_oct = dsp.eq(sub_oct[None, :], SR, [("lowpass", 95.0, 0.7, 0), ("highpass", 27.0, 0.7, 0)])[0]
    env = uniform_filter1d(np.abs(low), int(0.02 * SR))
    gate = uniform_filter1d((env > np.percentile(env, 45)).astype(np.float32), int(0.05 * SR))
    sub_oct = sub_oct * gate
    f0, vflag, _ = librosa.pyin(low, fmin=48, fmax=170, sr=SR, hop_length=1024, frame_length=4096)
    step = 1024
    f0 = np.nan_to_num(f0 if f0 is not None else np.zeros(1), nan=0.0)
    f0s = uniform_filter1d(f0, 5)
    q = np.zeros_like(f0s)
    nz = f0s > 0
    q[nz] = librosa.midi_to_hz(np.round(librosa.hz_to_midi(f0s[nz])))
    q = np.repeat(q, step)
    v = np.repeat(vflag.astype(np.float32), step)
    m = min(len(q), len(sub_oct))
    sine = np.zeros_like(sub_oct)
    envn = np.clip(env / (np.percentile(env, 99) + 1e-9), 0, 1)
    sine[:m] = np.sin(2 * np.pi * np.cumsum(q[:m]) / SR) * v[:m] * envn[:m]
    sine = dsp.eq(np.stack([sine, sine]), SR, [("lowpass", 130.0, 0.7, 0)])
    return norm_stereo(sub_oct, -10.0), norm_stereo(sine, -11.5)


def render_bass(n, off, roots, kicks, conf=None):
    """Мид-бас-грув в тактах без баса + короткие бас-стабы в брейках."""
    buf = np.zeros((2, n), dtype=np.float32)
    kt = np.asarray(kicks)
    for b in NOBASS:
        pc = section_root(roots, conf if conf is not None else np.ones(len(roots)), b)
        print(f"    [bass] такт {b}: корень секции pc={pc} ({pc_freq(pc, 62.0):.1f} Гц)")
        f = pc_freq(pc, 62.0)                     # ~E1..D#2
        pattern = [(0.0, 1.0), (1.5, 1.0), (2.5, 0.5), (3.5, 1.0)]
        for q, octv in pattern:
            t = beat(b, q)
            note = f * octv
            dsp.add_at(buf, t + off, dsp.bass_pluck(SR, RNG, note, dur=0.34, drive=2.4), SR,
                       -7.0 if q in (0.0, 2.5) else -9.0)
            dsp.add_at(buf, t + off, dsp.bass_pluck(SR, RNG, note * 0.5, dur=0.30, drive=2.0,
                                                   sub=0.9, click=0.0), SR, -11.0)
        # 16-е призвуки на «и» перед 2 и 4
        for q in (1.75, 3.75):
            dsp.add_at(buf, beat(b, q) + off, dsp.bass_pluck(SR, RNG, f * 2, dur=0.16, drive=2.0), SR, -17.0)
    for b in BASS_STAB_BARS:
        pc = section_root(roots, conf if conf is not None else np.ones(len(roots)), b)
        f = pc_freq(pc, 62.0)
        for q in (0.0, 2.5):
            dsp.add_at(buf, beat(b, q) + off, dsp.bass_pluck(SR, RNG, f, dur=0.28, drive=2.2), SR, -12.5)
    return buf


def render_pads(n, off, roots, conf=None):
    buf = np.zeros((2, n), dtype=np.float32)
    for (a, b) in PAD_BARS:
        pc = section_root(roots, conf if conf is not None else np.ones(len(roots)), a)
        f = 2 * pc_freq(pc, 62.0)                 # октавой выше баса
        dur = (b - a) * T_BAR + 0.4
        p = dsp.pad(SR, RNG, f, dur, lp=2200.0, attack=0.5, release=1.2)
        dsp.add_at(buf, bar(a) + off, p, SR, -17.0)
    return buf


# --------------------------------------------------------------------------------------
# исходник
# --------------------------------------------------------------------------------------
def process_source(src):
    n = src.shape[1]

    def mask_fn(freqs, times):
        m = np.ones((freqs.size, times.size), dtype=np.float32)
        lows = [(23, 25, 500.0), (48, 52, 600.0), (88, 92, 600.0), (64, 66, 900.0),
                (104, 106, 1200.0), (0, 7, 3000.0)]
        for (a, b, floor) in lows:
            t0, t1 = bar(a), bar(b)
            u = np.clip((times - t0) / max(t1 - t0, 1e-6), 0, 1)
            fc = floor + (20000.0 - floor) * (1 - u) ** 2
            r = np.maximum(freqs[:, None], 1e-6) / fc[None, :]
            m = np.where(((times >= t0) & (times < t1))[None, :], np.minimum(m, 1.0 / (1.0 + r ** 4)), m)
        highs = [(4, 7), (29, 31), (40, 42), (50, 52), (63, 66), (72, 74), (89, 92), (91, 95)]
        for (a, b) in highs:
            t0, t1 = bar(a), bar(b)
            u = np.clip((times - t0) / max(t1 - t0, 1e-6), 0, 1)
            fc = 130.0 * (5000.0 / 130.0) ** (u ** 1.6)
            r = np.maximum(freqs[:, None], 1e-6) / fc[None, :]
            m = np.where(((times >= t0) & (times < t1))[None, :], np.minimum(m, r ** 3 / (1.0 + r ** 3)), m)
        return m

    y = dsp.stft_mask_filter(src, SR, mask_fn).astype(np.float32)
    gc.collect()
    for (a, b) in DROPOUTS:
        a0, b0 = int(bar(a) * SR), int(bar(b) * SR)
        y[:, a0:b0] *= (1.0 - 0.97 * np.linspace(0, 1, b0 - a0))[None, :]
    e = int(bar(94.5) * SR)
    y[:, e:int(bar(95) * SR)] *= (1.0 - np.linspace(0.0, 1.0, int(bar(95) * SR) - e))[None, :]
    for b in STUTTER_BARS:
        t0 = s16(b, 12)
        st = dsp.stutter(y, SR, t0, T_16, 8)
        a0 = int(t0 * SR)
        e0 = min(n, a0 + st.shape[1])
        y[:, a0:e0] = st[:, : e0 - a0]
    ts_len, ts_tail = 1.5, 0.4
    ts_start = n - int((ts_len + ts_tail) * SR)
    y[:, ts_start:] = 0.0
    dsp.add_at(y, ts_start / SR, dsp.tape_stop(src, SR, ts_start / SR, ts_len, curve=2.2), SR, 0.0)
    return y


def build_intro(src, n, off):
    a = int(bar(7) * SR)
    b = int(bar(11) * SR)
    loop = dsp.eq(src[:, a:b].copy(), SR, [("lowpass", 420.0, 0.7, 0), ("highpass", 70.0, 0.7, 0)])
    ir = dsp.reverb_ir(SR, RNG, decay=1.0, damp=3200.0)
    loop = loop + 0.4 * dsp.convolve_reverb(loop, SR, ir)
    out = np.zeros((2, n), dtype=np.float32)
    for i in range(PRE_BARS):
        seg = dsp.eq(loop, SR, [("highpass", 150.0, 0.7, 0)]) if (i % 4 in (2, 3)) else loop
        dsp.add_at(out, bar(-PRE_BARS + i) + off, seg, SR, -13.0 + 2.0 * (i >= 4))
    return out


def build_outro(src, n, off):
    a = int(bar(96) * SR)
    b = int(bar(100) * SR)
    seg = src[:, a:b].copy()
    out = np.zeros((2, n), dtype=np.float32)
    for i in range(2):
        dsp.add_at(out, bar(SRC_BARS_END + 4 * i) + off, seg, SR, -2.0 - 4.0 * i)
    return dsp.eq(out, SR, [("lowpass", 9000.0, 0.7, 0), ("highpass", 35.0, 0.7, 0)])


def render_hooks(src, n, off):
    buf = np.zeros((2, n), dtype=np.float32)
    a = int(beat(42, 0) * SR)
    b = int(beat(42, 2) * SR)
    sl = dsp.fade(src[:, a:b].copy(), SR, 0.003, 0.02)
    for bb in CHOP_BARS:
        if not (-PRE_BARS <= bb < SRC_BARS_END):
            continue
        for k in (0, 4, 6, 7, 8, 12, 14):
            dsp.add_at(buf, s16(bb, k) + off, sl, SR, -14.0 if bb < 0 else -16.5)
    tail = dsp.delay_fx(sl, SR, 0.2, feedback=0.42, mix=0.5, ping_pong=True, taps=4)
    dsp.add_at(buf, s16(47, 14) + off, tail, SR, -17.0)
    dsp.add_at(buf, s16(-1, 0) + off, tail, SR, -17.0)
    return buf


# --------------------------------------------------------------------------------------
# микс
# --------------------------------------------------------------------------------------
def suction(x, sr, times, length=0.2, curve=2.0, floor=0.02):
    """«Всасывание»: короткое затухание перед дропом (в конце — почти тишина)."""
    y = x.copy()
    ln = int(length * sr)
    for t in times:
        a = int((t - length) * sr)
        if a < 0 or a + ln > y.shape[1]:
            continue
        env = np.linspace(1.0, floor, ln) ** curve
        y[:, a:a + ln] *= env[None, :]
        # микро-фейд обратно, чтобы дроп ударил
        b = a + ln
        nf = min(y.shape[1] - b, int(0.004 * sr))
        if nf > 0:
            y[:, b:b + nf] *= np.linspace(0.35, 1.0, nf)[None, :]
    return y


def main():
    print("=== РЕМИКС v2 (max): 150.000 BPM, такт 1.6 с, фаза 0.084 с ===")
    ffmpeg = _ffmpeg_path()
    ensure_analysis()
    src = load_source()
    off = -bar(-PRE_BARS)
    n = int((off + bar(SRC_BARS_END + EXT_BARS) + 1.0) * SR)
    print(f"[1/8] исходник {src.shape[1]/SR:.2f} c -> ремикс {n/SR:.2f} c (интро {off:.2f} c)")

    kick_src = detect_kicks()
    H = np.load(os.path.join(WORK, "harm.npy")).astype(np.float32)
    H = librosa.resample(H, orig_sr=22050, target_sr=SR, axis=-1).astype(np.float32)
    roots, conf = detect_bar_roots(H)
    pc = dominant_drop_pc(roots)
    kick_hz = pc_freq(pc, 48.0)              # кик: ближайшая октава к 48 Гц
    print(f"[harmony] кик тюнен в {kick_hz:.2f} Гц")

    print("[2/8] барабаны")
    drums, kicks, kits = render_drums(n, off, kick_src, kick_hz, roots, conf)
    hooks = render_hooks(src, n, off)
    gc.collect()

    print("[3/8] бас и пэды")
    sub_oct, sub_sine = render_sub_layer(H, n, off)
    midbass = render_bass(n, off, roots, kicks, conf)
    pads = render_pads(n, off, roots, conf)
    del H
    gc.collect()

    print("[4/8] обработка исходника")
    src_p = process_source(src)
    gc.collect()
    intro = build_intro(src, n, off)
    outro = build_outro(src, n, off)
    del src
    gc.collect()

    print("[5/8] шинный микс")
    # ---- шина драм: HP, лёгкая компрессия, сатурация, лёгкая ширина
    drums = dsp.eq(drums, SR, [("highpass", 28.0, 0.7, 0)])
    drums = dsp.compressor(drums, SR, thr_db=-16.0, ratio=2.4, attack=0.004, release=0.09, mix=0.35)
    drums = 0.9 * drums + 0.1 * (np.tanh(1.5 * drums) / 1.5)
    # ---- шина сабов: моно-низ + сатурация
    subs_raw = sub_oct + sub_sine
    if subs_raw.shape[1] < n:
        subs_raw = np.pad(subs_raw, ((0, 0), (0, n - subs_raw.shape[1])))
    subs = dsp.eq(subs_raw, SR, [("highpass", 26.0, 0.7, 0), ("lowpass", 130.0, 0.7, 0)])
    subs = 0.85 * subs + 0.15 * (np.tanh(1.8 * subs) / 1.8)
    midbass = dsp.eq(midbass, SR, [("highpass", 45.0, 0.7, 0), ("peaking", 220.0, 1.0, 1.5)])
    bass_bus = subs + midbass

    # ---- исходник: HP 28, карвинг 300 Гц, сайдчейн под кики
    src_p = dsp.eq(src_p, SR, [("highpass", 28.0, 0.7, 0), ("peaking", 320.0, 1.0, -1.2)])
    src_buf = np.zeros((2, n), dtype=np.float32)
    dsp.add_at(src_buf, off, src_p, SR, 0.0)
    src_p_kept = src_buf.copy()
    del src_p
    gc.collect()
    trig = kicks[(kicks > 0.3) & (kicks < n / SR)]
    src_ducked = dsp.duck(src_buf, SR, trig, depth_db=-3.4, attack=0.002, release=0.10, hold=0.012)
    bass_ducked = dsp.duck(bass_bus, SR, trig, depth_db=-6.5, attack=0.002, release=0.115)
    pads_ducked = dsp.duck(pads, SR, trig, depth_db=-5.0, attack=0.004, release=0.16)
    del src_buf, bass_bus
    gc.collect()

    # ---- «всасывание» перед большими дропами
    suck_t = [bar(b) for b in SUCTION_BARS]
    src_ducked = suction(src_ducked, SR, suck_t, length=0.2)
    drums = suction(drums, SR, suck_t, length=0.2, floor=0.03)
    bass_ducked = suction(bass_ducked, SR, suck_t, length=0.2, floor=0.03)

    # ---- калибровка слоёв
    r_src = rms(src_ducked)
    targets = {"drums": 0.78, "bass": 0.52, "hooks": 0.17, "pads": 0.11,
               "intro": 0.33, "outro": 1.0}
    active = {"intro": (off, off + PRE_BARS * T_BAR), "outro": (bar(SRC_BARS_END) + off, n / SR)}
    pad_mask = np.zeros(n, dtype=bool)
    for (pa, pb) in PAD_BARS:
        pad_mask[max(0, int((bar(pa) + off) * SR)):min(n, int((bar(pb) + off) * SR))] = True
    layers = {"drums": drums, "bass": bass_ducked, "hooks": hooks, "pads": pads_ducked,
              "intro": intro, "outro": outro}
    layer_off = {"bass": 0.0}
    mixbuf = np.zeros((2, n), dtype=np.float32)
    gains = {}
    stems_dir = os.path.join(OUT_DIR, "stems")
    os.makedirs(stems_dir, exist_ok=True)
    for name, layer in layers.items():
        if name in active:
            a0 = max(0, int(active[name][0] * SR))
            b0 = min(layer.shape[1], int(active[name][1] * SR))
            r = rms(layer[:, a0:b0]) if b0 > a0 else rms(layer)
        elif name == "pads":
            sel = pad_mask[: layer.shape[1]]
            r = rms(layer[:, sel]) if sel.any() else rms(layer)
        else:
            r = rms(layer)
        if r < 1e-9:
            continue
        g = 20 * np.log10(targets[name] * r_src / r)
        if name not in ("intro", "outro"):
            stem_buf = np.zeros((2, n), dtype=np.float32)
            dsp.add_at(stem_buf, layer_off.get(name, 0.0), layer, SR, g)
            _write_audio(stem_buf, os.path.join(stems_dir, f"{name}.mp3"), ffmpeg, "192k")
            del stem_buf
        dsp.add_at(mixbuf, layer_off.get(name, 0.0), layer, SR, g)
        gains[name] = round(g, 2)
        print(f"    {name:6s} RMS {r:.4f} -> {g:+.2f} dB")
    _write_audio(src_p_kept, os.path.join(stems_dir, "source.mp3"), ffmpeg, "192k")
    del src_p_kept
    dsp.add_at(mixbuf, 0.0, src_ducked, SR, 0.0)
    print(f"    source RMS {r_src:.4f} (опора)")
    del layers, drums, bass_ducked, hooks, pads_ducked, intro, outro, src_ducked
    gc.collect()

    print("[6/8] мастер")
    pre = dsp.measure_lufs(mixbuf, SR)
    y = dsp.master(mixbuf.astype(np.float32), SR, target_lufs=TARGET_LUFS, ceiling_db=-0.3)
    del mixbuf
    gc.collect()
    lufs = dsp.measure_lufs(y, SR)
    tp = dsp.true_peak_db(y, SR)
    print(f"[6/8] микс {pre:.2f} LUFS -> мастер {lufs:.2f} LUFS, TP {tp:.2f} dBTP")

    print("[7/8] экспорт мастера")
    os.makedirs(OUT_DIR, exist_ok=True)
    wav = os.path.join(OUT_DIR, "handsgod_remix_master.wav")
    mp3 = os.path.join(OUT_DIR, "handsgod_remix_master.mp3")
    import soundfile as sf
    sf.write(wav, y.T, SR, subtype="PCM_24")
    ff = ffmpeg
    subprocess.run([ff, "-y", "-hide_banner", "-loglevel", "error", "-i", wav,
                    "-codec:a", "libmp3lame", "-b:a", "320k", mp3], check=True)

    print("[8/8] превью, соц-кат и стемы")
    preview = np.concatenate([y[:, int(bar(7) * SR): int(bar(15) * SR)],
                              y[:, int(bar(23) * SR): int(bar(26) * SR)]], axis=1)
    _write_audio(preview, os.path.join(OUT_DIR, "preview_1drop_build.mp3"), ff, mp3_quality="320k")
    # соц-кат ~20 c: билд (6.4 c) + дроп (12.8 c), с фейд-аутом
    social = np.concatenate([y[:, int(bar(27) * SR): int(bar(31) * SR)],
                             y[:, int(bar(31) * SR): int(bar(39) * SR)]], axis=1)
    social = dsp.fade(social, SR, 0.05, 1.2)
    _write_audio(social, os.path.join(OUT_DIR, "social_cut_20s.mp3"), ff, mp3_quality="320k")

    radio = build_radio_edit(y)
    radio_wav = os.path.join(OUT_DIR, "handsgod_remix_radio_edit.wav")
    sf.write(radio_wav, radio.T, SR, subtype="PCM_24")
    subprocess.run([ff, "-y", "-hide_banner", "-loglevel", "error", "-i", radio_wav,
                    "-codec:a", "libmp3lame", "-b:a", "320k",
                    os.path.join(OUT_DIR, "handsgod_remix_radio_edit.mp3")], check=True)
    print(f"    радио-редакция: {radio.shape[1]/SR:.1f} c, {dsp.measure_lufs(radio, SR):.2f} LUFS")
    del radio

    del preview, social
    gc.collect()

    info = dict(bpm=150.0, bar=1.6, phase=PHI, duration=round(n / SR, 2), lufs=round(lufs, 2),
                true_peak=round(tp, 2), pre_master_lufs=round(pre, 2), pre_bars=PRE_BARS,
                ext_bars=EXT_BARS, layer_gains=gains, wav=os.path.basename(wav),
                mp3=os.path.basename(mp3), kick_events_src=int(len(kick_src)),
                bars_total=SRC_BARS_END + EXT_BARS, kick_hz=round(kick_hz, 2),
                radio_edit="handsgod_remix_radio_edit.mp3")
    with open(os.path.join(OUT_DIR, "remix_info.json"), "w") as fh:
        json.dump(info, fh, indent=2, ensure_ascii=False)
    print(json.dumps(info, indent=2, ensure_ascii=False))


RADIO_BLOCKS = [(4, 7), (7, 23), (23, 25), (25, 41), (48, 52), (55, 71),
                (72, 74), (74, 90), (92, 95), (95, 103), (104, 108)]


def build_radio_edit(y):
    """Склейка мастера по тактам в компактную радио-версию (~2:24)."""
    chunks = []
    for (a, b) in RADIO_BLOCKS:
        s0 = int(bar(a) * SR)
        s1 = int(bar(b) * SR)
        seg = y[:, s0:s1].copy()
        seg = dsp.fade(seg, SR, 0.005, 0.006)
        chunks.append(seg)
    out = np.concatenate(chunks, axis=1)
    # мягкий общий фейд-аут в конце
    tail = min(out.shape[1], int(2.0 * SR))
    out[:, -tail:] *= np.linspace(1, 0, tail)[None, :] ** 1.5
    return out


def _ffmpeg_path():
    ff = subprocess.run(["which", "ffmpeg"], capture_output=True, text=True).stdout.strip()
    if not ff:
        import imageio_ffmpeg
        ff = imageio_ffmpeg.get_ffmpeg_exe()
    return ff


def _write_audio(x, path, ff, mp3_quality="320k"):
    import tempfile
    import soundfile as sf
    with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp:
        tmp_path = tmp.name
    sf.write(tmp_path, np.ascontiguousarray(x.T), SR, subtype="PCM_16")
    subprocess.run([ff, "-y", "-hide_banner", "-loglevel", "error", "-i", tmp_path,
                    "-codec:a", "libmp3lame", "-b:a", mp3_quality, path], check=True)
    os.remove(tmp_path)


if __name__ == "__main__":
    main()
