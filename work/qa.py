import numpy as np, librosa, sys, json
sys.path.insert(0,'remix'); import dsp, make_remix as M
SR=44100; OFF=-M.bar(-M.PRE_BARS)
src,_=librosa.load('_handsgod.mp3', sr=SR, mono=False); src=src.astype(np.float32)
mix,_=librosa.load('remix/handsgod_remix_master.wav', sr=SR, mono=False); mix=mix.astype(np.float32)
sm=dsp.as_mono(src); mm=dsp.as_mono(mix)
print(f"remix {mix.shape[1]/SR:.2f} c | max sample {np.abs(mix).max():.3f} | DC {mm.mean():+.5f} | NaN {np.isnan(mix).any()}")
print(f"LUFS: source {dsp.measure_lufs(src,SR):.2f} | remix {dsp.measure_lufs(mix,SR):.2f}")
print(f"TP:   source {dsp.true_peak_db(src,SR):+.2f} | remix {dsp.true_peak_db(mix,SR):+.2f}")
def bands(x,a,b):
    seg=dsp.as_mono(x[:, int(a*SR):int(b*SR)])
    S=np.abs(librosa.stft(seg,n_fft=4096,hop_length=1024))**2; f=librosa.fft_frequencies(sr=SR,n_fft=4096)
    B={'sub30-60':(30,60),'bass60-120':(60,120),'lowmid120-300':(120,300),'mid300-1k':(300,1000),
       'pres1-4k':(1000,4000),'high4-9k':(4000,9000),'air9-16k':(9000,16000)}
    return {k: float(10*np.log10(np.sum(S[(f>=lo)&(f<hi)])+1e-12)) for k,(lo,hi) in B.items()}
print("\n--- баланс полос (окно 12-64 c исходника / то же в ремиксе) ---")
bs=bands(src,12,64); bm=bands(mix,12+OFF,64+OFF)
for k in bs: print(f"  {k:12s} src {bs[k]:7.1f}  mix {bm[k]:7.1f}  Δ {bm[k]-bs[k]:+6.2f}")
print("\n--- 'дырки' исходника: 40-50 c и 83-87 c ---")
for (a,b,nm) in [(40.1,49.7,'40-50'),(83.3,87.3,'83-87')]:
    x1=bands(src,a,b); x2=bands(mix,a+OFF,b+OFF)
    print(f"  {nm}: sub Δ {x2['sub30-60']-x1['sub30-60']:+.1f} дБ, bass Δ {x2['bass60-120']-x1['bass60-120']:+.1f} дБ")
print("\n--- LUFS по секциям ---")
for nm,(a,b) in {'интро':(0,11),'дроп1':(11.3,24),'брейк':(36.9,40.1),'дроп2(без баса)':(40.1,49.7),
                 'дроп3':(49.7,64),'брейкдаун':(76.9,83.3),'финал':(152,166.5),'аутро':(166.5,173)}.items():
    print(f"  {nm:16s} src {dsp.measure_lufs(src[:,int(a*SR):int(b*SR)],SR):6.2f} | mix {dsp.measure_lufs(mix[:,int((a+OFF)*SR):int((b+OFF)*SR)],SR):6.2f}")
# транзиенты: контраст онсетов кика (ремикс vs исходник)
def onset_contrast(x, a, b):
    seg=dsp.as_mono(x[:, int(a*SR):int(b*SR)])
    S=np.abs(librosa.stft(seg,n_fft=1024,hop_length=128)); f=librosa.fft_frequencies(sr=SR,n_fft=1024)
    e=S[(f>=40)&(f<110)].sum(0); e=np.diff(np.log1p(e),prepend=e[0]); e=np.maximum(e,0)
    return float(e.max()/ (np.median(e)+1e-9))
print(f"\nконтраст кик-онсетов (дроп 12-24 c): source {onset_contrast(src,12,24):.1f} | remix {onset_contrast(mix,12+OFF,24+OFF):.1f}")
# моно-совместимость
mid=mix.mean(0); side=(mix[0]-mix[1])/2
print(f"корреляция каналов: {np.corrcoef(mix[0],mix[1])[0,1]:.3f}; side/mid = {np.sqrt(np.mean(side**2))/np.sqrt(np.mean(mid**2)):.3f}")
# клики/разрывы
d=np.abs(np.diff(mix,axis=1)); print(f"max |Δsample| = {d.max():.3f}, 99.99pct = {np.percentile(d,99.99):.3f}")
# проверка тональности баса в дырках (по спектру 40-120 Гц)
notes=['C','C#','D','D#','E','F','F#','G','G#','A','A#','B']
for (a,b) in [(40.1,49.7),(83.3,87.3)]:
    seg=dsp.as_mono(mix[:, int((a+OFF)*SR):int((b+OFF)*SR)])
    c=librosa.feature.chroma_cqt(y=librosa.effects.harmonic(seg), sr=SR, fmin=librosa.note_to_hz('C1'), n_octaves=4)
    p=c.mean(1); print(f"  бас-корень {a}-{b}: {notes[int(np.argmax(p))]} (топ: {[notes[i] for i in np.argsort(p)[::-1][:3]]})")
