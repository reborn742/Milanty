
class AudioService {
  private ctx: AudioContext | null = null;
  private muted: boolean = false;

  private init() {
    if (!this.ctx) {
      this.ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  setMuted(muted: boolean) {
    this.muted = muted;
  }

  private createGain(duration: number, startVal: number = 0.1) {
    const gain = this.ctx!.createGain();
    gain.gain.setValueAtTime(startVal, this.ctx!.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, this.ctx!.currentTime + duration);
    return gain;
  }

  playPick() {
    if (this.muted) return;
    this.init();
    const osc = this.ctx!.createOscillator();
    const gain = this.createGain(0.2, 0.05);
    osc.type = 'sine';
    osc.frequency.setValueAtTime(880, this.ctx!.currentTime);
    osc.frequency.exponentialRampToValueAtTime(440, this.ctx!.currentTime + 0.1);
    osc.connect(gain).connect(this.ctx!.destination);
    osc.start();
    osc.stop(this.ctx!.currentTime + 0.2);
  }

  playPass() {
    if (this.muted) return;
    this.init();
    const noise = this.ctx!.createBufferSource();
    const bufferSize = this.ctx!.sampleRate * 0.15;
    const buffer = this.ctx!.createBuffer(1, bufferSize, this.ctx!.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;
    noise.buffer = buffer;

    const filter = this.ctx!.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(2000, this.ctx!.currentTime);
    filter.frequency.exponentialRampToValueAtTime(100, this.ctx!.currentTime + 0.15);

    const gain = this.createGain(0.15, 0.03);
    noise.connect(filter).connect(gain).connect(this.ctx!.destination);
    noise.start();
  }

  playMatch() {
    if (this.muted) return;
    this.init();
    const frequencies = [261.63, 329.63, 392.00, 523.25]; // C4, E4, G4, C5
    frequencies.forEach((f, i) => {
      const osc = this.ctx!.createOscillator();
      const gain = this.createGain(1.0, 0.04);
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(f, this.ctx!.currentTime + (i * 0.05));
      osc.connect(gain).connect(this.ctx!.destination);
      osc.start(this.ctx!.currentTime + (i * 0.05));
      osc.stop(this.ctx!.currentTime + 1.0);
    });
  }

  playRoundOver() {
    if (this.muted) return;
    this.init();
    
    // A beautiful Cmaj9 harmonic swell for a "mindblowing" feel
    const now = this.ctx!.currentTime;
    const chord = [130.81, 164.81, 196.00, 246.94, 293.66]; // C3, E3, G3, B3, D4
    const shimmerFreqs = [1046.50, 1318.51, 1567.98]; // Higher octaves for sparkle
    
    // Create a master gain for the whole effect
    const masterGain = this.ctx!.createGain();
    masterGain.gain.setValueAtTime(0, now);
    masterGain.gain.linearRampToValueAtTime(0.15, now + 0.2);
    masterGain.gain.exponentialRampToValueAtTime(0.0001, now + 3.0);
    masterGain.connect(this.ctx!.destination);

    // Warm chord layers
    chord.forEach((freq, i) => {
      const osc = this.ctx!.createOscillator();
      const oscGain = this.ctx!.createGain();
      
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now);
      
      // Slight detune for thickness
      osc.detune.setValueAtTime(Math.random() * 10 - 5, now);
      
      oscGain.gain.setValueAtTime(0, now);
      oscGain.gain.linearRampToValueAtTime(0.1, now + 0.1 + (i * 0.1));
      
      osc.connect(oscGain).connect(masterGain);
      osc.start(now);
      osc.stop(now + 3.0);
    });

    // Sparkling shimmer
    shimmerFreqs.forEach((freq, i) => {
      const shimmer = this.ctx!.createOscillator();
      const shimmerGain = this.ctx!.createGain();
      
      shimmer.type = 'sine';
      shimmer.frequency.setValueAtTime(freq, now);
      
      shimmerGain.gain.setValueAtTime(0, now);
      shimmerGain.gain.linearRampToValueAtTime(0.05, now + 0.5 + (i * 0.2));
      shimmerGain.gain.exponentialRampToValueAtTime(0.0001, now + 2.5);
      
      const panner = this.ctx!.createStereoPanner();
      panner.pan.setValueAtTime(i % 2 === 0 ? -0.5 : 0.5, now);
      
      shimmer.connect(shimmerGain).connect(panner).connect(masterGain);
      shimmer.start(now);
      shimmer.stop(now + 3.0);
    });

    // Deep sub foundation
    const sub = this.ctx!.createOscillator();
    sub.type = 'sine';
    sub.frequency.setValueAtTime(65.41, now); // C2
    const subGain = this.ctx!.createGain();
    subGain.gain.setValueAtTime(0, now);
    subGain.gain.linearRampToValueAtTime(0.2, now + 0.3);
    sub.connect(subGain).connect(masterGain);
    sub.start(now);
    sub.stop(now + 3.0);
  }
}

export const audioService = new AudioService();
