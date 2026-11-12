class SoundEngine {
  private ctx: AudioContext | null = null;
  private isMuted: boolean = true; // Off by default on first visit
  private volume: number = 0.5;

  constructor() {
    if (typeof window !== 'undefined') {
      const storedMute = localStorage.getItem('arcade_sound_muted');
      if (storedMute !== null) {
        this.isMuted = storedMute === 'true';
      }
      const storedVol = localStorage.getItem('arcade_sound_volume');
      if (storedVol !== null) {
        this.volume = parseFloat(storedVol) || 0.5;
      }
    }
  }

  private initContext(): AudioContext | null {
    if (this.ctx) return this.ctx;
    if (typeof window === 'undefined') return null;
    const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) return null;
    this.ctx = new AudioContextClass();
    return this.ctx;
  }

  public getMuted(): boolean {
    return this.isMuted;
  }

  public setMuted(muted: boolean): void {
    this.isMuted = muted;
    if (typeof window !== 'undefined') {
      localStorage.setItem('arcade_sound_muted', String(muted));
    }
    if (!muted) {
      this.initContext();
      if (this.ctx && this.ctx.state === 'suspended') {
        this.ctx.resume();
      }
    }
  }

  public toggleMute(): boolean {
    this.setMuted(!this.isMuted);
    return this.isMuted;
  }

  public getVolume(): number {
    return this.volume;
  }

  public setVolume(vol: number): void {
    this.volume = Math.max(0, Math.min(1, vol));
    if (typeof window !== 'undefined') {
      localStorage.setItem('arcade_sound_volume', String(this.volume));
    }
  }

  /**
   * Short clock tick for last 5 seconds of countdown
   */
  public playTick(): void {
    if (this.isMuted) return;
    const ctx = this.initContext();
    if (!ctx) return;
    if (ctx.state === 'suspended') ctx.resume();

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(800, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(400, ctx.currentTime + 0.04);

    gain.gain.setValueAtTime(0.15 * this.volume, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.04);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start();
    osc.stop(ctx.currentTime + 0.045);
  }

  /**
   * Cheerful chime when player gets it correct
   */
  public playCorrect(): void {
    if (this.isMuted) return;
    this.vibrate(50);
    const ctx = this.initContext();
    if (!ctx) return;
    if (ctx.state === 'suspended') ctx.resume();

    const now = ctx.currentTime;
    const notes = [523.25, 659.25, 783.99, 1046.5]; // C5, E5, G5, C6 arpeggio

    notes.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, now + idx * 0.06);

      gain.gain.setValueAtTime(0.2 * this.volume, now + idx * 0.06);
      gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.06 + 0.2);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now + idx * 0.06);
      osc.stop(now + idx * 0.06 + 0.22);
    });
  }

  /**
   * Low buzz when answer or guess is incorrect
   */
  public playWrong(): void {
    if (this.isMuted) return;
    this.vibrate([40, 60, 40]);
    const ctx = this.initContext();
    if (!ctx) return;
    if (ctx.state === 'suspended') ctx.resume();

    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(140, now);
    osc.frequency.linearRampToValueAtTime(90, now + 0.25);

    gain.gain.setValueAtTime(0.25 * this.volume, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + 0.26);
  }

  /**
   * Reaction Duel GO beep
   */
  public playGo(): void {
    if (this.isMuted) return;
    this.vibrate(80);
    const ctx = this.initContext();
    if (!ctx) return;
    if (ctx.state === 'suspended') ctx.resume();

    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'square';
    osc.frequency.setValueAtTime(987.77, now); // B5 high punchy beep

    gain.gain.setValueAtTime(0.3 * this.volume, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + 0.19);
  }

  /**
   * Victory / Podium Fanfare
   */
  public playFanfare(): void {
    if (this.isMuted) return;
    this.vibrate([100, 50, 100, 50, 150]);
    const ctx = this.initContext();
    if (!ctx) return;
    if (ctx.state === 'suspended') ctx.resume();

    const now = ctx.currentTime;
    const chords = [
      { t: 0.00, f: [392.00, 493.88, 587.33] }, // G
      { t: 0.18, f: [392.00, 493.88, 587.33] }, // G
      { t: 0.36, f: [392.00, 493.88, 587.33] }, // G
      { t: 0.54, f: [523.25, 659.25, 783.99] }, // C maj high
    ];

    chords.forEach(({ t, f }) => {
      f.forEach((freq) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq, now + t);

        const dur = t > 0.5 ? 0.6 : 0.14;
        gain.gain.setValueAtTime(0.18 * this.volume, now + t);
        gain.gain.exponentialRampToValueAtTime(0.001, now + t + dur);

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.start(now + t);
        osc.stop(now + t + dur + 0.02);
      });
    });
  }

  private vibrate(pattern: number | number[]): void {
    if (typeof window !== 'undefined' && 'vibrate' in navigator) {
      try {
        navigator.vibrate(pattern);
      } catch {
        // Haptics ignore if restricted
      }
    }
  }
}

export const sound = new SoundEngine();

