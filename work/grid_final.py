import numpy as np, librosa
SR=22050; hop=128
mid = np.load('work/mid.npy').astype(np.float32)
P = np.load('work/perc.npy').astype(np.float32)
def band_env(x, lo, hi, nfft=1024):
    S=np.abs(librosa.stft(x, n_fft=nfft, hop_length=hop)); f=librosa.fft_frequencies(sr=SR,n_fft=nfft)
    return S[(f>=lo)&(f<hi)].sum(0)
envs = {
 'sub'  : band_env(P, 30, 70),
 'kick' : band_env(P, 60, 130),
 'snare': band_env(P, 180, 700),
 'hat'  : band_env(P, 6000, 11000),
 'mid'  : band_env(mid, 700, 3000),
}
tS = librosa.frames_to_time(np.arange(len(envs['kick'])), sr=SR, hop_length=hop)
def conc(e, T):
    z=np.sum(e*np.exp(2j*np.pi*tS/T)); return abs(z)/np.sum(e), z
for name,e in envs.items():
    rows=[]
    for T in (0.1, 0.2, 0.4, 0.8, 1.6):
        c,z = conc(e, T)
        phi = (np.angle(z)/(2*np.pi)*T) % T
        rows.append(f"T={int(T*1000):4d}мс:{c:5.2f}@phi={phi*1000:6.1f}мс")
    print(f"{name:6s} " + "  ".join(rows))
# финальная сетка по 200 мс (8-е) и 400 мс (четверти)
T8=0.2; T4=0.4; T16=1.6
c,z = conc(envs['kick'], T4); phi4=(np.angle(z)/(2*np.pi)*T4)%T4
c,z = conc(envs['kick'], T8); phi8=(np.angle(z)/(2*np.pi)*T8)%T8
print(f"\nkick: phi(400мс)={phi4*1000:.1f}мс  phi(200мс)={phi8*1000:.1f}мс")
print(f"сдвиг между 8-ми и 4-ми: {(phi8-phi4)*1000:.1f} мс")
# профиль по битам mod 4 и mod 8 (фаза от kick)
for name,e in envs.items():
    idx = np.floor((tS - phi8)/T4).astype(int)
    vals=[]
    for k in range(4):
        m=(idx%4==k)
        vals.append(np.mean(e[m]))
    vals=np.array(vals)/np.mean(vals)
    print(f"{name:6s} бит mod 4 (вес): {np.round(vals,2)}")
# тонкий профиль 16-х внутри бита 400 мс
NB=32
for name,e in envs.items():
    ph=((tS - phi8)/T4)%1.0
    b=np.clip((ph*NB).astype(int),0,NB-1)
    p=np.bincount(b, weights=e, minlength=NB); cnt=np.bincount(b,minlength=NB)
    p=p/np.maximum(cnt,1); p=p/p.mean()
    top=[round(float(i/NB*T4*1000),0) for i in np.argsort(p)[::-1][:6]]
    print(f"{name:6s} 16e-профиль: {np.round(p,2)}")
    print(f"        пики (мс от 8-й): {top}")
# фраза: 2-баровый профиль (3.2 с) для kick и sub
for name in ('kick','sub','mid'):
    e=envs[name]; Tb=3.2
    c,z=conc(e,Tb); phib=(np.angle(z)/(2*np.pi)*Tb)%Tb
    NB=32
    ph=((tS-phib)/Tb)%1.0
    b=np.clip((ph*NB).astype(int),0,NB-1)
    p=np.bincount(b,weights=e,minlength=NB); cnt=np.bincount(b,minlength=NB); p=p/np.maximum(cnt,1); p/=p.mean()
    print(f"{name} 2-бар (3.2с) профиль phi={phib*1000:.0f}мс: {np.round(p,2)}")
