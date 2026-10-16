import numpy as np, librosa, matplotlib; matplotlib.use('Agg'); import matplotlib.pyplot as plt
mid = np.load('work/mid.npy').astype(np.float32); sr=22050; hop=512
oe = librosa.onset.onset_strength(y=mid, sr=sr, hop_length=hop, n_fft=2048)
tempo, beats = librosa.beat.beat_track(onset_envelope=oe, sr=sr, hop_length=hop, trim=False, tightness=200)
print("beat_track tempo:", np.atleast_1d(tempo))
bt = librosa.frames_to_time(beats, sr=sr, hop_length=hop)
d = np.diff(bt)
print("median interval:", np.median(d), "-> BPM", 60/np.median(d), "n=", len(bt))
print("interval stats: min %.4f max %.4f std %.4f"%(d.min(), d.max(), d.std()))
tg = librosa.feature.tempogram(onset_envelope=oe, sr=sr, hop_length=hop, win_length=384)
tf = librosa.tempo_frequencies(tg.shape[0], sr=sr, hop_length=hop)
plp = librosa.beat.plp(onset_envelope=oe, sr=sr, hop_length=hop)
plpt = librosa.frames_to_time(np.arange(len(plp)), sr=sr, hop_length=hop)
plpbeats = librosa.util.peak_pick(plp, pre_max=3, post_max=3, pre_avg=8, post_avg=8, delta=0.05, wait=6)
print("PLP beats:", len(plpbeats), "first:", np.round(plpt[plpbeats[:15]],3))
pd = np.diff(plpt[plpbeats]); print("PLP median interval:", np.median(pd), "BPM", 60/np.median(pd))
# per-window autocorr tempo
print("\nper-20s autocorr tempo:")
for a in range(0, 173, 20):
    sl = oe[int(a*sr/hop):int((a+20)*sr/hop)]
    if len(sl) < 100: continue
    sl = sl - sl.mean()
    ac = np.correlate(sl, sl, 'full')[len(sl)-1:]
    lo, hi = int(60*sr/hop/180), int(60*sr/hop/120)
    k = np.argmax(ac[lo:hi])+lo
    print(f"  {a:3d}-{a+20:3d}s: {60*sr/hop/k:6.2f} BPM (val {ac[k]/ac[0]:.3f})")
fig, ax = plt.subplots(4,1, figsize=(22,13), sharex=True)
librosa.display.specshow(librosa.amplitude_to_db(tg, ref=np.max), sr=sr, hop_length=hop, y_axis='tempo', x_axis='time', ax=ax[0], cmap='magma')
ax[0].set_title('tempogram (30-250 bpm)')
ax[1].plot(librosa.frames_to_time(np.arange(len(oe)), sr=sr, hop_length=hop), oe); ax[1].set_title('onset strength')
ax[2].plot(plpt, plp); ax[2].vlines(plpt[plpbeats], 0, plp.max(), color='r', lw=0.5); ax[2].set_title('PLP + peaks')
ax[3].plot(plpt, plp); ax[3].vlines(bt, 0, plp.max(), color='g', lw=0.5); ax[3].set_title('PLP + beat_track beats')
ax[3].set_xlim(0, 60)
plt.tight_layout(); plt.savefig('work/fig/tempo.png', dpi=80); print('saved')
np.save('work/beattrack_times.npy', bt)
