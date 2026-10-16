import numpy as np, librosa, sys, json
sys.path.insert(0,'remix'); import dsp, soundfile as sf
SR=44100
src,_ = librosa.load('_handsgod.mp3', sr=SR, mono=True); src=src.astype(np.float32)
mix, sr2 = sf.read('remix/handsgod_remix_master.wav', always_2d=True)
mix = mix.T.astype(np.float32); print("remix:", mix.shape, sr2, "dur", mix.shape[1]/SR)
# где в ремиксе начинается исходник
OFF = -0.084 + 8*1.6
def kick_env(x, hop=256):
    S=np.abs(librosa.stft(x, n_fft=1024, hop_length=hop)); f=librosa.fft_frequencies(sr=SR,n_fft=1024)
    return S[(f>=40)&(f<110)].sum(0)
em = kick_env(dsp.as_mono(mix)); es = kick_env(src)
a=int((OFF+12)*SR/256); b=int((OFF+40)*SR/256)
# кросс-корреляция кик-огибающих в дропе
seg_m = em[a:b]; 
best=(0,0)
for lag in range(-40,41):
    seg_s = es[a+lag - 0 + 0 : b+lag] if False else None
    # сравниваем с исходником по смещению lag (в кадрах по 5.8 мс)
    s0=a+lag; s1=b+lag
    if s0<0 or s1>len(es): continue
    seg_s = es[s0:s1]
    c = float(np.corrcoef(seg_m[:len(seg_s)], seg_s)[0,1])
    if c>best[0]: best=(c,lag)
print(f"лучшая корреляция кик-огибающих: r={best[0]:.3f} при лаге {best[1]} кадров = {best[1]*256/SR*1000:+.1f} мс")
# сравнение спектральных полос (по энергии) на участке 12-40 c исходника
def bands(x, a, b):
    seg = x[int(a*SR):int(b*SR)]
    S=np.abs(librosa.stft(seg, n_fft=4096, hop_length=1024))**2
    f=librosa.fft_frequencies(sr=SR,n_fft=4096)
    out={}
    for name,(lo,hi) in {'sub 20-60':(20,60),'bass 60-120':(60,120),'lowmid 120-300':(120,300),
        'mid 300-1k':(300,1000),'pres 1-3k':(1000,3000),'high 3-8k':(3000,8000),'air 8-16k':(8000,16000)}.items():
        m=(f>=lo)&(f<hi); out[name]=float(np.sum(S[m]))
    return out
bs = bands(src, 12, 40); bm = bands(dsp.as_mono(mix), 12+OFF, 40+OFF)
print("\nполоса                исходник      ремикс     разница дБ")
for k in bs:
    d = 10*np.log10((bm[k]+1e-12)/(bs[k]+1e-12))
    print(f"  {k:18s} {10*np.log10(bs[k]+1e-12):8.1f} {10*np.log10(bm[k]+1e-12):11.1f}   {d:+6.2f}")
print("\nLUFS исходника:", round(dsp.measure_lufs(src,SR),2), " ремикса:", round(dsp.measure_lufs(mix,SR),2))
print("true peak ремикса:", round(dsp.true_peak_db(mix),2))
print("DC:", float(mix.mean()), " max |d|:", float(np.max(np.abs(np.diff(mix, axis=1)))))
print("NaN:", bool(np.isnan(mix).any()))
