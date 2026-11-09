"""Procedural soundtrack for the Begin Map promo: music + sound design + VO mix.

Everything is synthesised here (no samples), synced to the same clock as the visuals:
  - music: 120 BPM, bars start at 0.5 s + 2k s; D minor at night -> F major after the reveal
  - sfx:   driven by build/cues_<lang>.json exported from the director
  - mix:   VO on top, music ducked under the voice, loudness -14 LUFS, true peak < -1 dBTP

Usage: python3 soundtrack.py <lang>   ->  build/audio/<lang>/{music,sfx,vo,mix}.wav
"""
import json
import sys
from functools import lru_cache
from pathlib import Path

import numpy as np
import pyloudnorm as pyln
import soundfile as sf
from scipy import signal

SR = 48000
ROOT = Path(__file__).resolve().parents[1]
LANG = sys.argv[1] if len(sys.argv) > 1 else "he"
EDIT = sys.argv[2] if len(sys.argv) > 2 else "full"
TAG = LANG if EDIT == "full" else f"{LANG}-{EDIT}"
CUES = json.loads((ROOT / "generated" / TAG / "cues.json").read_text())
TOTAL = float(CUES["total"])
N = int(TOTAL * SR)
OUT = ROOT / "build" / "audio" / TAG
OUT.mkdir(parents=True, exist_ok=True)
RNG = np.random.default_rng(7)

BPM = 120
BEAT = 60 / BPM
BAR0 = 0.5  # first downbeat


def bar(k):
    return BAR0 + 2 * k


def mtof(m):
    return 440.0 * 2 ** ((m - 69) / 12)


def tt(dur):
    return np.arange(int(dur * SR)) / SR


def stereo(x, pan=0.0):
    pan = np.clip(pan, -1, 1)
    l, r = np.cos((pan + 1) * np.pi / 4), np.sin((pan + 1) * np.pi / 4)
    return np.stack([x * l * 1.414, x * r * 1.414], axis=1)


def place(buf, sig, at, gain=1.0, pan=0.0):
    if sig.ndim == 1:
        sig = stereo(sig, pan)
    i = int(round(at * SR))
    if i < 0:
        sig = sig[-i:]
        i = 0
    j = min(len(buf), i + len(sig))
    if j > i:
        buf[i:j] += sig[: j - i] * gain


def sos(kind, f, order=2):
    nyq = SR / 2
    if kind == "bp":
        return signal.butter(order, [f[0] / nyq, f[1] / nyq], btype="band", output="sos")
    return signal.butter(order, f / nyq, btype=kind, output="sos")


def filt(x, kind, f, order=2):
    return signal.sosfilt(sos(kind, f, order), x, axis=0)


def env_ad(n, a, d, curve=6.0):
    t = np.arange(n) / SR
    e = np.where(t < a, t / max(a, 1e-6), np.exp(-(t - a) * curve / max(d, 1e-6)))
    return e


def env_adsr(n, a, d, s, r_start, r):
    t = np.arange(n) / SR
    e = np.ones(n) * s
    e = np.where(t < a, t / a, e)
    dd = (t >= a) & (t < a + d)
    e[dd] = 1 - (1 - s) * (t[dd] - a) / d
    rr = t >= r_start
    e[rr] = e[rr] * np.exp(-(t[rr] - r_start) * 5 / r)
    return e


def noise(n):
    return RNG.standard_normal(n)


# ---------------------------------------------------------------- oscillators
@lru_cache(maxsize=64)
def saw_table(nh):
    ph = np.arange(4096) / 4096
    k = np.arange(1, nh + 1)[:, None]
    return (np.sin(2 * np.pi * k * ph[None, :]) / k).sum(0) * (2 / np.pi)


def bl_saw(freq, dur, phase0=0.0):
    nh = max(1, min(60, int(16000 / max(freq, 1))))
    tab = saw_table(nh)
    ph = (phase0 + freq * np.arange(int(dur * SR)) / SR) % 1.0
    return tab[(ph * 4096).astype(int) % 4096]


def supersaw(freq, dur, voices=7, detune=0.18):
    out = np.zeros(int(dur * SR))
    for v in range(voices):
        cents = (v - (voices - 1) / 2) / ((voices - 1) / 2) * detune * 100
        out += bl_saw(freq * 2 ** (cents / 1200), dur, phase0=RNG.random())
    return out / voices


# ---------------------------------------------------------------- reverb
def make_ir(dur=2.4, decay=2.2, bright=0.6):
    n = int(dur * SR)
    t = np.arange(n) / SR
    irs = []
    for _ in range(2):
        x = noise(n) * np.exp(-t * 6.9 / decay)
        dark = filt(x, "low", 2500)
        mix = bright * x * np.exp(-t * 4) + (1 - bright) * dark
        mix[: int(0.012 * SR)] *= np.linspace(0, 1, int(0.012 * SR))
        irs.append(mix / np.sqrt((mix**2).sum()))
    return np.stack(irs, axis=1)


IR_HALL = make_ir(3.0, 2.6, 0.45)
IR_ROOM = make_ir(1.2, 0.9, 0.6)


def reverb(x, ir=IR_HALL):
    if x.ndim == 1:
        x = stereo(x)
    y = np.stack([signal.fftconvolve(x[:, c], ir[:, c])[: len(x)] for c in range(2)], axis=1)
    return y


# ---------------------------------------------------------------- drums
def kick(dur=0.5, punch=1.0):
    t = tt(dur)
    f = 44 + 110 * np.exp(-t * 30)
    ph = 2 * np.pi * np.cumsum(f) / SR
    body = np.sin(ph) * np.exp(-t * 7.0)
    click = filt(noise(len(t)), "high", 3000) * np.exp(-t * 400) * 0.35
    return np.tanh((body + click) * 1.6 * punch) * 0.9


def clap():
    n = int(0.35 * SR)
    t = np.arange(n) / SR
    e = np.zeros(n)
    for k, d in enumerate([0, 0.011, 0.023]):
        e += (t >= d) * np.exp(-(t - d).clip(0) * (420 if k < 2 else 26))
    x = filt(noise(n), "bp", (900, 4200)) * e
    return x * 0.7


def hat(open_=False):
    dur = 0.32 if open_ else 0.06
    t = tt(dur)
    x = filt(filt(noise(len(t)), "high", 6500, 4), "low", 11000, 2) * np.exp(-t * (14 if open_ else 90))
    return x * (0.35 if open_ else 0.3)


def snare():
    t = tt(0.3)
    body = np.sin(2 * np.pi * 190 * t) * np.exp(-t * 30) * 0.6
    sn = filt(noise(len(t)), "bp", (1200, 6500)) * np.exp(-t * 20)
    return (body + sn) * 0.6


def tick(f=1900):
    t = tt(0.06)
    return (np.sin(2 * np.pi * f * t) * np.exp(-t * 120) + filt(noise(len(t)), "high", 4000) * np.exp(-t * 600) * 0.3) * 0.5


