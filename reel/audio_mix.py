"""
Safe-Skill Reels Master Audio Engine (Lemo-Opuscar & Instagram Standard)
- Broadcast-grade voiceover: Liam (Energetic Social Media Creator, ElevenLabs)
- High-energy cyber/tech synth groove (124 BPM, bass pulse, hi-hats, arpeggio)
- Dynamic sidechain ducking (-14 dB reduction when voice is active)
- Procedural SFX: mechanical typing clicks, threat warning glitch, sub-bass barrier slam,
  digital laser scan chirp, golden SHA-256 seal chime, card fan-out swooshes, keynote outro swell.
- Mastering: EBU R128 (-14 LUFS), High-pass 80Hz, True Peak -1.0 dB.
"""
import os
import subprocess
import numpy as np
from scipy.signal import butter, sosfilt
from scipy.io import wavfile

SR = 48000
HERE = os.path.dirname(os.path.abspath(__file__))
VOICE_PATH = os.path.join(HERE, "voice_liam_mastered.mp3")
OUT_MIX_WAV = os.path.join(HERE, "mix_raw.wav")
FINAL_MP3 = os.path.join(HERE, "mastered_audio.mp3")

_rng = np.random.default_rng(1337)

def t_(d): return np.arange(int(round(d * SR))) / SR
def env_exp(d, tau): return np.exp(-t_(d) / tau)
def bp(x, lo, hi, o=2): return sosfilt(butter(o, [lo, hi], btype="bandpass", fs=SR, output="sos"), x)
def lp(x, fc, o=2): return sosfilt(butter(o, fc, btype="lowpass", fs=SR, output="sos"), x)
def hp(x, fc, o=2): return sosfilt(butter(o, fc, btype="highpass", fs=SR, output="sos"), x)

def make_type_click(d=0.035):
    """Snappy mechanical keyboard click"""
    t = t_(d)
    body = np.sin(2 * np.pi * 1800 * t) * np.exp(-t / 0.006)
    trans = _rng.normal(0, 1, len(t)) * np.exp(-t / 0.003)
    c = hp(body + 0.6 * trans, 800)
    return 0.28 * c / (np.max(np.abs(c)) + 1e-6)

def make_glitch_alarm(d=0.45):
    """Tension warning siren / threat alarm"""
    t = t_(d)
    f = 880 + 220 * np.sin(2 * np.pi * 14 * t)
    phase = 2 * np.pi * np.cumsum(f) / SR
    sig = np.sin(phase) * (1 - t / d) * (0.8 + 0.2 * np.sin(2 * np.pi * 32 * t))
    sig = bp(sig, 400, 2500)
    return 0.35 * sig / (np.max(np.abs(sig)) + 1e-6)

def make_barrier_slam(d=0.75):
    """Sub-bass heavy impact slam as security gate drops"""
    t = t_(d)
    f = 140 * np.exp(-t / 0.12) + 42
    sig = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / 0.22)
    noise = lp(_rng.normal(0, 1, len(t)) * np.exp(-t / 0.06), 400)
    sig = sig + 0.5 * noise
    return 0.65 * sig / (np.max(np.abs(sig)) + 1e-6)

def make_laser_chirp(d=0.38):
    """Digital laser scan beam sweep"""
    t = t_(d)
    f = 3200 * np.exp(-t / 0.14) + 600
    sig = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / 0.16)
    sig = bp(sig, 800, 5000)
    return 0.32 * sig / (np.max(np.abs(sig)) + 1e-6)

def make_gold_chime(d=1.2):
    """Crystalline golden seal impact chime (harmonic bell)"""
    t = t_(d)
    freqs = [1046.5, 2093.0, 3135.96, 4186.01]
    amps = [0.45, 0.30, 0.18, 0.10]
    sig = np.zeros_like(t)
    for fr, a in zip(freqs, amps):
        sig += a * np.sin(2 * np.pi * fr * t) * np.exp(-t / (0.45 * (1046.5 / fr)**0.5))
    sig = hp(sig, 800)
    return 0.42 * sig / (np.max(np.abs(sig)) + 1e-6)

def make_whoosh(d=0.42):
    """Dynamic camera whip transition whoosh"""
    t = t_(d)
    noise = _rng.normal(0, 1, len(t))
    env = np.sin(np.pi * t / d)**2
    filtered = bp(noise, 200, 3500) * env
    return 0.35 * filtered / (np.max(np.abs(filtered)) + 1e-6)

def make_pop(d=0.12):
    """Soft card pop / appear swoosh"""
    t = t_(d)
    sig = np.sin(2 * np.pi * 520 * np.exp(-t / 0.03) * t) * np.exp(-t / 0.035)
    return 0.22 * sig / (np.max(np.abs(sig)) + 1e-6)

