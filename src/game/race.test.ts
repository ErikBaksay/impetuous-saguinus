import assert from 'node:assert/strict';
import test from 'node:test';
import * as T from 'three';
import { DrivingGame, INITIAL_STATE } from './game';
import { ArcadeCar, CoastTrack, LapTracker, ROAD_HALF_WIDTH } from './track';
import { RaceField, resolveCarContacts } from './race';

const makeRace = () => {
  const track = new CoastTrack();
  return { track, field: new RaceField(track, new ArcadeCar(track), new LapTracker()) };
};

const aimCar = (car: ArcadeCar, progress: number, reverse = false): void => {
  const tangent = car.track.tangent(progress);
  const heading = Math.atan2(tangent.x, tangent.z) + (reverse ? Math.PI : 0);
  car.progress = progress;
  car.heading = car.velocityHeading = heading;
  car.speed = 20;
};

test('RaceField starts with a separated, in-bounds grid', () => {
  const { track, field } = makeRace();
  field.reset();

  for (const entrant of field.entrants) {
    const road = track.nearest(entrant.car.x, entrant.car.z);
    assert.ok(Math.abs(road.lateral) <= ROAD_HALF_WIDTH - 1.3 + 1e-5);
    assert.equal(entrant.car.speed, 0);
    assert.equal(entrant.finishTime, null);
  }
  for (let i = 0; i < field.entrants.length; i++) {
    for (let j = i + 1; j < field.entrants.length; j++) {
      const a = field.entrants[i].car, b = field.entrants[j].car;
      assert.ok(Math.hypot(a.x - b.x, a.z - b.z) > 2.5, `grid overlap: ${i}/${j}`);
    }
  }
});

for (const dt of [.05, 1 / 60]) {
  test(`all AI drivers complete ordered three-lap race at dt=${dt}`, () => {
    const { field } = makeRace();
    field.reset(); // The player is deliberately parked; RaceField.step drives AI only.
    let time = 0;
    const wrongWayRuns = Array(field.opponents.length).fill(0);
    const slowRuns = Array(field.opponents.length).fill(0);
    let maxWrongWay = 0, maxSlow = 0;

    for (let frame = 0; frame < 180 / dt; frame++) {
      field.step(dt, time);
      time += dt;
      field.opponents.forEach((driver, index) => {
        if (driver.finishTime === null && driver.car.wrongWay) wrongWayRuns[index] += dt;
        else wrongWayRuns[index] = 0;
        if (driver.finishTime === null && driver.car.speed < 2) slowRuns[index] += dt;
        else slowRuns[index] = 0;
        maxWrongWay = Math.max(maxWrongWay, wrongWayRuns[index]);
        maxSlow = Math.max(maxSlow, slowRuns[index]);
        assert.ok(Number.isFinite(driver.car.x + driver.car.z + driver.car.speed));
      });
      if (field.opponents.every(driver => driver.finishTime !== null)) break;
    }

    assert.ok(field.opponents.every(driver => driver.laps.completed), 'every AI completes three laps');
    assert.ok(field.opponents.every(driver => driver.laps.lap === 4));
    assert.ok(field.opponents.every(driver => driver.finishTime !== null && driver.finishTime < 180));
    assert.ok(maxWrongWay < 1, `AI wrong-way run lasted ${maxWrongWay}s`);
    assert.ok(maxSlow < 2, `AI slow/stuck run lasted ${maxSlow}s`);

    const finished = field.standings().filter(standing => standing.id !== 'you');
    const positions = finished.map(standing => field.opponents.find(driver => driver.profile.id === standing.id)!.finishTime!);
    assert.deepEqual(positions, [...positions].sort((a, b) => a - b));
  });
}

test('RaceField.reset clears progress, lap, finish, and vehicle state', () => {
  const { track, field } = makeRace();
  field.reset();
  for (let i = 0; i < 30; i++) field.step(.05, i * .05);

  field.entrants[0].finishTime = 12;
  field.entrants[0].distance = 99;
  field.entrants[0].laps.lap = 4;
  field.entrants[0].laps.nextCheckpoint = 4;
  field.entrants[0].laps.completed = true;
  field.opponents[0].wheelAngle = 2;
  field.reset();

  field.entrants.forEach((entrant, index) => {
    const meters = -6 - Math.floor(index / 2) * 7;
    assert.equal(entrant.finishTime, null);
    assert.equal(entrant.laps.lap, 1);
    assert.equal(entrant.laps.nextCheckpoint, 1);
    assert.equal(entrant.laps.completed, false);
    assert.ok(Math.abs(entrant.distance - meters / track.length) < 1e-10);
    assert.equal(entrant.car.speed, 0);
    assert.equal(entrant.car.wrongWay, false);
  });
  assert.equal(field.opponents[0].wheelAngle, 0);
});

test('RaceEntrant ordering keeps forward wrap ahead and reverse wrap behind', () => {
  const { track, field } = makeRace();
  field.reset();
  const wrapped = field.opponents[0];
  wrapped.reset(track.length * .99, -2.7);
  const beforeWrap = wrapped.distance;
  aimCar(wrapped.car, .01);
  assert.equal(wrapped.sample(10, .05), false);
  assert.ok(wrapped.distance > beforeWrap);
  assert.equal(wrapped.laps.lap, 1);

  const oneLapBehind = field.opponents[1];
  oneLapBehind.reset(track.length * .98, 2.7);
  const standings = field.standings();
  assert.ok(standings.find(standing => standing.id === wrapped.profile.id)!.position <
    standings.find(standing => standing.id === oneLapBehind.profile.id)!.position);

  const reverse = field.opponents[2];
  reverse.reset(track.length * .01, -2.7);
  const beforeReverse = reverse.distance;
  aimCar(reverse.car, .99, true);
  assert.equal(reverse.sample(10, .05), false);
  assert.ok(reverse.distance < beforeReverse);
  assert.equal(reverse.laps.lap, 1);
  assert.equal(reverse.laps.completed, false);
});

