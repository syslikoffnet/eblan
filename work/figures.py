import numpy as np, librosa, sys
sys.path.insert(0,'remix'); import dsp, make_remix as M
import matplotlib; matplotlib.use('Agg'); import matplotlib.pyplot as plt
SR=44100; OFF=-M.bar(-M.PRE_BARS)
src,_=librosa.load('_handsgod.mp3', sr=SR, mono=False); src=src.astype(np.float32)
mix,_=librosa.load('remix/handsgod_remix_master.wav', sr=SR, mono=False); mix=mix.astype(np.float32)
mono=dsp.as_mono(mix)

def rms_env(x, hop=int(0.05*SR)):
    n=len(x)//hop*hop
    return np.sqrt(np.mean(x[:n].reshape(-1,hop)**2,axis=1))

# ---------- 1. огибающие + спектрограммы ----------
fig,ax=plt.subplots(3,1,figsize=(20,12))
ax[0].plot(np.arange(len(rms_env(dsp.as_mono(src))))*0.05, rms_env(dsp.as_mono(src)), lw=0.9, label='исходник', color='tab:blue')
ax[0].plot(np.arange(len(rms_env(mono)))*0.05, rms_env(mono), lw=0.9, label='ремикс', color='tab:red', alpha=0.75)
ax[0].axvline(OFF, color='k', ls='--', lw=1); ax[0].text(OFF+1, 0.45, 'старт исходника в ремиксе', fontsize=9)
ax[0].set_xlim(0,192); ax[0].legend(); ax[0].grid(True)
ax[0].set_title('RMS-огибающая: исходник vs ремикс (мастер −9.4 LUFS)')
S_s=librosa.amplitude_to_db(np.abs(librosa.stft(dsp.as_mono(src[:, int(12*SR):int(20*SR)]), n_fft=2048, hop_length=256)), ref=np.max)
S_m=librosa.amplitude_to_db(np.abs(librosa.stft(mono[int((12+OFF)*SR):int((20+OFF)*SR)], n_fft=2048, hop_length=256)), ref=np.max)
librosa.display.specshow(S_s, sr=SR, hop_length=256, y_axis='log', x_axis='time', ax=ax[1], cmap='magma'); ax[1].set_title('исходник, 12–20 c')
librosa.display.specshow(S_m, sr=SR, hop_length=256, y_axis='log', x_axis='time', ax=ax[2], cmap='magma'); ax[2].set_title('ремикс, тот же фрагмент (+DJ-интро 12.7 c)')
plt.tight_layout(); plt.savefig('remix/compare.png', dpi=80); plt.close()

# ---------- 2. карта аранжировки ----------
fig,ax=plt.subplots(figsize=(22,6.5))
t=np.arange(len(rms_env(mono)))*0.05; e=rms_env(mono)
ax.fill_between(t,0,e,color='tab:red',alpha=0.6,lw=0)
def mark(a,b,label,color='gold',alpha=0.20,fs=9):
    ax.axvspan(a,b,color=color,alpha=alpha); ax.text((a+b)/2,0.5,label,ha='center',fontsize=fs,weight='bold')
mark(0,OFF,'DJ-интро','steelblue')
for i, bars in enumerate(M.DROPS):
    mark(M.bar(bars[0])+OFF, M.bar(bars[-1])+OFF, f'ДРОП {i+1}')
for a,b in [(23,25),(48,52),(64,66),(88,92)]:
    mark(M.bar(a)+OFF, M.bar(b)+OFF, 'брейк','lightgreen')
mark(M.bar(104)+OFF, M.bar(109)+OFF, 'аутро-луп','violet')
ax.set_xlim(0,192); ax.set_ylim(0,0.62); ax.grid(True, axis='y')
ax.set_xlabel('время, с'); ax.set_ylabel('RMS'); ax.set_title('Карта аранжировки: 10 дропов, 4 брейка, DJ-интро и аутро-луп')
plt.tight_layout(); plt.savefig('remix/arrangement.png', dpi=80); plt.close()

# ---------- 3. полосы + громкость по секциям ----------
def bands(x,a,b):
    seg=dsp.as_mono(x[:, int(a*SR):int(b*SR)])
    S=np.abs(librosa.stft(seg,n_fft=4096,hop_length=1024))**2; f=librosa.fft_frequencies(sr=SR,n_fft=4096)
    B={'sub 30-60':(30,60),'bass 60-120':(60,120),'low-mid 120-300':(120,300),'mid 300-1k':(300,1000),
       'pres 1-4k':(1000,4000),'high 4-9k':(4000,9000),'air 9-16k':(9000,16000)}
    return {k: float(10*np.log10(np.sum(S[(f>=lo)&(f<hi)])+1e-12)) for k,(lo,hi) in B.items()}
bs=bands(src,12,64); bm=bands(mix,12+OFF,64+OFF)
fig,ax=plt.subplots(1,2,figsize=(17,5))
ks=list(bs.keys()); vals=[bm[k]-bs[k] for k in ks]
ax[0].bar(ks, vals, color=['tab:green' if v>0 else 'tab:red' for v in vals])
ax[0].axhline(0,color='k',lw=0.8); ax[0].grid(True, axis='y')
ax[0].set_title('Разница по полосам (ремикс − исходник), дБ, окно 12–64 c'); ax[0].tick_params(axis='x', rotation=30)
secs={'интро':(0,11),'дроп 1':(11.3,24),'брейк':(36.9,40.1),'дроп 2 (без баса)':(40.1,49.7),
      'дроп 3':(49.7,64),'брейкдаун':(76.9,83.3),'финал':(152,166.5),'аутро':(166.5,173)}
names=list(secs.keys())
sv=[float(dsp.measure_lufs(src[:,int(secs[n][0]*SR):int(secs[n][1]*SR)],SR)) for n in names]
mv=[float(dsp.measure_lufs(mix[:,int((secs[n][0]+OFF)*SR):int((secs[n][1]+OFF)*SR)],SR)) for n in names]
x=np.arange(len(names)); w=0.38
ax[1].bar(x-w/2, sv, w, label='исходник', color='tab:blue')
ax[1].bar(x+w/2, mv, w, label='ремикс', color='tab:red')
ax[1].set_xticks(x); ax[1].set_xticklabels(names, rotation=25, ha='right'); ax[1].legend(); ax[1].grid(True, axis='y')
ax[1].set_title('Громкость по секциям, LUFS (динамика сохранена)')
plt.tight_layout(); plt.savefig('remix/bands.png', dpi=80); plt.close()
print("фигуры обновлены")
