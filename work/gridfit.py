import numpy as np, librosa
mid = np.load('work/mid.npy').astype(np.float32); sr=22050
hop=256
oe = librosa.onset.onset_strength(y=mid, sr=sr, hop_length=hop, n_fft=2048, fmax=8000)
oe = np.maximum(oe, 0)
t = librosa.frames_to_time(np.arange(len(oe)), sr=sr, hop_length=hop)
def score(bpm, nbins=128):
    period = 60.0/bpm
    ph = (t % period)/period
    b = np.clip((ph*nbins).astype(int), 0, nbins-1)
    prof = np.bincount(b, weights=oe, minlength=nbins)
    return prof.max()/prof.mean(), prof
best=None
for bpm in np.arange(140,165,0.002):
    s,_ = score(bpm)
    if best is None or s>best[0]: best=(s,bpm)
print("coarse best:", best)
bpm=best[1]
# refine around
best=None
for b in np.arange(bpm-0.05, bpm+0.05, 0.0005):
    s,_ = score(b)
    if best is None or s>best[0]: best=(s,b)
print("fine best:", best)
bpm=best[1]; period=60/bpm
s, prof = score(bpm, 256)
phase_best = np.argmax(prof)/256.0
t0 = phase_best*period
print(f"BPM={bpm:.4f} period={period*1000:.4f}ms phase0={t0:.4f}s  contrast={s:.2f}")
# check drift: fit phase on first 60s and last 60s separately
for name, sl in (("0-60s", (t>=0)&(t<60)), ("60-120s",(t>=60)&(t<120)), ("120-173s",(t>=120))):
    ph = (t[sl] % period)/period
    b = np.clip((ph*256).astype(int),0,255)
    pr = np.bincount(b, weights=oe[sl], minlength=256)
    pk = np.argmax(pr)/256.0
    print(f"  {name}: best phase {pk:.4f} ({pk*period:+.4f}s rel) contrast {pr.max()/pr.mean():.2f}")
# downbeat: assume 4/4. find offset mod (4*period) maximizing low-band kick energy
S = np.abs(librosa.stft(mid, n_fft=1024, hop_length=hop)); f=librosa.fft_frequencies(sr=sr,n_fft=1024)
kick = S[(f>=40)&(f<110)].sum(axis=0)
bar = 4*period
print("\ndownbeat phase candidates (kick energy mod bar):")
res=[]
for k in range(16):
    off = t0 + k*period
    g = (np.arange((t[-1]-off)/period))*period + off
    idx = np.clip(np.searchsorted(t, g),0,len(kick)-1)
    res.append((float(np.mean(kick[idx])), k, g[0]))
for v,k,tt in sorted(res)[::-1][:6]:
    print(f"   beat {k} (t={tt:.3f}s) mean kick {v:.1f}")
np.save('work/oe.npy', oe)
print("\nBPM_JSON", bpm, t0, period)
