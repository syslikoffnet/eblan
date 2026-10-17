"""
synths.py — синтезаторы для нового трека: суперпила, плак-лид, формантный «вокал»,
слэп-бас, вокальные чопы.

Формантный вокал: глоттальный источник (пила с вибрато/джиттером) -> параллельные
резонаторы F1..F4 по гласной -> «певец» (буст 2.9 кГц) -> вибрато/дыхание.
Звучит синтетично, но поёт по нотам и всегда в тональности.
"""
from __future__ import annotations

import numpy as np
import scipy.signal as ss

import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "remix"))
import dsp  # noqa: E402

# форманты гласных (F1..F4, Гц) и полосы пропускания
VOWELS = {
    "a": ([800, 1150, 2900, 3900], [90, 110, 160, 220]),
    "e": ([400, 1600, 2700, 3300], [70, 100, 140, 200]),
    "i": ([300, 2200, 3000, 3600], [60, 90, 130, 180]),
    "o": ([450, 800, 2830, 3800], [70, 90, 150, 210]),
    "u": ([325, 700, 2530, 3500], [60, 80, 140, 200]),
    "y": ([350, 1400, 2500, 3400], [65, 95, 140, 190]),   # «ы»
}


def _saw_additive(freq, n, sr, phase0=0.0, kmax=48):
    t = np.arange(n) / sr
    out = np.zeros(n)
    fmax = min(sr / 2 * 0.9, freq * kmax)
    k = 1
    while freq * k < fmax:
        out += np.sin(2 * np.pi * freq * k * t + phase0 * k) / k
        k += 1
    return out * (2 / np.pi)


def supersaw(freq, n, sr, voices=7, detune_cents=14.0, lp=4200.0, q=0.7) -> np.ndarray:
    """Супep-pila: 7 голосов, расстроенных в ширину -> стерео."""
    t = np.arange(n) / sr
    det = np.linspace(-detune_cents, detune_cents, voices)
    L = np.zeros(n)
    R = np.zeros(n)
    rng = np.random.default_rng(int(freq * 100) % 99991)
    for i, c in enumerate(det):
        f = freq * 2 ** (c / 1200.0)
        ph = rng.uniform(0, 2 * np.pi)
        v = _saw_additive(f, n, sr, phase0=ph, kmax=30)
        pan = i / max(1, voices - 1)
        L += v * (1 - 0.75 * pan)
        R += v * (0.25 + 0.75 * pan)
    L /= voices
    R /= voices
    sos = ss.butter(2, min(0.95, lp / (sr / 2)), btype="lowpass", output="sos")
    L = ss.sosfilt(sos, L)
    R = ss.sosfilt(sos, R)
    return np.stack([L, R]).astype(np.float32)


def chord(freqs, n, sr, voices=5, detune=12.0, lp=3600.0) -> np.ndarray:
    acc = np.zeros((2, n), dtype=np.float32)
    for f in freqs:
        acc += supersaw(f, n, sr, voices=voices, detune_cents=detune, lp=lp)
    acc /= max(1, len(freqs))
    return dsp.norm_peak(acc, -8.0)


