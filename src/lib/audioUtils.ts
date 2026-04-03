export type TimerSound = 'digital' | 'bell' | 'classic' | 'boxing';

export function playTimerSound(soundType: TimerSound = 'digital') {
  try {
    const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContext) return;
    
    const ctx = new AudioContext();

    // If context is suspended (due to autoplay policies), try to resume it
    if (ctx.state === 'suspended') {
      ctx.resume();
    }

    const t = ctx.currentTime;

    if (soundType === 'digital') {
      // 3 short high-pitched beeps
      for (let i = 0; i < 3; i++) {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        
        osc.type = 'square';
        osc.frequency.setValueAtTime(1000, t + i * 0.2); // 1000Hz
        gain.gain.setValueAtTime(0.1, t + i * 0.2);
        gain.gain.exponentialRampToValueAtTime(0.01, t + i * 0.2 + 0.1);
        
        osc.start(t + i * 0.2);
        osc.stop(t + i * 0.2 + 0.1);
      }
    } else if (soundType === 'bell') {
      // A resonant bell sound
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.type = 'sine';
      osc.frequency.setValueAtTime(800, t);
      
      gain.gain.setValueAtTime(0.3, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 1.5);
      
      osc.start(t);
      osc.stop(t + 1.5);
    } else if (soundType === 'classic') {
      // Classic electronic watch alarm
      for (let i = 0; i < 4; i++) {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(2000, t + i * 0.15); 
        gain.gain.setValueAtTime(0.1, t + i * 0.15);
        gain.gain.linearRampToValueAtTime(0.01, t + i * 0.15 + 0.05);
        
        osc.start(t + i * 0.15);
        osc.stop(t + i * 0.15 + 0.1);
      }
    } else if (soundType === 'boxing') {
      // Boxing bell - loud and metallic
      const osc1 = ctx.createOscillator();
      const osc2 = ctx.createOscillator();
      const gain = ctx.createGain();
      
      osc1.connect(gain);
      osc2.connect(gain);
      gain.connect(ctx.destination);

      osc1.type = 'sine';
      osc2.type = 'square';
      
      osc1.frequency.setValueAtTime(600, t);
      osc2.frequency.setValueAtTime(1200, t);
      
      gain.gain.setValueAtTime(0.2, t);
      gain.gain.exponentialRampToValueAtTime(0.01, t + 1.0);
      
      osc1.start(t);
      osc2.start(t);
      osc1.stop(t + 1.0);
      osc2.stop(t + 1.0);
    }
  } catch (e) {
    console.error("Audio playback error:", e);
  }
}
