import numpy as np, librosa, json, os
os.makedirs('/home/user/eblan/work/fig', exist_ok=True)
y, sr = librosa.load('/home/user/eblan/_handsgod.mp3', sr=22050, mono=True)
print("dur", len(y)/sr, "sr", sr)
tempo, beats = librosa.beat.beat_track(y=y, sr=sr, trim=False)
print("tempo(raw):", np.atleast_1d(tempo))
# tempo candidates
onset_env = librosa.onset.onset_strength(y=y, sr=sr)
tg = librosa.feature.tempo(onset_envelope=onset_env, sr=sr, aggregate=None)
print("tempo agg none mean/median:", float(np.mean(tg)), float(np.median(tg)))
print("tempo candidates:", librosa.feature.tempo(onset_envelope=onset_env, sr=sr, max_tempo=200))
# tempogram peaks
tempogram = librosa.feature.tempogram(onset_envelope=onset_env, sr=sr)
freqs = librosa.tempo_frequencies(tempogram.shape[0], sr=sr)
prof = tempogram.mean(axis=1)
top = np.argsort(prof)[::-1][:12]
print("top tempo bins:", [(round(float(freqs[i]),1), round(float(prof[i]),3)) for i in top if freqs[i]>30 and freqs[i]<220])
# key
chroma = librosa.feature.chroma_cqt(y=y, sr=sr)
notes = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B']
prof2 = chroma.mean(axis=1)
print("chroma profile:", {notes[i]: round(float(prof2[i]),3) for i in range(12)})
# krumhansl
maj_prof = np.array([6.35,2.23,3.48,2.33,4.38,4.09,2.52,5.19,2.39,3.66,2.29,2.88])
min_prof = np.array([6.33,2.68,3.52,5.38,2.60,3.53,2.54,4.75,3.98,2.69,3.34,3.17])
def best(profile):
    p = profile - profile.mean()
    scores=[]
    for i in range(12):
        for name, pr in (("maj", maj_prof), ("min", min_prof)):
            q = np.roll(pr, i); q = q - q.mean()
            scores.append((float(np.dot(p,q)/(np.linalg.norm(p)*np.linalg.norm(q))), notes[i], name))
    return sorted(scores)[::-1][:3]
print("key guesses:", best(prof2))
# energy envelope for structure
hop=512
rms = librosa.feature.rms(y=y, hop_length=hop)[0]
t = librosa.frames_to_time(np.arange(len(rms)), sr=sr, hop_length=hop)
# segment into 4-second blocks
import math
print("\nblockwise RMS (4s):")
for i in range(0, len(y), sr*4):
    seg = y[i:i+sr*4]
    print(f"{i//sr:5.1f}-{i//sr+4:5.1f}s rms={float(np.sqrt(np.mean(seg**2))):.4f} peak={float(np.max(np.abs(seg))):.3f} centroid={float(np.mean(librosa.feature.spectral_centroid(y=seg, sr=sr))):.0f}")
np.save('/home/user/eblan/work/beats.npy', beats)
np.save('/home/user/eblan/work/times.npy', librosa.frames_to_time(beats, sr=22050))
print("\nfirst beats (s):", np.round(librosa.frames_to_time(beats[:20], sr=22050),3))