# ---------------------------------------------------------------- tonal
def pad(notes, dur, cutoff=2400, attack=0.6, release=1.2, detune=0.16):
    x = np.zeros(int((dur + release) * SR))
    for m in notes:
        x += supersaw(mtof(m), dur + release, detune=detune)
    x /= max(1, len(notes)) ** 0.7
    x = filt(x, "low", cutoff, 2)
    e = env_adsr(len(x), attack, 0.5, 0.85, dur, release)
    return x * e


def pluck(m, dur=0.35, bright=4500):
    f = mtof(m)
    raw = bl_saw(f, dur) * 0.6 + np.sin(2 * np.pi * f * tt(dur)) * 0.4
    hi = filt(raw, "low", bright)
    lo = filt(raw, "low", 900)
    t = tt(dur)
    return hi * np.exp(-t * 18) + lo * np.exp(-t * 6) * 0.7


def sub(m, dur):
    f = mtof(m)
    t = tt(dur)
    x = np.sin(2 * np.pi * f * t) + 0.25 * np.sin(4 * np.pi * f * t)
    e = np.minimum(1, t / 0.006) * np.exp(-t * 2.0)
    e[-int(0.01 * SR):] *= np.linspace(1, 0, int(0.01 * SR))
    return np.tanh(x * 1.3) * e


def fm_bell(m, dur=1.6, ratio=3.5, index=3.0):
    f = mtof(m)
    t = tt(dur)
    mod = np.sin(2 * np.pi * f * ratio * t) * index * np.exp(-t * 3)
    return np.sin(2 * np.pi * f * t + mod) * np.exp(-t * 3.2)


# ---------------------------------------------------------------- sfx
def school_bell(dur=1.15):
    t = tt(dur)
    f0 = 1180
    partials = [(1, 1.0, 2.0), (2.01, 0.5, 3.5), (2.76, 0.6, 3.0), (5.4, 0.25, 6), (8.93, 0.12, 8)]
    tone = sum(a * np.sin(2 * np.pi * f0 * r * t + RNG.random() * 6) * np.exp(-t * d * 0.3) for r, a, d in partials)
    strike = 0.55 + 0.45 * np.abs(np.sin(np.pi * 19 * t)) ** 0.5
    e = np.minimum(1, t / 0.01) * np.where(t < dur - 0.25, 1, np.exp(-(t - (dur - 0.25)) * 14))
    x = tone * strike * e
    return filt(x, "bp", (500, 7000)) * 0.35


def sweep_noise(dur, f0, f1, q=1.2, curve="exp"):
    n = int(dur * SR)
    x = noise(n)
    out = np.zeros(n)
    blk = 480
    zi = None
    for i in range(0, n, blk):
        k = i / n
        fc = f0 * (f1 / f0) ** k if curve == "exp" else f0 + (f1 - f0) * k
        lo, hi = max(30, fc / (1 + q)), min(SR / 2 - 100, fc * (1 + q))
        s = sos("bp", (lo, hi))
        if zi is None:
            zi = signal.sosfilt_zi(s) * 0
        y, zi = signal.sosfilt(s, x[i:i + blk], zi=zi)
        out[i:i + blk] = y
    return out


def whoosh(dur=0.7, f0=300, f1=3000, peak=0.6):
    n = int(dur * SR)
    t = np.arange(n) / SR
    x = sweep_noise(dur, f0, f1)
    e = np.exp(-((t / dur - peak) ** 2) / 0.05)
    return x * e * 1.2


def riser(dur=1.5):
    t = tt(dur)
    k = t / dur
    nz = sweep_noise(dur, 300, 9000) * (k ** 2) * 1.2
    f = 180 * (6 ** k)
    tone = np.sin(2 * np.pi * np.cumsum(f) / SR) * (k ** 2.5) * 0.25
    return nz + tone


def impact(big=1.0):
    t = tt(2.8)
    f = 34 + 40 * np.exp(-t * 6)
    boom = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 1.6) * 1.1
    crack = filt(noise(len(t)), "low", 1800) * np.exp(-t * 14) * 0.7
    crash = filt(noise(len(t)), "high", 3500) * np.exp(-t * 1.8) * 0.18
    return np.tanh((boom + crack + crash) * 1.2) * big


def tap_click():
    t = tt(0.07)
    return (np.sin(2 * np.pi * 1550 * t) * np.exp(-t * 90) * 0.6 + filt(noise(len(t)), "high", 2500) * np.exp(-t * 500) * 0.4)


def pop(f0=900, f1=420):
    t = tt(0.12)
    f = f1 + (f0 - f1) * np.exp(-t * 45)
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 30)


def key_click():
    t = tt(0.05)
    return filt(noise(len(t)), "bp", (1800, 6000)) * np.exp(-t * 160) * 0.6 + np.sin(2 * np.pi * 170 * t) * np.exp(-t * 90) * 0.3


def error_blip():
    a = np.sign(np.sin(2 * np.pi * mtof(69) * tt(0.07))) * 0.25
    b = np.sign(np.sin(2 * np.pi * mtof(65) * tt(0.11))) * 0.25
    x = np.concatenate([a * env_ad(len(a), 0.003, 0.07), b * env_ad(len(b), 0.003, 0.11)])
    return filt(x, "low", 3000)


def sparkle(dur=1.0, n=26):
    out = np.zeros(int(dur * SR))
    for i in range(n):
        f = 3800 + RNG.random() * 5200
        d = 0.18
        s = np.sin(2 * np.pi * f * tt(d)) * np.exp(-tt(d) * 26) * (0.5 + RNG.random() * 0.5)
        place_mono(out, s, (i / n) ** 1.3 * dur * 0.85)
    return out * 0.35


def place_mono(buf, sig, at):
    i = int(at * SR)
    j = min(len(buf), i + len(sig))
    buf[i:j] += sig[: j - i]


def rumble(dur=1.6):
    t = tt(dur)
    x = filt(noise(len(t)), "low", 140, 3) * np.sin(np.pi * np.clip(t / dur, 0, 1)) ** 1.5
    return x * 2.2


