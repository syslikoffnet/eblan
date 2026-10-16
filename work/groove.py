import numpy as np, librosa, matplotlib; matplotlib.use('Agg'); import matplotlib.pyplot as plt
mid = np.load('work/mid.npy').astype(np.float32); sr=22050
hop=128; BPM=152.0; period=60/BPM
S = np.abs(librosa.stft(mid, n_fft=2048, hop_length=hop)); f=librosa.fft_frequencies(sr=sr,n_fft=2048)
t = librosa.frames_to_time(np.arange(S.shape[1]), sr=sr, hop_length=hop)
def band(lo,hi): return S[(f>=lo)&(f<hi)].sum(axis=0)
kick=band(35,95); snare=band(150,450); hat=band(6000,11000); midb=band(450,3000)
t0=0.164
def grid_annot(ax):
    b = t0 + np.arange(0,174)*period
    for i,bb in enumerate(b):
        ax.axvline(bb, color='cyan', lw=0.6, alpha=0.9 if i%4==0 else 0.35)
fig, ax = plt.subplots(5,1, figsize=(20,12), sharex=True)
librosa.display.specshow(librosa.amplitude_to_db(S, ref=np.max), sr=sr, hop_length=hop, y_axis='log', x_axis='time', ax=ax[0], cmap='magma')
ax[0].set_title('spectrogram 0-20s (cyan=152BPM grid)')
grid_annot(ax[0])
ax[1].plot(t, kick); ax[1].set_title('kick 35-95Hz'); grid_annot(ax[1])
ax[2].plot(t, snare); ax[2].set_title('snare 150-450Hz'); grid_annot(ax[2])
ax[3].plot(t, hat); ax[3].set_title('hat 6-11k'); grid_annot(ax[3])
ax[4].plot(t, midb); ax[4].set_title('mid 450-3000'); grid_annot(ax[4])
for a in ax: a.set_xlim(0,20)
plt.tight_layout(); plt.savefig('work/fig/groove1.png', dpi=85)
fig, ax = plt.subplots(4,1, figsize=(20,10), sharex=True)
librosa.display.specshow(librosa.amplitude_to_db(S, ref=np.max), sr=sr, hop_length=hop, y_axis='log', x_axis='time', ax=ax[0], cmap='magma')
grid_annot(ax[0]); ax[0].set_title('spectrogram 60-80s')
ax[1].plot(t,kick); grid_annot(ax[1]); ax[1].set_title('kick')
ax[2].plot(t,snare); grid_annot(ax[2]); ax[2].set_title('snare')
ax[3].plot(t,hat); grid_annot(ax[3]); ax[3].set_title('hat')
for a in ax: a.set_xlim(60,80)
plt.tight_layout(); plt.savefig('work/fig/groove2.png', dpi=85)
# per-16th pattern stats over whole track
step=period/4
n16 = int((t[-1]-t0)/step)
E = np.zeros((n16,4))
for i in range(n16):
    a=t0+i*step; b=a+step
    m=(t>=a)&(t<b)
    if m.sum()==0: continue
    E[i] = [kick[m].mean(), snare[m].mean(), hat[m].mean(), midb[m].mean()]
E=E.reshape(-1,4,4)  # (bars, 16ths, features)
prof = E.mean(axis=0)
np.set_printoptions(suppress=True, precision=2)
print("mean per-16th profile (rows=16th position 1..16, cols=[kick,snare,hat,mid]):")
print(prof)
nm = prof / prof.mean(axis=0)
print("\nnormalized:")
print(nm)
# where's the maximum of each in 16th positions
print("\nstrongest kick 16ths:", np.argsort(nm[:,0])[::-1][:4]+1)
print("strongest snare 16ths:", np.argsort(nm[:,1])[::-1][:4]+1)
