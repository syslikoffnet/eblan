import numpy as np, librosa, matplotlib; matplotlib.use('Agg'); import matplotlib.pyplot as plt
mid = np.load('work/mid.npy').astype(np.float32); sr=22050; hop=128
BPM=152.0; period=60.0/BPM
oe = librosa.onset.onset_strength(y=mid, sr=sr, hop_length=hop, n_fft=2048, aggregate=np.median)
t = librosa.frames_to_time(np.arange(len(oe)), sr=sr, hop_length=hop)
NB=96
best=None
for off in np.arange(0, period, 0.001):
    ph=((t-off)%period)/period
    b=np.clip((ph*NB).astype(int),0,NB-1)
    p=np.bincount(b,weights=oe,minlength=NB); c=np.bincount(b,minlength=NB)
    pr=p/np.maximum(c,1)
    # contrast: max / mean
    s=pr.max()/pr.mean()
    if best is None or s>best[0]: best=(s,off)
print("global onset-grid: contrast %.2f offset %.4f"%(best[0],best[1]))
off=best[1]
ph=((t-off)%period)/period; b=np.clip((ph*NB).astype(int),0,NB-1)
pr=np.bincount(b,weights=oe,minlength=NB); c=np.bincount(b,minlength=NB); pr=pr/np.maximum(c,1)
# 8th-note resolution profile (12 bins per 8th = 8ths of a beat = 48 per beat?) show 16ths
sixteenth = pr[:].reshape(6,16).mean(axis=0) if NB==96 else None
print("16th-of-beat profile (6 subdivisions merged):")
print(np.round(pr.reshape(6,16).mean(axis=0)/pr.mean(),2))
print("\n96-subdiv profile (peak positions, %):")
pk = [round(float(i/NB*100),1) for i in np.argsort(pr)[::-1][:12]]
print(sorted(pk))
fig, ax = plt.subplots(3,1, figsize=(20,10))
ax[0].plot(np.arange(NB)/NB*100, pr/pr.mean()); ax[0].set_title('onset profile within one beat (%.1f%% = %d ms)'%(100, period*1000)); ax[0].grid(True)
for a in range(0, 172, 24):
    sl=(t>=a)&(t<a+24)
    b2=np.clip(((t[sl]-off)%period)/period*NB,0,NB-1).astype(int)
    p2=np.bincount(b2,weights=oe[sl],minlength=NB); c2=np.bincount(b2,minlength=NB)
    ax[1].plot(np.arange(NB)/NB*100, p2/np.maximum(c2,1)/ (p2/np.maximum(c2,1)).mean(), label=f'{a}-{a+24}s')
ax[1].legend(fontsize=7); ax[1].grid(True); ax[1].set_title('per-segment phase profiles')
# drift check: local phase of onsets
wins=[]; 
for a in np.arange(0,170,10):
    sl=(t>=a)&(t<a+10)
    bb=np.clip(((t[sl]-off)%period)/period*NB,0,NB-1).astype(int)
    p2=np.bincount(bb,weights=oe[sl],minlength=NB)
    wins.append((a, float(np.argmax(p2)/NB*period*1000)))
ax[2].plot([w[0] for w in wins],[w[1] for w in wins],'o-'); ax[2].set_title('dominant phase per 10 s window (ms within beat)'); ax[2].grid(True)
plt.tight_layout(); plt.savefig('work/fig/phase.png', dpi=80); print('saved')
