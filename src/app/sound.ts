export type SoundName = "start" | "roll" | "turn" | "money" | "event" | "victory";
let sharedAudioContext: AudioContext | null = null;

export function playSound(name: SoundName, enabled: boolean) {
  if (!enabled || typeof window === "undefined") return;
  const AudioContextClass = window.AudioContext;
  if (!AudioContextClass) return;
  try {
    const context = sharedAudioContext ?? (sharedAudioContext = new AudioContextClass());
    if (context.state === "suspended") void context.resume();
    const now = context.currentTime;
    const patterns: Record<SoundName, Array<{ frequency: number; duration: number; wave?: OscillatorType; delay?: number }>> = {
      start: [{ frequency: 440, duration: 0.09 }, { frequency: 587.33, duration: 0.13, delay: 0.08 }],
      roll: [{ frequency: 190, duration: 0.045, wave: "square" }, { frequency: 270, duration: 0.045, wave: "square", delay: 0.055 }, { frequency: 360, duration: 0.06, wave: "triangle", delay: 0.11 }],
      turn: [{ frequency: 330, duration: 0.07 }, { frequency: 247, duration: 0.1, delay: 0.07 }],
      money: [{ frequency: 660, duration: 0.07 }, { frequency: 880, duration: 0.11, delay: 0.065 }],
      event: [{ frequency: 520, duration: 0.08, wave: "triangle" }],
      victory: [{ frequency: 523.25, duration: 0.12 }, { frequency: 659.25, duration: 0.12, delay: 0.1 }, { frequency: 783.99, duration: 0.2, delay: 0.2 }],
    };
    patterns[name].forEach(({ frequency, duration, wave = "sine", delay = 0 }) => {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      const startAt = now + delay;
      oscillator.type = wave;
      oscillator.frequency.setValueAtTime(frequency, startAt);
      gain.gain.setValueAtTime(0.0001, startAt);
      gain.gain.exponentialRampToValueAtTime(0.09, startAt + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.0001, startAt + duration);
      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.start(startAt);
      oscillator.stop(startAt + duration + 0.015);
    });
  } catch {
    // Audio restrictions must never interrupt gameplay.
  }
}
