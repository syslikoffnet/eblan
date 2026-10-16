"""
make_remix.py — ремикс _handsgod.mp3 (жёсткая сетка 150.000 BPM).

Факты об исходнике (из анализа work/):
  * T = 400.000 мс (150.000 BPM), такт = 1.600 с, фаза (даунбит) = 0.084 с;
  * онсеты всех партий (кик/саб/снейр/хэты/лид) стоят на одной 8-й сетке (200 мс);
  * в барах 25-30 и 52-54 у исходника есть кики, но НЕТ баса — там ставим свой саб;
  * структура: интро 0-6, дроп 7-22, брейк 23-24, "кик-без-баса" 25-30, дроп 31-40,
    брейк 41, дроп 42-47, брейкдаун 48-51, 52-54 (кик без баса), дроп 55-63, брейк 64-65,
    дроп 66-72, брейк 73, дроп 74-87, брейкдаун 88-91, дроп 92-94, финальный дроп 95-103,
    аутро 104-105, тишина с ~106.

Что делает скрипт: синтезирует барабаны/FX/саб, собирает аранжировку, сайдчейнит, мастерит.
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
PHI = 0.084          # фаза сетки (даунбит бара 0)
T_BAR = 1.6          # 4 бита по 400 мс
TARGET_LUFS = -10.0  # целевая громкость мастера
T_BEAT = 0.4
T_8 = 0.2
T_16 = 0.1

PRE_BARS = 8         # DJ-интро перед треком
SRC_BARS_END = 106   # где музыка исходника заканчивается
EXT_BARS = 5         # аутро после исходника

# --- аранжировка (бары исходника) ---
INTRO = list(range(0, 7))
DROPS = [
    list(range(7, 23)),      # 1
    list(range(25, 31)),     # 2 (без баса у исходника -> наш саб)
    list(range(31, 41)),     # 3
    list(range(42, 48)),     # 4
    list(range(52, 55)),     # 5 (без баса)
    list(range(55, 64)),     # 6
    list(range(66, 73)),     # 7
    list(range(74, 88)),     # 8
    list(range(92, 95)),     # 9
    list(range(95, 104)),    # 10 финальный
]
ALL_DROPS = [b for d in DROPS for b in d]
NOBASS = list(range(25, 31)) + list(range(52, 55))

BREAKS = list(range(23, 25)) + [41] + list(range(48, 52)) + list(range(64, 66)) + [73] + list(range(88, 92))
HALF_BARS = set(BREAKS) | set(INTRO)
CLAP_BARS = set(ALL_DROPS) | set(INTRO) | set(NOBASS)
HAT8_BARS = set(range(-PRE_BARS, SRC_BARS_END))
HAT16_BARS = set(ALL_DROPS)
SHAKER_BARS = set(ALL_DROPS) | set(NOBASS)
KICK_EIGHTHS = set(ALL_DROPS) | set(NOBASS)     # кик на каждую 8-ю
FILL_BARS = [14, 22, 29, 39, 46, 62, 71, 86, 102, 103]
ROLL_BARS = [24, 51, 94]
RISERS = [(-2, 0), (4, 7), (23, 25), (29, 31), (40, 42), (50, 52), (63, 66), (72, 74), (89, 92), (91, 95)]
IMPACT_BARS = [7, 25, 31, 42, 52, 55, 66, 74, 92, 95, 104]
CRASH_BARS = [7, 11, 15, 19, 25, 28, 31, 35, 39, 42, 45, 52, 55, 59, 63, 66, 70, 74, 78, 82, 86, 92, 95, 99, 103]
CHOP_BARS = list(range(42, 48)) + list(range(-4, 0))
STUTTER_BARS = [24, 51, 94]
DROPOUTS = [(23.5, 25.0), (48.0, 52.0), (88.0, 92.0)]   # (бар_нач, бар_кон) — источник убирается


def bar(b: float) -> float:
    return PHI + b * T_BAR


def beat(b: float, q: float) -> float:
    return bar(b) + q * T_BEAT


def s16(b: float, k: float) -> float:
    """k — номер 16-й доли внутри бара (0..16)."""
    return bar(b) + k * T_16


# --------------------------------------------------------------------------------------
def load_source():
    y, _ = librosa.load(SRC_MP3, sr=SR, mono=False)
    y = np.ascontiguousarray(y.astype(np.float32))
    return dsp.eq(y, SR, [("highpass", 22.0, 0.7, 0)])


def rms(x):
    return float(np.sqrt(np.mean(x.astype(np.float64) ** 2)))


def norm_stereo(x, peak_db):
    p = float(np.max(np.abs(x)))
    if p < 1e-9:
        return x.astype(np.float32)
    return (x * (10 ** (peak_db / 20.0) / p)).astype(np.float32)


# --------------------------------------------------------------------------------------
# анализ исходника: кики, басовые корни по барам
# --------------------------------------------------------------------------------------
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
    """Корень (нота) по барам из гармонической составляющей 60-400 Гц."""
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
        filled = roots.copy()
        idx = np.where(good)[0]
        filled = np.interp(np.arange(len(roots)), idx, roots[idx]).round().astype(int)
        # медианная фильтрация по 3 барам
        filled = median_filter(filled, size=3)
        roots = np.where(good, roots, filled)
    print("[roots] уверенных баров:", int(good.sum()), "из", len(roots))
    return roots, conf


# --------------------------------------------------------------------------------------
# синтез партий
# --------------------------------------------------------------------------------------
def render_drums(n, off, kick_src):
    buf = np.zeros((2, n), dtype=np.float32)
    kits = {
        "kick": dsp.kick(SR, RNG),
        "kick_soft": dsp.kick(SR, RNG, f_start=180, f_end=52, amp_decay=0.22, click=0.22),
        "kick_sub": dsp.kick(SR, RNG, f_start=150, f_end=42, amp_decay=0.32, click=0.18, drive=2.4),
        "clap": dsp.clap(SR, RNG),
        "snare": dsp.snare(SR, RNG),
        "hat": dsp.hat(SR, RNG),
        "hat_open": dsp.openhat(SR, RNG),
        "shaker": dsp.shaker(SR, RNG),
        "crash": dsp.crash(SR, RNG),
        "rev_crash": dsp.crash(SR, RNG, dur=1.6, decay=0.4)[:, ::-1].copy(),
        "impact": dsp.impact(SR, RNG),
        "tom_hi": dsp.tom(SR, RNG, 190.0),
        "tom_lo": dsp.tom(SR, RNG, 120.0),
        "down": dsp.downlifter(SR, RNG),
    }
    kicks = []

    def put(name, t, g):
        dsp.add_at(buf, t + off, kits[name], SR, g)

    # ---------- DJ-интро ----------
    for b in range(-PRE_BARS, 0):
        for q in range(4):
            put("kick_soft", beat(b, q), -5.0 if b >= -4 else -7.5)
            kicks.append(beat(b, q) + off)
        for k in range(16):
            put("hat", s16(b, k), -19.0 + (2.0 if k % 4 == 0 else 0.0))
            if k % 2:
                put("shaker", s16(b, k), -25.0)
        if b >= -4:
            for q in (1, 3):
                put("clap", beat(b, q), -13.0)
    for k in range(16):
        put("snare", s16(-1, k), -17.0 + 7.0 * k / 15.0)

    # ---------- кик-слой ----------
    src_kick = np.asarray(kick_src)
    for b in range(0, SRC_BARS_END):
        eighth = b in KICK_EIGHTHS
        for k in range(16 if eighth else 4):
            t = s16(b, k) if eighth else beat(b, k)
            step = 0.1 if eighth else 0.4
            near = bool(np.any(np.abs(src_kick - t) < 0.06)) if src_kick.size else False
            if b in ALL_DROPS or b in NOBASS:
                onbeat = (t - bar(b)) % T_BEAT < 0.05
                if near:
                    g = -5.5 if onbeat else -8.5
                else:
                    g = -10.0 if onbeat else -13.0
                if not onbeat and (t - bar(b)) % T_BAR > 1.5 and b in ALL_DROPS:
                    g -= 3.0            # 8-я перед следующим тактом чуть тише (грув)
                put("kick", t, g)
                kicks.append(t + off)
            elif b in INTRO or b in BREAKS:
                if k % 4 == 0:                      # только доли
                    put("kick_soft", t, -8.0 if b in BREAKS else -9.0)
                    kicks.append(t + off)
            else:
                put("kick_soft", t, -9.0)
                kicks.append(t + off)
        del step
    # кики исходника, не попавшие в сетку
    for t in src_kick:
        if t > bar(SRC_BARS_END):
            continue
        if not np.any(np.abs(np.array(kicks) - (t + off)) < 0.04):
            put("kick", t, -7.0)
            kicks.append(t + off)

    # ---------- клэп/снейр ----------
    for b in sorted(CLAP_BARS):
        if not (-PRE_BARS <= b < SRC_BARS_END):
            continue
        for q in (1, 3):
            put("clap", beat(b, q), -8.5 if b in ALL_DROPS else -11.5)
            if b in ALL_DROPS:
                put("snare", beat(b, q), -14.0)

    # ---------- хэты/шейкер ----------
    for b in range(-PRE_BARS, SRC_BARS_END):
        if b not in HAT8_BARS:
            continue
        for k in range(16):
            if k % 2 == 0:
                put("hat", s16(b, k), -16.5 + (2.5 if k % 4 == 0 else 0.0))
            elif b in HAT16_BARS:
                put("hat", s16(b, k), -23.0)
        if b in ALL_DROPS:
            put("hat_open", s16(b, 14), -19.0)
        if b in SHAKER_BARS:
            for k in range(16):
                put("shaker", s16(b, k), -25.0 + (2.0 if k % 4 == 2 else 0.0))

    # ---------- FX ----------
    for b in CRASH_BARS:
        put("crash", bar(b), -13.5)
    for b in IMPACT_BARS:
        put("impact", bar(b), -8.5)
        put("rev_crash", bar(b) - 1.0, -13.0)
        put("down", bar(b), -15.0)
    for (a, b) in RISERS:
        dur = bar(b) - bar(a)
        if dur <= 0.2:
            continue
        g = -12.0 if a < 0 else (-13.5 if b in (7, 25, 31, 55, 95) else -11.5)
        dsp.add_at(buf, bar(a) + off, dsp.riser(SR, RNG, dur, 220, 12000, 2.4), SR, g)

    # ---------- заполнения ----------
    for b in FILL_BARS:
        for i, k in enumerate([12, 13, 14, 15]):
            put("tom_hi" if i % 2 == 0 else "tom_lo", s16(b, k), -14.0 + i * 1.5)
            put("snare", s16(b, k), -16.5 + i * 1.5)
    for b in ROLL_BARS:
        for k in range(16):
            put("snare", s16(b, k), -18.0 + 8.0 * k / 15.0)
    for k in range(16):
        put("snare", s16(94, k), -18.0 + 8.0 * k / 15.0)
    return buf, np.array(sorted(kicks)), kits


def render_hooks(src, n, off):
    buf = np.zeros((2, n), dtype=np.float32)
    a = int(beat(42, 0) * SR)
    b = int(beat(42, 2) * SR)
    sl = dsp.fade(src[:, a:b].copy(), SR, 0.003, 0.02)
    for bb in CHOP_BARS:
        if not (-PRE_BARS <= bb < SRC_BARS_END):
            continue
        for k in (0, 4, 6, 7, 8, 12, 14):
            dsp.add_at(buf, s16(bb, k) + off, sl, SR, -14.0 if bb < 0 else -16.0)
    tail = dsp.delay_fx(sl, SR, 0.2, feedback=0.4, mix=0.5, ping_pong=True, taps=4)
    dsp.add_at(buf, s16(47, 14) + off, tail, SR, -17.0)
    dsp.add_at(buf, s16(-1, 0) + off, tail, SR, -17.0)
    return buf


def render_subs(H):
    """Суб-слой: суб-октава низа исходника + синус по f0 (там, где у исходника бас)."""
    Hm = dsp.as_mono(H)
    sos = ss.butter(4, [45 / (SR / 2), 150 / (SR / 2)], btype="band", output="sos")
    low = ss.sosfiltfilt(sos, Hm).astype(np.float32)
    print(f"[subs] низ исходника: rms={rms(low):.4f} finite={np.isfinite(low).all()}")
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


def render_nobass_sub(roots, n, off, kicks_local):
    """Саб в барах, где у исходника нет баса: синус на корне бара по ритму киков."""
    buf = np.zeros((2, n), dtype=np.float32)
    kt = np.asarray(kicks_local)
    for b in NOBASS:
        root = roots[b + PRE_BARS]
        if root < 0:
            continue
        f = float(librosa.midi_to_hz(36 + root))     # C2..B2 (65-123 Гц) — в мид-бас
        f_low = f / 2.0
        hits = kt[(kt >= bar(b)) & (kt < bar(b + 1))]
        for t in hits:
            dur = 0.22
            nn = int(dur * SR)
            tt = np.arange(nn) / SR
            envl = np.exp(-tt / 0.10) * (1 - np.exp(-tt * 400))
            v = 0.8 * np.sin(2 * np.pi * f_low * tt) + 0.25 * np.sin(2 * np.pi * 2 * f_low * tt)
            dsp.add_at(buf, t + off, np.stack([v, v]) * envl, SR, -11.0)
    return buf


# --------------------------------------------------------------------------------------
# обработка исходника
# --------------------------------------------------------------------------------------
def process_source(src):
    n = src.shape[1]

    def mask_fn(freqs, times):
        m = np.ones((freqs.size, times.size), dtype=np.float32)
        for (a, b, floor) in [(23, 25, 500.0), (48, 52, 600.0), (88, 92, 600.0), (64, 66, 900.0),
                              (104, 106, 1200.0), (0, 7, 3000.0)]:
            t0, t1 = bar(a), bar(b)
            u = np.clip((times - t0) / max(t1 - t0, 1e-6), 0, 1)
            fc = floor + (20000.0 - floor) * (1 - u) ** 2
            r = np.maximum(freqs[:, None], 1e-6) / fc[None, :]
            m = np.where(((times >= t0) & (times < t1))[None, :], np.minimum(m, 1.0 / (1.0 + r ** 4)), m)
        for (a, b) in [(4, 7), (29, 31), (40, 42), (50, 52), (63, 66), (72, 74), (89, 92), (91, 95)]:
            t0, t1 = bar(a), bar(b)
            u = np.clip((times - t0) / max(t1 - t0, 1e-6), 0, 1)
            fc = 130.0 * (5000.0 / 130.0) ** (u ** 1.6)
            r = np.maximum(freqs[:, None], 1e-6) / fc[None, :]
            m = np.where(((times >= t0) & (times < t1))[None, :], np.minimum(m, r ** 3 / (1.0 + r ** 3)), m)
        return m

    y = dsp.stft_mask_filter(src, SR, mask_fn).astype(np.float32)
    gc.collect()

    # дроп-ауты и уходы в тишину
    for (a, b) in DROPOUTS:
        a0, b0 = int(bar(a) * SR), int(bar(b) * SR)
        y[:, a0:b0] *= (1.0 - 0.97 * np.linspace(0, 1, b0 - a0))[None, :]
    e = int(bar(94.5) * SR)          # вырубаем последнюю 8-ю перед финальным дропом
    y[:, e:int(bar(95) * SR)] *= (1.0 - np.linspace(0.0, 1.0, int(bar(95) * SR) - e))[None, :]

    # стуттеры
    for b in STUTTER_BARS:
        t0 = s16(b, 12)
        st = dsp.stutter(y, SR, t0, T_16, 8)
        a0 = int(t0 * SR)
        e0 = min(n, a0 + st.shape[1])
        y[:, a0:e0] = st[:, : e0 - a0]

    # тейп-стоп на самом конце
    ts_len, ts_tail = 1.5, 0.4
    ts_start = n - int((ts_len + ts_tail) * SR)
    y[:, ts_start:] = 0.0
    dsp.add_at(y, ts_start / SR, dsp.tape_stop(src, SR, ts_start / SR, ts_len, curve=2.2), SR, 0.0)
    return y


def build_intro(src, n, off):
    a = int(beat(7, 0) * SR)
    b = int(beat(11, 0) * SR)
    loop = dsp.eq(src[:, a:b].copy(), SR, [("lowpass", 420.0, 0.7, 0), ("highpass", 70.0, 0.7, 0)])
    ir = dsp.reverb_ir(SR, RNG, decay=1.0, damp=3200.0)
    loop = loop + 0.4 * dsp.convolve_reverb(loop, SR, ir)
    out = np.zeros((2, n), dtype=np.float32)
    for i in range(PRE_BARS):
        seg = dsp.eq(loop, SR, [("highpass", 150.0, 0.7, 0)]) if (i % 4 in (2, 3)) else loop
        dsp.add_at(out, bar(-PRE_BARS + i) + off, seg, SR, -13.0 + 2.0 * (i >= 4))
    return out


def build_outro(src, n, off):
    a = int(beat(96, 0) * SR)
    b = int(beat(100, 0) * SR)
    seg = src[:, a:b].copy()
    out = np.zeros((2, n), dtype=np.float32)
    for i in range(2):
        dsp.add_at(out, bar(SRC_BARS_END + 4 * i) + off, seg, SR, -2.0 - 4.0 * i)
    return dsp.eq(out, SR, [("lowpass", 9000.0, 0.7, 0), ("highpass", 35.0, 0.7, 0)])


# --------------------------------------------------------------------------------------
def main():
    print("=== ремикс: 150.000 BPM, такт 1.6 с, фаза 0.084 с ===")
    src = load_source()
    off = -bar(-PRE_BARS)
    n = int((off + bar(SRC_BARS_END + EXT_BARS) + 1.0) * SR)
    print(f"[1/7] исходник {src.shape[1]/SR:.2f} c -> ремикс {n/SR:.2f} c (интро {off:.2f} c)")

    kick_src = detect_kicks()
    H = np.load(os.path.join(WORK, "harm.npy")).astype(np.float32)
    H = librosa.resample(H, orig_sr=22050, target_sr=SR, axis=-1).astype(np.float32)
    roots, conf = detect_bar_roots(H)

    print("[2/7] синтез барабанов")
    drums, kicks, kits = render_drums(n, off, kick_src)
    hooks = render_hooks(src, n, off)
    gc.collect()

    print("[3/7] саб-бас")
    sub_oct, sub_sine = render_subs(H)
    nobass = render_nobass_sub(roots, n, off, kicks)
    subs = sub_oct + sub_sine
    if subs.shape[1] < n:
        subs = np.pad(subs, ((0, 0), (0, n - subs.shape[1])))
    del H
    gc.collect()

    print("[4/7] обработка исходника")
    src_p = process_source(src)
    gc.collect()
    intro = build_intro(src, n, off)
    outro = build_outro(src, n, off)
    del src
    gc.collect()

    print("[5/7] микс")
    src_buf = np.zeros((2, n), dtype=np.float32)
    dsp.add_at(src_buf, off, src_p, SR, 0.0)
    src_p_kept = src_buf.copy()          # для стема (до сайдчейна)
    del src_p
    gc.collect()
    trig = kicks[(kicks > 0.3) & (kicks < n / SR)]
    src_ducked = dsp.duck(src_buf, SR, trig, depth_db=-3.0, attack=0.002, release=0.10, hold=0.012)
    subs_all = subs + nobass
    subs_ducked = dsp.duck(subs_all, SR, trig, depth_db=-6.0, attack=0.002, release=0.12)
    del src_buf, subs, nobass, subs_all
    gc.collect()

    r_src = rms(src_ducked)
    targets = {"drums": 0.70, "subs": 0.46, "hooks": 0.18, "intro": 0.33, "outro": 1.0}
    active = {"intro": (off, off + PRE_BARS * T_BAR),
              "outro": (bar(SRC_BARS_END) + off, n / SR)}
    layers = {"drums": drums, "subs": subs_ducked, "hooks": hooks, "intro": intro, "outro": outro}
    layer_off = {"subs": off}                     # сабы живут в таймлайне исходника
    mixbuf = np.zeros((2, n), dtype=np.float32)
    gains = {}
    for name, layer in layers.items():
        if name in active:
            a0 = max(0, int(active[name][0] * SR))
            b0 = min(layer.shape[1], int(active[name][1] * SR))
            r = rms(layer[:, a0:b0]) if b0 > a0 else rms(layer)
        else:
            r = rms(layer)
        if r < 1e-9:
            continue
        g = 20 * np.log10(targets[name] * r_src / r)
        dsp.add_at(mixbuf, layer_off.get(name, 0.0), layer, SR, g)
        gains[name] = round(g, 2)
        print(f"    {name:6s} RMS {r:.4f} -> {g:+.2f} dB")
    dsp.add_at(mixbuf, 0.0, src_ducked, SR, 0.0)

    # --- стемы добавленных партий (те же гейны) для дальнейшей работы ---
    stems = {}
    for name in ("drums", "subs", "hooks"):
        if name in layers and name in gains:
            b = np.zeros((2, n), dtype=np.float32)
            dsp.add_at(b, layer_off.get(name, 0.0), layers[name], SR, gains[name])
            stems[name] = b
    stems["source"] = src_p_kept.copy()

    del layers, drums, subs_ducked, hooks, intro, outro, src_ducked
    gc.collect()
    print(f"    source RMS {r_src:.4f} (опора)")

    print("[6/7] мастеринг")
    y = mixbuf.astype(np.float32)
    del mixbuf
    gc.collect()
    pre = dsp.measure_lufs(y, SR)
    y = dsp.master(y, SR, target_lufs=TARGET_LUFS, ceiling_db=-0.3)
    print("    стат. лимитера:", dsp.limiter_stats(y, SR))
    lufs = dsp.measure_lufs(y, SR)
    tp = dsp.true_peak_db(y, SR)
    print(f"[6/7] микс {pre:.2f} LUFS -> мастер {lufs:.2f} LUFS, true peak {tp:.2f} dBTP")

    print("[7/7] экспорт")
    os.makedirs(OUT_DIR, exist_ok=True)
    wav = os.path.join(OUT_DIR, "handsgod_remix_master.wav")
    mp3 = os.path.join(OUT_DIR, "handsgod_remix_master.mp3")
    import soundfile as sf
    sf.write(wav, y.T, SR, subtype="PCM_24")
    ff = subprocess.run(["which", "ffmpeg"], capture_output=True, text=True).stdout.strip()
    if not ff:
        import imageio_ffmpeg
        ff = imageio_ffmpeg.get_ffmpeg_exe()
    subprocess.run([ff, "-y", "-hide_banner", "-loglevel", "error", "-i", wav,
                    "-codec:a", "libmp3lame", "-b:a", "320k", mp3], check=True)

    # --- стемы (mp3 192k) ---
    stems_dir = os.path.join(OUT_DIR, "stems")
    os.makedirs(stems_dir, exist_ok=True)
    for name, buf in stems.items():
        sw = os.path.join(stems_dir, f"{name}.wav")
        sm = os.path.join(stems_dir, f"{name}.mp3")
        sf.write(sw, buf.T, SR, subtype="PCM_16")
        subprocess.run([ff, "-y", "-hide_banner", "-loglevel", "error", "-i", sw,
                        "-codec:a", "libmp3lame", "-b:a", "192k", sm], check=True)
        os.remove(sw)
    del stems
    gc.collect()

    # --- превью: первый большой дроп (8 тактов) + второй билд ---
    prev_parts = []
    for (a, b) in [(7, 15), (23, 26)]:
        prev_parts.append(y[:, int(bar(a) * SR): int(bar(b) * SR)])
    preview = np.concatenate(prev_parts, axis=1)
    sf.write(os.path.join(OUT_DIR, "_preview.wav"), preview.T, SR, subtype="PCM_16")
    subprocess.run([ff, "-y", "-hide_banner", "-loglevel", "error",
                    "-i", os.path.join(OUT_DIR, "_preview.wav"),
                    "-codec:a", "libmp3lame", "-b:a", "320k",
                    os.path.join(OUT_DIR, "preview_1drop_build.mp3")], check=True)
    os.remove(os.path.join(OUT_DIR, "_preview.wav"))
    info = dict(bpm=150.0, bar=1.6, phase=PHI, duration=round(n / SR, 2), lufs=round(lufs, 2),
                true_peak=round(tp, 2), pre_master_lufs=round(pre, 2), pre_bars=PRE_BARS,
                ext_bars=EXT_BARS, layer_gains=gains, wav=os.path.basename(wav),
                mp3=os.path.basename(mp3), kick_events_src=int(len(kick_src)),
                bars_total=SRC_BARS_END + EXT_BARS)
    with open(os.path.join(OUT_DIR, "remix_info.json"), "w") as fh:
        json.dump(info, fh, indent=2, ensure_ascii=False)
    print(json.dumps(info, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    main()
