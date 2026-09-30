# Final mix: ElevenLabs phonk (cut at 28.5s) + ElevenLabs VO split into 7 lines + sparse, quiet SFX.
# usage: python3 mix_final.py <music.wav> <vo.mp3>  -> out/final_mix.wav (then loudnorm in ffmpeg)
import sys, os, subprocess, wave, numpy as np
FF = os.environ.get('FFMPEG', 'ffmpeg')
SR = 48000; DUR = 30.0; N = int(SR * DUR)
music_path, vo_path = sys.argv[1], sys.argv[2]

def load(path, ch):
    raw = subprocess.run([FF, '-v', 'error', '-i', path, '-f', 's16le', '-ac', str(ch), '-ar', str(SR), '-'], capture_output=True, check=True).stdout
    return np.frombuffer(raw, np.int16).astype(np.float64).reshape(-1, ch) / 32768

# ---------- music: cut at 28.5 s with a 30 ms de-click fade
mus = load(music_path, 2)[: int(28.5 * SR)].copy()
f = int(0.03 * SR); mus[-f:] *= np.linspace(1, 0, f)[:, None]
music = np.zeros((N, 2)); music[: len(mus)] = mus

# ---------- VO: [source_start, source_end, target_start]
vo_src = load(vo_path, 1)[:, 0]
LINES = [(0.00, 3.44, 0.30), (3.70, 8.17, 4.10), (8.44, 11.55, 8.65), (11.80, 17.56, 12.55),
         (17.75, 22.50, 18.55), (22.74, 26.45, 23.35), (26.70, 29.15, 27.55)]
vo = np.zeros(N)
for a, b, t in LINES:
    seg = vo_src[int(a * SR): int(b * SR)].copy(); e = int(0.012 * SR)
    seg[:e] *= np.linspace(0, 1, e); seg[-e:] *= np.linspace(1, 0, e)
    i = int(t * SR); vo[i: i + len(seg)] += seg[: N - i]
vo = vo / (np.abs(vo).max() + 1e-9) * 0.9

# ---------- sidechain duck: music dips under the voice (hold 250 ms, 40 ms attack, 300 ms release)
blk = 480; nb = N // blk + 1
env = np.array([np.sqrt((vo[i*blk:(i+1)*blk] ** 2).mean()) if i*blk < N else 0 for i in range(nb)])
act = (env > 0.01).astype(float)
hold = 25; act = np.array([act[max(0, i - hold): i + 1].max() for i in range(nb)])
gb = np.zeros(nb); cur = 0.0
for i in range(nb):
    k = 0.35 if act[i] > cur else 0.03
    cur += (act[i] - cur) * k; gb[i] = cur
g = np.repeat(gb, blk)[:N]
def bandpass(x, lo, hi):
    X = np.fft.rfft(x); fr = np.fft.rfftfreq(len(x), 1 / SR)
    return np.fft.irfft(X / (1 + (lo / np.maximum(fr, 1)) ** 4) / (1 + (fr / hi) ** 4), len(x))
mid = np.stack([bandpass(music[:, c], 900, 4200) for c in range(2)], 1)
music = music - mid * (0.55 * g)[:, None]           # carve the voice band while she talks
music *= (0.62 * (1 - 0.72 * g))[:, None]

# ---------- sparse, quiet SFX
rs = np.random.default_rng(3); T = lambda d: np.arange(int(d * SR)) / SR
sfx = np.zeros((N, 2))
def add(sig, t0, gain, pan=0.0):
    i = int(t0 * SR); s = sig[: N - i] * gain
    sfx[i: i + len(s), 0] += s * (1 - max(0, pan)); sfx[i: i + len(s), 1] += s * (1 + min(0, pan))
def band(x, lo, hi):
    X = np.fft.rfft(x); fr = np.fft.rfftfreq(len(x), 1 / SR)
    return np.fft.irfft(X / (1 + (lo / np.maximum(fr, 1)) ** 4) / (1 + (fr / hi) ** 4), len(x))
def click(fq=2200):
    t = T(0.05); return np.sin(2 * np.pi * fq * t) * np.exp(-t * 110) + band(rs.standard_normal(len(t)), 2500, 9000) * np.exp(-t * 280) * 0.5
def whoosh(d=0.8):
    t = T(d); x = t / d; e = np.where(x < 0.5, (x / 0.5) ** 2, np.exp(-(x - 0.5) / 0.5 * 4))
    return band(rs.standard_normal(len(t)), 250, 6000) * e
def boom(d=1.6):
    t = T(d); ph = 2 * np.pi * np.cumsum(30 + 70 * np.exp(-t * 9)) / SR
    return np.tanh(np.sin(ph) * np.exp(-t * 2.4) * 1.6)
def chime(notes, gap=0.07, d=1.6):
    out = np.zeros(int((d + gap * len(notes)) * SR))
    for k, fq in enumerate(notes):
        t = T(d); s = (np.sin(2 * np.pi * fq * t) + 0.25 * np.sin(2 * np.pi * fq * 2.01 * t)) * np.exp(-t * 3.5) * np.minimum(1, t / 0.004)
        j = int(k * gap * SR); out[j: j + len(s)] += s
    return out
hz = lambda n: 440 * 2 ** ((n - 69) / 12)

add(boom(), 0.5, 0.35); add(boom(2.0), 1.46, 0.45)            # logo reveal (music intro is still quiet)
add(whoosh(0.9), 3.5, 0.14); add(whoosh(0.9), 27.15, 0.14)    # the two full-screen wipes
for c in (6.05, 9.95, 14.3, 19.6, 21.1, 25.85): add(click(), c, 0.07, 0.3)   # only the key clicks
add(chime([hz(74), hz(78), hz(81), hz(86)], 0.06), 24.15, 0.07)            # saved
add(chime([hz(88), hz(81)], 0.12), 26.4, 0.06, 0.3)                          # notification
add(boom(2.2), 27.7, 0.30)                                                   # outro impact

mix = music + sfx + vo[:, None] * 1.0
mix = np.tanh(mix * 1.05) / np.tanh(1.05)
mix /= np.abs(mix).max() / 0.95
fo = int(0.25 * SR); mix[-fo:] *= np.linspace(1, 0, fo)[:, None]
os.makedirs('out', exist_ok=True)
with wave.open('out/final_mix_pre.wav', 'wb') as w:
    w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR); w.writeframes((mix * 32767).astype(np.int16).tobytes())
subprocess.run([FF, '-y', '-v', 'error', '-i', 'out/final_mix_pre.wav', '-af', 'loudnorm=I=-14:TP=-1:LRA=9', '-ar', '48000', 'out/final_mix.wav'], check=True)
print('wrote out/final_mix.wav')
