import numpy as np, librosa
mid = np.load('work/mid.npy').astype(np.float32); sr=22050; hop=128
BPM=152.0; period=60.0/BPM
# high-res band envelopes
yl = librosa.resample(mid, orig_sr=sr, target_sr=11025).astype(np.float32)
S = np.abs(librosa.stft(yl, n_fft=2048, hop_length=hop, center=True))
f = librosa.fft_frequencies(sr=11025, n_fft=2048)
def env(lo,hi):
    return S[(f>=lo)&(f<hi)].sum(axis=0)
kick = env(35,90); snare = env(150,400); hat = env(3000,5500)   # scaled to 11025 sr
t = librosa.frames_to_time(np.arange(len(kick)), sr=11025, hop_length=hop)
def prof(offset, e, nb=64):
    ph = ((t-offset) % period)/period
    b = np.clip((ph*nb).astype(int),0,nb-1)
    p = np.bincount(b, weights=e, minlength=nb)
    c = np.bincount(b, minlength=nb)
    return p/np.maximum(c,1)
# find offset maximizing kick at phase 0
best=None
for off in np.arange(0, period, 0.002):
    p = prof(off, kick, 8)
    s = p[0] - (p.sum()-p[0])/7
    if best is None or s>best[0]: best=(s, off)
print("best kick offset:", best, "=> t0=%.4f"%best[1])
off = best[1]
for name, e in (("kick",kick),("snare",snare),("hat",hat)):
    p = prof(off, e, 16)
    p = p/p.mean()
    print(f"{name:6s} 16ths profile:", np.round(p,2))
    print(f"{name:6s} 4-beat profile:", np.round(prof(off, e, 4)/prof(off,e,4).mean(),2))
# check t0 candidates across the track with different segments
for name, sl in (("0-45s",(t<45)),("45-90s",(t>=45)&(t<90)),("90-135s",(t>=90)&(t<135)),("135-168s",(t>=135))):
    best=None
    for o in np.arange(0, period, 0.002):
        ph = ((t[sl]-o) % period)/period
        b = np.clip((ph*8).astype(int),0,7)
        p = np.bincount(b, weights=kick[sl], minlength=8)
        c = np.bincount(b, minlength=8)
        pr = p/np.maximum(c,1)
        s = pr[0] - (pr.sum()-pr[0])/7
        if best is None or s>best[0]: best=(s,o)
    print(f"{name}: kick-aligned offset {best[1]:.4f} (s={best[0]:.1f})")
np.save('work/t0.npy', np.array([off, period, BPM]))
