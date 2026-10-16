import numpy as np, librosa
SR=44100
y, _ = librosa.load('/home/user/eblan/_handsgod.mp3', sr=SR, mono=True)
y = y.astype(np.float32)
hop=256
oe = librosa.onset.onset_strength(y=y, sr=SR, hop_length=hop, n_fft=2048, fmax=10000)
tempo, beats = librosa.beat.beat_track(onset_envelope=oe, sr=SR, hop_length=hop, trim=False, tightness=300)
bt = librosa.frames_to_time(beats, sr=SR, hop_length=hop)
print("tempo", np.atleast_1d(tempo), "n beats", len(bt))
d=np.diff(bt)
print("interval: mean %.5f median %.5f std %.5f min %.5f max %.5f"%(d.mean(), np.median(d), d.std(), d.min(), d.max()))
print("first 30 beats:", np.round(bt[:30],4))
print("last 10 beats:", np.round(bt[-10:],4), " audio dur", len(y)/SR)
# residuals against a pure 152 grid fit
period=60/152.0
k=np.round((bt-bt[0])/period)
resid = bt - (bt[0]+k*period)
print("residual vs 152 grid: std %.4f max %.4f  (ms std %.1f)"%(resid.std(), np.abs(resid).max(), resid.std()*1000))
print("residual samples:", np.round(resid[::10]*1000,1))
# check monotonic index consistency
print("k gaps:", np.unique(np.diff(k), return_counts=True))
np.save('work/bt44.npy', bt); np.save('work/oe44.npy', oe)
