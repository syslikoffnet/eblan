import numpy as np, librosa, sys
sys.path.insert(0,'remix'); import dsp
SR=44100
src,_=librosa.load('_handsgod.mp3', sr=SR, mono=True); src=src.astype(np.float32)
mix,_=librosa.load('remix/handsgod_remix_master.wav', sr=SR, mono=True); mix=mix.astype(np.float32)
OFF=8*1.6-0.084
def banddb(x,a,b,bands):
    seg=x[int(a*SR):int(b*SR)]
    S=np.abs(librosa.stft(seg, n_fft=8192, hop_length=2048))**2
    f=librosa.fft_frequencies(sr=SR,n_fft=8192)
    return {n: 10*np.log10(np.sum(S[(f>=lo)&(f<hi)])+1e-12) for n,(lo,hi) in bands.items()}
B={'infra 5-20':(5,20),'sub 20-35':(20,35),'sub 35-50':(35,50),'low 50-80':(50,80),'bass 80-150':(80,150),'lowmid 150-300':(150,300)}
a=12; b=44
bs=banddb(src,a,b,B); bm=banddb(mix,a+OFF,b+OFF,B)
print("полоса            исход   ремикс    разница")
for k in B:
    print(f"  {k:14s} {bs[k]:7.1f} {bm[k]:8.1f}  {bm[k]-bs[k]:+7.2f} dB")
# выравнивание: широкополосная кросс-корреляция по среднему диапазону
import scipy.signal as ss
def band(x, lo, hi):
    sos=ss.butter(4,[lo/(SR/2),hi/(SR/2)],btype='band',output='sos'); return ss.sosfiltfilt(sos,x).astype(np.float32)
sm=band(src,400,4000); mm=band(mix,400,4000)
w0,w1=int(20*SR),int(28*SR)
seg_s=sm[w0:w1]; seg_m=mm[w0+int(OFF*SR)-4000:w1+int(OFF*SR)+4000]
c=ss.correlate(seg_m, seg_s, mode='valid')
lag=(np.argmax(c)-4000)/SR
print(f"\nкросс-корреляция (400-4000 Гц, 20-28 c): лаг {lag*1000:+.1f} мс -> смещение исходника в ремиксе {lag*1000:+.1f} мс")
# фаза киков ремикса mod 200 мс
S=np.abs(librosa.stft(band(mix,40,110), n_fft=1024, hop_length=128)); f=librosa.fft_frequencies(sr=SR,n_fft=1024)
k=S[(f>=40)&(f<110)].sum(0); k=np.diff(np.log1p(k), prepend=k[0]); k=np.maximum(k,0)
t=librosa.frames_to_time(np.arange(len(k)), sr=SR, hop_length=128)
on=librosa.onset.onset_detect(onset_envelope=k, sr=SR, hop_length=128, backtrack=False, pre_max=3, post_max=3, pre_avg=6, post_avg=6, delta=0.05, wait=4)
tt=t[on]; st=k[on]; tt=tt[st>np.percentile(st,50)]
ph=(tt/0.2)%1.0
h,_=np.histogram(ph, bins=50, weights=np.ones_like(tt))
print("кик-онсеты ремикса: пик фазы в пределах 200 мс =", round(float(np.argmax(h))/50*200,1), "мс (у исходника было 84 мс)")
print("LUFS исход:", round(dsp.measure_lufs(src,SR),2), "| ремикс:", round(dsp.measure_lufs(mix,SR),2))
