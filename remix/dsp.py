"""
dsp.py — синтезаторный/мастеринговый тулкит для ремикса.
Зависимости: numpy, scipy, librosa (только STFT/ресемплинг), soundfile (в вызывающем коде).

Моно — shape (n,), стерео — shape (2, n).
"""
from __future__ import annotations

import numpy as np
import scipy.signal as ss
from scipy.ndimage import minimum_filter1d, uniform_filter1d

# --------------------------------------------------------------------------------------
# утилиты
# --------------------------------------------------------------------------------------


def to_stereo(x: np.ndarray) -> np.ndarray:
    if x.ndim == 1:
        return np.stack([x, x])
    return x


def as_mono(x: np.ndarray) -> np.ndarray:
    return x.mean(axis=0) if x.ndim == 2 else x


def norm_peak(x: np.ndarray, peak_db: float = -0.5) -> np.ndarray:
    p = float(np.max(np.abs(x)))
    if p < 1e-12:
        return x
    return x * (10 ** (peak_db / 20.0) / p)


def db(x):
    return 20 * np.log10(np.maximum(np.abs(x), 1e-12))


def gain(x, db_val):
    return x * (10 ** (db_val / 20.0))


def fade(x: np.ndarray, sr: int, fade_in: float = 0.002, fade_out: float = 0.005) -> np.ndarray:
    x = x.copy()
    n = x.shape[-1]
    a = min(int(fade_in * sr), n // 2)
    b = min(int(fade_out * sr), n // 2)
    if a > 0:
        x[..., :a] *= np.linspace(0, 1, a) ** 0.5
    if b > 0:
        x[..., -b:] *= np.linspace(1, 0, b) ** 0.5
    return x


def add_at(buf: np.ndarray, t: float, x: np.ndarray, sr: int, gain_db: float = 0.0):
    """Сложить сигнал x (2,n) в буфер buf (2,n) начиная со времени t (сек)."""
    st = int(round(t * sr))
    if st < 0:
        x = x[:, -st:]
        st = 0
    if st >= buf.shape[1]:
        return
    en = min(buf.shape[1], st + x.shape[1])
    if en > st:
        buf[:, st:en] += gain(x[:, : en - st], gain_db)


# --------------------------------------------------------------------------------------
# фильтры (RBJ biquad) + STFT-маски для свипов
# --------------------------------------------------------------------------------------


def _biquad(kind, sr, f0, Q=0.707, gain_db=0.0):
    A = 10 ** (gain_db / 40.0)
    w0 = 2 * np.pi * f0 / sr
    cw, sw = np.cos(w0), np.sin(w0)
    alpha = sw / (2 * Q)
    if kind == "peaking":
        b = [1 + alpha * A, -2 * cw, 1 - alpha * A]
        a = [1 + alpha / A, -2 * cw, 1 - alpha / A]
    elif kind == "lowshelf":
        sq = 2 * np.sqrt(A) * alpha
        b = [A * ((A + 1) - (A - 1) * cw + sq), 2 * A * ((A - 1) - (A + 1) * cw), A * ((A + 1) - (A - 1) * cw - sq)]
        a = [(A + 1) + (A - 1) * cw + sq, -2 * ((A - 1) + (A + 1) * cw), (A + 1) + (A - 1) * cw - sq]
    elif kind == "highshelf":
        sq = 2 * np.sqrt(A) * alpha
        b = [A * ((A + 1) + (A - 1) * cw + sq), -2 * A * ((A - 1) + (A + 1) * cw), A * ((A + 1) + (A - 1) * cw - sq)]
        a = [(A + 1) - (A - 1) * cw + sq, 2 * ((A - 1) - (A + 1) * cw), (A + 1) - (A - 1) * cw - sq]
    elif kind == "lowpass":
        b = [(1 - cw) / 2, 1 - cw, (1 - cw) / 2]
        a = [1 + alpha, -2 * cw, 1 - alpha]
    elif kind == "highpass":
        b = [(1 + cw) / 2, -(1 + cw), (1 + cw) / 2]
        a = [1 + alpha, -2 * cw, 1 - alpha]
    else:
        raise ValueError(kind)
    return np.array(b) / a[0], np.array(a) / a[0]


def eq(x: np.ndarray, sr: int, bands) -> np.ndarray:
    """bands: список (kind, f0, Q, gain_db) — каскад биквадов."""
    y = x
    for kind, f0, Q, g in bands:
        if abs(g) < 1e-6 and kind not in ("lowpass", "highpass"):
            continue
        b, a = _biquad(kind, sr, f0, Q, g)
        y = ss.sosfilt(ss.tf2sos(b, a), y, axis=-1)
    return y


def dc_block(x, sr, f=22.0, order=2):
    sos = ss.butter(order, f / (sr / 2), btype="highpass", output="sos")
    return ss.sosfilt(sos, x, axis=-1)


def stft_mask_filter(x: np.ndarray, sr: int, fn) -> np.ndarray:
    """Времязависимая фильтрация через маску STFT: fn(freqs, times) -> mask (F,T) в [0,1]."""
    import librosa

    n_fft, hop = 1024, 256
    stereo = np.ndim(x) == 2
    y = np.atleast_2d(np.asarray(x, dtype=np.float32))
    out = np.zeros_like(y)
    for ch in range(y.shape[0]):
        S = librosa.stft(y[ch], n_fft=n_fft, hop_length=hop).astype(np.complex64)
        freqs = librosa.fft_frequencies(sr=sr, n_fft=n_fft)
        times = librosa.frames_to_time(np.arange(S.shape[1]), sr=sr, hop_length=hop)
        m = np.asarray(fn(freqs, times), dtype=np.float32)
        out[ch] = librosa.istft(S * m, hop_length=hop, length=y.shape[1])
        del S
    return out if stereo else out[0]


# --------------------------------------------------------------------------------------
# барабаны / перкуссия
# --------------------------------------------------------------------------------------


def kick(sr: int, rng: np.random.Generator, dur: float = 0.55, f_start: float = 210.0,
         f_end: float = 47.0, pitch_decay: float = 0.030, amp_decay: float = 0.27,
         click: float = 0.35, drive: float = 1.9, punch: float = 3.0) -> np.ndarray:
    n = int(dur * sr)
    t = np.arange(n) / sr
    f = f_end + (f_start - f_end) * np.exp(-t / pitch_decay)
    ph = 2 * np.pi * np.cumsum(f) / sr
    body = np.sin(ph) * np.exp(-t / amp_decay)
    body *= 1.0 - np.exp(-t * 2000.0)
    cl = ss.sosfilt(ss.tf2sos(*_biquad("highpass", sr, 2500.0, 0.7, 0)), rng.standard_normal(n))
    cl *= np.exp(-t / 0.0035)
    x = body + 0.5 * click * cl
    x = np.tanh(drive * x) / np.tanh(drive)
    x *= np.exp(-t / (amp_decay * punch)) * 0.5 + 0.5 * np.exp(-t / (amp_decay * 2.2))
    x = fade(x, sr, 0.0005, 0.02)
    return to_stereo(norm_peak(x, -3.0))


def snare(sr: int, rng, dur: float = 0.35, tone: float = 185.0, tone2: float = 330.0,
          noise_decay: float = 0.12, tone_decay: float = 0.055) -> np.ndarray:
    n = int(dur * sr)
    t = np.arange(n) / sr
    tonal = (np.sin(2 * np.pi * tone * t) + 0.7 * np.sin(2 * np.pi * tone2 * t)) * np.exp(-t / tone_decay)
    nz = rng.standard_normal((2, n))
    nz = ss.sosfilt(ss.tf2sos(*_biquad("highpass", sr, 250.0, 0.7, 0)), nz, axis=-1)
    nz = ss.sosfilt(ss.tf2sos(*_biquad("lowpass", sr, 9000.0, 0.7, 0)), nz, axis=-1)
    nz *= np.exp(-t / noise_decay)
    x = np.stack([tonal * 0.9 + nz[0] * 0.85, tonal * 0.9 + nz[1] * 0.85])
    x = np.tanh(1.4 * x * 0.8)
    x = fade(x, sr, 0.0004, 0.01)
    return norm_peak(x, -3.5)


def clap(sr: int, rng, dur: float = 0.42) -> np.ndarray:
    n = int(dur * sr)
    t = np.arange(n) / sr
    x = np.zeros((2, n))
    for off, amp in [(0.0, 1.0), (0.010, 0.75), (0.021, 0.6), (0.032, 0.5), (0.045, 0.42)]:
        w = int(0.06 * sr)
        seg = rng.standard_normal((2, w)) * amp * np.exp(-np.arange(w) / (0.011 * sr))
        s0 = int(off * sr)
        e = min(n, s0 + w)
        x[:, s0:e] += seg[:, : e - s0]
    x = x + rng.standard_normal((2, n)) * np.exp(-t / 0.20) * 0.55
    for ch in range(2):
        x[ch] = ss.sosfilt(ss.tf2sos(*_biquad("highpass", sr, 700.0 + 120 * ch, 0.7, 0)), x[ch])
        x[ch] = ss.sosfilt(ss.tf2sos(*_biquad("lowpass", sr, 5200.0, 0.7, 0)), x[ch])
        x[ch] = ss.sosfilt(ss.tf2sos(*_biquad("peaking", sr, 1800.0, 1.0, 4.0)), x[ch])
    x = np.tanh(1.3 * x)
    return norm_peak(fade(x, sr, 0.0004, 0.02), -4.0)


def hat(sr: int, rng, dur: float = 0.07, f_hp: float = 7500.0, decay: float = 0.022,
        metallic: float = 0.25, pan: float = 0.0) -> np.ndarray:
    n = int(dur * sr)
    t = np.arange(n) / sr
    nz = rng.standard_normal((2, n))
    nz = ss.sosfilt(ss.tf2sos(*_biquad("highpass", sr, f_hp, 0.7, 0)), nz, axis=-1)
    met = np.zeros((2, n))
    for f in (5200.0, 6800.0, 8900.0, 11200.0):
        met += np.sin(2 * np.pi * f * t) * np.exp(-t / (decay * 1.4))
    x = nz * 0.9 + metallic * met * 0.25
    x *= np.exp(-t / decay)
    if pan != 0.0:
        x = x * np.array([[np.sqrt(max(0.0, 1.0 - pan))], [np.sqrt(min(2.0, 1.0 + pan))]])
    return norm_peak(fade(x, sr, 0.0002, 0.012), -6.0)


def openhat(sr: int, rng, dur: float = 0.45, f_hp: float = 6500.0, decay: float = 0.16) -> np.ndarray:
    return hat(sr, rng, dur=dur, f_hp=f_hp, decay=decay, metallic=0.35)


def shaker(sr: int, rng, dur: float = 0.09, decay: float = 0.03, pan: float = 0.35) -> np.ndarray:
    n = int(dur * sr)
    t = np.arange(n) / sr
    nz = rng.standard_normal((2, n))
    nz = ss.sosfilt(ss.tf2sos(*_biquad("highpass", sr, 4500.0, 0.7, 0)), nz, axis=-1)
    nz = ss.sosfilt(ss.tf2sos(*_biquad("lowpass", sr, 12000.0, 0.7, 0)), nz, axis=-1)
    x = nz * np.exp(-t / decay) * (1 - np.exp(-t * 900))
    x *= np.array([[0.7 + 0.3 * pan], [0.7 - 0.3 * pan]])
    return norm_peak(fade(x, sr, 0.0003, 0.008), -8.0)


def crash(sr: int, rng, dur: float = 2.2, decay: float = 0.55, brightness: float = 1.0) -> np.ndarray:
    n = int(dur * sr)
    t = np.arange(n) / sr
    x = rng.standard_normal((2, n)) * np.exp(-t / decay)
    x = ss.sosfilt(ss.tf2sos(*_biquad("highpass", sr, 2200.0 * brightness, 0.7, 0)), x, axis=-1)
    x += rng.standard_normal((2, n)) * np.exp(-t / (decay * 3.5)) * 0.25
    x = np.tanh(1.2 * x)
    return norm_peak(fade(x, sr, 0.0006, 0.25), -8.0)


def impact(sr: int, rng, dur: float = 2.6, f_start: float = 130.0, f_end: float = 32.0) -> np.ndarray:
    n = int(dur * sr)
    t = np.arange(n) / sr
    f = f_end + (f_start - f_end) * np.exp(-t / 0.12)
    ph = 2 * np.pi * np.cumsum(f) / sr
    sub = np.sin(ph) * np.exp(-t / 0.55)
    boom = ss.sosfilt(ss.tf2sos(*_biquad("lowpass", sr, 300.0, 0.7, 0)), rng.standard_normal((2, n)), axis=-1)
    boom *= np.exp(-t / 0.25) * 0.5
    x = np.stack([sub, sub]) * 0.8 + boom
    x = np.tanh(1.5 * x)
    return norm_peak(fade(x, sr, 0.001, 0.3), -5.0)


def riser(sr: int, rng, dur: float, f_lo: float = 300.0, f_hi: float = 9000.0,
          curve_pow: float = 2.0, tonal: bool = False) -> np.ndarray:
    n = int(dur * sr)
    t = np.arange(n) / sr
    x = rng.standard_normal((2, n))
    u = (t / dur) ** curve_pow

    def fn(freqs, times):
        uu = np.clip((times / dur) ** curve_pow, 0, 1)
        fc = f_lo * (f_hi / f_lo) ** uu
        r = np.maximum(freqs[:, None], 1e-6) / fc[None, :]
        width = 1.6 + 2.4 * uu
        m = (r ** width) / (1 + r ** (2 * width))
        return np.clip(m ** 0.7, 0, 1)

    x = stft_mask_filter(x, sr, fn)
    x = x * (0.15 + 0.85 * u)
    if tonal:
        fc = 220.0 * (2400.0 / 220.0) ** u
        tone = np.sin(2 * np.pi * np.cumsum(fc) / sr) * 0.25 * u
        x += np.stack([tone, tone])
    return norm_peak(fade(x, sr, 0.02, 0.05), -7.0)


def downlifter(sr: int, rng, dur: float = 1.6, f_hi: float = 6000.0, f_lo: float = 250.0) -> np.ndarray:
    n = int(dur * sr)
    t = np.arange(n) / sr
    x = rng.standard_normal((2, n))

    def fn(freqs, times):
        uu = np.clip(times / dur, 0, 1)
        fc = f_hi * (f_lo / f_hi) ** uu
        r = np.maximum(freqs[:, None], 1e-6) / fc[None, :]
        return np.clip(((r ** 0.8) / (1 + r ** 1.6)) ** 0.5, 0, 1)

    x = stft_mask_filter(x, sr, fn) * (1 - 0.7 * (t / dur))
    return norm_peak(fade(x, sr, 0.005, 0.3), -9.0)


def tom(sr: int, rng, f: float = 160.0, dur: float = 0.36) -> np.ndarray:
    n = int(dur * sr)
    t = np.arange(n) / sr
    fenv = f * (1 + 0.9 * np.exp(-t / 0.05))
    body = np.sin(2 * np.pi * np.cumsum(fenv) / sr) * np.exp(-t / 0.13)
    nz = ss.sosfilt(ss.tf2sos(*_biquad("highpass", sr, 120.0, 0.7, 0)), rng.standard_normal((2, n)), axis=-1)
    nz *= np.exp(-t / 0.03) * 0.35
    x = np.stack([body, body]) + nz
    return norm_peak(fade(np.tanh(1.3 * x), sr, 0.0005, 0.05), -6.0)


# --------------------------------------------------------------------------------------
# процессоры
# --------------------------------------------------------------------------------------


def envelope_follower(x, sr, attack=0.005, release=0.08):
    mono = np.abs(as_mono(x))
    at = uniform_filter1d(mono, max(1, int(attack * sr)))
    rel = uniform_filter1d(mono, max(1, int(release * sr)))
    return np.maximum(at, rel)


def compressor(x, sr, thr_db=-14.0, ratio=3.0, attack=0.01, release=0.15, makeup_db=0.0,
               sidechain: np.ndarray | None = None, knee_db=6.0, mix=1.0):
    det = as_mono(x if sidechain is None else sidechain)
    env = envelope_follower(det, sr, attack, release)
    over = db(env) - thr_db
    g = np.zeros_like(over)
    soft = (over > -knee_db / 2) & (over < knee_db / 2)
    hard = over >= knee_db / 2
    g[soft] = (1.0 / ratio - 1.0) * (over[soft] + knee_db / 2) ** 2 / (2 * knee_db)
    g[hard] = (1.0 / ratio - 1.0) * (over[hard] + knee_db / 2)
    gain_lin = np.clip(10 ** ((g + makeup_db) / 20.0), 1e-3, 8.0)
    if mix < 1.0:
        gain_lin = 1.0 + (gain_lin - 1.0) * mix
    return x * gain_lin


def duck(x, sr, triggers, depth_db=-3.5, attack=0.003, release=0.11, hold=0.02):
    n = x.shape[1]
    g = np.ones(n)
    amp = 10 ** (depth_db / 20.0)
    r = max(1, int(release * sr))
    a = max(1, min(int(attack * sr), r))
    h = int(hold * sr)
    for t in triggers:
        st = int(t * sr)
        if st >= n:
            continue
        seg_len = min(n - st, r + h)
        env = np.ones(seg_len)
        env[:a] = np.linspace(1, amp, a)
        if seg_len > a:
            env[a:] = amp + (1 - amp) * np.linspace(0, 1, seg_len - a) ** 1.6
        g[st:st + seg_len] = np.minimum(g[st:st + seg_len], env)
    return x * g


def stutter(x, sr, t, slice_len, count, gain_ramp_db=(-1.0, 1.0)):
    st = int(t * sr)
    sl = int(slice_len * sr)
    seg = x[:, st:st + sl].copy()
    gs = np.linspace(gain_ramp_db[0], gain_ramp_db[1], count)
    return np.concatenate([seg * (10 ** (g / 20.0)) for g in gs], axis=1)


def tape_stop(x, sr, start, dur, curve=2.0):
    n = int(dur * sr)
    u = (np.arange(n) / n) ** curve
    pos = start * sr + np.cumsum(1.0 - u)
    pos = np.clip(pos, 0, x.shape[1] - 2)
    i0 = pos.astype(int)
    fr = pos - i0
    return x[:, i0] * (1 - fr) + x[:, i0 + 1] * fr


def delay_fx(x, sr, time_s, feedback=0.35, mix=0.4, ping_pong=True, lp=6000.0, taps=4):
    n = x.shape[1]
    d = int(time_s * sr)
    total = n + d * taps + 8
    wet = np.zeros((2, total), dtype=np.float32)
    src = x.astype(np.float32)
    for i in range(1, taps + 1):
        seg = src * (feedback ** i)
        if ping_pong and i % 2:
            seg = seg[::-1]
        wet[:, d * i: d * i + n] += seg
    if lp < 19000:
        wet = ss.sosfilt(ss.tf2sos(*_biquad("lowpass", sr, lp, 0.7, 0)), wet, axis=-1).astype(np.float32)
    out = np.zeros_like(wet)
    out[:, :n] = src
    out += wet * (mix / max(feedback, 1e-3)) * 0.5
    return out.astype(np.float32)


def reverb_ir(sr, rng, decay=1.2, pre=0.02, damp=6000.0, width=1.0):
    n = int(decay * sr)
    x = rng.standard_normal((2, n)) * np.exp(-np.linspace(0, 1, n) * 6.0)
    x = ss.sosfilt(ss.tf2sos(*_biquad("lowpass", sr, damp, 0.7, 0)), x, axis=-1)
    x[:, : int(pre * sr)] = 0
    x /= np.sqrt(np.sum(x ** 2, axis=1, keepdims=True)) + 1e-9
    return x


def convolve_reverb(x, sr, ir):
    n = x.shape[1] + ir.shape[1] - 1
    L = int(2 ** np.ceil(np.log2(n)))
    X = np.fft.rfft(x, L, axis=1)
    H = np.fft.rfft(ir, L, axis=1)
    return np.fft.irfft(X * H, L, axis=1)[:, : x.shape[1]]


# --------------------------------------------------------------------------------------
# мастеринг
# --------------------------------------------------------------------------------------


def stereo_widen(x, sr, amount=0.35, mono_below=120.0):
    mid = x.mean(axis=0)
    side = (x[0] - x[1]) * (1 + amount)
    out = np.stack([mid + side / 2, mid - side / 2])
    low = ss.sosfilt(ss.tf2sos(*_biquad("lowpass", sr, mono_below * 1.5, 0.7, 0)), out, axis=-1)
    low_m = low.mean(axis=0)
    return out - low + np.stack([low_m, low_m])


def limiter(x, sr, ceiling_db=-0.3, lookahead=0.002, release=0.06):
    """Прозрачный peak-лимитер: lookahead-минимум + плавный релиз + страховочный клип."""
    ceil = 10 ** (ceiling_db / 20.0)
    mono = np.max(np.abs(x), axis=0)
    la = max(2, int(lookahead * sr))
    peaks = np.maximum(uniform_filter1d(mono, max(3, la // 2) * 2 + 1), mono)
    g_raw = np.minimum(1.0, ceil / np.maximum(peaks, 1e-9))
    g_la = minimum_filter1d(g_raw, 2 * la + 1)
    g_sm = uniform_filter1d(g_la, max(5, int(release * sr)))
    g = np.minimum(g_sm, g_raw)
    return np.clip(x * g, -ceil, ceil).astype(np.float32)


def measure_lufs(x, sr):
    """ITU-R BS.1770-4 integrated loudness (стерео суммируется по каналам)."""
    x = np.atleast_2d(x).astype(np.float64)
    b1, a1 = _biquad("highshelf", sr, 1681.974450955533, 0.7071752369554196, 3.999843853973347)
    b2, a2 = _biquad("highpass", sr, 38.13547087602444, 0.5003270373238773, 0)
    y = ss.sosfilt(ss.tf2sos(b1, a1), x, axis=-1)
    y = ss.sosfilt(ss.tf2sos(b2, a2), y, axis=-1)
    bs = int(0.4 * sr)
    nb = y.shape[1] // bs
    if nb == 0:
        return -np.inf
    z = np.array([np.sum(np.mean(seg ** 2, axis=-1)) for seg in np.array_split(y[:, : nb * bs], nb, axis=1)])
    l = -0.691 + 10 * np.log10(np.maximum(z, 1e-12))
    sel = l > -70.0
    if sel.sum() == 0:
        return -np.inf
    thr = -0.691 + 10 * np.log10(np.mean(z[sel])) - 10
    sel2 = (l > -70.0) & (l > thr)
    return float(-0.691 + 10 * np.log10(np.mean(z[sel2])))


def true_peak_db(x, sr=44100, factor=4):
    """True peak (dBTP) с 4x апсемплингом высокого качества (soxr, фолбэк — poly)."""
    import librosa

    y = np.atleast_2d(np.asarray(x, dtype=np.float32))
    try:
        up = librosa.resample(y, orig_sr=sr, target_sr=sr * factor, res_type="soxr_vhq", axis=-1)
    except Exception:
        from scipy.signal import resample_poly
        up = resample_poly(y, factor, 1, axis=-1)
    return float(db(np.max(np.abs(up))))


def limiter_stats(y, sr, ceiling_db=-0.3, lookahead=0.002, release=0.06):
    """Оценка работы лимитера: медиана/максимум подавления, доля затронутых сэмплов."""
    ceil = 10 ** (ceiling_db / 20.0)
    mono = np.max(np.abs(y), axis=0)
    la = max(2, int(lookahead * sr))
    peaks = np.maximum(uniform_filter1d(mono, max(3, la // 2) * 2 + 1), mono)
    g_raw = np.minimum(1.0, ceil / np.maximum(peaks, 1e-9))
    g_la = minimum_filter1d(g_raw, 2 * la + 1)
    g_sm = uniform_filter1d(g_la, max(5, int(release * sr)))
    g = np.minimum(g_sm, g_raw)
    gr = -db(g)
    return dict(median_gr=round(float(np.median(gr)), 2), p95_gr=round(float(np.percentile(gr, 95)), 2),
                max_gr=round(float(gr.max()), 2), touched_pct=round(float(np.mean(gr > 0.2) * 100), 1))


def master(y, sr, target_lufs=-9.5, ceiling_db=-0.8, verbose=True):
    """Мастер: DC -> EQ -> клей -> сатурация -> ширина -> LUFS-цель -> лимитер -> true peak.

    Громкость добирается итерациями БЕЗ коррекции по TP (она применяется один раз в конце);
    внутренняя цель выше на запас интерсэмпловых пиков.
    """
    ceil = 10 ** (ceiling_db / 20.0)
    y = dc_block(np.atleast_2d(y).astype(np.float32), sr, 24.0)
    y = eq(y, sr, [("lowshelf", 62.0, 0.7, 2.2),
                   ("peaking", 340.0, 1.0, -1.4),
                   ("peaking", 3000.0, 1.2, 1.4),
                   ("highshelf", 10000.0, 0.7, 1.6)])
    # mid/side: низ в моно, немного воздуха в side
    y = stereo_widen(y, sr, amount=0.18, mono_below=130.0)
    y = compressor(y, sr, thr_db=-10.0, ratio=1.5, attack=0.03, release=0.22, mix=0.32)
    # ленточная сатурация (лёгкая асимметрия -> чётные гармоники)
    sat = np.tanh(1.35 * y + 0.06 * y ** 2)
    y = 0.80 * y + 0.20 * sat / 1.35
    y = dc_block(y, sr, 24.0)

    internal = target_lufs + 1.2          # запас под интерсэмпловые пики
    for i in range(4):
        lufs = measure_lufs(y, sr)
        y = y * (10 ** ((internal - lufs) / 20.0))
        y = dc_block(y, sr, 22.0)
        gs = limiter_stats(y, sr, ceiling_db=ceiling_db - 0.4)
        y = limiter(y, sr, ceiling_db=ceiling_db - 0.4, lookahead=0.0025, release=0.09)
        y = np.clip(y, -ceil, ceil)
        lufs = measure_lufs(y, sr)
        if verbose:
            print(f"    [master] итерация {i+1}: {lufs:.2f} LUFS, ограничение p95 "
                  f"{gs['p95_gr']:.2f} / max {gs['max_gr']:.2f} дБ")
        if abs(lufs - internal) < 0.2:
            break
    tp = true_peak_db(y, sr, factor=4)
    if tp > ceiling_db:
        y = y * (10 ** ((ceiling_db - tp) / 20.0))
    y = np.clip(y, -ceil, ceil)
    if verbose:
        print(f"    [master] итог: {measure_lufs(y, sr):.2f} LUFS, TP {true_peak_db(y, sr):+.2f} dBTP, "
              f"max sample {float(np.max(np.abs(y))):.3f}")
    return y.astype(np.float32)


def spectrogram_db(x, sr, n_fft=4096, hop=1024):
    import librosa

    return librosa.amplitude_to_db(np.abs(librosa.stft(as_mono(x), n_fft=n_fft, hop_length=hop)), ref=np.max)


# --------------------------------------------------------------------------------------
# мелодические синты для ремикса (бас-грув, пэды, саб-дропы, раймшоты)
# --------------------------------------------------------------------------------------


def _saw(freq, n, sr, phase=0.0):
    """Полосно-ограниченная пила (сумма гармоник до Найквиста), дешёвая и чистая."""
    t = np.arange(n) / sr
    out = np.zeros(n)
    kmax = int(min(40, (sr / 2) / max(freq, 1.0)))
    for k in range(1, kmax + 1):
        if freq * k >= sr / 2:
            break
        out += np.sin(2 * np.pi * freq * k * t + phase * k) / k
    return out * (2 / np.pi)


def pwm(freq, n, sr, duty=0.35, width_mod=0.0):
    t = np.arange(n) / sr
    u = (t * freq) % 1.0
    w = duty + width_mod * np.sin(2 * np.pi * 0.5 * t)
    return np.where(u < w, 1.0, -1.0) - (2 * w - 1)


def bass_pluck(sr, rng, f, dur=0.30, drive=2.2, lp0=1400.0, lp1=260.0,
               env_decay=0.085, sub=0.55, click=0.12) -> np.ndarray:
    """Плак-бас: пила+квадрат через затухающий ФНЧ + саб-синус. Возвращает (2,n)."""
    n = int(dur * sr)
    t = np.arange(n) / sr
    osc = 0.6 * _saw(f, n, sr) + 0.4 * pwm(f * 1.003, n, sr, 0.42)
    # огибающая фильтра: «вау» на атаке
    seg = max(1, n // 8)
    out = np.zeros(n)
    lp = np.linspace(lp0, lp1, n) ** 0.5
    # быстрый способ: 8 сегментов с разной отсечкой + кроссфейд
    for i in range(8):
        a = i * n // 8
        b = min(n, (i + 1) * n // 8)
        if b <= a:
            continue
        fc = float(lp[a])
        sos = ss.butter(2, min(0.95, fc / (sr / 2)), btype="lowpass", output="sos")
        out[a:b] = ss.sosfilt(sos, osc)[a:b]
    ampenv = np.exp(-t / env_decay) * (1 - np.exp(-t * 900))
    body = out * ampenv
    body += sub * np.sin(2 * np.pi * f / 2 * t) * ampenv
    cl = np.zeros(n)
    if click > 0:
        w = min(n, int(0.006 * sr))
        cl[:w] = rng.standard_normal(w) * np.exp(-np.arange(w) / (0.0015 * sr)) * click
    x = np.tanh(drive * (body + cl))
    x = fade(x, sr, 0.0008, 0.012)
    x = norm_peak(x, -3.0)
    return np.stack([x, x])


def pad(sr, rng, root_hz, dur, detune=0.007, lp=1800.0, attack=0.6, release=0.9) -> np.ndarray:
    """Слоёный пэд: 3 расстроенные пилы + квинта, медленный ФНЧ-свип. (2,n)."""
    n = int(dur * sr)
    t = np.arange(n) / sr
    voices = []
    for cents in (-detune, 0.0, detune):
        f = root_hz * (2 ** (cents / 12.0))
        voices.append(_saw(f, n, sr))
    voices.append(0.6 * _saw(root_hz * 1.5, n, sr))
    voices.append(0.4 * _saw(root_hz * 2.0, n, sr))
    mono = sum(voices) / len(voices)
    # медленный свип фильтра
    out = np.zeros(n)
    steps = 16
    for i in range(steps):
        a = i * n // steps
        b = min(n, (i + 1) * n // steps)
        if b <= a:
            continue
        fc = lp * (0.4 + 0.6 * (i / max(1, steps - 1)))
        sos = ss.butter(2, min(0.97, fc / (sr / 2)), btype="lowpass", output="sos")
        out[a:b] = ss.sosfilt(sos, mono)[a:b]
    envl = np.minimum(1.0, t / max(attack, 1e-3)) * np.minimum(
        1.0, np.maximum(0.0, (dur - t) / max(release, 1e-3)) ** 1.2)
    x = out * envl
    lfo = 1.0 + 0.03 * np.sin(2 * np.pi * 0.23 * t)
    x = x * lfo
    x = norm_peak(x, -8.0)
    # стерео: правый канал чуть расстроен по фазе
    r = np.roll(x, int(0.011 * sr))
    return np.stack([x, 0.85 * r + 0.15 * x])


def sub_drop(sr, rng, f_start=90.0, f_end=32.0, dur=1.1, click=0.4) -> np.ndarray:
    """Саб-дроп на даунбит: падение частоты + короткий шумовой «бум»."""
    n = int(dur * sr)
    t = np.arange(n) / sr
    f = f_end + (f_start - f_end) * np.exp(-t / 0.16)
    ph = 2 * np.pi * np.cumsum(f) / sr
    x = np.sin(ph) * np.exp(-t / 0.42)
    nz = ss.sosfilt(ss.tf2sos(*_biquad("lowpass", sr, 500.0, 0.7, 0)), rng.standard_normal((2, n)), axis=-1)
    nz *= np.exp(-t / 0.09) * click
    out = np.stack([x, x]) + nz
    return norm_peak(fade(np.tanh(1.4 * out), sr, 0.001, 0.2), -4.0)


def rim(sr, rng, dur=0.08) -> np.ndarray:
    n = int(dur * sr)
    t = np.arange(n) / sr
    x = np.sin(2 * np.pi * 1650.0 * t) * np.exp(-t / 0.008)
    x += 0.4 * rng.standard_normal(n) * np.exp(-t / 0.004)
    x = ss.sosfilt(ss.tf2sos(*_biquad("highpass", sr, 900.0, 0.7, 0)), x)
    x = norm_peak(fade(x, sr, 0.0002, 0.01), -8.0)
    return np.stack([x, np.roll(x, 12)])


def hat_roll(sr, rng, n_ticks=6, span=0.25, gain_ramp=( -6.0, 0.0 )) -> np.ndarray:
    """Ратчет-ролл из коротких хэтов (ускорение на конце фразы)."""
    total = int(span * sr) + int(0.06 * sr)
    buf = np.zeros((2, total), dtype=np.float32)
    for i in range(n_ticks):
        pos = (i / n_ticks) ** 1.15 * span
        h = hat(sr, rng, dur=0.05, f_hp=8500.0, decay=0.014)
        g = gain_ramp[0] + (gain_ramp[1] - gain_ramp[0]) * i / max(1, n_ticks - 1)
        add_at(buf, pos, h, sr, g)
    return buf
