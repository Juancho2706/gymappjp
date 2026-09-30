# Temp score + SFX for the EVA 30s spot, synced to anim.js timings. 48k stereo.
import numpy as np, wave
SR = 48000; DUR = 30.0; N = int(SR * DUR)
rs = np.random.default_rng(3)
L = np.zeros(N); R = np.zeros(N)
T = lambda d: np.arange(int(d * SR)) / SR

def add(sig, t0, gain=1.0, pan=0.0):
    i = int(t0 * SR)
    if i >= N: return
    s = sig[: max(0, N - i)] * gain
    if i < 0: s = s[-i:]; i = 0
    L[i:i + len(s)] += s * np.sqrt(0.5 * (1 - pan)) * 1.414 * 0.707
    R[i:i + len(s)] += s * np.sqrt(0.5 * (1 + pan)) * 1.414 * 0.707

def fftfilt(x, lo=None, hi=None):
    X = np.fft.rfft(x); f = np.fft.rfftfreq(len(x), 1 / SR); m = np.ones_like(f)
    if lo: m *= 1 / (1 + (lo / np.maximum(f, 1)) ** 4)
    if hi: m *= 1 / (1 + (f / hi) ** 4)
    return np.fft.irfft(X * m, len(x))

def env(n, a, d, curve=6.0):
    t = np.arange(n) / SR
    e = np.minimum(1, t / max(a, 1e-4)) * np.exp(-np.maximum(0, t - a) * curve / max(d, 1e-4))
    return e

def reverb(x, secs=1.6, mix=0.25, lo=200, hi=7000):
    n = int(secs * SR); ir = rs.standard_normal(n) * np.exp(-np.arange(n) / SR * 6.9 / secs)
    ir = fftfilt(ir, lo, hi); ir /= np.sqrt((ir ** 2).sum())
    m = len(x) + n; y = np.fft.irfft(np.fft.rfft(x, m) * np.fft.rfft(ir, m), m)
    return x * (1 - mix) + y[: len(x)] * mix * 0.6, y

# ---------------- instruments
def kick(g=1.0):
    t = T(0.5); f = 45 + 110 * np.exp(-t * 30); ph = 2 * np.pi * np.cumsum(f) / SR
    s = np.sin(ph) * np.exp(-t * 7) + 0.4 * rs.standard_normal(len(t)) * np.exp(-t * 300)
    return np.tanh(s * 1.6) * g

def boom(g=1.0, secs=1.8):
    t = T(secs); f = 30 + 70 * np.exp(-t * 9); ph = 2 * np.pi * np.cumsum(f) / SR
    s = np.sin(ph) * np.exp(-t * 2.2)
    n = fftfilt(rs.standard_normal(len(t)), 40, 2500) * np.exp(-t * 7) * 0.5
    return np.tanh((s + n) * 1.8) * g

def hat(g=0.2, dec=40):
    t = T(0.12); return fftfilt(rs.standard_normal(len(t)), 7000, 16000) * np.exp(-t * dec) * g

def clap(g=0.4):
    t = T(0.35); n = fftfilt(rs.standard_normal(len(t)), 900, 5000)
    e = sum(np.exp(-np.maximum(0, t - d) * 90) * (t >= d) for d in (0, 0.011, 0.022)) + 0.6 * np.exp(-np.maximum(0, t - 0.03) * 16) * (t >= 0.03)
    return n * e * g

def pluck(freq, g=0.3, dec=5.0, secs=0.6, bright=3):
    t = T(secs); s = sum(np.sin(2 * np.pi * freq * k * t) / k ** 1.3 * np.exp(-t * dec * k * 0.6) for k in range(1, bright + 1))
    return s * np.minimum(1, t / 0.003) * g

def sub(freq, secs, g=0.35):
    t = T(secs); s = np.sin(2 * np.pi * freq * t) + 0.25 * np.tanh(3 * np.sin(2 * np.pi * freq * t))
    return s * np.minimum(1, t / 0.005) * np.exp(-t * 3.5) * g

def pad(freqs, secs, g=0.08, a=0.6, rel=1.0, hi=2600):
    t = T(secs); s = np.zeros(len(t))
    for f in freqs:
        for dt in (-0.12, 0, 0.13):
            ff = f * 2 ** (dt / 12); s += 2 * ((t * ff + rs.random()) % 1) - 1
    s = fftfilt(s, 80, hi); e = np.minimum(1, t / a) * np.minimum(1, np.maximum(0, secs - t) / rel)
    return s / len(freqs) * e * g

