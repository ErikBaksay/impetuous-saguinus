import assert from 'node:assert/strict';
import test from 'node:test';
import { ArcadeCar, CoastTrack, LapTracker, angleDelta } from './track';

const input = (overrides: Partial<Parameters<ArcadeCar['step']>[0]> = {}) => ({
  throttle: 0,
  brake: 0,
  steer: 0,
  drift: false,
  ...overrides,
});

const stepMany = (car: ArcadeCar, count: number, values: Parameters<ArcadeCar['step']>[0]) => {
  for (let i = 0; i < count; i++) car.step(values, .05);
};

test('LapTracker requires ordered checkpoints before awarding a lap', () => {
  const tracker = new LapTracker();
  const completeLap = () => {
    for (const t of [.08, .16, .24, .26, .32, .4, .48, .51, .59, .67, .75, .76, .84, .92, .96]) {
      assert.equal(tracker.sample(t, true), false);
    }
    return tracker.sample(.02, true);
  };

  assert.equal(completeLap(), true);
  assert.equal(tracker.lap, 2);
  assert.equal(tracker.nextCheckpoint, 1);
  assert.equal(completeLap(), true);
  assert.equal(completeLap(), true);
  assert.equal(tracker.completed, true);
  assert.equal(tracker.sample(.1, true), false);
  assert.equal(tracker.lap, 4);
});

test('LapTracker ignores reverse crossings and reset restores the start state', () => {
  const tracker = new LapTracker();
  tracker.sample(.08, true);
  tracker.sample(.24, true);
  tracker.sample(.26, true);
  assert.equal(tracker.nextCheckpoint, 2);

  assert.equal(tracker.sample(.2, false), false);
  assert.equal(tracker.nextCheckpoint, 2);

  tracker.reposition(.96);
  assert.equal(tracker.sample(.02, false), false);
  assert.equal(tracker.lap, 1);
  assert.equal(tracker.nextCheckpoint, 2);

  tracker.reset();
  assert.equal(tracker.lap, 1);
  assert.equal(tracker.nextCheckpoint, 1);
  assert.equal(tracker.completed, false);
  assert.equal(tracker.sample(.96, false), false);
  assert.equal(tracker.sample(.02, false), false);
  assert.equal(tracker.lap, 1);
});

test('ArcadeCar accelerates and braking reduces speed', () => {
  const car = new ArcadeCar(new CoastTrack());
  car.step(input({ throttle: 1 }), .05);
  assert.ok(car.speed > 0);
  stepMany(car, 39, input({ throttle: 1 }));
  const cruisingSpeed = car.speed;
  assert.ok(cruisingSpeed > 8);

  stepMany(car, 8, input({ brake: 1 }));
  assert.ok(car.speed < cruisingSpeed);
});

test('ArcadeCar steering changes heading and releasing a charged drift starts boost', () => {
  const track = new CoastTrack();
  const steeringCar = new ArcadeCar(track);
  stepMany(steeringCar, 55, input({ throttle: 1 }));
  const initialHeading = steeringCar.heading;

  stepMany(steeringCar, 10, input({ throttle: 1, steer: 1 }));
  assert.ok(Math.abs(angleDelta(initialHeading, steeringCar.heading)) > .01);

  const driftCar = new ArcadeCar(track);
  stepMany(driftCar, 45, input({ throttle: 1 }));
  stepMany(driftCar, 20, input({ throttle: 1, steer: .5, drift: true }));
  assert.equal(driftCar.drifting, true);
  assert.ok(driftCar.driftCharge >= .65);
  driftCar.step(input({ throttle: 1, steer: .5, drift: false }), .05);
  assert.ok(driftCar.boostTime > 0);
});