# ================================================================ MUSIC
def build_music():
    drums = np.zeros((N, 2))
    bass = np.zeros((N, 2))
    pads = np.zeros((N, 2))
    arps = np.zeros((N, 2))
    fx = np.zeros((N, 2))
    kicks = []

    # chord table (bass midi, upper voicing)
    C = {
        "Dm": (38, [57, 62, 64, 65, 69]),
        "Bb": (46, [58, 62, 65, 70, 72]),
        "F": (41, [57, 60, 65, 67, 69]),
        "C": (48, [55, 60, 64, 67, 74]),
        "Gm": (43, [55, 58, 62, 67, 69]),
        "A": (45, [57, 61, 64, 69, 71]),
        "Asus": (45, [57, 62, 64, 69, 71]),
    }

    # --- intro (night) --------------------------------------------------------
    drone = pad([38, 45, 53, 64], 14.3, cutoff=900, attack=2.2, release=0.4, detune=0.1)
    place(pads, drone, 0.0, 0.55)
    # ticking clock from the headline slam
    k = 0
    tt0 = CUES["hookSlam"]
    while tt0 + k * BEAT < 13.9:
        place(drums, tick(1900 if k % 2 == 0 else 1500), tt0 + k * BEAT, 0.35 + 0.25 * (k / 18), pan=0.25 if k % 2 else -0.25)
        k += 1
    # maze: pulsing bass + minor arp + chords
    maze = [(8.5, "Dm"), (10.5, "Bb"), (12.5, "Gm"), (13.5, "Asus")]
    for i, (at, ch) in enumerate(maze):
        dur = (maze[i + 1][0] if i + 1 < len(maze) else 14.4) - at
        b, up = C[ch]
        place(pads, pad(up[:4], dur, cutoff=1400, attack=0.4, release=0.3), at, 0.32)
        for s in range(int(dur / (BEAT / 2))):
            place(bass, sub(b, BEAT / 2 * 0.9), at + s * BEAT / 2, 0.45)
        for s in range(int(dur / (BEAT / 4))):
            m = up[[0, 2, 1, 3][s % 4]] + 12
            place(arps, filt(pluck(m, 0.25, 2600), "high", 300), at + s * BEAT / 4, 0.12 * (0.6 + 0.4 * (s % 4 == 0)), pan=np.sin(s) * 0.4)
    # build-up to the drop
    place(fx, riser(1.45), 13.0, 0.5)
    for s in range(16):
        at = 13.5 + s * (0.9 / 16)
        place(drums, snare(), at, 0.15 + 0.4 * s / 16)

    # --- main progression ------------------------------------------------------
    prog = []
    seq = ["Bb", "F", "C", "Dm"]
    for i in range(17):  # 14.5 .. 48.5
        prog.append((bar(7 + i), seq[i % 4], "full"))
    for i, ch in enumerate(["Dm", "Bb", "F", "C"]):  # 48.5 .. 56.5 breakdown (kick back at 52.5)
        prog.append((bar(24 + i), ch, "break" if i < 2 else "full"))
    prog.append((bar(28), "Gm", "build"))
    prog.append((bar(29), "C", "build"))
    prog.append((bar(30), "F", "half"))  # 60.5 finale
    prog.append((bar(31), "Bb", "half"))
    prog.append((bar(32), "Dm", "full"))  # 64.5
    prog.append((bar(33), "C", "full"))
    prog.append((bar(34), "Bb", "full"))  # until the end hit at 70.0

    for i, (at, ch, mode) in enumerate(prog):
        end = prog[i + 1][0] if i + 1 < len(prog) else CUES["end"]
        dur = end - at
        b, up = C[ch]
        bright = 2500 if mode in ("full", "half") else 1800
        place(pads, pad(up, dur, cutoff=bright, attack=0.25 if mode != "break" else 0.6, release=0.5), at, 0.34 if mode != "break" else 0.4)
        # bass: offbeat-pumping eighths
        if mode != "break":
            for s in range(int(round(dur / (BEAT / 2)))):
                place(bass, sub(b if s % 8 != 7 else b + 7, BEAT / 2 * 0.92), at + s * BEAT / 2, 0.5)
        # arp
        pattern = [0, 2, 4, 2, 1, 3, 4, 3]
        for s in range(int(round(dur / (BEAT / 4)))):
            m = up[pattern[s % 8]] + 12
            g = 0.1 if mode == "full" else 0.14 if mode == "break" else 0.08
            place(arps, pluck(m, 0.3, 3600 if mode == "full" else 2800), at + s * BEAT / 4, g * (1.2 if s % 4 == 0 else 0.8), pan=np.sin(s * 0.7) * 0.5)
        # drums
        nb = int(round(dur / BEAT))
        for bt in range(nb):
            tb = at + bt * BEAT
            if mode == "full" or (mode == "build"):
                place(drums, kick(), tb, 0.7)
                kicks.append(tb)
            elif mode == "half" and bt % 4 in (0, 2) and not (bt % 4 == 2):
                place(drums, kick(0.6, 1.1), tb, 0.95)
                kicks.append(tb)
            if mode in ("full",) and bt % 2 == 1:
                place(drums, clap(), tb, 0.5)
            if mode == "half" and bt % 4 == 2:
                place(drums, clap(), tb, 0.55)
            if mode in ("full", "break", "build"):
                place(drums, hat(), tb + BEAT / 2, 0.2, pan=0.3)
                if mode == "full":
                    place(drums, hat(), tb + BEAT / 4, 0.06, pan=-0.3)
                    place(drums, hat(), tb + 3 * BEAT / 4, 0.06, pan=-0.3)
            if mode == "full" and bt % 4 == 3:
                place(drums, hat(True), tb + BEAT / 2, 0.1, pan=0.2)
        if mode == "build":
            pass

    # fills / transitions
    for s in range(12):
        place(drums, snare(), 25.1 + s * 0.075, 0.12 + 0.3 * s / 12)
    place(fx, riser(0.95), 25.05, 0.45)
    for s in range(24):
        place(drums, snare(), 58.6 + s * (1.6 / 24) * (1 - 0.3 * s / 24), 0.12 + 0.45 * s / 24)
    place(fx, riser(1.8), 58.5, 0.55)

    # final chord + ring out
    place(pads, pad([41, 53, 57, 60, 65, 69, 72], 3.4, cutoff=3000, attack=0.02, release=1.6), CUES["end"], 0.55)
    for i, m in enumerate([65, 69, 72, 77]):
        place(arps, fm_bell(m, 2.5), CUES["end"] + i * 0.09, 0.2, pan=(i - 1.5) * 0.3)
    place(bass, sub(29, 2.5), CUES["end"], 0.7)

    # sidechain pump on pads/bass/arps from kicks
    pump = np.ones(N)
    for kt in kicks:
        i = int(kt * SR)
        L = int(0.32 * SR)
        j = min(N, i + L)
        curve = 1 - 0.55 * np.exp(-np.arange(j - i) / SR * 9)
        pump[i:j] = np.minimum(pump[i:j], curve)
    for bus in (bass, pads, arps):
        bus *= pump[:, None]

    drums = drums * 0.75
    music = drums + bass * 0.3 + pads * 0.85 + arps * 0.75 + fx * 0.6
    music += reverb(pads * 0.35 + arps * 0.5 + drums * 0.08, IR_HALL) * 0.5
    # master tone: tame the extreme lows and highs
    lows = filt(music, "low", 90)
    highs = filt(music, "high", 9000)
    music = music - 0.45 * lows - 0.5 * highs
    # global intro fade and end fade
    t = np.arange(N) / SR
    music *= np.minimum(1, t / 0.4)[:, None]
    music *= np.clip((TOTAL - t) / 1.2, 0, 1)[:, None] ** 1.5
    return music


