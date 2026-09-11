import { ArcadeCar, CoastTrack, DriveInput, LapTracker, ROAD_HALF_WIDTH, angleDelta, clamp, damp, formatTime, wrap } from './track';

export const RIVALS = [
  { id: 'luca', name: 'Luca', color: '#ef7966', pace: 27.5, lane: -2.7 },
  { id: 'ines', name: 'Inès', color: '#71c6dc', pace: 26.7, lane: 2.7 },
  { id: 'nico', name: 'Nico', color: '#edc65e', pace: 25.8, lane: -2.7 },
  { id: 'cleo', name: 'Cléo', color: '#b49add', pace: 25.1, lane: 2.7 },
  { id: 'rio', name: 'Rio', color: '#8fca99', pace: 24.4, lane: -2.7 },
] as const;
type DriverProfile = { id: string; name: string; color: string; pace: number; lane: number };
export interface RaceStanding { id: string; name: string; color: string; player: boolean; position: number; status: string }

export class RaceEntrant {
  distance = 0;
  finishTime: number | null = null;
  private previousProgress = 0;
  constructor(readonly car: ArcadeCar, readonly laps: LapTracker, readonly profile: DriverProfile, readonly player = false) {}

  reset(meters: number, lane: number): void {
    this.car.reset(meters / this.car.track.length);
    const normal = this.car.track.normal(this.car.progress);
    this.car.x += normal.x * lane; this.car.z += normal.z * lane;
    this.laps.reset(); this.laps.reposition(this.car.progress);
    this.distance = meters / this.car.track.length; this.previousProgress = this.car.progress; this.finishTime = null;
  }

  sample(time: number, dt: number): boolean {
    if (this.finishTime !== null) return false;
    const progress = this.car.progress, delta = wrap(progress - this.previousProgress + .5) - .5;
    // Unwrapped progress keeps reverse driving and the starting grid in the right order.
    if (Math.abs(delta) < .1) this.distance += delta;
    const tangent = this.car.track.tangent(progress);
    const forward = this.car.speed > 0 && Math.sin(this.car.velocityHeading) * tangent.x + Math.cos(this.car.velocityHeading) * tangent.z > 0;
    const crossed = this.laps.sample(progress, forward);
    if (this.laps.completed) {
      const fraction = delta > 0 ? clamp((1 - this.previousProgress) / delta, 0, 1) : 1;
      this.finishTime = time - dt + dt * fraction;
    }
    this.previousProgress = progress;
    return crossed;
  }
}

export class AiDriver extends RaceEntrant {
  wheelAngle = 0;
  private lane = 0;
  private stuckTime = 0;
  constructor(track: CoastTrack, profile: DriverProfile) { super(new ArcadeCar(track), new LapTracker(), profile); }

  override reset(meters: number, lane: number): void {
    super.reset(meters, lane); this.lane = lane; this.stuckTime = this.wheelAngle = 0;
  }

  input(traffic: readonly ArcadeCar[], dt: number): DriveInput {
    const car = this.car, track = car.track, normal = track.normal(car.progress), point = track.point(car.progress);
    const lateral = (car.x - point.x) * normal.x + (car.z - point.z) * normal.z;
    const nearby = traffic.filter(other => other !== car).map(other => ({
      car: other,
      ahead: (wrap(other.progress - car.progress + .5) - .5) * track.length,
      lateral: (other.x - point.x) * normal.x + (other.z - point.z) * normal.z,
    }));
    const blocker = nearby.filter(other => other.ahead > 0 && other.ahead < 18 && Math.abs(other.lateral - lateral) < 2.9)
      .sort((a, b) => a.ahead - b.ahead)[0];
    let desiredLane = this.profile.lane;
    if (blocker) {
      // Pick an unoccupied passing lane, including cars alongside and just behind.
      const passingLanes = [-3.3, 0, 3.3].filter(lane => Math.abs(lane - blocker.lateral) > 2.9 &&
        !nearby.some(other => other.ahead > -7 && other.ahead < 14 && Math.abs(other.lateral - lane) < 2.9));
      if (passingLanes.length) desiredLane = passingLanes.sort((a, b) => Math.abs(a - lateral) - Math.abs(b - lateral))[0];
      else desiredLane = this.lane;
    }
    // Do not merge back into another driver after passing.
    if (nearby.some(other => Math.abs(other.ahead) < 7 && Math.abs(other.lateral - desiredLane) < 2.9)) desiredLane = this.lane;
    this.lane = damp(this.lane, desiredLane, 1.5, dt);
    const lookAhead = 7 + car.speed * .52, targetProgress = car.progress + lookAhead / track.length;
    const target = track.point(targetProgress).addScaledVector(track.normal(targetProgress), this.lane);
    const error = angleDelta(car.heading, Math.atan2(target.x - car.x, target.z - car.z));
    const steer = clamp(-error * 2.5, -1, 1);
    const headingAt = (meters: number): number => { const tangent = track.tangent(car.progress + meters / track.length); return Math.atan2(tangent.x, tangent.z); };
    const curvature = Math.max(Math.abs(angleDelta(headingAt(0), headingAt(14))) / 14,
      Math.abs(angleDelta(headingAt(14), headingAt(30))) / 16);
    let targetSpeed = Math.min(this.finishTime === null ? this.profile.pace : 18, Math.sqrt(8 / Math.max(curvature, .001)));
    targetSpeed *= clamp(1 - Math.abs(error) * .32, .45, 1);
    if (blocker && blocker.ahead < 11 && Math.abs(blocker.lateral - this.lane) < 2.9) {
      targetSpeed = Math.min(targetSpeed, Math.max(0, blocker.car.speed + (blocker.ahead - 7) * 1.5));
    }
    const throttle = clamp((.013 * targetSpeed * targetSpeed + 1.5 + (targetSpeed - car.speed) * 3) / 13, 0, 1);
    return { throttle, brake: car.speed > targetSpeed + 1 ? clamp((car.speed - targetSpeed) * .15, 0, 1) : 0, steer, drift: false };
  }

