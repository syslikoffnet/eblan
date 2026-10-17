"""
make_track.py — новый трек «СИГНАЛ» (A-moll, 128 BPM).

Композиция полностью оригинальная: аккорды, бас-линия, хук, аранжировка.
Вокал: формантный синтез «поёт» хук (по нотам, всегда в тональности),
плюс реальный TTS-голос в брейке (файл track/vox/tts_raw.wav, если есть).

Структура под TikTok: хук звучит с первых секунд, дроп на 7.5 c.
"""
from __future__ import annotations

import json
import os
import subprocess
import sys

import numpy as np
import scipy.signal as ss

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
sys.path.insert(0, HERE)
sys.path.insert(0, os.path.join(ROOT, "remix"))
import dsp  # noqa: E402
import synths as S  # noqa: E402
import librosa  # noqa: E402

SR = 44100
BPM = 128.0
BEAT = 60.0 / BPM                 # 0.46875 c
BAR = 4 * BEAT                    # 1.875 c
OUT = os.path.join(ROOT, "track")
RNG = np.random.default_rng(4242)

# ----------------------------------------------------------------------------------
# ГАРМОНИЯ (A-moll)
# ----------------------------------------------------------------------------------
A2, C3, E3, F2, G2, B2, D3, G3, C4, E4, A4, B4, C5, D5, E5, F5, G5, A5 = [
    float(librosa.midi_to_hz(m)) for m in
    (45, 48, 52, 41, 43, 47, 50, 55, 60, 64, 69, 71, 72, 74, 76, 77, 79, 81)
]
A1, F1, C2, G1 = [float(librosa.midi_to_hz(m)) for m in (33, 29, 36, 31)]

# аккорд на такт: Am | F | C | G
CHORDS = [
    ("Am", [A2, C3, E3], A1),
    ("F", [F2, A2, C3], F1),
    ("C", [C3, E3, G3], C2),
    ("G", [G2, B2, D3], G1),
]
# хук: (такт в петле, доля, midi, длительность в долях) — 4 такта = 8 секунд
HOOK = [
    (0, 0.0, 69, 0.75), (0, 1.0, 72, 0.5), (0, 1.5, 76, 0.5), (0, 2.5, 72, 1.0),
    (1, 0.0, 69, 0.75), (1, 1.0, 72, 0.5), (1, 1.5, 77, 0.5), (1, 2.5, 72, 1.0),
    (2, 0.0, 67, 0.75), (2, 1.0, 72, 0.5), (2, 1.5, 76, 0.5), (2, 2.5, 72, 1.0),
    (3, 0.0, 67, 0.75), (3, 1.0, 71, 0.5), (3, 1.5, 74, 0.5), (3, 2.5, 71, 1.0),
]
# вокальная линия хука (поёт гласными): те же ноты, но короче и «по-песенному»
VOX_HOOK = [
    (0, 0.0, 69, 0.9, "a"), (0, 1.0, 72, 0.9, "a"), (0, 2.0, 76, 1.4, "a"),
    (1, 0.0, 69, 0.9, "a"), (1, 1.0, 72, 0.9, "a"), (1, 2.0, 77, 1.4, "a"),
    (2, 0.0, 67, 0.9, "o"), (2, 1.0, 72, 0.9, "o"), (2, 2.0, 76, 1.4, "o"),
    (3, 0.0, 67, 0.9, "o"), (3, 1.0, 71, 0.9, "o"), (3, 2.0, 74, 1.4, "o"),
]

# ----------------------------------------------------------------------------------
# аранжировка (в тактах)
# ----------------------------------------------------------------------------------
TEASER = (0, 2)          # хук а капелла + плак
GROOVE_IN = (2, 4)
DROP1 = (4, 20)
BREAK = (20, 24)
BUILD = (24, 28)
DROP2 = (28, 48)
OUTRO = (48, 52)
FINAL = (52, 56)
TAIL_BARS = 2

TOTAL_BARS = 56 + TAIL_BARS
N = int(TOTAL_BARS * BAR * SR)


def t_of(bar, beat=0.0):
    return bar * BAR + beat * BEAT


