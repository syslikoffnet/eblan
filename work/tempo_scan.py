import numpy as np, librosa
SR=22050; hop=128
y,_ = librosa.load('_handsgod.mp3', sr=SR, mono=True); y=y.astype(np.float32)
oe = librosa.onset.onset_strength(y=y, sr=SR, hop_length=hop, n_fft=2048, aggregate=np.median)
oe = np.maximum(oe, 0).astype(np.float64)
t = librosa.frames_to_time(np.arange(len(oe)), sr=SR, hop_length=hop)
g = np.sum(oe)
def score_win(t0, t1, T, phi, nb=48):
    m=(t>=t0)&(t<t1)
    ph=((t[m]-phi)/T)%1.0
    b=np.clip((ph*nb).astype(int),0,nb-1)
    p=np.bincount(b, weights=oe[m], minlength=nb)
    return p.max()/(p.mean()+1e-9)
def best_for_win(t0,t1, Trange, phis):
    best=(0,None,None)
    for T in Trange:
        for phi in phis:
            s=score_win(t0,t1,T,phi)
            if s>best[0]: best=(s,T,phi)
    return best
# global scan
phases=np.arange(0,0.4010,0.004)
Tr = np.arange(0.3900,0.4100,0.0005)
b = best_for_win(0,173,Tr,phases)
print("global best: contrast %.2f T=%.5f (%.2f BPM) phi=%.4f"%(b[0],b[1],60/b[1],b[2]))
T_g, phi_g = b[1], b[2]
# local periods with fixed phase refined
print("\nлокальный период по 20-сек окнам (скан T при фазе из глобального):")
for a in range(0,170,20):
    ph = (phi_g + np.arange(0,200)*T_g) % T_g
    bb = best_for_win(a,a+20, np.arange(T_g-0.004,T_g+0.004,0.0001), ph)
    print(f"  {a:3d}-{a+20:3d}s: T={bb[1]*1000:.2f} мс ({60/bb[1]:.2f} BPM) phase={bb[2]:.4f} contrast={bb[0]:.2f}")
# drift: фаза первых сэмплов по времени для глобального T
print("\nфаза онсетов (мс в пределах бита) по 10-сек окнам для глобального T:")
for a in range(0,170,10):
    m=(t>=a)&(t<a+10)
    ph=((t[m]-phi_g)/T_g)%1.0
    hist,edges=np.histogram(ph, bins=40, weights=oe[m])
    k=np.argmax(hist)
    print(f"  {a:3d}s: пик фазы {k/40*T_g*1000:6.1f} мс (contrast {hist.max()/(hist.mean()+1e-9):.2f})")
np.save('work/tempo_scan.npy', np.array([T_g, phi_g]))
