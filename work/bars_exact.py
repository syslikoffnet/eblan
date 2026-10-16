import numpy as np, librosa
SR=22050
T_BAR=1.6; PHI=0.084
P=np.load('work/perc.npy').astype(np.float32); H=np.load('work/harm.npy').astype(np.float32)
print("finite check: perc", np.isfinite(P).all(), "harm", np.isfinite(H).all(), "minmax harm", float(H.min()), float(H.max()))
def env(x,lo,hi,nfft=1024,hop=256):
    S=np.abs(librosa.stft(x,n_fft=nfft,hop_length=hop)); f=librosa.fft_frequencies(sr=SR,n_fft=nfft)
    e=S[(f>=lo)&(f<hi)].sum(0)
    return e, librosa.frames_to_time(np.arange(len(e)),sr=SR,hop_length=hop)
kick,_=env(P,40,110); snare,_=env(P,180,600); hat,_=env(P,6500,11000)
mid,tt=env(H,700,3000); sub,tt2=env(H,45,140,hop=256)
nbar=int(np.ceil((tt[-1]-PHI)/T_BAR))
print(f"\nбаров: {nbar}  (бар = {T_BAR} c)")
print(" bar    t      kick    sub    snare    hat     mid")
rows=[]
for b in range(nbar):
    a=PHI+b*T_BAR; e=a+T_BAR
    m=(tt>=a)&(tt<e); m2=(tt2>=a)&(tt2<e)
    r=(kick[m].mean() if m.any() else 0, sub[m2].mean() if m2.any() else 0,
       snare[m].mean() if m.any() else 0, hat[m].mean() if m.any() else 0, mid[m].mean() if m.any() else 0)
    rows.append((b,a)+r)
    if b%1==0:
        print(f"{b:4d} {a:7.2f} {r[0]:7.1f} {r[1]:6.1f} {r[2]:7.1f} {r[3]:7.1f} {r[4]:8.1f}")
np.save('work/bars_exact.npy', np.array(rows))
# средние значения по 8 барам для определения секций
arr=np.array([r[2:] for r in rows])
sm=np.array([arr[max(0,i-1):i+2].mean(0) for i in range(len(arr))])
print("\nсглаженный профиль (каждые 4 бара):")
for i in range(0,len(sm),4):
    w=sm[i:i+4].mean(0)
    print(f"  бары {i:3d}-{i+3:3d} ({PHI+i*T_BAR:6.1f}-{PHI+(i+4)*T_BAR:6.1f}s): kick={w[0]:7.1f} sub={w[1]:6.1f} snare={w[2]:7.1f} hat={w[3]:7.1f} mid={w[4]:7.1f}")