# ----------------------------------------------------------------------------------
# партии
# ----------------------------------------------------------------------------------
def render_drums():
    buf = np.zeros((2, N), dtype=np.float32)
    kit = dict(
        kick=dsp.kick(SR, RNG, f_start=200.0, f_end=49.0, pitch_decay=0.026,
                      amp_decay=0.23, click=0.38, drive=2.2, punch=3.0),
        kick_soft=dsp.kick(SR, RNG, f_start=170.0, f_end=52.0, amp_decay=0.20, click=0.20),
        clap=dsp.clap(SR, RNG),
        snare=dsp.snare(SR, RNG),
        hat=dsp.hat(SR, RNG, f_hp=8200.0, decay=0.018),
        hat_open=dsp.openhat(SR, RNG, decay=0.14),
        shaker=dsp.shaker(SR, RNG),
        crash=dsp.crash(SR, RNG),
        impact=dsp.impact(SR, RNG),
        subdrop=dsp.sub_drop(SR, RNG),
        rim=dsp.rim(SR, RNG),
    )
    kicks = []

    def put(name, bar, beat, g, dur=None):
        x = kit[name]
        dsp.add_at(buf, t_of(bar, beat), x, SR, g)

    # ---- кик: 4/4 во всех грувах
    for (a, b) in [GROOVE_IN, DROP1, BUILD, DROP2, FINAL]:
        for bar in range(a, b):
            soft = bar < GROOVE_IN[1]
            for q in range(4):
                put("kick_soft" if soft else "kick", bar, q, -6.0 if soft else -4.5)
                kicks.append(t_of(bar, q))
    # финальный акцент
    put("kick", FINAL[1] - 1, 3.0, -3.0)

    # ---- клэп 2/4
    for (a, b) in [GROOVE_IN, DROP1, DROP2, FINAL]:
        for bar in range(a, b):
            for q in (1, 3):
                put("clap", bar, q, -8.0 if bar >= DROP1[0] else -11.0)
    # ---- снейр в брейке (раз в 2 такта)
    for bar in range(*BREAK):
        if bar % 2 == 1:
            put("snare", bar, 3.0, -11.0)

    # ---- хэты и шейкеры
    for (a, b) in [(2, 20), (24, 48), (52, 56)]:
        for bar in range(a, b):
            for k in range(8):
                put("hat", bar, k * 0.5, -15.0 + (2.5 if k % 2 == 0 else 0.0))
            if bar >= 4:
                for k in range(8):
                    put("hat", bar, k * 0.5 + 0.25, -22.0)
                put("hat_open", bar, 3.5, -17.0)
                for k in range(16):
                    put("shaker", bar, k * 0.25, -27.0 + (2.0 if k % 4 == 2 else 0.0))
    # ---- ратчеты в конце 4-тактовых фраз
    for bar in range(3, TOTAL_BARS - 1, 4):
        if bar in range(*DROP1) or bar in range(*DROP2) or bar in range(*FINAL):
            dsp.add_at(buf, t_of(bar, 3.0), dsp.hat_roll(SR, RNG, n_ticks=8, span=0.42,
                                                         gain_ramp=(-24.0, -12.0)), SR, 0.0)
    # ---- FX
    for bar in [2, 4, 20, 24, 28, 48, 52]:
        dsp.add_at(buf, t_of(bar) - 0.9, dsp.crash(SR, RNG, dur=1.7, decay=0.42)[:, ::-1].copy(), SR, -13.0)
        dsp.add_at(buf, t_of(bar), kit["impact"], SR, -8.0)
        dsp.add_at(buf, t_of(bar), kit["subdrop"], SR, -6.5)
        dsp.add_at(buf, t_of(bar), kit["crash"], SR, -14.0)
    # райзеры в билдах
    for (a, b) in [(BUILD[0], BUILD[1]), (OUTRO[0], OUTRO[1])]:
        dur = (b - a) * BAR
        dsp.add_at(buf, t_of(a), dsp.riser(SR, RNG, dur, 200, 12000, 2.2, tonal=True), SR, -13.0)
    return buf, np.array(sorted(kicks))


