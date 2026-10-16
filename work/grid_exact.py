import numpy as np, librosa
SR=22050; hop=128
y,_ = librosa.load('_handsgod.mp3', sr=SR, mono=True); y=y.astype(np.float32)
oe = np.maximum(librosa.onset.onset_strength(y=y, sr=SR, hop_length=hop, n_fft=2048, aggregate=np.median),0).astype(np.float64)
t = librosa.frames_to_time(np.arange(len(oe)), sr=SR, hop_length=hop)
W = oe.copy()
def conc(T):
    z = np.sum(W*np.exp(2j*np.pi*t/T))
    return abs(z)/np.sum(W), z
Ts = np.arange(0.380, 0.420, 0.00001)
best=(0,None)
for T in Ts:
    c,_=conc(T)
    if c>best[0]: best=(c,T)
c,T = best
_,z = conc(T)
phi = (np.angle(z)/(2*np.pi)*T) % T
print(f"ТОЧНО: T={T*1000:.4f} мс  BPM={60/T:.4f}  phi={phi*1000:.2f} мс  concentration={c:.3f}")
for Tm in (0.2,0.4,0.8,0.1):
    cc,_=conc(Tm); print(f"  concentration at T={Tm*1000:.0f} мс: {cc:.3f}")
# фаза сильных онсетов: сдвиг пика относительно phi
NB=80
ph=((t-phi)/T)%1.0
b=np.clip((ph*NB).astype(int),0,NB-1)
prof=np.bincount(b, weights=W, minlength=NB)
print("\nпрофиль онсетов внутри бита (в % бита; T=400мс):")
print(np.round(prof/prof.mean(),2))
print("пики (мс):", [round(float(i/NB*T*1000),1) for i in np.argsort(prof)[::-1][:8]])
# профиль по 16-м, кик/снейр/хэт бэнды, с учётом точной сетки
P = np.load('work/perc.npy').astype(np.float32)
hop2=128
S = np.abs(librosa.stft(P, n_fft=1024, hop_length=hop2)); f=librosa.fft_frequencies(sr=SR, n_fft=1024)
tS = librosa.frames_to_time(np.arange(S.shape[1]), sr=SR, hop_length=hop2)
def band(lo,hi): return S[(f>=lo)&(f<hi)].sum(0)
B={'sub':band(30,70),'kick':band(60,130),'snare':band(180,700),'hat':band(6000,11000),'mid':band(700,3000)}
for Tb, nsub, label in ((T, 16, '16-е внутри 1 бита'), (2*T, 32, '32 позиции внутри 2 битов'), (4*T, 64, '64 позиции внутри 4 битов (бар)')):
    if nsub>32: continue
    ph2=((tS-phi)/Tb)%1.0
    bb=np.clip((ph2*nsub).astype(int),0,nsub-1)
    print(f"\n--- {label} (сетка от phi, T={Tb*1000:.1f} мс) ---")
    for k,v in B.items():
        p=np.bincount(bb, weights=v, minlength=nsub); cnt=np.bincount(bb,minlength=nsub)
        p=p/np.maximum(cnt,1); p=p/p.mean()
        print(f"  {k:6s}: {np.round(p,2)}")
