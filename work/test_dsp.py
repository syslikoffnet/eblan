import numpy as np, sys, os
sys.path.insert(0,'remix')
import dsp, soundfile as sf
SR=44100; rng=np.random.default_rng(1)
items = {
 'kick': dsp.kick(SR,rng), 'snare': dsp.snare(SR,rng), 'clap': dsp.clap(SR,rng),
 'hat': dsp.hat(SR,rng), 'openhat': dsp.openhat(SR,rng), 'shaker': dsp.shaker(SR,rng),
 'crash': dsp.crash(SR,rng), 'impact': dsp.impact(SR,rng), 'tom': dsp.tom(SR,rng),
 'riser': dsp.riser(SR,rng,2.0), 'down': dsp.downlifter(SR,rng),
}
for k,v in items.items():
    print(f"{k:8s} len={v.shape[1]/SR:5.2f}s peak={np.abs(v).max():.3f} rms={np.sqrt(np.mean(v**2)):.4f} nan={np.isnan(v).any()} dc={np.mean(v):+.4f}")
# spectral centroid sanity
import librosa
for k in ('kick','clap','hat','crash'):
    c = librosa.feature.spectral_centroid(y=items[k].mean(0), sr=SR).mean()
    print(f"  centroid {k}: {c:.0f} Hz")
# quick one-bar demo mix
bar = int(1.579*SR)
buf = np.zeros((2,bar))
def put(name,t,g):
    dsp.add_at(buf,t,items[name],SR,g)
for q in range(4): put('kick', q*0.39474, -3)
for q in (1,3): put('clap', q*0.39474, -8); put('snare', q*0.39474, -12)
for e in range(8): put('hat', e*0.19737, -14 if e%2==0 else -17)
put('openhat', 3.5*0.39474, -16); put('crash',0,-10); put('impact',0,-6)
print("bar peak", np.abs(buf).max())
sf.write('work/fig/drumtest.wav', buf.T, SR)
print("LUFS слоя барабанов:", dsp.measure_lufs(buf, SR))
