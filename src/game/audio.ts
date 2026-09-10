/** Synthesized electric drivetrain, wind, and quiet surf. No third-party recordings. */
export class GameAudio {
  private ctx?: AudioContext; private master?: GainNode; private motor?: OscillatorNode; private motorGain?: GainNode;
  private harmonics?: OscillatorNode; private windGain?: GainNode; private windFilter?: BiquadFilterNode;
  muted = false;
  start(): void {
    if (this.ctx) { void this.ctx.resume(); return; }
    this.ctx = new AudioContext(); const ctx = this.ctx;
    this.master = ctx.createGain(); this.master.gain.value = this.muted ? 0 : .25; this.master.connect(ctx.destination);
    this.motor = ctx.createOscillator(); this.motor.type = 'sine'; this.motor.frequency.value = 70;
    this.harmonics = ctx.createOscillator(); this.harmonics.type = 'triangle'; this.harmonics.frequency.value = 140;
    this.motorGain = ctx.createGain(); this.motorGain.gain.value = 0; this.motor.connect(this.motorGain); this.harmonics.connect(this.motorGain); this.motorGain.connect(this.master); this.motor.start(); this.harmonics.start();
    const buffer = ctx.createBuffer(1, ctx.sampleRate * 3, ctx.sampleRate), data = buffer.getChannelData(0);
    let last = 0; for (let i = 0; i < data.length; i++) { last = (last + (Math.random() * 2 - 1) * .02) / 1.02; data[i] = last * 3; }
    const noise = ctx.createBufferSource(); noise.buffer = buffer; noise.loop = true;
    this.windFilter = ctx.createBiquadFilter(); this.windFilter.type = 'lowpass'; this.windFilter.frequency.value = 550;
    this.windGain = ctx.createGain(); this.windGain.gain.value = .08; noise.connect(this.windFilter); this.windFilter.connect(this.windGain); this.windGain.connect(this.master); noise.start();
  }
  toggle(): boolean { this.muted = !this.muted; if (this.master && this.ctx) this.master.gain.setTargetAtTime(this.muted ? 0 : .25, this.ctx.currentTime, .08); return this.muted; }
  update(speed: number, drift: boolean, running: boolean): void {
    if (!this.ctx || !this.motor || !this.motorGain || !this.harmonics || !this.windGain) return;
    const t = this.ctx.currentTime, s = Math.abs(speed);
    this.motor.frequency.setTargetAtTime(64 + s * 5, t, .12); this.harmonics.frequency.setTargetAtTime(130 + s * 10, t, .12);
    this.motorGain.gain.setTargetAtTime(running ? .025 + s * .002 : 0, t, .15); this.windGain.gain.setTargetAtTime(.09 + (running ? s * .008 + (drift ? .18 : 0) : 0), t, .15);
  }
  chime(high = false): void {
    if (!this.ctx || !this.master) return; const c = this.ctx, o = c.createOscillator(), g = c.createGain(); o.frequency.value = high ? 880 : 440; o.connect(g); g.connect(this.master); g.gain.setValueAtTime(.17, c.currentTime); g.gain.exponentialRampToValueAtTime(.001, c.currentTime + .25); o.start(); o.stop(c.currentTime + .3);
  }
  dispose(): void { void this.ctx?.close(); }
}