def render_bass():
    """Оффбит-слэп: восьмые между бочками + даунбит в дропах."""
    buf = np.zeros((2, N), dtype=np.float32)
    for (a, b) in [GROOVE_IN, DROP1, BUILD, DROP2, FINAL]:
        for bar in range(a, b):
            name, notes, root = CHORDS[bar % 4]
            octv = 2.0 if bar >= DROP2[0] else 1.0
            r = root * octv / 2.0
            fifth = notes[2] / 2.0 * octv          # квинта аккорда ниже
            octave = r * 2.0
            #  1-я 8-я — корень, дальше движение: корень/квинта/октава
            line = [(0.0, r, 1.20), (0.5, r, 0.85), (1.5, r, 0.8),
                    (2.0, fifth, 0.75), (2.5, fifth, 0.8), (3.0, octave, 0.7), (3.5, r, 0.9)]
            for q, f, punch in line:
                n = int(0.20 * SR)
                x = S.slap_bass(f, n, SR, punch=punch)
                dsp.add_at(buf, t_of(bar, q), x, SR, -9.0 if q == 0 else -8.2)
                if q > 0:
                    x2 = S.slap_bass(f * 2.0, int(0.09 * SR), SR)
                    dsp.add_at(buf, t_of(bar, q), x2, SR, -19.5)
    return buf


def render_chords():
    buf = np.zeros((2, N), dtype=np.float32)
    for (a, b) in [GROOVE_IN, DROP1, BUILD, DROP2, OUTRO, FINAL]:
        for bar in range(a, b):
            name, notes, _ = CHORDS[bar % 4]
            dur = BAR
            x = S.chord(notes, int((dur + 0.1) * SR), SR, voices=5, detune=10.0,
                        lp=3200.0 if bar < DROP2[0] else 4200.0)
            g = -16.0 if bar < DROP1[0] else (-13.5 if bar < BREAK[0] else -12.5)
            dsp.add_at(buf, t_of(bar), x, SR, g)
    return buf


def render_pluck():
    buf = np.zeros((2, N), dtype=np.float32)
    hook_bars = list(range(*DROP1)) + list(range(*DROP2)) + list(range(*FINAL))
    for bar in hook_bars:
        for (hb, q, midi, d) in HOOK:
            if bar % 4 != hb:
                continue
            f = float(librosa.midi_to_hz(midi))
            n = int((d * BEAT + 0.25) * SR)
            x = S.pluck_lead(f, n, SR, decay=0.18, bright=0.6)
            dsp.add_at(buf, t_of(bar, q), x, SR, -13.0)
            # эхо-повтор на «и»
            dsp.add_at(buf, t_of(bar, q) + BEAT * 0.75, x, SR, -21.0)
    # хук соло в тизере
    for hb in range(0, 4):
        for (b0, q, midi, d) in HOOK:
            if b0 != hb:
                continue
            x = S.pluck_lead(float(librosa.midi_to_hz(midi)), int((d * BEAT + 0.25) * SR), SR,
                             decay=0.22, bright=0.7)
            dsp.add_at(buf, t_of(hb, q), x, SR, -11.0)
    return buf