# ================================================================ SFX
def build_sfx():
    fx = np.zeros((N, 2))
    c = CUES
    # opening dive
    place(fx, whoosh(2.4, 2500, 250, 0.35), 0.05, 0.55)
    if c.get("bell") is not None:
        place(fx, reverb(school_bell(), IR_HALL) * 0.6 + stereo(school_bell()) * 0.5, c["bell"] - 0.35, 0.55)
    place(fx, impact(0.7), c["hookSlam"], 0.6)
    place(fx, whoosh(0.5, 500, 5000, 0.7), c["whip1"] - 0.2, 0.6, pan=0.3)
    for i, at in enumerate(c["mazeStarts"]):
        place(fx, filt(pop(1400, 700), "high", 300), at, 0.12, pan=np.sin(i * 1.7) * 0.6)
    for i, at in enumerate(c["mazeX"]):
        place(fx, error_blip(), at, 0.22, pan=np.sin(i * 2.3) * 0.6)
    # pin fall + impact
    t = tt(0.5)
    fall = np.sin(2 * np.pi * np.cumsum(2400 * np.exp(-t * 2.5)) / SR) * (t / 0.5) ** 2 * 0.25
    place(fx, fall + whoosh(0.5, 600, 4000, 0.9) * 0.6, c["pinFall"], 0.7)
    place(fx, impact(1.2), c["impact"], 1.0)
    place(fx, reverb(impact(0.6), IR_HALL), c["impact"], 0.35)
    place(fx, sparkle(1.0), c["logoIn"], 0.7)
    place(fx, whoosh(0.6, 400, 3500, 0.55), c["revealSub"] - 0.2, 0.25)
    # phone + UI
    place(fx, whoosh(0.8, 200, 2500, 0.65), c["phoneIn"] - 0.35, 0.55)
    place(fx, tap_click(), c["tapSearch"], 0.5)
    for at in c["typing"]:
        place(fx, key_click(), at, 0.35, pan=RNG.uniform(-0.2, 0.2))
    place(fx, tap_click(), c["pick"], 0.5)
    place(fx, whoosh(0.4, 800, 5000, 0.5), c["pick"] + 0.15, 0.25)
    place(fx, whoosh(0.7, 300, 6000, 0.85), c["dive"], 0.6)
    place(fx, impact(0.5), c["flash"], 0.45)
    place(fx, rumble(1.8), c["rise"], 0.5)
    for i in range(14):
        place(fx, pop(300 + RNG.random() * 200, 120), c["rise"] + 0.15 + i * 0.09 + RNG.random() * 0.04, 0.12, pan=RNG.uniform(-0.6, 0.6))
    # route drawing shimmer
    a, b = c["routeDraw"]
    rd = sweep_noise(b - a, 1500, 6000) * np.sin(np.pi * tt(b - a) / (b - a)) * 0.25
    place(fx, rd, a, 0.35)
    place(fx, whoosh(0.4, 3000, 400, 0.3), c["pinArrive"] - 0.4, 0.4)
    place(fx, pop(500, 160) * 1.2, c["pinArrive"], 0.5)
    for i, m in enumerate([77, 81, 84]):
        place(fx, fm_bell(m, 1.4, 3.0, 2.0), c["pinArrive"] + 0.05 + i * 0.08, 0.16, pan=(i - 1) * 0.35)
    # start: tap on the map
    if c.get("startTap") is not None:
        place(fx, tap_click(), c["startTap"], 0.55)
        place(fx, pop(700, 300), c["startTap"] + 0.05, 0.35)
        rd = sweep_noise(1.9, 1500, 6000) * np.sin(np.pi * tt(1.9) / 1.9) * 0.25
        place(fx, rd, c["startRoute"], 0.3)
    # chips
    for k, at in enumerate(c["chips"]):
        for i in range(5):
            place(fx, pop(700 + k * 180 + i * 40, 380 + k * 90), at + i * 0.05, 0.22, pan=RNG.uniform(-0.6, 0.6))
    place(fx, tap_click(), c["chipPress"], 0.6)
    rd = sweep_noise(1.25, 2000, 7000) * np.sin(np.pi * tt(1.25) / 1.25) * 0.25
    place(fx, rd, c["toiletRoute"], 0.3)
    # 3D + photos
    place(fx, whoosh(0.8, 250, 3000, 0.6), c["v3dIn"] - 0.3, 0.5, pan=0.4)
    place(fx, tap_click(), c["v3dTap"], 0.55)
    place(fx, whoosh(0.5, 600, 4000, 0.5), c["v3dTap"] + 0.15, 0.3)
    for i, at in enumerate(c["cards"]):
        place(fx, whoosh(0.45, 700 + i * 120, 4500, 0.4), at - 0.1, 0.22, pan=np.sin(i * 1.3) * 0.7)
    # languages
    for i, at in enumerate(c["langs"]):
        place(fx, whoosh(0.5, 300, 2500, 0.6), at - 0.25, 0.3, pan=[-0.5, 0, 0.5][i])
        place(fx, fm_bell([72, 76, 79][i], 1.0, 2.0, 1.5), at + 0.1, 0.13)
    # finale + CTA
    place(fx, impact(0.6), c["tagline"] + {"30": 1.0, "silk": 1.5}.get(EDIT, 0.5), 0.45)
    if c["cta"] < c["end"]:
        place(fx, whoosh(0.8, 250, 2500, 0.6), c["cta"] - 0.2, 0.45)
    place(fx, impact(1.1), c["end"], 0.75)
    place(fx, sparkle(1.2), c["end"] + 0.2, 0.5)
    fx = filt(fx, "low", 10000)
    return fx


# ================================================================ VO + MIX
def load_vo():
    vo = np.zeros(N)
    VTAG = LANG if EDIT in ("full", "silk", "story") else TAG
    meta = json.loads((ROOT / "build" / "vo" / VTAG / "vo.json").read_text())
    for k, at in c_vo_at().items():
        if k not in meta["lines"]:
            continue
        x, sr = sf.read(ROOT / "build" / "vo" / VTAG / f"{k}.wav")
        assert sr == SR
        i = int(at * SR)
        j = min(N, i + len(x))
        vo[i:j] += x[: j - i]
    # VO polish: high-pass, gentle presence lift, light compression
    vo = filt(vo, "high", 85)
    # zero-phase EQ: de-ess the bright TTS top end, lift the 1-2.5 kHz clarity band
    vo = vo - 0.6 * signal.sosfiltfilt(sos("high", 6200, 4), vo)
    vo = vo + 0.35 * signal.sosfiltfilt(sos("bp", (1000, 2600), 2), vo)
    env = np.sqrt(signal.lfilter([1 - 0.999], [1, -0.999], vo**2) + 1e-9)
    gain = np.minimum(1.0, (0.12 / (env + 1e-6)) ** 0.35)
    vo = vo * gain
    return vo, meta