test('standings rank finished entrants by finish time', () => {
  const { field } = makeRace();
  field.reset();
  const early = field.opponents[0], late = field.opponents[1];
  early.distance = 0; late.distance = 10;
  early.finishTime = 42; late.finishTime = 41;
  const standings = field.standings();
  assert.equal(standings[0].id, late.profile.id);
  assert.equal(standings[1].id, early.profile.id);
  assert.equal(standings[0].status, '00:41.00');
});

test('resolveCarContacts separates cars, exchanges closing speed, and clamps road bounds', () => {
  const track = new CoastTrack();
  const faster = new ArcadeCar(track), slower = new ArcadeCar(track);
  faster.reset(.4); slower.reset(.4001);
  faster.speed = 20; slower.speed = 5;
  resolveCarContacts([faster, slower]);
  assert.ok(Math.hypot(faster.x - slower.x, faster.z - slower.z) >= 2.4);
  assert.ok(faster.speed < 20 && slower.speed > 5);
  for (const car of [faster, slower]) {
    assert.ok(Number.isFinite(car.x + car.z + car.speed));
    assert.ok(Math.abs(track.nearest(car.x, car.z).lateral) <= ROAD_HALF_WIDTH - 1.3 + 1e-4);
  }

  const edge = new ArcadeCar(track), point = track.point(.4), normal = track.normal(.4);
  edge.x = point.x + normal.x * 6; edge.z = point.z + normal.z * 6;
  resolveCarContacts([edge]);
  assert.ok(Math.abs(track.nearest(edge.x, edge.z).lateral) <= ROAD_HALF_WIDTH - 1.3 + 1e-4);
});

type BrowserlessGame = DrivingGame & Record<string, any>;

const makeBrowserlessGame = (): BrowserlessGame => {
  const track = new CoastTrack();
  const car = new ArcadeCar(track), laps = new LapTracker();
  const race = new RaceField(track, car, laps);
  const game = Object.create(DrivingGame.prototype) as BrowserlessGame;
  Object.assign(game, {
    track, car, laps, race, state: { ...INITIAL_STATE },
    audio: { start() {}, chime() {}, update() {}, toggle: () => false, dispose() {} },
    scene: new T.Scene(), camera: new T.PerspectiveCamera(51, 1, .1, 3500),
    world: { player: new T.Group(), water: { uniforms: { time: { value: 0 } } }, boats: [], sun: { target: new T.Object3D(), position: new T.Vector3() } },
    keys: new Set<string>(), rivalVisuals: race.opponents.map(() => ({ model: new T.Group(), pivots: [], spins: [] })),
    look: new T.Vector3(), wheelPivots: [], wheelSpins: [], mapCanvas: { getContext: () => null },
    emit: () => {}, totalTime: 0, raceTime: 0, lapStartTime: 0, countdownTime: 3, lastCount: 3,
    savedPhase: 'driving', hudTimer: 0, wheelAngle: 0, cameraStyle: 0, gamepadPause: false, gamepadReset: false,
  });
  return game;
};

const rivalSnapshot = (game: BrowserlessGame) => game.race.opponents.map((driver: any) => [
  driver.car.x, driver.car.z, driver.car.progress, driver.car.speed, driver.laps.lap, driver.distance,
]);

test('DrivingGame does not advance rivals during countdown or pause', () => {
  const game = makeBrowserlessGame();
  game.start('race');
  const beforeCountdown = rivalSnapshot(game);
  (game as any).tick(.2);
  assert.deepEqual(rivalSnapshot(game), beforeCountdown);

  (game as any).countdownTime = .01;
  (game as any).tick(.02);
  assert.equal(game.state.phase, 'driving');
  const afterDrive = rivalSnapshot(game);
  assert.notDeepEqual(afterDrive, beforeCountdown);

  game.pause();
  assert.equal(game.state.phase, 'paused');
  (game as any).tick(.5);
  assert.deepEqual(rivalSnapshot(game), afterDrive);
});

test('DrivingGame race restart resets racers and mode changes hide rivals', () => {
  const game = makeBrowserlessGame();
  game.start('race');
  (game as any).countdownTime = 0;
  (game as any).tick(.05);
  assert.ok(game.race.opponents.some((driver: any) => driver.car.speed > 0));
  assert.ok(game.rivalVisuals.every((visual: any) => visual.model.visible));

  game.start('race');
  assert.equal(game.state.phase, 'countdown');
  game.race.entrants.forEach((entrant: any, index: number) => {
    assert.equal(entrant.car.speed, 0);
    assert.equal(entrant.finishTime, null);
    assert.equal(entrant.laps.lap, 1);
    assert.ok(Math.abs(entrant.distance - (-6 - Math.floor(index / 2) * 7) / game.track.length) < 1e-10);
  });

  game.start('free');
  assert.ok(game.rivalVisuals.every((visual: any) => !visual.model.visible));
  game.start('trial');
  assert.ok(game.rivalVisuals.every((visual: any) => !visual.model.visible));
});

test('DrivingGame keeps race mode when the player finishes', () => {
  const game = makeBrowserlessGame();
  game.start('race');
  game.state.phase = 'driving';
  game.laps.completed = true;
  game.race.step = (() => true) as any;
  (game as any).tick(.05);
  assert.equal(game.state.phase, 'finished');
  assert.equal(game.state.mode, 'race');
  assert.ok(game.rivalVisuals.every((visual: any) => visual.model.visible));
});
