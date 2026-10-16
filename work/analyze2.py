import numpy as np, librosa
y, sr = librosa.load('/home/user/eblan/_handsgod.mp3', sr=22050, mono=False)
L,R = y; mid=(L+R)/2; side=(L-R)/2
def band_rms(x, sr, lo, hi, hop=512):
    S = np.abs(librosa.stft(x, n_fft=2048, hop_length=hop))
    f = librosa.fft_frequencies(sr=sr, n_fft=2048)
    m = (f>=lo)&(f<hi)
    return np.sqrt(np.mean(S[m]**2, axis=0))
# overlap / correlation between channels
print("corr L/R:", np.corrcoef(L,R)[0,1])
print("mid/side rms:", float(np.sqrt(np.mean(mid**2))), float(np.sqrt(np.mean(side**2))))
hop=512
voc = band_rms(mid, sr, 250, 3500, hop)
low = band_rms(mid, sr, 40, 160, hop)
hi  = band_rms(mid, sr, 5000, 11000, hop)
t = librosa.frames_to_time(np.arange(len(voc)), sr=sr, hop_length=hop)
# smoothed envelope
from scipy.ndimage import uniform_filter1d
vs = uniform_filter1d(voc, 9)
print("\n--- 2s blocks: vocal-band(mid), low, high ---")
for i in range(0, len(t), int(2*sr/hop)):
    j = min(i+int(2*sr/hop), len(t)-1)
    print(f"{t[i]:6.1f}s voc={np.mean(voc[i:j]):.4f} low={np.mean(low[i:j]):.4f} hi={np.mean(hi[i:j]):.4f}")
# novelty / structure
chroma = librosa.feature.chroma_cqt(y=mid, sr=sr)
nov = librosa.onset.onset_strength(S=librosa.power_to_db(chroma**2), aggregate=np.median)
bnd = librosa.segment.agglomerative(chroma, 14)
print("\nsegment boundaries (s):", np.round(librosa.frames_to_time(bnd, sr=sr),1).tolist())
# tempo of the low band (kick pattern)
oe_low = librosa.onset.onset_strength(S=librosa.amplitude_to_db(np.abs(librosa.stft(mid,n_fft=2048,hop_length=512)))[:80], sr=sr)
print("low-band tempo:", librosa.feature.tempo(onset_envelope=oe_low, sr=sr, max_tempo=200))
# vocal activity ratio: fraction of frames where vocal band is well above local floor
thr = np.median(voc)*1.6
print("vocal-band active fraction:", float(np.mean(voc>thr)))
np.save('work/mid.npy', mid); np.save('work/side.npy', side)
print("sr", sr)