def c_vo_at():
    return CUES["voAt"]


def duck_curve(vo):
    env = np.abs(vo)
    env = signal.lfilter([1 - 0.9995], [1, -0.9995], env)
    active = env > 0.004
    # smooth on/off with attack 80 ms, release 350 ms
    g = np.ones(N)
    cur = 1.0
    target_dn = 10 ** (-9 / 20)
    a_dn = np.exp(-1 / (0.08 * SR))
    a_up = np.exp(-1 / (0.35 * SR))
    for i in range(0, N, 64):
        tgt = target_dn if active[i] else 1.0
        coef = a_dn if tgt < cur else a_up
        cur = tgt + (cur - tgt) * coef**64
        g[i:i + 64] = cur
    return g


def limiter(x, ceiling=0.89, look=0.004):
    peak = np.abs(x).max(axis=1)
    L = int(look * SR)
    # running max over lookahead window
    from scipy.ndimage import maximum_filter1d
    pk = maximum_filter1d(peak, size=2 * L + 1)
    g = np.minimum(1.0, ceiling / (pk + 1e-9))
    g = signal.lfilter([1 - 0.995], [1, -0.995], g)
    g = np.minimum(g, ceiling / (pk + 1e-9))
    return x * g[:, None]


def build_music30():
    """30-second cut: short night intro, drop at 4.5 s, groove, finale, end chord at 27 s."""
    drums = np.zeros((N, 2)); bass = np.zeros((N, 2)); pads = np.zeros((N, 2)); arps = np.zeros((N, 2)); fx = np.zeros((N, 2))
    kicks = []
    C = {
        "Dm": (38, [57, 62, 64, 65, 69]), "Bb": (46, [58, 62, 65, 70, 72]), "F": (41, [57, 60, 65, 67, 69]),
        "C": (48, [55, 60, 64, 67, 74]), "Gm": (43, [55, 58, 62, 67, 69]),
    }
    place(pads, pad([38, 45, 53, 64], 4.4, cutoff=900, attack=1.2, release=0.3, detune=0.1), 0.0, 0.55)
    k = 0
    while CUES["hookSlam"] + k * BEAT < 4.3:
        place(drums, tick(1900 if k % 2 == 0 else 1500), CUES["hookSlam"] + k * BEAT, 0.4)
        k += 1
    place(fx, riser(1.25), 3.2, 0.5)
    for i in range(14):
        place(drums, snare(), 3.62 + i * (0.8 / 14), 0.15 + 0.4 * i / 14)
    end = CUES["end"]
    seq = ["Bb", "F", "C", "Dm"]
    prog = [(bar(2 + i), seq[i % 4], "full") for i in range(9)]  # 4.5 .. 22.5
    prog += [(bar(11), "C", "build"), (bar(12), "F", "half"), (bar(13), "Bb", "half")]
    for i, (at, ch, mode) in enumerate(prog):
        nxt = prog[i + 1][0] if i + 1 < len(prog) else end
        dur = nxt - at
        b, up = C[ch]
        place(pads, pad(up, dur, cutoff=2500 if mode != "build" else 1800, attack=0.25, release=0.5), at, 0.34)
        for st in range(int(round(dur / (BEAT / 2)))):
            place(bass, sub(b if st % 8 != 7 else b + 7, BEAT / 2 * 0.92), at + st * BEAT / 2, 0.5)
        pattern = [0, 2, 4, 2, 1, 3, 4, 3]
        for st in range(int(round(dur / (BEAT / 4)))):
            place(arps, pluck(up[pattern[st % 8]] + 12, 0.3, 3600), at + st * BEAT / 4, 0.1 * (1.2 if st % 4 == 0 else 0.8), pan=np.sin(st * 0.7) * 0.5)
        for bt in range(int(round(dur / BEAT))):
            tb = at + bt * BEAT
            if mode in ("full", "build") or (mode == "half" and bt % 4 == 0):
                place(drums, kick(), tb, 0.7); kicks.append(tb)
            if mode == "full" and bt % 2 == 1:
                place(drums, clap(), tb, 0.5)
            if mode == "half" and bt % 4 == 2:
                place(drums, clap(), tb, 0.55)
            if mode in ("full", "build"):
                place(drums, hat(), tb + BEAT / 2, 0.2, pan=0.3)
    for i in range(14):
        place(drums, snare(), 23.6 + i * (0.8 / 14), 0.12 + 0.4 * i / 14)
    place(fx, riser(1.0), 23.45, 0.4)
    place(pads, pad([41, 53, 57, 60, 65, 69, 72], 2.4, cutoff=3000, attack=0.02, release=1.4), end, 0.55)
    for i, m in enumerate([65, 69, 72, 77]):
        place(arps, fm_bell(m, 2.5), end + i * 0.09, 0.2, pan=(i - 1.5) * 0.3)
    place(bass, sub(29, 2.5), end, 0.7)
    pump = np.ones(N)
    for kt in kicks:
        i = int(kt * SR); j = min(N, i + int(0.32 * SR))
        pump[i:j] = np.minimum(pump[i:j], 1 - 0.55 * np.exp(-np.arange(j - i) / SR * 9))
    for bus in (bass, pads, arps):
        bus *= pump[:, None]
    drums = drums * 0.75
    music = drums + bass * 0.3 + pads * 0.85 + arps * 0.75 + fx * 0.6
    music += reverb(pads * 0.35 + arps * 0.5 + drums * 0.08, IR_HALL) * 0.5
    lows = filt(music, "low", 90); highs = filt(music, "high", 9000)
    music = music - 0.45 * lows - 0.5 * highs
    t = np.arange(N) / SR
    music *= np.minimum(1, t / 0.3)[:, None]
    music *= np.clip((TOTAL - t) / 1.0, 0, 1)[:, None] ** 1.5
    return music


