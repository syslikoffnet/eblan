import numpy as np, librosa
SR=44100
y, _ = librosa.load('/home/user/eblan/_handsgod.mp3', sr=SR, mono=True); y=y.astype(np.float32)
bt = np.load('work/beat_times.npy')
hop=256
S = np.abs(librosa.stft(y, n_fft=2048, hop_length=hop)); f=librosa.fft_frequencies(sr=SR, n_fft=2048)
tS = librosa.frames_to_time(np.arange(S.shape[1]), sr=SR, hop_length=hop)
def band(lo,hi): return S[(f>=lo)&(f<hi)].sum(0)
kick=band(35,90); snare=band(180,500); hat=band(7000,13000); mid=band(500,3000)
def val(x, t, w=0.05):
    a=int(np.searchsorted(tS, t)); b=int(np.searchsorted(tS, t+w))
    return x[a:b].max() if b>a else 0
def pattern(a_beat, nbeat):
    print(f"\n=== beats {a_beat}..{a_beat+nbeat} (t {bt[a_beat]:.2f}-{bt[min(a_beat+nbeat,len(bt)-1)]:.2f}s) ===")
    print("bar  beat  16th:   k        s        h        m")
    for i in range(a_beat, min(a_beat+nbeat, len(bt)-1)):
        for sub in range(4):
            t = bt[i] + sub*(bt[i+1]-bt[i])/4
            mark = "|" if sub==0 else " "
            print(f"{(i//4):4d} {i%4:4d} {sub:3d}{mark} {val(kick,t):9.0f} {val(snare,t):8.0f} {val(hat,t):8.0f} {val(mid,t):8.0f}")
pattern(12, 16)
