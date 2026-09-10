import * as T from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { CoastTrack, ArcadeCar, LapTracker, damp, formatTime } from './track';
import { createWorld, World } from './world';
import { GameAudio } from './audio';

export type GameMode = 'trial' | 'free';
export type GamePhase = 'loading' | 'menu' | 'countdown' | 'driving' | 'paused' | 'finished' | 'error';
export interface GameState { phase: GamePhase; mode: GameMode; loading: number; speed: number; lap: number; time: string; lapTime: string; best: string; countdown: number; drift: number; boost: boolean; wrongWay: boolean; sector: string; laps: string[]; muted: boolean; progress: number; error: string; gamepad: boolean }
export const INITIAL_STATE: GameState = { phase: 'loading', mode: 'trial', loading: 0, speed: 0, lap: 1, time: '00:00.00', lapTime: '00:00.00', best: '—', countdown: 3, drift: 0, boost: false, wrongWay: false, sector: 'PORTO SOLE', laps: [], muted: false, progress: 0, error: '', gamepad: false };

export class DrivingGame {
  readonly track = new CoastTrack(); readonly car = new ArcadeCar(this.track); readonly laps = new LapTracker();
  state: GameState = { ...INITIAL_STATE }; readonly audio = new GameAudio();
  private readonly scene = new T.Scene(); private readonly camera = new T.PerspectiveCamera(51, 1, .1, 3500);
  private renderer!: T.WebGLRenderer; private composer!: EffectComposer; private world?: World;
  private keys = new Set<string>(); private frameId = 0; private previousTime = 0; private totalTime = 0;
  private raceTime = 0; private lapStartTime = 0; private countdownTime = 3; private lastCount = 3;
  private savedPhase: GamePhase = 'driving'; private bestLap: number | null = null; private hudTimer = 0;
  private cameraStyle = 0; private look = new T.Vector3(); private wheels: T.Object3D[] = [];
  private disposed = false; private gamepadPause = false; private gamepadReset = false;
  private readonly sparksGeo = new T.BufferGeometry(); private readonly sparksPos = new Float32Array(240 * 3);
  private readonly sparksLife = new Float32Array(240); private readonly sparksVelocity = new Float32Array(240 * 3);
  private sparkIndex = 0; private sparkMesh!: T.Points; private readonly resizeObserver: ResizeObserver;
  constructor(private host: HTMLElement, private mapCanvas: HTMLCanvasElement, private emit: (s: GameState) => void) {
    this.resizeObserver = new ResizeObserver(() => this.resize());
    try { const saved = Number(localStorage.getItem('saguinus.riviera.v1.best')); if (Number.isFinite(saved) && saved > 10) this.bestLap = saved; } catch { /* Storage can be disabled. */ }
    this.state.best = this.bestLap === null ? '—' : formatTime(this.bestLap);
    window.addEventListener('keydown', this.keyDown); window.addEventListener('keyup', this.keyUp); window.addEventListener('blur', this.onBlur); document.addEventListener('visibilitychange', this.visibility);
    void this.initialize();
  }
  private async initialize(): Promise<void> {
    try {
      this.renderer = new T.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2)); this.renderer.shadowMap.enabled = true; this.renderer.shadowMap.type = T.PCFShadowMap;
      this.renderer.toneMapping = T.ACESFilmicToneMapping; this.renderer.toneMappingExposure = 1.06;
      this.host.appendChild(this.renderer.domElement); this.renderer.domElement.setAttribute('aria-label', '3D coastal driving scene');
      this.renderer.domElement.addEventListener('webglcontextlost', this.contextLost);
      const target = new T.WebGLRenderTarget(1, 1, { type: T.HalfFloatType, samples: 4 });
      this.composer = new EffectComposer(this.renderer, target); this.composer.addPass(new RenderPass(this.scene, this.camera));
      this.composer.addPass(new UnrealBloomPass(new T.Vector2(1, 1), .24, .6, 1.2));
      this.composer.addPass(new ShaderPass({ uniforms: { tDiffuse: { value: null } }, vertexShader: 'varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}', fragmentShader: 'uniform sampler2D tDiffuse;varying vec2 vUv;void main(){vec4 c=texture2D(tDiffuse,vUv);vec2 p=vUv-.5;float vig=1.-dot(p,p)*.31;c.rgb*=vig;c.rgb=mix(vec3(dot(c.rgb,vec3(.2126,.7152,.0722))),c.rgb,1.06);gl_FragColor=c;}' }));
      this.composer.addPass(new OutputPass()); this.resizeObserver.observe(this.host); this.resize();
      this.world = await createWorld(this.scene, this.renderer, this.track, n => { this.state.loading = Math.round(n * 100); this.publish(); });
      if (this.disposed) { this.world.dispose(); return; }
      this.world.player.traverse(o => { if (/^Wheel_[FR][LR]$/.test(o.name)) this.wheels.push(o); });
      this.sparksPos.fill(-10000); this.sparksGeo.setAttribute('position', new T.BufferAttribute(this.sparksPos, 3));
      this.sparkMesh = new T.Points(this.sparksGeo, new T.PointsMaterial({ color: 0x66dfff, size: .115, transparent: true, opacity: .95, blending: T.AdditiveBlending, depthWrite: false })); this.sparkMesh.frustumCulled = false; this.scene.add(this.sparkMesh);
      this.state.phase = 'menu'; this.syncPlayer(); this.updateCamera(1, true); this.publish(); this.frameId = requestAnimationFrame(this.frame);
    } catch (error) {
      console.error(error); this.state.phase = 'error'; this.state.error = 'The coast could not load. Check that hardware acceleration is enabled, then reload the game.'; this.publish();
    }
  }
  start(mode: GameMode): void {
    if (!this.world) return; this.audio.start(); this.keys.clear(); this.car.reset(0); this.laps.reset(); this.raceTime = this.lapStartTime = 0; this.countdownTime = 3.5; this.lastCount = 4;
    this.state = { ...this.state, mode, phase: mode === 'trial' ? 'countdown' : 'driving', laps: [], lap: 1, time: '00:00.00', lapTime: '00:00.00', speed: 0, countdown: 3, wrongWay: false, boost: false, drift: 0 };
    this.syncPlayer(); this.updateCamera(1, true); this.publish();
  }
  pause(): void {
    if (this.state.phase === 'paused') { this.state.phase = this.savedPhase; this.audio.start(); }
    else if (this.state.phase === 'driving' || this.state.phase === 'countdown') { this.savedPhase = this.state.phase; this.state.phase = 'paused'; }
    this.keys.clear(); this.publish();
  }
  menu(): void { this.keys.clear(); this.state.phase = 'menu'; this.car.reset(0); this.state.speed = 0; this.publish(); }
  resetCar(): void { if (this.state.phase !== 'driving') return; this.car.reset(); this.laps.reposition(this.car.progress); this.syncPlayer(); this.updateCamera(1, true); }
  toggleAudio(): void { this.state.muted = this.audio.toggle(); this.publish(); }
  changeCamera(): void { this.cameraStyle = (this.cameraStyle + 1) % 2; }
  private publish(): void { this.emit({ ...this.state, laps: [...this.state.laps] }); }
  private keyDown = (e: KeyboardEvent): void => {
    if (e.target instanceof HTMLButtonElement && (e.code === 'Space' || e.code === 'Enter')) return;
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
    if (!e.repeat) {
      if (e.code === 'Escape' || e.code === 'KeyP') this.pause();
      if (e.code === 'KeyR') this.resetCar(); if (e.code === 'KeyC') this.changeCamera(); if (e.code === 'KeyM') this.toggleAudio();
    }
    this.keys.add(e.code);
  };
  private keyUp = (e: KeyboardEvent): void => { this.keys.delete(e.code); };
  private onBlur = (): void => { this.keys.clear(); if (this.state.phase === 'driving' || this.state.phase === 'countdown') this.pause(); };
  private visibility = (): void => { if (document.hidden) this.onBlur(); };
  private contextLost = (e: Event): void => { e.preventDefault(); this.state.phase = 'error'; this.state.error = 'The graphics connection was lost. Reload to return to the coast.'; this.publish(); };
  private resize(): void { if (!this.renderer) return; const w = this.host.clientWidth, h = this.host.clientHeight; if (!w || !h) return; this.camera.aspect = w / h; this.camera.updateProjectionMatrix(); this.renderer.setSize(w, h); this.composer?.setSize(w, h); }
  private frame = (time: number): void => {
    if (this.disposed) return; const dt = Math.min((time - (this.previousTime || time)) / 1000, .05); this.previousTime = time; this.totalTime += dt;
    this.tick(dt); this.composer.render(); this.frameId = requestAnimationFrame(this.frame);
  };
  private tick(dt: number): void {
    if (!this.world) return;
    const pads = navigator.getGamepads?.() ?? [], pad = Array.from(pads).find(p => p?.connected && p.mapping === 'standard'); this.state.gamepad = !!pad;
    if (pad) {
      if (pad.buttons[9]?.pressed && !this.gamepadPause) this.pause(); this.gamepadPause = !!pad.buttons[9]?.pressed;
      if (pad.buttons[3]?.pressed && !this.gamepadReset) this.resetCar(); this.gamepadReset = !!pad.buttons[3]?.pressed;
    }
    if (this.state.phase === 'countdown') {
      this.countdownTime -= dt; const count = Math.ceil(this.countdownTime); this.state.countdown = Math.min(3, Math.max(0, count));
      if (count !== this.lastCount) { this.lastCount = count; if (count <= 3) this.audio.chime(count <= 0); }
      if (this.countdownTime <= 0) this.state.phase = 'driving';
    }
    if (this.state.phase === 'driving') {
      const up = this.keys.has('KeyW') || this.keys.has('ArrowUp'), down = this.keys.has('KeyS') || this.keys.has('ArrowDown');
      const left = this.keys.has('KeyA') || this.keys.has('ArrowLeft'), right = this.keys.has('KeyD') || this.keys.has('ArrowRight');
      const axis = pad && Math.abs(pad.axes[0]) > .1 ? pad.axes[0] : 0;
      this.car.step({ throttle: Math.max(up ? 1 : 0, pad?.buttons[7]?.value ?? 0), brake: Math.max(down ? 1 : 0, pad?.buttons[6]?.value ?? 0), steer: left ? -1 : right ? 1 : axis, drift: this.keys.has('Space') || !!pad?.buttons[0]?.pressed }, dt);
      this.raceTime += dt;
      const tangent = this.track.tangent(this.car.progress), movingForward = this.car.speed > 0 && Math.sin(this.car.heading) * tangent.x + Math.cos(this.car.heading) * tangent.z > 0;
      if (this.state.mode === 'trial' && this.laps.sample(this.car.progress, movingForward)) {
        const lapTime = this.raceTime - this.lapStartTime; this.lapStartTime = this.raceTime; this.state.laps.push(formatTime(lapTime)); this.audio.chime(true);
        if (this.bestLap === null || lapTime < this.bestLap) { this.bestLap = lapTime; this.state.best = formatTime(lapTime); try { localStorage.setItem('saguinus.riviera.v1.best', String(lapTime)); } catch { /* Continue without persistence. */ } }
        if (this.laps.completed) { this.state.phase = 'finished'; this.keys.clear(); }
      }
    }
    this.syncPlayer(); this.updateCamera(dt);
    const animateWorld = this.state.phase !== 'paused';
    if (animateWorld) { this.world.water.uniforms['time'].value += dt; this.world.boats.forEach((b, i) => { b.rotation.z = Math.sin(this.totalTime * .55 + i) * .018; b.position.y = -1.05 + Math.sin(this.totalTime * .72 + i * 2) * .09; }); }
    const sunDirection = new T.Vector3(-.67, .17, .72).normalize(); this.world.sun.target.position.set(this.car.x, this.car.y, this.car.z); this.world.sun.position.copy(this.world.sun.target.position).addScaledVector(sunDirection, 170);
    this.updateSparks(animateWorld ? dt : 0); this.audio.update(this.car.speed, this.car.drifting, this.state.phase === 'driving');
    this.hudTimer += dt;
    if (this.hudTimer > .065) {
      this.hudTimer = 0; this.state.speed = Math.round(Math.abs(this.car.speed) * 3.6); this.state.lap = Math.min(3, this.laps.lap); this.state.time = formatTime(this.raceTime); this.state.lapTime = formatTime(this.raceTime - this.lapStartTime); this.state.drift = this.car.driftCharge / 2.4; this.state.boost = this.car.boostTime > 0; this.state.wrongWay = this.car.wrongWay; this.state.progress = this.car.progress;
      this.state.sector = this.car.progress < .2 || this.car.progress > .79 ? 'PORTO SOLE' : this.car.progress < .43 ? 'THE LIGHTHOUSE BEND' : this.car.progress < .7 ? 'CYPRESS HEIGHTS' : 'RIVIERA DESCENT'; this.drawMap(); this.publish();
    }
  }
  private syncPlayer(): void {
    if (!this.world) return; this.world.player.position.set(this.car.x, this.car.y, this.car.z); this.world.player.rotation.set(0, this.car.heading, this.car.steering * this.car.speed * .0008);
    const tangent = this.track.tangent(this.car.progress); this.world.player.rotation.x = -Math.asin(tangent.y);
    for (const wheel of this.wheels) { wheel.rotation.x = this.raceTime * this.car.speed / .53; if (wheel.name.includes('_F')) wheel.rotation.y = -this.car.steering * .3; }
  }
  private updateCamera(dt: number, instant = false): void {
    const p = new T.Vector3(this.car.x, this.car.y, this.car.z), target = p.clone(); let desired: T.Vector3;
    if (this.state.phase === 'menu') {
      const h = this.car.heading + .65 + Math.sin(this.totalTime * .06) * .13;
      desired = p.clone().add(new T.Vector3(Math.sin(h) * 12.3, 3.0, Math.cos(h) * 12.3)); target.y += 1.6;
      // Frame the roadster to the right of the game-native menu.
      const side = new T.Vector3(Math.cos(h), 0, -Math.sin(h)); target.addScaledVector(side, -3.3); this.camera.fov = 45;
    } else {
      const distance = this.cameraStyle === 0 ? 9.4 : 6.7, height = this.cameraStyle === 0 ? 4.2 : 2.65;
      desired = p.clone().add(new T.Vector3(-Math.sin(this.car.velocityHeading) * distance, height + this.car.speed * .017, -Math.cos(this.car.velocityHeading) * distance));
      target.add(new T.Vector3(Math.sin(this.car.velocityHeading) * 5, 1.1, Math.cos(this.car.velocityHeading) * 5));
      this.camera.fov = damp(this.camera.fov, 51 + this.car.speed * .18 + (this.car.boostTime > 0 ? 4 : 0), 3, dt);
    }
    if (instant) { this.camera.position.copy(desired); this.look.copy(target); } else { this.camera.position.lerp(desired, 1 - Math.exp(-5 * dt)); this.look.lerp(target, 1 - Math.exp(-7 * dt)); }
    this.camera.lookAt(this.look); this.camera.updateProjectionMatrix();
  }
  private updateSparks(dt: number): void {
    if (!this.sparkMesh) return; const active = this.state.phase === 'driving' && (this.car.drifting || this.car.boostTime > 0);
    (this.sparkMesh.material as T.PointsMaterial).color.set(this.car.driftCharge > 1.6 ? 0xffb252 : 0x65dcff);
    if (active && dt > 0) for (let i = 0; i < 4; i++) {
      const k = this.sparkIndex++ % 240, side = i % 2 ? 1 : -1, h = this.car.heading;
      this.sparksPos[k * 3] = this.car.x - Math.sin(h) * 1.55 + Math.cos(h) * side;
      this.sparksPos[k * 3 + 1] = this.car.y + .3; this.sparksPos[k * 3 + 2] = this.car.z - Math.cos(h) * 1.55 - Math.sin(h) * side;
      this.sparksVelocity[k * 3] = -Math.sin(h) * 3 + (Math.random() - .5) * 3; this.sparksVelocity[k * 3 + 1] = .5 + Math.random() * 1.7; this.sparksVelocity[k * 3 + 2] = -Math.cos(h) * 3 + (Math.random() - .5) * 3; this.sparksLife[k] = .45 + Math.random() * .3;
    }
    for (let k = 0; k < 240; k++) {
      if (this.sparksLife[k] > 0) { this.sparksLife[k] -= dt; for (let j = 0; j < 3; j++) this.sparksPos[k * 3 + j] += this.sparksVelocity[k * 3 + j] * dt; this.sparksVelocity[k * 3 + 1] -= dt * 5; }
      else this.sparksPos[k * 3 + 1] = -10000;
    }
    this.sparksGeo.attributes['position'].needsUpdate = true;
  }
  private drawMap(): void {
    const ctx = this.mapCanvas.getContext('2d'); if (!ctx) return; const w = this.mapCanvas.width, h = this.mapCanvas.height, scale = Math.min(w / 345, h / 290);
    ctx.clearRect(0, 0, w, h); ctx.lineJoin = ctx.lineCap = 'round'; ctx.beginPath();
    this.track.points.forEach((p, i) => { const x = w / 2 + p.x * scale, y = h / 2 + p.z * scale; i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y); }); ctx.closePath(); ctx.lineWidth = 12; ctx.strokeStyle = '#122d31aa'; ctx.stroke(); ctx.lineWidth = 4; ctx.strokeStyle = '#fffae0cc'; ctx.stroke();
    const s = this.track.point(0); ctx.fillStyle = '#efc285'; ctx.fillRect(w / 2 + s.x * scale - 4, h / 2 + s.z * scale - 4, 8, 8);
    ctx.save(); ctx.translate(w / 2 + this.car.x * scale, h / 2 + this.car.z * scale); ctx.rotate(-this.car.heading); ctx.beginPath(); ctx.moveTo(0, 10); ctx.lineTo(-6, -6); ctx.lineTo(6, -6); ctx.closePath(); ctx.fillStyle = '#ffbe79'; ctx.shadowColor = '#ffba79'; ctx.shadowBlur = 12; ctx.fill(); ctx.restore();
  }
  dispose(): void {
    this.disposed = true; cancelAnimationFrame(this.frameId); this.resizeObserver.disconnect(); window.removeEventListener('keydown', this.keyDown); window.removeEventListener('keyup', this.keyUp); window.removeEventListener('blur', this.onBlur); document.removeEventListener('visibilitychange', this.visibility);
    this.audio.dispose(); this.world?.dispose(); this.scene.traverse(o => { if (o instanceof T.Mesh || o instanceof T.Points) { o.geometry.dispose(); const materials = Array.isArray(o.material) ? o.material : [o.material]; materials.forEach(m => m.dispose()); } }); this.composer?.dispose(); this.renderer?.dispose(); this.renderer?.domElement.remove();
  }
}
