import numpy as np, librosa
SR=44100
bt = np.load('work/bt44.npy')
mean_int = np.median(np.diff(bt))
# index assignment
k = np.round((bt - bt[0])/mean_int).astype(int)
print("n beats", len(bt), "k range", k.min(), k.max(), "mean interval", mean_int)
full_k = np.arange(k.min(), k.max()+1)
full_t = np.interp(full_k, k, bt)   # interpolate missing beats
print("filled beats:", len(full_t), "missing:", len(full_t)-len(bt))
np.save('work/beat_times.npy', full_t)
print("first 12:", np.round(full_t[:12],4), "last 4:", np.round(full_t[-4:],4))
print("intervals of filled map: mean %.5f std %.5f"%(np.diff(full_t).mean(), np.diff(full_t).std()))
# onset-phase profile using the source's own groove (piecewise-linear between beats)
y, _ = librosa.load('/home/user/eblan/_handsgod.mp3', sr=SR, mono=True)
hop=128
oe = librosa.onset.onset_strength(y=y.astype(np.float32), sr=SR, hop_length=hop, n_fft=2048)
tt = librosa.frames_to_time(np.arange(len(oe)), sr=SR, hop_length=hop)
idx = np.searchsorted(full_t, tt) - 1
idx = np.clip(idx, 0, len(full_t)-2)
u = (tt - full_t[idx])/(full_t[idx+1]-full_t[idx])
NB=64
b = np.clip((u*NB).astype(int),0,NB-1)
prof = np.bincount(b, weights=oe, minlength=NB); cnt=np.bincount(b,minlength=NB)
pr = prof/np.maximum(cnt,1)
print("\nbeat-normalized onset profile contrast (max/mean): %.2f"%((pr/pr.mean()).max()))
print(np.round(pr.reshape(4,16).mean(0)/pr.mean(),2))
print("8ths:", np.round(pr.reshape(8,8).mean(0)/pr.mean(),2))
print("quarters:", np.round(pr.reshape(16,4).mean(0)/pr.mean(),2))
# where are the peaks
pk = np.argsort(pr)[::-1][:10]
print("top phase positions (%):", sorted([round(float(i/NB*100),1) for i in pk]))
# downbeat detection: low-band energy per beat (index mod 4)
S = np.abs(librosa.stft(y.astype(np.float32), n_fft=2048, hop_length=512))
f = librosa.fft_frequencies(sr=SR, n_fft=2048)
low = S[(f>=30)&(f<120)].sum(0); tS = librosa.frames_to_time(np.arange(S.shape[1]), sr=SR, hop_length=512)
nb = len(full_t)-1
onset_energy = np.zeros(nb)
for i in range(nb):
    a = int(np.searchsorted(tS, full_t[i])); b2=int(np.searchsorted(tS, full_t[i]+0.06))
    onset_energy[i] = low[a:b2].mean() if b2>a else 0
for shift in range(4):
    m = onset_energy[shift::4]
    print(f"shift {shift}: low-band onset energy mean {m.mean():.1f}")
print("\nper-beat low energy (first 32):", np.round(onset_energy[:32],0))
np.save('work/lowbeat.npy', onset_energy)
