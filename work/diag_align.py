import numpy as np, sys, librosa, scipy.signal as ss
sys.path.insert(0,'remix'); import make_remix as M, dsp
SR=44100
src,_ = librosa.load('_handsgod.mp3', sr=SR, mono=True); src=src.astype(np.float32)
off = -M.bar(-M.PRE_BARS); n = int((off + M.bar(M.SRC_BARS_END+M.EXT_BARS)+1.0)*SR)
kicks_src = M.detect_kicks()
drums, kicks, kits = M.render_drums(n, off, kicks_src)
# одиночный кик: где его энергия в 40-110 Гц
k = dsp.as_mono(kits['kick'])
S=np.abs(librosa.stft(k, n_fft=1024, hop_length=64)); f=librosa.fft_frequencies(sr=SR,n_fft=1024)
kb=S[(f>=40)&(f<110)].sum(0); tb=librosa.frames_to_time(np.arange(len(kb)), sr=SR, hop_length=64)
print("центр тяжести энергии кика в 40-110 Гц: %.1f мс, пик: %.1f мс"%(tb[np.argmax(np.cumsum(kb)/kb.sum()>0.5)]*1000, tb[np.argmax(kb)]*1000))
def band(x,lo,hi):
    sos=ss.butter(4,[lo/(SR/2),hi/(SR/2)],btype='band',output='sos'); return ss.sosfiltfilt(sos,x).astype(np.float32)
# сравнение кик-огибающих: слой барабанов vs исходник, окно 20-28 c исходника
dm = band(dsp.as_mono(drums),40,110); sm = band(src,40,110)
def env(x,hop=64):
    S=np.abs(librosa.stft(x, n_fft=1024, hop_length=hop)); f=librosa.fft_frequencies(sr=SR,n_fft=1024)
    e=S[(f>=40)&(f<110)].sum(0); return np.maximum(np.diff(np.log1p(e), prepend=e[0]),0)
a,b = 14, 34
em = env(dm[int((a+off)*SR):int((b+off)*SR)])
es = env(sm[int(a*SR):int(b*SR)])
c = ss.correlate(em-em.mean(), es-es.mean(), mode='full')
lag = (np.argmax(c)-(len(es)-1))*64/SR
print("лаг слой-барабанов vs исходник: %+.1f мс (положительный = барабаны раньше)"%(lag*1000))
# то же для всего ремикса