  drive(input: DriveInput, dt: number): void {
    this.car.step(input, dt); this.wheelAngle = (this.wheelAngle + this.car.speed * dt / .53) % (Math.PI * 2);
    this.stuckTime = this.car.speed < 2 || this.car.wrongWay ? this.stuckTime + dt : 0;
    if (this.stuckTime > 4) {
      // Recover at the same course position, preserving checkpoints and race time.
      this.car.reset(); const normal = this.car.track.normal(this.car.progress);
      this.car.x += normal.x * this.lane; this.car.z += normal.z * this.lane;
      this.laps.reposition(this.car.progress); this.stuckTime = 0;
    }
  }
}

/** Two circles per roadster approximate its long body while leaving room to pass. */
export function resolveCarContacts(cars: readonly ArcadeCar[]): void {
  const radius = 1.22, axle = 1.25;
  for (let pass = 0; pass < 2; pass++) {
    for (let i = 0; i < cars.length; i++) for (let j = i + 1; j < cars.length; j++) {
      const a = cars[i], b = cars[j];
      if ((a.x - b.x) ** 2 + (a.z - b.z) ** 2 > 36) continue;
      for (const frontA of [-axle, axle]) for (const frontB of [-axle, axle]) {
        const dx = b.x + Math.sin(b.heading) * frontB - a.x - Math.sin(a.heading) * frontA;
        const dz = b.z + Math.cos(b.heading) * frontB - a.z - Math.cos(a.heading) * frontA;
        const distance = Math.hypot(dx, dz);
        if (distance >= radius * 2) continue;
        const nx = distance > .001 ? dx / distance : Math.cos(a.heading);
        const nz = distance > .001 ? dz / distance : -Math.sin(a.heading);
        const push = (radius * 2 - distance + .005) / 2;
        a.x -= nx * push; a.z -= nz * push; b.x += nx * push; b.z += nz * push;
        const directionA = Math.sin(a.velocityHeading) * nx + Math.cos(a.velocityHeading) * nz;
        const directionB = Math.sin(b.velocityHeading) * nx + Math.cos(b.velocityHeading) * nz;
        const closing = a.speed * directionA - b.speed * directionB;
        if (closing > 0) {
          const impulse = closing * .52;
          a.speed -= impulse * directionA; b.speed += impulse * directionB;
          a.hit = b.hit = .15; a.driftCharge = b.driftCharge = 0;
        }
      }
    }
  }
  for (const car of cars) {
    const road = car.track.nearest(car.x, car.z), edge = clamp(road.lateral, -ROAD_HALF_WIDTH + 1.3, ROAD_HALF_WIDTH - 1.3);
    if (edge !== road.lateral) { car.x = road.point.x + road.normal.x * edge; car.z = road.point.z + road.normal.z * edge; }
    car.progress = road.t;
  }
}

export class RaceField {
  readonly player: RaceEntrant;
  readonly opponents: AiDriver[];
  readonly entrants: RaceEntrant[];
  private readonly cars: ArcadeCar[];
  constructor(track: CoastTrack, player: ArcadeCar, laps: LapTracker) {
    this.player = new RaceEntrant(player, laps, { id: 'you', name: 'You', color: '#ffbe79', pace: 0, lane: 2.7 }, true);
    this.opponents = RIVALS.map(profile => new AiDriver(track, profile));
    this.entrants = [...this.opponents, this.player]; this.cars = this.entrants.map(entrant => entrant.car);
  }
  reset(): void {
    this.entrants.forEach((entrant, index) => entrant.reset(-6 - Math.floor(index / 2) * 7, index % 2 ? 2.7 : -2.7));
  }
  step(dt: number, time: number): boolean {
    const inputs = this.opponents.map(driver => driver.input(this.cars, dt));
    this.opponents.forEach((driver, i) => driver.drive(inputs[i], dt));
    resolveCarContacts(this.cars);
    let playerCrossed = false;
    for (const entrant of this.entrants) { const crossed = entrant.sample(time, dt); if (entrant.player) playerCrossed = crossed; }
    return playerCrossed;
  }
  standings(): RaceStanding[] {
    return [...this.entrants].sort((a, b) => {
      if (a.finishTime !== null || b.finishTime !== null) return (a.finishTime ?? Infinity) - (b.finishTime ?? Infinity);
      return b.distance - a.distance;
    }).map((entrant, index) => ({
      id: entrant.profile.id, name: entrant.profile.name, color: entrant.profile.color, player: entrant.player, position: index + 1,
      status: entrant.finishTime === null ? `LAP ${Math.min(3, entrant.laps.lap)} / 3` : formatTime(entrant.finishTime),
    }));
  }
}
