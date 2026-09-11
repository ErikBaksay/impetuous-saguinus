import * as T from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { CoastTrack, ROAD_HALF_WIDTH } from './track';

export interface World { player: T.Group; water: T.ShaderMaterial; sky: T.ShaderMaterial; sun: T.DirectionalLight; boats: T.Group[]; dispose: () => void }
const random = (() => { let seed = 1917; return () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; }; })();
const color = (hex: number) => new T.Color(hex);
const skyVertex = `varying vec3 vWorld; void main(){ vWorld=(modelMatrix*vec4(position,1.)).xyz; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }`;
const skyFragment = `
varying vec3 vWorld; uniform vec3 sunDirection;
float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);}
void main(){
 vec3 d=normalize(vWorld-cameraPosition);float h=max(d.y,0.);
 vec3 c=mix(vec3(1.2,.39,.21),vec3(.29,.29,.49),pow(h,.45));
 c=mix(c,vec3(1.2,.63,.31),exp(-abs(d.y-.06)*14.)*.48);
 float s=max(dot(d,sunDirection),0.);c+=vec3(1.,.46,.13)*pow(s,20.)*.62;
 c+=vec3(5.,3.5,1.4)*smoothstep(.9994,.99965,s);
 vec2 uv=d.xz/max(d.y+.18,.05)*2.;float clouds=noise(uv*2.)*.6+noise(uv*4.)*.25+noise(uv*8.)*.15;
 float band=smoothstep(.08,.2,d.y)*(1.-smoothstep(.3,.7,d.y));
 c=mix(c,vec3(1.15,.7,.51),smoothstep(.49,.67,clouds)*band*.65);
 gl_FragColor=vec4(c,1.);
}`;
const waterVertex = `uniform float time;varying vec3 vWorld;void main(){ vec3 p=position; p.z+=sin(p.x*.075+time*.6)*.08+sin(p.y*.105+time*.8)*.055;vec4 w=modelMatrix*vec4(p,1.);vWorld=w.xyz;gl_Position=projectionMatrix*viewMatrix*w; }`;
const waterFragment = `
uniform float time;uniform vec3 sunDirection;varying vec3 vWorld;
void main(){vec2 p=vWorld.xz;
 vec3 n=normalize(vec3(cos(p.x*.075+time*.6)*.006+cos(p.x*.7+p.y*.38+time)*.045,1.,cos(p.y*.105+time*.8)*.006+sin(p.y*.59-p.x*.31+time*1.2)*.037));
 vec3 v=normalize(cameraPosition-vWorld);float fres=pow(1.-max(dot(n,v),0.),3.);
 vec3 c=mix(vec3(.012,.16,.23),vec3(.39,.41,.49),fres);
 float spec=pow(max(dot(reflect(-sunDirection,n),v),0.),210.);
 c+=vec3(2.8,1.4,.44)*spec;
 float streak=pow(max(dot(reflect(-sunDirection,n),v),0.),24.);
 c+=vec3(.44,.21,.05)*streak;
 float ripple=sin(p.x*.8+p.y*.6+time)*sin(p.y*.95-time*.8);
 c+=vec3(.065,.10,.1)*smoothstep(.72,1.,ripple)*(.35+.65*fres);
 float fog=1.-exp(-length(cameraPosition-vWorld)*.0008);c=mix(c,vec3(.79,.54,.41),fog*.65);
 gl_FragColor=vec4(c,1.);
}`;

function noiseTexture(): T.DataTexture {
  const n = 256, data = new Uint8Array(n * n * 4);
  for (let i = 0; i < n * n; i++) {
    const v = 112 + random() * 52; data[i * 4] = v; data[i * 4 + 1] = v; data[i * 4 + 2] = v; data[i * 4 + 3] = 255;
  }
  const t = new T.DataTexture(data, n, n); t.wrapS = t.wrapT = T.RepeatWrapping; t.repeat.set(9, 220); t.needsUpdate = true; t.magFilter = T.LinearFilter; t.minFilter = T.LinearMipmapLinearFilter; t.generateMipmaps = true; return t;
}

