import numpy as np, librosa, scipy.signal as ss
SR=22050
y, _ = librosa.load('/home/user/eblan/_handsgod.mp3', sr=SR, mono=True); y=y.astype(np.float32)
H, P = librosa.effects.hpss(y, kernel_size=31, margin=(1.0, 5.0))
np.save('work/harm.npy', H.astype(np.float32)); np.save('work/perc.npy', P.astype(np.float32))
notes=['C','C#','D','D#','E','F','F#','G','G#','A','A#','B']
def note_name(f):
    if f<=0 or np.isnan(f): return '-'
    return notes[int(np.round(librosa.hz_to_midi(f)))%12]
# pyin on low band of harmonic part
b,a = ss.butter(4,[55/(SR/2), 300/(SR/2)], btype='band'); yl=ss.filtfilt(b,a,H).astype(np.float32)
f0, vflag, vprob = librosa.pyin(yl, fmin=55, fmax=300, sr=SR, hop_length=512, frame_length=2048)
tt = librosa.frames_to_time(np.arange(len(f0)), sr=SR, hop_length=512)
print("pyin voiced fraction:", float(np.mean(vflag)))
print("bar roots (4 bars = 6.4s blocks): ")
for i in range(0,168,2):
    m=(tt>=i)&(tt<i+2)&vflag
    if m.sum()<4: 
        print(f"  {i:3d}s: -"); continue
    med = np.nanmedian(f0[m])
    print(f"  {i:3d}-{i+2:3d}s: {note_name(med):3s} ({med:6.1f} Hz)  spread={np.nanstd(f0[m]):5.1f}")
# chroma of harmonic mid band per section
def chr_band(seg, lo, hi, fmin, n_oct):
    bb,aa = ss.butter(4,[lo/(SR/2), hi/(SR/2)], btype='band'); s=ss.filtfilt(bb,aa,seg).astype(np.float32)
    c=librosa.feature.chroma_cqt(y=s, sr=SR, fmin=librosa.note_to_hz(fmin), n_octaves=n_oct, bins_per_octave=24)
    return c.mean(1)
maj=np.array([6.35,2.23,3.48,2.33,4.38,4.09,2.52,5.19,2.39,3.66,2.29,2.88]); mino=np.array([6.33,2.68,3.52,5.38,2.60,3.53,2.54,4.75,3.98,2.69,3.34,3.17])
def key_of(p):
    p=p-p.mean(); out=[]
    for i in range(12):
        for nm,pr in (("maj",maj),("min",mino)):
            q=np.roll(pr,i); q=q-q.mean(); out.append((float(np.dot(p,q)/(np.linalg.norm(p)*np.linalg.norm(q))), notes[i]+nm))
    return sorted(out,reverse=True)[:3]
for name,(a2,b2) in {"0-10":(0,10),"12-36":(12,36),"40-51":(40,51),"51-64":(51,64),"64-83":(64,83),"87-100":(87,100),"100-145":(100,145),"148-167":(148,167)}.items():
    seg=H[int(a2*SR):int(b2*SR)]
    p = chr_band(seg, 100, 500, 'C2', 4)
    print(f"harm low 100-500Hz {name}s: {[(n,round(s,2)) for s,n in key_of(p)]}  top={[notes[i] for i in np.argsort(p)[::-1][:4]]}")
    p2 = chr_band(seg, 400, 2000, 'C3', 3)
    print(f"harm mel 400-2k   {name}s: {[(n,round(s,2)) for s,n in key_of(p2)]}  top={[notes[i] for i in np.argsort(p2)[::-1][:4]]}")
