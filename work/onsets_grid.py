import numpy as np, librosa
SR=22050; hop=128
mid = np.load('work/mid.npy').astype(np.float32); P=np.load('work/perc.npy').astype(np.float32)
def band(x, lo, hi, nfft=1024):
    S=np.abs(librosa.stft(x, n_fft=nfft, hop_length=hop)); f=librosa.fft_frequencies(sr=SR,n_fft=nfft)
    return S[(f>=lo)&(f<hi)].sum(0)
bands = {'kick':band(P,45,110),'sub':band(P,30,70),'snare':band(P,200,600),
         'hat':band(P,6500,11000),'mid':band(mid,700,3000)}
res={}
for name,e in bands.items():
    oe = np.diff(np.log1p(e), prepend=e[0]); oe=np.maximum(oe,0)
    on = librosa.onset.onset_detect(onset_envelope=oe, sr=SR, hop_length=hop, backtrack=False,
                                    pre_max=3, post_max=3, pre_avg=8, post_avg=8, delta=0.05, wait=3)
    t = librosa.frames_to_time(on, sr=SR, hop_length=hop)
    st = oe[on]
    keep = st>np.percentile(st,40)
    t, st = t[keep], st[keep]
    res[name]=(t,st)
    print(f"{name:6s}: {len(t)} онсетов, медианный интервал {np.median(np.diff(t))*1000:.1f} мс")
# фазовая гистограмма mod 200 мс (тонко), для каждого бэнда — относительно своей же фазы
T=0.2
NB=100
for name,(t,st) in res.items():
    ph=(t/T)%1.0
    h,edges=np.histogram(ph, bins=NB, weights=st)
    h=h/h.max()
    top=[round(float(edges[i]*1000),0) for i in np.argsort(h)[::-1][:8]]
    print(f"\n{name}: пики внутри 200мс: {top}")
    print("   профиль(100 бинов, x2 мс):", np.round(h,2)[::2])
# межбэндовые смещения: свёртка гистограмм
ks = list(res.keys())
for i in range(len(ks)):
    for j in range(i+1,len(ks)):
        a=(res[ks[i]][0]/T)%1.0; b=(res[ks[j]][0]/T)%1.0
        d=((a[:,None]-b[None,:]+0.5)%1.0)-0.5
        d=d[np.abs(d)<0.1]
        if d.size: print(f"смещение {ks[i]} - {ks[j]}: медиана {np.median(d)*T*1000:+.0f} мс (n={d.size})")
