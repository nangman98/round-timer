"""복싱 벨 모드의 실제 녹음 효과음. Freesound의 CC0(퍼블릭 도메인) 녹음을 받아 잘라 쓴다.
실행: python3 tools/cut-bell.py   (ffmpeg, numpy, macOS afconvert 필요) — make-sounds.py 다음에 실행.
  - 520998 "Boxing Bell Signals" by Mateusz_Chenc (CC0) — 17.80s부터 땡땡땡, 0s의 땡
  - 368779 "Short beep countdown" by gurie (CC0)        — 첫 '삐'
"""
import os, subprocess, tempfile, urllib.request, wave
import numpy as np

SR = 44100
OUT = os.path.join(os.path.dirname(__file__), "..", "sounds")
SRC = {
    "bell": "https://cdn.freesound.org/previews/520/520998_10756146-hq.mp3",
    "beep": "https://cdn.freesound.org/previews/368/368779_6605122-hq.mp3",
}

def load(url):
    with tempfile.NamedTemporaryFile(suffix=".mp3", delete=False) as f:
        f.write(urllib.request.urlopen(url).read()); p = f.name
    raw = subprocess.run(["ffmpeg", "-loglevel", "error", "-i", p, "-ac", "1", "-ar", str(SR), "-f", "s16le", "-"],
                         capture_output=True, check=True).stdout
    os.remove(p)
    return np.frombuffer(raw, "<i2").astype(float) / 32768

def cut(x, a, b, fade=.25):
    y = x[int(a * SR):int(b * SR)].copy(); n = int(fade * SR)
    y[:int(.003 * SR)] *= np.linspace(0, 1, int(.003 * SR)); y[-n:] *= np.linspace(1, 0, n) ** 2
    return y

def save(name, y):
    y = y / np.max(np.abs(y)) * .89
    with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as f: tmp = f.name
    with wave.open(tmp, "wb") as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR); w.writeframes((y * 32767).astype("<i2").tobytes())
    subprocess.run(["afconvert", "-f", "m4af", "-d", "aac", "-b", "128000", tmp, os.path.join(OUT, name + ".m4a")], check=True)
    os.remove(tmp)

bell, beep = load(SRC["bell"]), load(SRC["beep"])
triple = cut(bell, 17.80, 20.6, .5)                        # 땡땡땡
finish = np.concatenate([triple, np.zeros(int(.7 * SR)), triple])  # 땡땡땡 … 땡땡땡
save("real3-phase", triple); save("real3-finish", finish)
save("real1-phase", cut(bell, 0.0, 1.9, .5))                # 땡
save("real1-finish", finish)
save("cd-rec", cut(beep, 0, .45, .08))                      # 삐
print("ok")