def synthesize_music_bed(total_dur=34.0):
    total_len = int(round(total_dur * SR))
    bed = np.zeros(total_len, dtype=np.float32)

    bpm = 124.0
    beat_dur = 60.0 / bpm

    # 1. Kick/Sub-bass pulse on quarter notes
    for i in range(int(total_dur / beat_dur)):
        bt = i * beat_dur
        idx = int(round(bt * SR))
        k_dur = 0.22
        k_len = int(round(k_dur * SR))
        if idx + k_len > total_len:
            break
        tk = np.arange(k_len) / SR
        fk = 120 * np.exp(-tk / 0.04) + 40
        kick = np.sin(2 * np.pi * np.cumsum(fk) / SR) * np.exp(-tk / 0.07)
        bed[idx:idx + k_len] += 0.22 * kick

    # 2. Crisp 16th-note closed hi-hats
    sixteenth = beat_dur / 4.0
    for i in range(int(total_dur / sixteenth)):
        ht = i * sixteenth
        idx = int(round(ht * SR))
        h_dur = 0.035
        h_len = int(round(h_dur * SR))
        if idx + h_len > total_len:
            break
        noise = _rng.normal(0, 1, h_len)
        th = np.arange(h_len) / SR
        vel = 0.14 if (i % 4 == 2) else 0.08
        if i % 2 == 1:
            vel = 0.05
        hat = hp(noise * np.exp(-th / 0.012), 6500) * vel
        bed[idx:idx + h_len] += hat

    # 3. Driving bass arpeggio
    notes = [110.0, 130.81, 146.83, 164.81]
    eighth = beat_dur / 2.0
    for i in range(int(total_dur / eighth)):
        et = i * eighth
        idx = int(round(et * SR))
        b_dur = 0.18
        b_len = int(round(b_dur * SR))
        if idx + b_len > total_len:
            break
        tb = np.arange(b_len) / SR
        f_note = notes[(i // 2) % len(notes)]
        saw = (2 * ((tb * f_note) % 1) - 1) * np.exp(-tb / 0.08)
        bass = lp(saw, 750) * 0.15
        bed[idx:idx + b_len] += bass

    # Outro fade
    fade_start = int(round((total_dur - 2.5) * SR))
    if fade_start < total_len:
        fade_len = total_len - fade_start
        bed[fade_start:] *= np.linspace(1.0, 0.0, fade_len)**1.5

    return bed

def main():
    print("[INFO] Master Audio Pipeline Baslatiliyor...")

    voice_wav_tmp = os.path.join(HERE, "voice_tmp.wav")
    subprocess.run([
        "ffmpeg", "-y", "-loglevel", "error",
        "-i", VOICE_PATH,
        "-ar", str(SR), "-ac", "1",
        voice_wav_tmp
    ], check=True)

    _, voice_raw = wavfile.read(voice_wav_tmp)
    voice_raw = voice_raw.astype(np.float32) / 32768.0

    total_dur = max(34.0, (len(voice_raw) / SR) + 1.2)
    total_len = int(round(total_dur * SR))
    print(f"[INFO] Toplam Hedef Sure: {total_dur:.2f} sn ({total_len} ornek @ {SR}Hz)")

    voice_track = np.zeros(total_len, dtype=np.float32)
    voice_track[:len(voice_raw)] = voice_raw

    # Sidechain zarfi
    envelope = np.abs(voice_track)
    sos_env = butter(2, 6.0, btype="lowpass", fs=SR, output="sos")
    smooth_env = sosfilt(sos_env, envelope)
    voice_active = np.clip(smooth_env * 4.0, 0.0, 1.0)
    ducking_curve = 1.0 - 0.78 * voice_active

    music_bed = synthesize_music_bed(total_dur)
    ducked_music = music_bed * ducking_curve

    sfx_track = np.zeros(total_len, dtype=np.float32)

    def place_sfx(sound, t_sec):
        idx = int(round(t_sec * SR))
        slen = len(sound)
        if idx + slen <= total_len:
            sfx_track[idx:idx + slen] += sound
        elif idx < total_len:
            sfx_track[idx:] += sound[:total_len - idx]

    for ct in np.linspace(0.8, 3.2, 14):
        place_sfx(make_type_click(), ct)

    place_sfx(make_glitch_alarm(), 4.2)
    place_sfx(make_whoosh(), 5.8)
    place_sfx(make_barrier_slam(), 6.0)
    place_sfx(make_laser_chirp(), 8.2)
    place_sfx(make_barrier_slam(0.4), 10.0)
    place_sfx(make_whoosh(), 12.8)
    place_sfx(make_gold_chime(), 14.8)
    place_sfx(make_pop(), 17.0)
    place_sfx(make_pop(), 17.5)
    place_sfx(make_pop(), 18.0)
    place_sfx(make_whoosh(), 22.2)
    place_sfx(make_barrier_slam(0.5), 22.6)

    full_mix = voice_track * 1.05 + ducked_music * 0.90 + sfx_track * 0.95

    wavfile.write(OUT_MIX_WAV, SR, (np.clip(full_mix, -0.99, 0.99) * 32767).astype(np.int16))

    print("[INFO] EBU R128 -14 LUFS Mastering ve Cok Bantli Kompresyon...")
    cmd = [
        "ffmpeg", "-y", "-loglevel", "error",
        "-i", OUT_MIX_WAV,
        "-af", (
            "highpass=f=80,"
            "equalizer=f=250:width_type=q:w=1.2:g=1.5,"
            "equalizer=f=3800:width_type=q:w=1.0:g=3.2,"
            "loudnorm=I=-14:TP=-1.0:LRA=7"
        ),
        "-c:a", "libmp3lame", "-b:a", "256k",
        FINAL_MP3
    ]
    subprocess.run(cmd, check=True)

    if os.path.exists(voice_wav_tmp): os.remove(voice_wav_tmp)
    if os.path.exists(OUT_MIX_WAV): os.remove(OUT_MIX_WAV)

    print(f"[OK] MASTER SES DOSYASI HAZIR: {FINAL_MP3}")
    print(f"[OK] Boyut: {os.path.getsize(FINAL_MP3)} bayt")

if __name__ == "__main__":
    main()
