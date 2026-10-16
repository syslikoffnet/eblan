import numpy as np, librosa, sys, json
sys.path.insert(0,'remix'); import dsp
import matplotlib; matplotlib.use('Agg'); import matplotlib.pyplot as plt
SR=44100; OFF=8*1.6-0.084
src,_=librosa.load('_handsgod.mp3', sr=SR, mono=True); src=src.astype(np.float32)
mix,_=librosa.load('remix/handsgod_remix_master.wav', sr=SR, mono=False); mix=mix.astype(np.float32)
src2,_=librosa.load('_handsgod.mp3', sr=SR, mono=False); src2=src2.astype(np.float32)
mono=dsp.as_mono(mix)
rep={}
rep['remix_dur']=round(mix.shape[1]/SR,2)
rep['remix_max_sample']=round(float(np.abs(mix).max()),4)
rep['nan']=bool(np.isnan(mix).any())
rep['dc']=round(float(mono.mean()),5)
rep['lufs_src']=round(dsp.measure_lufs(src2,SR),2); rep['lufs_mix']=round(dsp.measure_lufs(mix,SR),2)
rep['tp_src']=round(dsp.true_peak_db(src,SR),2); rep['tp_mix']=round(dsp.true_peak_db(mono,SR),2)
# по секциям
secs={'интро':(0,11.3),'дроп1':(11.3,24),'брейк':(36.9,40.1),'25-40':(40.1,64),'брейкдаун':(76.9,83.3),
      'финал':(152,166.5),'аутро':(166.5,173)}
rep['sections']={}
for k,(a,b) in secs.items():
    s1=float(dsp.measure_lufs(src2[:, int(a*SR):int(b*SR)],SR))
    s2=float(dsp.measure_lufs(mix[:, int((a+OFF)*SR):int((b+OFF)*SR)],SR))
    rep['sections'][k]=dict(src=round(s1,2), mix=round(s2,2), delta=round(s2-s1,2))
# полосы
def banddb(x,a,b):
    seg=x[int(a*SR):int(b*SR)]
    S=np.abs(librosa.stft(seg,n_fft=4096,hop_length=1024))**2
    f=librosa.fft_frequencies(sr=SR,n_fft=4096)
    B={'sub 30-60':(30,60),'bass 60-120':(60,120),'lowmid 120-300':(120,300),'mid 300-1k':(300,1000),
       'pres 1-4k':(1000,4000),'high 4-9k':(4000,9000),'air 9-16k':(9000,16000)}
    return {n: float(10*np.log10(np.sum(S[(f>=lo)&(f<hi)])+1e-12)) for n,(lo,hi) in B.items()}
a,b=12,64
bs=banddb(src,a,b); bm=banddb(mono,a+OFF,b+OFF)
rep['bands']={k: round(bm[k]-bs[k],2) for k in bs}
# выравнивание (широкополосная кросс-корреляция 300-3000)
import scipy.signal as ss
def bp(x,lo,hi):
    sos=ss.butter(4,[lo/(SR/2),hi/(SR/2)],btype='band',output='sos'); return ss.sosfiltfilt(sos,x).astype(np.float32)
s_=bp(src,300,3000); m_=bp(mono,300,3000)
w0,w1=int(20*SR),int(30*SR)
c=ss.correlate(m_[w0+int(OFF*SR)-2000:w1+int(OFF*SR)+2000], s_[w0:w1], mode='valid')
rep["align_lag_ms"]=round(float(np.argmax(c)-2000)/SR*1000,1)
print(json.dumps(rep, ensure_ascii=False, indent=2))
with open('work/final_report.json','w') as fh: json.dump(rep,fh,ensure_ascii=False,indent=2)

# ---------- фигуры ----------
def rms_env(x, hop=int(0.05*SR)):
    n=len(x)//hop*hop
    return np.sqrt(np.mean(x[:n].reshape(-1,hop)**2,axis=1))
hop=int(0.05*SR)
t_src=np.arange(len(rms_env(src)))*0.05
e_src=rms_env(src); e_mix=rms_env(mono)
fig,ax=plt.subplots(3,1,figsize=(20,12))
ax[0].plot(np.arange(len(e_src))*0.05, e_src, lw=1, label='исходник', color='tab:blue')
ax[0].plot(np.arange(len(e_mix))*0.05, e_mix, lw=1, label='ремикс', color='tab:red', alpha=0.8)
ax[0].set_xlim(0,192); ax[0].legend(); ax[0].set_title('RMS-огибающая: исходник vs ремикс (ремикс сдвинут на 12.7 c из-за DJ-интро)'); ax[0].grid(True)
# спектрограммы окна дропа
S_s=librosa.amplitude_to_db(np.abs(librosa.stft(src[int(12*SR):int(20*SR)], n_fft=2048, hop_length=256)), ref=np.max)
S_m=librosa.amplitude_to_db(np.abs(librosa.stft(mono[int((12+OFF)*SR):int((20+OFF)*SR)], n_fft=2048, hop_length=256)), ref=np.max)
librosa.display.specshow(S_s, sr=SR, hop_length=256, y_axis='log', x_axis='time', ax=ax[1], cmap='magma'); ax[1].set_title('исходник 12-20 c')
librosa.display.specshow(S_m, sr=SR, hop_length=256, y_axis='log', x_axis='time', ax=ax[2], cmap='magma'); ax[2].set_title('ремикс, тот же фрагмент'); 
plt.tight_layout(); plt.savefig('remix/compare.png', dpi=80); plt.close()
# полосовая разница
fig,ax=plt.subplots(figsize=(11,5))
ks=list(bs.keys()); vals=[bm[k]-bs[k] for k in ks]
cols=['tab:green' if v>0 else 'tab:red' for v in vals]
ax.bar(ks, vals, color=cols); ax.axhline(0,color='k',lw=0.8); ax.grid(True, axis='y')
ax.set_title('Разница спектральных полос (ремикс − исходник), дБ, окно 12-64 c'); ax.tick_params(axis='x', rotation=25)
plt.tight_layout(); plt.savefig('remix/bands.png', dpi=80); plt.close()
print("фигуры сохранены: remix/compare.png, remix/bands.png")