function ribbon(track: CoastTrack, offsets: number[], heights: number[], material: T.Material, start = 0, end = 1, samples = 1100): T.Mesh {
  const vertices: number[] = [], uv: number[] = [], indices: number[] = [];
  for (let i = 0; i <= samples; i++) {
    const t = start + (end - start) * i / samples, p = track.point(t), n = track.normal(t);
    for (let k = 0; k < offsets.length; k++) {
      vertices.push(p.x + n.x * offsets[k], p.y + heights[k], p.z + n.z * offsets[k]); uv.push(k / (offsets.length - 1), i / samples);
      if (i < samples && k < offsets.length - 1) { const a = i * offsets.length + k, b = a + offsets.length; indices.push(a, b, a + 1, a + 1, b, b + 1); }
    }
  }
  const g = new T.BufferGeometry(); g.setAttribute('position', new T.Float32BufferAttribute(vertices, 3)); g.setAttribute('uv', new T.Float32BufferAttribute(uv, 2)); g.setIndex(indices); g.computeVertexNormals();
  const mesh = new T.Mesh(g, material); mesh.receiveShadow = true; return mesh;
}

function island(track: CoastTrack): T.Mesh {
  const vertices: number[] = [], colors: number[] = [], indices: number[] = [];
  const segments = 320, rings = 17, green = color(0x72714a), sand = color(0xc6ad7b);
  for (let i = 0; i <= segments; i++) {
    const t = i / segments, p = track.point(t), n = track.normal(t), edge = p.clone().addScaledVector(n, 8.4);
    for (let j = 0; j <= rings; j++) {
      const f = j / rings, x = edge.x * (1 - f), z = edge.z * (1 - f) - 10 * f;
      const hills = Math.sin(x * .053) * Math.cos(z * .039) * 5 + Math.sin(x * .093 + z * .06) * 2;
      const y = p.y - .22 + Math.sin(f * Math.PI / 2) * (14 + hills) + (18 - p.y) * f;
      vertices.push(x, y, z);
      const c = sand.clone().lerp(green, Math.min(1, f * 5 + random() * .2)); c.multiplyScalar(.9 + random() * .16); colors.push(c.r, c.g, c.b);
      if (i < segments && j < rings) { const a = i * (rings + 1) + j, b = a + rings + 1; indices.push(a, b, a + 1, a + 1, b, b + 1); }
    }
  }
  const g = new T.BufferGeometry(); g.setAttribute('position', new T.Float32BufferAttribute(vertices, 3)); g.setAttribute('color', new T.Float32BufferAttribute(colors, 3)); g.setIndex(indices); g.computeVertexNormals();
  const m = new T.Mesh(g, new T.MeshStandardMaterial({ vertexColors: true, roughness: .96, side: T.DoubleSide })); m.receiveShadow = true; return m;
}

interface Placement { p: T.Vector3; yaw?: number; scale?: number | T.Vector3; tint?: T.Color }
function instanceAsset(scene: T.Scene, model: T.Group, placements: Placement[], castShadow = true, name = model.name): T.InstancedMesh[] {
  if (!placements.length) return [];
  const pieces = new Map<T.Material, T.BufferGeometry[]>();
  model.updateMatrixWorld(true);
  model.traverse(o => {
    if (!(o instanceof T.Mesh)) return;
    const g = o.geometry.clone().applyMatrix4(o.matrixWorld);
    for (const key of Object.keys(g.attributes)) if (key !== 'position' && key !== 'normal' && key !== 'color') g.deleteAttribute(key);
    const geometry = g.index ? g.toNonIndexed() : g;
    const m = Array.isArray(o.material) ? o.material[0] : o.material;
    if (!pieces.has(m)) pieces.set(m, []); pieces.get(m)!.push(geometry);
  });
  const dummy = new T.Object3D(), meshes: T.InstancedMesh[] = [];
  for (const [material, geometries] of pieces) {
    const geometry = mergeGeometries(geometries)!;
    const instances = new T.InstancedMesh(geometry, material, placements.length);
    instances.name = `${name}/${material.name || meshes.length}`;
    placements.forEach((p, i) => {
      dummy.position.copy(p.p); dummy.rotation.set(0, p.yaw ?? 0, 0); typeof p.scale === 'object' ? dummy.scale.copy(p.scale) : dummy.scale.setScalar(p.scale ?? 1); dummy.updateMatrix(); instances.setMatrixAt(i, dummy.matrix);
      if (p.tint) instances.setColorAt(i, p.tint);
    });
    instances.castShadow = castShadow; instances.receiveShadow = true; instances.computeBoundingSphere(); scene.add(instances); meshes.push(instances);
    geometries.forEach(g => g.dispose());
  }
  return meshes;
}

