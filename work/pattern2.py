import numpy as np, librosa
SR=22050; hop=256
P = np.load('work/perc.npy'); H=np.load('work/harm.npy')
bt = np.load('work/beat_times.npy')
def bands(x):
    S=np.abs(librosa.stft(x, n_fft=2048, hop_length=hop)); f=librosa.fft_frequencies(sr=SR,n_fft=2048)
    return {'sub':S[(f>=30)&(f<70)].sum(0),'kick':S[(f>=60)&(f<130)].sum(0),'snare':S[(f>=180)&(f<600)].sum(0),
            'hat':S[(f>=6000)&(f<11000)].sum(0),'mid':S[(f>=600)&(f<3000)].sum(0)}, S, f
def profile(x, a, b, nsub=4):
    # returns (nsub*16) profile of band energies aligned to beat grid via beat map
    d, S, f = bands(x)
    t = librosa.frames_to_time(np.arange(S.shape[1]), sr=SR, hop_length=hop)
    idx = np.searchsorted(bt, t)-1
    ok = (idx>=0)&(idx<len(bt)-1)
    ks = bt[idx[ok]]; kn = bt[idx[ok]+1]
    u = (t[ok]-ks)/(kn-ks)
    tt = t[ok]
    sel = (tt>=a)&(tt<b)
    NB=nsub*4
    ph = (idx[ok][sel]%4 + u[sel])/4.0   # position within a bar (0..1)
    bins = np.clip((ph*NB).astype(int),0,NB-1)
    out={}
    for k,v in d.items():
        p=np.bincount(bins, weights=v[ok][sel], minlength=NB); c=np.bincount(bins, minlength=NB)
        out[k]=p/np.maximum(c,1)
    return out
np.set_printoptions(suppress=True, precision=0, linewidth=250)
for name,(a,b) in {"A 12-36":(12,36),"B/C 40-64":(40,64),"D 64-83":(64,83),"E 87-100":(87,100),"F 100-145":(100,145),"G 148-167":(148,167)}.items():
    o = profile(P, a, b, 4)
    print(f"\n=== percussive, bar positions 1..16 (16ths), section {name} ===")
    for k in ('sub','kick','snare','hat','mid'):
        v=o[k]; print(f"  {k:6s}:", np.round(v/v.mean(),2))
o2 = profile(H, 12, 36, 4)
print("\n=== harmonic section A ===")
for k in ('sub','kick','snare','hat','mid'): 
    v=o2[k]; print(f"  {k:6s}:", np.round(v/v.mean(),2))
