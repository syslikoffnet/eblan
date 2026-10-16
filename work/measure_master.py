import numpy as np, librosa, sys
sys.path.insert(0,'remix'); import dsp
SR=44100
src,_=librosa.load('_handsgod.mp3', sr=SR, mono=True); src=src.astype(np.float32)
def seg_lufs(x,a,b): return dsp.measure_lufs(x[int(a*SR):int(b*SR)], SR)
print("исходник LUFS (секции):")
for a,b,n in [(0,11,'интро'),(11.3,24,'дроп1'),(40,64,'дроп25-40'),(83,100,'дроп52-62'),(152,166,'финал'),(12,40,'12-40'),(100,140,'100-140')]:
    print(f"  {n:10s} {a:6.1f}-{b:6.1f}s: {seg_lufs(src,a,b):6.2f} LUFS   peak {np.abs(src[int(a*SR):int(b*SR)]).max():.3f}")
print("весь исходник:", round(dsp.measure_lufs(src,SR),2), "LUFS, true peak", round(dsp.true_peak_db(src),2), "dBTP")
# RMS профиль по 10 с
for a in range(0,170,20):
    s=src[a*SR:(a+20)*SR]
    print(f"  {a:3d}-{a+20:3d}s RMS {np.sqrt(np.mean(s**2)):.4f}  LUFS {seg_lufs(src,a,a+20):6.2f}")
mix,_=librosa.load('remix/handsgod_remix_master.wav', sr=SR, mono=True)
OFF=-0.084+8*1.6
print("\nремикс vs исходник по окнам:")
for a in range(0,160,20):
    print(f"  {a:3d}-{a+20:3d}s источ: {seg_lufs(src,a,a+20):6.2f} LUFS | ремикс {seg_lufs(mix,a+OFF,a+20+OFF):6.2f} LUFS")
