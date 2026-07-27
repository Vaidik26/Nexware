import { Audio } from 'expo-av';
import { Platform } from 'react-native';

let soundObject: Audio.Sound | null = null;

/**
 * Plays the custom 4-5 second warehouse picker alert bell sound.
 * Used when a new picklist is assigned or an urgent notification alerts the operative on the warehouse floor.
 */
export async function playPickerAlertSound(): Promise<void> {
  try {
    if (soundObject) {
      try {
        await soundObject.unloadAsync();
      } catch (e) {}
      soundObject = null;
    }

    if (Platform.OS !== 'web') {
      await Audio.setAudioModeAsync({
        playsInSilentModeIOS: true,
        shouldDuckAndroid: false,
        playThroughEarpieceAndroid: false,
      });
    }

    const { sound } = await Audio.Sound.createAsync(
      require('../../assets/sounds/picker_bell_alert.wav'),
      { shouldPlay: true, volume: 1.0 }
    );
    
    soundObject = sound;

    sound.setOnPlaybackStatusUpdate((status) => {
      if (status.isLoaded && status.didJustFinish) {
        sound.unloadAsync().catch(() => {});
        soundObject = null;
      }
    });
  } catch (error) {
    console.warn('expo-av playback error or asset loading issue, trying web audio synth fallback:', error);
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      playWebAlertFallback();
    }
  }
}

function playWebAlertFallback() {
  try {
    const AudioContext = (window as any).AudioContext || (window as any).webkitAudioContext;
    if (!AudioContext) return;
    const ctx = new AudioContext();
    
    // Simulate 5 bright alert bell rings over ~4.5 seconds
    for (let i = 0; i < 5; i++) {
      const startTime = ctx.currentTime + (i * 0.85);
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(880, startTime);
      gain.gain.setValueAtTime(0.35, startTime);
      gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.75);
      osc.start(startTime);
      osc.stop(startTime + 0.75);
    }
  } catch (e) {
    // Silent fail
  }
}

/**
 * Plays a pleasant tactile tick confirmation sound when checking off an item in the prototype list
 */
export async function playTickSound(): Promise<void> {
  try {
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      const AudioContext = (window as any).AudioContext || (window as any).webkitAudioContext;
      if (AudioContext) {
        const ctx = new AudioContext();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.type = 'sine';
        osc.frequency.setValueAtTime(600, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(1000, ctx.currentTime + 0.06);
        gain.gain.setValueAtTime(0.15, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.06);
        osc.start();
        osc.stop(ctx.currentTime + 0.06);
      }
    }
  } catch (err) {
    // Silent fail
  }
}
