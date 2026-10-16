import numpy as np, librosa
from scipy.ndimage import uniform_filter1d
mid = np.load('work/mid.npy'); sr=22050; hop=512
S = np.abs(librosa.stft(mid, n_fft=1024, hop_length=hop))
f = librosa.fft_frequencies(sr=sr, n_fft=1024)
def band(lo,hi): return S[(f>=lo)&(f<hi)].sum(axis=0)
kick = band(40,110); bell = band(400,900); hats = band(6000,11000)
for name, x in (("kick40-110",kick),("bell400-900",bell),("hats6-11k",hats)):
    oe = librosa.onset.onset_strength(S=librosa.amplitude_to_db(np.maximum(x,1e-9))[None,:]**1, sr=sr, hop_length=hop)
    on = librosa.onset.onset_detect(onset_envelope=oe, sr=sr, hop_length=hop, backtrack=False)
    tt = librosa.frames_to_time(on, sr=sr, hop_length=hop)
    d = np.diff(tt)
    hist, edges = np.histogram(d, bins=np.arange(0,1.0,0.02))
    top = np.argsort(hist)[::-1][:6]
    print(f"\n{name}: {len(on)} onsets, first 12: {np.round(tt[:12],3)}")
    print("  interval histogram peaks (s):", [(round(float(edges[i]),2), int(hist[i])) for i in top])
# periodicity of kick envelope
oe = librosa.onset.onset_strength(y=mid, sr=sr, hop_length=hop, fmax=200)
ac = librosa.autocorrelate(oe-oe.mean(), max_size=200)
lags = np.arange(len(ac))
bpms = 60*sr/hop/lags[1:]
for i in np.argsort(ac[1:])[::-1][:8]+1:
    print(f"periodicity peak: lag {i} -> {60*sr/hop/i:.1f} BPM  val={ac[i]:.1f}")
# check four-on-floor: energy at each beat within 4/4 grid at 152
tempo=152.0; beat=60/tempo
t = librosa.frames_to_time(np.arange(len(kick)), sr=sr, hop_length=hop)
def phase_score(period, nphase=8, off=0.0):
    ph = ((t-off) % period)/period
    b = np.digitize(ph, np.linspace(0,1,nphase+1))-1
    prof = np.array([np.mean(kick[b==k]) if np.any(b==k) else 0 for k in range(nphase)])
    return prof
print("\nkick profile over 4 phase positions (152BPM):", np.round(phase_score(beat,4),3))
print("kick profile over 8 phase positions (152BPM):", np.round(phase_score(beat,8),3))
for tm in (76,99.38,100,150,152,155,128,140,145,174):
    p = phase_score(60/tm, 4)
    print(f"  {tm:6.2f} BPM -> {np.round(p/p.mean(),3)}  contrast={p.max()/max(p.mean(),1e-9):.2f}")
# where does an onset grid best align? fine search
best=None
for tm in np.arange(120,180,0.1):
    p = phase_score(60/tm, 4)
    c = p.max()/max(p.mean(),1e-9)
    if best is None or c>best[1]: best=(tm,c)
print("best bpm (kick 4-on-floor contrast):", best)
