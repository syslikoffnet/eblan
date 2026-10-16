import numpy as np, sys, librosa, scipy.signal as ss
sys.path.insert(0,'remix'); import make_remix as M, dsp
SR=44100
src,_ = librosa.load('_handsgod.mp3', sr=SR, mono=True); src=src.astype(np.float32)
off = -M.bar(-M.PRE_BARS)
n = int((off + M.bar(M.SRC_BARS_END+M.EXT_BARS)+1.0)*SR)
drums, kicks, kits = M.render_drums(n, off, M.detect_kicks())
m = dsp.as_mono(drums)
# ожидаемые времена киков по сетке (первые бары дропа)
exp = [M.s16(b,k)+off for b in (7,8) for k in range(0,16,2)]
print("ожидаемые времена киков:", [round(x,3) for x in exp])
# фактические транзиенты слоя: пики в полной огибающей
S=np.abs(librosa.stft(m, n_fft=1024, hop_length=32)); f=librosa.fft_frequencies(sr=SR,n_fft=1024)
full=S.sum(0); tf=librosa.frames_to_time(np.arange(len(full)), sr=SR, hop_length=32)
lo=S[(f>=40)&(f<110)].sum(0)
for t0 in exp[:6]:
    w=(tf>=t0-0.12)&(tf<=t0+0.15)
    pkt = tf[w][np.argmax(full[w])]
    pkl = tf[w][np.argmax(lo[w])]
    print(f"  сетка {t0:.3f}: пик полной огибающей {pkt:.3f} ({(pkt-t0)*1000:+.1f} мс), пик 40-110Гц {pkl:.3f} ({(pkl-t0)*1000:+.1f} мс)")
# та же проверка для исходника в том же месте
ssr = dsp.as_mono(src)
S2=np.abs(librosa.stft(ssr, n_fft=1024, hop_length=32)); l2=S2[(f>=40)&(f<110)].sum(0)
t2=librosa.frames_to_time(np.arange(len(l2)), sr=SR, hop_length=32)
print("\nисходник (окно дропа), пики 40-110Гц относительно той же сетки:")
for t0 in exp[:6]:
    t0s=t0-off
    w=(t2>=t0s-0.15)&(t2<=t0s+0.15)
    if w.sum()==0: continue
    pkl=t2[w][np.argmax(l2[w])]
    print(f"  {t0s:.3f}: пик {pkl:.3f} ({(pkl-t0s)*1000:+.1f} мс)")
# фаза пиков кик-бэнда по всему треку (слой барабанов)
k=S[(f>=40)&(f<110)].sum(0)
on=librosa.onset.onset_detect(onset_envelope=np.maximum(np.diff(np.log1p(k),prepend=k[0]),0), sr=SR, hop_length=32,
                              backtrack=False, pre_max=3, post_max=3, pre_avg=6, post_avg=6, delta=0.05, wait=6)
tt=tf[on]
print("\nслой барабанов: фаза кик-онсетов mod 200 мс =", round(float(np.median((tt[100:]/0.2 % 1.0)*200)),1), "мс")
