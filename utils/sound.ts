// Simple synth for 8-bit sounds using Web Audio API

let audioCtx: AudioContext | null = null;
let isMuted: boolean = false;

const getAudioContext = (): AudioContext => {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
  }
  return audioCtx;
};

export const toggleMute = (): boolean => {
  isMuted = !isMuted;
  return isMuted;
};

export const getMuted = (): boolean => isMuted;

export enum SoundType {
  PADDLE_HIT,
  WALL_HIT,
  SCORE_PLAYER,
  SCORE_ENEMY,
  GAME_OVER,
  GAME_START
}

export const playSound = (type: SoundType) => {
  if (isMuted) return;

  try {
    const ctx = getAudioContext();
    if (ctx.state === 'suspended') {
        ctx.resume();
    }
    
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.connect(gain);
    gain.connect(ctx.destination);

    const now = ctx.currentTime;

    switch (type) {
      case SoundType.PADDLE_HIT:
        // High beep (Square wave)
        osc.type = 'square';
        osc.frequency.setValueAtTime(600, now);
        osc.frequency.exponentialRampToValueAtTime(300, now + 0.1);
        
        gain.gain.setValueAtTime(0.1, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.1);
        
        osc.start(now);
        osc.stop(now + 0.1);
        break;

      case SoundType.WALL_HIT:
        // Lower boop (Square wave)
        osc.type = 'square';
        osc.frequency.setValueAtTime(200, now);
        osc.frequency.exponentialRampToValueAtTime(100, now + 0.1);
        
        gain.gain.setValueAtTime(0.1, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.1);
        
        osc.start(now);
        osc.stop(now + 0.1);
        break;

      case SoundType.SCORE_PLAYER:
        // Positive 2-note chime (Triangle wave)
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(440, now); // A4
        osc.frequency.setValueAtTime(880, now + 0.1); // A5
        
        gain.gain.setValueAtTime(0.1, now);
        gain.gain.linearRampToValueAtTime(0.1, now + 0.1);
        gain.gain.linearRampToValueAtTime(0, now + 0.4);
        
        osc.start(now);
        osc.stop(now + 0.4);
        break;

      case SoundType.SCORE_ENEMY:
        // Negative buzz/descending (Sawtooth)
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(150, now);
        osc.frequency.linearRampToValueAtTime(100, now + 0.3);
        
        gain.gain.setValueAtTime(0.1, now);
        gain.gain.linearRampToValueAtTime(0, now + 0.3);
        
        osc.start(now);
        osc.stop(now + 0.3);
        break;

      case SoundType.GAME_START:
        // Ascending Power Up
        osc.type = 'square';
        osc.frequency.setValueAtTime(220, now);
        osc.frequency.exponentialRampToValueAtTime(880, now + 0.5);
        
        gain.gain.setValueAtTime(0.1, now);
        gain.gain.linearRampToValueAtTime(0, now + 0.5);
        
        osc.start(now);
        osc.stop(now + 0.5);
        break;

      case SoundType.GAME_OVER:
        // Long Descending Fail
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(400, now);
        osc.frequency.exponentialRampToValueAtTime(50, now + 1.5);
        
        gain.gain.setValueAtTime(0.2, now);
        gain.gain.linearRampToValueAtTime(0, now + 1.5);
        
        osc.start(now);
        osc.stop(now + 1.5);
        break;
    }
  } catch (e) {
    console.error("Audio playback failed", e);
  }
};