export async function createWorld(scene: T.Scene, renderer: T.WebGLRenderer, track: CoastTrack, progress: (n: number) => void): Promise<World> {
  const sunDirection = new T.Vector3(-.67, .17, .72).normalize();
  const skyMaterial = new T.ShaderMaterial({ uniforms: { sunDirection: { value: sunDirection } }, vertexShader: skyVertex, fragmentShader: skyFragment, side: T.BackSide, depthWrite: false });
  const sky = new T.Mesh(new T.SphereGeometry(2800, 48, 24), skyMaterial); scene.add(sky);
  scene.fog = new T.FogExp2(0xd9a58b, .00165);
  scene.add(new T.HemisphereLight(0xffe9d0, 0x576c65, 1.25));
  const sun = new T.DirectionalLight(0xffc18c, 3.0); sun.position.copy(sunDirection).multiplyScalar(170); sun.castShadow = true;
  sun.shadow.mapSize.set(4096, 4096); Object.assign(sun.shadow.camera, { left: -65, right: 65, top: 65, bottom: -65, near: 1, far: 360 }); sun.shadow.bias = -.00016; sun.shadow.normalBias = .035; sun.shadow.radius = 3; scene.add(sun, sun.target);
  const fill = new T.DirectionalLight(0x9cc4d6, .65); fill.position.set(-100, 60, -80); scene.add(fill);
  const environment = new T.Scene(); environment.add(sky.clone());
  const pmrem = new T.PMREMGenerator(renderer); const env = pmrem.fromScene(environment, .025, .1, 4000); scene.environment = env.texture; scene.environmentIntensity = .48; pmrem.dispose();
  const water = new T.ShaderMaterial({ uniforms: { time: { value: 0 }, sunDirection: { value: sunDirection } }, vertexShader: waterVertex, fragmentShader: waterFragment });
  const sea = new T.Mesh(new T.PlaneGeometry(5000, 5000, 220, 220), water); sea.rotation.x = -Math.PI / 2; sea.position.y = -1.3; scene.add(sea);
  const islandGround = island(track); islandGround.name = 'island-ground'; scene.add(islandGround);
  const rockMat = new T.MeshStandardMaterial({ color: 0xb6a085, roughness: 1, side: T.DoubleSide });
  const coastalGround = ribbon(track, [-35, -24, -14, -8.2], [-28, -12, -1, -.18], rockMat); coastalGround.name = 'coastal-ground'; scene.add(coastalGround);
  const asphalt = new T.MeshStandardMaterial({ color: 0x6c7274, roughness: .84, map: noiseTexture(), side: T.DoubleSide });
  scene.add(ribbon(track, [-ROAD_HALF_WIDTH, ROAD_HALF_WIDTH], [0, 0], asphalt));
  const curbMat = new T.MeshStandardMaterial({ color: 0xdbccae, roughness: .9, side: T.DoubleSide });
  scene.add(ribbon(track, [-8.25, -6.5], [-.04, .025], curbMat)); scene.add(ribbon(track, [6.5, 8.4], [.025, -.04], curbMat));
  const line = new T.MeshStandardMaterial({ color: 0xf2d99a, roughness: .8, side: T.DoubleSide });
  scene.add(ribbon(track, [-6.02, -5.88], [.035, .035], line)); scene.add(ribbon(track, [5.88, 6.02], [.035, .035], line));
  const centerLine = new T.MeshStandardMaterial({ color: 0xe5b453, roughness: .8, side: T.DoubleSide });
  for (let i = 0; i < 100; i++) scene.add(ribbon(track, [-.075, .075], [.039, .039], centerLine, i / 100, i / 100 + .004, 6));
  // Start/finish checker tiles stay flush with the asphalt.
  const start = track.point(0), normal = track.normal(0), tangent = track.tangent(0);
  const checker = new T.InstancedMesh(new T.PlaneGeometry(.81, .72), new T.MeshStandardMaterial({ color: 0xffffff, side: T.DoubleSide }), 32);
  const dummy = new T.Object3D();
  for (let row = 0; row < 2; row++) for (let col = 0; col < 16; col++) {
    const i = row * 16 + col; dummy.position.copy(start).addScaledVector(normal, (col - 7.5) * .81).addScaledVector(tangent, row * .72 + 2.7); dummy.position.y += .055; dummy.rotation.set(-Math.PI / 2, 0, -Math.atan2(tangent.x, tangent.z)); dummy.updateMatrix(); checker.setMatrixAt(i, dummy.matrix); checker.setColorAt(i, color((row + col) % 2 ? 0x343f3e : 0xe5dec5));
  }
  scene.add(checker);
  const loader = new GLTFLoader(), names = ['saguinus-roadster', 'palm', 'villa', 'cypress', 'cliff', 'lighthouse', 'sailboat', 'wall', 'flower-urn', 'coastal-shrub', 'bougainvillea', 'flowering-vine', 'coastal-grass', 'olive-tree'];
  let loaded = 0;
  const models = await Promise.all(names.map(async name => { const gltf = await loader.loadAsync(new URL(`models/${name}.glb`, document.baseURI).href); progress(++loaded / names.length); return gltf.scene; }));
  const [player, palm, villa, cypress, cliff, lighthouse, sailboat, wall, urn, shrub, bougainvillea, floweringVine, grass, olive] = models;
  // Replace the villa's original sphere-cluster flowers with the detailed garden kit.
  const oldVillaFlowers: T.Object3D[] = [];
  villa.traverse(o => { if (o instanceof T.Mesh && /^(Bougainvillea_leaves|Flower_cluster)/.test(o.name)) oldVillaFlowers.push(o); });
  oldVillaFlowers.forEach(o => o.removeFromParent());
  player.traverse(o => { if (o instanceof T.Mesh) { o.castShadow = true; o.receiveShadow = true; } }); scene.add(player);
  const palms: Placement[] = [], villas: Placement[] = [], trees: Placement[] = [], cliffs: Placement[] = [], walls: Placement[] = [], urns: Placement[] = [];
  for (let i = 0; i < 260; i++) {
    const t = i / 260, p = track.point(t), n = track.normal(t), d = track.tangent(t);
    walls.push({ p: p.clone().addScaledVector(n, -7.62), yaw: Math.atan2(d.x, d.z) + Math.PI / 2, scale: new T.Vector3(track.length / 260 / 3, 1, 1) });
    if (i % 3 === 0) { const c = p.clone().addScaledVector(n, -18); const sy = 2.2 + p.y / 18; c.y -= 4.9 * sy + 1; cliffs.push({ p: c, yaw: random() * 6.28, scale: new T.Vector3(2.1, sy, 2.5) }); }
    if (i % 7 === 0) { const a = p.clone().addScaledVector(n, 9.8); palms.push({ p: a, yaw: random() * 6.28, scale: 1.05 + random() * .4 }); }
    if (i % 13 === 0 && (t < .25 || t > .79)) { const a = p.clone().addScaledVector(n, -9.1); a.y -= .25; palms.push({ p: a, yaw: random() * 6.28, scale: .95 + random() * .4 }); }
  }
  for (let i = 0; i < 34; i++) {
    const t = .73 + i / 34 * .47, p = track.point(t), n = track.normal(t), d = track.tangent(t);
    const a = p.clone().addScaledVector(n, 14.2 + random() * 2); a.y -= .12;
    villas.push({ p: a, yaw: Math.atan2(-n.x, -n.z), scale: new T.Vector3(1 + random() * .3, .85 + random() * .62, 1), tint: new T.Color().setHSL(.08 + random() * .05, .05 + random() * .2, .79 + random() * .2) });
    urns.push({ p: p.clone().addScaledVector(n, 7.2), scale: 1.2 });
    trees.push({ p: a.clone().addScaledVector(d, 4.5), scale: 1.1 + random() * .6 });
    if (i % 3 === 0) { const upper = a.clone().addScaledVector(n, 14); upper.y += 5; villas.push({ p: upper, yaw: Math.atan2(-n.x, -n.z), scale: 1 + random() * .3 }); }
  }
  for (let i = 0; i < 95; i++) {
    const t = random(), p = track.point(t), n = track.normal(t); const inset = 14 + random() * 18; p.addScaledVector(n, inset); p.y += (inset - 8) * .17;
    trees.push({ p, yaw: random() * 6.28, scale: .9 + random() * 1.1 });
  }
  // Vegetation has its own seed so adding garden details cannot move villas or boats.
  let vegetationSeed = 84179;
  const plantRandom = () => { vegetationSeed = (vegetationSeed * 1664525 + 1013904223) >>> 0; return vegetationSeed / 4294967296; };
  const groundSurfaces: T.Object3D[] = [islandGround, coastalGround];
  groundSurfaces.forEach(surface => surface.updateMatrixWorld(true));
  const groundRay = new T.Raycaster(new T.Vector3(), new T.Vector3(0, -1, 0), 0, 400);
  const groundPlant = (p: T.Vector3, surfaces = groundSurfaces): boolean => {
    groundRay.ray.origin.set(p.x, 200, p.z);
    const hit = groundRay.intersectObjects(surfaces, false)[0];
    if (!hit || hit.point.y < -1) return false;
    p.y = hit.point.y; return true;
  };
  const villaScale = (v: Placement) => v.scale instanceof T.Vector3 ? v.scale : new T.Vector3().setScalar(v.scale ?? 1);
  const inVillaGarden = (p: T.Vector3, radius: number) => villas.some(v => {
    const yaw = v.yaw ?? 0, dx = p.x - v.p.x, dz = p.z - v.p.z, s = villaScale(v);
    return Math.abs(Math.cos(yaw) * dx - Math.sin(yaw) * dz) < 3.3 * s.x + radius
      && Math.abs(Math.sin(yaw) * dx + Math.cos(yaw) * dz) < 2.9 * s.z + radius;
  });
  const shrubs: Placement[] = [], flowers: Placement[] = [], grasses: Placement[] = [], olives: Placement[] = [], vines: Placement[] = [];
  const addPlant = (placements: Placement[], p: T.Vector3, scale: number, radius: number, surfaces = groundSurfaces, avoidVillas = true) => {
    if (Math.abs(track.nearest(p.x, p.z).lateral) < ROAD_HALF_WIDTH + radius * scale + .45
      || (avoidVillas && inVillaGarden(p, radius * scale)) || !groundPlant(p, surfaces)) return;
    placements.push({ p, yaw: plantRandom() * Math.PI * 2, scale, tint: new T.Color().setHSL(.12, .05 + plantRandom() * .09, .83 + plantRandom() * .15) });
  };
  // Ground the replacement trees and stagger their trunks within the existing verge.
  for (const placement of palms) {
    const road = track.nearest(placement.p.x, placement.p.z);
    placement.p.addScaledVector(track.tangent(road.t), (plantRandom() - .5) * 4);
    if (road.lateral > 0) placement.p.addScaledVector(road.normal, plantRandom() * 2);
    groundPlant(placement.p);
  }
  trees.forEach(placement => groundPlant(placement.p));
  // Low planting follows the inside curb, with flower-rich pockets around the village.
  for (let i = 0; i < 240; i++) {
    const t = (i + plantRandom() * .8) / 240, p = track.point(t), n = track.normal(t), d = track.tangent(t);
    const village = t < .23 || t > .72;
    addPlant(shrubs, p.clone().addScaledVector(n, 9.35 + plantRandom() * 1.3), .82 + plantRandom() * .35, 1.15);
    if (i % 2 === 0) addPlant(grasses, p.clone().addScaledVector(n, 8.85 + plantRandom() * .75).addScaledVector(d, 1.1), .7 + plantRandom() * .3, .55);
    if (village ? i % 3 !== 2 : i % 9 === 0) addPlant(flowers, p.clone().addScaledVector(n, 9.2 + plantRandom() * .75).addScaledVector(d, -1.2), .8 + plantRandom() * .25, 1.25);
    if (i % 16 === 0) addPlant(palms, p.clone().addScaledVector(n, 12.5 + plantRandom() * 3).addScaledVector(d, 3), .86 + plantRandom() * .25, .55);
  }
  // Keep the sea visible above a broken ribbon of shrubs and wall-spilling blossoms.
  for (let i = 0; i < 90; i++) {
    const t = (i + plantRandom() * .8) / 90, p = track.point(t), n = track.normal(t), d = track.tangent(t);
    addPlant(shrubs, p.clone().addScaledVector(n, -10.1 - plantRandom() * 2.5), .62 + plantRandom() * .35, 1.15);
    if (i % 2 === 0) addPlant(grasses, p.clone().addScaledVector(n, -9.4).addScaledVector(d, 1.4), .65 + plantRandom() * .25, .55);
    if (i % 3 === 0 && (t < .27 || t > .7)) addPlant(flowers, p.clone().addScaledVector(n, -8.8).addScaledVector(d, -.9), .78 + plantRandom() * .22, 1.25);
  }
  // Vine anchors use the same rotation and scale as their villa's front/side walls.
  const up = new T.Vector3(0, 1, 0);
  villas.forEach((v, i) => {
    const s = villaScale(v), yaw = v.yaw ?? 0, side = i % 2 ? -1 : 1;
    const localPoint = (x: number, z: number) => new T.Vector3(x * s.x, 0, z * s.z).applyAxisAngle(up, yaw).add(v.p);
    addPlant(flowers, localPoint(side * 3.85, 4.1), .84 + plantRandom() * .3, 1.25);
    addPlant(shrubs, localPoint(-side * 4.5, .8), .8 + plantRandom() * .35, 1.15);
    const attachVine = (x: number, z: number, turn: number) => {
      const p = localPoint(x, z);
      if (!groundPlant(p)) return;
      const height = v.p.y + 6.25 * s.y - p.y;
      if (height < 1.8) return;
      vines.push({ p, yaw: yaw + turn, scale: new T.Vector3(.8 * s.x, Math.min(1.5, height / 4.7), 1) });
    };
    attachVine(-2.4, 2.6, 0);
    if (i % 2 === 0) attachVine(3.12, -.7, Math.PI / 2);
  });
  // Irregular olive groves break up the inland slopes without filling the sea horizon.
  for (let i = 0; i < 36; i++) {
    const t = (i + plantRandom() * .85) / 36, p = track.point(t), n = track.normal(t), d = track.tangent(t);
    p.addScaledVector(n, 25 + plantRandom() * 42);
    addPlant(olives, p, .8 + plantRandom() * .35, 2.1);
    addPlant(shrubs, p.clone().addScaledVector(d, 2.5).addScaledVector(n, 1.5), .95 + plantRandom() * .35, 1.15);
    addPlant(grasses, p.clone().addScaledVector(d, -2), .85 + plantRandom() * .3, .55);
  }
  instanceAsset(scene, palm, palms, true, 'vegetation/palm'); instanceAsset(scene, villa, villas); instanceAsset(scene, cypress, trees, true, 'vegetation/cypress'); instanceAsset(scene, cliff, cliffs, false); instanceAsset(scene, wall, walls); instanceAsset(scene, urn, urns);
  // A separate lighthouse promontory across the bay.
  const lighthouseP = new T.Vector3(206, 9, 152);
  const promontoryGround = instanceAsset(scene, cliff, [{ p: new T.Vector3(205, -4, 154), scale: new T.Vector3(8, 4, 7) }], false, 'lighthouse-cliff');
  instanceAsset(scene, lighthouse, [{ p: lighthouseP, scale: 1.5 }, { p: new T.Vector3(-112, 9, 182), scale: 1.5 }]);
  const westPromontoryGround = instanceAsset(scene, cliff, [{ p: new T.Vector3(-112, -4, 182), scale: new T.Vector3(7, 4, 6) }], false, 'west-lighthouse-cliff');
  instanceAsset(scene, villa, [{ p: new T.Vector3(-99, 8, 184), scale: .75, yaw: -.8 }]);
  instanceAsset(scene, villa, [{ p: new T.Vector3(194, 9, 151), scale: .8, yaw: 1.4 }]);
  const lighthouseTrees = Array.from({ length: 10 }, () => ({ p: new T.Vector3(189 + random() * 27, 8, 147 + random() * 10), scale: .8 + random() * .7 }));
  const lighthouseSurfaces = [...promontoryGround, ...westPromontoryGround];
  lighthouseSurfaces.forEach(surface => surface.updateMatrixWorld(true));
  instanceAsset(scene, cypress, lighthouseTrees.filter(placement => groundPlant(placement.p, lighthouseSurfaces)), true, 'vegetation/lighthouse-cypress');
  for (const [x, z, rx, rz] of [[205, 154, 20, 10], [-112, 182, 16, 8]]) {
    for (let i = 0; i < 26; i++) {
      const angle = i / 26 * Math.PI * 2, r = .45 + plantRandom() * .5;
      const p = new T.Vector3(x + Math.cos(angle) * rx * r, 0, z + Math.sin(angle) * rz * r);
      // Leave room around the tower and its house, including their access area.
      if ((p.x - x) ** 2 + (p.z - z) ** 2 < 22 || (p.x < x - 6 && Math.abs(p.z - z) < 5)) continue;
      addPlant(shrubs, p, .85 + plantRandom() * .6, 1.15, lighthouseSurfaces, false);
    }
  }
  instanceAsset(scene, shrub, shrubs, true, 'vegetation/coastal-shrub');
  instanceAsset(scene, bougainvillea, flowers, true, 'vegetation/bougainvillea');
  instanceAsset(scene, floweringVine, vines, true, 'vegetation/flowering-vine');
  instanceAsset(scene, grass, grasses, false, 'vegetation/coastal-grass');
  instanceAsset(scene, olive, olives, true, 'vegetation/olive-tree');
  const boats: T.Group[] = [];
  for (const [x, z, scale] of [[74, 176, 1.4], [133, 214, 1.8], [-30, 204, 1.5], [280, 78, 2], [16, 275, 1.8], [273, 210, 1.5]]) {
    const b = sailboat.clone(true); b.position.set(x, -1.05, z); b.scale.setScalar(scale); b.rotation.y = -.3 + random() * 1.7; scene.add(b); boats.push(b);
  }
  // Layered distant islands retain a clean, atmospheric horizon.
  const mountains: Placement[] = [];
  for (let i = 0; i < 16; i++) {
    const a = i / 16 * Math.PI * 2;
    mountains.push({ p: new T.Vector3(Math.cos(a) * (970 + random() * 180), -40, Math.sin(a) * (1050 + random() * 180)), scale: new T.Vector3(46 + random() * 22, 16 + random() * 9, 27), yaw: -a, tint: new T.Color(0x8893b6) });
  }
  instanceAsset(scene, cliff, mountains, false);
  return { player, water, sky: skyMaterial, sun, boats, dispose: () => { env.dispose(); } };
}