def build_music_silk():
    """Liquid-light cut: dark ambient intro, drop on the pin impact (12.5 s), groove, breakdown,
    big half-time chords under the tagline (52.5 s), final chord on the end card."""
    drums = np.zeros((N, 2)); bass = np.zeros((N, 2)); pads = np.zeros((N, 2)); arps = np.zeros((N, 2)); fx = np.zeros((N, 2))
    kicks = []
    C = {
        "Dm": (38, [57, 62, 64, 65, 69]), "Bb": (46, [58, 62, 65, 70, 72]), "F": (41, [57, 60, 65, 67, 69]),
        "C": (48, [55, 60, 64, 67, 74]), "Gm": (43, [55, 58, 62, 67, 69]), "Asus": (45, [57, 62, 64, 69, 71]),
    }
    place(pads, pad([38, 45, 53, 64, 69], 12.4, cutoff=1100, attack=2.5, release=0.3, detune=0.12), 0.0, 0.5)
    # airy shimmer on top
    for i in range(10):
        place(arps, fm_bell([81, 84, 88, 86][i % 4], 2.5, 2.0, 1.2), 0.8 + i * 1.1, 0.05, pan=np.sin(i) * 0.6)
    k = 0
    while CUES["hookSlam"] + k * BEAT < 6.0:
        place(drums, tick(1900 if k % 2 == 0 else 1500), CUES["hookSlam"] + k * BEAT, 0.3)
        k += 1
    maze = [(6.5, "Dm"), (8.5, "Bb"), (10.5, "Gm"), (11.5, "Asus")]
    for i, (at, ch) in enumerate(maze):
        dur = (maze[i + 1][0] if i + 1 < len(maze) else 12.4) - at
        b, up = C[ch]
        place(pads, pad(up[:4], dur, cutoff=1400, attack=0.4, release=0.3), at, 0.3)
        for st in range(int(dur / (BEAT / 2))):
            place(bass, sub(b, BEAT / 2 * 0.9), at + st * BEAT / 2, 0.45)
        for st in range(int(dur / (BEAT / 4))):
            place(arps, filt(pluck(up[[0, 2, 1, 3][st % 4]] + 12, 0.25, 2600), "high", 300), at + st * BEAT / 4, 0.11)
    place(fx, riser(1.5), 11.0, 0.55)
    for i in range(16):
        place(drums, snare(), 11.55 + i * (0.85 / 16), 0.15 + 0.4 * i / 16)
    seq = ["Bb", "F", "C", "Dm"]
    prog = [(bar(6 + i), seq[i % 4], "full") for i in range(18)]  # 12.5 .. 48.5
    prog += [(bar(24), "Dm", "break"), (bar(25), "C", "build")]  # 48.5 .. 52.5
    prog += [(bar(26), "F", "half"), (bar(27), "Bb", "half"), (bar(28), "Dm", "full"), (bar(29), "C", "full")]
    end = CUES["end"]
    for i, (at, ch, mode) in enumerate(prog):
        nxt = prog[i + 1][0] if i + 1 < len(prog) else end
        dur = nxt - at
        if dur <= 0:
            continue
        b, up = C[ch]
        place(pads, pad(up, dur, cutoff=2500 if mode != "break" else 1600, attack=0.25 if mode != "break" else 0.7, release=0.5), at, 0.36)
        if mode != "break":
            for st in range(int(round(dur / (BEAT / 2)))):
                place(bass, sub(b if st % 8 != 7 else b + 7, BEAT / 2 * 0.92), at + st * BEAT / 2, 0.5)
        pattern = [0, 2, 4, 2, 1, 3, 4, 3]
        for st in range(int(round(dur / (BEAT / 4)))):
            place(arps, pluck(up[pattern[st % 8]] + 12, 0.3, 3600 if mode == "full" else 2800), at + st * BEAT / 4, (0.1 if mode == "full" else 0.13) * (1.2 if st % 4 == 0 else 0.8), pan=np.sin(st * 0.7) * 0.5)
        for bt in range(int(round(dur / BEAT))):
            tb = at + bt * BEAT
            if mode in ("full", "build") or (mode == "half" and bt % 4 == 0):
                place(drums, kick(), tb, 0.7); kicks.append(tb)
            if mode == "full" and bt % 2 == 1:
                place(drums, clap(), tb, 0.5)
            if mode == "half" and bt % 4 == 2:
                place(drums, clap(), tb, 0.55)
            if mode in ("full", "build", "break"):
                place(drums, hat(), tb + BEAT / 2, 0.2, pan=0.3)
    for i in range(20):
        place(drums, snare(), 51.1 + i * (1.3 / 20), 0.12 + 0.45 * i / 20)
    place(fx, riser(1.6), 50.85, 0.5)
    place(pads, pad([41, 53, 57, 60, 65, 69, 72], 3.0, cutoff=3000, attack=0.02, release=1.6), end, 0.55)
    for i, m in enumerate([65, 69, 72, 77]):
        place(arps, fm_bell(m, 2.5), end + i * 0.09, 0.2, pan=(i - 1.5) * 0.3)
    place(bass, sub(29, 2.5), end, 0.7)
    pump = np.ones(N)
    for kt in kicks:
        i = int(kt * SR); j = min(N, i + int(0.32 * SR))
        pump[i:j] = np.minimum(pump[i:j], 1 - 0.55 * np.exp(-np.arange(j - i) / SR * 9))
    for bus in (bass, pads, arps):
        bus *= pump[:, None]
    drums = drums * 0.75
    music = drums + bass * 0.3 + pads * 0.85 + arps * 0.75 + fx * 0.6
    music += reverb(pads * 0.4 + arps * 0.55 + drums * 0.08, IR_HALL) * 0.55
    lows = filt(music, "low", 90); highs = filt(music, "high", 9000)
    music = music - 0.45 * lows - 0.5 * highs
    t = np.arange(N) / SR
    music *= np.minimum(1, t / 0.5)[:, None]
    music *= np.clip((TOTAL - t) / 1.2, 0, 1)[:, None] ** 1.5
    return music


