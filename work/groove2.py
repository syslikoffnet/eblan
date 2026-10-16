import numpy as np, librosa
mid = np.load('work/mid.npy').astype(np.float32); sr=22050
hop=256; BPM=152.0; period=60/BPM; t0=0.164
step=period/4
n16 = int((174-t0)/step)+1
acc = np.zeros((n16,4)); cnt=np.zeros(n16)
CH=15*sr
S_tot=[]
for st in range(0, len(mid), CH):
    seg = mid[st:st+CH]
    if len(seg) < 2048: break
    S = np.abs(librosa.stft(seg, n_fft=2048, hop_length=hop))
    f = librosa.fft_frequencies(sr=sr, n_fft=2048)
    tt = st/sr + librosa.frames_to_time(np.arange(S.shape[1]), sr=sr, hop_length=hop)
    idx = np.floor((tt-t0)/step).astype(int)
    good = (idx>=0)&(idx<n16)
    bands = np.stack([S[(f>=35)&(f<95)].sum(0), S[(f>=150)&(f<450)].sum(0), S[(f>=6000)&(f<11000)].sum(0), S[(f>=450)&(f<3000)].sum(0)])
    for k in range(4):
        np.add.at(acc[:,k], idx[good], bands[k][good])
    np.add.at(cnt, idx[good], 1)
    del S, bands
cnt=np.maximum(cnt,1)
prof = acc/cnt[:,None]
nb=(len(prof)//16)*16; E=prof[:nb].reshape(-1,16,4).mean(axis=0)
np.set_printoptions(suppress=True, precision=2, linewidth=200)
print("per-16th profile rows=16th pos 1..16, cols=[kick,snare,hat,mid]:")
print(E)
print("\nnormalized (each col / its mean):")
print(E/E.mean(axis=0))
print("\nstrongest kick 16ths:", list(np.argsort(E[:,0])[::-1][:4]+1))
print("strongest snare 16ths:", list(np.argsort(E[:,1])[::-1][:4]+1))
print("strongest hat 16ths:", list(np.argsort(E[:,2])[::-1][:4]+1))
# bar-level energy to find structure changes
nb2=(len(prof)//16)*16; bar = prof[:nb2].reshape(-1,16,4).mean(axis=1)
print("\nbars:", bar.shape)
np.save('work/barprof.npy', bar)
with open('work/barprof.txt','w') as fh:
    for i,b in enumerate(bar):
        fh.write(f"bar {i:3d} t={t0+i*4*period:7.2f}s kick={b[0]:8.1f} snare={b[1]:8.1f} hat={b[2]:9.1f} mid={b[3]:9.1f}\n")
print("wrote barprof")