def pluck_lead(freq, n, sr, decay=0.20, bright=0.55, drive=1.3) -> np.ndarray:
    """Плак-лид: пила+квадрат, быстрый спад, короткий «вау» фильтра."""
    t = np.arange(n) / sr
    osc = 0.7 * _saw_additive(freq, n, sr, kmax=24) + 0.3 * np.sign(np.sin(2 * np.pi * freq * t))
    out = np.zeros(n)
    steps = 10
    for i in range(steps):
        a = i * n // steps
        b = min(n, (i + 1) * n // steps)
        if b <= a:
            continue
        fc = (900 + 5200 * bright) * np.exp(-i / 3.0) + 700
        sos = ss.butter(2, min(0.95, fc / (sr / 2)), btype="lowpass", output="sos")
        out[a:b] = ss.sosfilt(sos, osc)[a:b]
    env = np.exp(-t / decay) * (1 - np.exp(-t * 1200))
    x = np.tanh(drive * out * env)
    x = dsp.fade(x, sr, 0.001, 0.02)
    x = dsp.norm_peak(x, -4.0)
    # лёгкий стерео-разлёт
    return np.stack([x, np.roll(x, int(0.008 * sr))]).astype(np.float32)


def slap_bass(freq, n, sr, dur=None, punch=0.9) -> np.ndarray:
    """Слэп/оффбит-бас: саб-синус + пила, резкий фильтр-«кватч»."""
    t = np.arange(n) / sr
    sub = np.sin(2 * np.pi * freq * t) * np.exp(-t / (0.12 * punch))
    body = _saw_additive(freq * 2, n, sr, kmax=12) * np.exp(-t / 0.055)
    sos = ss.butter(2, min(0.9, 700 / (sr / 2)), btype="lowpass", output="sos")
    body = ss.sosfilt(sos, body)
    x = np.tanh(2.0 * (0.75 * sub + 0.45 * body))
    x = dsp.fade(x, sr, 0.0012, 0.015)
    return np.stack([x, x]).astype(np.float32)


def _resonator(x, sr, f, bw, gain):
    """Полосовой резонатор (RBJ bandpass, constant peak gain)."""
    q = max(0.5, f / max(bw, 20.0))
    w0 = 2 * np.pi * min(f, sr * 0.45) / sr
    alpha = np.sin(w0) / (2 * q)
    b = np.array([alpha, 0.0, -alpha])
    a = np.array([1 + alpha, -2 * np.cos(w0), 1 - alpha])
    return ss.lfilter(b / a[0], a / a[0], x) * gain


def vox_note(freq, n, sr, vowel="a", rng=None, vibrato=5.3, vib_depth=0.012,
             breath=0.03, attack=0.02, decay=None, jitter=0.004) -> np.ndarray:
    """Одна «пропетая» нота формантным синтезом."""
    rng = rng or np.random.default_rng(0)
    t = np.arange(n) / sr
    # вибрато + небольшой джиттер (живой голос)
    vib = 1.0 + vib_depth * np.sin(2 * np.pi * vibrato * t + rng.uniform(0, 6.28))
    jit = 1.0 + jitter * np.sin(2 * np.pi * 0.7 * t + rng.uniform(0, 6.28))
    f_t = freq * vib * jit
    ph = 2 * np.pi * np.cumsum(f_t) / sr
    # глоттальный источник: пила + слабая примесь синуса (мягче)
    src = 0.85 * (2 * ((ph / (2 * np.pi)) % 1.0) - 1.0) + 0.15 * np.sin(ph)
    src += breath * rng.standard_normal(n)
    F, BW = VOWELS.get(vowel, VOWELS["a"])
    gains = [1.0, 0.55, 0.32, 0.20]
    out = np.zeros(n)
    for f, bw, g in zip(F, BW, gains):
        out += _resonator(src, sr, f, bw, g)
    # «певец»/презенс и лёгкий де-эссер
    out = _resonator(out, sr, 2950.0, 260.0, 0.28)
    # голосовая огибающая
    if decay is None:
        env = np.minimum(1.0, t / attack) * np.minimum(1.0, (n / sr - t) / max(0.03, attack))
    else:
        env = np.minimum(1.0, t / attack) * np.exp(-(t - min(attack, t)) / decay)
    x = out * env
    x = np.tanh(1.1 * x)
    return dsp.norm_peak(x, -6.0).astype(np.float32)


def vox_phrase(notes, sr, rng, vowel="a", gap=0.06, legato=0.9, detune_cents=6.0,
               double=True) -> np.ndarray:
    """
    notes: [(freq, dur_sec), ...] — «поёт» фразу.
    double=True -> второй слой расстроен и сдвинут, получается толще.
    """
    total = int((sum(d for _, d in notes) + gap * len(notes)) * sr)
    buf = np.zeros((2, total), dtype=np.float32)
    pos = 0.0
    for f, d in notes:
        n = int((d + gap) * sr)
        x = vox_note(f * 2 ** (detune_cents / 1200.0), n, sr, vowel, rng,
                     decay=None, attack=0.025)
        dsp.add_at(buf, pos, np.stack([x, x]), sr, 0.0)
        if double:
            x2 = vox_note(f * 2 ** (-detune_cents / 1200.0), n, sr, "o", rng,
                          decay=None, attack=0.03, vibrato=5.0)
            dsp.add_at(buf, pos + 0.012, np.stack([x2 * 0.55, x2 * 0.45]), sr, -4.0)
        pos += d * legato
    return buf


def vocal_chop(x, sr, n_chop=4, sr_target=None):
    """Режет вокальную фразу на короткие чопы по громкости (для стабов)."""
    m = np.abs(dsp.as_mono(x))
    hop = max(1, int(0.01 * sr))
    env = m[: len(m) // hop * hop].reshape(-1, hop).max(axis=1)
    thr = np.percentile(env, 55)
    cuts = []
    i = 0
    while i < len(env):
        if env[i] > thr:
            j = i
            while j < len(env) and env[j] > thr * 0.6:
                j += 1
            cuts.append((i * hop, min(len(m), j * hop)))
            i = j + int(0.03 * sr / hop)
        else:
            i += 1
    cuts = sorted(cuts, key=lambda s: s[1] - s[0], reverse=True)[:n_chop]
    return [dsp.fade(x[:, a:b].copy(), sr, 0.004, 0.02) for a, b in cuts]


def xfade_concat(parts, sr, xf=0.02) -> np.ndarray:
    """Склейка кусков с кроссфейдом без щелчков."""
    if not parts:
        return np.zeros((2, 1), dtype=np.float32)
    out = parts[0]
    x = int(xf * sr)
    for p in parts[1:]:
        a = out[:, -x:].copy()
        b = p[:, :x].copy()
        ramp = np.linspace(0, 1, x)[None, :]
        out = np.concatenate([out[:, :-x], a * (1 - ramp) + b * ramp, p[:, x:]], axis=1)
    return out
