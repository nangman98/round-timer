"""효과음 생성기. 외부 음원 없이 직접 합성해 sounds/*.m4a 를 만든다.
실행: python3 tools/make-sounds.py   (numpy, macOS afconvert 필요)
소리를 바꾸면 sw.js 의 VERSION 을 올릴 것."""
import os, subprocess, tempfile, wave
import numpy as np

SR = 44100
OUT = os.path.join(os.path.dirname(__file__), "..", "sounds")

def t(d): return np.arange(int(SR * d)) / SR

def place(buf, x, at):
    i = int(at * SR); n = min(len(x), len(buf) - i); buf[i:i + n] += x[:n]

def beep(f, d, shape="square"):
    tt = t(d); ph = 2 * np.pi * f * tt
    x = np.sign(np.sin(ph)) * .55 + np.sin(ph) * .45 if shape == "square" else np.sin(ph)
    env = np.minimum(1, tt / .004) * np.minimum(1, (d - tt) / .02)
    return x * env

def ding(f=1150, d=2.6, seed=0):
    """복싱 벨 한 번: 비조화 배음 + 미세한 맥놀이 + 타격 잡음"""
    tt = t(d); x = np.zeros_like(tt)
    for r, a, dec in [(1, 1, 1.5), (1.004, .6, 1.4), (1.51, .45, .9), (2.0, .4, .8),
                      (2.74, .3, .5), (3.76, .18, .32), (5.4, .1, .18)]:
        x += a * np.sin(2 * np.pi * f * r * tt) * np.exp(-tt / dec)
    rng = np.random.default_rng(seed); nz = rng.standard_normal(int(SR * .012))
    nz *= np.exp(-np.arange(len(nz)) / (SR * .003)); x[:len(nz)] += nz * .8
    return x * np.minimum(1, tt / .0015)

def whistle(d):
    tt = t(d); f = 2850 + 120 * np.sin(2 * np.pi * 34 * tt)
    x = np.sin(2 * np.pi * np.cumsum(f) / SR) * .7
    x += np.random.default_rng(1).standard_normal(len(tt)) * .08
    return x * np.minimum(1, tt / .02) * np.minimum(1, (d - tt) / .04)

def mix(total, parts):
    buf = np.zeros(int(SR * total))
    for x, at in parts: place(buf, x, at)
    return buf

def wood(d=.12):
    """우드블록 '딱': 짧게 감쇠하는 두 공명음"""
    tt = t(d)
    return (np.sin(2 * np.pi * 1850 * tt) + .6 * np.sin(2 * np.pi * 2900 * tt)) * np.exp(-tt / .022)

SOUNDS = {
    # 카운트다운 (마지막 3초) — cd-rec 은 cut-bell.py 가 녹음에서 만든다
    "cd-beep":    mix(.2,  [(beep(880, .14), 0)]),
    "cd-high":    mix(.15, [(beep(1760, .07, "sine"), 0)]),
    "cd-wood":    mix(.15, [(wood(), 0)]),
    "cd-whistle": mix(.15, [(whistle(.09), 0)]),
    # 라운드 시작·끝 / 운동 완료 — real3·real1 은 cut-bell.py 가 녹음에서 만든다
    "synth-phase":    mix(3.0, [(ding(seed=0), 0), (ding(seed=1), .32), (ding(seed=2), .64)]),
    "synth-finish":   mix(4.2, [(ding(seed=0), 0), (ding(seed=1), .32), (ding(seed=2), .64),
                                (ding(seed=3), 1.2), (ding(seed=4), 1.52), (ding(d=3.0, seed=5), 1.84)]),
    "beep-phase":     mix(.6,  [(beep(1320, .5), 0)]),
    "beep-finish":    mix(1.0, [(beep(1046, .16), 0), (beep(1318, .16), .2), (beep(1568, .5), .4)]),
    "whistle-phase":  mix(.8,  [(whistle(.7), 0)]),
    "whistle-calm":   mix(.5,  [(whistle(.18), 0), (whistle(.18), .26)]),
    "whistle-finish": mix(1.5, [(whistle(.15), 0), (whistle(.15), .24), (whistle(.9), .48)]),
    # 종료 10초 전
    "warn-bell":    mix(.5,  [(ding(1500, .25, 3) * .5, 0), (ding(1500, .25, 4) * .5, .18)]),
    "warn-beep":    mix(.4,  [(beep(988, .1), 0), (beep(988, .1), .16)]),
    "warn-whistle": mix(.3,  [(whistle(.08), 0), (whistle(.08), .16)]),
}

os.makedirs(OUT, exist_ok=True)
for name, x in SOUNDS.items():
    x = x / np.max(np.abs(x)) * .89
    with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as f: tmp = f.name
    with wave.open(tmp, "wb") as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR)
        w.writeframes((x * 32767).astype("<i2").tobytes())
    subprocess.run(["afconvert", "-f", "m4af", "-d", "aac", "-b", "128000", tmp,
                    os.path.join(OUT, name + ".m4a")], check=True)
    os.remove(tmp)
print("ok", len(SOUNDS))
