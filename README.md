# Impetuous Saguinus

An original Mediterranean arcade driving game built with Angular 21 and Three.js. The first playable contains a cotton-top Saguinus in a pearl electric roadster, an approximately 840 m coastal circuit, three-lap AI races, time trials, and free driving.

## Play

The production build deploys to GitHub Pages from `main` via GitHub Actions:

https://erikbaksay.github.io/impetuous-saguinus/

## Play locally

```sh
npm install
npm start
```

Open http://localhost:4200. A desktop browser with WebGL 2 and hardware acceleration is required. Rendering uses a full-resolution floating-point postprocessing pipeline, 4× MSAA, 4096 px dynamic shadows, procedural sky and ocean, physical materials, and bloom. Mobile touch controls are not implemented.

- **W / ↑** accelerate; **S / ↓** brake, then reverse.
- **A D / ← →** steer.
- **Space + steering** drift at speed; release Space after blue sparks for a boost. Hold to gold for a longer boost.
- **R** recover to the nearest section of road. **C** switch chase cameras.
- **Esc / P** pause. **M** toggle audio.
- Standard gamepad: **RT** accelerate, **LT** brake, **left stick** steer, **A** drift, **Y** recover, **Start** pause.

AI races and time trials require ordered quarter-course checkpoints and three forward laps. AI drivers overtake and can make contact while racing; the race includes five rivals and the player. Your best lap is stored locally in this browser for time trials only. Recovering preserves race time and checkpoint requirements. Tab changes and window focus loss pause the game. Free driving has no finish condition. There is no multiplayer.

## Source

- `src/game/track.ts`: track sampling, driving physics, ordered lap validation.
- `src/game/world.ts`: Blender asset loading, scene placement, track/terrain geometry, sky and water shaders.
- `src/game/game.ts`: renderer, input, race state, chase cameras, HUD, effects.
- `src/game/audio.ts`: synthesized drivetrain, wind and surf.
- `src/app.component.*` and `src/styles.css`: Angular interface.
- `blender/build_assets.py`: reproducible Blender asset authoring script.
- `blender/roadster.py`: reference-based pearl roadster, with a sculpted shell, recessed cockpit, five-spoke wheels and LED lights.
- `blender/preview_roadster.py`: studio render of the car without the game driver, saved to `blender/previews/roadster.png`.
- `blender/impetuous-saguinus.blend`: editable source asset atelier.
- `blender/vegetation.py` and `blender/vegetation.blend`: editable Mediterranean nursery, with pinnate palms, cypresses, coastal shrubs, bougainvillea, climbing vines, grasses and olive trees.
- `public/models/`: fourteen original Blender GLB assets, including the driver and roadster. Vegetation uses opaque vertex colours and shared instanced meshes.

The script creates its own named scene and preserves unrelated Blender scenes. Change `ROOT` if moving this project. To regenerate via the Blender MCP, execute:

```python
exec(compile(open('/absolute/project/path/blender/build_assets.py').read(), 'build_assets.py', 'exec'))
```

To rebuild only the car in the open project atelier, preserving the driver and scenery:

```python
import runpy
root = '/absolute/project/path'
runpy.run_path(root + '/blender/roadster.py')['update_atelier'](root)
```

The game loads `public/models/saguinus-roadster.glb`. Its four `Wheel_FL/FR/RL/RR` nodes steer; their `WheelSpin_FL/FR/RL/RR` children roll independently at a 0.53 m tire radius. Blender uses Z up and −Y forward; GLB export converts this to the game's Y up and +Z forward. The editable `Roadster • Studio` scene is excluded from the game export.

To rebuild only the planting kit through the Blender MCP:

```python
import runpy
runpy.run_path('/absolute/project/path/blender/vegetation.py')['build']()
```

The nursery saves to `blender/vegetation.blend`; the full asset build also runs it. Roadside planting is seeded and grounded against the terrain. Shrubs and flowers frame the road, vines follow villa transforms, and mixed groves fill the inland terraces. Plant meshes are batched by material with no per-frame vegetation work.

## Verification

```sh
npm test
npm run build
```

Production files are written to `dist/impetuous-saguinus/browser`. Serve that directory with any static HTTP server. Models and fonts are self-hosted; the game has no backend or external asset requests.

## Current scope

This is a first playable art and handling foundation. It includes AI opponents in race mode, with no items, multiplayer, damage simulation, or character rigging. Character and scenery models are procedurally authored Blender assets; further sculpting, texture painting, animation, and track art can be developed in the included `.blend` file.

Fonts: DM Sans and Italiana from the official Google Fonts repository, under the SIL Open Font License. License texts are included in `public/fonts`. All model geometry is original to this project; no Nintendo assets are included.