def render_vox():
    """Формантный «вокал»: поёт хук. Плюс дабл-слой октавой ниже в дропах."""
    buf = np.zeros((2, N), dtype=np.float32)
    for bar in list(range(*DROP1)) + list(range(*DROP2)) + list(range(*FINAL)):
        for (hb, q, midi, d, vowel) in VOX_HOOK:
            if bar % 4 != hb:
                continue
            f = float(librosa.midi_to_hz(midi))
            n = int(d * BEAT * SR)
            x = np.stack([S.vox_note(f, n, SR, vowel, RNG, attack=0.03, vibrato=5.2)] * 2)
            dsp.add_at(buf, t_of(bar, q), x, SR, -8.0 if bar < DROP2[0] else -6.5)
            # октавный дабл (как бэк-вокал)
            x2 = np.stack([S.vox_note(f * 2, n, SR, "e", RNG, attack=0.04, vibrato=5.6)] * 2)
            dsp.add_at(buf, t_of(bar, q) + 0.01, x2, SR, -16.0)
            # «вдох» перед фразой
    # формантный слой в тизере тише, чтобы не спорить с голосом
    # хук а капелла в тизере (самый первый, до барабанов)
    for (hb, q, midi, d, vowel) in VOX_HOOK:
        f = float(librosa.midi_to_hz(midi))
        n = int(d * BEAT * SR)
        x = np.stack([S.vox_note(f, n, SR, vowel, RNG, attack=0.035)] * 2)
        dsp.add_at(buf, t_of(hb, q), x, SR, -7.0)
    # одиночная «а-а-а» на выходе
    for midi, q, d in [(76, 0, 1.5), (74, 1.5, 1.0), (72, 2.5, 1.5)]:
        x = np.stack([S.vox_note(float(librosa.midi_to_hz(midi)), int(d * BEAT * SR), SR, "a", RNG)] * 2)
        dsp.add_at(buf, t_of(OUTRO[0], q), x, SR, -12.0)
    return buf


def render_pads():
    buf = np.zeros((2, N), dtype=np.float32)
    for bar in range(*BREAK):
        notes = CHORDS[bar % 4][1]
        f = notes[0]
        x = dsp.pad(SR, RNG, f, BAR * 1.05, detune=0.01, lp=2200, attack=0.5, release=1.0)
        dsp.add_at(buf, t_of(bar), x, SR, -16.0)
    for bar in range(*OUTRO):
        x = dsp.pad(SR, RNG, CHORDS[bar % 4][1][0], BAR * 1.05, lp=1500,
                    attack=0.4, release=0.8)
        dsp.add_at(buf, t_of(bar), x, SR, -18.0)
    return buf


# ----------------------------------------------------------------------------------
# TTS-вокал: хук с 0:00, брейк, эдлибы и чопы
# ----------------------------------------------------------------------------------
VOX_DIR = os.path.join(HERE, "vox")
FILES = {"hook": "tts_hook_raw.mp3", "break": "tts_break_raw.mp3", "adlibs": "tts_adlibs_raw.mp3"}
SCALE_MIDI = [57, 59, 60, 62, 64, 65, 67, 69, 71, 72, 74, 76, 77, 79, 81, 83]


def load_voice(name):
    p = os.path.join(VOX_DIR, FILES[name])
    if not os.path.exists(p):
        return None
    x, _ = librosa.load(p, sr=SR, mono=True)
    x = x.astype(np.float32)
    m = np.abs(x)
    thr = 0.015 * m.max()
    idx = np.where(m > thr)[0]
    if len(idx):
        x = x[max(0, idx[0] - int(0.015 * SR)): min(len(x), idx[-1] + int(0.12 * SR))]
    return dsp.norm_peak(x, -3.0)


def fit_to_scale(x, target=69, max_shift=2):
    """Сдвиг фразы в ближайшую ноту A-moll (по медиане f0)."""
    f0, v, _ = librosa.pyin(x, fmin=80, fmax=300, sr=SR, frame_length=2048, hop_length=256)
    f0 = f0[np.isfinite(f0)]
    if not len(f0):
        return x, 0
    src = float(librosa.hz_to_midi(np.median(f0)))
    # для речи достаточно мягкой подстройки: не тащим голос в «бурундука»
    tgt = min(SCALE_MIDI, key=lambda mm: abs(mm - src))
    shift = int(round(tgt - src))
    shift = max(-max_shift, min(max_shift, shift))
    if shift:
        x = librosa.effects.pitch_shift(x, sr=SR, n_steps=shift, res_type="soxr_hq")
    return x, shift


