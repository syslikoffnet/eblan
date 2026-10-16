import numpy as np, librosa, scipy.signal as ss
SR=22050
y, _ = librosa.load('/home/user/eblan/_handsgod.mp3', sr=SR, mono=True); y=y.astype(np.float32)
notes=['C','C#','D','D#','E','F','F#','G','G#','A','A#','B']
def chroma_of(seg, fmin=librosa.note_to_hz('C2'), n_oct=5):
    c = librosa.feature.chroma_cqt(y=seg, sr=SR, fmin=fmin, n_octaves=n_oct, bins_per_octave=36)
    return c.mean(1)
maj=np.array([6.35,2.23,3.48,2.33,4.38,4.09,2.52,5.19,2.39,3.66,2.29,2.88])
mino=np.array([6.33,2.68,3.52,5.38,2.60,3.53,2.54,4.75,3.98,2.69,3.34,3.17])
def key_of(p):
    p=p-p.mean(); out=[]
    for i in range(12):
        for nm,pr in (("maj",maj),("min",mino)):
            q=np.roll(pr,i); q=q-q.mean()
            out.append((float(np.dot(p,q)/(np.linalg.norm(p)*np.linalg.norm(q))), notes[i]+nm))
    return sorted(out,reverse=True)[:4]
segs = {"intro 0-10s": (0,10), "A 12-36s": (12,36), "B 40-51s": (40,51), "C 51-64s": (51,64),
        "D 64-83s": (64,83), "E 87-100s": (87,100), "F 100-145s": (100,145), "G 148-167s": (148,167)}
for name,(a,b) in segs.items():
    seg = y[int(a*SR):int(b*SR)]
    if len(seg)<SR: continue
    p = chroma_of(seg)
    print(f"{name}: {[(n, round(s,3)) for s,n in key_of(p)]}")
    print("   chroma:", {notes[i]: round(float(p[i]),3) for i in range(12)})
# low band chroma (bass roots) per 4-bar block in F section
b, a = ss.butter(4, [30/(SR/2), 200/(SR/2)], btype='band')
yl = ss.filtfilt(b,a, y).astype(np.float32)
c = librosa.feature.chroma_cqt(y=yl, sr=SR, fmin=librosa.note_to_hz('C1'), n_octaves=4, bins_per_octave=12)
tt = librosa.frames_to_time(np.arange(c.shape[1]), sr=SR)
print("\nlow-band root per 4 bars (1.6s x4 = 6.4s):", )
for i in range(0, 168, 4):
    m=(tt>=i)&(tt<i+4)
    if not m.any(): continue
    p=c[:,m].mean(1)
    print(f"  {i:3d}-{i+4:3d}s root={notes[int(np.argmax(p))]}  top3={[notes[j] for j in np.argsort(p)[::-1][:3]]}")
