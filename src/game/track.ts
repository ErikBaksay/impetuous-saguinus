import { CatmullRomCurve3, Vector3 } from 'three';
export const ROAD_HALF_WIDTH = 6.5;
export const TRACK_SAMPLES = 1200;
export const wrap = (v: number, range = 1): number => ((v % range) + range) % range;
export const clamp = (v: number, min: number, max: number): number => Math.max(min, Math.min(max, v));
export const damp = (a: number, b: number, rate: number, dt: number): number => a + (b - a) * (1 - Math.exp(-rate * dt));
export const angleDelta = (a: number, b: number): number => wrap(b - a + Math.PI, Math.PI * 2) - Math.PI;
export class CoastTrack {
  readonly curve = new CatmullRomCurve3([
    new Vector3(0, 7, 106), new Vector3(70, 8, 97), new Vector3(133, 12, 48),
    new Vector3(147, 18, -18), new Vector3(109, 23, -81), new Vector3(42, 27, -113),
    new Vector3(-14, 25, -82), new Vector3(-79, 20, -108), new Vector3(-131, 13, -55),
    new Vector3(-140, 9, 10), new Vector3(-98, 7, 77), new Vector3(-45, 7, 109)
  ], true, 'catmullrom', .45);
  readonly length = this.curve.getLength();
  readonly points = this.curve.getSpacedPoints(TRACK_SAMPLES).slice(0, -1);
  point(t: number): Vector3 { return this.curve.getPointAt(wrap(t)); }
  tangent(t: number): Vector3 { return this.curve.getTangentAt(wrap(t)); }
  normal(t: number): Vector3 { const d = this.tangent(t); return new Vector3(d.z, 0, -d.x).normalize(); }
  nearest(x: number, z: number): { t: number; point: Vector3; normal: Vector3; distance: number; lateral: number } {
    let best = 0, distanceSq = Infinity;
    for (let i = 0; i < this.points.length; i++) {
      const p = this.points[i], d = (x - p.x) ** 2 + (z - p.z) ** 2;
      if (d < distanceSq) { distanceSq = d; best = i; }
    }
    const a = this.points[best], b = this.points[(best + 1) % this.points.length];
    const dx = b.x - a.x, dz = b.z - a.z;
    const f = clamp(((x - a.x) * dx + (z - a.z) * dz) / (dx * dx + dz * dz), -.5, 1);
    const t = wrap((best + f) / this.points.length), point = this.point(t), normal = this.normal(t);
    return { t, point, normal, distance: Math.sqrt(distanceSq), lateral: (x - point.x) * normal.x + (z - point.z) * normal.z };
  }
}
/** Ordered checkpoints prevent reversing over the line or resetting from awarding laps. */
export class LapTracker {
  lap = 1;
  nextCheckpoint = 1;
  completed = false;
  private previous = 0;
  reset(): void { this.lap = 1; this.nextCheckpoint = 1; this.completed = false; this.previous = 0; }
  sample(t: number, forward: boolean): boolean {
    let crossed = false;
    const progress = wrap(t - this.previous + .5) - .5;
    if (forward && progress >= 0 && progress < .1 && !this.completed) {
      const threshold = this.nextCheckpoint * .25;
      if (this.nextCheckpoint < 4 && this.previous < threshold && t >= threshold) this.nextCheckpoint++;
      if (this.nextCheckpoint === 4 && this.previous > .9 && t < .1) {
        crossed = true; this.nextCheckpoint = 1; this.lap++;
        if (this.lap > 3) this.completed = true;
      }
    }
    this.previous = t;
    return crossed;
  }
  reposition(t: number): void { this.previous = t; }
}
export interface DriveInput { throttle: number; brake: number; steer: number; drift: boolean }
export class ArcadeCar {
  x = 0; z = 0; y = 0; heading = 0; velocityHeading = 0; speed = 0; steering = 0;
  driftCharge = 0; boostTime = 0; drifting = false; progress = 0; hit = 0; wrongWay = false;
  private driftDirection = 0;
  constructor(readonly track: CoastTrack) { this.reset(0); }
  reset(t = this.progress): void {
    const p = this.track.point(t), d = this.track.tangent(t);
    this.x = p.x; this.y = p.y + .08; this.z = p.z;
    this.heading = this.velocityHeading = Math.atan2(d.x, d.z);
    this.speed = this.steering = this.driftCharge = this.boostTime = this.hit = 0;
    this.drifting = false; this.progress = wrap(t); this.wrongWay = false;
  }
  step(input: DriveInput, dt: number): void {
    dt = clamp(dt, 0, .05);
    this.hit = Math.max(0, this.hit - dt); this.boostTime = Math.max(0, this.boostTime - dt);
    this.steering = damp(this.steering, input.steer, 9, dt);
    const wasDrifting = this.drifting;
    this.drifting = input.drift && this.speed > 10 && (Math.abs(this.steering) > .15 || wasDrifting);
    if (this.drifting) {
      if (!wasDrifting) this.driftDirection = Math.sign(this.steering);
      this.driftCharge = Math.min(2.4, this.driftCharge + dt * (.4 + Math.abs(this.steering) * .6));
    } else {
      if (wasDrifting && !input.drift && this.driftCharge >= .65) this.boostTime = this.driftCharge > 1.6 ? 2.1 : 1.2;
      this.driftCharge = 0;
    }
    const boost = this.boostTime > 0;
    let acceleration = input.throttle * (boost ? 23 : 13) - .013 * this.speed * Math.abs(this.speed) - Math.sign(this.speed) * 1.5;
    if (input.brake > 0) acceleration -= this.speed > .5 ? 30 * input.brake : 9 * input.brake;
    if (boost) acceleration += 15;
    if (this.drifting) acceleration -= 1.4;
    this.speed = clamp(this.speed + acceleration * dt, -8, boost ? 48 : 34);
    if (!input.throttle && !input.brake && Math.abs(this.speed) < .12) this.speed = 0;
    const turning = this.steering * Math.min(Math.abs(this.speed) / 12, 1) * (1.2 - Math.min(Math.abs(this.speed) / 65, .52));
    this.heading -= turning * Math.sign(this.speed) * (this.drifting ? 1.45 : 1) * dt;
    const slip = this.drifting ? this.driftDirection * .27 : 0;
    this.velocityHeading += angleDelta(this.velocityHeading, this.heading + slip) * (1 - Math.exp(-(this.drifting ? 3 : 11) * dt));
    this.x += Math.sin(this.velocityHeading) * this.speed * dt;
    this.z += Math.cos(this.velocityHeading) * this.speed * dt;
    const road = this.track.nearest(this.x, this.z);
    this.progress = road.t; this.y = damp(this.y, road.point.y + .08, 18, dt);
    if (Math.abs(road.lateral) > ROAD_HALF_WIDTH - 1.15) {
      const edge = Math.sign(road.lateral) * (ROAD_HALF_WIDTH - 1.15);
      this.x = road.point.x + road.normal.x * edge; this.z = road.point.z + road.normal.z * edge;
      if (this.hit === 0) this.speed *= .64;
      this.hit = .25;
      const tangent = this.track.tangent(road.t), trackHeading = Math.atan2(tangent.x, tangent.z);
      const forwardHeading = Math.abs(angleDelta(this.heading, trackHeading)) < Math.PI / 2 ? trackHeading : trackHeading + Math.PI;
      this.velocityHeading += angleDelta(this.velocityHeading, forwardHeading) * (1 - Math.exp(-9 * dt));
      this.heading += angleDelta(this.heading, forwardHeading) * (1 - Math.exp(-3 * dt));
      this.driftCharge = 0; this.drifting = false;
    }
    const tangent = this.track.tangent(road.t);
    this.wrongWay = this.speed > 3 && Math.sin(this.heading) * tangent.x + Math.cos(this.heading) * tangent.z < -.25;
  }
}
export function formatTime(seconds: number): string {
  const ms = Math.max(0, Math.floor(seconds * 1000));
  return `${Math.floor(ms / 60000).toString().padStart(2, '0')}:${Math.floor(ms / 1000 % 60).toString().padStart(2, '0')}.${Math.floor(ms % 1000 / 10).toString().padStart(2, '0')}`;
}