def vocal_chain(x, pres=3.0, air=2.0, drive=1.15):
    """Цепочка на вокал: HP, презенс, де-эссер, лёгкая сатурация, компрессия."""
    y = dsp.dc_block(x[None, :], SR, 95.0)[0]
    y = dsp.eq(y[None, :], SR, [("peaking", 320.0, 1.0, -2.0),
                                ("peaking", 2800.0, 1.1, pres),
                                ("highshelf", 9000.0, 0.7, air)])[0]
    y = _deess(y)
    y = np.tanh(drive * y[None, :])[0] / drive
    y = dsp.compressor(y[None, :], SR, thr_db=-18.0, ratio=3.2, attack=0.004,
                       release=0.11, mix=0.85)[0]
    return dsp.norm_peak(y, -3.0)


def _deess(x, thresh=0.12):
    """Мягкий де-эссер: динамический срез 5.5-9 кГц по огибающей."""
    import librosa as _lr
    n_fft, hop = 1024, 256
    Sx = _lr.stft(x, n_fft=n_fft, hop_length=hop)
    f = _lr.fft_frequencies(sr=SR, n_fft=n_fft)
    band = (f >= 5500) & (f <= 9500)
    e = np.abs(Sx[band]).mean(0)
    e = dsp.uniform_filter1d(e, 5) if hasattr(dsp, "uniform_filter1d") else e
    env = np.clip(e / (np.percentile(e, 97) + 1e-9), 0, 1)
    red = 1.0 - 0.55 * np.clip((env - 0.35) / 0.65, 0, 1) ** 1.5
    mask = np.ones_like(np.abs(Sx))
    mask[band] = red[None, :]
    return _lr.istft(Sx * mask, hop_length=hop, length=len(x))


def _robot_double(x, semis=7, mix=0.35):
    """«Робот»-дабл: питч-шифт с сохранением длины + лёгкий хорус."""
    y = librosa.effects.pitch_shift(x, sr=SR, n_steps=semis, res_type="soxr_hq")
    y = np.roll(y, int(0.011 * SR))
    return (1 - mix) * x + mix * y


