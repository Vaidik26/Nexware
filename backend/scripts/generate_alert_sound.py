import math
import wave
import struct
import os
import sys

def generate_bell(filename, duration=4.5, sample_rate=44100):
    os.makedirs(os.path.dirname(os.path.abspath(filename)), exist_ok=True)
    
    n_samples = int(sample_rate * duration)
    audio = []
    
    # Repeating chime/ring pattern over 4.5 seconds (~5 bright rings)
    ring_interval = 0.85
    
    for i in range(n_samples):
        t = i / sample_rate
        t_ring = t % ring_interval
        
        # High-visibility warehouse alert bell frequencies
        f1 = 880.0   # A5
        f2 = 1320.0  # E6
        f3 = 1760.0  # A6
        
        if t_ring < 0.75:
            envelope = math.exp(-t_ring * 4.2)
            # Tremolo effect to simulate resonant ringing bell
            tremolo = 0.75 + 0.25 * math.sin(2 * math.pi * 16 * t_ring)
            sample = (
                0.5 * math.sin(2 * math.pi * f1 * t_ring) +
                0.3 * math.sin(2 * math.pi * f2 * t_ring) +
                0.2 * math.sin(2 * math.pi * f3 * t_ring)
            ) * (envelope * tremolo)
        else:
            sample = 0.0
            
        # Anti-pop fade in/out
        if t < 0.02:
            sample *= (t / 0.02)
        if t > duration - 0.05:
            sample *= ((duration - t) / 0.05)
            
        val = int(max(min(sample * 28000, 32767), -32768))
        audio.append(struct.pack('<h', val))
        
    with wave.open(filename, 'w') as wav_file:
        wav_file.setnchannels(1)
        wav_file.setsampwidth(2)
        wav_file.setframerate(sample_rate)
        wav_file.writeframes(b"".join(audio))
        
    print(f"Successfully generated {filename} (Duration: {duration}s)")

if __name__ == '__main__':
    target_path = sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.path.dirname(__file__), '../../mobile/assets/sounds/picker_bell_alert.wav')
    generate_bell(target_path)
