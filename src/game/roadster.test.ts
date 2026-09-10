import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { Box3, Mesh, MeshStandardMaterial, Raycaster, Vector3 } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

test('exported roadster satisfies the game model and wheel animation contract', async () => {
  const bytes = await readFile(new URL('../../public/models/saguinus-roadster.glb', import.meta.url));
  const { scene } = await new GLTFLoader().parseAsync(Uint8Array.from(bytes).buffer, '');
  scene.updateMatrixWorld(true);
  const near = (actual: number, expected: number) => assert.ok(Math.abs(actual - expected) < .002, `${actual} ≠ ${expected}`);
  const body = scene.getObjectByName('Body_Pearl');
  assert.ok(body, 'Pearl body is present');
  assert.ok(scene.getObjectByName('Driver_head'), 'Game driver is retained');
  const bodyBounds = new Box3().setFromObject(body);
  assert.ok(bodyBounds.max.y < 1.5, 'Body keeps the low roadster silhouette');
  assert.ok(bodyBounds.max.z > 2.5 && bodyBounds.min.z < -2.5, 'Length and forward axis are correct');
  near(new Box3().setFromObject(scene).min.y, 0);

  // Check exterior visibility, not just the presence of emissive materials:
  // a light can otherwise export successfully while buried in its housing.
  for (const [prefix, direction] of [['Headlight_ice_blue_lens', -1], ['Taillight_ruby_outline', 1]] as const) {
    const lamps: Mesh[] = [];
    scene.traverse(object => { if (object instanceof Mesh && object.name.startsWith(prefix)) lamps.push(object); });
    assert.equal(lamps.length, 2);
    for (const lamp of lamps) {
      const target = new Box3().setFromObject(lamp).getCenter(new Vector3());
      const origin = target.clone(); origin.z -= direction;
      const hit = new Raycaster(origin, new Vector3(0, 0, direction)).intersectObject(scene, true)[0];
      assert.ok(hit?.object.name.startsWith(prefix.split('_')[0]), `${lamp.name} is visible from outside`);
      const material = (hit.object as Mesh).material;
      assert.ok(material instanceof MeshStandardMaterial && material.emissive.r > 0, `${lamp.name} emits light`);
    }
  }

  for (const [tag, x, z] of [['FL', -1.185, 1.69], ['FR', 1.185, 1.69],
                            ['RL', -1.185, -1.69], ['RR', 1.185, -1.69]] as const) {
    const pivot = scene.getObjectByName(`Wheel_${tag}`);
    const spin = scene.getObjectByName(`WheelSpin_${tag}`);
    assert.ok(pivot && spin, `${tag} has separate steering and rolling nodes`);
    assert.equal(spin.parent, pivot);
    const center = pivot.getWorldPosition(new Vector3());
    near(center.x, x); near(center.y, .53); near(center.z, z);
    near(pivot.quaternion.x, 0); near(pivot.quaternion.y, 0); near(pivot.quaternion.z, 0);
    near(spin.position.length(), 0);
    const tire = scene.getObjectByName(`Tire_${tag}`);
    assert.ok(tire && tire.parent === spin, 'Tire rotates with its axle');
    const bounds = new Box3().setFromObject(tire);
    near(bounds.max.y, 1.059); near(bounds.min.y, .001);
    // Positive rotation around X moves the top of a rolling wheel toward +Z.
    spin.rotation.x = .1;
    assert.ok(new Vector3(0, .53, 0).applyQuaternion(spin.quaternion).z > 0);
  }

  let triangles = 0;
  scene.traverse(object => {
    assert.ok(!object.name.startsWith('Studio'), 'Studio setup is excluded');
    if (!(object instanceof Mesh)) return;
    const positions = object.geometry.getAttribute('position');
    assert.ok(Array.from(positions.array).every(Number.isFinite), `${object.name} has finite vertices`);
    triangles += (object.geometry.index?.count ?? positions.count) / 3;
  });
  assert.ok(triangles > 10000 && triangles < 120000, `Car and driver triangle budget: ${triangles}`);
});