def build_music_story():
    """Story cut: airy pad above the clouds, quiet pulse on the way down, minor tension while
    she is lost (+ vertigo swell), drop when the app opens (12.5 s), groove through the features,
    build into the golden walk (half-time chords), CTA, final chord on the end card."""
    drums = np.zeros((N, 2)); bass = np.zeros((N, 2)); pads = np.zeros((N, 2)); arps = np.zeros((N, 2)); fx = np.zeros((N, 2))
    kicks = []
    C = {
        "Dm": (38, [57, 62, 64, 65, 69]), "Bb": (46, [58, 62, 65, 70, 72]), "F": (41, [57, 60, 65, 67, 69]),
        "C": (48, [55, 60, 64, 67, 74]), "Gm": (43, [55, 58, 62, 67, 69]), "Asus": (45, [57, 62, 64, 69, 71]),
    }
    c = CUES
    T = c["T"]
    # above the clouds: wide, bright pad + shimmer
    place(pads, pad([50, 57, 62, 64, 69, 76], 7.6, cutoff=2600, attack=1.6, release=0.6, detune=0.14), 0.0, 0.42)
    for i in range(9):
        place(arps, fm_bell([81, 84, 88, 86, 79][i % 5], 2.4, 2.0, 1.1), 0.4 + i * 0.75, 0.05, pan=np.sin(i * 1.3) * 0.7)
    # quiet pulse on the way down
    for st in range(int((T["lost"] - 2.5) / (BEAT / 2))):
        tb = 2.5 + st * BEAT / 2
        place(arps, filt(pluck([62, 69, 64, 69][st % 4] + 12, 0.22, 2200), "high", 400), tb, 0.06 + 0.04 * min(1, st / 8))
    k = 0
    while c["hookSlam"] + k * BEAT < T["lost"]:
        place(drums, tick(1900 if k % 2 == 0 else 1500), c["hookSlam"] + k * BEAT, 0.28)
        k += 1
    # lost: minor tension
    lost = [(T["lost"], "Dm"), (T["lost"] + 1.3, "Bb"), (c["vertigo"][0], "Gm"), (c["vertigo"][0] + 1.3, "Asus")]
    for i, (at, ch) in enumerate(lost):
        dur = (lost[i + 1][0] if i + 1 < len(lost) else bar(6)) - at
        b, up = C[ch]
        place(pads, pad(up[:4], dur, cutoff=1300, attack=0.35, release=0.3), at, 0.3)
        for st in range(int(dur / (BEAT / 2))):
            place(bass, sub(b, BEAT / 2 * 0.9), at + st * BEAT / 2, 0.42)
        for st in range(int(dur / (BEAT / 4))):
            place(arps, filt(pluck(up[[0, 2, 1, 3][st % 4]] + 12, 0.25, 2400), "high", 300), at + st * BEAT / 4, 0.1)
    place(fx, riser(1.6), bar(6) - 1.6, 0.55)
    for i in range(16):
        place(drums, snare(), bar(6) - 0.9 + i * (0.85 / 16), 0.12 + 0.4 * i / 16)
    # groove from the app opening to the languages
    seq = ["Bb", "F", "C", "Dm"]
    prog = [(bar(6 + i), seq[i % 4], "full") for i in range(18)]  # 12.5 .. 48.5
    prog += [(bar(24), "Gm", "build")]  # 48.5 .. 50.5
    prog += [(bar(25), "F", "half"), (bar(26), "Bb", "half"), (bar(27), "Dm", "full"), (bar(28), "C", "full")]
    end = c["end"]
    for i, (at, ch, mode) in enumerate(prog):
        nxt = prog[i + 1][0] if i + 1 < len(prog) else end
        dur = nxt - at
        if dur <= 0:
            continue
        b, up = C[ch]
        place(pads, pad(up, dur, cutoff=2500 if mode != "build" else 1700, attack=0.25 if mode != "build" else 0.6, release=0.5), at, 0.36)
        if mode != "build":
            for st in range(int(round(dur / (BEAT / 2)))):
                place(bass, sub(b if st % 8 != 7 else b + 7, BEAT / 2 * 0.92), at + st * BEAT / 2, 0.5)
        pattern = [0, 2, 4, 2, 1, 3, 4, 3]
        for st in range(int(round(dur / (BEAT / 4)))):
            place(arps, pluck(up[pattern[st % 8]] + 12, 0.3, 3600 if mode == "full" else 2800), at + st * BEAT / 4, (0.1 if mode == "full" else 0.13) * (1.2 if st % 4 == 0 else 0.8), pan=np.sin(st * 0.7) * 0.5)
        for bt in range(int(round(dur / BEAT))):
            tb = at + bt * BEAT
            # keep the beat light under the phone close-ups (VO clarity), full on the wide shots
            if mode == "full" or (mode == "half" and bt % 4 == 0):
                place(drums, kick(), tb, 0.68); kicks.append(tb)
            if mode == "full" and bt % 2 == 1:
                place(drums, clap(), tb, 0.45)
            if mode == "half" and bt % 4 == 2:
                place(drums, clap(), tb, 0.55)
            if mode in ("full", "build"):
                place(drums, hat(), tb + BEAT / 2, 0.18, pan=0.3)
    for i in range(20):
        place(drums, snare(), bar(25) - 1.3 + i * (1.3 / 20), 0.12 + 0.45 * i / 20)
    place(fx, riser(1.8), bar(25) - 1.8, 0.5)
    place(pads, pad([41, 53, 57, 60, 65, 69, 72], 4.0, cutoff=3000, attack=0.02, release=1.8), end, 0.55)
    for i, m in enumerate([65, 69, 72, 77]):
        place(arps, fm_bell(m, 2.5), end + i * 0.09, 0.2, pan=(i - 1.5) * 0.3)
    place(bass, sub(29, 2.8), end, 0.7)
    pump = np.ones(N)
    for kt in kicks:
        i = int(kt * SR); j = min(N, i + int(0.32 * SR))
        pump[i:j] = np.minimum(pump[i:j], 1 - 0.5 * np.exp(-np.arange(j - i) / SR * 9))
    for bus in (bass, pads, arps):
        bus *= pump[:, None]
    drums = drums * 0.72
    music = drums + bass * 0.3 + pads * 0.85 + arps * 0.75 + fx * 0.6
    music += reverb(pads * 0.4 + arps * 0.55 + drums * 0.08, IR_HALL) * 0.55
    lows = filt(music, "low", 90); highs = filt(music, "high", 9000)
    music = music - 0.45 * lows - 0.5 * highs
    t = np.arange(N) / SR
    music *= np.minimum(1, t / 0.8)[:, None]
    music *= np.clip((TOTAL - t) / 1.2, 0, 1)[:, None] ** 1.5
    return music


def wind(dur, f0=400, f1=1800):
    n = tt(dur)
    w = sweep_noise(dur, f0, f1, q=0.7, curve="lin")
    return w * (0.6 + 0.4 * np.sin(2 * np.pi * 0.7 * n) ** 2)