def render_tts():
    hook = load_voice("hook")
    brk = load_voice("break")
    ad = load_voice("adlibs")
    if hook is None:
        print("    [tts] нет голосовых файлов — только формантный вокал")
        return None, None, None
    hook, sh_h = fit_to_scale(hook, 69)
    hook = vocal_chain(hook)
    info = {"hook_shift": sh_h}

    buf = np.zeros((2, N), dtype=np.float32)
    hk = np.stack([hook, np.roll(hook, int(0.006 * SR))])
    dur = len(hook) / SR
    print(f"    [tts] хук {dur:.2f} c, сдвиг {sh_h:+d} пт")

    # ---- хук: тизер (а капелла + плак), затем в каждом дропе
    dsp.add_at(buf, t_of(0, 0.0), hk, SR, -4.4)
    dsp.add_at(buf, t_of(2, 0.0), hk, SR, -5.2)
    for (a, b) in [DROP1, BUILD, DROP2, FINAL]:
        dsp.add_at(buf, t_of(a, 0.0), hk, SR, -6.5)
        dsp.add_at(buf, t_of(a + 4, 0.0), hk, SR, -6.5) if (a + 4 < b) else None
        dsp.add_at(buf, t_of(a + 4, 0.0) + dur * 0.5, dsp.delay_fx(hk, SR, BEAT * 0.75,
                    feedback=0.35, mix=0.4, taps=3), SR, -17.0) if (a + 4 < b) else None

    # ---- брейк: главный «текст»
    if brk is not None:
        brk, sh_b = fit_to_scale(brk, 69)
        brk = vocal_chain(brk, pres=2.5)
        info["break_shift"] = sh_b
        print(f"    [tts] брейк {len(brk)/SR:.2f} c, сдвиг {sh_b:+d} пт")
        dsp.add_at(buf, t_of(BREAK[0], 0.0), np.stack([brk, np.roll(brk, 700)]), SR, -6.0)
        # дабл-эхо: тот же текст тише и с другой стороны
        dsp.add_at(buf, t_of(BREAK[0], 0.0) + 0.35, np.stack([brk, brk])[::-1], SR, -14.0)

    # ---- эдлибы: «громче! ярче! ещё!» — стабы на 8-х в дропах
    if ad is not None:
        ad, sh_a = fit_to_scale(ad, 74)
        ad = vocal_chain(ad, pres=3.5, drive=1.3)
        info["adlibs_shift"] = sh_a
        # режем на три отдельных возгласа по паузам
        m = np.abs(ad)
        hop = int(0.01 * SR)
        env = m[: len(m) // hop * hop].reshape(-1, hop).max(axis=1)
        thr = 0.10 * env.max()
        segs, i = [], 0
        while i < len(env):
            if env[i] > thr:
                j = i
                while j < len(env) and env[j] > thr * 0.5:
                    j += 1
                if (j - i) * hop > 0.06 * SR:
                    segs.append(dsp.fade(ad[i * hop: min(len(ad), j * hop)], SR, 0.004, 0.03))
                i = j + 1
            else:
                i += 1
        print(f"    [tts] эдлибы: {len(segs)} возгласов {[round(len(x)/SR,2) for x in segs]}")
        if segs:
            for bar in list(range(DROP1[0], DROP1[1])) + list(range(DROP2[0], DROP2[1])):
                if bar % 2 == 0:
                    continue
                for k, q in enumerate([3.0, 3.5, 3.75]):
                    x = segs[k % len(segs)]
                    if len(x) > 0.45 * SR:
                        continue
                    dsp.add_at(buf, t_of(bar, q), np.stack([x, x]), SR, -11.0)
    # ---- вокальные чопы для TikTok: повторяем первый слог на 16-х
    chop_len = int(0.13 * SR)
    ch = dsp.fade(hook[int(0.05 * SR): int(0.05 * SR) + chop_len].copy(), SR, 0.003, 0.02)
    for start in [t_of(DROP2[0], 3.0), t_of(FINAL[0], 3.0)]:
        for i in range(6):
            dsp.add_at(buf, start + i * BEAT * 0.25, np.stack([ch, ch]), SR, -13.0 + i * 1.5)
    return buf, info, hook


# ----------------------------------------------------------------------------------
# микс/мастер
# ----------------------------------------------------------------------------------
def sidechain(x, kicks, depth=-6.0, rel=0.12):
    return dsp.duck(x, SR, kicks, depth_db=depth, attack=0.002, release=rel)


def main():
    print("=== новый трек: A-moll, 128 BPM ===")
    os.makedirs(os.path.join(OUT, "vox"), exist_ok=True)
    print(f"длина: {N/SR:.1f} c ({TOTAL_BARS} тактов)")

    print("[1/5] барабаны")
    drums, kicks = render_drums()
    print("[2/5] бас, аккорды, плак, пэды")
    bass = render_bass()
    chords = render_chords()
    pluck = render_pluck()
    pads = render_pads()
    print("[3/5] вокал (формантный синтез)")
    vox = render_vox()
    print("[4/5] голос (TTS) и вокальная цепочка")
    tts, tts_info, hook_raw = render_tts()

    print("[5/5] микс и мастер")
    # шина драм
    drums_b = dsp.eq(drums, SR, [("highpass", 30.0, 0.7, 0)])
    drums_b = dsp.compressor(drums_b, SR, thr_db=-16.0, ratio=2.2, attack=0.005, release=0.10, mix=0.30)
    # бас
    bass_b = dsp.eq(bass, SR, [("highpass", 30.0, 0.7, 0), ("peaking", 120.0, 1.0, 1.5)])
    bass_b = 0.85 * bass_b + 0.15 * np.tanh(2.0 * bass_b) / 2.0
    # сайдчейн
    ch = sidechain(chords, kicks, -7.0, 0.13)
    pl = sidechain(pluck, kicks, -3.0, 0.10)
    bs = sidechain(bass_b, kicks, -4.0, 0.11)
    vx = sidechain(vox, kicks, -1.5, 0.09)

    def active_rms(layer, frame=0.05, thr_db=-32.0):
        """RMS только по «звучащим» участкам (иначе разреженные партии перегружаются)."""
        m = np.abs(dsp.as_mono(layer))
        hop = max(1, int(frame * SR))
        nfr = len(m) // hop
        if nfr == 0:
            return float(np.sqrt(np.mean(layer.astype(np.float64) ** 2)))
        e = np.sqrt(np.mean(m[: nfr * hop].reshape(nfr, hop) ** 2, axis=1))
        ref = e.max() + 1e-9
        sel = e > ref * (10 ** (thr_db / 20.0))
        return float(np.sqrt(np.mean(e[sel] ** 2))) if sel.any() else float(e.mean())

    layers = {
        "drums": (drums_b, 0.95),
        "bass": (bs, 0.62),
        "chords": (ch, 0.42),
        "pluck": (pl, 0.30),
        "vox": (vx, 0.50),
        "pads": (pads, 0.20),
    }
    if tts is not None:
        layers["tts"] = (tts, 1.15)      # голос — главный элемент, громче формантного слоя
    mix = np.zeros((2, N), dtype=np.float32)
    ref = active_rms(drums_b)
    for name, (layer, tgt) in layers.items():
        r = active_rms(layer)
        g = 20 * np.log10(max(1e-6, tgt * ref / max(r, 1e-9)))
        dsp.add_at(mix, 0.0, layer, SR, g)
        print(f"    {name:7s} RMS(акт) {r:.4f} -> {g:+.1f} dB")

    # реверб на вокал/плак (общий сенд)
    ir = dsp.reverb_ir(SR, RNG, decay=1.8, pre=0.03, damp=5200.0)
    wet = dsp.convolve_reverb(vox * 0.6 + pluck * 0.35, SR, ir)
    mix += dsp.eq(wet, SR, [("highpass", 300.0, 0.7, 0)]) * (10 ** (-19 / 20.0))

    lufs_in = dsp.measure_lufs(mix, SR)
    y = dsp.master(mix, SR, target_lufs=-8.5, ceiling_db=-0.3)
    print(f"[master] {lufs_in:.2f} -> {dsp.measure_lufs(y, SR):.2f} LUFS, TP {dsp.true_peak_db(y, SR):+.2f}")

    import soundfile as sf
    wav = os.path.join(OUT, "signal_master.wav")
    mp3 = os.path.join(OUT, "signal_master.mp3")
    sf.write(wav, y.T, SR, subtype="PCM_24")
    ff = subprocess.run(["which", "ffmpeg"], capture_output=True, text=True).stdout.strip()
    if not ff:
        import imageio_ffmpeg
        ff = imageio_ffmpeg.get_ffmpeg_exe()
    subprocess.run([ff, "-y", "-hide_banner", "-loglevel", "error", "-i", wav,
                    "-codec:a", "libmp3lame", "-b:a", "320k", mp3], check=True)

    # TikTok-нарезки
    def cut(a, b, name):
        seg = y[:, int(a * SR):int(b * SR)]
        seg = dsp.fade(seg, SR, 0.005, 0.6)
        p = os.path.join(OUT, name)
        sf.write(p.replace(".mp3", ".wav"), seg.T, SR, subtype="PCM_16")
        subprocess.run([ff, "-y", "-hide_banner", "-loglevel", "error",
                        "-i", p.replace(".mp3", ".wav"), "-codec:a", "libmp3lame", "-b:a", "320k", p],
                       check=True)
        os.remove(p.replace(".mp3", ".wav"))
        print(f"    {name}: {b-a:.1f} c")
    cut(0.0, 15.0, "tiktok_15s.mp3")
    cut(t_of(DROP2[0]), t_of(DROP2[0]) + 30.0, "tiktok_30s.mp3")

    info = dict(bpm=BPM, key="A minor", bars=TOTAL_BARS, duration=round(N / SR, 2),
                lufs=round(dsp.measure_lufs(y, SR), 2), true_peak=round(dsp.true_peak_db(y, SR), 2),
                tts=tts is not None, tts_info=tts_info,
                hook_at=f"{t_of(0):.2f}s", drop_at=f"{t_of(DROP1[0]):.2f}s")
    with open(os.path.join(OUT, "track_info.json"), "w") as fh:
        json.dump(info, fh, indent=2, ensure_ascii=False)
    print(json.dumps(info, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    main()