def whoosh(secs=0.5, g=0.35, lo=300, hi=5000, peak=0.55):
    t = T(secs); n = fftfilt(rs.standard_normal(len(t)), lo, hi)
    x = t / secs; e = np.where(x < peak, (x / peak) ** 2, np.exp(-(x - peak) / (1 - peak) * 4))
    return n * e * g

def riser(secs, g=0.3):
    t = T(secs); x = t / secs
    n = fftfilt(rs.standard_normal(len(t)), 1500, 12000) * x ** 3
    f = 180 * 2 ** (x * 3); tone = np.sin(2 * np.pi * np.cumsum(f) / SR) * x ** 2 * 0.35
    return (n + tone) * g

def click(g=0.35, f=2200):
    t = T(0.06); return (np.sin(2 * np.pi * f * t) * np.exp(-t * 90) + fftfilt(rs.standard_normal(len(t)), 2000, 9000) * np.exp(-t * 250) * 0.6) * g

def tick(g=0.12, f=4200):
    t = T(0.03); return fftfilt(rs.standard_normal(len(t)), f * 0.6, f * 1.6) * np.exp(-t * 300) * g

def chime(notes, g=0.25, gap=0.07):
    out = np.zeros(int(2.2 * SR))
    for i, f in enumerate(notes):
        t = T(2.2 - i * gap); s = (np.sin(2 * np.pi * f * t) + 0.3 * np.sin(2 * np.pi * f * 2.01 * t) + 0.12 * np.sin(2 * np.pi * f * 3 * t)) * np.exp(-t * 3.2) * np.minimum(1, t / 0.004)
        j = int(i * gap * SR); out[j:j + len(s)] += s
    return out * g

hz = lambda n: 440 * 2 ** ((n - 69) / 12)

