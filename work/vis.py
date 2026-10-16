import numpy as np, librosa, librosa.display
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
y, sr = librosa.load('/home/user/eblan/_handsgod.mp3', sr=22050, mono=False)
ym = librosa.to_mono(y)
S = librosa.amplitude_to_db(np.abs(librosa.stft(ym, n_fft=2048, hop_length=512)), ref=np.max)
fig, axes = plt.subplots(4,1, figsize=(22,14), sharex=True)
librosa.display.specshow(S, sr=sr, hop_length=512, x_axis='time', y_axis='log', ax=axes[0], cmap='magma')
axes[0].set_title('log spectrogram')
tb = np.load('work/times.npy'); axes[0].plot(tb, np.full_like(tb, 11000), '|', color='cyan', ms=6)
rms = librosa.feature.rms(y=ym, hop_length=512)[0]
axes[1].plot(librosa.frames_to_time(np.arange(len(rms)), sr=sr, hop_length=512), rms); axes[1].set_title('rms')
C = librosa.feature.chroma_cqt(y=ym, sr=sr)
librosa.display.specshow(C, sr=sr, x_axis='time', y_axis='chroma', ax=axes[2])
axes[2].set_title('chroma')
if y.ndim>1:
    L,R = y
    mid, side = (L+R)/2, (L-R)/2
    sm = librosa.amplitude_to_db(np.abs(librosa.stft(mid, hop_length=512)), ref=np.max)
    ss = librosa.amplitude_to_db(np.abs(librosa.stft(side, hop_length=512)), ref=np.max)
    diff = np.clip(ss - sm, -12, 12)
    librosa.display.specshow(diff, sr=sr, hop_length=512, x_axis='time', y_axis='log', ax=axes[3], cmap='coolwarm')
    axes[3].set_title('SIDE minus MID (blue=center/mono, red=wide)')
plt.tight_layout(); plt.savefig('work/fig/overview.png', dpi=80)
print("saved")