def build_sfx_story():
    fx = np.zeros((N, 2))
    c = CUES
    # wind above the clouds, a big rush through them, the dive below
    place(fx, wind(3.2, 300, 900) * np.sin(np.pi * tt(3.2) / 3.2), 0.0, 0.35)
    place(fx, whoosh(1.9, 300, 4500, 0.55), c["cloudIn"] - 0.5, 0.8)
    place(fx, whoosh(2.4, 3500, 220, 0.3), c["cloudOut"] - 0.2, 0.55)
    place(fx, whoosh(1.2, 2200, 300, 0.4), c["land"] - 1.0, 0.35)
    place(fx, reverb(school_bell(), IR_HALL) * 0.6 + stereo(school_bell()) * 0.5, c["bell"] - 0.35, 0.5)
    place(fx, impact(0.6), c["hookSlam"], 0.5)
    for i, at in enumerate(c["tags"]):
        place(fx, filt(pop(1300 + i * 40, 700), "high", 300), at, 0.12, pan=np.sin(i * 1.7) * 0.6)
    for i, at in enumerate(c["qs"]):
        place(fx, pop(900, 380), at, 0.16, pan=np.sin(i * 2.3) * 0.6)
    # vertigo: a slow reverse swell with a falling drone
    a, b = c["vertigo"]
    d = b - a
    tv = tt(d)
    drone = np.sin(2 * np.pi * np.cumsum(110 * (1 - 0.35 * tv / d)) / SR) * (tv / d) ** 2 * 0.3
    place(fx, drone + sweep_noise(d, 200, 2500) * (tv / d) ** 2 * 0.25, a, 0.6)
    # phone
    place(fx, whoosh(0.6, 300, 1600, 0.5), c["raise"], 0.25)
    place(fx, fm_bell(84, 0.8, 2.0, 1.2), c["screenOn"], 0.14)
    place(fx, sparkle(1.0), c["logoIn"], 0.6)
    place(fx, whoosh(0.6, 400, 3500, 0.55), c["revealSub"] - 0.2, 0.22)
    place(fx, tap_click(), c["tapSearch"], 0.5)
    for at in c["typing"]:
        place(fx, key_click(), at, 0.35, pan=RNG.uniform(-0.2, 0.2))
    place(fx, tap_click(), c["pick"], 0.5)
    place(fx, whoosh(0.4, 800, 5000, 0.5), c["pick"] + 0.15, 0.25)
    # crane up + the route from the gate
    place(fx, whoosh(1.4, 200, 2600, 0.5), c["crane"], 0.5)
    a, b = c["routeDraw"]
    place(fx, sweep_noise(b - a, 1500, 6000) * np.sin(np.pi * tt(b - a) / (b - a)) * 0.25, a, 0.35)
    place(fx, whoosh(0.4, 3000, 400, 0.3), c["pinArrive"] - 0.4, 0.4)
    place(fx, pop(500, 160) * 1.2, c["pinArrive"], 0.5)
    for i, m in enumerate([77, 81, 84]):
        place(fx, fm_bell(m, 1.4, 3.0, 2.0), c["pinArrive"] + 0.05 + i * 0.08, 0.16, pan=(i - 1) * 0.35)
    # back down, tap "you are here", the route leaves the phone
    place(fx, whoosh(1.4, 2600, 250, 0.45), c["T"]["start"] + 0.1, 0.4)
    place(fx, tap_click(), c["startTap"], 0.55)
    place(fx, pop(700, 300), c["startTap"] + 0.05, 0.35)
    for i, m in enumerate([72, 79]):
        place(fx, fm_bell(m, 1.0, 2.0, 1.4), c["startTap"] + 0.1 + i * 0.1, 0.1)
    t = tt(0.5)
    zap = np.sin(2 * np.pi * np.cumsum(600 + 2600 * (t / 0.5) ** 1.5) / SR) * np.sin(np.pi * t / 0.5) * 0.2
    place(fx, zap + whoosh(0.5, 800, 6000, 0.7) * 0.5, c["launch"], 0.55)
    place(fx, sparkle(1.2), c["arDraw"][0] - 0.1, 0.5)
    a, b = c["arDraw"]
    place(fx, sweep_noise(b - a, 1200, 5000) * np.sin(np.pi * tt(b - a) / (b - a)) * 0.25, a, 0.4)
    # chips
    place(fx, whoosh(1.3, 300, 2200, 0.5), c["T"]["chips"], 0.35)
    for k, at in enumerate(c["chips"]):
        for i in range(4):
            place(fx, pop(700 + k * 180 + i * 40, 380 + k * 90), at + i * 0.06, 0.2, pan=RNG.uniform(-0.6, 0.6))
    place(fx, tap_click(), c["chipPress"], 0.6)
    place(fx, sweep_noise(1.4, 2000, 7000) * np.sin(np.pi * tt(1.4) / 1.4) * 0.25, c["toiletRoute"], 0.3)
    # 3D + photos
    place(fx, whoosh(1.2, 2600, 250, 0.5), c["v3dIn"] - 0.1, 0.45, pan=0.3)
    place(fx, tap_click(), c["v3dTap"], 0.55)
    place(fx, whoosh(0.5, 600, 4000, 0.5), c["v3dTap"] + 0.15, 0.3)
    for i, at in enumerate(c["cards"]):
        place(fx, whoosh(0.45, 700 + i * 120, 4500, 0.4), at - 0.1, 0.2, pan=np.sin(i * 1.3) * 0.7)
    for i, at in enumerate(c["langs"]):
        place(fx, whoosh(0.45, 300, 2500, 0.6), at - 0.2, 0.28, pan=[-0.5, 0, 0.5][i])
        place(fx, fm_bell([72, 76, 79][i], 1.0, 2.0, 1.5), at + 0.1, 0.13)
    # the walk: soft steps in time with her feet
    st = c["walk"] + 0.35
    while st < c["end"] - 0.3:
        stp = filt(noise(int(0.06 * SR)) * np.exp(-np.arange(int(0.06 * SR)) / SR * 70), "bp", (300, 2400))
        place(fx, stp, st, 0.05 * min(1, (st - c["walk"]) / 1.0) * max(0, 1 - (st - c["cta"]) / 2.0))
        st += 0.483
    place(fx, impact(0.5), c["tag2"], 0.35)
    place(fx, whoosh(0.8, 250, 2500, 0.6), c["cta"] - 0.2, 0.45)
    place(fx, impact(1.0), c["end"], 0.7)
    place(fx, sparkle(1.2), c["end"] + 0.2, 0.5)
    fx = filt(fx, "low", 10000)
    return fx


def main():
    music = build_music30() if EDIT == "30" else build_music_silk() if EDIT == "silk" else build_music_story() if EDIT == "story" else build_music()
    sfx = build_sfx_story() if EDIT == "story" else build_sfx()
    vo, _ = load_vo()
    duck = duck_curve(vo)
    meter = pyln.Meter(SR)
    # stem levels
    def norm_to(x, lufs):
        cur = meter.integrated_loudness(x if x.ndim == 2 else stereo(x))
        return x * 10 ** ((lufs - cur) / 20)
    music_n = norm_to(music, -20.0)
    sfx_n = sfx * (10 ** ((-23.0 - meter.integrated_loudness(sfx)) / 20))
    vo_n = norm_to(stereo(vo, 0) * 0.7071, -16.5)
    mix = music_n * duck[:, None] + sfx_n + vo_n
    # master: loudness -14 LUFS then limit
    mix = mix * 10 ** ((-14.0 - meter.integrated_loudness(mix)) / 20)
    mix = limiter(mix, 0.87)
    mix = mix * 10 ** ((-14.0 - meter.integrated_loudness(mix)) / 20)
    mix = limiter(mix, 0.87)
    print("integrated LUFS:", round(meter.integrated_loudness(mix), 2), "peak dBFS:", round(20 * np.log10(np.abs(mix).max()), 2))
    sf.write(OUT / "music.wav", np.clip(music_n, -1, 1), SR, subtype="PCM_24")
    sf.write(OUT / "sfx.wav", np.clip(sfx_n, -1, 1), SR, subtype="PCM_24")
    sf.write(OUT / "vo.wav", np.clip(vo_n, -1, 1), SR, subtype="PCM_24")
    sf.write(OUT / "mix.wav", np.clip(mix, -1, 1), SR, subtype="PCM_24")
    # render-time copy (tracked in git) used by tools/make.js
    import subprocess
    gen = ROOT / "generated" / (LANG if EDIT == "full" else f"{LANG}-{EDIT}")
    gen.mkdir(parents=True, exist_ok=True)
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", str(OUT / "mix.wav"), "-c:a", "flac", "-compression_level", "8", str(gen / "mix.flac")], check=True)
    print("wrote", OUT)


if __name__ == "__main__":
    main()