# ---------------- MUSIC  (120 BPM, beat .5s, bar 2s) — key D minor
B = 0.5
# intro
add(riser(0.5, 0.25), 0.0)
add(boom(0.9), 0.5)
for i, tt in enumerate((1.12, 1.24, 1.36)): add(kick(0.55 + 0.1 * i), tt)
add(boom(1.0, 2.4), 1.46); add(clap(0.35), 1.46)
add(pad([hz(50), hz(57), hz(62), hz(65)], 3.0, 0.07, a=0.4, rel=0.8), 1.2)
add(riser(1.0, 0.3), 2.95)
add(whoosh(0.9, 0.55, 200, 7000, 0.5), 3.5)
# groove 4.0 → 27.5
prog = [(38, [50, 57, 62, 65]), (34, [46, 53, 58, 62]), (41, [53, 57, 60, 65]), (36, [48, 55, 60, 64])]  # Dm Bb F C
for bar in range(12):
    t0 = 4.0 + bar * 2.0
    if t0 >= 27.6: break
    root, ch = prog[(bar // 1) % 4]
    breakdown = 18.5 <= t0 < 19.0
    for b in range(4):
        tb = t0 + b * B
        if tb >= 27.6: break
        if not (18.5 <= tb < 19.0): add(kick(0.75), tb)
        add(hat(0.10), tb + B / 2); add(hat(0.05, 70), tb + B / 4); add(hat(0.05, 70), tb + 3 * B / 4)
        if b in (1, 3): add(clap(0.22), tb)
        add(sub(hz(root), 0.24, 0.30), tb + B / 2)
    # arp plucks (16ths) on chord tones
    for k in range(16):
        tk = t0 + k * B / 4
        if tk >= 27.6: break
        n = ch[[0, 2, 3, 1, 2, 3, 0, 2][k % 8]] + 12
        add(pluck(hz(n), 0.045, 9, 0.35), tk, pan=-0.35 if k % 2 else 0.35)
    add(pad([hz(n) for n in ch], 2.05, 0.05, a=0.25, rel=0.4), t0)
# transitions / fx
for tt in (8.2, 12.5, 18.55, 22.55, 24.65):
    add(whoosh(0.6, 0.30), tt - 0.05, pan=0.2)
add(riser(0.5, 0.22), 18.05); add(boom(0.5, 1.2), 18.55)
add(riser(0.9, 0.3), 26.8)
add(whoosh(0.9, 0.55, 200, 7000, 0.5), 27.15)
# outro
add(boom(1.0, 2.6), 27.7); add(clap(0.3), 27.7)
for i, tt in enumerate((27.95, 28.05, 28.15)): add(kick(0.5 + 0.1 * i), tt)
add(pad([hz(50), hz(57), hz(62), hz(65), hz(69)], 2.3, 0.09, a=0.3, rel=1.2), 27.7)
add(chime([hz(74), hz(81), hz(86)], 0.12, 0.09), 28.5)

# ---------------- UI SFX
for c in (6.05, 9.95, 10.3, 10.65, 15.57, 15.87, 16.17, 19.6, 21.1, 25.85): add(click(0.28), c, pan=0.3)
add(click(0.3, 1500), 14.3, pan=0.3)                          # grab
add(kick(0.35), 15.25); add(pluck(hz(74), 0.18, 6), 15.25)    # drop thud
# typing
for i in range(22): add(tick(0.10 + 0.04 * rs.random(), 3500 + 1500 * rs.random()), 4.85 + i / 24, pan=0.2)
for i in range(6): add(tick(0.10, 4000 + 900 * rs.random()), 13.05 + i / 14, pan=0.4)
for tt, n in ((19.85, 4), (20.1, 1), (20.3, 7), (20.6, 3)):
    for i in range(n): add(tick(0.09, 4200), tt + i / 20, pan=0.3)
for i in range(6): add(tick(0.07, 5200), 16.3 + i / 40, pan=0.4)  # backspace
# duration counter + pips
for i in range(8): add(pluck(hz(62 + [0, 2, 3, 5, 7, 9, 10, 12][i]), 0.09, 12, 0.25), 6.45 + i * 0.9 / 7, pan=0.25)
for i in range(4): add(pluck(hz(69 + [0, 3, 5, 7][i]), 0.08, 9, 0.3), 7.3 + i * 0.16)
for i in range(7): add(tick(0.06, 3000), 8.95 + i * 0.05)
# columns spawn + blocks landing
for i, tt in enumerate((9.98, 10.33, 10.68)): add(whoosh(0.3, 0.18, 800, 6000, 0.3), tt); add(pluck(hz(62 + 5 * i), 0.12, 7), tt + 0.1)
lands = [15.55 + i * 0.3 + 0.5 for i in range(3)] + [16.75 + i * 0.12 + 0.55 for i in range(8)]
flys = [15.55 + i * 0.3 for i in range(3)] + [16.75 + i * 0.12 for i in range(8)]
scale = [62, 65, 69, 72, 74, 77, 81, 84, 86, 89, 93]
for i, tt in enumerate(flys): add(whoosh(0.4, 0.10, 1200, 8000, 0.6), tt, pan=0.5 - i * 0.1)
for i, tt in enumerate(lands): add(pluck(hz(scale[i]), 0.10, 8, 0.4), tt, pan=-0.2)
# sheet fields glow ticks
for tt in (19.6, 19.85, 20.1, 20.3, 20.6): add(pluck(hz(86), 0.05, 14, 0.2), tt + 0.1)
# chart draw shimmer
add(riser(1.1, 0.10), 21.35); add(chime([hz(81), hz(88)], 0.12, 0.08), 22.2)
# balance bars
for i in range(3): add(pluck(hz(69 + 4 * i), 0.07, 8), 23.35 + i * 0.1)
# save success
add(chime([hz(74), hz(78), hz(81), hz(86)], 0.22, 0.06), 24.15); add(boom(0.35, 0.9), 24.15)
# assign checks + phone + notification
for i in range(3): add(click(0.16, 2600 + 300 * i), 25.3 + i * 0.12, pan=-0.2)
add(whoosh(0.8, 0.35, 150, 3000, 0.4), 25.8, pan=0.3)
add(chime([hz(88), hz(81)], 0.20, 0.12), 26.4, pan=0.35)

# ---------------- MASTER
mix = np.stack([L, R])
wet = np.stack([reverb(ch, 1.8, 0.18)[0] for ch in mix])
out = np.tanh(wet * 1.1)
out /= np.abs(out).max() / 0.89
fade = np.ones(N); fl = int(0.4 * SR); fade[-fl:] = np.linspace(1, 0, fl) ** 2
out *= fade
pcm = (out.T * 32767).astype(np.int16)
with wave.open('out/music_sfx.wav', 'wb') as w:
    w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR); w.writeframes(pcm.tobytes())
print('wrote out/music_sfx.wav')
