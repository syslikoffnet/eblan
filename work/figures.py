import numpy as np, librosa, sys, json
sys.path.insert(0,'remix'); import dsp, make_remix as M
import matplotlib; matplotlib.use('Agg'); import matplotlib.pyplot as plt
SR=44100; OFF=8*1.6-0.084
src2,_=librosa.load('_handsgod.mp3', sr=SR, mono=False); src2=src2.astype(np.float32)
mix,_=librosa.load('remix/handsgod_remix_master.wav', sr=SR, mono=False); mix=mix.astype(np.float32)
mono=dsp.as_mono(mix)
# ---------- 1. сравнение огибающих + спектрограммы ----------
def rms_env(x, hop=int(0.05*SR)):
    n=len(x)//hop*hop
    return np.sqrt(np.mean(x[:n].reshape(-1,hop)**2,axis=1))
fig,ax=plt.subplots(3,1,figsize=(20,12))
ax[0].plot(np.arange(len(rms_env(dsp.as_mono(src2))))*0.05, rms_env(dsp.as_mono(src2)), lw=0.9, label='исходник', color='tab:blue')
ax[0].plot(np.arange(len(rms_env(mono)))*0.05, rms_env(mono), lw=0.9, label='ремикс', color='tab:red', alpha=0.75)
ax[0].axvline(OFF, color='k', ls='--', lw=1); ax[0].text(OFF+1, 0.45, 'старт исходника в ремиксе', fontsize=9)
ax[0].set_xlim(0,192); ax[0].legend(); ax[0].grid(True)
ax[0].set_title('RMS-огибающая: исходник (синий) vs ремикс (красный)')
S_s=librosa.amplitude_to_db(np.abs(librosa.stft(dsp.as_mono(src2[:, int(12*SR):int(20*SR)]), n_fft=2048, hop_length=256)), ref=np.max)
S_m=librosa.amplitude_to_db(np.abs(librosa.stft(mono[int((12+OFF)*SR):int((20+OFF)*SR)], n_fft=2048, hop_length=256)), ref=np.max)
librosa.display.specshow(S_s, sr=SR, hop_length=256, y_axis='log', x_axis='time', ax=ax[1], cmap='magma'); ax[1].set_title('исходник, 12–20 c')
librosa.display.specshow(S_m, sr=SR, hop_length=256, y_axis='log', x_axis='time', ax=ax[2], cmap='magma'); ax[2].set_title('ремикс, тот же фрагмент (+ DJ-интро 12.7 c)')
plt.tight_layout(); plt.savefig('remix/compare.png', dpi=80); plt.close()

# ---------- 2. карта аранжировки ремикса ----------
fig,ax=plt.subplots(figsize=(22,6.5))
t=np.arange(len(rms_env(mono)))*0.05; e=rms_env(mono)
ax.fill_between(t, 0, e, color='tab:red', alpha=0.65, lw=0)
def mark(a,b,label,color='gold',alpha=0.22):
    ax.axvspan(a,b,color=color,alpha=alpha)
    ax.text((a+b)/2, 0.5, label, ha='center', fontsize=9, weight='bold')
mark(0,OFF,'DJ-интро (LP-луп + кик + райзер)','steelblue')
for i,(a,b) in enumerate([(7,23),(25,31),(31,41),(42,48),(52,55),(55,64),(66,73),(74,88),(92,95),(95,104)]):
    mark(M.bar(a)+OFF, M.bar(b)+OFF, f'ДРОП {i+1}')
for a,b in [(23,25),(48,52),(64,66),(88,92)]:
    mark(M.bar(a)+OFF, M.bar(b)+OFF, 'брейк','lightgreen')
mark(M.bar(104)+OFF, M.bar(109)+OFF, 'аутро-луп','violet')
ax.set_xlim(0,192); ax.set_ylim(0,0.62); ax.grid(True, axis='y')
ax.set_xlabel('время, с'); ax.set_ylabel('RMS')
ax.set_title('Карта аранжировки ремикса (дропы/брейки/интро/аутро) поверх RMS-огибающей')
plt.tight_layout(); plt.savefig('remix/arrangement.png', dpi=80); plt.close()

# ---------- 3. полосовая разница ----------
def banddb(x,a,b):
    seg=dsp.as_mono(x[:, int(a*SR):int(b*SR)])
    S=np.abs(librosa.stft(seg,n_fft=4096,hop_length=1024))**2
    f=librosa.fft_frequencies(sr=SR,n_fft=4096)
    B={'sub 30-60':(30,60),'bass 60-120':(60,120),'lowmid 120-300':(120,300),'mid 300-1k':(300,1000),
       'pres 1-4k':(1000,4000),'high 4-9k':(4000,9000),'air 9-16k':(9000,16000)}
    return {n: float(10*np.log10(np.sum(S[(f>=lo)&(f<hi)])+1e-12)) for n,(lo,hi) in B.items()}
bs=banddb(src2,12,64); bm=banddb(mix,12+OFF,64+OFF)
fig,ax=plt.subplots(figsize=(11,5))
ks=list(bs.keys()); vals=[bm[k]-bs[k] for k in ks]
ax.bar(ks, vals, color=['tab:green' if v>0 else 'tab:red' for v in vals])
ax.axhline(0,color='k',lw=0.8); ax.grid(True, axis='y')
ax.set_title('Разница по полосам (ремикс − исходник), дБ, окно 12–64 c'); ax.tick_params(axis='x', rotation=25)
plt.tight_layout(); plt.savefig('remix/bands.png', dpi=80); plt.close()
print("полосы:", {k: round(v,2) for k,v in zip(ks,vals)})
print("фигуры: remix/compare.png, remix/arrangement.png, remix/bands.png")
